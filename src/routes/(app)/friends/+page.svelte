<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { MyFriend, PendingRequestReceived, PendingRequestSent } from '$lib/types';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import {
		getFriends,
		getPendingRequestsReceived,
		getPendingRequestsSent,
		sendFriendRequest,
		acceptFriendRequest,
		rejectFriendRequest,
		removeFriend,
		subscribeFriendshipChanges,
		unsubscribeFriendshipChanges,
		subscribeProfileChanges,
		unsubscribeProfileChanges
	} from '$lib/friendships';
	import { subscribeCheckInChanges, unsubscribeCheckInChanges } from '$lib/checkins';

	let { data }: { data: PageData } = $props();

	// Derived values from data
	let { supabase, session } = $derived(data);

	// State variables
	let friends = $state<MyFriend[]>([]);
	let pendingReceived = $state<PendingRequestReceived[]>([]);
	let pendingSent = $state<PendingRequestSent[]>([]);
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let searching = $state(false);
	let loading = $state(true);
	let activeTab = $state<'friends' | 'requests'>('friends');
	let abortController = $state<AbortController | null>(null);
	let realtimeChannel = $state<RealtimeChannel | null>(null);
	let profileChannel = $state<RealtimeChannel | null>(null);
	let checkInChannel = $state<RealtimeChannel | null>(null);

	// Reactive search
	$effect(() => {
		if (searchQuery.length >= 2) {
			handleSearch();
		} else {
			searchResults = [];
		}
	});

	onMount(() => {
		console.log('🏠 Friends page mounted');
		loading = true;
		loadFriendsData();
		loading = false;

		// Setup Realtime subscription
		if (session?.user?.id) {
			console.log('📡 Setting up realtime subscription...');
			realtimeChannel = subscribeFriendshipChanges(supabase, session.user.id, handleRealtimeUpdate);

			// Setup profile changes subscription (for sharing status)
			console.log('📡 Setting up profile subscription...');
			profileChannel = subscribeProfileChanges(supabase, handleProfileUpdate);

			// Setup check-in changes subscription (to show current location)
			console.log('📡 Setting up check-in subscription...');
			checkInChannel = supabase
				.channel('friend-checkins')
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'check_ins'
					},
					handleCheckInUpdate
				)
				.subscribe();
		}

		// Cleanup on unmount
		return () => {
			if (abortController) {
				abortController.abort();
			}
			if (realtimeChannel) {
				console.log('🔌 Cleaning up realtime subscription');
				unsubscribeFriendshipChanges(supabase, realtimeChannel);
			}
			if (profileChannel) {
				console.log('🔌 Cleaning up profile subscription');
				unsubscribeProfileChanges(supabase, profileChannel);
			}
			if (checkInChannel) {
				console.log('🔌 Cleaning up check-in subscription');
				supabase.removeChannel(checkInChannel);
			}
		};
	});

	/**
	 * Handle realtime updates - reload data when friendship changes occur
	 */
	function handleRealtimeUpdate() {
		console.log('🔄 Realtime update received, reloading friends data...');
		loadFriendsData();
	}

	/**
	 * Handle profile updates - reload when sharing status changes
	 */
	function handleProfileUpdate(payload: any) {
		console.log('🔄 Profile update received:', payload.new);

		// Check if the updated profile is one of our friends
		const updatedUserId = payload.new.id;
		const isFriend = friends.some((f) => f.friend_id === updatedUserId);

		if (isFriend) {
			console.log('✅ Friend sharing status changed, reloading...');
			loadFriendsData();
		}
	}

	/**
	 * Handle check-in updates - reload when friends check in/out
	 */
	function handleCheckInUpdate(payload: any) {
		console.log('🔄 Check-in update received:', payload);

		// Check if the check-in is from one of our friends
		const userId = payload.new?.user_id || payload.old?.user_id;
		const isFriend = friends.some((f) => f.friend_id === userId);

		if (isFriend) {
			console.log('✅ Friend location changed, reloading...');
			loadFriendsData();
		}
	}

	async function handleSearch() {
		if (searchQuery.trim().length < 2) {
			searchResults = [];
			return;
		}

		searching = true;
		const { data: profiles, error } = await supabase
			.from('profiles')
			.select('id, username, display_name')
			.ilike('username', `%${searchQuery.trim()}%`)
			.neq('id', session!.user.id)
			.limit(10);

		if (!error && profiles) {
			// Filter out existing friends and pending requests
			const friendIds = new Set([
				...friends.map((f) => f.friend_id),
				...pendingReceived.map((p) => p.requester_id),
				...pendingSent.map((p) => p.recipient_id)
			]);

			searchResults = profiles.filter((p) => !friendIds.has(p.id));
		}

		searching = false;
	}

	async function loadFriendsData() {
		console.log('📥 Loading friends data...');

		// Cancel previous request if still running
		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();

		try {
			// Load friends with profiles using your existing functions
			const [loadedFriends, loadedReceived, loadedSent] = await Promise.all([
				getFriends(supabase),
				getPendingRequestsReceived(supabase),
				getPendingRequestsSent(supabase)
			]);

			friends = loadedFriends;
			pendingReceived = loadedReceived;
			pendingSent = loadedSent;

			console.log('✅ Loaded friends data:', {
				friends: friends.length,
				received: pendingReceived.length,
				sent: pendingSent.length
			});
		} catch (error: any) {
			if (error.name !== 'AbortError') {
				console.error('❌ Load friends error:', error);
			}
		}
	}

	async function handleAcceptRequest(requesterId: string) {
		console.log('👍 Accepting friend request from:', requesterId);
		const result = await acceptFriendRequest(supabase, session!.user.id, requesterId);

		if (result.success) {
			console.log('✅ Friend request accepted successfully');
			// No need to manually reload - realtime will trigger update
		} else {
			console.error('❌ Failed to accept friend request:', result.error);
		}
	}

	async function handleRejectRequest(requesterId: string) {
		console.log('👎 Rejecting friend request from:', requesterId);
		const result = await rejectFriendRequest(supabase, session!.user.id, requesterId);

		if (result.success) {
			console.log('✅ Friend request rejected successfully');
			// No need to manually reload - realtime will trigger update
		} else {
			console.error('❌ Failed to reject friend request:', result.error);
		}
	}

	async function handleSendRequest(userId: string) {
		const profile = searchResults.find((p) => p.id === userId);
		if (!profile) return;

		const result = await sendFriendRequest(supabase, session!.user.id, profile.username);

		if (result.success) {
			searchQuery = '';
			searchResults = [];
			// No need to manually reload - realtime will trigger update
		}
	}

	async function handleRemoveFriend(friendId: string, friendName: string) {
		if (!confirm(`Remove ${friendName} as a friend?`)) return;

		const result = await removeFriend(supabase, session!.user.id, friendId);

		if (result.success) {
			// No need to manually reload - realtime will trigger update
		}
	}

	function clearSearch() {
		searchQuery = '';
		searchResults = [];
	}
