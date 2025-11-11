<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import '../../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import InvitationBadge from '$lib/components/InvitationBadge.svelte';
	import { notifications } from '$lib/stores/notifications';
	import {
		syncPushSubscription,
		subscribeToPushNotifications,
		hasPushSubscription
	} from '$lib/notifications';
	import { startGeofencing, stopGeofencing, loadActiveCheckIns } from '$lib/geofence';
	import { initializeQueueProcessor } from '$lib/offlineQueue';

	let { data } = $props();
	let { supabase, session, user } = $derived(data);

	// Get current path reactively
	let currentPath = page.url.pathname;

	// State
	let notificationsEnabled = $state(false);
	let geofencingActive = $state(false);
	let showNotificationPrompt = $state(false);
	let isOnline = $state(true);
	let profile = $state<any>(null);

	const navItems = [
		{ path: '/home', label: 'Home', icon: '🏠' },
		{ path: '/map', label: 'Map', icon: '🗺️' },
		{ path: '/friends', label: 'Friends', icon: '👥' },
		{ path: '/places', label: 'Places', icon: '📍' }
	];

	async function handleSignOut() {
		await supabase.auth.signOut();
		goto('/');
	}

	function handleVisibilityChange() {
		if (browser && document.visibilityState === 'visible' && user?.id) {
			console.log('👀 App became visible');
			// Supabase Realtime handles reconnection automatically
		}
	}

	async function initializeUserFeatures() {
		if (!user?.id) return;

		console.log('🚀 Initializing user features for:', user.id);

		// Initialize offline queue
		initializeQueueProcessor(supabase);

		// Load user profile
		const { data: profileData } = await supabase
			.from('profiles')
			.select('*')
			.eq('id', user.id)
			.single();

		profile = profileData;
		console.log('User profile loaded:', profile);

		// Sync push subscriptions
		await syncPushSubscription(supabase, user.id);

		// Check if user has push subscription
		const hasSubscription = await hasPushSubscription(supabase, user.id);
		notificationsEnabled = hasSubscription;

		// Initialize realtime notifications
		notifications.init(supabase, user.id);

		// If user is sharing location, start geofencing
		if (profile?.is_sharing) {
			await startLocationSharing();
		} else if (!hasSubscription && shouldShowPrompt()) {
			// Show notification prompt after a few seconds if not enabled
			setTimeout(() => {
				showNotificationPrompt = true;
			}, 3000);
		}
	}

	async function startLocationSharing() {
		if (!user?.id) return;

		try {
			// Enable notifications if not already enabled
			if (!notificationsEnabled) {
				const subscription = await subscribeToPushNotifications(supabase, user.id);
				if (subscription) {
					notificationsEnabled = true;
					console.log('✅ Push notifications enabled');
				}
			}

			// Load existing check-ins
			await loadActiveCheckIns(supabase, user.id);

			// Start geofencing
			startGeofencing(supabase, user.id);
			geofencingActive = true;

			// Update profile
			await supabase.from('profiles').update({ is_sharing: true }).eq('id', user.id);

			console.log('✅ Location sharing started');
		} catch (error) {
			console.error('❌ Error starting location sharing:', error);
		}
	}

	async function stopLocationSharing() {
		if (!user?.id) return;

		try {
			stopGeofencing();
			geofencingActive = false;

			await supabase.from('profiles').update({ is_sharing: false }).eq('id', user.id);

			console.log('✅ Location sharing stopped');
		} catch (error) {
			console.error('❌ Error stopping location sharing:', error);
		}
	}

	function dismissNotificationPrompt() {
		showNotificationPrompt = false;
		if (browser) {
			localStorage.setItem('notification-prompt-dismissed', Date.now().toString());
		}
	}

	function shouldShowPrompt(): boolean {
		if (!browser) return false;

		const dismissed = localStorage.getItem('notification-prompt-dismissed');
		if (!dismissed) return true;

		const dismissedTime = parseInt(dismissed);
		const dayInMs = 24 * 60 * 60 * 1000;
		return Date.now() - dismissedTime > dayInMs;
	}

	async function enableNotifications() {
		if (!user?.id) return;

		const subscription = await subscribeToPushNotifications(supabase, user.id);
		if (subscription) {
			notificationsEnabled = true;
			showNotificationPrompt = false;
			console.log('✅ Notifications enabled');
		} else {
			console.error('❌ Failed to enable notifications');
		}
	}

	onMount(async () => {
		console.log('📱 App layout mounted');

		// Monitor online/offline status
		isOnline = navigator.onLine;
		window.addEventListener('online', () => {
			isOnline = true;
			console.log('🌐 Connection restored');
		});
		window.addEventListener('offline', () => {
			isOnline = false;
			console.log('📡 Connection lost');
		});

		// Initialize user features
		if (user?.id) {
			await initializeUserFeatures();
		}

		// Listen for page visibility changes
		if (browser) {
			document.addEventListener('visibilitychange', handleVisibilityChange);
		}
	});

	onDestroy(() => {
		console.log('📱 App layout unmounting');

		// Cleanup notifications
		notifications.cleanup(supabase);

		// Cleanup geofencing
		if (geofencingActive) {
			stopGeofencing();
		}

		// Remove event listeners
		if (browser) {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('online', () => {});
			window.removeEventListener('offline', () => {});
		}
	});
