import type { SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { queueCheckIn, queueCheckOut } from './offlineQueue';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

interface Place {
	id: string;
	name: string;
	latitude: number;
	longitude: number;
	radius: number;
}

interface ActiveCheckIn {
	id: string;
	place_id: string;
	group_id?: string;
}

let watchId: number | null = null;
let currentCheckIns: Map<string, ActiveCheckIn> = new Map();
let isProcessing = false;

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	// Haversine formula
	const R = 6371e3; // Earth radius in meters
	const φ1 = (lat1 * Math.PI) / 180;
	const φ2 = (lat2 * Math.PI) / 180;
	const Δφ = ((lat2 - lat1) * Math.PI) / 180;
	const Δλ = ((lon2 - lon1) * Math.PI) / 180;

	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c; // Distance in meters
}

export function checkNearbyFriends(
	myLocation: { latitude: number; longitude: number },
	friendLocations: Map<string, any>,
	radiusMeters: number = 500
): string[] {
	const nearby: string[] = [];

	friendLocations.forEach((location, friendId) => {
		const distance = calculateDistance(
			myLocation.latitude,
			myLocation.longitude,
			location.latitude,
			location.longitude
		);

		if (distance <= radiusMeters) {
			nearby.push(friendId);
		}
	});

	return nearby;
}

/**
 * Check if user is within a place's geofence
 */
function isWithinGeofence(userLat: number, userLon: number, place: Place): boolean {
	const distance = calculateDistance(userLat, userLon, place.latitude, place.longitude);
	return distance <= place.radius;
}

/**
 * Process automatic check-in
 */
async function processCheckIn(
	supabase: SupabaseClient,
	userId: string,
	place: Place,
	latitude: number,
	longitude: number
): Promise<void> {
	try {
		// Check if already checked in to this place
		if (currentCheckIns.has(place.id)) {
			return;
		}

		// Get user's groups for this place
		const { data: groups, error: groupsError } = await supabase
			.from('group_members')
			.select(
				`
        group_id,
        groups!inner(
          id,
          place_id,
          auto_checkin_enabled,
          notification_enabled
        )
      `
			)
			.eq('user_id', userId)
			.eq('groups.place_id', place.id)
			.eq('share_location', true);

		if (groupsError) throw groupsError;

		if (!groups || groups.length === 0) {
			console.log(`No groups found for place ${place.id}`);
			return;
		}

		// Filter to auto-checkin enabled groups
		const autoCheckinGroups = groups.filter((g) => g.groups.auto_checkin_enabled);

		if (autoCheckinGroups.length === 0) {
			console.log(`No auto-checkin groups for place ${place.id}`);
			return;
		}

		// Create check-ins for each group
		for (const group of autoCheckinGroups) {
			const checkInData = {
				user_id: userId,
				place_id: place.id,
				group_id: group.group_id,
				check_in_type: 'auto',
				latitude,
				longitude
			};

			if (navigator.onLine) {
				// Online - create check-in directly
				const { data: checkIn, error: checkInError } = await supabase
					.from('check_ins')
					.insert(checkInData)
					.select()
					.single();

				if (checkInError) throw checkInError;

				// Store active check-in
				currentCheckIns.set(place.id, {
					id: checkIn.id,
					place_id: place.id,
					group_id: group.group_id
				});

				// Trigger notification edge function if notifications are enabled
				if (group.groups.notification_enabled) {
					await triggerCheckInNotification(supabase, checkIn.id, userId, place, group.group_id);
				}

				console.log(`Checked in to ${place.name} (group: ${group.group_id})`);
			} else {
				// Offline - queue for later
				const session = await supabase.auth.getSession();
				const accessToken = session.data.session?.access_token;

				if (accessToken) {
					await queueCheckIn(supabase.supabaseUrl, accessToken, checkInData);
					console.log(`Queued check-in to ${place.name} for later`);
				}
			}
		}
	} catch (error) {
		console.error('Error processing check-in:', error);
	}
}

/**
 * Process automatic check-out
 */
async function processCheckOut(supabase: SupabaseClient, placeId: string): Promise<void> {
	try {
		const checkIn = currentCheckIns.get(placeId);
		if (!checkIn) return;

		if (navigator.onLine) {
			// Online - update check-out time directly
			const { error } = await supabase
				.from('check_ins')
				.update({ checked_out_at: new Date().toISOString() })
				.eq('id', checkIn.id);

			if (error) throw error;

			console.log(`Checked out from place ${placeId}`);
		} else {
			// Offline - queue for later
			const session = await supabase.auth.getSession();
			const accessToken = session.data.session?.access_token;

			if (accessToken) {
				await queueCheckOut(PUBLIC_SUPABASE_URL, accessToken, checkIn.id);
				console.log(`Queued check-out from place ${placeId} for later`);
			}
		}

		// Remove from active check-ins
		currentCheckIns.delete(placeId);
	} catch (error) {
		console.error('Error processing check-out:', error);
	}
}

