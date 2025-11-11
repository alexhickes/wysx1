// src/lib/friendships.ts
// Helper functions for managing friendships with symmetric design + Realtime

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { MyFriend, PendingRequestReceived, PendingRequestSent } from './types';

/**
 * Helper to normalize UUIDs (ensures smaller UUID is always first)
 * This is required for the symmetric friendship design
 */
export function normalizeUserIds(userId1: string, userId2: string): [string, string] {
	return userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
}

/**
 * Setup realtime subscription for friendship changes
 * This handles both INSERT and UPDATE events on the friendships table
 */
export function subscribeFriendshipChanges(
	supabase: SupabaseClient,
	currentUserId: string,
	onFriendshipChange: () => void
): RealtimeChannel {
	const channel = supabase
		.channel('friendship-realtime')
		.on(
			'postgres_changes',
			{
				event: '*', // Listen to INSERT, UPDATE, DELETE
				schema: 'public',
				table: 'friendships',
				// Filter: match rows where current user is either user_id_1 or user_id_2
				filter: `user_id_1=eq.${currentUserId}`
			},
			(payload) => {
				console.log('🔔 Friendship change (user_id_1):', payload);
				onFriendshipChange();
			}
		)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'friendships',
				filter: `user_id_2=eq.${currentUserId}`
			},
			(payload) => {
				console.log('🔔 Friendship change (user_id_2):', payload);
				onFriendshipChange();
			}
		)
		.subscribe((status) => {
			console.log('📡 Realtime subscription status:', status);
		});

	return channel;
}

/**
 * Cleanup realtime subscription
 */
export function unsubscribeFriendshipChanges(
	supabase: SupabaseClient,
	channel: RealtimeChannel
): void {
	supabase.removeChannel(channel);
}

/**
 * Send a friend request
 */
export async function sendFriendRequest(
	supabase: SupabaseClient,
	currentUserId: string,
	friendUsername: string
): Promise<{ success: boolean; error?: string }> {
	try {
		// Find friend by username
		const { data: friendProfile, error: findError } = await supabase
			.from('profiles')
			.select('id')
			.eq('username', friendUsername.trim())
			.single();

		if (findError || !friendProfile) {
			return { success: false, error: 'User not found' };
		}

		if (friendProfile.id === currentUserId) {
			return { success: false, error: "You can't add yourself as a friend" };
		}

		// Check if blocked
		const { data: blockData } = await supabase
			.from('user_blocks')
			.select('*')
			.or(
				`and(blocker_id.eq.${currentUserId},blocked_id.eq.${friendProfile.id}),` +
					`and(blocker_id.eq.${friendProfile.id},blocked_id.eq.${currentUserId})`
			)
			.limit(1);

		if (blockData && blockData.length > 0) {
			return { success: false, error: 'Cannot send friend request' };
		}

		// Normalize IDs for symmetric design
		const [user_id_1, user_id_2] = normalizeUserIds(currentUserId, friendProfile.id);

		// Check if friendship already exists
		const { data: existing } = await supabase
			.from('friendships')
			.select('*')
			.eq('user_id_1', user_id_1)
			.eq('user_id_2', user_id_2)
			.single();

		if (existing) {
			if (existing.status === 'accepted') {
				return { success: false, error: 'Already friends' };
			} else if (existing.status === 'pending') {
				return { success: false, error: 'Friend request already sent' };
			}
			// If rejected, we can try again by updating
			const { error: updateError } = await supabase
				.from('friendships')
				.update({
					status: 'pending',
					initiated_by: currentUserId,
					created_at: new Date().toISOString()
				})
				.eq('user_id_1', user_id_1)
				.eq('user_id_2', user_id_2);

			if (updateError) {
				return { success: false, error: updateError.message };
			}
			return { success: true };
		}

		// Insert new friendship request
		const { error: insertError } = await supabase.from('friendships').insert({
			user_id_1,
			user_id_2,
			initiated_by: currentUserId,
			status: 'pending'
		});

		if (insertError) {
			return { success: false, error: insertError.message };
		}

		return { success: true };
	} catch (error: any) {
		return { success: false, error: error.message || 'An error occurred' };
	}
}

/**
 * Get all accepted friends using the view
 */
export async function getFriends(supabase: SupabaseClient): Promise<MyFriend[]> {
	const { data, error } = await supabase
		.from('my_friends')
		.select('*')
		.order('friends_since', { ascending: false });

	if (error) {
		console.error('Error fetching friends:', error);
		return [];
	}

	return data || [];
}

/**
 * Get pending friend requests I received
 */
export async function getPendingRequestsReceived(
	supabase: SupabaseClient
): Promise<PendingRequestReceived[]> {
	const { data, error } = await supabase
		.from('pending_requests_received')
		.select('*')
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error fetching pending requests:', error);
		return [];
	}

	return data || [];
}

/**
 * Get pending friend requests I sent
 */
