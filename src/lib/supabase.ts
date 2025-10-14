import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  is_sharing: boolean;
};

export type Location = {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  place_name?: string;
  updated_at: string;
};

export type Friendship = {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
};
