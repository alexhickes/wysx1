import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return { friends: [] };
	}

	// Get friends via friendship junction table
	const { data: friends, error } = await supabase
		.from('friendships')
		.select(
			`
      friend_id,
      profiles:friend_id (
        id,
        username,
        avatar_url
      )
    `
		)
		.eq('user_id', user.id)
		.eq('status', 'accepted');

	if (error) {
		console.error('Error loading friends:', error);
		return { friends: [] };
	}

	return { friends: friends || [] };
};
