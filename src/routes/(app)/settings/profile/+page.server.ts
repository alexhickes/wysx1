// src/routes/(app)/settings/profile/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { session } = await safeGetSession();
	console.log('🚀 ~ load ~ session:', session);

	if (!session) {
		redirect(303, '/');
	}

	const { data: profile, error } = await supabase
		.from('profiles')
		.select(`username, display_name, is_sharing`)
		.eq('id', session.user.id)
		.single();

	if (error) {
		console.error('Error loading profile:', error);
	}

	console.log('🚀 ~ load ~ profile:', profile);

	return { session, profile };
};

export const actions: Actions = {
	update: async ({ request, locals: { supabase, safeGetSession } }) => {
		const formData = await request.formData();
		const display_name = formData.get('display_name') as string;
		const username = formData.get('username') as string;
		const is_sharing = formData.get('is_sharing') === 'true';

		const { session } = await safeGetSession();

		if (!session) {
			return fail(401, {
				error: 'Not authenticated'
			});
		}

		// Validate username
		if (!username || !username.trim()) {
			return fail(400, {
				error: 'Username is required',
				username,
				display_name,
				is_sharing
			});
		}

		if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
			return fail(400, {
				error: 'Username can only contain letters, numbers, underscores, and hyphens',
				username,
				display_name,
				is_sharing
			});
		}

		console.log('Updating profile:', { username, display_name, is_sharing });

		const { error } = await supabase
			.from('profiles')
			.update({
				username: username.trim(),
				display_name: display_name?.trim() || null,
				is_sharing: is_sharing
			})
			.eq('id', session.user.id);

		if (error) {
			console.error('Error updating profile:', error);
			return fail(500, {
				error: error.message,
				username,
				display_name,
				is_sharing
			});
		}

		return {
			success: true,
			username,
			display_name,
			is_sharing
		};
	},

	signout: async ({ locals: { supabase, safeGetSession } }) => {
		const { session } = await safeGetSession();
		if (session) {
			await supabase.auth.signOut();
			redirect(303, '/login');
		}
	}
};

// // src/routes/(app)/settings/profile/+page.server.ts
// import { fail, redirect } from '@sveltejs/kit';
// import type { Actions, PageServerLoad } from './$types';

// export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
// 	const { session } = await safeGetSession();
// 	console.log('🚀 ~ load ~ session:', session);

// 	if (!session) {
// 		redirect(303, '/');
// 	}

// 	const { data: profile } = await supabase
// 		.from('profiles')
// 		.select(`username, display_name, is_sharing, avatar_url`)
// 		// .select(`username, display_name, website, avatar_url`)
// 		.eq('id', session.user.id)
// 		.single();
// 	console.log('🚀 ~ load ~ supabase.auth.getSession():', await supabase.auth.getSession());
// 	console.log('🚀 ~ load ~ session.user.id:', session.user.id);
// 	console.log('🚀 ~ load ~ profile:', profile);

// 	return { session, profile };
// };

// export const actions: Actions = {
// 	update: async ({ request, locals: { supabase, safeGetSession } }) => {
// 		const formData = await request.formData();
// 		const display_name = formData.get('display_name') as string;
// 		const username = formData.get('username') as string;
// 		const is_sharing = (formData.get('is_sharing') as string) === 'true';
// 		// const website = formData.get('website') as string;
// 		const avatarUrl = formData.get('avatarUrl') as string;

// 		const { session } = await safeGetSession();

// 		const { error } = await supabase.from('profiles').upsert({
// 			id: session?.user.id,
// 			display_name,
// 			username,
// 			is_sharing,
// 			// website,
// 			avatar_url: avatarUrl,
// 			updated_at: new Date()
// 		});

// 		if (error) {
// 			return fail(500, {
// 				display_name,
// 				username,
// 				is_sharing,
// 				// website,
// 				avatarUrl
// 			});
// 		}

// 		return {
// 			display_name,
// 			username,
// 			is_sharing,
// 			// website,
// 			avatarUrl
// 		};
// 	},
// 	signout: async ({ locals: { supabase, safeGetSession } }) => {
// 		const { session } = await safeGetSession();
// 		if (session) {
// 			await supabase.auth.signOut();
// 			redirect(303, '/');
// 		}
// 	}
// };
