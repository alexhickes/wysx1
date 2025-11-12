<!-- src/route/(app)/places/[id]/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import {
		getPlaceWithActivities,
		updatePlace,
		deletePlace,
		setPlaceActivities,
		getActivities
	} from '$lib/places';
	import { getGroupsForPlace, createGroup } from '$lib/groups';
	import type { Activity } from '$lib/types';

	export let data: PageData;

	let place: any = null;
	let groups: any[] = [];
	let allActivities: Activity[] = [];
	let loading = true;
	let editing = false;
	let deleting = false;

	// Edit form
	let editForm = {
		name: '',
		description: '',
		place_type: '',
		radius: 100,
		is_public: true,
		selectedActivities: [] as string[],
		latitude: 0,
		longitude: 0
	};

	// Create Group Modal
	let showCreateGroup = false;
	let createGroupLoading = false;
	let createGroupError = '';

	// Create group form
	let newGroup = {
		name: '',
		description: '',
		is_public: true,
		requires_approval: false,
		auto_checkin_enabled: true,
		notification_enabled: true
	};

	// Map
	let map: any;
	let L: any;
	let placeMarker: any;
	let radiusCircle: any;

	const placeId = $page.params.id ?? '';

	// Add these new variables for planned visits
	let showPlannedVisitForm = false;
	let plannedVisits: any[] = [];
	let loadingPlannedVisits = false;

	let newVisit = {
		date: '',
		time: '',
		selectedGroups: [] as string[],
		notes: ''
	};
	let creatingVisit = false;
	let visitError = '';

	// Get tomorrow's date as minimum
	let minDate = new Date();
	minDate.setDate(minDate.getDate() + 1);
	const minDateString = minDate.toISOString().split('T')[0];

	// Update your onMount to include planned visits
	onMount(async () => {
		await loadPlace();
		await loadGroups();
		await loadActivities();
		await loadPlannedVisits(); // Add this line
		loading = false;

		await new Promise((resolve) => setTimeout(resolve, 100));
		await initMap();
	});

	async function loadPlace() {
		const { data: placeData, error } = await getPlaceWithActivities(data.supabase, placeId);

		if (error || !placeData) {
			alert('Place not found');
			goto('/places');
			return;
		}

		place = placeData;

		// Populate edit form
		editForm = {
			name: place.name,
			description: place.description || '',
			place_type: place.place_type || 'other',
			radius: place.radius,
			is_public: place.is_public,
			selectedActivities: place.place_activities?.map((pa: any) => pa.activity.id) || [],
			latitude: place.latitude,
			longitude: place.longitude
		};
	}

	async function loadGroups() {
		const { data: groupsData } = await getGroupsForPlace(data.supabase, placeId);
		groups = groupsData || [];
	}

	async function loadActivities() {
		const { data: activities } = await getActivities(data.supabase);
		allActivities = activities;
	}

	async function initMap() {
		if (!place || typeof window === 'undefined') return;

		// Check if map container exists in DOM
		const mapContainer = document.getElementById('place-detail-map');
		if (!mapContainer) {
			console.error('Map container not found');
			return;
		}

		const leafletModule = await import('leaflet');
		L = leafletModule.default;

		try {
			map = L.map('place-detail-map').setView([place.latitude, place.longitude], 15);

			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '© OpenStreetMap contributors'
			}).addTo(map);

			// Add place marker
			placeMarker = L.marker([place.latitude, place.longitude], {
				draggable: false, // Will be made draggable in edit mode
				icon: L.divIcon({
					html: '<div style="background: #FC4C02; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
					className: '',
					iconSize: [20, 20],
					iconAnchor: [10, 10]
				})
			}).addTo(map);

			// Add radius circle
			radiusCircle = L.circle([place.latitude, place.longitude], {
				radius: place.radius,
				color: '#FC4C02',
				fillColor: '#FC4C02',
				fillOpacity: 0.1,
				weight: 2
			}).addTo(map);
		} catch (error) {
			console.error('Error initializing map:', error);
		}
	}

	function enableMapEditing() {
		if (!map || !placeMarker) return;

		// Make marker draggable
		placeMarker.dragging.enable();

		// Update marker style to indicate it's editable
		placeMarker.setIcon(
			L.divIcon({
				html: '<div style="background: #FC4C02; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: move;"></div>',
				className: '',
				iconSize: [24, 24],
				iconAnchor: [12, 12]
			})
		);

		// Handle marker drag
		placeMarker.on('dragend', (e: any) => {
			const latlng = e.target.getLatLng();
			editForm.latitude = latlng.lat;
			editForm.longitude = latlng.lng;

			// Update circle position
			if (radiusCircle) {
				radiusCircle.setLatLng([latlng.lat, latlng.lng]);
			}
		});

		// Handle map click to move marker
		map.on('click', (e: any) => {
			const latlng = e.latlng;
			editForm.latitude = latlng.lat;
			editForm.longitude = latlng.lng;

			// Move marker
			placeMarker.setLatLng([latlng.lat, latlng.lng]);

			// Move circle
			if (radiusCircle) {
				radiusCircle.setLatLng([latlng.lat, latlng.lng]);
			}
		});
	}

	function disableMapEditing() {
		if (!map || !placeMarker) return;

		// Make marker non-draggable
		placeMarker.dragging.disable();

		// Reset marker style
		placeMarker.setIcon(
			L.divIcon({
				html: '<div style="background: #FC4C02; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
				className: '',
				iconSize: [20, 20],
				iconAnchor: [10, 10]
			})
		);

		// Remove event listeners
		placeMarker.off('dragend');
		map.off('click');

		// Reset marker to saved location
		placeMarker.setLatLng([place.latitude, place.longitude]);
		if (radiusCircle) {
			radiusCircle.setLatLng([place.latitude, place.longitude]);
		}
	}

	function startEditing() {
		editing = true;
		enableMapEditing();
	}

	function cancelEditing() {
		editing = false;
		disableMapEditing();
		// Reset form to original values
		editForm = {
			name: place.name,
			description: place.description || '',
			place_type: place.place_type || 'other',
			radius: place.radius,
			is_public: place.is_public,
			selectedActivities: place.place_activities?.map((pa: any) => pa.activity.id) || [],
			latitude: place.latitude,
			longitude: place.longitude
		};
	}

	async function saveChanges() {
		if (!editForm.name.trim()) {
			alert('Please enter a place name');
			return;
		}

		// Update place (including coordinates)
		const { error: updateError } = await updatePlace(data.supabase, placeId, {
			name: editForm.name.trim(),
			description: editForm.description.trim() || null,
			place_type: editForm.place_type,
			radius: editForm.radius,
			is_public: editForm.is_public
		});

		if (updateError) {
			alert('Error updating place: ' + updateError);
			return;
		}

		// Update coordinates separately (if they changed)
		if (editForm.latitude !== place.latitude || editForm.longitude !== place.longitude) {
			const { error: coordsError } = await data.supabase
				.from('places')
				.update({
					latitude: editForm.latitude,
					longitude: editForm.longitude
				})
				.eq('id', placeId);

			if (coordsError) {
				alert('Error updating coordinates: ' + coordsError.message);
				return;
			}
		}

		// Update activities
		const { error: activitiesError } = await setPlaceActivities(
			data.supabase,
			placeId,
			editForm.selectedActivities
		);

		if (activitiesError) {
			alert('Error updating activities: ' + activitiesError);
			return;
		}

		editing = false;
		disableMapEditing();
		await loadPlace();

		// Update map to new location and radius
		if (map && placeMarker && radiusCircle) {
			map.setView([editForm.latitude, editForm.longitude], 15);
			placeMarker.setLatLng([editForm.latitude, editForm.longitude]);
			radiusCircle.setLatLng([editForm.latitude, editForm.longitude]);
			radiusCircle.setRadius(editForm.radius);
		}
	}

	async function handleDelete() {
		if (
			!confirm(
				`Are you sure you want to delete "${place.name}"? This will also delete all groups associated with this place.`
			)
		) {
			return;
		}

		deleting = true;

		const { error } = await deletePlace(data.supabase, placeId);

		if (error) {
			alert('Error deleting place: ' + error);
			deleting = false;
			return;
		}

		goto('/places');
	}

	function handleCreateGroup() {
		showCreateGroup = true;
		createGroupError = '';
	}

	function cancelCreateGroup() {
		showCreateGroup = false;
		createGroupError = '';
		// Reset form
		newGroup = {
			name: '',
			description: '',
			is_public: true,
			requires_approval: false,
			auto_checkin_enabled: true,
			notification_enabled: true
		};
	}

	// async function submitCreateGroup() {
	// 	if (!newGroup.name.trim()) {
	// 		createGroupError = 'Please enter a group name';
	// 		return;
	// 	}

	// 	if (!place?.id) {
	// 		createGroupError = 'Invalid place';
	// 		return;
	// 	}

	// 	createGroupLoading = true;
	// 	createGroupError = '';

	// 	try {
	// 		// Create the group
	// 		const { data: groupData, error: groupError } = await createGroup(data.supabase, {
	// 			name: newGroup.name,
	// 			initial_place_id: place.id, // ← New way
	// 			description: newGroup.description,
	// 			is_public: newGroup.is_public,
	// 			requires_approval: newGroup.requires_approval,
	// 			auto_checkin_enabled: newGroup.auto_checkin_enabled,
	// 			notification_enabled: newGroup.notification_enabled
	// 		});
	// 		// OLD Create the group
	// 		// const { data: groupData, error: groupError } = await data.supabase
	// 		// 	.from('groups')
	// 		// 	.insert({
	// 		// 		place_id: place.id,
	// 		// 		name: newGroup.name.trim(),
	// 		// 		description: newGroup.description.trim() || null,
	// 		// 		is_public: newGroup.is_public,
	// 		// 		requires_approval: newGroup.requires_approval,
	// 		// 		auto_checkin_enabled: newGroup.auto_checkin_enabled,
	// 		// 		notification_enabled: newGroup.notification_enabled,
	// 		// 		created_by: data.session!.user.id
	// 		// 	})
	// 		// 	.select()
	// 		// 	.single();

	// 		if (groupError) throw groupError;

	// 		// Add creator as admin member
	// 		const { error: memberError } = await data.supabase.from('group_members').insert({
	// 			group_id: groupData.id,
	// 			user_id: data.session!.user.id,
	// 			role: 'admin',
	// 			share_location: true,
	// 			receive_notifications: true
	// 		});

	// 		if (memberError) throw memberError;

	// 		// Reset form and close
	// 		cancelCreateGroup();

	// 		// Reload groups
	// 		await loadGroups();

	// 		// Navigate to the new group
	// 		goto(`/groups/${groupData.id}`);
	// 	} catch (error: any) {
	// 		createGroupError = error.message || 'Failed to create group';
	// 	} finally {
	// 		createGroupLoading = false;
	// 	}
	// }

	async function submitCreateGroup() {
		if (!newGroup.name.trim()) {
			createGroupError = 'Please enter a group name';
			return;
		}

		if (!place?.id) {
			createGroupError = 'Invalid place';
			return;
		}

		createGroupLoading = true;
		createGroupError = '';

		try {
			// 1. Create the group
			const { data: groupData, error: groupError } = await data.supabase
				.from('groups')
				.insert({
					name: newGroup.name.trim(),
					description: newGroup.description.trim() || null,
					place_id: place.id,
					is_public: newGroup.is_public,
					requires_approval: newGroup.requires_approval,
					auto_checkin_enabled: newGroup.auto_checkin_enabled,
					notification_enabled: newGroup.notification_enabled,
					created_by: data.session!.user.id
				})
				.select()
				.single();

			if (groupError) throw groupError;

			// 2. Add creator as admin member FIRST
			const { error: memberError } = await data.supabase.from('group_members').insert({
				group_id: groupData.id,
				user_id: data.session!.user.id,
				role: 'admin',
				share_location: true,
				receive_notifications: true
			});

			if (memberError) throw memberError;

			// 3. NOW add place to group_places
			const { error: groupPlaceError } = await data.supabase.from('group_places').insert({
				group_id: groupData.id,
				place_id: place.id,
				added_by: data.session!.user.id,
				is_primary: true,
				display_order: 0
			});

			if (groupPlaceError) {
				console.error('Error adding to group_places:', groupPlaceError);
				// Group and membership created, so don't fail completely
			}

			cancelCreateGroup();
			await loadGroups();
			goto(`/groups/${groupData.id}`);
		} catch (error: any) {
			createGroupError = error.message || 'Failed to create group';
		} finally {
			createGroupLoading = false;
		}
	}

	function getGroupMemberCount(group: any): number {
		return group.group_members?.[0]?.count || 0;
	}

	function getTotalMembers(): number {
		return groups.reduce((sum, group) => sum + getGroupMemberCount(group), 0);
	}

	// Add these new functions
	async function loadPlannedVisits() {
		loadingPlannedVisits = true;

		const { data: visits, error } = await data.supabase
			.from('planned_visits')
			.select(
				`
				*,
				profiles:user_id(username, display_name),
				planned_visit_groups(
					groups(id, name)
				)
			`
			)
			.eq('place_id', placeId)
			.is('cancelled_at', null)
			.gte('planned_at', new Date().toISOString())
			.order('planned_at', { ascending: true });

		if (!error && visits) {
			// Filter visits based on group membership
			const filteredVisits = await Promise.all(
				visits.map(async (visit) => {
					// Always show if user created it
					if (visit.user_id === data.session.user.id) {
						return visit;
					}

					// Show to everyone if no groups specified
					if (!visit.planned_visit_groups || visit.planned_visit_groups.length === 0) {
						return visit;
					}

					// Check if user is in any of the visit's groups
					const groupIds = visit.planned_visit_groups.map((pvg: any) => pvg.groups.id);
					const { data: membership } = await data.supabase
						.from('group_members')
						.select('group_id')
						.eq('user_id', data.session.user.id)
						.in('group_id', groupIds)
						.limit(1);

					return membership && membership.length > 0 ? visit : null;
				})
			);

			plannedVisits = filteredVisits.filter((v) => v !== null);
		}

		loadingPlannedVisits = false;
	}

	function openPlannedVisitForm() {
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		newVisit.date = tomorrow.toISOString().split('T')[0];
		newVisit.time = '14:00';
		newVisit.selectedGroups = [];

		showPlannedVisitForm = true;
		visitError = '';
	}

	function toggleGroup(groupId: string) {
		if (newVisit.selectedGroups.includes(groupId)) {
			newVisit.selectedGroups = newVisit.selectedGroups.filter((id) => id !== groupId);
		} else {
			newVisit.selectedGroups = [...newVisit.selectedGroups, groupId];
		}
	}

	function selectAllGroups() {
		newVisit.selectedGroups = groups.map((g) => g.id);
	}

	function deselectAllGroups() {
		newVisit.selectedGroups = [];
	}

	async function createPlannedVisit() {
		if (!newVisit.date || !newVisit.time) {
			visitError = 'Please select date and time';
			return;
		}

		creatingVisit = true;
		visitError = '';

		try {
			const plannedAt = new Date(`${newVisit.date}T${newVisit.time}`);

			if (plannedAt < new Date()) {
				visitError = 'Please select a future date and time';
				creatingVisit = false;
				return;
			}

			// Create the planned visit
			const { data: visit, error } = await data.supabase
				.from('planned_visits')
				.insert({
					user_id: data.session.user.id,
					place_id: placeId,
					planned_at: plannedAt.toISOString(),
					notes: newVisit.notes.trim() || null
				})
				.select()
				.single();

			if (error) throw error;

			// Link selected groups
			if (newVisit.selectedGroups.length > 0) {
				const { error: groupsError } = await data.supabase.from('planned_visit_groups').insert(
					newVisit.selectedGroups.map((groupId) => ({
						planned_visit_id: visit.id,
						group_id: groupId
					}))
				);

				if (groupsError) {
					console.error('Error linking groups:', groupsError);
				}
			}

			// Reset form
			newVisit = {
				date: '',
				time: '',
				selectedGroups: [],
				notes: ''
			};
			showPlannedVisitForm = false;

			// Reload visits
			await loadPlannedVisits();
		} catch (error: any) {
			visitError = error.message || 'Failed to create planned visit';
		} finally {
			creatingVisit = false;
		}
	}

	async function cancelPlannedVisit(visitId: string) {
		const { error } = await data.supabase
			.from('planned_visits')
			.update({ cancelled_at: new Date().toISOString() })
			.eq('id', visitId);

		if (!error) {
			await loadPlannedVisits();
		}
	}

	function formatVisitDate(dateStr: string) {
		const date = new Date(dateStr);
		const now = new Date();
		const tomorrow = new Date(now);
		tomorrow.setDate(tomorrow.getDate() + 1);

		const isToday = date.toDateString() === now.toDateString();
		const isTomorrow = date.toDateString() === tomorrow.toDateString();

		if (isToday) {
			return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
		} else if (isTomorrow) {
			return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
		} else {
			return date.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			});
		}
	}

	function isMyVisit(visit: any) {
		return visit.user_id === data.session?.user.id;
	}

	function getVisitGroups(visit: any): string[] {
		if (!visit.planned_visit_groups || visit.planned_visit_groups.length === 0) {
			return [];
		}
		return visit.planned_visit_groups.map((pvg: any) => pvg.groups.name);
	}
