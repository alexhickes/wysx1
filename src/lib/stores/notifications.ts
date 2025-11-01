import { writable, derived } from 'svelte/store';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface Notification {
	id: string;
	type: 'checkin' | 'invitation' | 'friend_request';
	title: string;
	message: string;
	data?: any;
	read: boolean;
	created_at: string;
}

function createNotificationStore() {
	const { subscribe, update } = writable<Notification[]>([]);
	let channel: RealtimeChannel | null = null;

	return {
		subscribe,

		// Initialize realtime subscriptions
		init: (supabase: SupabaseClient, userId: string) => {
			console.log('🔔 Initializing notification subscriptions...');

			// Clean up existing channel
			if (channel) {
				supabase.removeChannel(channel);
			}

			// Subscribe to group invitations
			channel = supabase
				.channel('notifications')
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'group_invitations',
						filter: `invitee_id=eq.${userId}`
					},
					async (payload) => {
						console.log('📨 New group invitation:', payload);

						// Fetch related data
						const { data: inviter } = await supabase
							.from('profiles')
							.select('username, display_name')
							.eq('id', payload.new.inviter_id)
							.single();

						const { data: group } = await supabase
							.from('groups')
							.select('name')
							.eq('id', payload.new.group_id)
							.single();

						const displayName = inviter?.display_name || inviter?.username || 'Someone';

						// Add to notifications
						update((notifications) => [
							{
								id: payload.new.id,
								type: 'invitation',
								title: 'New Group Invitation',
								message: `${displayName} invited you to join ${group?.name}`,
								data: {
									groupId: payload.new.group_id,
									invitationId: payload.new.id
								},
								read: false,
								created_at: payload.new.created_at
							},
							...notifications
						]);
					}
				)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'check_ins'
						// Filter for check-ins in groups you're a member of
					},
					async (payload) => {
						console.log('📍 New check-in:', payload);

						// Check if this check-in is in a group you're in
						const { data: membership } = await supabase
							.from('group_members')
							.select('group_id')
							.eq('user_id', userId)
							.eq('group_id', payload.new.group_id)
							.single();

						if (!membership || payload.new.user_id === userId) {
							return; // Not in this group or it's your own check-in
						}

						// Fetch user and place details
						const { data: user } = await supabase
							.from('profiles')
							.select('username, display_name')
							.eq('id', payload.new.user_id)
							.single();

						const { data: place } = await supabase
							.from('places')
							.select('name')
							.eq('id', payload.new.place_id)
							.single();

						const displayName = user?.display_name || user?.username || 'Someone';

						update((notifications) => [
							{
								id: payload.new.id,
								type: 'checkin',
								title: `${displayName} checked in`,
								message: `${displayName} is at ${place?.name}`,
								data: {
									placeId: payload.new.place_id,
									checkInId: payload.new.id
								},
								read: false,
								created_at: payload.new.checked_in_at
							},
							...notifications
						]);
					}
				)
				.subscribe((status) => {
					console.log('Notification subscription status:', status);
				});
		},

		// Mark notification as read
		markAsRead: (id: string) => {
			update((notifications) => notifications.map((n) => (n.id === id ? { ...n, read: true } : n)));
		},

		// Clear all notifications
		clear: () => {
			update(() => []);
		},

		// Cleanup
		cleanup: (supabase: SupabaseClient) => {
			if (channel) {
				supabase.removeChannel(channel);
				channel = null;
			}
		}
	};
}

export const notifications = createNotificationStore();

// Derived store for unread count
export const unreadCount = derived(
	notifications,
	($notifications) => $notifications.filter((n) => !n.read).length
);
