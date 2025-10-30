<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { MyFriend, PendingRequestReceived, PendingRequestSent } from '$lib/types';
	import {
		getFriends,
		getPendingRequestsReceived,
		getPendingRequestsSent,
		sendFriendRequest,
		acceptFriendRequest,
		rejectFriendRequest,
		removeFriend
	} from '$lib/friendships';

	export let data: PageData;

	let friends: MyFriend[] = [];
	let pendingReceived: PendingRequestReceived[] = [];
	let pendingSent: PendingRequestSent[] = [];
	let searchQuery = '';
	let searchResults: any[] = [];
	let searching = false;
	let loading = true;
	let showAddFriend = false;
	let newFriendUsername = '';
	let addFriendError = '';
	let addFriendLoading = false;

	// Active tab: 'friends' or 'requests'
	let activeTab: 'friends' | 'requests' = 'friends';

	onMount(async () => {
		await loadFriends();
		loading = false;
	});

	async function loadFriends() {
		friends = await getFriends(data.supabase);
		console.log('Friends:', friends);
		pendingReceived = await getPendingRequestsReceived(data.supabase);
		pendingSent = await getPendingRequestsSent(data.supabase);
	}

	async function handleSearch() {
		if (searchQuery.trim().length < 2) {
			searchResults = [];
			return;
		}

		searching = true;
		const { data: profiles, error } = await data.supabase
			.from('profiles')
			.select('id, username, display_name')
			.ilike('username', `%${searchQuery.trim()}%`)
			.neq('id', data.session!.user.id)
			.limit(10);

		console.log('Search profiles:', profiles, error);

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

	async function handleAddFriend() {
		if (!newFriendUsername.trim()) return;

		addFriendLoading = true;
		addFriendError = '';

		const result = await sendFriendRequest(
			data.supabase,
			data.session!.user.id,
			newFriendUsername.trim()
		);

		if (result.success) {
			newFriendUsername = '';
			showAddFriend = false;
			await loadFriends();
		} else {
			addFriendError = result.error || 'Failed to send request';
		}

		addFriendLoading = false;
	}

	async function handleAcceptRequest(requesterId: string) {
		const result = await acceptFriendRequest(data.supabase, data.session!.user.id, requesterId);

		if (result.success) {
			await loadFriends();
		}
	}

	async function handleRejectRequest(requesterId: string) {
		const result = await rejectFriendRequest(data.supabase, data.session!.user.id, requesterId);

		if (result.success) {
			await loadFriends();
		}
	}

	async function handleRemoveFriend(friendId: string, friendName: string) {
		if (!confirm(`Remove ${friendName} as a friend?`)) return;

		const result = await removeFriend(data.supabase, data.session!.user.id, friendId);

		if (result.success) {
			await loadFriends();
		}
	}

	async function handleSendRequest(userId: string) {
		const profile = searchResults.find((p) => p.id === userId);
		if (!profile) return;

		const result = await sendFriendRequest(data.supabase, data.session!.user.id, profile.username);

		if (result.success) {
			searchQuery = '';
			searchResults = [];
			await loadFriends();
		}
	}

	// Reactive search
	$: if (searchQuery.length >= 2) {
		handleSearch();
	} else {
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
					<button
						class="clear-btn"
						on:click={() => {
							searchQuery = '';
							searchResults = [];
						}}
						aria-label="Clear search"
					>
						✕
					</button>
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
							<button class="add-btn" on:click={() => handleSendRequest(result.id)}> Add </button>
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
				on:click={() => (activeTab = 'friends')}
			>
				Friends
				<span class="tab-count">{friends.length}</span>
			</button>
			<button
				class="tab"
				class:active={activeTab === 'requests'}
				on:click={() => (activeTab = 'requests')}
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
									{#if friend.is_sharing}
										<span class="status-badge online">🟢 Sharing</span>
									{:else}
										<span class="status-badge offline">⚫ Offline</span>
									{/if}
									<button
										class="menu-btn"
										on:click={() =>
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
										on:click={() => handleAcceptRequest(request.requester_id)}
									>
										✓
									</button>
									<button
										class="reject-btn"
										on:click={() => handleRejectRequest(request.requester_id)}
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

	/* Search Section */
	.search-section {
		padding: 16px;
		background: #000;
		position: sticky;
		/* top: 64px; */
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

	/* Search Results */
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

	/* Tabs */
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

	/* Content */
	.content-section {
		padding: 16px;
	}

	/* User Avatar */
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

	/* Friends List */
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

	.status-badge.online {
		color: #4caf50;
		background: rgba(76, 175, 80, 0.1);
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

	/* Requests */
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

	/* Empty State */
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
