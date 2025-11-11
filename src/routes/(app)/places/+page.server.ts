export const load = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return { places: [] };
	}

	const { data: places, error } = await supabase
		.from('places')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error loading places:', error);
		return { places: [] };
	}

	return { places: places || [] };
};
