// src/routes/(app)/places/[id]/+page.ts
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, params }) => {
	const { session } = await parent();

	if (!session) {
		throw redirect(303, '/');
	}

	return {
		placeId: params.id
	};
};