</script>

<svelte:head>
	<title>{place?.name || 'Place'} - Location Share</title>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div class="place-detail-page">
	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
		</div>
	{:else if place}
		<!-- Header -->
		<div class="header">
			<button class="back-btn" on:click={() => goto('/places')}> ← Back </button>
			<div class="header-actions">
				{#if place.created_by === data.session?.user.id}
					{#if !editing}
						<button class="edit-btn" on:click={startEditing}> ✏️ Edit </button>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Map Preview -->
		<div class="map-section">
			<div id="place-detail-map"></div>
		</div>

		<!-- Content -->
		<div class="content">
			{#if editing}
				<!-- Edit Form -->
				<div class="edit-form">
					<h2>Edit Place</h2>

					<div class="edit-notice">
						<strong>📍 Move the marker:</strong> Click anywhere on the map or drag the orange marker
						to update the location.
					</div>

					<div class="form-group">
						<label>Current Location</label>
						<div class="coords-display">
							{editForm.latitude.toFixed(6)}, {editForm.longitude.toFixed(6)}
							{#if editForm.latitude !== place.latitude || editForm.longitude !== place.longitude}
								<span class="changed-badge">Changed</span>
							{/if}
						</div>
					</div>

					<div class="form-group">
						<label for="edit-name">Place Name *</label>
						<input
							id="edit-name"
							type="text"
							bind:value={editForm.name}
							placeholder="e.g., Southbank Skatepark"
						/>
					</div>

					<div class="form-group">
						<label for="edit-description">Description</label>
						<textarea
							id="edit-description"
							bind:value={editForm.description}
							placeholder="Add details about this place..."
							rows="3"
						></textarea>
					</div>

					<div class="form-group">
						<label for="edit-type">Place Type</label>
						<select id="edit-type" bind:value={editForm.place_type}>
							<option value="skatepark">Skatepark</option>
							<option value="gym">Gym</option>
							<option value="climbing">Climbing Gym</option>
							<option value="cafe">Cafe</option>
							<option value="coworking">Coworking Space</option>
							<option value="park">Park</option>
							<option value="sports">Sports Venue</option>
							<option value="other">Other</option>
						</select>
					</div>

					<div class="form-group">
						<label for="edit-radius">
							Radius: {editForm.radius}m
						</label>
						<input
							id="edit-radius"
							type="range"
							min="10"
							max="500"
							step="10"
							bind:value={editForm.radius}
						/>
					</div>

					<div class="form-group">
						<label>
							<input type="checkbox" bind:checked={editForm.is_public} />
							Public place
						</label>
					</div>

					<div class="form-group">
						<label>Activities at this place</label>
						<div class="activities-grid">
							{#each allActivities as activity}
								<label class="activity-checkbox">
									<input
										type="checkbox"
										value={activity.id}
										checked={editForm.selectedActivities.includes(activity.id)}
										on:change={(e) => {
											if (e.currentTarget.checked) {
												editForm.selectedActivities = [...editForm.selectedActivities, activity.id];
											} else {
												editForm.selectedActivities = editForm.selectedActivities.filter(
													(id) => id !== activity.id
												);
											}
										}}
									/>
									<span>{activity.icon || '📍'} {activity.name}</span>
								</label>
							{/each}
						</div>
					</div>

					<div class="form-actions">
						<button class="cancel-btn" on:click={cancelEditing}> Cancel </button>
						<button class="save-btn" on:click={saveChanges}> Save Changes </button>
					</div>

					<div class="danger-zone">
						<h3>Danger Zone</h3>
						<button class="delete-btn" on:click={handleDelete} disabled={deleting}>
							{deleting ? 'Deleting...' : '🗑️ Delete Place'}
						</button>
					</div>
				</div>
			{:else}
				<!-- View Mode -->
				<div class="place-header">
					<div class="place-icon">
						{#if place.place_type === 'skatepark'}🛹
						{:else if place.place_type === 'gym'}🏋️
						{:else if place.place_type === 'climbing'}🧗
						{:else if place.place_type === 'cafe'}☕
						{:else if place.place_type === 'coworking'}💻
						{:else if place.place_type === 'park'}🌳
						{:else if place.place_type === 'sports'}⚽
						{:else}📍
						{/if}
					</div>
					<div class="place-title">
						<h1>{place.name}</h1>
						{#if place.is_public}
							<span class="badge public">Public</span>
						{:else}
							<span class="badge private">Private</span>
						{/if}
					</div>
				</div>

				{#if place.description}
					<div class="description-section">
						<p>{place.description}</p>
					</div>
				{/if}

				<!-- Stats -->
				<div class="stats-grid">
					<div class="stat-card">
						<div class="stat-icon">👥</div>
						<div class="stat-value">{getTotalMembers()}</div>
						<div class="stat-label">Total Members</div>
					</div>
					<div class="stat-card">
						<div class="stat-icon">📦</div>
						<div class="stat-value">{groups.length}</div>
						<div class="stat-label">Groups</div>
					</div>
					<div class="stat-card">
						<div class="stat-icon">📏</div>
						<div class="stat-value">{place.radius}m</div>
						<div class="stat-label">Radius</div>
					</div>
				</div>

				<!-- In your HTML, add this section after the stats-grid and before activities -->
				<!-- Insert this in the "View Mode" section (inside the {:else} block after editing check) -->

				<!-- Planned Visits Section (add after stats-grid) -->
				{#if !editing}
					<div class="section">
						<div class="section-header">
							<h2>📅 Planned Visits</h2>
							<button class="plan-visit-btn" on:click={openPlannedVisitForm}> + Plan Visit </button>
						</div>

						{#if loadingPlannedVisits}
							<div class="loading-small">
								<div class="spinner-small"></div>
							</div>
						{:else if plannedVisits.length === 0}
							<div class="empty-state-small">
								<p>No upcoming visits planned</p>
								<p class="hint">
									Be the first to plan a visit and let others know when you'll be here!
								</p>
							</div>
						{:else}
							<div class="visits-list">
								{#each plannedVisits as visit}
									<div class="visit-card" class:my-visit={isMyVisit(visit)}>
										<div class="visit-header">
											<div class="visit-user">
												<div class="user-avatar">
													{visit.profiles?.display_name?.[0] ||
														visit.profiles?.username?.[0] ||
														'?'}
												</div>
												<div class="user-info">
													<div class="username">
														{visit.profiles?.display_name || visit.profiles?.username}
														{#if isMyVisit(visit)}
															<span class="you-badge">You</span>
														{/if}
													</div>
													{#if getVisitGroups(visit).length > 0}
														<div class="visit-groups">
															{#each getVisitGroups(visit) as groupName}
																<span class="group-pill">{groupName}</span>
															{/each}
														</div>
													{:else}
														<div class="visit-group-public">Visible to all groups</div>
													{/if}
												</div>
											</div>
											{#if isMyVisit(visit)}
												<button
													class="cancel-visit-btn"
													on:click={() => cancelPlannedVisit(visit.id)}
													title="Cancel visit"
												>
													×
												</button>
											{/if}
										</div>

										<div class="visit-time">
											🕐 {formatVisitDate(visit.planned_at)}
										</div>

										{#if visit.notes}
											<div class="visit-notes">
												"{visit.notes}"
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Activities -->
				{#if place.place_activities && place.place_activities.length > 0}
					<div class="section">
						<h2>Activities</h2>
						<div class="activities-list">
							{#each place.place_activities as pa}
								<div class="activity-item">
									<span class="activity-icon">{pa.activity.icon || '📍'}</span>
									<span class="activity-name">{pa.activity.name}</span>
									<span class="activity-category">{pa.activity.category}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Groups -->
				<div class="section">
					<div class="section-header">
						<h2>Groups ({groups.length})</h2>
						<button class="create-group-btn" on:click={handleCreateGroup}> + Create Group </button>
					</div>

					<!-- Create Group Form -->
					{#if showCreateGroup}
						<div class="create-group-form">
							<h3>Create New Group</h3>

							{#if createGroupError}
								<div class="error-message">{createGroupError}</div>
							{/if}

							<div class="form-group">
								<label for="group-name">Group Name *</label>
								<input
									id="group-name"
									type="text"
									placeholder="e.g., Morning Skate Crew"
									bind:value={newGroup.name}
									maxlength="100"
								/>
							</div>

							<div class="form-group">
								<label for="group-description">Description</label>
								<textarea
									id="group-description"
									placeholder="Tell people what this group is about..."
									bind:value={newGroup.description}
									rows="3"
									maxlength="500"
								></textarea>
							</div>

							<div class="form-group">
								<label class="checkbox-label">
									<input type="checkbox" bind:checked={newGroup.is_public} />
									<span class="checkbox-text">
										<strong>Public Group</strong>
										<span class="help-text">Anyone can see and join this group</span>
									</span>
								</label>
							</div>

							{#if !newGroup.is_public}
								<div class="form-group">
									<label class="checkbox-label">
										<input type="checkbox" bind:checked={newGroup.requires_approval} />
										<span class="checkbox-text">
											<strong>Require Approval</strong>
											<span class="help-text">Members need approval before joining</span>
										</span>
									</label>
								</div>
							{/if}

							<div class="form-group">
								<label class="checkbox-label">
									<input type="checkbox" bind:checked={newGroup.auto_checkin_enabled} />
									<span class="checkbox-text">
										<strong>Auto Check-in</strong>
										<span class="help-text">Automatically check in members when they arrive</span>
									</span>
								</label>
							</div>

							<div class="form-group">
								<label class="checkbox-label">
									<input type="checkbox" bind:checked={newGroup.notification_enabled} />
									<span class="checkbox-text">
										<strong>Notifications</strong>
										<span class="help-text">Send notifications when members check in</span>
									</span>
								</label>
							</div>

							<div class="form-actions">
								<button class="cancel-btn" on:click={cancelCreateGroup}> Cancel </button>
								<button
									class="submit-btn"
									on:click={submitCreateGroup}
									disabled={createGroupLoading || !newGroup.name.trim()}
								>
									{#if createGroupLoading}
										<span class="spinner-small"></span>
										Creating...
									{:else}
										Create Group
									{/if}
								</button>
							</div>
						</div>
					{/if}

					{#if groups.length === 0}
						<div class="empty-state">
							<span class="empty-icon">📦</span>
							<p>No groups yet. Create the first one!</p>
						</div>
					{:else}
						<div class="groups-list">
							{#each groups as group}
								<div
									class="group-item"
									role="button"
									tabindex={group.id}
									on:click={() => goto(`/groups/${group.id}`)}
									on:keydown={() => goto(`/groups/${group.id}`)}
								>
									<div class="group-info">
										<h3>{group.name}</h3>
										{#if group.description}
											<p>{group.description}</p>
										{/if}
										<div class="group-meta">
											<span class="member-count">
												{getGroupMemberCount(group)} members
											</span>
											{#if group.is_public}
												<span class="group-badge">Public</span>
											{:else}
												<span class="group-badge private">Private</span>
											{/if}
											{#if group.auto_checkin_enabled}
												<span class="feature-badge">📍 Auto</span>
											{/if}
											{#if group.notification_enabled}
												<span class="feature-badge">🔔 Notify</span>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Location Info -->
				<div class="section">
					<h2>Location</h2>
					<div class="location-info">
						<div class="info-row">
							<span class="info-label">Coordinates</span>
							<span class="info-value">
								{place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
							</span>
						</div>
						{#if place.address}
							<div class="info-row">
								<span class="info-label">Address</span>
								<span class="info-value">{place.address}</span>
							</div>
						{/if}
						<div class="info-row">
							<span class="info-label">Check-in Radius</span>
							<span class="info-value">{place.radius} meters</span>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Planned Visit Form Modal (add at the end before closing tag) -->
	{#if showPlannedVisitForm}
		<div class="modal-overlay" on:click={() => (showPlannedVisitForm = false)}>
			<div class="modal" on:click|stopPropagation>
				<div class="modal-header">
					<h3>Plan a Visit</h3>
					<button class="close-modal-btn" on:click={() => (showPlannedVisitForm = false)}>×</button>
				</div>

				<div class="modal-content">
					{#if visitError}
						<div class="error-message">{visitError}</div>
					{/if}

					<div class="form-group">
						<label for="visit-date">Date *</label>
						<input id="visit-date" type="date" bind:value={newVisit.date} min={minDateString} />
					</div>

					<div class="form-group">
						<label for="visit-time">Time *</label>
						<input id="visit-time" type="time" bind:value={newVisit.time} />
					</div>

					{#if groups.length > 0}
						<div class="form-group">
							<div class="group-selector-header">
								<label>Share with groups</label>
								<div class="group-selector-actions">
									<button type="button" class="select-action" on:click={selectAllGroups}>
										All
									</button>
									<button type="button" class="select-action" on:click={deselectAllGroups}>
										None
									</button>
								</div>
							</div>
							<div class="group-selector-hint">
								Select which groups can see your visit. If none selected, all groups can see it.
							</div>
							<div class="groups-checkboxes">
								{#each groups as group}
									<label class="group-checkbox-item">
										<input
											type="checkbox"
											checked={newVisit.selectedGroups.includes(group.id)}
											on:change={() => toggleGroup(group.id)}
										/>
										<span class="group-checkbox-label">
											<span class="group-name">{group.name}</span>
										</span>
									</label>
								{/each}
							</div>
						</div>
					{/if}

					<div class="form-group">
						<label for="visit-notes">Notes (optional)</label>
						<textarea
							id="visit-notes"
							placeholder="e.g., Bringing my new board! Anyone want to join?"
							bind:value={newVisit.notes}
							rows="3"
							maxlength="200"
						></textarea>
						<div class="char-count">
							{newVisit.notes.length}/200
						</div>
					</div>
				</div>

				<div class="modal-actions">
					<button class="cancel-btn" on:click={() => (showPlannedVisitForm = false)}>
						Cancel
					</button>
					<button
						class="submit-btn"
						on:click={createPlannedVisit}
						disabled={creatingVisit || !newVisit.date || !newVisit.time}
					>
						{#if creatingVisit}
							<span class="spinner-small"></span>
							Planning...
						{:else}
							Plan Visit
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.place-detail-page {
		min-height: 100vh;
		background: #000;
		color: #fff;
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
		display: flex;
		justify-content: space-between;
		align-items: center;
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

	.header-actions {
		display: flex;
		gap: 12px;
	}

	.edit-btn {
		background: #0a0a0a;
		border: 1px solid var(--color-primary);
		color: var(--color-primary);
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.edit-btn:hover {
		background: rgba(252, 76, 2, 0.1);
	}

	/* Map */
	.map-section {
		height: 300px;
		width: 100%;
		position: relative;
	}

	#place-detail-map {
		height: 100%;
		width: 100%;
	}

	/* Content */
	.content {
		padding: 20px;
		max-width: 800px;
		margin: 0 auto;
	}

	.place-header {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 24px;
	}

	.place-icon {
		font-size: 48px;
	}

	.place-title h1 {
		font-size: 28px;
		margin: 0 0 8px 0;
		font-weight: 700;
	}

	.badge {
		display: inline-block;
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

	.description-section {
		background: #0a0a0a;
		padding: 16px;
		border-radius: 12px;
		margin-bottom: 24px;
	}

	.description-section p {
		margin: 0;
		line-height: 1.6;
		color: #ccc;
	}

	/* Stats */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
		margin-bottom: 32px;
	}

	.stat-card {
		background: #0a0a0a;
		padding: 20px;
		border-radius: 12px;
		text-align: center;
		border: 1px solid #1a1a1a;
	}

	.stat-icon {
		font-size: 32px;
		margin-bottom: 8px;
	}

	.stat-value {
		font-size: 24px;
		font-weight: 700;
		color: var(--color-primary);
		margin-bottom: 4px;
	}

	.stat-label {
		font-size: 12px;
		color: #666;
		text-transform: uppercase;
	}

	/* Sections */
	.section {
		margin-bottom: 32px;
	}

	.section h2 {
		font-size: 20px;
		margin: 0 0 16px 0;
		font-weight: 700;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.create-group-btn {
		background: var(--color-primary);
		color: #fff;
		border: none;
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.create-group-btn:hover {
		background: #7a2971;
	}

	/* Activities */
	.activities-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.activity-item {
		background: #0a0a0a;
		padding: 12px 16px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		gap: 12px;
		border: 1px solid #1a1a1a;
	}

	.activity-icon {
		font-size: 24px;
	}

	.activity-name {
		flex: 1;
		font-weight: 600;
	}

	.activity-category {
		font-size: 12px;
		color: #666;
		text-transform: uppercase;
	}

	/* Groups */
	.groups-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.group-item {
		background: #0a0a0a;
		padding: 16px;
		border-radius: 12px;
		border: 1px solid #1a1a1a;
		transition: all 0.2s;
		cursor: pointer;
	}

	.group-item:hover {
		border-color: var(--color-primary);
	}

	.group-info h3 {
		font-size: 16px;
		margin: 0 0 8px 0;
		font-weight: 700;
	}

	.group-info p {
		font-size: 14px;
		color: #999;
		margin: 0 0 12px 0;
	}

	.group-meta {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.member-count {
		font-size: 13px;
		color: #666;
	}

	.group-badge {
		padding: 3px 8px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		background: rgba(76, 175, 80, 0.2);
		color: #4caf50;
	}

	.group-badge.private {
		background: rgba(158, 158, 158, 0.2);
		color: #999;
	}

	/* Location Info */
	.location-info {
		background: #0a0a0a;
		padding: 16px;
		border-radius: 12px;
		border: 1px solid #1a1a1a;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		padding: 12px 0;
		border-bottom: 1px solid #1a1a1a;
	}

	.info-row:last-child {
		border-bottom: none;
	}

	.info-label {
		font-weight: 600;
		color: #999;
	}

	.info-value {
		color: #fff;
		font-family: monospace;
	}

	/* Edit Form */
	.edit-form {
		background: #0a0a0a;
		padding: 24px;
		border-radius: 12px;
		border: 1px solid #1a1a1a;
	}

	.edit-form h2 {
		margin: 0 0 24px 0;
		font-size: 22px;
	}

	.edit-notice {
		background: rgba(255, 152, 0, 0.1);
		border: 1px solid var(--color-primary);
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 20px;
		font-size: 14px;
		color: var(--color-primary);
	}

	.coords-display {
		background: #000;
		border: 1px solid #333;
		padding: 12px;
		border-radius: 8px;
		font-family: monospace;
		font-size: 14px;
		color: #4caf50;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.changed-badge {
		background: var(--color-primary);
		color: #000;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.form-group {
		margin-bottom: 20px;
	}

	.form-group label {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: #fff;
		margin-bottom: 8px;
	}

	.form-group input[type='text'],
	.form-group textarea,
	.form-group select {
		width: 100%;
		background: #000;
		border: 1px solid #333;
		color: #fff;
		padding: 12px;
		border-radius: 8px;
		font-size: 15px;
	}

	.form-group input:focus,
	.form-group textarea:focus,
	.form-group select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.form-group textarea {
		resize: vertical;
	}

	.form-group input[type='range'] {
		width: 100%;
	}

	.activities-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 8px;
		margin-top: 8px;
	}

	.activity-checkbox {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		background: #000;
		border: 1px solid #333;
		border-radius: 6px;
		cursor: pointer;
		font-size: 13px;
		transition: all 0.2s;
	}

	.activity-checkbox:hover {
		border-color: var(--color-primary);
	}

	.form-actions {
		display: flex;
		gap: 12px;
		margin-top: 24px;
	}

	.cancel-btn,
	.save-btn {
		flex: 1;
		padding: 14px 24px;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
	}

	.cancel-btn {
		background: #1a1a1a;
		color: #fff;
	}

	.cancel-btn:hover {
		background: #333;
	}

	.save-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.save-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.create-group-form {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 20px;
		margin-bottom: 20px;
		animation: slideDown 0.3s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.create-group-form h3 {
		margin: 0 0 20px 0;
		font-size: 18px;
		color: #fff;
		font-weight: 700;
	}

	.checkbox-label {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		cursor: pointer;
		padding: 12px;
		background: #000;
		border: 1px solid #333;
		border-radius: 8px;
		transition: all 0.2s;
	}

	.checkbox-label:hover {
		border-color: var(--color-primary);
		background: rgba(252, 76, 2, 0.02);
	}

	.checkbox-label input[type='checkbox'] {
		margin-top: 2px;
		width: 18px;
		height: 18px;
		cursor: pointer;
		flex-shrink: 0;
	}

	.checkbox-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
	}

	.checkbox-text strong {
		font-size: 15px;
		color: #fff;
		font-weight: 600;
	}

	.help-text {
		font-size: 13px;
		color: #666;
		line-height: 1.4;
	}

	.spinner-small {
		width: 16px;
		height: 16px;
		border: 2px solid #333;
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		display: inline-block;
	}

	/* Feature badges */
	.feature-badge {
		padding: 3px 8px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		background: rgba(252, 76, 2, 0.1);
		color: var(--color-primary);
		border: 1px solid rgba(252, 76, 2, 0.2);
	}

	/* Update existing .group-meta if needed */
	.group-meta {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}

	/* Enhanced group hover (update existing if present) */
	.group-item {
		background: #0a0a0a;
		padding: 16px;
		border-radius: 12px;
		border: 1px solid #1a1a1a;
		transition: all 0.2s;
		cursor: pointer;
	}

	.group-item:hover {
		border-color: var(--color-primary);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(252, 76, 2, 0.15);
	}

	/* Danger Zone */
	.danger-zone {
		margin-top: 32px;
		padding-top: 24px;
		border-top: 1px solid #1a1a1a;
	}

	.danger-zone h3 {
		font-size: 16px;
		color: #f44336;
		margin: 0 0 12px 0;
	}

	.delete-btn {
		background: transparent;
		border: 2px solid #f44336;
		color: #f44336;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.delete-btn:hover:not(:disabled) {
		background: rgba(244, 67, 54, 0.1);
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Empty State */
	.empty-state {
		text-align: center;
		padding: 40px 20px;
	}

	.empty-icon {
		font-size: 48px;
		display: block;
		margin-bottom: 12px;
	}

	.empty-state p {
		color: #666;
		margin: 0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.stats-grid {
			grid-template-columns: 1fr;
		}

		.activities-grid {
			grid-template-columns: 1fr;
		}
	}

	/* Leaflet overrides */
	:global(.leaflet-container) {
		background: #000;
	}

	:global(.leaflet-tile) {
		filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
	}

	/* Add these styles to your existing <style> block */

	/* Planned Visits Section */
	.plan-visit-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
		border: none;
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.plan-visit-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(252, 76, 2, 0.4);
	}

	.loading-small {
		display: flex;
		justify-content: center;
		padding: 20px;
	}

	.spinner-small {
		width: 20px;
		height: 20px;
		border: 2px solid #333;
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		display: inline-block;
	}

	.empty-state-small {
		text-align: center;
		padding: 32px 20px;
		background: #0a0a0a;
		border-radius: 12px;
		border: 1px solid #1a1a1a;
	}

	.empty-state-small p {
		margin: 0 0 4px 0;
		color: #666;
	}

	.hint {
		font-size: 14px;
		color: #555;
	}

	.visits-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.visit-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 10px;
		padding: 14px;
		transition: all 0.2s;
	}

	.visit-card.my-visit {
		border-color: rgba(252, 76, 2, 0.3);
		background: rgba(252, 76, 2, 0.05);
	}

	.visit-card:hover {
		border-color: #333;
	}

	.visit-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 10px;
	}

	.visit-user {
		display: flex;
		gap: 10px;
		align-items: center;
		flex: 1;
		min-width: 0;
	}

	.user-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-weight: 700;
		font-size: 16px;
		text-transform: uppercase;
		flex-shrink: 0;
	}

	.user-info {
		flex: 1;
		min-width: 0;
	}

	.username {
		font-weight: 600;
		color: #fff;
		font-size: 15px;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.you-badge {
		background: rgba(252, 76, 2, 0.2);
		color: var(--color-primary);
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.visit-groups {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}

	.group-pill {
		background: rgba(252, 76, 2, 0.15);
		border: 1px solid rgba(252, 76, 2, 0.3);
		color: var(--color-primary);
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 600;
	}

	.visit-group-public {
		font-size: 12px;
		color: #666;
		margin-top: 2px;
	}

	.cancel-visit-btn {
		background: transparent;
		border: 1px solid #333;
		color: #666;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
		transition: all 0.2s;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.cancel-visit-btn:hover {
		background: #f44336;
		border-color: #f44336;
		color: #fff;
	}

	.visit-time {
		background: rgba(252, 76, 2, 0.1);
		border: 1px solid rgba(252, 76, 2, 0.2);
		color: var(--color-primary);
		padding: 8px 12px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 8px;
		display: inline-block;
	}

	.visit-notes {
		color: #999;
		font-size: 14px;
		font-style: italic;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid #1a1a1a;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
		animation: fadeIn 0.2s;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 16px;
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		animation: slideUp 0.3s;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px 24px;
		border-bottom: 1px solid #1a1a1a;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 20px;
		color: #fff;
	}

	.close-modal-btn {
		background: transparent;
		border: none;
		color: #666;
		font-size: 32px;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: all 0.2s;
	}

	.close-modal-btn:hover {
		background: #1a1a1a;
		color: #fff;
	}

	.modal-content {
		padding: 24px;
		overflow-y: auto;
	}

	.error-message {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid #f44336;
		color: #f44336;
		padding: 12px;
		border-radius: 8px;
		margin-bottom: 20px;
		font-size: 14px;
	}

	.char-count {
		text-align: right;
		font-size: 12px;
		color: #666;
		margin-top: 4px;
	}

	/* Group Selector */
	.group-selector-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.group-selector-actions {
		display: flex;
		gap: 8px;
	}

	.select-action {
		background: transparent;
		border: 1px solid #333;
		color: var(--color-primary);
		padding: 4px 12px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.select-action:hover {
		border-color: var(--color-primary);
		background: rgba(252, 76, 2, 0.1);
	}

	.group-selector-hint {
		font-size: 12px;
		color: #666;
		margin-bottom: 12px;
		line-height: 1.4;
	}

	.groups-checkboxes {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.group-checkbox-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px;
		background: #000;
		border: 1px solid #333;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.group-checkbox-item:hover {
		border-color: var(--color-primary);
		background: rgba(252, 76, 2, 0.05);
	}

	.group-checkbox-item input[type='checkbox'] {
		width: 20px;
		height: 20px;
		margin: 0;
		cursor: pointer;
		accent-color: var(--color-primary);
		flex-shrink: 0;
	}

	.group-checkbox-label {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.group-name {
		color: #fff;
		font-size: 14px;
		font-weight: 500;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
		padding: 20px 24px;
		border-top: 1px solid #1a1a1a;
	}

	.submit-btn {
		flex: 1;
		padding: 14px 24px;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.submit-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.modal {
			max-height: 100vh;
			border-radius: 0;
		}

		.user-info {
			max-width: calc(100% - 80px);
		}
	}
</style>
