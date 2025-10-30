<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { CheckIn, MyActiveCheckIn } from '$lib/types';

	export let data: PageData;

	let activeCheckIns: MyActiveCheckIn[] = [];
	let friendsCheckIns: any[] = [];
	let recentActivity: any[] = [];
	let loading = true;

	onMount(async () => {
		await Promise.all([loadActiveCheckIns(), loadFriendsCheckIns(), loadRecentActivity()]);
		loading = false;
	});

	async function loadActiveCheckIns() {
		const { data: checkIns } = await data.supabase.from('my_active_checkins').select('*');

		console.log('My Active Check-Ins:', checkIns);
		activeCheckIns = checkIns || [];
	}

	async function loadFriendsCheckIns() {
		console.log('=== LOADING FRIENDS CHECK-INS ===');

		// Get all active check-ins from group members
		// This query respects RLS and visibility settings
		const { data: checkIns, error } = await data.supabase
			.from('check_ins')
			.select(
				`
				id,
				user_id,
				place_id,
				group_id,
				checked_in_at,
				activity_id,
				places(
					id,
					name,
					place_type,
					latitude,
					longitude
				),
				profiles(
					id,
					username,
					display_name
				),
				groups(
					id,
					name
				),
				activities(
					id,
					name,
					icon
				)
			`
			)
			.is('checked_out_at', null)
			.neq('user_id', data.session?.user.id); // Exclude my own check-ins

		if (error) {
			console.error('Error loading friends check-ins:', error);
			friendsCheckIns = [];
			return;
		}

		console.log('Raw friends check-ins:', checkIns);

		// Group by place to show multiple people at same location
		const placeGroups = new Map();

		checkIns?.forEach((checkIn) => {
			if (!checkIn.places) return;

			const placeId = checkIn.place_id;
			if (!placeGroups.has(placeId)) {
				placeGroups.set(placeId, {
					place: checkIn.places,
					checkIns: []
				});
			}
			placeGroups.get(placeId).checkIns.push(checkIn);
		});

		// Convert to array and sort by number of people (most popular first)
		friendsCheckIns = Array.from(placeGroups.values()).sort(
			(a, b) => b.checkIns.length - a.checkIns.length
		);

		console.log('Grouped friends check-ins:', friendsCheckIns);
	}

	async function loadRecentActivity() {
		const { data: checkIns } = await data.supabase
			.from('check_ins')
			.select(
				`
				*,
				place:places(name, latitude, longitude),
				activity:activities(name, icon),
				profile:profiles(username, display_name)
			`
			)
			.eq('user_id', data.session?.user.id)
			.not('checked_out_at', 'is', null)
			.order('checked_in_at', { ascending: false })
			.limit(10);

		recentActivity = checkIns || [];
	}

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		const now = new Date();
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === now.toDateString()) {
			return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		} else if (date.toDateString() === yesterday.toDateString()) {
			return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		} else {
			return date.toLocaleDateString([], {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		}
	}

	function formatDuration(checkedIn: string, checkedOut: string) {
		const start = new Date(checkedIn);
		const end = new Date(checkedOut);
		const diff = end.getTime() - start.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;

		if (hours > 0) {
			return `${hours}h ${mins}m`;
		}
		return `${mins}m`;
	}

	function formatTimeAgo(dateString: string) {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	function getPlaceIcon(placeType: string): string {
		const icons: Record<string, string> = {
			skatepark: '🛹',
			gym: '🏋️',
			climbing: '🧗',
			cafe: '☕',
			coworking: '💻',
			park: '🌳',
			sports: '⚽'
		};
		return icons[placeType] || '📍';
	}

	function goToPlace(placeId: string) {
		goto(`/places/${placeId}`);
	}
</script>

<svelte:head>
	<title>Home - Location Share</title>
</svelte:head>

<div class="home-page">
	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
		</div>
	{:else}
		<!-- My Active Check-ins -->
		{#if activeCheckIns.length > 0}
			<section class="active-section">
				<h2 class="section-title">Currently at</h2>
				{#each activeCheckIns as checkIn}
					<div class="activity-card active">
						<div class="card-header">
							<div class="location-badge">
								📍 {checkIn.place_name}
							</div>
							<span class="live-badge">LIVE</span>
						</div>
						{#if checkIn.activity_name}
							<p class="activity-type">{checkIn.activity_name}</p>
						{/if}
						<div class="card-meta">
							<span class="time-badge">
								Since {new Date(checkIn.checked_in_at).toLocaleTimeString([], {
									hour: '2-digit',
									minute: '2-digit'
								})}
							</span>
							{#if checkIn.group_name}
								<span class="group-badge">• {checkIn.group_name}</span>
							{/if}
						</div>
					</div>
				{/each}
			</section>
		{/if}

		<!-- Friends at Locations -->
		{#if friendsCheckIns.length > 0}
			<section class="friends-section">
				<h2 class="section-title">Friends at locations</h2>

				{#each friendsCheckIns as placeGroup}
					<div
						class="place-card"
						role="button"
						tabindex="0"
						on:click={() => goToPlace(placeGroup.place.id)}
						on:keydown={(e) => e.key === 'Enter' && goToPlace(placeGroup.place.id)}
					>
						<div class="place-header">
							<div class="place-icon-badge">
								{getPlaceIcon(placeGroup.place.place_type)}
							</div>
							<div class="place-info">
								<div class="place-name">{placeGroup.place.name}</div>
								<div class="people-count">
									{placeGroup.checkIns.length}
									{placeGroup.checkIns.length === 1 ? 'person' : 'people'} here
								</div>
							</div>
							<div class="live-indicator">
								<span class="pulse-dot"></span>
							</div>
						</div>

						<div class="people-list">
							{#each placeGroup.checkIns as checkIn}
								<div class="person-item">
									<div class="person-avatar">
										{checkIn.profiles?.display_name?.charAt(0)?.toUpperCase() ||
											checkIn.profiles?.username?.charAt(0)?.toUpperCase() ||
											'?'}
									</div>
									<div class="person-details">
										<span class="person-name">
											{checkIn.profiles?.display_name || checkIn.profiles?.username}
										</span>
										<span class="person-time">
											{formatTimeAgo(checkIn.checked_in_at)}
										</span>
									</div>
									{#if checkIn.activities}
										<span class="activity-badge">
											{checkIn.activities.icon || '🎯'}
											{checkIn.activities.name}
										</span>
									{/if}
									{#if checkIn.groups}
										<span class="group-tag">
											{checkIn.groups.name}
										</span>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</section>
		{/if}

		<!-- Recent Activity Feed -->
		<section class="activity-section">
			<h2 class="section-title">Recent activity</h2>

			{#if recentActivity.length === 0}
				<div class="empty-state">
					<span class="empty-icon">🎯</span>
					<h3>No recent activity</h3>
					<p>Start checking in to places to see your activity here</p>
				</div>
			{:else}
				{#each recentActivity as activity}
					<div class="activity-card">
						<div class="card-header">
							<div class="user-info">
								<div class="user-avatar">
									{activity.profile?.display_name?.charAt(0)?.toUpperCase() ||
										activity.profile?.username?.charAt(0)?.toUpperCase() ||
										'?'}
								</div>
								<div class="user-details">
									<span class="user-name">
										{activity.profile?.display_name || activity.profile?.username}
									</span>
									<span class="activity-time">
										{formatDate(activity.checked_in_at)}
									</span>
								</div>
							</div>
						</div>

						<div class="activity-title">
							📍 {activity.place?.name || 'Unknown Place'}
						</div>

						<div class="activity-stats">
							{#if activity.activity?.name}
								<div class="stat">
									<span class="stat-label">Activity</span>
									<span class="stat-value">
										{activity.activity.icon || ''}
										{activity.activity.name}
									</span>
								</div>
							{/if}
							{#if activity.checked_out_at}
								<div class="stat">
									<span class="stat-label">Duration</span>
									<span class="stat-value">
										{formatDuration(activity.checked_in_at, activity.checked_out_at)}
									</span>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</section>
	{/if}
</div>

<style>
	.home-page {
		min-height: 100%;
		background: #000;
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

	/* Sections */
	.active-section,
	.friends-section,
	.activity-section {
		padding: 20px 16px;
	}

	.section-title {
		font-size: 18px;
		font-weight: 700;
		margin: 0 0 16px 0;
		color: #fff;
	}

	/* Activity Cards */
	.activity-card {
		background: #0a0a0a;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 16px;
		border: 1px solid #1a1a1a;
	}

	.activity-card.active {
		border-color: var(--color-primary);
		background: linear-gradient(135deg, rgba(252, 76, 2, 0.1) 0%, rgba(255, 107, 53, 0.05) 100%);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.user-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: #fff;
	}

	.user-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.user-name {
		font-size: 14px;
		font-weight: 600;
		color: #fff;
	}

	.activity-time {
		font-size: 12px;
		color: #666;
	}

	.location-badge {
		font-size: 14px;
		font-weight: 600;
		color: #fff;
	}

	.live-badge {
		background: var(--color-primary);
		color: #fff;
		padding: 4px 10px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 700;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.activity-type {
		font-size: 14px;
		color: #999;
		margin: 8px 0;
	}

	.card-meta {
		display: flex;
		gap: 8px;
		font-size: 12px;
		color: #666;
		flex-wrap: wrap;
	}

	.time-badge,
	.group-badge {
		font-weight: 600;
	}

	/* Place Cards */
	.place-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 12px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.place-card:hover {
		border-color: var(--color-primary);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(252, 76, 2, 0.15);
	}

	.place-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.place-icon-badge {
		width: 48px;
		height: 48px;
		background: #1a1a1a;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
		flex-shrink: 0;
	}

	.place-info {
		flex: 1;
		min-width: 0;
	}

	.place-name {
		font-size: 16px;
		font-weight: 700;
		color: #fff;
		margin-bottom: 4px;
	}

	.people-count {
		font-size: 13px;
		color: var(--color-primary);
		font-weight: 600;
	}

	.live-indicator {
		flex-shrink: 0;
	}

	.pulse-dot {
		display: block;
		width: 12px;
		height: 12px;
		background: var(--color-primary);
		border-radius: 50%;
		animation: pulse-ring 2s infinite;
		position: relative;
	}

	.pulse-dot::before {
		content: '';
		position: absolute;
		width: 100%;
		height: 100%;
		background: var(--color-primary);
		border-radius: 50%;
		animation: pulse-ring 2s infinite;
	}

	@keyframes pulse-ring {
		0% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.5);
			opacity: 0.5;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.people-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.person-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: #000;
		border-radius: 8px;
	}

	.person-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: #fff;
		font-size: 14px;
		flex-shrink: 0;
	}

	.person-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.person-name {
		font-size: 14px;
		font-weight: 600;
		color: #fff;
	}

	.person-time {
		font-size: 12px;
		color: #666;
	}

	.activity-badge {
		font-size: 11px;
		padding: 4px 8px;
		background: rgba(252, 76, 2, 0.1);
		color: var(--color-primary);
		border-radius: 6px;
		font-weight: 600;
		white-space: nowrap;
	}

	.group-tag {
		font-size: 11px;
		padding: 4px 8px;
		background: #1a1a1a;
		color: #999;
		border-radius: 6px;
		font-weight: 600;
		white-space: nowrap;
	}

	/* Activity Stats */
	.activity-title {
		font-size: 18px;
		font-weight: 700;
		color: #fff;
		margin-bottom: 12px;
	}

	.activity-stats {
		display: flex;
		gap: 24px;
		margin-bottom: 16px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-label {
		font-size: 12px;
		color: #666;
		text-transform: uppercase;
		font-weight: 600;
	}

	.stat-value {
		font-size: 16px;
		color: #fff;
		font-weight: 600;
	}

	/* Empty State */
	.empty-state {
		text-align: center;
		padding: 60px 20px;
	}

	.empty-icon {
		font-size: 64px;
		display: block;
		margin-bottom: 16px;
	}

	.empty-state h3 {
		font-size: 18px;
		font-weight: 700;
		color: #fff;
		margin: 0 0 8px 0;
	}

	.empty-state p {
		font-size: 14px;
		color: #666;
		margin: 0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.person-item {
			flex-wrap: wrap;
		}

		.activity-badge,
		.group-tag {
			order: 3;
		}
	}
</style>
