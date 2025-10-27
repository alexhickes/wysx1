import type { SupabaseClient } from '@supabase/supabase-js';

export interface Group {
	id: string;
	name: string;
	description: string | null;
	created_by: string;
	created_at: string;
	is_public: boolean;
	requires_approval: boolean;
	auto_checkin_enabled: boolean;
	notification_enabled: boolean;
}

export interface GroupPlace {
	place_id: string;
	place_name: string;
	place_type: string;
	latitude: number;
	longitude: number;
	radius: number;
	is_primary: boolean;
	display_order: number;
	added_at: string;
}

// // Create a group
// export async function createGroup(
// 	supabase: SupabaseClient,
// 	group: {
// 		place_id: string;
// 		name: string;
// 		description?: string;
// 		is_public?: boolean;
// 		requires_approval?: boolean;
// 		auto_checkin_enabled?: boolean;
// 	}
// ) {
// 	const { data, error } = await supabase.from('groups').insert(group).select().single();

// 	if (!error && data) {
// 		// Auto-join creator as admin
// 		await supabase.from('group_members').insert({
// 			group_id: data.id,
// 			user_id: (await supabase.auth.getUser()).data.user?.id,
// 			role: 'admin',
// 			share_location: true
// 		});
// 	}

// 	return { data, error };
// }

// // Get groups for a place
// export async function getGroupsForPlace(supabase: SupabaseClient, placeId: string) {
// 	const { data, error } = await supabase
// 		.from('groups')
// 		.select(
// 			`
//       *,
//       place:places (*),
//       member_count:group_members(count)
//     `
// 		)
// 		.eq('place_id', placeId)
// 		.order('created_at', { ascending: false });

// 	return { data: data || [], error };
// }

/**
 * Get all places for a group
 */
export async function getGroupPlaces(
	supabase: SupabaseClient,
	groupId: string
): Promise<{ data: GroupPlace[] | null; error: any }> {
	const { data, error } = await supabase.rpc('get_group_places', {
		p_group_id: groupId
	});

	return { data, error };
}

/**
 * Get group with all its places
 */
export async function getGroupWithPlaces(
	supabase: SupabaseClient,
	groupId: string
): Promise<{ data: any; error: any }> {
	const { data: group, error: groupError } = await supabase
		.from('groups')
		.select('*')
		.eq('id', groupId)
		.single();

	if (groupError) return { data: null, error: groupError };

	// Get places for this group
	const { data: places, error: placesError } = await getGroupPlaces(supabase, groupId);

	if (placesError) return { data: null, error: placesError };

	return {
		data: {
			...group,
			places: places || []
		},
		error: null
	};
}

/**
 * Get groups for a specific place (groups that include this place)
 */
export async function getGroupsForPlace(
	supabase: SupabaseClient,
	placeId: string
): Promise<{ data: any[] | null; error: any }> {
	const { data, error } = await supabase
		.from('group_places')
		.select(
			`
      group_id,
      is_primary,
      groups (
        id,
        name,
        description,
        is_public,
        auto_checkin_enabled,
        notification_enabled,
        group_members (count)
      )
    `
		)
		.eq('place_id', placeId);

	if (error) return { data: null, error };

	// Flatten the structure
	const groups = data?.map((gp) => ({
		...gp.groups,
		is_primary_place: gp.is_primary
	}));

	return { data: groups, error: null };
}

/**
 * Create a new group with initial place
 */
export async function createGroup(
	supabase: SupabaseClient,
	groupData: {
		name: string;
		description?: string;
		initial_place_id: string;
		is_public: boolean;
		requires_approval: boolean;
		auto_checkin_enabled: boolean;
		notification_enabled: boolean;
	}
): Promise<{ data: any; error: any }> {
	const { data: session } = await supabase.auth.getSession();

	if (!session.session) {
		return { data: null, error: { message: 'Not authenticated' } };
	}

	console.log('Creating group with data:', groupData);

	// Create the group (without place_id)
	const { data: group, error: groupError } = await supabase
		.from('groups')
		.insert({
			name: groupData.name,
			description: groupData.description || null,
			is_public: groupData.is_public,
			requires_approval: groupData.requires_approval,
			auto_checkin_enabled: groupData.auto_checkin_enabled,
			notification_enabled: groupData.notification_enabled,
			created_by: session.session.user.id
		})
		.select()
		.single();

	if (groupError) return { data: null, error: groupError };

	// Add the initial place to the group (will automatically be set as primary)
	const { error: placeError } = await addPlaceToGroup(
		supabase,
		group.id,
		groupData.initial_place_id
	);

	if (placeError) {
		// Rollback: delete the group
		await supabase.from('groups').delete().eq('id', group.id);
		return { data: null, error: placeError };
	}

	return { data: group, error: null };
}

/**
 * Add a place to a group
 */
export async function addPlaceToGroup(
	supabase: SupabaseClient,
	groupId: string,
	placeId: string,
	isPrimary: boolean = false
): Promise<{ data: any; error: any }> {
	const { data: session } = await supabase.auth.getSession();

	if (!session.session) {
		return { data: null, error: { message: 'Not authenticated' } };
	}

	// If setting as primary, unset other primary places first
	if (isPrimary) {
		await supabase
			.from('group_places')
			.update({ is_primary: false })
			.eq('group_id', groupId)
			.eq('is_primary', true);
	}

	const { data, error } = await supabase
		.from('group_places')
		.insert({
			group_id: groupId,
			place_id: placeId,
			added_by: session.session.user.id,
			is_primary: isPrimary
		})
		.select()
		.single();

	return { data, error };
}

