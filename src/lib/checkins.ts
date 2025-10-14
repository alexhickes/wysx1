import type { SupabaseClient } from '@supabase/supabase-js';

// Manual check-in
export async function checkIn(
  supabase: SupabaseClient,
  placeId: string,
  groupId?: string,
  activityId?: string
) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('check_ins')
    .insert({
      user_id: user.id,
      place_id: placeId,
      group_id: groupId,
      activity_id: activityId,
      check_in_type: 'manual'
    })
    .select()
    .single();

  return { data, error };
}

// Manual check-out
export async function checkOut(supabase: SupabaseClient, checkInId: string) {
  const { error } = await supabase
    .from('check_ins')
    .update({ checked_out_at: new Date().toISOString() })
    .eq('id', checkInId);

  return { error };
}

// Get my active check-ins
export async function getMyActiveCheckIns(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('my_active_checkins')
    .select('*');

  return { data: data || [], error };
}

// Get who's checked in at places I'm interested in
export async function getActiveMembers(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('active_members_at_my_places')
    .select('*')
    .order('checked_in_at', { ascending: false });

  return { data: data || [], error };
}

// Auto-manage check-ins based on location
export async function autoManageCheckIns(
  supabase: SupabaseClient,
  latitude: number,
  longitude: number
) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.rpc('auto_manage_checkin', {
    p_user_id: user.id,
    p_latitude: latitude,
    p_longitude: longitude
  });

  return { error };
}

// Check if user is currently in a place
export async function isInPlace(
  supabase: SupabaseClient,
  placeId: string,
  latitude: number,
  longitude: number
) {
  const { data, error } = await supabase.rpc('is_user_in_place', {
    user_lat: latitude,
    user_lng: longitude,
    p_place_id: placeId
  });

  return { isInside: data || false, error };
}

// Get check-in history for analytics
export async function getCheckInHistory(
  supabase: SupabaseClient,
  userId?: string,
  limit: number = 50
) {
  let query = supabase
    .from('check_ins')
    .select(`
      *,
      place:places(name),
      activity:activities(name, icon)
    `)
    .not('checked_out_at', 'is', null)
    .order('checked_in_at', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    const user = (await supabase.auth.getUser()).data.user;
    if (user) {
      query = query.eq('user_id', user.id);
    }
  }

  const { data, error } = await query;
  return { data: data || [], error };
}