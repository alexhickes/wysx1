import type { SupabaseClient, Session } from '@supabase/supabase-js';

// ============================================
// DATABASE TYPES
// ============================================

export type Profile = {
	id: string;
	username: string;
	display_name: string | null;
	created_at: string;
	is_sharing: boolean;
};

export type Location = {
	user_id: string;
	latitude: number;
	longitude: number;
	accuracy: number | null;
	place_name: string | null;
	updated_at: string;
};

export type Friendship = {
	user_id_1: string;
	user_id_2: string;
	status: 'pending' | 'accepted' | 'rejected';
	initiated_by: string;
	created_at: string;
	accepted_at: string | null;
};

export type UserBlock = {
	blocker_id: string;
	blocked_id: string;
	created_at: string;
};

export type Place = {
	id: string;
	name: string;
	description: string | null;
	latitude: number;
	longitude: number;
	radius: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
	address: string | null;
	place_type: string | null;
	is_public: boolean;
};

export type Activity = {
	id: string;
	name: string;
	icon: string | null;
	category: string | null;
	created_at: string;
};

export type PlaceActivity = {
	place_id: string;
	activity_id: string;
};

export type Group = {
	id: string;
	place_id: string;
	name: string;
	description: string | null;
	created_by: string;
	created_at: string;
	is_public: boolean;
	requires_approval: boolean;
	auto_checkin_enabled: boolean;
	notification_enabled: boolean;
};

export type GroupMember = {
	group_id: string;
	user_id: string;
	joined_at: string;
	role: 'admin' | 'moderator' | 'member';
	share_location: boolean;
	receive_notifications: boolean;
};

export type GroupVisibility = {
	group_id: string;
	user_id: string;
	visible_to_user_id: string;
	created_at: string;
};

export type CheckIn = {
	id: string;
	user_id: string;
	place_id: string;
	group_id: string | null;
	activity_id: string | null;
	checked_in_at: string;
	checked_out_at: string | null;
	check_in_type: 'auto' | 'manual';
	latitude: number | null;
	longitude: number | null;
};

// ============================================
// VIEW TYPES (For Supabase Views)
// ============================================

export type MyFriend = {
	friend_id: string;
	username: string;
	display_name: string | null;
	is_sharing: boolean;
	friends_since: string;
};

export type PendingRequestReceived = {
	user_id_1: string;
	user_id_2: string;
	requester_id: string;
	requester_username: string;
	requester_display_name: string | null;
	created_at: string;
};

export type PendingRequestSent = {
	user_id_1: string;
	user_id_2: string;
	recipient_id: string;
	recipient_username: string;
	recipient_display_name: string | null;
	created_at: string;
};

export type MyActiveCheckIn = {
	id: string;
	place_id: string;
	group_id: string | null;
	activity_id: string | null;
	checked_in_at: string;
	place_name: string;
	place_type: string;
	place_lat: number;
	place_lng: number;
	group_name: string | null;
	activity_name: string | null;
};

export type ActiveMemberAtMyPlace = {
	checkin_id: string;
	user_id: string;
	place_id: string;
	group_id: string | null;
	checked_in_at: string;
	username: string;
	display_name: string | null;
	place_name: string;
	place_lat: number;
	place_lng: number;
	group_name: string | null;
	activity_name: string | null;
};

// ============================================
// JOINED/EXTENDED TYPES
// ============================================

export type PlaceWithActivities = Place & {
	place_activities: Array<{
		activity: Activity;
	}>;
};

export type GroupWithPlace = Group & {
	place: Place;
};

export type GroupWithMembers = Group & {
	member_count: Array<{ count: number }>;
};

export type GroupMemberWithProfile = GroupMember & {
	profile: Profile;
};

export type GroupMembershipWithGroup = GroupMember & {
	group: GroupWithPlace;
};

export type CheckInWithDetails = CheckIn & {
	place: Place;
	group?: Group;
	activity?: Activity;
	profile: Profile;
};

// ============================================
// FUNCTION RETURN TYPES
// ============================================

export type NearbyPlace = {
	place_id: string;
	place_name: string;
	place_lat: number;
	place_lng: number;
	radius: number;
	distance_meters: number;
	active_members: number;
};

// ============================================
// FORM/INPUT TYPES
// ============================================

export type CreatePlaceInput = {
	name: string;
	description?: string;
	latitude: number;
	longitude: number;
	radius: number;
	place_type?: string;
	is_public: boolean;
	address?: string;
	created_by?: string;
};

export type UpdatePlaceInput = {
	name?: string;
	description?: string | null;
	place_type?: string;
	radius?: number;
	is_public?: boolean;
	address?: string | null;
};

export type CreateGroupInput = {
	place_id: string;
	name: string;
	description?: string;
	is_public?: boolean;
	requires_approval?: boolean;
	auto_checkin_enabled?: boolean;
	notification_enabled?: boolean;
};

export type UpdateGroupInput = Partial<Omit<CreateGroupInput, 'place_id'>>;

