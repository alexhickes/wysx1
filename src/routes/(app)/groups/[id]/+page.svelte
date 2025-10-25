<!-- src/route/(app)/groups/[id]/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	import {
		getGroupPlaces,
		addPlaceToGroup,
		removePlaceFromGroup,
		setPrimaryPlace
	} from '$lib/groups';
	import InviteToGroupModal from '$lib/components/InviteToGroupModal.svelte';
	import AddPlaceToGroupModal from '$lib/components/AddPlaceToGroupModal.svelte';

	export let data: PageData;

	let group: any = null;
	let groupPlaces: any[] = [];
	let members: any[] = [];
	let myMembership: any = null;
	let myVisibilitySettings: any[] = [];
	let loading = true;
	let saving = false;

	const groupId = $page.params.id || '';

	// Visibility state: who can see me
	let visibilityMap = new Map<string, boolean>();

	// My settings: am I sharing with this group?
	let isSharingLocation = true;
	let receiveNotifications = true;

	// Show invite modal
	let showInviteModal = false;
	let showAddPlace = false;

	// Check if user is admin
	$: isAdmin = myMembership?.role === 'admin' || myMembership?.role === 'moderator';

	// Get primary place for display
	$: primaryPlace = groupPlaces.find((p) => p.is_primary);

	// let group: any = null;
	// let place: any = null;
	// let members: any[] = [];
	// let myMembership: any = null;
	// let myVisibilitySettings: any[] = [];
	// let loading = true;
	// let saving = false;

	// const groupId = $page.params.id || '';

	// // Visibility state: who can see me
	// let visibilityMap = new Map<string, boolean>();

	// // My settings: am I sharing with this group?
	// let isSharingLocation = true;
	// let receiveNotifications = true;

	// // Show invite modal
	// let showInviteModal = false;

	// let groupPlaces = [];
	// let showAddPlace = false;

	onMount(async () => {
		await loadGroup();
		await loadGroupPlaces();
		await loadMembers();
		await loadMySettings();
		await loadVisibilitySettings();
		loading = false;
	});

	async function loadGroup() {
		const { data: groupData, error } = await data.supabase
			.from('groups')
			.select('*')
			.eq('id', groupId)
			.single();

		if (error || !groupData) {
			alert('Group not found');
			goto('/places');
			return;
		}

		group = groupData;
	}

	async function loadGroupPlaces() {
		// const { data } = await getGroupPlaces(data.supabase, groupId);
		const { data: groupPlacesData } = await getGroupPlaces(data.supabase, groupId);
		groupPlaces = groupPlacesData || [];
	}

	async function handleAddPlace(placeId: string) {
		const { error } = await addPlaceToGroup(data.supabase, groupId, placeId);
		if (!error) {
			await loadGroupPlaces();
			showAddPlace = false;
		}
	}

	async function handleRemovePlace(placeId: string) {
		if (!confirm('Remove this place from the group?')) return;

		const { error } = await removePlaceFromGroup(data.supabase, groupId, placeId);
		if (!error) {
			await loadGroupPlaces();
		}
	}

	async function handleSetPrimary(placeId: string) {
		const { error } = await setPrimaryPlace(data.supabase, groupId, placeId);
		if (!error) {
			await loadGroupPlaces();
		}
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
		console.log('Loaded members:', members);

		// Find my membership
		myMembership = members.find((m) => m.user_id === data.session?.user.id);
	}

	// async function loadMySettings() {
	// 	if (!myMembership) return;

	// 	isSharingLocation = myMembership.share_location;
	// 	receiveNotifications = myMembership.receive_notifications;
	// }

	async function loadMySettings() {
		if (!myMembership) return;

		// Reload membership to get latest values
		const { data: memberData, error } = await data.supabase
			.from('group_members')
			.select(
				`
        *,
        profiles (
            display_name
        )
    `
			)
			.eq('group_id', groupId)
			.eq('user_id', data.session!.user.id)
			.single();
		console.log('Loaded my membership data:', memberData, error);

		// // Reload membership to get latest values
		// const { data: memberData, error } = await data.supabase
		// 	.from('group_members')
		// 	.select('*')
		// 	.eq('group_id', groupId)
		// 	.eq('user_id', data.session!.user.id)
		// 	.single();

		if (error) {
			console.error('Error loading member settings:', error);
			return;
		}

		if (memberData) {
			isSharingLocation = memberData.share_location;
			receiveNotifications = memberData.receive_notifications;
		}
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
		console.log('Toggled visibility for user:', userId, 'New value:', !current);
	}

	async function saveSettings() {
		saving = true;

		try {
			console.log('=== SAVE SETTINGS DEBUG ===');
			console.log('Group ID:', groupId);
			console.log('User ID:', data.session?.user.id);

			// First, verify the membership exists
			const { data: checkData, error: checkError } = await data.supabase
				.from('group_members')
				.select('*')
				.eq('group_id', groupId)
				.eq('user_id', data.session!.user.id)
				.single();

			console.log('Membership check result:', { checkData, checkError });

			if (checkError || !checkData) {
				throw new Error('You are not a member of this group. Please refresh the page.');
			}

			// 1. Update my member settings
			const { data: updateData, error: memberError } = await data.supabase
				.from('group_members')
				.update({
					share_location: isSharingLocation,
					receive_notifications: receiveNotifications
				})
				.eq('group_id', groupId)
				.eq('user_id', data.session!.user.id)
				.select();

			console.log('Update result:', { updateData, memberError });

			if (memberError) {
				console.error('Member update error:', memberError);
				throw memberError;
			}

			if (!updateData || updateData.length === 0) {
				throw new Error('Update succeeded but no rows were returned. Check RLS policies.');
			}

			console.log('✓ Member settings updated successfully');

			// 2. Handle visibility settings only if sharing location
			if (isSharingLocation) {
				// Clear existing visibility settings
				const { error: deleteError, count: deleteCount } = await data.supabase
					.from('group_visibility')
					.delete({ count: 'exact' })
					.eq('group_id', groupId)
					.eq('user_id', data.session!.user.id);

				if (deleteError && deleteError.code !== 'PGRST116') {
					console.error('Error deleting visibility:', deleteError);
					throw deleteError;
				}
				console.log('✓ Cleared existing visibility settings:', deleteCount || 0, 'rows');

				// Get users who can see me
				const allowedUsers: string[] = [];
				visibilityMap.forEach((canSee, userId) => {
					if (canSee) {
						allowedUsers.push(userId);
					}
				});

				const allMembersExceptMe = members.filter((m) => m.user_id !== data.session?.user.id);

				console.log('Visibility state:', {
					allowedUsers: allowedUsers.length,
					totalMembers: allMembersExceptMe.length,
					allowedUserIds: allowedUsers
				});

				// Only add visibility records if restricting (not everyone)
				if (allowedUsers.length > 0 && allowedUsers.length < allMembersExceptMe.length) {
					const visibilityRecords = allowedUsers.map((userId) => ({
						group_id: groupId,
						user_id: data.session!.user.id,
						visible_to_user_id: userId
					}));

					console.log('Inserting visibility records:', visibilityRecords.length, 'records');

					const { data: insertData, error: visError } = await data.supabase
						.from('group_visibility')
						.insert(visibilityRecords)
						.select();

					if (visError) {
						console.error('Visibility insert error:', visError);
						throw visError;
					}
					console.log('✓ Visibility records inserted:', insertData?.length || 0);
				} else if (allowedUsers.length === 0) {
					console.log('✓ No visibility records (hidden from everyone)');
				} else {
					console.log('✓ No visibility records (visible to everyone - default)');
				}
			} else {
				// If not sharing location, clear all visibility settings
				const { error: deleteError } = await data.supabase
					.from('group_visibility')
					.delete()
					.eq('group_id', groupId)
					.eq('user_id', data.session!.user.id);

				if (deleteError && deleteError.code !== 'PGRST116') {
					console.error('Error deleting visibility:', deleteError);
				}
				console.log('✓ Cleared visibility (not sharing location)');
			}

			// 3. Reload data
			console.log('Reloading data...');
			await loadMembers();
			await loadMySettings();
			await loadVisibilitySettings();
			console.log('=== SAVE COMPLETE ===');

			alert('Settings saved successfully!');
		} catch (error: any) {
			console.error('=== SAVE ERROR ===', error);
			alert('Error saving settings: ' + error.message);
		} finally {
			saving = false;
		}
	}

	// function toggleVisibility(userId: string) {
	// 	const current = visibilityMap.get(userId) || false;
	// 	visibilityMap.set(userId, !current);
	// 	visibilityMap = visibilityMap; // Trigger reactivity
	// }

	// async function saveSettings() {
	// 	saving = true;

	// 	try {
	// 		// 1. Update my member settings
	// 		const { error: memberError } = await data.supabase
	// 			.from('group_members')
	// 			.update({
	// 				share_location: isSharingLocation,
	// 				receive_notifications: receiveNotifications
	// 			})
	// 			.eq('group_id', groupId)
	// 			.eq('user_id', data.session!.user.id);

	// 		if (memberError) throw memberError;

	// 		// 2. Clear existing visibility settings
	// 		const { error: deleteError } = await data.supabase
	// 			.from('group_visibility')
	// 			.delete()
	// 			.eq('group_id', groupId)
	// 			.eq('user_id', data.session!.user.id);

	// 		if (deleteError && deleteError.code !== 'PGRST116') {
	// 			// PGRST116 means no rows found, which is fine
	// 			console.error('Error deleting visibility:', deleteError);
	// 		}

	// 		// 3. Get users who can see me
	// 		const allowedUsers: string[] = [];
	// 		visibilityMap.forEach((canSee, userId) => {
	// 			if (canSee) {
	// 				allowedUsers.push(userId);
	// 			}
	// 		});

	// 		// Count total members (excluding me)
	// 		const allMembersExceptMe = members.filter((m) => m.user_id !== data.session?.user.id);

	// 		// 4. Only add visibility records if we're NOT sharing with everyone
	// 		// If allowedUsers.length === allMembersExceptMe.length, that means everyone can see me (default behavior)
	// 		if (allowedUsers.length > 0 && allowedUsers.length < allMembersExceptMe.length) {
	// 			const visibilityRecords = allowedUsers.map((userId) => ({
	// 				group_id: groupId,
	// 				user_id: data.session!.user.id,
	// 				visible_to_user_id: userId
	// 			}));

	// 			const { error: visError } = await data.supabase
	// 				.from('group_visibility')
	// 				.insert(visibilityRecords);

	// 			if (visError) {
	// 				console.error('Visibility insert error:', visError);
	// 				throw visError;
	// 			}
	// 		}

	// 		// 5. Reload data to reflect changes
	// 		await loadMembers();
	// 		await loadMySettings();
	// 		await loadVisibilitySettings();

	// 		alert('Settings saved successfully!');
	// 	} catch (error: any) {
	// 		console.error('Save error:', error);
	// 		alert('Error saving settings: ' + error.message);
	// 	} finally {
	// 		saving = false;
	// 	}
	// }

	// async function saveSettings() {
	// 	saving = true;

	// 	try {
	// 		// Update my member settings
	// 		const { error: memberError } = await data.supabase
	// 			.from('group_members')
	// 			.update({
	// 				share_location: isSharingLocation,
	// 				receive_notifications: receiveNotifications
	// 			})
	// 			.eq('group_id', groupId)
	// 			.eq('user_id', data.session!.user.id);

	// 		if (memberError) throw memberError;

	// 		// Clear existing visibility settings
	// 		const { error: deleteError } = await data.supabase
	// 			.from('group_visibility')
	// 			.delete()
	// 			.eq('group_id', groupId)
	// 			.eq('user_id', data.session!.user.id);

	// 		if (deleteError) {
	// 			console.error('Error deleting visibility:', deleteError);
	// 		}

	// 		// Get users who can see me
	// 		const allowedUsers: string[] = [];
	// 		visibilityMap.forEach((canSee, userId) => {
	// 			if (canSee) {
	// 				allowedUsers.push(userId);
	// 			}
	// 		});

	// 		// Count total members (excluding me)
	// 		const allMembersExceptMe = members.filter((m) => m.user_id !== data.session?.user.id);

	// 		// Only add visibility records if we're restricting to specific people
	// 		if (allowedUsers.length > 0 && allowedUsers.length < allMembersExceptMe.length) {
	// 			const visibilityRecords = allowedUsers.map((userId) => ({
	// 				group_id: groupId,
	// 				user_id: data.session!.user.id,
	// 				visible_to_user_id: userId
	// 			}));

	// 			const { error: visError } = await data.supabase
	// 				.from('group_visibility')
	// 				.insert(visibilityRecords);

	// 			if (visError) {
	// 				console.error('Visibility insert error:', visError);
	// 				throw visError;
	// 			}
	// 		}

	// 		alert('Settings saved successfully!');
	// 		await loadMySettings();
	// 		await loadVisibilitySettings();
	// 	} catch (error: any) {
	// 		console.error('Save error:', error);
	// 		alert('Error saving settings: ' + error.message);
	// 	} finally {
	// 		saving = false;
	// 	}
	// }

	async function leaveGroup() {
		if (!confirm(`Are you sure you want to leave "${group?.name}"?`)) {
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

	export async function getActiveCheckInsForGroup(
		supabase: any,
		groupId: string,
		currentUserId: string
	) {
		console.log('=== FETCHING CHECK-INS ===');
		console.log('Group ID:', groupId);
		console.log('Current User ID:', currentUserId);

		// First, get all members in the group who are sharing location
		const { data: sharingMembers, error: membersError } = await supabase
			.from('group_members')
			.select('user_id, share_location')
			.eq('group_id', groupId)
			.eq('share_location', true);

		if (membersError) {
			console.error('Error fetching sharing members:', membersError);
			return { data: null, error: membersError };
		}

		console.log('Members sharing location:', sharingMembers);

		if (!sharingMembers || sharingMembers.length === 0) {
			console.log('No members sharing location in this group');
			return { data: [], error: null };
		}

		// Get visibility settings for the group
		const { data: visibilitySettings, error: visError } = await supabase
			.from('group_visibility')
			.select('user_id, visible_to_user_id')
			.eq('group_id', groupId);

		console.log('Visibility settings:', visibilitySettings);

		// Determine which users current user can see
		const visibleUserIds = new Set<string>();

		sharingMembers.forEach((member: any) => {
			const userId = member.user_id;

			// Always can see own check-ins
			if (userId === currentUserId) {
				visibleUserIds.add(userId);
				return;
			}

			// Check visibility settings
			const userVisibility = visibilitySettings?.filter((v: any) => v.user_id === userId);

			if (!userVisibility || userVisibility.length === 0) {
				// No visibility restrictions = visible to everyone
				visibleUserIds.add(userId);
			} else {
				// Check if current user is in allowed list
				const isVisible = userVisibility.some((v: any) => v.visible_to_user_id === currentUserId);
				if (isVisible) {
					visibleUserIds.add(userId);
				}
			}
		});

		console.log('Users visible to current user:', Array.from(visibleUserIds));

		if (visibleUserIds.size === 0) {
			console.log('No visible users in this group');
			return { data: [], error: null };
		}

		// Get active check-ins for visible users
		const { data: checkIns, error: checkInsError } = await supabase
			.from('check_ins')
			.select(
				`
      *,
      profiles:user_id (
        username,
        display_name
      ),
      places:place_id (
        name,
        latitude,
        longitude
      )
    `
			)
			.eq('group_id', groupId)
			.in('user_id', Array.from(visibleUserIds))
			.is('checked_out_at', null)
			.order('checked_in_at', { ascending: false });

		if (checkInsError) {
			console.error('Error fetching check-ins:', checkInsError);
			return { data: null, error: checkInsError };
		}

		console.log('Active check-ins found:', checkIns?.length || 0);
		console.log('Check-ins:', checkIns);

		return { data: checkIns || [], error: null };
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

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}

	function openInviteModal() {
		showInviteModal = true;
	}

	function closeInviteModal() {
		showInviteModal = false;
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
			<div class="header-actions">
				<!-- Add this invite button -->
				<button class="invite-btn" on:click={openInviteModal}>
					<span class="btn-icon">👥</span>
					Invite
				</button>
			</div>
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

			<!-- <div class="place-link">
				<span class="place-icon">📍</span>
				<a href="/places/{place.id}" class="place-name">{place.name}</a>
			</div> -->

			<!-- Places Section -->
			<div class="section">
				<div class="section-header">
					<h2>Locations ({groupPlaces.length})</h2>
					{#if isAdmin}
						<button class="add-place-btn" on:click={() => (showAddPlace = true)}>
							+ Add Location
						</button>
					{/if}
				</div>

				{#if groupPlaces.length > 0}
					<div class="places-list">
						{#each groupPlaces as place}
							<div class="place-link">
								<span class="place-icon">📍</span>
								<a href="/places/{place.place_id}" class="place-name">{place.place_name}</a>
							</div>
							<!-- <div class="place-card">
								<div class="place-icon-small">
									{getPlaceIcon(place.place_type)}
								</div>
								<div class="place-info">
									<div class="place-name-row">
										<a href="/places/{place.place_id}" class="place-name">{place.place_name}</a>
										{#if place.is_primary}
											<span class="primary-badge">Primary</span>
										{/if}
									</div>
									<div class="place-meta">
										{place.radius}m radius • Added {formatDate(place.added_at)}
									</div>
								</div>
								{#if isAdmin}
									<div class="place-actions">
										{#if !place.is_primary}
											<button
												class="set-primary-btn"
												on:click={() => handleSetPrimary(place.place_id)}
											>
												Set Primary
											</button>
										{/if}
										{#if groupPlaces.length > 1}
											<button class="remove-btn" on:click={() => handleRemovePlace(place.place_id)}>
												✕
											</button>
										{/if}
									</div>
								{/if}
							</div> -->
						{/each}
					</div>
				{/if}
			</div>

			<!-- My Settings Section -->
			<div class="section">
				<h2>My Settings</h2>

				<div class="settings-card">
					<div class="setting-item">
						<div class="setting-info">
							<div class="setting-title">📍 Share My Location</div>
							<div class="setting-description">
								Allow this group to see when I check in at group locations
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
								{#if member.profile != null}
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
						{#if member.profile != null}
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
						{/if}
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

<!-- Add Place Modal -->
<AddPlaceToGroupModal
	bind:isOpen={showAddPlace}
	supabase={data.supabase}
	{groupId}
	existingPlaceIds={groupPlaces.map((p) => p.place_id)}
	onPlaceAdded={handleAddPlace}
	onClose={() => (showAddPlace = false)}
/>

<!-- Invite Modal -->
<InviteToGroupModal
	bind:isOpen={showInviteModal}
	supabase={data.supabase}
	{groupId}
	groupName={group?.name || ''}
	onClose={closeInviteModal}
/>

<!-- My Settings Section
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

			<!-- Visibility Control Section 
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

			<!-- All Members Section 
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
			</div> -->

<!-- Places Section
			<div class="section">
				<div class="section-header">
					<h2>Locations ({groupPlaces.length})</h2>
					{#if isAdmin}
						<button class="add-place-btn" on:click={() => (showAddPlace = true)}>
							+ Add Location
						</button>
					{/if}
				</div>

				<div class="places-list">
					{#each groupPlaces as place}
						<div class="place-card">
							<div class="place-icon">
								{getPlaceIcon(place.place_type)}
							</div>
							<div class="place-info">
								<div class="place-name">
									{place.place_name}
									{#if place.is_primary}
										<span class="primary-badge">Primary</span>
									{/if}
								</div>
								<div class="place-meta">
									{place.radius}m radius • Added {formatDate(place.added_at)}
								</div>
							</div>
							{#if isAdmin}
								<div class="place-actions">
									{#if !place.is_primary}
										<button
											class="set-primary-btn"
											on:click={() => handleSetPrimary(place.place_id)}
										>
											Set as Primary
										</button>
									{/if}
									{#if groupPlaces.length > 1}
										<button class="remove-btn" on:click={() => handleRemovePlace(place.place_id)}>
											Remove
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div> -->

<!-- Actions 
			<div class="actions">
				<button class="save-btn" on:click={saveSettings} disabled={saving}>
					{saving ? 'Saving...' : '💾 Save Settings'}
				</button>

				<button class="leave-btn" on:click={leaveGroup}> 🚪 Leave Group </button>
			</div>

			<!-- Invite Modal 
			<InviteToGroupModal
				bind:isOpen={showInviteModal}
				supabase={data.supabase}
				{groupId}
				groupName={group?.name || ''}
				onClose={closeInviteModal}
			></InviteToGroupModal> -->
<!-- </div> -->
<!-- {/if} -->
<!-- </div> -->

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

	.invite-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
		border: none;
		padding: 10px 20px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		transition: all 0.2s;
	}

	.invite-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(252, 76, 2, 0.4);
	}

	.btn-icon {
		font-size: 16px;
	}
	/* Responsive */
	@media (max-width: 768px) {
		.group-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