export async function getPendingRequestsSent(
	supabase: SupabaseClient
): Promise<PendingRequestSent[]> {
	const { data, error } = await supabase
		.from('pending_requests_sent')
		.select('*')
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error fetching sent requests:', error);
		return [];
	}

	return data || [];
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(
	supabase: SupabaseClient,
	currentUserId: string,
	requesterId: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const [user_id_1, user_id_2] = normalizeUserIds(currentUserId, requesterId);

		const { error } = await supabase
			.from('friendships')
			.update({
				status: 'accepted',
				accepted_at: new Date().toISOString()
			})
			.eq('user_id_1', user_id_1)
			.eq('user_id_2', user_id_2)
			.eq('status', 'pending')
			.neq('initiated_by', currentUserId); // Ensure we're the recipient

		if (error) {
			return { success: false, error: error.message };
		}

		return { success: true };
	} catch (error: any) {
		return { success: false, error: error.message || 'An error occurred' };
	}
}

/**
 * Reject a friend request
 */
export async function rejectFriendRequest(
	supabase: SupabaseClient,
	currentUserId: string,
	requesterId: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const [user_id_1, user_id_2] = normalizeUserIds(currentUserId, requesterId);

		const { error } = await supabase
			.from('friendships')
			.update({ status: 'rejected' })
			.eq('user_id_1', user_id_1)
			.eq('user_id_2', user_id_2)
			.eq('status', 'pending')
			.neq('initiated_by', currentUserId);

		if (error) {
			return { success: false, error: error.message };
		}

		return { success: true };
	} catch (error: any) {
		return { success: false, error: error.message || 'An error occurred' };
	}
}

/**
 * Remove a friend or cancel a friend request
 */
export async function removeFriend(
	supabase: SupabaseClient,
	currentUserId: string,
	friendId: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const [user_id_1, user_id_2] = normalizeUserIds(currentUserId, friendId);

		const { error } = await supabase
			.from('friendships')
			.delete()
			.eq('user_id_1', user_id_1)
			.eq('user_id_2', user_id_2);

		if (error) {
			return { success: false, error: error.message };
		}

		return { success: true };
	} catch (error: any) {
		return { success: false, error: error.message || 'An error occurred' };
	}
}

/**
 * Block a user
 */
export async function blockUser(
	supabase: SupabaseClient,
	currentUserId: string,
	userToBlockId: string
): Promise<{ success: boolean; error?: string }> {
	try {
		// Remove any existing friendship first
		await removeFriend(supabase, currentUserId, userToBlockId);

		// Add to blocks
		const { error } = await supabase.from('user_blocks').insert({
			blocker_id: currentUserId,
			blocked_id: userToBlockId
		});

		if (error) {
			return { success: false, error: error.message };
		}

		return { success: true };
	} catch (error: any) {
		return { success: false, error: error.message || 'An error occurred' };
	}
}

/**
 * Unblock a user
 */
export async function unblockUser(
	supabase: SupabaseClient,
	currentUserId: string,
	userToUnblockId: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const { error } = await supabase
			.from('user_blocks')
			.delete()
			.eq('blocker_id', currentUserId)
			.eq('blocked_id', userToUnblockId);

		if (error) {
			return { success: false, error: error.message };
		}

		return { success: true };
	} catch (error: any) {
		return { success: false, error: error.message || 'An error occurred' };
	}
}

/**
 * Get blocked users
 */
export async function getBlockedUsers(supabase: SupabaseClient) {
	const { data, error } = await supabase
		.from('user_blocks')
		.select(
			`
      blocked_id,
      created_at,
      blocked_user:profiles!user_blocks_blocked_id_fkey(
        id,
        username,
        display_name
      )
    `
		)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error fetching blocked users:', error);
		return [];
	}

	return data || [];
}

/**
 * Check if a user is your friend
 */
export async function isFriend(
	supabase: SupabaseClient,
	currentUserId: string,
	otherUserId: string
): Promise<boolean> {
	const [user_id_1, user_id_2] = normalizeUserIds(currentUserId, otherUserId);

	const { data } = await supabase
		.from('friendships')
		.select('status')
		.eq('user_id_1', user_id_1)
		.eq('user_id_2', user_id_2)
		.single();

	return data?.status === 'accepted';
}

/**
 * Get friendship status between two users
 */
export async function getFriendshipStatus(
	supabase: SupabaseClient,
	currentUserId: string,
	otherUserId: string
): Promise<'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked'> {
	// Check if blocked
	const { data: blockData } = await supabase
		.from('user_blocks')
		.select('*')
		.or(
			`and(blocker_id.eq.${currentUserId},blocked_id.eq.${otherUserId}),` +
				`and(blocker_id.eq.${otherUserId},blocked_id.eq.${currentUserId})`
		)
		.limit(1);

	if (blockData && blockData.length > 0) {
		return 'blocked';
	}

	// Check friendship
	const [user_id_1, user_id_2] = normalizeUserIds(currentUserId, otherUserId);

	const { data } = await supabase
		.from('friendships')
		.select('*')
		.eq('user_id_1', user_id_1)
		.eq('user_id_2', user_id_2)
		.single();

	if (!data) {
		return 'none';
	}

	if (data.status === 'accepted') {
		return 'accepted';
	}

	if (data.status === 'pending') {
		return data.initiated_by === currentUserId ? 'pending_sent' : 'pending_received';
	}

	return 'none';
}