export type CreateCheckInInput = {
	place_id: string;
	group_id?: string;
	activity_id?: string;
	check_in_type?: 'auto' | 'manual';
	latitude?: number;
	longitude?: number;
};

export type UpdateGroupMemberSettingsInput = {
	share_location?: boolean;
	receive_notifications?: boolean;
};

// ============================================
// API RESPONSE TYPES
// ============================================

export type ApiResponse<T = void> = {
	success: boolean;
	data?: T;
	error?: string;
};

export type PaginatedResponse<T> = {
	data: T[];
	count: number;
	page: number;
	pageSize: number;
	hasMore: boolean;
};

// ============================================
// UI STATE TYPES
// ============================================

export type MapMarker = {
	id: string;
	latitude: number;
	longitude: number;
	type: 'user' | 'place' | 'member';
	label?: string;
	color?: string;
};

export type Coordinates = {
	latitude: number;
	longitude: number;
	accuracy?: number;
};

export type GeofenceStatus = {
	isInside: boolean;
	place: Place;
	distance: number;
};

// ============================================
// SUPABASE CLIENT TYPE
// ============================================

export type TypedSupabaseClient = SupabaseClient<Database>;

// Database type for Supabase client (generated schema)
export type Database = {
	public: {
		Tables: {
			profiles: {
				Row: Profile;
				Insert: Omit<Profile, 'created_at'>;
				Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
			};
			locations: {
				Row: Location;
				Insert: Omit<Location, 'updated_at'>;
				Update: Partial<Omit<Location, 'user_id'>>;
			};
			friendships: {
				Row: Friendship;
				Insert: Omit<Friendship, 'created_at' | 'accepted_at'>;
				Update: Partial<Omit<Friendship, 'user_id_1' | 'user_id_2' | 'created_at'>>;
			};
			user_blocks: {
				Row: UserBlock;
				Insert: Omit<UserBlock, 'created_at'>;
				Update: never;
			};
			places: {
				Row: Place;
				Insert: Omit<Place, 'id' | 'created_at' | 'updated_at'>;
				Update: Partial<Omit<Place, 'id' | 'created_at'>>;
			};
			activities: {
				Row: Activity;
				Insert: Omit<Activity, 'id' | 'created_at'>;
				Update: Partial<Omit<Activity, 'id' | 'created_at'>>;
			};
			place_activities: {
				Row: PlaceActivity;
				Insert: PlaceActivity;
				Update: never;
			};
			groups: {
				Row: Group;
				Insert: Omit<Group, 'id' | 'created_at'>;
				Update: Partial<Omit<Group, 'id' | 'created_at' | 'place_id' | 'created_by'>>;
			};
			group_members: {
				Row: GroupMember;
				Insert: Omit<GroupMember, 'joined_at'>;
				Update: Partial<Omit<GroupMember, 'group_id' | 'user_id' | 'joined_at'>>;
			};
			group_visibility: {
				Row: GroupVisibility;
				Insert: Omit<GroupVisibility, 'created_at'>;
				Update: never;
			};
			check_ins: {
				Row: CheckIn;
				Insert: Omit<CheckIn, 'id' | 'checked_in_at'>;
				Update: Partial<Omit<CheckIn, 'id' | 'user_id' | 'place_id' | 'checked_in_at'>>;
			};
		};
		Views: {
			my_friends: {
				Row: MyFriend;
			};
			pending_requests_received: {
				Row: PendingRequestReceived;
			};
			pending_requests_sent: {
				Row: PendingRequestSent;
			};
			my_active_checkins: {
				Row: MyActiveCheckIn;
			};
			active_members_at_my_places: {
				Row: ActiveMemberAtMyPlace;
			};
		};
		Functions: {
			normalize_friendship_ids: {
				Args: { uid1: string; uid2: string };
				Returns: { user_id_1: string; user_id_2: string }[];
			};
			is_user_in_place: {
				Args: { user_lat: number; user_lng: number; p_place_id: string };
				Returns: boolean;
			};
			find_nearby_places: {
				Args: { user_lat: number; user_lng: number; max_distance_meters?: number };
				Returns: NearbyPlace[];
			};
			auto_manage_checkin: {
				Args: { p_user_id: string; p_latitude: number; p_longitude: number };
				Returns: void;
			};
		};
	};
};

// ============================================
// UTILITY TYPES
// ============================================

export type Tables<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Row'];

export type Insertable<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Insert'];

export type Updatable<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Update'];

// ============================================
// APP CONTEXT TYPES
// ============================================

export type AppSession = {
	session: Session | null;
	profile: Profile | null;
	isLoading: boolean;
};

export type LocationState = {
	currentLocation: Coordinates | null;
	isTracking: boolean;
	accuracy: number | null;
	lastUpdate: Date | null;
};

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type Notification = {
	id: string;
	type: NotificationType;
	title: string;
	message: string;
	timestamp: Date;
	read: boolean;
};