</script>

<svelte:head>
	<title>Friends - Location Share</title>
</svelte:head>

<div class="friends-page">
	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
		</div>
	{:else}
		<!-- Search Bar -->
		<div class="search-section">
			<div class="search-bar">
				<span class="search-icon">🔍</span>
				<input
					type="text"
					placeholder="Search by username..."
					bind:value={searchQuery}
					class="search-input"
				/>
				{#if searchQuery}
					<button class="clear-btn" onclick={clearSearch} aria-label="Clear search"> ✕ </button>
				{/if}
			</div>

			<!-- Search Results -->
			{#if searchResults.length > 0}
				<div class="search-results">
					{#each searchResults as result}
						<div class="search-result-item">
							<div class="user-avatar">
								{result.display_name?.charAt(0)?.toUpperCase() ||
									result.username?.charAt(0)?.toUpperCase() ||
									'?'}
							</div>
							<div class="user-info">
								<div class="user-name">{result.display_name || result.username}</div>
								<div class="user-username">@{result.username}</div>
							</div>
							<button class="add-btn" onclick={() => handleSendRequest(result.id)}> Add </button>
						</div>
					{/each}
				</div>
			{:else if searching}
				<div class="search-loading">
					<div class="spinner-small"></div>
				</div>
			{:else if searchQuery.length >= 2}
				<div class="no-results">
					<p>No users found</p>
				</div>
			{/if}
		</div>

		<!-- Tabs -->
		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'friends'}
				onclick={() => (activeTab = 'friends')}
			>
				Friends
				<span class="tab-count">{friends.length}</span>
			</button>
			<button
				class="tab"
				class:active={activeTab === 'requests'}
				onclick={() => (activeTab = 'requests')}
			>
				Requests
				{#if pendingReceived.length > 0}
					<span class="tab-badge">{pendingReceived.length}</span>
				{/if}
			</button>
		</div>

		<!-- Friends Tab -->
		{#if activeTab === 'friends'}
			<div class="content-section">
				{#if friends.length === 0}
					<div class="empty-state">
						<span class="empty-icon">👥</span>
						<h3>No friends yet</h3>
						<p>Search for users above to add friends</p>
					</div>
				{:else}
					<div class="friends-list">
						{#each friends as friend}
							<div class="friend-card">
								<div class="friend-left">
									<div class="user-avatar large">
										{friend.display_name?.charAt(0)?.toUpperCase() ||
											friend.username?.charAt(0)?.toUpperCase() ||
											'?'}
									</div>
									<div class="friend-info">
										<div class="friend-name">
											{friend.display_name || friend.username}
										</div>
										<div class="friend-username">@{friend.username}</div>
										<div class="friend-meta">
											Friends since {new Date(friend.friends_since).toLocaleDateString([], {
												month: 'short',
												year: 'numeric'
											})}
										</div>
									</div>
								</div>
								<div class="friend-actions">
									{#if friend.location_name}
										<span class="status-badge location">
											📍 {friend.location_name}
										</span>
									{:else}
										<span class="status-badge offline">⚫ Offline</span>
									{/if}
									<button
										class="menu-btn"
										onclick={() =>
											handleRemoveFriend(friend.friend_id, friend.display_name || friend.username)}
										aria-label="Remove friend"
									>
										⋮
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Requests Tab -->
		{#if activeTab === 'requests'}
			<div class="content-section">
				<!-- Received Requests -->
				{#if pendingReceived.length > 0}
					<div class="requests-section">
						<h3 class="section-title">Received ({pendingReceived.length})</h3>
						{#each pendingReceived as request}
							<div class="request-card">
								<div class="request-left">
									<div class="user-avatar large">
										{request.requester_display_name?.charAt(0)?.toUpperCase() ||
											request.requester_username?.charAt(0)?.toUpperCase() ||
											'?'}
									</div>
									<div class="request-info">
										<div class="request-name">
											{request.requester_display_name || request.requester_username}
										</div>
										<div class="request-username">@{request.requester_username}</div>
										<div class="request-time">
											{new Date(request.created_at).toLocaleDateString()}
										</div>
									</div>
								</div>
								<div class="request-actions">
									<button
										class="accept-btn"
										onclick={() => handleAcceptRequest(request.requester_id)}
									>
										✓
									</button>
									<button
										class="reject-btn"
										onclick={() => handleRejectRequest(request.requester_id)}
									>
										✕
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Sent Requests -->
				{#if pendingSent.length > 0}
					<div class="requests-section">
						<h3 class="section-title">Sent ({pendingSent.length})</h3>
						{#each pendingSent as request}
							<div class="request-card">
								<div class="request-left">
									<div class="user-avatar large">
										{request.recipient_display_name?.charAt(0)?.toUpperCase() ||
											request.recipient_username?.charAt(0)?.toUpperCase() ||
											'?'}
									</div>
									<div class="request-info">
										<div class="request-name">
											{request.recipient_display_name || request.recipient_username}
										</div>
										<div class="request-username">@{request.recipient_username}</div>
										<div class="request-time">
											Sent {new Date(request.created_at).toLocaleDateString()}
										</div>
									</div>
								</div>
								<div class="pending-badge">Pending</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- No Requests -->
				{#if pendingReceived.length === 0 && pendingSent.length === 0}
					<div class="empty-state">
						<span class="empty-icon">📬</span>
						<h3>No pending requests</h3>
						<p>Friend requests will appear here</p>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	/* Same styles as before */
	.friends-page {
		min-height: 100%;
		background: #000;
		padding-bottom: 20px;
	}

	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 400px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #333;
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.spinner-small {
		width: 20px;
		height: 20px;
		border: 2px solid #333;
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.search-section {
		padding: 16px;
		background: #000;
		position: sticky;
		z-index: 50;
	}

	.search-bar {
		position: relative;
		display: flex;
		align-items: center;
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 0 16px;
		transition: border-color 0.2s;
	}

	.search-bar:focus-within {
		border-color: var(--color-primary);
	}

	.search-icon {
		font-size: 18px;
		margin-right: 12px;
		opacity: 0.5;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		padding: 14px 0;
		color: #fff;
		font-size: 16px;
		outline: none;
	}

	.search-input::placeholder {
		color: #666;
	}

	.clear-btn {
		background: transparent;
		border: none;
		color: #666;
		font-size: 18px;
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.clear-btn:hover {
		color: #fff;
	}

	.search-results {
		margin-top: 12px;
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		overflow: hidden;
	}

	.search-result-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid #1a1a1a;
	}

	.search-result-item:last-child {
		border-bottom: none;
	}

	.search-loading,
	.no-results {
		margin-top: 12px;
		text-align: center;
		padding: 20px;
		color: #666;
	}

	.tabs {
		display: flex;
		gap: 8px;
		padding: 0 16px 16px;
		border-bottom: 1px solid #1a1a1a;
	}

	.tab {
		flex: 1;
		background: transparent;
		border: none;
		color: #666;
		font-size: 16px;
		font-weight: 600;
		padding: 12px 16px;
		cursor: pointer;
		border-radius: 8px;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.tab.active {
		background: #0a0a0a;
		color: #fff;
	}

	.tab-count {
		color: #666;
		font-size: 14px;
	}

	.tab.active .tab-count {
		color: var(--color-primary);
	}

	.tab-badge {
		background: var(--color-primary);
		color: #fff;
		padding: 2px 8px;
		border-radius: 12px;
		font-size: 12px;
		font-weight: 700;
	}

	.content-section {
		padding: 16px;
	}

	.user-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: #fff;
		font-size: 16px;
		flex-shrink: 0;
	}

	.user-avatar.large {
		width: 56px;
		height: 56px;
		font-size: 20px;
	}

	.user-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.user-name {
		font-size: 16px;
		font-weight: 600;
		color: #fff;
	}

	.user-username {
		font-size: 14px;
		color: #666;
	}

	.add-btn {
		background: var(--color-primary);
		color: #fff;
		border: none;
		padding: 8px 20px;
		border-radius: 20px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.add-btn:hover {
		background: #ff6b35;
		transform: scale(1.05);
	}

	.friends-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.friend-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	.friend-left {
		display: flex;
		gap: 12px;
		align-items: center;
		flex: 1;
		min-width: 0;
	}

	.friend-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.friend-name {
		font-size: 16px;
		font-weight: 600;
		color: #fff;
	}

	.friend-username {
		font-size: 14px;
		color: #666;
	}

	.friend-meta {
		font-size: 12px;
		color: #666;
		margin-top: 4px;
	}

	.friend-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.status-badge {
		font-size: 12px;
		font-weight: 600;
		padding: 4px 10px;
		border-radius: 12px;
		white-space: nowrap;
	}

	.status-badge.location {
		color: var(--color-primary);
		background: rgba(252, 76, 2, 0.1);
		border: 1px solid rgba(252, 76, 2, 0.3);
	}

	.status-badge.offline {
		color: #666;
	}

	.menu-btn {
		background: transparent;
		border: none;
		color: #666;
		font-size: 20px;
		cursor: pointer;
		padding: 4px 8px;
		line-height: 1;
	}

	.menu-btn:hover {
		color: #fff;
	}

	.requests-section {
		margin-bottom: 24px;
	}

	.section-title {
		font-size: 14px;
		font-weight: 700;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin: 0 0 12px 0;
	}

	.request-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}

	.request-left {
		display: flex;
		gap: 12px;
		align-items: center;
		flex: 1;
	}

	.request-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.request-name {
		font-size: 16px;
		font-weight: 600;
		color: #fff;
	}

	.request-username {
		font-size: 14px;
		color: #666;
	}

	.request-time {
		font-size: 12px;
		color: #666;
		margin-top: 4px;
	}

	.request-actions {
		display: flex;
		gap: 8px;
	}

	.accept-btn,
	.reject-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: none;
		cursor: pointer;
		font-size: 18px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.accept-btn {
		background: #4caf50;
		color: #fff;
	}

	.accept-btn:hover {
		background: #45a049;
		transform: scale(1.1);
	}

	.reject-btn {
		background: #f44336;
		color: #fff;
	}

	.reject-btn:hover {
		background: #da190b;
		transform: scale(1.1);
	}

	.pending-badge {
		background: #ffa500;
		color: #fff;
		padding: 6px 14px;
		border-radius: 16px;
		font-size: 12px;
		font-weight: 700;
	}

	.empty-state {
		text-align: center;
		padding: 60px 20px;
	}

	.empty-icon {
		font-size: 64px;
		display: block;
		margin-bottom: 16px;
	}

	.empty-state h3 {
		font-size: 18px;
		font-weight: 700;
		color: #fff;
		margin: 0 0 8px 0;
	}

	.empty-state p {
		font-size: 14px;
		color: #666;
		margin: 0;
	}
</style>
