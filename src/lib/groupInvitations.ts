// src/lib/groupInvitations.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface GroupInvitation {
	id: string;
	group_id: string;
	inviter_id: string;
	invitee_id: string;
	status: 'pending' | 'accepted' | 'declined';
	created_at: string;
	updated_at: string;
}

export interface InvitableFriend {
	user_id: string;
	username: string;
	display_name: string | null;
	already_invited: boolean;
	is_member: boolean;
}

/**
 * Get list of friends that can be invited to a group
 */
export async function getInvitableFriends(
	supabase: SupabaseClient,
	groupId: string
): Promise<{ data: InvitableFriend[] | null; error: any }> {
	const { data, error } = await supabase.rpc('get_invitable_friends', {
		p_group_id: groupId
	});

	return { data, error };
}

/**
 * Send group invitation to a user
 */
export async function sendGroupInvitation(
	supabase: SupabaseClient,
	groupId: string,
	inviteeId: string
): Promise<{ data: any; error: any }> {
	const { data: session } = await supabase.auth.getSession();

	if (!session.session) {
		return { data: null, error: { message: 'Not authenticated' } };
	}

	const { data, error } = await supabase
		.from('group_invitations')
		.insert({
			group_id: groupId,
			inviter_id: session.session.user.id,
			invitee_id: inviteeId,
			status: 'pending'
		})
		.select()
		.single();

	return { data, error };
}

/**
 * Cancel a pending invitation
 */
export async function cancelGroupInvitation(
	supabase: SupabaseClient,
	invitationId: string
): Promise<{ error: any }> {
	const { error } = await supabase
		.from('group_invitations')
		.delete()
		.eq('id', invitationId)
		.eq('status', 'pending');

	return { error };
}

/**
 * Get pending invitations sent by current user for a group
 */
export async function getGroupInvitations(
	supabase: SupabaseClient,
	groupId: string
): Promise<{ data: any[] | null; error: any }> {
	const { data, error } = await supabase
		.from('group_invitations')
		.select(
			`
      id,
      invitee_id,
      status,
      created_at,
      invitee:profiles!group_invitations_invitee_id_fkey(
        id,
        username,
        display_name
      )
    `
		)
		.eq('group_id', groupId)
		.eq('status', 'pending')
		.order('created_at', { ascending: false });

	return { data, error };
}

/**
 * Get my pending invitations (invitations sent to me)
 */
export async function getMyPendingInvitations(
	supabase: SupabaseClient
): Promise<{ data: any[] | null; error: any }> {
	const { data: session } = await supabase.auth.getSession();

	if (!session.session) {
		return { data: null, error: { message: 'Not authenticated' } };
	}

	const { data, error } = await supabase
		.from('group_invitations')
		.select(
			`
    id,
    group_id,
    inviter_id,
    created_at,
    groups(
      id,
      name,
      description,
      is_public,
      group_places(
        place_id,
        is_primary,
        places(
          id,
          name,
          place_type
        )
      )
    ),
    inviter:profiles!group_invitations_inviter_id_fkey(
      id,
      username,
      display_name
    )
  `
		)
		.eq('invitee_id', session.session.user.id)
		.eq('status', 'pending')
		.order('created_at', { ascending: false });

	return { data, error };

	// const { data, error } = await supabase
	// 	.from('group_invitations')
	// 	.select(
	// 		`
	//   id,
	//   group_id,
	//   inviter_id,
	//   created_at,
	//   groups(
	//     id,
	//     name,
	//     description,
	//     is_public,
	//     place:places(
	//       id,
	//       name,
	//       place_type
	//     )
	//   ),
	//   inviter:profiles!group_invitations_inviter_id_fkey(
	//     id,
	//     username,
	//     display_name
	//   )
	// `
	// 	)
	// 	.eq('invitee_id', session.session.user.id)
	// 	.eq('status', 'pending')
	// 	.order('created_at', { ascending: false });

	// return { data, error };
}

/**
 * Accept a group invitation
 */
export async function acceptGroupInvitation(
	supabase: SupabaseClient,
	invitationId: string
): Promise<{ data: any; error: any }> {
	const { data, error } = await supabase.rpc('accept_group_invitation', {
		p_invitation_id: invitationId
	});

	return { data, error };
}

/**
 * Decline a group invitation
 */
export async function declineGroupInvitation(
	supabase: SupabaseClient,
	invitationId: string
): Promise<{ data: any; error: any }> {
	const { data, error } = await supabase.rpc('decline_group_invitation', {
		p_invitation_id: invitationId
	});

	return { data, error };
}

/**
 * Get count of pending invitations for current user
 */
export async function getPendingInvitationCount(
	supabase: SupabaseClient
): Promise<{ count: number; error: any }> {
	const { data: session } = await supabase.auth.getSession();

	if (!session.session) {
		return { count: 0, error: { message: 'Not authenticated' } };
	}

	const { count, error } = await supabase
		.from('group_invitations')
		.select('*', { count: 'exact', head: true })
		.eq('invitee_id', session.session.user.id)
		.eq('status', 'pending');

	return { count: count || 0, error };
}
