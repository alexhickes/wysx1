import { writable } from 'svelte/store';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface FriendCheckIn {
	id: string;
	user_id: string;
	place_id: string;
	group_id: string;
	checked_in_at: string;
	checked_out_at: string | null;
	activity_id: string | null;
	places: {
		id: string;
		name: string;
		place_type: string;
		latitude: number;
		longitude: number;
	} | null;
	profiles: {
		id: string;
		username: string;
		display_name: string | null;
	} | null;
	groups: {
		id: string;
		name: string;
	} | null;
	activities: {
		id: string;
		name: string;
		icon: string | null;
	} | null;
}

export interface PlaceGroup {
	place: {
		id: string;
		name: string;
		place_type: string;
		latitude: number;
		longitude: number;
	};
	checkIns: FriendCheckIn[];
}

function createCheckInsStore() {
	const { subscribe, set, update } = writable<FriendCheckIn[]>([]);
	let channel: RealtimeChannel | null = null;

	return {
		subscribe,

		// Initialize with current data and set up real-time subscription
		init: async (supabase: SupabaseClient, userId: string) => {
			console.log('🔄 Initializing check-ins store...');

			// Load initial data
			const { data: initialCheckIns, error } = await supabase
				.from('check_ins')
				.select(
					`
					id,
					user_id,
					place_id,
					group_id,
					checked_in_at,
					checked_out_at,
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
				.neq('user_id', userId);

			if (error) {
				console.error('Error loading initial check-ins:', error);
				set([]);
			} else {
				console.log('✓ Loaded initial check-ins:', initialCheckIns?.length);
				set(initialCheckIns || []);
			}

			// Clean up existing channel
			if (channel) {
				supabase.removeChannel(channel);
			}

			// Subscribe to real-time changes
			channel = supabase
				.channel('friend-checkins')
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'check_ins'
					},
					async (payload) => {
						console.log('📍 New check-in detected:', payload.new);

						// Don't show our own check-ins
						if (payload.new.user_id === userId) {
							console.log('Skipping own check-in');
							return;
						}

						// Fetch complete check-in data with relations
						const { data: newCheckIn, error } = await supabase
							.from('check_ins')
							.select(
								`
								id,
								user_id,
								place_id,
								group_id,
								checked_in_at,
								checked_out_at,
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
							.eq('id', payload.new.id)
							.single();

						if (error) {
							console.error('Error fetching new check-in details:', error);
							return;
						}

						if (!newCheckIn) return;

						console.log('✓ Adding new check-in to store:', newCheckIn);

						// Add to store if still active
						if (!newCheckIn.checked_out_at) {
							update((checkIns) => [newCheckIn as FriendCheckIn, ...checkIns]);
						}
					}
				)
				.on(
					'postgres_changes',
					{
						event: 'UPDATE',
						schema: 'public',
						table: 'check_ins'
					},
					async (payload) => {
						console.log('📝 Check-in updated:', payload.new);

						// If checked out, remove from active list
						if (payload.new.checked_out_at) {
							console.log('✓ Removing checked-out user:', payload.new.id);
							update((checkIns) => checkIns.filter((c) => c.id !== payload.new.id));
						} else {
							// Update existing check-in (e.g., activity changed)
							const { data: updatedCheckIn } = await supabase
								.from('check_ins')
								.select(
									`
									id,
									user_id,
									place_id,
									group_id,
									checked_in_at,
									checked_out_at,
									activity_id,
									places(*),
									profiles(*),
									groups(*),
									activities(*)
								`
								)
								.eq('id', payload.new.id)
								.single();

							if (updatedCheckIn) {
								update((checkIns) =>
									checkIns.map((c) =>
										c.id === payload.new.id ? (updatedCheckIn as FriendCheckIn) : c
									)
								);
							}
						}
					}
				)
				.on(
					'postgres_changes',
					{
						event: 'DELETE',
						schema: 'public',
						table: 'check_ins'
					},
					(payload) => {
						console.log('🗑️ Check-in deleted:', payload.old.id);
						update((checkIns) => checkIns.filter((c) => c.id !== payload.old.id));
					}
				)
				.subscribe((status) => {
					console.log('Check-ins subscription status:', status);
				});
		},

		// Cleanup
		cleanup: (supabase: SupabaseClient) => {
			if (channel) {
				console.log('🧹 Cleaning up check-ins subscription');
				supabase.removeChannel(channel);
				channel = null;
			}
		}
	};
}

export const friendCheckIns = createCheckInsStore();

// Helper function to group check-ins by place
export function groupCheckInsByPlace(checkIns: FriendCheckIn[]): PlaceGroup[] {
	const placeGroups = new Map<string, PlaceGroup>();

	checkIns.forEach((checkIn) => {
		if (!checkIn.places) return;

		const placeId = checkIn.place_id;
		if (!placeGroups.has(placeId)) {
			placeGroups.set(placeId, {
				place: checkIn.places,
				checkIns: []
			});
		}
		placeGroups.get(placeId)!.checkIns.push(checkIn);
	});

	// Sort by number of people (most popular first)
	return Array.from(placeGroups.values()).sort((a, b) => b.checkIns.length - a.checkIns.length);
}
