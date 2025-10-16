<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	export let data: PageData;

	let group: any = null;
	let place: any = null;
	let members: any[] = [];
	let myMembership: any = null;
	let myVisibilitySettings: any[] = [];
	let loading = true;
	let saving = false;

	const groupId = $page.params.id;

	// Visibility state: who can see me
	let visibilityMap = new Map<string, boolean>();

	// My settings: am I sharing with this group?
	let isSharingLocation = true;
	let receiveNotifications = true;

	onMount(async () => {
		await loadGroup();
		await loadMembers();
		await loadMySettings();
		await loadVisibilitySettings();
		loading = false;
	});

	async function loadGroup() {
		const { data: groupData, error } = await data.supabase
			.from('groups')
			.select(
				`
				*,
				place:places(*)
			`
			)
			.eq('id', groupId)
			.single();

		if (error || !groupData) {
			alert('Group not found');
			goto('/places');
			return;
		}

		group = groupData;
		place = groupData.place;
	}

	async function loadMembers() {
		const { data: membersData, error } = await data.supabase
			.from('group_members')
			.select(
				`
				*,
				profile:profiles(
					id,
					username,
					display_name
				)
			`
			)
			.eq('group_id', groupId)
			.order('joined_at', { ascending: true });

		if (error) {
			console.error('Error loading members:', error);
			return;
		}

		members = membersData || [];

		// Find my membership
		myMembership = members.find((m) => m.user_id === data.session?.user.id);
	}

	async function loadMySettings() {
		if (!myMembership) return;

		isSharingLocation = myMembership.share_location;
		receiveNotifications = myMembership.receive_notifications;
	}

	async function loadVisibilitySettings() {
		// Load who I'm allowing to see me
		const { data: visibilityData, error } = await data.supabase
			.from('group_visibility')
			.select('visible_to_user_id')
			.eq('group_id', groupId)
			.eq('user_id', data.session!.user.id);

		if (error) {
			console.error('Error loading visibility:', error);
			return;
		}

		myVisibilitySettings = visibilityData || [];

		// If no visibility settings exist, default to everyone can see me
		if (myVisibilitySettings.length === 0) {
			// Everyone can see me by default
			members.forEach((m) => {
				if (m.user_id !== data.session?.user.id) {
					visibilityMap.set(m.user_id, true);
				}
			});
		} else {
			// Only specific people can see me
			const allowedUserIds = new Set(myVisibilitySettings.map((v) => v.visible_to_user_id));
			members.forEach((m) => {
				if (m.user_id !== data.session?.user.id) {
					visibilityMap.set(m.user_id, allowedUserIds.has(m.user_id));
				}
			});
		}
	}

	function toggleVisibility(userId: string) {
		const current = visibilityMap.get(userId) || false;
		visibilityMap.set(userId, !current);
		visibilityMap = visibilityMap; // Trigger reactivity
	}

	async function saveSettings() {
		saving = true;

		try {
			// Update my member settings
			const { error: memberError } = await data.supabase
				.from('group_members')
				.update({
					share_location: isSharingLocation,
					receive_notifications: receiveNotifications
				})
				.eq('group_id', groupId)
				.eq('user_id', data.session!.user.id);

			if (memberError) throw memberError;

			// Clear existing visibility settings
			await data.supabase
				.from('group_visibility')
				.delete()
				.eq('group_id', groupId)
				.eq('user_id', data.session!.user.id);

			// Get users who can see me
			const allowedUsers: string[] = [];
			visibilityMap.forEach((canSee, userId) => {
				if (canSee) {
					allowedUsers.push(userId);
				}
			});

			// If everyone is checked, don't add any visibility restrictions
			const allMembersExceptMe = members.filter((m) => m.user_id !== data.session?.user.id);

			if (allowedUsers.length > 0 && allowedUsers.length < allMembersExceptMe.length) {
				// Only some people can see me - add restrictions
				const visibilityRecords = allowedUsers.map((userId) => ({
					group_id: groupId,
					user_id: data.session!.user.id,
					visible_to_user_id: userId
				}));

				const { error: visError } = await data.supabase
					.from('group_visibility')
					.insert(visibilityRecords);

				if (visError) throw visError;
			}

			alert('Settings saved successfully!');
			await loadMySettings();
			await loadVisibilitySettings();
		} catch (error: any) {
			alert('Error saving settings: ' + error.message);
		} finally {
			saving = false;
		}
	}

	async function leaveGroup() {
		if (!confirm(`Are you sure you want to leave "${group.name}"?`)) {
			return;
		}

		const { error } = await data.supabase
			.from('group_members')
			.delete()
			.eq('group_id', groupId)
			.eq('user_id', data.session!.user.id);

		if (error) {
			alert('Error leaving group: ' + error.message);
			return;
		}

		goto('/places');
	}

	function isMe(userId: string): boolean {
		return userId === data.session?.user.id;
	}

	function getRoleBadge(role: string) {
		const badges: Record<string, string> = {
			admin: '👑 Admin',
			moderator: '⭐ Mod',
			member: ''
		};
		return badges[role] || '';
	}
