<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { CheckIn, MyActiveCheckIn } from '$lib/types';

	export let data: PageData;

	let activeCheckIns: MyActiveCheckIn[] = [];
	let recentActivity: any[] = [];
	let loading = true;
	let currentWeek = getCurrentWeek();

	onMount(async () => {
		await Promise.all([loadActiveCheckIns(), loadRecentActivity()]);
		loading = false;
	});

	function getCurrentWeek() {
		const now = new Date();
		const monday = new Date(now);
		monday.setDate(now.getDate() - now.getDay() + 1);

		const days = [];
		for (let i = 0; i < 7; i++) {
			const day = new Date(monday);
			day.setDate(monday.getDate() + i);
			days.push({
				date: day,
				label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
				dayNum: day.getDate(),
				hasActivity: false // We'll update this with real data
			});
		}
		return days;
	}

	async function loadActiveCheckIns() {
		const { data: checkIns } = await data.supabase.from('my_active_checkins').select('*');

		activeCheckIns = checkIns || [];
	}

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
		<!-- Activity Streak
		<section class="streak-section">
			<div class="streak-header">
				<h2>Your streak</h2>
				<a href="/calendar" class="view-calendar">View calendar</a>
			</div>

			<div class="streak-card">
				<div class="streak-icon">
					<span class="fire-icon">🔥</span>
					<span class="streak-count">3</span>
					<span class="streak-label">Weeks</span>
				</div>

				<div class="week-calendar">
					{#each currentWeek as day}
						<div class="day-item">
							<div class="day-label">{day.label}</div>
							<div class="day-circle" class:has-activity={day.hasActivity}>
								{#if day.hasActivity}
									<span class="activity-icon">🛹</span>
								{:else}
									<span class="day-number">{day.dayNum}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</section> -->

		<!-- Active Check-ins -->
		{#if activeCheckIns.length > 0}
			<section class="active-section">
				<h2 class="section-title">Currently at</h2>
				{#each activeCheckIns as checkIn}
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
				{#each recentActivity as activity}
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

						<!-- Mock map preview -->
						<div class="map-preview">
							<div class="map-placeholder">
								<span class="map-icon">🗺️</span>
							</div>
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
		border-top-color: #fc4c02;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Sections */
	/* Streak Section */
	/* .streak-section,
	.active-section,
	.activity-section {
		padding: 20px 16px;
	}

	.streak-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.streak-header h2 {
		font-size: 18px;
		font-weight: 700;
		margin: 0;
		color: #fff;
	}

	.view-calendar {
		color: #fc4c02;
		text-decoration: none;
		font-size: 14px;
		font-weight: 600;
	}

	.section-title {
		font-size: 18px;
		font-weight: 700;
		margin: 0 0 16px 0;
		color: #fff;
	}
	*/

	/* Streak Card */
	/*.streak-card {
		background: #0a0a0a;
		border-radius: 12px;
		padding: 24px 0;
		display: flex;
		align-items: center;
		gap: 24px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS 
	}

	/* Hide scrollbar but keep functionality */
	/*.streak-card::-webkit-scrollbar {
		display: none;
	}

	.streak-card {
		-ms-overflow-style: none; /* IE and Edge */ /*
		scrollbar-width: none; /* Firefox */ /*
	}
	
	.streak-icon {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		flex-shrink: 0; /* Prevent shrinking */ /*
		padding-left: 16px;
	}

	.fire-icon {
		font-size: 48px;
	}

	.streak-count {
		font-size: 32px;
		font-weight: 700;
		color: #fc4c02;
		line-height: 1;
	}

	.streak-label {
		font-size: 14px;
		color: #999;
		font-weight: 600;
	}

	.week-calendar {
		display: flex;
		gap: 12px;
		flex-shrink: 0; /* Prevent calendar from shrinking */ /*
		padding-right: 16px;
	}

	.day-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.day-label {
		font-size: 12px;
		color: #999;
		font-weight: 600;
	}

	.day-circle {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: #1a1a1a;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		color: #666;
		font-weight: 600;
		border: 2px solid #1a1a1a;
	}

	.day-circle.has-activity {
		background: #fc4c02;
		border-color: #fc4c02;
	}

	.activity-icon {
		font-size: 20px;
	}

	.day-number {
		font-size: 14px;
		color: #666;
	}
	*/

	/* Activity Cards */
	.activity-card {
		background: #0a0a0a;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 16px;
		border: 1px solid #1a1a1a;
	}

	.activity-card.active {
		border-color: #fc4c02;
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
		background: linear-gradient(135deg, #fc4c02 0%, #ff6b35 100%);
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
		background: #fc4c02;
		color: #fff;
		padding: 4px 10px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 700;
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
	}

	.time-badge,
	.group-badge {
		font-weight: 600;
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

	.map-preview {
		margin-top: 12px;
	}

	.map-placeholder {
		background: #1a1a1a;
		border-radius: 8px;
		height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.map-icon {
		font-size: 48px;
		opacity: 0.3;
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