/**
 * Remove a place from a group
 */
export async function removePlaceFromGroup(
	supabase: SupabaseClient,
	groupId: string,
	placeId: string
): Promise<{ error: any }> {
	// Check if this is the only place
	const { data: places } = await getGroupPlaces(supabase, groupId);

	if (places && places.length === 1) {
		return { error: { message: 'Cannot remove the only place from a group' } };
	}

	// Check if this is the primary place
	const place = places?.find((p) => p.place_id === placeId);

	if (place?.is_primary && places && places.length > 1) {
		return {
			error: {
				message: 'Cannot remove primary place. Set another place as primary first.'
			}
		};
	}

	const { error } = await supabase
		.from('group_places')
		.delete()
		.eq('group_id', groupId)
		.eq('place_id', placeId);

	return { error };
}

/**
 * Set a place as primary for a group
 */
export async function setPrimaryPlace(
	supabase: SupabaseClient,
	groupId: string,
	placeId: string
): Promise<{ error: any }> {
	// Unset current primary
	await supabase
		.from('group_places')
		.update({ is_primary: false })
		.eq('group_id', groupId)
		.eq('is_primary', true);

	// Set new primary
	const { error } = await supabase
		.from('group_places')
		.update({ is_primary: true })
		.eq('group_id', groupId)
		.eq('place_id', placeId);

	return { error };
}

/**
 * Update group places display order
 */
export async function updatePlacesOrder(
	supabase: SupabaseClient,
	groupId: string,
	placeOrders: { place_id: string; display_order: number }[]
): Promise<{ error: any }> {
	const promises = placeOrders.map(({ place_id, display_order }) =>
		supabase
			.from('group_places')
			.update({ display_order })
			.eq('group_id', groupId)
			.eq('place_id', place_id)
	);

	const results = await Promise.all(promises);
	const errors = results.filter((r) => r.error);

	return { error: errors.length > 0 ? errors[0].error : null };
}

/**
 * Check if user can check into a place for a group
 */
export async function canCheckIntoGroupPlace(
	supabase: SupabaseClient,
	groupId: string,
	placeId: string
): Promise<boolean> {
	const { data: session } = await supabase.auth.getSession();

	if (!session.session) {
		return false;
	}

	const { data } = await supabase.rpc('can_checkin_to_group_place', {
		p_user_id: session.session.user.id,
		p_group_id: groupId,
		p_place_id: placeId
	});

	return data === true;
}

/**
 * Get all groups user is a member of
 */
export async function getMyGroups(
	supabase: SupabaseClient
): Promise<{ data: any[] | null; error: any }> {
	const { data: session } = await supabase.auth.getSession();

	if (!session.session) {
		return { data: null, error: { message: 'Not authenticated' } };
	}

	const { data, error } = await supabase
		.from('group_members')
		.select(
			`
      group_id,
      role,
      joined_at,
      groups (
        id,
        name,
        description,
        is_public,
        auto_checkin_enabled,
        notification_enabled,
        created_at
      )
    `
		)
		.eq('user_id', session.session.user.id)
		.order('joined_at', { ascending: false });

	if (error) return { data: null, error };

	// Get places for each group
	const groupsWithPlaces = await Promise.all(
		(data || []).map(async (item: any) => {
			const { data: places } = await getGroupPlaces(supabase, item.group_id);
			return {
				...item.groups,
				role: item.role,
				joined_at: item.joined_at,
				places: places || []
			};
		})
	);

	return { data: groupsWithPlaces, error: null };
}

/**
 * Update group details (not places)
 */
export async function updateGroup(
	supabase: SupabaseClient,
	groupId: string,
	updates: Partial<Group>
): Promise<{ error: any }> {
	const { error } = await supabase.from('groups').update(updates).eq('id', groupId);

	return { error };
}

/**
 * Delete a group
 */
export async function deleteGroup(
	supabase: SupabaseClient,
	groupId: string
): Promise<{ error: any }> {
	// group_places will be automatically deleted due to CASCADE
	const { error } = await supabase.from('groups').delete().eq('id', groupId);

	return { error };
}

// // Get my groups
// export async function getMyGroups(supabase: SupabaseClient) {
// 	const { data, error } = await supabase
// 		.from('group_members')
// 		.select(
// 			`
//       *,
//       group:groups (
//         *,
//         place:places (*)
//       )
//     `
// 		)
// 		.eq('user_id', (await supabase.auth.getUser()).data.user?.id)
// 		.order('joined_at', { ascending: false });

// 	return { data: data || [], error };
// }

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
export async function getGroupMembers(supabase: SupabaseClient, groupId: string) {
	const { data, error } = await supabase
		.from('group_members')
		.select(
			`
      *,
      profile:profiles (
        id,
        username,
        display_name
      )
    `
		)
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
	await supabase.from('group_visibility').delete().eq('group_id', groupId).eq('user_id', userId);

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
