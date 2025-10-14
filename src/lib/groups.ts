import type { SupabaseClient } from '@supabase/supabase-js';

// Create a group
export async function createGroup(
  supabase: SupabaseClient,
  group: {
    place_id: string;
    name: string;
    description?: string;
    is_public?: boolean;
    requires_approval?: boolean;
    auto_checkin_enabled?: boolean;
  }
) {
  const { data, error } = await supabase
    .from('groups')
    .insert(group)
    .select()
    .single();

  if (!error && data) {
    // Auto-join creator as admin
    await supabase.from('group_members').insert({
      group_id: data.id,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      role: 'admin',
      share_location: true
    });
  }

  return { data, error };
}

// Get groups for a place
export async function getGroupsForPlace(
  supabase: SupabaseClient,
  placeId: string
) {
  const { data, error } = await supabase
    .from('groups')
    .select(`
      *,
      place:places (*),
      member_count:group_members(count)
    `)
    .eq('place_id', placeId)
    .order('created_at', { ascending: false });

  return { data: data || [], error };
}

// Get my groups
export async function getMyGroups(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('group_members')
    .select(`
      *,
      group:groups (
        *,
        place:places (*)
      )
    `)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
    .order('joined_at', { ascending: false });

  return { data: data || [], error };
}

// Join a group
export async function joinGroup(
  supabase: SupabaseClient,
  groupId: string,
  shareLocation: boolean = true
) {
  const { error } = await supabase.from('group_members').insert({
    group_id: groupId,
    user_id: (await supabase.auth.getUser()).data.user?.id,
    share_location: shareLocation
  });

  return { error };
}

// Leave a group
export async function leaveGroup(supabase: SupabaseClient, groupId: string) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

  return { error };
}

// Update group member settings
export async function updateGroupMemberSettings(
  supabase: SupabaseClient,
  groupId: string,
  settings: {
    share_location?: boolean;
    receive_notifications?: boolean;
  }
) {
  const { error } = await supabase
    .from('group_members')
    .update(settings)
    .eq('group_id', groupId)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

  return { error };
}

// Get group members
export async function getGroupMembers(
  supabase: SupabaseClient,
  groupId: string
) {
  const { data, error } = await supabase
    .from('group_members')
    .select(`
      *,
      profile:profiles (
        id,
        username,
        display_name
      )
    `)
    .eq('group_id', groupId)
    .order('joined_at', { ascending: false });

  return { data: data || [], error };
}

// Set visibility settings for a group
export async function setGroupVisibility(
  supabase: SupabaseClient,
  groupId: string,
  visibleToUserIds: string[]
) {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return { error: 'Not authenticated' };

  // Remove all existing visibility settings for this group
  await supabase
    .from('group_visibility')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  // Add new visibility settings
  if (visibleToUserIds.length > 0) {
    const { error } = await supabase.from('group_visibility').insert(
      visibleToUserIds.map((visibleToUserId) => ({
        group_id: groupId,
        user_id: userId,
        visible_to_user_id: visibleToUserId
      }))
    );
    return { error };
  }

  return { error: null };
}