/**
 * Trigger check-in notification via edge function
 */
async function triggerCheckInNotification(
	supabase: SupabaseClient,
	checkInId: string,
	userId: string,
	place: Place,
	groupId: string
): Promise<void> {
	try {
		// Get user profile
		const { data: profile } = await supabase
			.from('profiles')
			.select('username, display_name')
			.eq('id', userId)
			.single();

		if (!profile) return;

		// Call edge function
		const { error } = await supabase.functions.invoke('send-checkin-notification', {
			body: {
				check_in_id: checkInId,
				user_id: userId,
				place_id: place.id,
				group_id: groupId,
				place_name: place.name,
				user_display_name: profile.display_name,
				user_username: profile.username,
				check_in_type: 'auto'
			}
		});

		if (error) {
			console.error('Error triggering notification:', error);
		}
	} catch (error) {
		console.error('Error in notification trigger:', error);
	}
}

/**
 * Handle position update
 */
async function handlePositionUpdate(
	supabase: SupabaseClient,
	userId: string,
	position: GeolocationPosition
): Promise<void> {
	if (isProcessing) return;
	isProcessing = true;

	try {
		const { latitude, longitude, accuracy } = position.coords;

		// Update user's current location
		await supabase.from('locations').upsert({
			user_id: userId,
			latitude,
			longitude,
			accuracy,
			updated_at: new Date().toISOString()
		});

		// Get all places user might be interested in
		const { data: places, error: placesError } = await supabase
			.from('places')
			.select('id, name, latitude, longitude, radius')
			.eq('is_public', true);

		if (placesError) throw placesError;

		if (!places || places.length === 0) {
			isProcessing = false;
			return;
		}

		// Check which places user is within
		const placesWithin = places.filter((place) => isWithinGeofence(latitude, longitude, place));

		// Check-in to new places
		for (const place of placesWithin) {
			if (!currentCheckIns.has(place.id)) {
				await processCheckIn(supabase, userId, place, latitude, longitude);
			}
		}

		// Check-out from places no longer within
		const currentPlaceIds = new Set(placesWithin.map((p) => p.id));
		for (const [placeId] of currentCheckIns) {
			if (!currentPlaceIds.has(placeId)) {
				await processCheckOut(supabase, placeId);
			}
		}
	} catch (error) {
		console.error('Error handling position update:', error);
	} finally {
		isProcessing = false;
	}
}

/**
 * Start geofencing
 */
export function startGeofencing(supabase: SupabaseClient, userId: string): void {
	if (!browser || !('geolocation' in navigator)) {
		console.error('Geolocation not supported');
		return;
	}

	if (watchId !== null) {
		console.log('Geofencing already active');
		return;
	}

	watchId = navigator.geolocation.watchPosition(
		(position) => handlePositionUpdate(supabase, userId, position),
		(error) => console.error('Geolocation error:', error),
		{
			enableHighAccuracy: true,
			maximumAge: 30000, // 30 seconds
			timeout: 27000 // 27 seconds
		}
	);

	console.log('Geofencing started');
}

/**
 * Stop geofencing
 */
export function stopGeofencing(): void {
	if (!browser) return;

	if (watchId !== null) {
		navigator.geolocation.clearWatch(watchId);
		watchId = null;
		console.log('Geofencing stopped');
	}
}

/**
 * Get current check-ins
 */
export function getCurrentCheckIns(): ActiveCheckIn[] {
	return Array.from(currentCheckIns.values());
}

/**
 * Load existing active check-ins from database
 */
export async function loadActiveCheckIns(supabase: SupabaseClient, userId: string): Promise<void> {
	try {
		const { data, error } = await supabase
			.from('check_ins')
			.select('id, place_id, group_id')
			.eq('user_id', userId)
			.is('checked_out_at', null);

		if (error) throw error;

		if (data) {
			currentCheckIns.clear();
			data.forEach((checkIn) => {
				currentCheckIns.set(checkIn.place_id, {
					id: checkIn.id,
					place_id: checkIn.place_id,
					group_id: checkIn.group_id
				});
			});
			console.log(`Loaded ${data.length} active check-in(s)`);
		}
	} catch (error) {
		console.error('Error loading active check-ins:', error);
	}
}