</script>

<div class="app-shell">
	<!-- Offline indicator -->
	{#if !isOnline}
		<div class="offline-banner">📡 You're offline. Changes will sync when reconnected.</div>
	{/if}

	<!-- Then in the template: -->
	{#if showNotificationPrompt && user?.id}
		<div class="notification-prompt">
			<p>Enable notifications to stay updated with your friends' locations</p>
			<button onclick={enableNotifications}>Enable</button>
			<button onclick={dismissNotificationPrompt}>Maybe Later</button>
		</div>
	{/if}

	<!-- Header -->
	<header class="header">
		<div class="header-content">
			<h1 class="app-title">
				{#if currentPath === '/home'}
					Home
				{:else if currentPath === '/map'}
					Map
				{:else if currentPath === '/friends'}
					Friends
				{:else if currentPath === '/places'}
					Places
				{:else}
					Location Share
				{/if}
			</h1>

			<div class="header-actions">
				{#if user?.id}
					<InvitationBadge {supabase} userId={user.id} />
				{/if}
				<button class="icon-btn" onclick={() => goto('/settings/profile')} aria-label="Profile">
					<div class="avatar">
						{profile?.display_name?.charAt(0)?.toUpperCase() ||
							profile?.username?.charAt(0)?.toUpperCase() ||
							'?'}
					</div>
				</button>
				<button class="icon-btn" onclick={() => goto('/settings')} aria-label="Settings">
					⚙️
				</button>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="main-content">
		<slot />
	</main>

	<!-- Bottom Navigation -->
	<nav class="bottom-nav">
		{#each navItems as item}
			<a
				href={item.path}
				class="nav-item"
				class:active={currentPath === item.path}
				aria-label={item.label}
			>
				<span class="nav-icon">{item.icon}</span>
				<span class="nav-label">{item.label}</span>
			</a>
		{/each}
	</nav>
</div>

<style>
	.app-shell {
		flex-direction: column;
		height: 100vh;
		background: #000;
		color: #fff;
	}

	.offline-banner {
		background: #ff6b35;
		color: white;
		padding: 8px;
		text-align: center;
		font-size: 14px;
		font-weight: 600;
	}

	.notification-prompt {
		background: #1a1a1a;
		border-bottom: 1px solid #333;
		padding: 16px;
		text-align: center;
	}

	.notification-prompt p {
		margin: 0 0 12px 0;
		font-size: 14px;
	}

	.notification-prompt button {
		margin: 0 8px;
		padding: 8px 16px;
		border-radius: 8px;
		border: none;
		cursor: pointer;
		font-weight: 600;
	}

	.notification-prompt button:first-of-type {
		background: var(--color-primary);
		color: white;
	}

	.notification-prompt button:last-of-type {
		background: transparent;
		color: #999;
	}

	/* Header */
	.header {
		background: #000;
		border-bottom: 1px solid #1a1a1a;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		max-width: 100%;
	}

	.app-title {
		font-size: 24px;
		font-weight: 700;
		margin: 0;
		color: #fff;
	}

	.header-actions {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.icon-btn {
		background: transparent;
		border: none;
		padding: 8px;
		cursor: pointer;
		border-radius: 50%;
		transition: background 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-btn:hover {
		background: #1a1a1a;
	}

	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 16px;
		color: #fff;
	}

	/* Main Content */
	.main-content {
		flex: 1;
		overflow-y: auto;
		background: #000;
		padding-bottom: 70px;
	}

	/* Bottom Navigation */
	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		background: #0a0a0a;
		border-top: 1px solid #1a1a1a;
		padding: 8px 0;
		z-index: 100;
	}

	.nav-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 8px 0;
		text-decoration: none;
		color: #666;
		transition: color 0.2s;
	}

	.nav-item.active {
		color: var(--color-primary);
	}

	.nav-item:hover {
		color: var(--color-primary);
	}

	.nav-icon {
		font-size: 24px;
		margin-bottom: 4px;
	}

	.nav-label {
		font-size: 11px;
		font-weight: 600;
	}

	/* Scrollbar styling */
	.main-content::-webkit-scrollbar {
		width: 6px;
	}

	.main-content::-webkit-scrollbar-track {
		background: #0a0a0a;
	}

	.main-content::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 3px;
	}
</style>
