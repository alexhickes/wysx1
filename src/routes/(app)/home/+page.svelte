<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { MyActiveCheckIn } from '$lib/types';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import {
		subscribeCheckInChanges,
		subscribeMyCheckIns,
		unsubscribeCheckInChanges
	} from '$lib/checkins';
	import { browser } from '$app/environment';

	let { data }: { data: PageData } = $props();

	// Derived values from data
	let { supabase, session } = $derived(data);

	let activeCheckIns = $state<MyActiveCheckIn[]>([]);
	let friendCheckIns = $state<any[]>([]);
	let recentActivity = $state<any[]>([]);
	let loading = $state(true);
	let friendCheckInChannel = $state<RealtimeChannel | null>(null);
	let myCheckInChannel = $state<RealtimeChannel | null>(null);

	// Group friend check-ins by place
	let friendsCheckInsGrouped = $derived(groupCheckInsByPlace(friendCheckIns));

	function groupCheckInsByPlace(checkIns: any[]) {
		const grouped = new Map();

		checkIns.forEach((checkIn) => {
			if (!checkIn.places) return;

			const placeId = checkIn.places.id;
			if (!grouped.has(placeId)) {
				grouped.set(placeId, {
					place: checkIn.places,
					checkIns: []
				});
			}
			grouped.get(placeId).checkIns.push(checkIn);
		});

		return Array.from(grouped.values());
	}

	onMount(async () => {
		console.log('🏠 Home page mounted');

		// Load initial data
		await Promise.all([loadActiveCheckIns(), loadFriendCheckIns(), loadRecentActivity()]);

		// Setup Realtime for friends' check-ins
		if (data.session?.user?.id) {
			console.log('📡 Setting up friend check-in subscription...');
			friendCheckInChannel = subscribeCheckInChanges(
				data.supabase,
				data.session.user.id,
				handleFriendCheckInChange
			);
		}

		// Setup Realtime for my own check-ins
		if (data.session?.user?.id) {
			console.log('📡 Setting up my check-in subscription...');
			myCheckInChannel = subscribeMyCheckIns(
				data.supabase,
				data.session.user.id,
				handleMyCheckInChange
			);
		}

		loading = false;

		// Listen for page visibility changes
		if (browser) {
			document.addEventListener('visibilitychange', handleVisibilityChange);
		}
	});

	onDestroy(() => {
		console.log('🏠 Home page unmounting - cleaning up');

		// Cleanup friend check-in subscription
		if (friendCheckInChannel) {
			unsubscribeCheckInChanges(data.supabase, friendCheckInChannel);
		}

		// Cleanup my check-in subscription
		if (myCheckInChannel) {
			unsubscribeCheckInChanges(data.supabase, myCheckInChannel);
		}

		// Remove visibility listener
		if (browser) {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		}
	});

	/**
	 * Handle realtime updates for friends' check-ins
	 */
	function handleFriendCheckInChange(payload: any) {
		console.log('🔄 Friend check-in changed, reloading...');
		loadFriendCheckIns();
	}

	/**
	 * Handle realtime updates for my own check-ins
	 */
	function handleMyCheckInChange(payload: any) {
		console.log('🔄 My check-in changed, reloading...');
		loadActiveCheckIns();
		loadRecentActivity();
	}

	// Handle page visibility changes - ONLY RELOAD, don't cleanup
	function handleVisibilityChange() {
		if (browser && document.visibilityState === 'visible') {
			console.log('👀 Page became visible, reloading data...');
			Promise.all([loadActiveCheckIns(), loadFriendCheckIns(), loadRecentActivity()]);
		}
	}

	async function loadActiveCheckIns() {
		const { data: checkIns } = await data.supabase.from('my_active_checkins').select('*');
		console.log('📍 My Active Check-Ins:', checkIns?.length || 0);
		activeCheckIns = checkIns || [];
	}

	async function loadFriendCheckIns() {
		// First, get list of friend IDs
		const { data: friendships } = await data.supabase
			.from('my_friends') // Your view for accepted friends
			.select('friend_id');

		if (!friendships || friendships.length === 0) {
			friendCheckIns = [];
			return;
		}

		const friendIds = friendships.map((f) => f.friend_id);

		// Then get their active check-ins
		const { data: checkIns } = await data.supabase
			.from('check_ins')
			.select(
				`
				id,
				user_id,
				place_id,
				group_id,
				activity_id,
				checked_in_at,
				checked_out_at,
				places!inner(
					id,
					name,
					place_type,
					latitude,
					longitude
				),
				profiles!inner(
					id,
					username,
					display_name
				),
				activities(
					id,
					name,
					icon
				),
				groups(
					id,
					name
				)
				`
			)
			.is('checked_out_at', null)
			.in('user_id', friendIds)
			.order('checked_in_at', { ascending: false });

		friendCheckIns = checkIns || [];
	}

	// async function loadFriendCheckIns() {
	// 	// Query for friends' active check-ins
	// 	// This assumes you have a view or can query based on friendships
	// 	const { data: checkIns } = await data.supabase
	// 		.from('check_ins')
	// 		.select(
	// 			`
	// 			id,
	// 			user_id,
	// 			place_id,
	// 			group_id,
	// 			activity_id,
	// 			checked_in_at,
	// 			checked_out_at,
	// 			places!inner(
	// 				id,
	// 				name,
	// 				place_type,
	// 				latitude,
	// 				longitude
	// 			),
	// 			profiles!inner(
	// 				id,
	// 				username,
	// 				display_name
	// 			),
	// 			activities(
	// 				id,
	// 				name,
	// 				icon
	// 			),
	// 			groups(
	// 				id,
	// 				name
	// 			)
	// 		`
	// 		)
	// 		.is('checked_out_at', null)
	// 		.neq('user_id', data.session?.user.id)
	// 		.order('checked_in_at', { ascending: false });

	// 	console.log('👥 Friend Check-Ins:', checkIns?.length || 0);

	// 	// Filter to only show friends (you might need to join with friendships table)
	// 	// For now, showing all active check-ins except yours
	// 	friendCheckIns = checkIns || [];
	// }

	async function loadRecentActivity() {
		const { data: checkIns } = await data.supabase
			.from('check_ins')
			.select(
				`
				*,
				place:places(name, latitude, longitude),
				activity:activities(name, icon),
				profile:profiles(username, display_name)
			`
			)
			.eq('user_id', data.session?.user.id)
			.not('checked_out_at', 'is', null)
			.order('checked_in_at', { ascending: false })
			.limit(10);

		console.log('📜 Recent Activity:', checkIns?.length || 0);
		recentActivity = checkIns || [];
	}

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		const now = new Date();
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === now.toDateString()) {
			return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		} else if (date.toDateString() === yesterday.toDateString()) {
			return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		} else {
			return date.toLocaleDateString([], {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		}
	}

	function formatDuration(checkedIn: string, checkedOut: string) {
		const start = new Date(checkedIn);
		const end = new Date(checkedOut);
		const diff = end.getTime() - start.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;

		if (hours > 0) {
			return `${hours}h ${mins}m`;
		}
		return `${mins}m`;
	}

	function formatTimeAgo(dateString: string) {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	function getPlaceIcon(placeType: string): string {
		const icons: Record<string, string> = {
			skatepark: '🛹',
			gym: '🏋️',
			climbing: '🧗',
			cafe: '☕',
			coworking: '💻',
			park: '🌳',
			sports: '⚽'
		};
		return icons[placeType] || '📍';
	}

	function goToPlace(placeId: string) {
		goto(`/places/${placeId}`);
	}
</script>

<svelte:head>
	<title>Home - Location Share</title>
</svelte:head>

<div class="home-page">
	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
		</div>
	{:else}
		<!-- My Active Check-ins -->
		{#if activeCheckIns.length > 0}
			<section class="active-section">
				<h2 class="section-title">Currently at</h2>
				{#each activeCheckIns as checkIn (checkIn.id)}
					<div class="activity-card active">
						<div class="card-header">
							<div class="location-badge">
								📍 {checkIn.place_name}
							</div>
							<span class="live-badge">LIVE</span>
						</div>
						{#if checkIn.activity_name}
							<p class="activity-type">{checkIn.activity_name}</p>
						{/if}
						<div class="card-meta">
							<span class="time-badge">
								Since {new Date(checkIn.checked_in_at).toLocaleTimeString([], {
									hour: '2-digit',
									minute: '2-digit'
								})}
							</span>
							{#if checkIn.group_name}
								<span class="group-badge">• {checkIn.group_name}</span>
							{/if}
						</div>
					</div>
				{/each}
			</section>
		{/if}

		<!-- Friends at Locations - Real-time! -->
		{#if friendsCheckInsGrouped.length > 0}
			<section class="friends-section">
				<h2 class="section-title">
					Friends at locations
					<span class="live-indicator-title">
						<span class="pulse-dot-small"></span>
						LIVE
					</span>
				</h2>

				{#each friendsCheckInsGrouped as placeGroup (placeGroup.place.id)}
					<div
						class="place-card"
						role="button"
						tabindex="0"
						onclick={() => goToPlace(placeGroup.place.id)}
						onkeydown={(e) => e.key === 'Enter' && goToPlace(placeGroup.place.id)}
					>
						<div class="place-header">
							<div class="place-icon-badge">
								{getPlaceIcon(placeGroup.place.place_type)}
							</div>
							<div class="place-info">
								<div class="place-name">{placeGroup.place.name}</div>
								<div class="people-count">
									{placeGroup.checkIns.length}
									{placeGroup.checkIns.length === 1 ? 'person' : 'people'} here
								</div>
							</div>
							<div class="live-indicator">
								<span class="pulse-dot"></span>
							</div>
						</div>

						<div class="people-list">
							{#each placeGroup.checkIns as checkIn (checkIn.id)}
								<div class="person-item">
									<div class="person-avatar">
										{checkIn.profiles?.display_name?.charAt(0)?.toUpperCase() ||
											checkIn.profiles?.username?.charAt(0)?.toUpperCase() ||
											'?'}
									</div>
									<div class="person-details">
										<span class="person-name">
											{checkIn.profiles?.display_name || checkIn.profiles?.username}
										</span>
										<span class="person-time">
											{formatTimeAgo(checkIn.checked_in_at)}
										</span>
									</div>
									{#if checkIn.activities}
										<span class="activity-badge">
											{checkIn.activities.icon || '🎯'}
											{checkIn.activities.name}
										</span>
									{/if}
									{#if checkIn.groups}
										<span class="group-tag">
											{checkIn.groups.name}
										</span>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</section>
		{:else}
			<section class="friends-section">
				<h2 class="section-title">Friends at locations</h2>
				<div class="empty-state-small">
					<p>No friends are currently checked in</p>
				</div>
			</section>
		{/if}

		<!-- Recent Activity Feed -->
		<section class="activity-section">
			<h2 class="section-title">Recent activity</h2>

			{#if recentActivity.length === 0}
				<div class="empty-state">
					<span class="empty-icon">🎯</span>
					<h3>No recent activity</h3>
					<p>Start checking in to places to see your activity here</p>
				</div>
			{:else}
				{#each recentActivity as activity (activity.id)}
					<div class="activity-card">
						<div class="card-header">
							<div class="user-info">
								<div class="user-avatar">
									{activity.profile?.display_name?.charAt(0)?.toUpperCase() ||
										activity.profile?.username?.charAt(0)?.toUpperCase() ||
										'?'}
								</div>
								<div class="user-details">
									<span class="user-name">
										{activity.profile?.display_name || activity.profile?.username}
									</span>
									<span class="activity-time">
										{formatDate(activity.checked_in_at)}
									</span>
								</div>
							</div>
						</div>

						<div class="activity-title">
							📍 {activity.place?.name || 'Unknown Place'}
						</div>

						<div class="activity-stats">
							{#if activity.activity?.name}
								<div class="stat">
									<span class="stat-label">Activity</span>
									<span class="stat-value">
										{activity.activity.icon || ''}
										{activity.activity.name}
									</span>
								</div>
							{/if}
							{#if activity.checked_out_at}
								<div class="stat">
									<span class="stat-label">Duration</span>
									<span class="stat-value">
										{formatDuration(activity.checked_in_at, activity.checked_out_at)}
									</span>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</section>
	{/if}
</div>

<style>
	.home-page {
		min-height: 100%;
		background: #000;
		padding-bottom: 80px;
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

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.active-section,
	.friends-section,
	.activity-section {
		padding: 20px 16px;
	}

	.section-title {
		font-size: 18px;
		font-weight: 700;
		margin: 0 0 16px 0;
		color: #fff;
	}

	.live-indicator-title {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--color-primary);
		font-weight: 700;
		margin-left: 8px;
	}

	.pulse-dot-small {
		display: block;
		width: 8px;
		height: 8px;
		background: var(--color-primary);
		border-radius: 50%;
		animation: pulse-ring 2s infinite;
	}

	.empty-state-small {
		text-align: center;
		padding: 40px 20px;
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
	}

	.empty-state-small p {
		font-size: 14px;
		color: #666;
		margin: 0;
	}

	.activity-card {
		background: #0a0a0a;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 16px;
		border: 1px solid #1a1a1a;
		animation: fadeIn 0.3s ease-out;
	}

	.activity-card.active {
		border-color: var(--color-primary);
		background: linear-gradient(135deg, rgba(252, 76, 2, 0.1) 0%, rgba(255, 107, 53, 0.05) 100%);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 12px;
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
	}

	.user-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.user-name {
		font-size: 14px;
		font-weight: 600;
		color: #fff;
	}

	.activity-time {
		font-size: 12px;
		color: #666;
	}

	.location-badge {
		font-size: 14px;
		font-weight: 600;
		color: #fff;
	}

	.live-badge {
		background: var(--color-primary);
		color: #fff;
		padding: 4px 10px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 700;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.activity-type {
		font-size: 14px;
		color: #999;
		margin: 8px 0;
	}

	.card-meta {
		display: flex;
		gap: 8px;
		font-size: 12px;
		color: #666;
		flex-wrap: wrap;
	}

	.time-badge,
	.group-badge {
		font-weight: 600;
	}

	.place-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 12px;
		cursor: pointer;
		transition: all 0.2s;
		animation: fadeIn 0.3s ease-out;
	}

	.place-card:hover {
		border-color: var(--color-primary);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(252, 76, 2, 0.15);
	}

	.place-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.place-icon-badge {
		width: 48px;
		height: 48px;
		background: #1a1a1a;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
		flex-shrink: 0;
	}

	.place-info {
		flex: 1;
		min-width: 0;
	}

	.place-name {
		font-size: 16px;
		font-weight: 700;
		color: #fff;
		margin-bottom: 4px;
	}

	.people-count {
		font-size: 13px;
		color: var(--color-primary);
		font-weight: 600;
	}

	.live-indicator {
		flex-shrink: 0;
	}

	.pulse-dot {
		display: block;
		width: 12px;
		height: 12px;
		background: var(--color-primary);
		border-radius: 50%;
		animation: pulse-ring 2s infinite;
		position: relative;
	}

	.pulse-dot::before {
		content: '';
		position: absolute;
		width: 100%;
		height: 100%;
		background: var(--color-primary);
		border-radius: 50%;
		animation: pulse-ring 2s infinite;
	}

	@keyframes pulse-ring {
		0% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.5);
			opacity: 0.5;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.people-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.person-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: #000;
		border-radius: 8px;
		animation: slideIn 0.3s ease-out;
	}

	.person-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: #fff;
		font-size: 14px;
		flex-shrink: 0;
	}

	.person-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.person-name {
		font-size: 14px;
		font-weight: 600;
		color: #fff;
	}

	.person-time {
		font-size: 12px;
		color: #666;
	}

	.activity-badge {
		font-size: 11px;
		padding: 4px 8px;
		background: rgba(252, 76, 2, 0.1);
		color: var(--color-primary);
		border-radius: 6px;
		font-weight: 600;
		white-space: nowrap;
	}

	.group-tag {
		font-size: 11px;
		padding: 4px 8px;
		background: #1a1a1a;
		color: #999;
		border-radius: 6px;
		font-weight: 600;
		white-space: nowrap;
	}

	.activity-title {
		font-size: 18px;
		font-weight: 700;
		color: #fff;
		margin-bottom: 12px;
	}

	.activity-stats {
		display: flex;
		gap: 24px;
		margin-bottom: 16px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-label {
		font-size: 12px;
		color: #666;
		text-transform: uppercase;
		font-weight: 600;
	}

	.stat-value {
		font-size: 16px;
		color: #fff;
		font-weight: 600;
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

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (max-width: 768px) {
		.person-item {
			flex-wrap: wrap;
		}

		.activity-badge,
		.group-tag {
			order: 3;
		}
	}
</style>
