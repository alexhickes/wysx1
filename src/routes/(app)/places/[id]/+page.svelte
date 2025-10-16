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

	// Map
	let map: any;
	let L: any;
	let placeMarker: any;
	let radiusCircle: any;

	const placeId = $page.params.id ?? '';

	onMount(async () => {
		await loadPlace();
		await loadGroups();
		await loadActivities();
		loading = false;

		// Initialize map after loading is complete and DOM is ready
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
		// Navigate to a create group page or show modal
		// For now, just go back to places page
		goto('/places');
	}

	function getGroupMemberCount(group: any): number {
		return group.group_members?.[0]?.count || 0;
	}

	function getTotalMembers(): number {
		return groups.reduce((sum, group) => sum + getGroupMemberCount(group), 0);
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
</style>
