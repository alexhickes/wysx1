<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Place, Activity, Group } from '$lib/types';
	import ClaudeMap from '$lib/components/ClaudeMap.svelte';

	import Drawer from '../../../lib/components/Drawer.svelte';
	let showDrawer = false;

	export let data: PageData;

	let myPlaces: any[] = [];
	let invitedPlaces: any[] = [];
	let allActivities: Activity[] = [];
	let loading = true;
	let activeTab: 'my-places' | 'invited' = 'my-places';
	let showCreatePlace = false;
	let createPlaceLoading = false;
	let createPlaceError = '';

	// Create place form
	let newPlace = {
		name: '',
		description: '',
		place_type: 'skatepark',
		radius: 100,
		is_public: true,
		selectedActivities: [] as string[]
	};

	// Current location
	let currentLocation: { latitude: number; longitude: number } | null = null;
	let gettingLocation = false;

	// Map drawer
	let showMapDrawer = false;
	let map: any;
	let L: any;
	let selectedMarker: any;
	let tempLocation: { latitude: number; longitude: number } | null = null;

	onMount(async () => {
		await Promise.all([loadMyPlaces(), loadInvitedPlaces(), loadActivities()]);
		loading = false;
	});

	async function loadMyPlaces() {
		const { data: places, error } = await data.supabase
			.from('places')
			.select(
				`
        *,
        place_activities(
          activity:activities(*)
        ),
        groups(
          id,
          name,
          group_members(count)
        )
      `
			)
			.eq('created_by', data.session!.user.id)
			.order('created_at', { ascending: false });

		if (!error && places) {
			myPlaces = places;
		}
	}

	async function loadInvitedPlaces() {
		// Get places through groups I'm a member of (but didn't create)
		const { data: groupMemberships, error } = await data.supabase
			.from('group_members')
			.select(
				`
        group_id,
        groups(
          id,
          name,
          place:places(
            *,
            place_activities(
              activity:activities(*)
            )
          ),
          group_members(count)
        )
      `
			)
			.eq('user_id', data.session!.user.id);

		if (!error && groupMemberships) {
			// Filter out places I created and deduplicate
			const seenPlaceIds = new Set();
			invitedPlaces = groupMemberships
				.filter((m) => {
					const place = (m.groups as any)?.place;
					if (!place || place.created_by === data.session!.user.id) return false;
					if (seenPlaceIds.has(place.id)) return false;
					seenPlaceIds.add(place.id);
					return true;
				})
				.map((m) => ({
					...(m.groups as any).place,
					groups: [
						{
							id: (m.groups as any).id,
							name: (m.groups as any).name,
							group_members: (m.groups as any).group_members
						}
					]
				}));
		}
	}

	async function loadActivities() {
		const { data: activities, error } = await data.supabase
			.from('activities')
			.select('*')
			.order('category', { ascending: true })
			.order('name', { ascending: true });

		if (!error && activities) {
			allActivities = activities;
		}
	}

	async function getCurrentLocation() {
		gettingLocation = true;

		if (!navigator.geolocation) {
			createPlaceError = 'Geolocation is not supported by your browser';
			gettingLocation = false;
			return;
		}

		navigator.geolocation.getCurrentPosition(
			(position) => {
				currentLocation = {
					latitude: position.coords.latitude,
					longitude: position.coords.longitude
				};
				gettingLocation = false;
			},
			(error) => {
				createPlaceError = 'Unable to get your location';
				gettingLocation = false;
			},
			{
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge: 0
			}
		);
	}

	async function openMapDrawer() {
		showMapDrawer = true;

		// Wait for drawer to animate in
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Initialize map if not already done
		if (!map && typeof window !== 'undefined') {
			// const leafletModule = await import('leaflet');
			// L = leafletModule.default;
			// // Get current location (using async/await)
			// let initialLat = 51.5074;
			// let initialLng = -0.1278;
			// try {
			// 	// Wrap geolocation in a Promise so we can await it
			// 	const position = await new Promise<GeolocationPosition>((resolve, reject) => {
			// 		navigator.geolocation.getCurrentPosition(resolve, reject);
			// 	});
			// 	initialLat = position.coords.latitude;
			// 	initialLng = position.coords.longitude;
			// } catch (error) {
			// 	// Geolocation failed or was denied, fall back to default
			// 	console.error('Geolocation failed or permission denied:', error);
			// }
			// // Now that we have the initial coordinates, initialize the map
			// map = L.map('place-map').setView([initialLat, initialLng], 15);
			// L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			// 	attribution: '© OpenStreetMap contributors'
			// }).addTo(map);
			// // Add marker at center
			// tempLocation = { latitude: initialLat, longitude: initialLng };
			// selectedMarker = L.marker([initialLat, initialLng], {
			// 	draggable: true,
			// 	icon: L.divIcon({
			// 		html: '<div style="background: #FC4C02; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
			// 		className: '',
			// 		iconSize: [30, 30]
			// 	})
			// }).addTo(map);
			// // Update temp location when marker is dragged
			// selectedMarker.on('dragend', (e: any) => {
			// 	const latlng = e.getLatLng();
			// 	tempLocation = { latitude: latlng.lat, longitude: latlng.lng };
			// });
			// // Add click handler to map to move marker
			// map.on('click', (e: any) => {
			// 	const latlng = e.latlng;
			// 	tempLocation = { latitude: latlng.lat, longitude: latlng.lng };
			// 	selectedMarker.setLatLng([latlng.lat, latlng.lng]);
			// });
			// // Fix map size after drawer animation
			// setTimeout(() => {
			// 	map.invalidateSize();
			// }, 100);
		}
	}

	function confirmLocation() {
		if (tempLocation) {
			currentLocation = tempLocation;
			closeMapDrawer();
		}
	}

	function closeMapDrawer() {
		showMapDrawer = false;
		tempLocation = null;
	}

	async function handleCreatePlace() {
		if (!newPlace.name.trim()) {
			createPlaceError = 'Please enter a place name';
			return;
		}

		if (!currentLocation) {
			createPlaceError = 'Please get your current location first';
			return;
		}

		createPlaceLoading = true;
		createPlaceError = '';

		try {
			// Create the place
			const { data: place, error: placeError } = await data.supabase
				.from('places')
				.insert({
					name: newPlace.name.trim(),
					description: newPlace.description.trim() || null,
					latitude: currentLocation.latitude,
					longitude: currentLocation.longitude,
					radius: newPlace.radius,
					place_type: newPlace.place_type,
					is_public: newPlace.is_public,
					created_by: data.session!.user.id
				})
				.select()
				.single();

			if (placeError) throw placeError;

			// Link activities if any selected
			if (newPlace.selectedActivities.length > 0 && place) {
				const { error: activitiesError } = await data.supabase.from('place_activities').insert(
					newPlace.selectedActivities.map((actId) => ({
						place_id: place.id,
						activity_id: actId
					}))
				);

				if (activitiesError) console.error('Error linking activities:', activitiesError);
			}

			// Reset form
			newPlace = {
				name: '',
				description: '',
				place_type: 'skatepark',
				radius: 100,
				is_public: true,
				selectedActivities: []
			};
			currentLocation = null;
			showCreatePlace = false;

			// Reload places
			await loadMyPlaces();
		} catch (error: any) {
			createPlaceError = error.message || 'Failed to create place';
		} finally {
			createPlaceLoading = false;
		}
	}

	function handlePlaceClick(placeId: string) {
		goto(`/places/${placeId}`);
	}

	function getGroupMemberCount(place: any): number {
		if (!place.groups || place.groups.length === 0) return 0;
		return place.groups.reduce((sum: number, group: any) => {
			return sum + (group.group_members?.[0]?.count || 0);
		}, 0);
	}
