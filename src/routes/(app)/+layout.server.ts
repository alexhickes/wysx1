import { redirect } from '@sveltejs/kit';
// import type { LayoutLoad } from './$types';

import type { LayoutServerLoad } from '../$types';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();

	if (!session) {
		throw redirect(303, '/');
	}

	return {
		session,
		user
	};
};
