import type { SupabaseClient } from '@supabase/supabase-js';

export type Place = {
	id: string;
	name: string;
	description?: string;
	latitude: number;
	longitude: number;
	radius: number;
	place_type?: string;
	is_public: boolean;
	created_by?: string;
};

export type Activity = {
	id: string;
	name: string;
	icon?: string;
	category?: string;
};

export type Group = {
	id: string;
	place_id: string;
	name: string;
	description?: string;
	is_public: boolean;
	requires_approval: boolean;
	auto_checkin_enabled: boolean;
	created_by: string;
};

export type CheckIn = {
	id: string;
	user_id: string;
	place_id: string;
	group_id?: string;
	activity_id?: string;
	checked_in_at: string;
	checked_out_at?: string;
};

// Create a new place
export async function createPlace(
	supabase: SupabaseClient,
	place: Omit<Place, 'id' | 'created_by'>
) {
	const { data, error } = await supabase.from('places').insert(place).select().single();

	return { data, error };
}

// Get nearby places
export async function getNearbyPlaces(
	supabase: SupabaseClient,
	latitude: number,
	longitude: number,
	maxDistance: number = 5000
) {
	const { data, error } = await supabase.rpc('find_nearby_places', {
		user_lat: latitude,
		user_lng: longitude,
		max_distance_meters: maxDistance
	});

	return { data, error };
}

// Get place by ID with activities
export async function getPlaceWithActivities(supabase: SupabaseClient, placeId: string) {
	const { data: place, error: placeError } = await supabase
		.from('places')
		.select(
			`
      *,
      place_activities (
        activity:activities (*)
      )
    `
		)
		.eq('id', placeId)
		.single();

	return { data: place, error: placeError };
}

// Get all activities
export async function getActivities(supabase: SupabaseClient) {
	const { data, error } = await supabase
		.from('activities')
		.select('*')
		.order('category', { ascending: true })
		.order('name', { ascending: true });

	return { data: data || [], error };
}

// Link activities to a place
export async function setPlaceActivities(
	supabase: SupabaseClient,
	placeId: string,
	activityIds: string[]
) {
	// Remove old activities
	await supabase.from('place_activities').delete().eq('place_id', placeId);

	// Add new activities
	if (activityIds.length > 0) {
		const { error } = await supabase.from('place_activities').insert(
			activityIds.map((activityId) => ({
				place_id: placeId,
				activity_id: activityId
			}))
		);
		return { error };
	}

	return { error: null };
}

// Add to src/lib/places.ts

/**
 * Update a place
 */
export async function updatePlace(
	supabase: SupabaseClient,
	placeId: string,
	updates: UpdatePlaceInput
): Promise<{ success: boolean; error: string | null }> {
	try {
		const { error } = await supabase.from('places').update(updates).eq('id', placeId);

		if (error) throw error;
		return { success: true, error: null };
	} catch (error: any) {
		return { success: false, error: error.message };
	}
}

/**
 * Delete a place
 */
export async function deletePlace(
	supabase: SupabaseClient,
	placeId: string
): Promise<{ success: boolean; error: string | null }> {
	try {
		const { error } = await supabase.from('places').delete().eq('id', placeId);

		if (error) throw error;
		return { success: true, error: null };
	} catch (error: any) {
		return { success: false, error: error.message };
	}
}
