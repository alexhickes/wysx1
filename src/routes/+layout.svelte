<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import '../styles.css';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	import {
		subscribeToPushNotifications,
		hasPushSubscription,
		getNotificationPermission
	} from '$lib/notifications';
	import { startGeofencing, stopGeofencing, loadActiveCheckIns } from '$lib/geofence';
	import { initializeQueueProcessor } from '$lib/offlineQueue';

	let { data, children } = $props();
	let { supabase, session } = $derived(data);

	let notificationsEnabled = false;
	let geofencingActive = false;
	let showNotificationPrompt = false;
	let isOnline = true;

	onMount(async () => {
		// Initialize offline queue processor
		if (data.supabase && data.session) {
			initializeQueueProcessor(data.supabase);
		}

		// Monitor online/offline status
		isOnline = navigator.onLine;
		window.addEventListener('online', () => {
			isOnline = true;
			console.log('Connection restored');
		});
		window.addEventListener('offline', () => {
			isOnline = false;
			console.log('Connection lost');
		});

		// Check if user is logged in
		if (data.session?.user) {
			console.log('User is logged in, initializing features');
			await initializeUserFeatures();
		}

		// const { data } = supabase.auth.onAuthStateChange((event, _session) => {
		// 	if (_session?.expires_at !== session?.expires_at) {
		// 		invalidate('supabase:auth');
		// 	}
		// });

		// Listen for auth state changes
		data.supabase.auth.onAuthStateChange(async (event, session) => {
			if (event === 'SIGNED_IN' && session) {
				await initializeUserFeatures();
			} else if (event === 'SIGNED_OUT') {
				stopGeofencing();
				notificationsEnabled = false;
				geofencingActive = false;
			}
		});

		// data.subscription.unsubscribe();
		// return () => data.subscription.unsubscribe();
	});

	async function initializeUserFeatures() {
		if (!data.session?.user) return;

		const userId = data.session.user.id;

		// Check if user has push subscription
		const hasSubscription = await hasPushSubscription();
		notificationsEnabled = hasSubscription;

		// Load user's profile settings
		const { data: profile } = await data.supabase
			.from('profiles')
			.select('username, display_name, is_sharing')
			.eq('id', userId)
			.single();

		console.log('User profile:', profile);

		// If user is sharing location, start geofencing
		if (profile?.is_sharing) {
			await startLocationSharing();
		} else {
			// Show notification prompt after a few seconds if not enabled
			if (!hasSubscription && shouldShowPrompt()) {
				setTimeout(() => {
					showNotificationPrompt = true;
				}, 3000);
			}
		}
	}

	async function startLocationSharing() {
		if (!data.session?.user) return;

		const userId = data.session.user.id;

		try {
			// Enable notifications if not already enabled
			if (!notificationsEnabled) {
				const subscription = await subscribeToPushNotifications(data.supabase, userId);
				if (subscription) {
					notificationsEnabled = true;
					console.log('Push notifications enabled');
				}
			}

			// Load existing check-ins
			await loadActiveCheckIns(data.supabase, userId);

			// Start geofencing
			startGeofencing(data.supabase, userId);
			geofencingActive = true;

			// Update profile
			await data.supabase.from('profiles').update({ is_sharing: true }).eq('id', userId);

			console.log('Location sharing started');
		} catch (error) {
			console.error('Error starting location sharing:', error);
		}
	}

	async function stopLocationSharing() {
		if (!data.session?.user) return;

		const userId = data.session.user.id;

		try {
			// Stop geofencing
			stopGeofencing();
			geofencingActive = false;

			// Update profile
			await data.supabase.from('profiles').update({ is_sharing: false }).eq('id', userId);

			console.log('Location sharing stopped');
		} catch (error) {
			console.error('Error stopping location sharing:', error);
		}
	}

	async function enableNotifications() {
		if (!data.session?.user) return;

		const subscription = await subscribeToPushNotifications(data.supabase, data.session.user.id);

		if (subscription) {
			notificationsEnabled = true;
			showNotificationPrompt = false;
			console.log('Notifications enabled successfully');
		} else {
			alert('Failed to enable notifications. Please check your browser settings.');
		}
	}

	function dismissNotificationPrompt() {
		showNotificationPrompt = false;
		// Store dismissal in localStorage to not show again for a while
		if (browser) {
			localStorage.setItem('notification-prompt-dismissed', Date.now().toString());
		}
	}

	// Check if we should show the prompt based on dismissal history
	function shouldShowPrompt(): boolean {
		if (!browser) return false;

		const dismissed = localStorage.getItem('notification-prompt-dismissed');
		if (!dismissed) return true;

		const dismissedTime = parseInt(dismissed);
		const dayInMs = 24 * 60 * 60 * 1000;
		return Date.now() - dismissedTime > dayInMs; // Show again after 1 day
	}
</script>

<svelte:head>
	<title>Wys X</title>
</svelte:head>
<div class="container">
	{@render children()}
</div>
