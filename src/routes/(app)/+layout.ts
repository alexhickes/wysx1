import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent }) => {
	const { session, supabase } = await parent();

	if (!session) {
		throw redirect(303, '/');
	}

	// Load profile
	const { data: profile } = await supabase

		.from('profiles')
		.select('*')
		.eq('id', session.user.id)
		.single();

	return {
		profile
	};
};