</script>

<svelte:head>
	<title>Places - Location Share</title>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div class="places-page">
	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
		</div>
	{:else}
		<!-- Tabs -->
		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'my-places'}
				on:click={() => (activeTab = 'my-places')}
			>
				My Places
				<span class="tab-count">{myPlaces.length}</span>
			</button>
			<button
				class="tab"
				class:active={activeTab === 'invited'}
				on:click={() => (activeTab = 'invited')}
			>
				Invited
				<span class="tab-count">{invitedPlaces.length}</span>
			</button>
		</div>

		<!-- My Places Tab -->
		{#if activeTab === 'my-places'}
			<div class="content-section">
				<!-- Create Place Button -->
				<button class="create-place-btn" on:click={() => (showCreatePlace = !showCreatePlace)}>
					<span class="btn-icon">+</span>
					Create New Place
				</button>

				<!-- Create Place Form -->
				{#if showCreatePlace}
					<div class="create-form">
						<h3>Create New Place</h3>

						{#if createPlaceError}
							<div class="error-message">{createPlaceError}</div>
						{/if}

						<!-- Get Location -->
						{#if !currentLocation}
							<div class="location-buttons">
								<button
									class="location-btn"
									on:click={getCurrentLocation}
									disabled={gettingLocation}
								>
									{#if gettingLocation}
										<span class="spinner-small"></span>
										Getting location...
									{:else}
										📍 Use Current Location
									{/if}
								</button>
								<button class="map-btn" on:click={openMapDrawer}> 🗺️ Pick on Map </button>

								<button on:click={() => (showDrawer = true)}>Open Custom Drawer</button> -->

								<Drawer bind:isOpen={showDrawer}>
									<h2>Custom Drawer Content</h2>
									<p>This is a custom bottom drawer component.</p>
									<button on:click={() => (showDrawer = false)}>Close</button>
									<ClaudeMap bind:this={map} />
								</Drawer>
							</div>
						{:else}
							<div class="location-success">
								<div class="location-info">
									<span class="check-icon">✓</span>
									<span class="coords">
										{currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
									</span>
								</div>
								<button class="change-btn" on:click={() => (currentLocation = null)}>
									Change
								</button>
							</div>
						{/if}

						<!-- Form Fields -->
						<div class="form-group">
							<label for="place-name">Place Name *</label>
							<input
								id="place-name"
								type="text"
								placeholder="e.g., Southbank Skatepark"
								bind:value={newPlace.name}
								maxlength="100"
							/>
						</div>

						<div class="form-group">
							<label for="description">Description</label>
							<textarea
								id="description"
								placeholder="Add details about this place..."
								bind:value={newPlace.description}
								rows="3"
								maxlength="500"
							></textarea>
						</div>

						<div class="form-group">
							<label for="place-type">Place Type</label>
							<select id="place-type" bind:value={newPlace.place_type}>
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
							<label for="radius">
								Radius: {newPlace.radius}m
							</label>
							<input
								id="radius"
								type="range"
								min="10"
								max="500"
								step="10"
								bind:value={newPlace.radius}
							/>
							<div class="radius-hint">Area where people will be auto-checked-in</div>
						</div>

						<div class="form-group">
							<label>
								<input type="checkbox" bind:checked={newPlace.is_public} />
								Public place (anyone can see and join groups here)
							</label>
						</div>

						<!-- Activities -->
						<div class="form-group">
							<label>Activities at this place</label>
							<div class="activities-grid">
								{#each allActivities as activity}
									<label class="activity-checkbox">
										<input
											type="checkbox"
											value={activity.id}
											checked={newPlace.selectedActivities.includes(activity.id)}
											on:change={(e) => {
												if (e.currentTarget.checked) {
													newPlace.selectedActivities = [
														...newPlace.selectedActivities,
														activity.id
													];
												} else {
													newPlace.selectedActivities = newPlace.selectedActivities.filter(
														(id) => id !== activity.id
													);
												}
											}}
										/>
										<span class="activity-label">
											{activity.icon || '📍'}
											{activity.name}
										</span>
									</label>
								{/each}
							</div>
						</div>

						<!-- Actions -->
						<div class="form-actions">
							<button
								class="cancel-btn"
								on:click={() => {
									showCreatePlace = false;
									createPlaceError = '';
									currentLocation = null;
								}}
							>
								Cancel
							</button>
							<button
								class="submit-btn"
								on:click={handleCreatePlace}
								disabled={createPlaceLoading || !currentLocation || !newPlace.name.trim()}
							>
								{#if createPlaceLoading}
									<span class="spinner-small"></span>
									Creating...
								{:else}
									Create Place
								{/if}
							</button>
						</div>
					</div>
				{/if}

				<!-- Places List -->
				{#if myPlaces.length === 0}
					<div class="empty-state">
						<span class="empty-icon">📍</span>
						<h3>No places yet</h3>
						<p>Create your first place to start sharing with friends</p>
					</div>
				{:else}
					<div class="places-grid">
						{#each myPlaces as place}
							<div
								class="place-card"
								on:click={() => handlePlaceClick(place.id)}
								on:keydown={(e) => e.key === 'Enter' && handlePlaceClick(place.id)}
								role="button"
								tabindex="0"
							>
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
									{#if place.is_public}
										<span class="public-badge">Public</span>
									{:else}
										<span class="private-badge">Private</span>
									{/if}
								</div>

								<h3 class="place-name">{place.name}</h3>

								{#if place.description}
									<p class="place-description">{place.description}</p>
								{/if}

								<!-- Activities -->
								{#if place.place_activities && place.place_activities.length > 0}
									<div class="place-activities">
										{#each place.place_activities.slice(0, 3) as pa}
											<span class="activity-tag">
												{pa.activity.icon || '📍'}
												{pa.activity.name}
											</span>
										{/each}
										{#if place.place_activities.length > 3}
											<span class="activity-tag">+{place.place_activities.length - 3}</span>
										{/if}
									</div>
								{/if}

								<!-- Stats -->
								<div class="place-stats">
									<div class="stat">
										<span class="stat-icon">👥</span>
										<span class="stat-value">{getGroupMemberCount(place)}</span>
										<span class="stat-label">members</span>
									</div>
									<div class="stat">
										<span class="stat-icon">📦</span>
										<span class="stat-value">{place.groups?.length || 0}</span>
										<span class="stat-label">groups</span>
									</div>
									<div class="stat">
										<span class="stat-icon">📏</span>
										<span class="stat-value">{place.radius}m</span>
										<span class="stat-label">radius</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Invited Places Tab -->
		{#if activeTab === 'invited'}
			<div class="content-section">
				{#if invitedPlaces.length === 0}
					<div class="empty-state">
						<span class="empty-icon">🎯</span>
						<h3>No invites yet</h3>
						<p>When friends invite you to their groups, places will appear here</p>
					</div>
				{:else}
					<div class="places-grid">
						{#each invitedPlaces as place}
							<div
								class="place-card"
								on:click={() => handlePlaceClick(place.id)}
								on:keydown={(e) => e.key === 'Enter' && handlePlaceClick(place.id)}
								role="button"
								tabindex="0"
							>
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
									<span class="invited-badge">Invited</span>
								</div>

								<h3 class="place-name">{place.name}</h3>

								{#if place.description}
									<p class="place-description">{place.description}</p>
								{/if}

								<!-- Activities -->
								{#if place.place_activities && place.place_activities.length > 0}
									<div class="place-activities">
										{#each place.place_activities.slice(0, 3) as pa}
											<span class="activity-tag">
												{pa.activity.icon || '📍'}
												{pa.activity.name}
											</span>
										{/each}
										{#if place.place_activities.length > 3}
											<span class="activity-tag">+{place.place_activities.length - 3}</span>
										{/if}
									</div>
								{/if}

								<!-- Groups you're in -->
								{#if place.groups && place.groups.length > 0}
									<div class="groups-list">
										<div class="groups-label">Your groups:</div>
										{#each place.groups as group}
											<div class="group-tag">{group.name}</div>
										{/each}
									</div>
								{/if}

								<!-- Stats -->
								<div class="place-stats">
									<div class="stat">
										<span class="stat-icon">👥</span>
										<span class="stat-value">{getGroupMemberCount(place)}</span>
										<span class="stat-label">members</span>
									</div>
									<div class="stat">
										<span class="stat-icon">📏</span>
										<span class="stat-value">{place.radius}m</span>
										<span class="stat-label">radius</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.places-page {
		min-height: 100%;
		background: #000;
		padding-bottom: 20px;
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

	.spinner-small {
		width: 16px;
		height: 16px;
		border: 2px solid #333;
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		display: inline-block;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: 8px;
		padding: 16px 16px;
		border-bottom: 1px solid #1a1a1a;

		top: 64px;
		background: #000;
		z-index: 50;
	}

	.tab {
		flex: 1;
		background: transparent;
		border: none;
		color: #666;
		font-size: 16px;
		font-weight: 600;
		padding: 12px 16px;
		cursor: pointer;
		border-radius: 8px;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.tab.active {
		background: #0a0a0a;
		color: #fff;
	}

	.tab-count {
		color: #666;
		font-size: 14px;
	}

	.tab.active .tab-count {
		color: var(--color-primary);
	}

	/* Content */
	.content-section {
		padding: 16px;
	}

	/* Create Place Button */
	.create-place-btn {
		width: 100%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
		border: none;
		padding: 16px 24px;
		border-radius: 12px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		margin-bottom: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: all 0.2s;
	}

	.create-place-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.btn-icon {
		font-size: 24px;
		font-weight: 700;
		line-height: 1;
	}

	/* Create Form */
	.create-form {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 20px;
		margin-bottom: 20px;
	}

	.create-form h3 {
		margin: 0 0 20px 0;
		font-size: 20px;
		color: #fff;
	}

	.error-message {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid #f44336;
		color: #f44336;
		padding: 12px;
		border-radius: 8px;
		margin-bottom: 16px;
		font-size: 14px;
	}

	.location-btn {
		flex: 1;
		background: #0a0a0a;
		border: 2px solid var(--color-primary);
		color: var(--color-primary);
		padding: 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: all 0.2s;
	}

	.location-btn:hover:not(:disabled) {
		background: rgba(252, 76, 2, 0.1);
	}

	.location-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.location-buttons {
		display: flex;
		gap: 12px;
		margin-bottom: 16px;
	}

	.map-btn {
		flex: 1;
		background: #0a0a0a;
		border: 2px dashed #666;
		color: #fff;
		padding: 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: all 0.2s;
	}

	.map-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: rgba(252, 76, 2, 0.05);
	}

	.location-success {
		background: rgba(76, 175, 80, 0.1);
		border: 1px solid #4caf50;
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.location-info {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.check-icon {
		color: #4caf50;
		font-size: 18px;
		font-weight: 700;
	}

	.coords {
		color: #4caf50;
		font-size: 13px;
		font-family: monospace;
	}

	.change-btn {
		background: transparent;
		border: 1px solid #4caf50;
		color: #4caf50;
		padding: 6px 16px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.change-btn:hover {
		background: rgba(76, 175, 80, 0.1);
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
		font-family: inherit;
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
		margin-top: 8px;
	}

	.radius-hint {
		font-size: 12px;
		color: #666;
		margin-top: 4px;
	}

	.form-group input[type='checkbox'] {
		margin-right: 8px;
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

	.activity-checkbox input[type='checkbox'] {
		margin: 0;
	}

	.activity-label {
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.form-actions {
		display: flex;
		gap: 12px;
		margin-top: 24px;
	}

	.cancel-btn,
	.submit-btn {
		flex: 1;
		padding: 14px 24px;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.cancel-btn {
		background: #1a1a1a;
		color: #fff;
	}

	.cancel-btn:hover {
		background: #333;
	}

	.submit-btn {
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

	/* Places Grid */
	.places-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 16px;
	}

	.place-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.place-card:hover {
		border-color: var(--color-primary);
		transform: translateY(-4px);
		box-shadow: 0 8px 24px rgba(252, 76, 2, 0.2);
	}

	.place-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.place-icon {
		font-size: 32px;
	}

	.public-badge,
	.private-badge,
	.invited-badge {
		padding: 4px 10px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.public-badge {
		background: rgba(76, 175, 80, 0.2);
		color: #4caf50;
	}

	.private-badge {
		background: rgba(158, 158, 158, 0.2);
		color: #999;
	}

	.invited-badge {
		background: rgba(252, 76, 2, 0.2);
		color: var(--color-primary);
	}

	.place-name {
		font-size: 18px;
		font-weight: 700;
		color: #fff;
		margin: 0 0 8px 0;
	}

	.place-description {
		font-size: 14px;
		color: #999;
		margin: 0 0 12px 0;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.place-activities {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 12px;
	}

	.activity-tag {
		background: #1a1a1a;
		color: #999;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
	}

	.groups-list {
		margin-bottom: 12px;
	}

	.groups-label {
		font-size: 12px;
		color: #666;
		margin-bottom: 6px;
	}

	.group-tag {
		display: inline-block;
		background: rgba(252, 76, 2, 0.1);
		border: 1px solid var(--color-primary);
		color: var(--color-primary);
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		margin-right: 6px;
		margin-bottom: 6px;
	}

	.place-stats {
		display: flex;
		gap: 16px;
		padding-top: 12px;
		border-top: 1px solid #1a1a1a;
	}

	.stat {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
	}

	.stat-icon {
		font-size: 14px;
	}

	.stat-value {
		color: var(--color-primary);
		font-weight: 700;
	}

	.stat-label {
		color: #666;
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
		.places-grid {
			grid-template-columns: 1fr;
		}

		.activities-grid {
			grid-template-columns: 1fr;
		}
	}

	/* Map Drawer */
	.drawer-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 999;
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.map-drawer {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: #0a0a0a;
		border-top-left-radius: 20px;
		border-top-right-radius: 20px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		max-height: 85vh;
		transform: translateY(100%);
		transition: transform 0.3s ease-out;
	}

	.map-drawer.open {
		transform: translateY(0);
	}

	.drawer-handle {
		width: 40px;
		height: 4px;
		background: #333;
		border-radius: 2px;
		margin: 12px auto 8px;
	}

	.drawer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 20px;
		border-bottom: 1px solid #1a1a1a;
	}

	.drawer-header h3 {
		margin: 0;
		font-size: 18px;
		color: #fff;
	}

	.close-drawer {
		background: transparent;
		border: none;
		color: #666;
		font-size: 24px;
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

	.close-drawer:hover {
		background: #1a1a1a;
		color: #fff;
	}

	.drawer-content {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.map-instruction {
		padding: 16px 20px;
		margin: 0;
		font-size: 14px;
		color: #999;
		background: rgba(252, 76, 2, 0.05);
		border-bottom: 1px solid rgba(252, 76, 2, 0.1);
	}

	#place-map {
		flex: 1;
		min-height: 400px;
		background: #000;
	}

	.selected-coords {
		padding: 12px 20px;
		background: rgba(76, 175, 80, 0.1);
		border-top: 1px solid rgba(76, 175, 80, 0.2);
		color: #4caf50;
		font-size: 13px;
		font-family: monospace;
		text-align: center;
	}

	.drawer-actions {
		display: flex;
		gap: 12px;
		padding: 16px 20px;
		border-top: 1px solid #1a1a1a;
	}

	.drawer-cancel,
	.drawer-confirm {
		flex: 1;
		padding: 14px 24px;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
	}

	.drawer-cancel {
		background: #1a1a1a;
		color: #fff;
	}

	.drawer-cancel:hover {
		background: #333;
	}

	.drawer-confirm {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.drawer-confirm:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.drawer-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Leaflet map overrides */
	:global(.leaflet-container) {
		background: #000;
		font-family: inherit;
	}

	:global(.leaflet-tile) {
		filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
	}
</style>
