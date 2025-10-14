<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	import { getNearbyPlaces, getPlaceWithActivities, getActivities } from '$lib/places';
	import { getMyGroups, createGroup, joinGroup, getGroupsForPlace } from '$lib/groups';
	import {
		checkIn,
		checkOut,
		getMyActiveCheckIns,
		getActiveMembers,
		autoManageCheckIns
	} from '$lib/checkins';

	export let data: PageData;

	let map: any;
	let L: any;
	let myLocationMarker: any;
	let placeMarkers: Map<string, any> = new Map();
	let memberMarkers: Map<string, any> = new Map();
	let watchId: number | null = null;
	let channel: RealtimeChannel;

	// State
	let myLocation: { lat: number; lng: number } | null = null;
	let nearbyPlaces: any[] = [];
	let myGroups: any[] = [];
	let myActiveCheckIns: any[] = [];
	let activeMembers: any[] = [];
	let allActivities: any[] = [];

	// UI State
	let selectedPlace: any = null;
	let activeTab: 'nearby' | 'groups' | 'activity' = 'groups';
	let showCreateGroup = false;
	let drawerExpanded = false;

	// Forms
	let newGroup = {
		name: '',
		description: '',
		is_public: true,
		auto_checkin_enabled: true
	};

	onMount(async () => {
		if (!data.session) {
			goto('/');
			return;
		}

		// Load Leaflet
		const leafletModule = await import('leaflet');
		L = leafletModule.default;

		// Initialize map
		map = L.map('map').setView([51.5074, -0.1278], 13);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap'
		}).addTo(map);

		// Load initial data
		const { data: activities } = await getActivities(data.supabase);
		allActivities = activities;

		await loadMyGroups();
		startLocationTracking();
		subscribeToCheckIns();
	});

	onDestroy(() => {
		if (watchId !== null) {
			navigator.geolocation.clearWatch(watchId);
		}
		if (channel) {
			channel.unsubscribe();
		}
	});

	function startLocationTracking() {
		if (!navigator.geolocation) {
			alert('Geolocation not supported');
			return;
		}

		watchId = navigator.geolocation.watchPosition(
			async (position) => {
				const { latitude, longitude } = position.coords;
				myLocation = { lat: latitude, lng: longitude };

				// Update my marker
				if (myLocationMarker) {
					myLocationMarker.setLatLng([latitude, longitude]);
				} else if (L && map) {
					myLocationMarker = L.circleMarker([latitude, longitude], {
						radius: 10,
						fillColor: '#4CAF50',
						color: 'white',
						weight: 3,
						fillOpacity: 1
					}).addTo(map);
					map.setView([latitude, longitude], 15);
				}

				// Auto-manage check-ins based on location
				await autoManageCheckIns(data.supabase, latitude, longitude);

				// Load nearby places
				await loadNearbyPlaces(latitude, longitude);

				// Refresh check-ins
				await loadMyActiveCheckIns();
				await loadActiveMembers();
			},
			(error) => console.error('Location error:', error),
			{
				enableHighAccuracy: true,
				maximumAge: 30000,
				timeout: 27000
			}
		);
	}

	async function loadNearbyPlaces(lat: number, lng: number) {
		const { data: places } = await getNearbyPlaces(data.supabase, lat, lng, 5000);
		nearbyPlaces = places || [];

		// Draw place markers and radii
		if (L && map) {
			// Clear old markers
			placeMarkers.forEach((marker) => marker.remove());
			placeMarkers.clear();

			places?.forEach((place: any) => {
				// Draw radius circle
				const circle = L.circle([place.place_lat, place.place_lng], {
					radius: place.radius || 100,
					color: '#2196F3',
					fillColor: '#2196F3',
					fillOpacity: 0.1,
					weight: 2
				}).addTo(map);

				// Add marker with popup
				const marker = L.marker([place.place_lat, place.place_lng])
					.addTo(map)
					.bindPopup(
						`<div style="color: black;">
							<strong>${place.place_name}</strong><br/>
							${place.active_members > 0 ? `${place.active_members} active` : 'No activity'}
						</div>`
					)
					.on('click', () => selectPlace(place.place_id));

				placeMarkers.set(place.place_id, { marker, circle });
			});
		}
	}

	async function selectPlace(placeId: string) {
		const { data: place } = await getPlaceWithActivities(data.supabase, placeId);
		selectedPlace = place;

		// Load groups for this place
		const { data: groups } = await getGroupsForPlace(data.supabase, placeId);
		selectedPlace.groups = groups;

		// Switch to nearby tab and expand drawer
		activeTab = 'nearby';
		drawerExpanded = true;
	}

	async function loadMyGroups() {
		const { data: groups } = await getMyGroups(data.supabase);
		myGroups = groups || [];
	}

	async function loadMyActiveCheckIns() {
		const { data: checkIns } = await getMyActiveCheckIns(data.supabase);
		myActiveCheckIns = checkIns || [];
	}

	async function loadActiveMembers() {
		const { data: members } = await getActiveMembers(data.supabase);
		activeMembers = members || [];

		// Draw member markers on map
		if (L && map) {
			memberMarkers.forEach((marker) => marker.remove());
			memberMarkers.clear();

			members?.forEach((member: any) => {
				const marker = L.marker([member.place_lat, member.place_lng], {
					icon: L.divIcon({
						html: `<div style="background: #FF9800; color: white; padding: 5px 10px; border-radius: 15px; font-size: 11px; font-weight: bold;">
							${member.display_name || member.username} ${member.activity_name || ''}
						</div>`,
						className: '',
						iconSize: [120, 25]
					})
				}).addTo(map);

				memberMarkers.set(member.checkin_id, marker);
			});
		}
	}

	function subscribeToCheckIns() {
		channel = data.supabase
			.channel('checkin-updates')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'check_ins'
				},
				async () => {
					await loadActiveMembers();
					await loadMyActiveCheckIns();
				}
			)
			.subscribe();
	}

	async function handleCreateGroup() {
		if (!selectedPlace || !newGroup.name) return;

		const { error } = await createGroup(data.supabase, {
			place_id: selectedPlace.id,
			name: newGroup.name,
			description: newGroup.description,
			is_public: newGroup.is_public,
			auto_checkin_enabled: newGroup.auto_checkin_enabled
		});

		if (error) {
			alert('Error creating group: ' + error);
			return;
		}

		showCreateGroup = false;
		newGroup = {
			name: '',
			description: '',
			is_public: true,
			auto_checkin_enabled: true
		};

		await loadMyGroups();
		await selectPlace(selectedPlace.id);
	}

	async function handleJoinGroup(groupId: string) {
		const { error } = await joinGroup(data.supabase, groupId, true);

		if (error) {
			alert('Error joining group: ' + error);
			return;
		}

		await loadMyGroups();
		if (selectedPlace) {
			await selectPlace(selectedPlace.id);
		}
	}

	async function handleManualCheckIn(placeId: string, groupId?: string, activityId?: string) {
		const { error } = await checkIn(data.supabase, placeId, groupId, activityId);

		if (error) {
			alert('Error checking in: ' + error);
			return;
		}

		await loadMyActiveCheckIns();
		await loadActiveMembers();
	}

	async function handleCheckOut(checkInId: string) {
		const { error } = await checkOut(data.supabase, checkInId);

		if (error) {
			alert('Error checking out: ' + error);
			return;
		}

		await loadMyActiveCheckIns();
		await loadActiveMembers();
	}