</script>

<svelte:head>
	<title>{group?.name || 'Group'} - Location Share</title>
</svelte:head>

<div class="group-page">
	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
		</div>
	{:else if group}
		<!-- Header -->
		<div class="header">
			<button class="back-btn" on:click={() => goto('/places')}> ← Back </button>
		</div>

		<!-- Content -->
		<div class="content">
			<!-- Group Info -->
			<div class="group-header">
				<h1>{group.name}</h1>
				{#if group.is_public}
					<span class="badge public">Public</span>
				{:else}
					<span class="badge private">Private</span>
				{/if}
			</div>

			{#if group.description}
				<div class="description">
					<p>{group.description}</p>
				</div>
			{/if}

			<div class="place-link">
				<span class="place-icon">📍</span>
				<a href="/places/{place.id}" class="place-name">{place.name}</a>
			</div>

			<!-- My Settings Section -->
			<div class="section">
				<h2>My Settings</h2>

				<div class="settings-card">
					<div class="setting-item">
						<div class="setting-info">
							<div class="setting-title">📍 Share My Location</div>
							<div class="setting-description">
								Allow this group to see when I check in at {place.name}
							</div>
						</div>
						<label class="toggle">
							<input type="checkbox" bind:checked={isSharingLocation} />
							<span class="toggle-slider"></span>
						</label>
					</div>

					<div class="setting-item">
						<div class="setting-info">
							<div class="setting-title">🔔 Receive Notifications</div>
							<div class="setting-description">Get notified when others check in</div>
						</div>
						<label class="toggle">
							<input type="checkbox" bind:checked={receiveNotifications} />
							<span class="toggle-slider"></span>
						</label>
					</div>
				</div>
			</div>

			<!-- Visibility Control Section -->
			{#if isSharingLocation}
				<div class="section">
					<h2>Location Visibility</h2>
					<p class="section-subtitle">Control who can see your check-ins in this group</p>

					<div class="visibility-list">
						{#each members as member}
							{#if !isMe(member.user_id)}
								<div class="member-item">
									<div class="member-info">
										<div class="member-avatar">
											{member.profile.display_name?.charAt(0)?.toUpperCase() ||
												member.profile.username?.charAt(0)?.toUpperCase() ||
												'?'}
										</div>
										<div class="member-details">
											<div class="member-name">
												{member.profile.display_name || member.profile.username}
												{#if getRoleBadge(member.role)}
													<span class="role-badge">{getRoleBadge(member.role)}</span>
												{/if}
											</div>
											<div class="member-username">@{member.profile.username}</div>
										</div>
									</div>
									<label class="checkbox-toggle">
										<input
											type="checkbox"
											checked={visibilityMap.get(member.user_id) || false}
											on:change={() => toggleVisibility(member.user_id)}
										/>
										<span class="checkbox-label">
											{visibilityMap.get(member.user_id) ? '👁️ Can see me' : '🚫 Hidden'}
										</span>
									</label>
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{/if}

			<!-- All Members Section -->
			<div class="section">
				<h2>Members ({members.length})</h2>

				<div class="members-list">
					{#each members as member}
						<div class="member-card" class:is-me={isMe(member.user_id)}>
							<div class="member-avatar">
								{member.profile.display_name?.charAt(0)?.toUpperCase() ||
									member.profile.username?.charAt(0)?.toUpperCase() ||
									'?'}
							</div>
							<div class="member-details">
								<div class="member-name">
									{member.profile.display_name || member.profile.username}
									{#if isMe(member.user_id)}
										<span class="me-badge">You</span>
									{/if}
									{#if getRoleBadge(member.role)}
										<span class="role-badge">{getRoleBadge(member.role)}</span>
									{/if}
								</div>
								<div class="member-meta">
									<span class="member-username">@{member.profile.username}</span>
									<span class="joined-date">
										Joined {new Date(member.joined_at).toLocaleDateString()}
									</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Actions -->
			<div class="actions">
				<button class="save-btn" on:click={saveSettings} disabled={saving}>
					{saving ? 'Saving...' : '💾 Save Settings'}
				</button>

				<button class="leave-btn" on:click={leaveGroup}> 🚪 Leave Group </button>
			</div>
		</div>
	{/if}
</div>

<style>
	.group-page {
		min-height: 100vh;
		background: #000;
		color: #fff;
		padding-bottom: 80px;
	}

	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 400px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #333;
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Header */
	.header {
		padding: 16px;
		border-bottom: 1px solid #1a1a1a;
		position: sticky;
		background: #000;
		z-index: 10;
	}

	.back-btn {
		background: transparent;
		border: none;
		color: var(--color-primary);
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		padding: 8px 12px;
	}

	/* Content */
	.content {
		padding: 20px;
		max-width: 800px;
		margin: 0 auto;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}

	.group-header h1 {
		font-size: 28px;
		margin: 0;
		font-weight: 700;
	}

	.badge {
		padding: 4px 12px;
		border-radius: 12px;
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.badge.public {
		background: rgba(76, 175, 80, 0.2);
		color: #4caf50;
	}

	.badge.private {
		background: rgba(158, 158, 158, 0.2);
		color: #999;
	}

	.description {
		background: #0a0a0a;
		padding: 16px;
		border-radius: 12px;
		margin-bottom: 20px;
	}

	.description p {
		margin: 0;
		line-height: 1.6;
		color: #ccc;
	}

	.place-link {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: #0a0a0a;
		border-radius: 8px;
		margin-bottom: 32px;
		border: 1px solid #1a1a1a;
	}

	.place-icon {
		font-size: 20px;
	}

	.place-name {
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 600;
	}

	.place-name:hover {
		text-decoration: underline;
	}

	/* Sections */
	.section {
		margin-bottom: 32px;
	}

	.section h2 {
		font-size: 20px;
		margin: 0 0 8px 0;
		font-weight: 700;
	}

	.section-subtitle {
		color: #666;
		font-size: 14px;
		margin: 0 0 16px 0;
	}

	/* Settings Card */
	.settings-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		overflow: hidden;
	}

	.setting-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px;
		border-bottom: 1px solid #1a1a1a;
	}

	.setting-item:last-child {
		border-bottom: none;
	}

	.setting-info {
		flex: 1;
	}

	.setting-title {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.setting-description {
		font-size: 13px;
		color: #666;
	}

	/* Toggle Switch */
	.toggle {
		position: relative;
		display: inline-block;
		width: 50px;
		height: 28px;
	}

	.toggle input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: #333;
		transition: 0.3s;
		border-radius: 28px;
	}

	.toggle-slider:before {
		position: absolute;
		content: '';
		height: 20px;
		width: 20px;
		left: 4px;
		bottom: 4px;
		background-color: white;
		transition: 0.3s;
		border-radius: 50%;
	}

	.toggle input:checked + .toggle-slider {
		background-color: #4caf50;
	}

	.toggle input:checked + .toggle-slider:before {
		transform: translateX(22px);
	}

	/* Visibility List */
	.visibility-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.member-item {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.member-info {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
	}

	.member-avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 18px;
		color: #fff;
		flex-shrink: 0;
	}

	.member-details {
		flex: 1;
		min-width: 0;
	}

	.member-name {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 4px;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.member-username {
		font-size: 13px;
		color: #666;
	}

	.role-badge {
		font-size: 12px;
		padding: 2px 8px;
		border-radius: 6px;
		background: rgba(252, 76, 2, 0.2);
		color: var(--color-primary);
	}

	.me-badge {
		font-size: 12px;
		padding: 2px 8px;
		border-radius: 6px;
		background: rgba(76, 175, 80, 0.2);
		color: #4caf50;
	}

	/* Checkbox Toggle */
	.checkbox-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		user-select: none;
	}

	.checkbox-toggle input[type='checkbox'] {
		width: 20px;
		height: 20px;
		cursor: pointer;
	}

	.checkbox-label {
		font-size: 14px;
		font-weight: 600;
	}

	/* Members List */
	.members-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.member-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.member-card.is-me {
		border-color: #4caf50;
		background: rgba(76, 175, 80, 0.05);
	}

	.member-meta {
		display: flex;
		gap: 12px;
		margin-top: 4px;
		font-size: 12px;
		color: #666;
	}

	.joined-date {
		color: #666;
	}

	/* Actions */
	.actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 32px;
		padding-top: 32px;
		border-top: 1px solid #1a1a1a;
	}

	.save-btn,
	.leave-btn {
		width: 100%;
		padding: 16px 24px;
		border-radius: 12px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
	}

	.save-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.save-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.leave-btn {
		background: transparent;
		border: 2px solid #f44336;
		color: #f44336;
	}

	.leave-btn:hover {
		background: rgba(244, 67, 54, 0.1);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.group-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