</script>

// src/routes/(app)/map/+page.svelte
<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div class="map-container">
	<!-- Full screen map -->
	<div class="header">
		<div id="map"></div>
	</div>

	<!-- Bottom drawer with tabs -->
	<div class="drawer" class:expanded={drawerExpanded}>
		<div
			class="drawer-handle"
			on:click={() => (drawerExpanded = !drawerExpanded)}
			role="button"
			tabindex="0"
			on:keydown={(e) => e.key === 'Enter' && (drawerExpanded = !drawerExpanded)}
		></div>

		<!-- Tabs -->
		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'groups'}
				on:click={() => (activeTab = 'groups')}
			>
				My Groups ({myGroups.length})
			</button>
			<button
				class="tab"
				class:active={activeTab === 'activity'}
				on:click={() => (activeTab = 'activity')}
			>
				Activity ({activeMembers.length})
			</button>
			<button
				class="tab"
				class:active={activeTab === 'nearby'}
				on:click={() => (activeTab = 'nearby')}
			>
				Nearby ({nearbyPlaces.length})
			</button>
		</div>

		<!-- Tab Content -->
		<div class="tab-content">
			<!-- Groups Tab -->
			{#if activeTab === 'groups'}
				<div class="section">
					<h3>My Active Check-ins</h3>
					{#if myActiveCheckIns.length === 0}
						<p class="empty">No active check-ins</p>
					{:else}
						{#each myActiveCheckIns as checkIn}
							<div class="checkin-card">
								<div class="checkin-info">
									<strong>{checkIn.place_name}</strong>
									{#if checkIn.activity_name}
										<span class="activity-badge">{checkIn.activity_name}</span>
									{/if}
									{#if checkIn.group_name}
										<span class="group-name">in {checkIn.group_name}</span>
									{/if}
								</div>
								<button class="checkout-btn" on:click={() => handleCheckOut(checkIn.id)}>
									Check Out
								</button>
							</div>
						{/each}
					{/if}
				</div>

				<div class="section">
					<h3>My Groups</h3>
					{#if myGroups.length === 0}
						<p class="empty">Join or create groups to get started!</p>
					{:else}
						{#each myGroups as membership}
							<div class="group-card">
								<div class="group-info">
									<strong>{membership.group.name}</strong>
									<span class="place-name">📍 {membership.group.place.name}</span>
								</div>
								<span class:active={membership.share_location} class="setting-indicator">
									{membership.share_location ? '🟢' : '⚫'} Sharing
								</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			<!-- Activity Tab -->
			{#if activeTab === 'activity'}
				<div class="section">
					<h3>Who's Around</h3>
					{#if activeMembers.length === 0}
						<p class="empty">No one is checked in right now</p>
					{:else}
						{#each activeMembers as member}
							<div class="member-card">
								<div class="member-info">
									<strong>{member.display_name || member.username}</strong>
									{#if member.activity_name}
										<span class="activity-badge">{member.activity_name}</span>
									{/if}
									<span class="location">at {member.place_name}</span>
									{#if member.group_name}
										<span class="group-tag">{member.group_name}</span>
									{/if}
								</div>
								<span class="time">
									{new Date(member.checked_in_at).toLocaleTimeString([], {
										hour: '2-digit',
										minute: '2-digit'
									})}
								</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			<!-- Nearby Tab -->
			{#if activeTab === 'nearby'}
				<div class="section">
					{#if selectedPlace}
						<button class="back-btn" on:click={() => (selectedPlace = null)}>← Back</button>

						<h2>{selectedPlace.name}</h2>
						{#if selectedPlace.description}
							<p class="description">{selectedPlace.description}</p>
						{/if}

						<div class="place-activities">
							{#each selectedPlace.place_activities || [] as pa}
								<span class="activity-tag">{pa.activity.icon} {pa.activity.name}</span>
							{/each}
						</div>

						<div class="section">
							<div class="section-header">
								<h3>Groups at this place</h3>
								<button class="create-btn" on:click={() => (showCreateGroup = true)}>+</button>
							</div>

							{#if showCreateGroup}
								<div class="create-form">
									<input type="text" placeholder="Group name" bind:value={newGroup.name} />
									<textarea
										placeholder="Description (optional)"
										bind:value={newGroup.description}
									/>
									<label>
										<input type="checkbox" bind:checked={newGroup.is_public} />
										Public group
									</label>
									<label>
										<input type="checkbox" bind:checked={newGroup.auto_checkin_enabled} />
										Auto check-in when in radius
									</label>
									<div class="form-actions">
										<button on:click={handleCreateGroup}>Create</button>
										<button on:click={() => (showCreateGroup = false)}>Cancel</button>
									</div>
								</div>
							{/if}

							{#each selectedPlace.groups || [] as group}
								<div class="group-card">
									<div class="group-info">
										<strong>{group.name}</strong>
										{#if group.description}
											<span class="group-desc">{group.description}</span>
										{/if}
										<span class="member-count">
											{group.group_members?.[0]?.count || 0} members
										</span>
									</div>
									<button class="join-btn" on:click={() => handleJoinGroup(group.id)}>
										Join
									</button>
								</div>
							{/each}
						</div>
					{:else}
						<h3>Nearby Places</h3>
						{#if nearbyPlaces.length === 0}
							<p class="empty">No places nearby</p>
						{:else}
							{#each nearbyPlaces as place}
								<div
									class="place-card"
									on:click={() => selectPlace(place.place_id)}
									role="button"
									tabindex="0"
									on:keydown={(e) => e.key === 'Enter' && selectPlace(place.place_id)}
								>
									<div class="place-info">
										<strong>{place.place_name}</strong>
										<span class="distance">{Math.round(place.distance_meters)}m away</span>
										{#if place.active_members > 0}
											<span class="active-count">{place.active_members} active</span>
										{/if}
									</div>
								</div>
							{/each}
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- <script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from '../map/$types'; // Removed because module does not exist
	import type { RealtimeChannel } from '@supabase/supabase-js';

	import { getNearbyPlaces, getPlaceWithActivities, createPlace, getActivities } from '$lib/places';
	import {
		getMyGroups,
		createGroup,
		joinGroup,
		getGroupsForPlace,
		updateGroupMemberSettings,
		setGroupVisibility,
		getGroupMembers
	} from '$lib/groups';
	import {
		checkIn,
		checkOut,
		getMyActiveCheckIns,
		getActiveMembers,
		autoManageCheckIns
	} from '$lib/checkins';

	export let data: PageData;

	let map: any;
	let L: any;
	let myLocationMarker: any;
	let placeMarkers: Map<string, any> = new Map();
	let memberMarkers: Map<string, any> = new Map();
	let watchId: number | null = null;
	let channel: RealtimeChannel;

	// State
	let myLocation: { lat: number; lng: number } | null = null;
	let nearbyPlaces: any[] = [];
	let myGroups: any[] = [];
	let myActiveCheckIns: any[] = [];
	let activeMembers: any[] = [];
	let allActivities: any[] = [];

	// UI State
	let selectedPlace: any = null;
	let selectedGroup: any = null;
	let showCreatePlace = false;
	let showCreateGroup = false;
	let showGroupSettings = false;
	let activeTab: 'nearby' | 'groups' | 'activity' = 'groups';

	// Forms
	let newPlace = {
		name: '',
		description: '',
		place_type: 'skatepark',
		radius: 100,
		is_public: true,
		selectedActivities: [] as string[]
	};

	let newGroup = {
		name: '',
		description: '',
		is_public: true,
		auto_checkin_enabled: true
	};

	onMount(async () => {
		if (!data.session) {
			window.location.href = '/';
			return;
		}

		// Load Leaflet
		const leafletModule = await import('leaflet');
		L = leafletModule.default;

		// Initialize map
		map = L.map('map').setView([51.5074, -0.1278], 13);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap'
		}).addTo(map);

		// Load initial data
		const { data: activities } = await getActivities(data.supabase);
		allActivities = activities;

		await loadMyGroups();
		startLocationTracking();
		subscribeToCheckIns();
	});

	onDestroy(() => {
		if (watchId !== null) {
			navigator.geolocation.clearWatch(watchId);
		}
		if (channel) {
			channel.unsubscribe();
		}
	});

	function startLocationTracking() {
		if (!navigator.geolocation) {
			alert('Geolocation not supported');
			return;
		}

		watchId = navigator.geolocation.watchPosition(
			async (position) => {
				const { latitude, longitude } = position.coords;
				myLocation = { lat: latitude, lng: longitude };

				// Update my marker
				if (myLocationMarker) {
					myLocationMarker.setLatLng([latitude, longitude]);
				} else if (L && map) {
					myLocationMarker = L.circleMarker([latitude, longitude], {
						radius: 10,
						fillColor: '#4CAF50',
						color: 'white',
						weight: 3,
						fillOpacity: 1
					}).addTo(map);
					map.setView([latitude, longitude], 15);
				}

				// Auto-manage check-ins based on location
				await autoManageCheckIns(data.supabase, latitude, longitude);

				// Load nearby places
				await loadNearbyPlaces(latitude, longitude);

				// Refresh check-ins
				await loadMyActiveCheckIns();
				await loadActiveMembers();
			},
			(error) => console.error('Location error:', error),
			{
				enableHighAccuracy: true,
				maximumAge: 30000,
				timeout: 27000
			}
		);
	}

	async function loadNearbyPlaces(lat: number, lng: number) {
		const { data: places } = await getNearbyPlaces(data.supabase, lat, lng, 500000);
		nearbyPlaces = places || [];
		console.log('🚀 ~ loadNearbyPlaces ~ places:', places);

		// Draw place markers and radii
		if (L && map) {
			// Clear old markers
			placeMarkers.forEach((marker) => marker.remove());
			placeMarkers.clear();

			places?.forEach((place: any) => {
				// Draw radius circle
				const circle = L.circle([place.place_lat, place.place_lng], {
					radius: place.radius || 10000,
					color: '#2196F3',
					fillColor: '#2196F3',
					fillOpacity: 0.1,
					weight: 2
				}).addTo(map);

				// -----------------------------
				// Add marker with click handler
				// const marker = L.marker([place.place_lat, place.place_lng], {
				// 	icon: L.divIcon({
				// 		html: `<div style="background: #2196F3; color: white; padding: 8px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; white-space: nowrap;">
				//   ${place.place_name} ${place.active_members > 0 ? `(${place.active_members})` : ''}
				// </div>`,
				// 		className: '',
				// 		iconSize: [150, 30]
				// 	})
				// })
				// 	.addTo(map)
				// 	.on('click', () => selectPlace(place.place_id));
				// -----------------------------
				// // Add marker with click handler
				// const marker = L.marker([place.place_lat, place.place_lng], {
				// 	icon: L.divIcon({
				// 		html: '0',
				// 		className: '',
				// 		iconSize: [150, 30]
				// 	})
				// })
				// 	.addTo(map)
				// 	.on('click', () => selectPlace(place.place_id));
				// -----------------------------
				// // Add marker with click handler
				const marker = L.marker([place.place_lat, place.place_lng])
					.addTo(map)
					.bindPopup(
						`<div style="color: black;">${place.place_name} ${place.active_members > 0 ? `(${place.active_members})` : ''} </div>`
					)
					.openPopup()
					.on('click', () => selectPlace(place.place_id));
				// -----------------------------

				placeMarkers.set(place.place_id, { marker, circle });
			});
		}
	}

	async function selectPlace(placeId: string) {
		const { data: place } = await getPlaceWithActivities(data.supabase, placeId);
		selectedPlace = place;

		// Load groups for this place
		const { data: groups } = await getGroupsForPlace(data.supabase, placeId);
		selectedPlace.groups = groups;

		activeTab = 'nearby';
	}

	async function loadMyGroups() {
		const { data: groups } = await getMyGroups(data.supabase);
		myGroups = groups || [];
	}

	async function loadMyActiveCheckIns() {
		const { data: checkIns } = await getMyActiveCheckIns(data.supabase);
		myActiveCheckIns = checkIns || [];
	}

	async function loadActiveMembers() {
		const { data: members } = await getActiveMembers(data.supabase);
		activeMembers = members || [];

		// Draw member markers on map
		if (L && map) {
			memberMarkers.forEach((marker) => marker.remove());
			memberMarkers.clear();

			members?.forEach((member: any) => {
				const marker = L.marker([member.place_lat, member.place_lng], {
					icon: L.divIcon({
						html: `<div style="background: #FF9800; color: white; padding: 5px 10px; border-radius: 15px; font-size: 11px; font-weight: bold;">
              ${member.display_name || member.username} ${member.activity_name ? member.activity_name : ''}
            </div>`,
						className: '',
						iconSize: [120, 25]
					})
				}).addTo(map);

				memberMarkers.set(member.checkin_id, marker);
			});
		}
	}

	function subscribeToCheckIns() {
		channel = data.supabase
			.channel('checkin-updates')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'check_ins'
				},
				async () => {
					await loadActiveMembers();
					await loadMyActiveCheckIns();
				}
			)
			.subscribe();
	}

	async function handleCreatePlace() {
		if (!myLocation || !newPlace.name) return;

		const { data: place, error } = await createPlace(data.supabase, {
			name: newPlace.name,
			description: newPlace.description,
			latitude: myLocation.lat,
			longitude: myLocation.lng,
			radius: newPlace.radius,
			place_type: newPlace.place_type,
			is_public: newPlace.is_public
		});

		if (error) {
			alert('Error creating place: ' + error.message);
			return;
		}

		// Link activities
		if (place && newPlace.selectedActivities.length > 0) {
			await data.supabase.from('place_activities').insert(
				newPlace.selectedActivities.map((actId) => ({
					place_id: place.id,
					activity_id: actId
				}))
			);
		}

		showCreatePlace = false;
		newPlace = {
			name: '',
			description: '',
			place_type: 'skatepark',
			radius: 100,
			is_public: true,
			selectedActivities: []
		};

		if (myLocation) {
			await loadNearbyPlaces(myLocation.lat, myLocation.lng);
		}
	}

	async function handleCreateGroup() {
		if (!selectedPlace || !newGroup.name) return;

		const { error } = await createGroup(data.supabase, {
			place_id: selectedPlace.id,
			name: newGroup.name,
			description: newGroup.description,
			is_public: newGroup.is_public,
			auto_checkin_enabled: newGroup.auto_checkin_enabled
		});

		if (error) {
			alert('Error creating group: ' + error.message);
			return;
		}

		showCreateGroup = false;
		newGroup = {
			name: '',
			description: '',
			is_public: true,
			auto_checkin_enabled: true
		};

		await loadMyGroups();
		await selectPlace(selectedPlace.id);
	}

	async function handleJoinGroup(groupId: string) {
		const { error } = await joinGroup(data.supabase, groupId, true);

		if (error) {
			alert('Error joining group: ' + error.message);
			return;
		}

		await loadMyGroups();
		if (selectedPlace) {
			await selectPlace(selectedPlace.id);
		}
	}

	async function handleManualCheckIn(placeId: string, groupId?: string, activityId?: string) {
		const { error } = await checkIn(data.supabase, placeId, groupId, activityId);

		if (error) {
			alert('Error checking in: ' + error);
			return;
		}

		await loadMyActiveCheckIns();
		await loadActiveMembers();
	}

	async function handleCheckOut(checkInId: string) {
		const { error } = await checkOut(data.supabase, checkInId);

		if (error) {
			alert('Error checking out: ' + error.message);
			return;
		}

		await loadMyActiveCheckIns();
		await loadActiveMembers();
	}

	async function signOut() {
		await data.supabase.auth.signOut();
		goto('/');
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div class="container">
	<div id="map"></div>
</div>

<style>
	.container {
		display: flex;
		height: 100%;
		width: 100vw;
	}

	#map {
		flex: 1;
		height: 100%;
	}

	.section {
		margin-bottom: 25px;
	}

	.section h3 {
		margin: 0 0 15px 0;
		font-size: 16px;
		color: #333;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 15px;
	}
</style> -->

<style>
	.map-container {
		position: relative;
		height: 100vh;
		width: 100vw;
		overflow: hidden;
	}

	/* Full screen map header */
	.header {
		height: 100vh;
		height: 100lvh;
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		z-index: 1;
	}

	#map {
		height: 100%;
		width: 100%;
	}

	/* Bottom drawer */
	.drawer {
		margin-top: calc(100vh - 3rem);
		margin-top: calc(100lvh - 3rem);
		position: relative;
		z-index: 10;
		background: #000;
		border-top-left-radius: 20px;
		border-top-right-radius: 20px;
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
		min-height: calc(100vh - 3rem);
		min-height: calc(100lvh - 3rem);
		transition: margin-top 0.3s ease-out;
	}

	.drawer.expanded {
		margin-top: 20vh;
		margin-top: 20lvh;
	}

	.drawer-handle {
		width: 40px;
		height: 4px;
		background: #333;
		border-radius: 2px;
		margin: 12px auto 0;
		cursor: pointer;
		transition: background 0.2s;
	}

	.drawer-handle:hover {
		background: #666;
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: 8px;
		padding: 16px 16px 0;
		margin: 16px 0;
		border-bottom: 1px solid #1a1a1a;
		position: sticky;
		top: 0;
		background: #000;
		z-index: 50;
	}

	.tab {
		flex: 1;
		background: transparent;
		border: none;
		color: #666;
		font-size: 14px;
		font-weight: 600;
		padding: 12px 16px;
		cursor: pointer;
		border-radius: 8px;
		transition: all 0.2s;
	}

	.tab.active {
		background: #0a0a0a;
		color: #fff;
	}

	/* Tab Content */
	.tab-content {
		padding: 16px;
		overflow-y: auto;
		max-height: calc(100vh - 150px);
		max-height: calc(100lvh - 150px);
	}

	.drawer.expanded .tab-content {
		max-height: calc(80vh - 150px);
		max-height: calc(80lvh - 150px);
	}

	.section {
		margin-bottom: 25px;
	}

	.section h3 {
		margin: 0 0 15px 0;
		font-size: 16px;
		color: #fff;
	}

	.section h2 {
		font-size: 22px;
		color: #fff;
		margin: 0 0 10px 0;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 15px;
	}

	.empty {
		color: #666;
		font-size: 14px;
		text-align: center;
		padding: 20px;
	}

	/* Cards */
	.checkin-card,
	.group-card,
	.member-card,
	.place-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		padding: 12px;
		margin-bottom: 10px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.checkin-card:hover,
	.group-card:hover,
	.member-card:hover,
	.place-card:hover {
		border-color: #fc4c02;
	}

	.checkin-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.checkin-info,
	.group-info,
	.member-info,
	.place-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.checkin-info strong,
	.group-info strong,
	.member-info strong,
	.place-info strong {
		color: #fff;
		font-size: 14px;
	}

	.activity-badge {
		display: inline-block;
		background: #ff9800;
		color: white;
		padding: 3px 8px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 600;
	}

	.group-name,
	.place-name,
	.location {
		font-size: 12px;
		color: #666;
	}

	.checkout-btn,
	.join-btn {
		padding: 6px 12px;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		font-weight: 600;
	}

	.setting-indicator {
		font-size: 12px;
		color: #666;
	}

	.setting-indicator.active {
		color: #4caf50;
	}

	.distance,
	.member-count {
		font-size: 12px;
		color: #2196f3;
	}

	.active-count {
		font-size: 12px;
		color: #ff9800;
		font-weight: 600;
	}

	.time {
		font-size: 11px;
		color: #999;
	}

	.group-tag,
	.activity-tag {
		display: inline-block;
		padding: 4px 8px;
		background: #1a1a1a;
		border-radius: 4px;
		font-size: 11px;
		margin-right: 5px;
		margin-top: 5px;
		color: #999;
	}

	.description {
		font-size: 14px;
		color: #999;
		margin-bottom: 15px;
	}

	.place-activities {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 20px;
	}

	.back-btn {
		padding: 8px 15px;
		background: #1a1a1a;
		border: none;
		border-radius: 4px;
		color: #fff;
		cursor: pointer;
		margin-bottom: 15px;
		font-size: 14px;
	}

	.create-btn {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: none;
		background: #4caf50;
		color: white;
		font-size: 20px;
		cursor: pointer;
	}

	.create-form {
		background: #0a0a0a;
		padding: 15px;
		border-radius: 8px;
		margin-bottom: 15px;
	}

	.create-form input[type='text'],
	.create-form textarea {
		width: 100%;
		padding: 10px;
		margin-bottom: 10px;
		border: 1px solid #333;
		border-radius: 4px;
		font-size: 14px;
		background: #000;
		color: #fff;
	}

	.create-form textarea {
		resize: vertical;
		min-height: 60px;
	}

	.create-form label {
		display: block;
		margin-bottom: 10px;
		font-size: 13px;
		color: #fff;
	}

	.form-actions {
		display: flex;
		gap: 10px;
		margin-top: 10px;
	}

	.form-actions button {
		flex: 1;
		padding: 10px;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
	}

	.form-actions button:first-child {
		background: #4caf50;
		color: white;
	}

	.form-actions button:last-child {
		background: #1a1a1a;
		color: #fff;
	}

	/* Leaflet overrides for dark theme */
	:global(.leaflet-container) {
		background: #000;
	}
</style>
