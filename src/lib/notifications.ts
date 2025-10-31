import type { SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { PUBLIC_VAPID_KEY } from '$env/static/public';

// VAPID public key - you'll need to generate this
// Use: npx web-push generate-vapid-keys
// Then add to your .env file as PUBLIC_VAPID_KEY
// const VAPID_PUBLIC_KEY = import.meta.env.PUBLIC_VAPID_KEY || '';
// console.log('🚀 ~ VAPID_PUBLIC_KEY:', VAPID_PUBLIC_KEY);

export interface NotificationPayload {
	title: string;
	body: string;
	icon?: string;
	tag?: string;
	data?: any;
	requireInteraction?: boolean;
	actions?: Array<{
		action: string;
		title: string;
	}>;
}

/**
 * Check if notifications are supported
 */
export function isNotificationSupported(): boolean {
	return browser && 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
	if (!isNotificationSupported()) {
		console.error('Notifications not supported');
		return false;
	}

	if (Notification.permission === 'granted') {
		return true;
	}

	if (Notification.permission === 'denied') {
		console.log('Notification permission denied');
		return false;
	}

	const permission = await Notification.requestPermission();
	return permission === 'granted';
}

// Add iOS detection and PWA check
function isIOSPWA() {
	const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
	const isStandalone = (window.navigator as any).standalone === true;
	return isIOS && isStandalone;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(
	supabase: SupabaseClient,
	userId: string
): Promise<PushSubscription | null> {
	console.log('🔔 Starting push notification subscription...');
	console.log('📱 User Agent:', navigator.userAgent);

	if (!isNotificationSupported()) {
		console.error('❌ Push notifications not supported on this device/browser');
		return null;
	}

	try {
		// Check if VAPID key is configured first
		if (!PUBLIC_VAPID_KEY || PUBLIC_VAPID_KEY.trim() === '') {
			console.warn('⚠️ VAPID public key not configured');
			return null;
		}

		console.log('✓ VAPID key configured');

		// Wait for service worker to be ready with extra validation
		console.log('⏳ Waiting for service worker...');
		const registration = await navigator.serviceWorker.ready;

		// Ensure service worker is actually active
		if (!registration.active) {
			console.error('❌ Service worker not active');
			return null;
		}

		console.log('✓ Service worker ready, state:', registration.active.state);

		// Longer delay for mobile devices - they need more time
		const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
			navigator.userAgent
		);
		const delay = isMobile ? 500 : 200;
		console.log(`⏳ Waiting ${delay}ms for service worker to fully activate...`);
		await new Promise((resolve) => setTimeout(resolve, delay));

		// Check if already subscribed
		console.log('🔍 Checking existing subscription...');
		let subscription = await registration.pushManager.getSubscription();

		if (subscription) {
			console.log('✓ Already subscribed');
			await saveSubscription(supabase, userId, subscription);
			return subscription;
		}

		// Request permission after confirming service worker is ready
		console.log('🔐 Requesting notification permission...');
		const hasPermission = await requestNotificationPermission();
		console.log('Permission result:', Notification.permission);

		if (!hasPermission) {
			console.log('❌ Notification permission not granted');
			return null;
		}

		// Retry logic for push subscription (mobile needs this)
		console.log('📤 Subscribing to push notifications...');
		subscription = await subscribeWithRetry(registration, PUBLIC_VAPID_KEY, 3);

		console.log('✓ Push subscription created');

		// Save subscription to database
		console.log('💾 Saving subscription to database...');
		await saveSubscription(supabase, userId, subscription);
		console.log('✓ Subscription saved successfully');

		return subscription;
	} catch (error: any) {
		console.error('❌ Failed to subscribe:', error);
		console.error('Error name:', error.name);
		console.error('Error message:', error.message);

		if (error.name === 'InvalidAccessError') {
			console.error('VAPID key is invalid');
		} else if (error.name === 'AbortError') {
			console.error('Push subscription aborted - service worker not ready or race condition');
			console.error('Try again in a few seconds');
		} else if (error.name === 'NotAllowedError') {
			console.error('User denied notification permission');
		} else if (error.name === 'NotSupportedError') {
			console.error('Push notifications not supported on this device');
		}

		return null;
	}
}

/**
 * Subscribe with retry logic for mobile devices
 */
async function subscribeWithRetry(
	registration: ServiceWorkerRegistration,
	vapidKey: string,
	maxRetries: number = 3
): Promise<PushSubscription> {
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`📤 Subscription attempt ${attempt}/${maxRetries}...`);

			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapidKey)
			});

			console.log(`✓ Subscription successful on attempt ${attempt}`);
			return subscription;
		} catch (error: any) {
			console.warn(`⚠️ Attempt ${attempt} failed:`, error.name);
			lastError = error;

			// Don't retry on permission errors
			if (error.name === 'NotAllowedError' || error.name === 'NotSupportedError') {
				throw error;
			}

			// Wait longer between retries (exponential backoff)
			if (attempt < maxRetries) {
				const waitTime = attempt * 500; // 500ms, 1000ms, 1500ms
				console.log(`⏳ Waiting ${waitTime}ms before retry...`);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}
		}
	}

	console.error(`❌ All ${maxRetries} subscription attempts failed`);
	throw lastError || new Error('Push subscription failed');
}

// /**
//  * Subscribe to push notifications
//  */
// export async function subscribeToPushNotifications(
// 	supabase: SupabaseClient,
// 	userId: string
// ): Promise<PushSubscription | null> {
// 	console.log('🔔 Starting push notification subscription...');
// 	console.log('📱 User Agent:', navigator.userAgent);

// 	// iOS check
// 	const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
// 	if (isIOS && !isIOSPWA()) {
// 		console.warn('⚠️ iOS requires app to be added to home screen for push notifications');
// 		// Show user instructions to add to home screen
// 		return null;
// 	}

// 	if (!isNotificationSupported()) {
// 		console.error('❌ Push notifications not supported on this device/browser');
// 		console.log('ServiceWorker support:', 'serviceWorker' in navigator);
// 		console.log('PushManager support:', 'PushManager' in window);
// 		console.log('Notification support:', 'Notification' in window);
// 		return null;
// 	}

// 	try {
// 		// Check if VAPID key is configured first
// 		if (!PUBLIC_VAPID_KEY || PUBLIC_VAPID_KEY.trim() === '') {
// 			console.warn('⚠️ VAPID public key not configured');
// 			return null;
// 		}

// 		console.log('✓ VAPID key configured, length:', PUBLIC_VAPID_KEY.length);

// 		// Wait for service worker to be ready
// 		console.log('⏳ Waiting for service worker...');
// 		const registration = await navigator.serviceWorker.ready;
// 		console.log('✓ Service worker ready:', registration.active?.state);

// 		// Add small delay to ensure service worker is fully activated
// 		await new Promise((resolve) => setTimeout(resolve, 100));

// 		// Check if already subscribed
// 		console.log('🔍 Checking existing subscription...');
// 		let subscription = await registration.pushManager.getSubscription();

// 		if (subscription) {
// 			console.log('✓ Already subscribed:', subscription.endpoint);
// 			await saveSubscription(supabase, userId, subscription);
// 			return subscription;
// 		}

// 		// Request permission after confirming service worker is ready
// 		console.log('🔐 Requesting notification permission...');
// 		const hasPermission = await requestNotificationPermission();
// 		console.log('Permission result:', Notification.permission);

// 		if (!hasPermission) {
// 			console.log('Notification permission not granted');
// 			return null;
// 		}

// 		console.log('📤 Subscribing to push notifications...');

// 		// Subscribe to push notifications
// 		subscription = await registration.pushManager.subscribe({
// 			userVisibleOnly: true,
// 			applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
// 		});

// 		console.log('✓ Push subscription created:', subscription.endpoint);

// 		// Save subscription to database
// 		console.log('💾 Saving subscription to database...');
// 		await saveSubscription(supabase, userId, subscription);
// 		console.log('✓ Subscription saved successfully');

// 		return subscription;
// 	} catch (error: any) {
// 		console.error('Failed to subscribe:', error);
// 		console.error('Error name:', error.name);
// 		console.error('Error message:', error.message);
// 		console.error('Error stack:', error.stack);

// 		if (error.name === 'InvalidAccessError') {
// 			console.error('VAPID key is invalid');
// 		} else if (error.name === 'AbortError') {
// 			console.error('Push subscription aborted - race condition');
// 		} else if (error.name === 'NotAllowedError') {
// 			console.error('User denied notification permission');
// 		} else if (error.name === 'NotSupportedError') {
// 			console.error('Push notifications not supported on this device');
// 		}

// 		return null;
// 	}
// }

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(
	supabase: SupabaseClient,
	userId: string
): Promise<void> {
	if (!isNotificationSupported()) return;

	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();

		if (subscription) {
			await subscription.unsubscribe();
			await removeSubscription(supabase, userId);
			console.log('Successfully unsubscribed from push notifications');
		}
	} catch (error) {
		console.error('Failed to unsubscribe from push notifications:', error);
	}
}

async function saveSubscription(
	supabase: SupabaseClient,
	userId: string,
	subscription: PushSubscription
) {
	console.log('💾 Saving subscription for user:', userId);

	const subscriptionJson = subscription.toJSON();
	console.log('Subscription data:', subscriptionJson);

	const { data, error } = await supabase.from('push_subscriptions').upsert(
		{
			user_id: userId,
			subscription: subscriptionJson,
			updated_at: new Date().toISOString()
		},
		{
			onConflict: 'user_id'
		}
	);

	if (error) {
		console.error('❌ Failed to save subscription to database:', error);
		throw error;
	}

	console.log('✓ Subscription saved to database:', data);
}

// /**
//  * Save push subscription to database
//  */
// async function saveSubscription(
// 	supabase: SupabaseClient,
// 	userId: string,
// 	subscription: PushSubscription
// ): Promise<void> {
// 	const { error } = await supabase.from('push_subscriptions').upsert({
// 		user_id: userId,
// 		subscription: subscription.toJSON(),
// 		updated_at: new Date().toISOString()
// 	});

// 	if (error) {
// 		console.error('Failed to save subscription:', error);
// 		throw error;
// 	}
// }

/**
 * Remove push subscription from database
 */
async function removeSubscription(supabase: SupabaseClient, userId: string): Promise<void> {
	const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', userId);

	if (error) {
		console.error('Failed to remove subscription:', error);
	}
}

/**
 * Send a local notification (fallback when push isn't available)
 */
export function sendLocalNotification(payload: NotificationPayload): void {
	if (!isNotificationSupported() || Notification.permission !== 'granted') {
		return;
	}

	new Notification(payload.title, {
		body: payload.body,
		icon: payload.icon || '/favicon.png',
		badge: '/favicon.png',
		tag: payload.tag || 'location-share',
		data: payload.data,
		requireInteraction: payload.requireInteraction || false
	});
}

/**
 * Convert VAPID public key to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
	if (!base64String || base64String.trim() === '') {
		throw new Error('VAPID key is empty or undefined');
	}

	try {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

		const rawData = window.atob(base64);
		const outputArray = new Uint8Array(rawData.length);

		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}
		return outputArray;
	} catch (error) {
		throw new Error(`Failed to decode VAPID key: ${error}`);
	}
}

/**
 * Check if user has push notification subscription
 */
export async function hasPushSubscription(): Promise<boolean> {
	if (!isNotificationSupported()) {
		return false;
	}

	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		return subscription !== null;
	} catch {
		return false;
	}
}

/**
 * Get notification permission status
 */
export function getNotificationPermission(): NotificationPermission | null {
	if (!isNotificationSupported()) {
		return null;
	}
	return Notification.permission;
}

// // src/lib/notifications.ts - FIXED VERSION
// import type { SupabaseClient } from '@supabase/supabase-js';
// import { browser } from '$app/environment';

// // VAPID public key - you'll need to generate this
// // Use: npx web-push generate-vapid-keys
// // Then add to your .env file as PUBLIC_VAPID_KEY
// const VAPID_PUBLIC_KEY = import.meta.env.PUBLIC_VAPID_KEY || '';

// export interface NotificationPayload {
// 	title: string;
// 	body: string;
// 	icon?: string;
// 	tag?: string;
// 	data?: any;
// 	requireInteraction?: boolean;
// 	actions?: Array<{
// 		action: string;
// 		title: string;
// 	}>;
// }

// /**
//  * Check if notifications are supported
//  */
// export function isNotificationSupported(): boolean {
// 	return browser && 'Notification' in window && 'serviceWorker' in navigator;
// }

// /**
//  * Request notification permission
//  */
// export async function requestNotificationPermission(): Promise<boolean> {
// 	if (!isNotificationSupported()) {
// 		console.error('Notifications not supported');
// 		return false;
// 	}

// 	if (Notification.permission === 'granted') {
// 		return true;
// 	}

// 	if (Notification.permission === 'denied') {
// 		console.log('Notification permission denied');
// 		return false;
// 	}

// 	const permission = await Notification.requestPermission();
// 	return permission === 'granted';
// }

// /**
//  * Subscribe to push notifications
//  */
// export async function subscribeToPushNotifications(
// 	supabase: SupabaseClient,
// 	userId: string
// ): Promise<PushSubscription | null> {
// 	if (!isNotificationSupported()) {
// 		console.error('Push notifications not supported');
// 		return null;
// 	}

// 	try {
// 		// Request permission first
// 		const hasPermission = await requestNotificationPermission();
// 		if (!hasPermission) {
// 			console.log('Notification permission not granted');
// 			return null;
// 		}

// 		// Check if VAPID key is configured
// 		if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.trim() === '') {
// 			console.warn('VAPID public key not configured. Push notifications disabled.');
// 			console.warn('Generate keys with: npx web-push generate-vapid-keys');
// 			console.warn('Then add PUBLIC_VAPID_KEY to your .env file');
// 			// Still allow basic notifications without push
// 			return null;
// 		}

// 		// Wait for service worker to be ready
// 		const registration = await navigator.serviceWorker.ready;

// 		// Check if already subscribed
// 		let subscription = await registration.pushManager.getSubscription();

// 		if (!subscription) {
// 			console.log('Subscribing to push notifications with VAPID key...');

// 			// Subscribe to push notifications
// 			subscription = await registration.pushManager.subscribe({
// 				userVisibleOnly: true,
// 				applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
// 			});

// 			console.log('Push subscription created:', subscription.endpoint);
// 		} else {
// 			console.log('Already subscribed to push notifications');
// 		}

// 		// Save subscription to database
// 		await saveSubscription(supabase, userId, subscription);

// 		console.log('Successfully subscribed to push notifications');
// 		return subscription;
// 	} catch (error: any) {
// 		console.error('Failed to subscribe to push notifications:', error);

// 		// Provide helpful error messages
// 		if (error.name === 'InvalidAccessError') {
// 			console.error(
// 				'VAPID key is invalid or malformed. Please check your PUBLIC_VAPID_KEY environment variable.'
// 			);
// 			console.error('Current key length:', VAPID_PUBLIC_KEY?.length || 0);
// 			console.error('Expected: 88 characters (base64url encoded)');
// 		}

// 		return null;
// 	}
// }

// /**
//  * Unsubscribe from push notifications
//  */
// export async function unsubscribeFromPushNotifications(
// 	supabase: SupabaseClient,
// 	userId: string
// ): Promise<void> {
// 	if (!isNotificationSupported()) return;

// 	try {
// 		const registration = await navigator.serviceWorker.ready;
// 		const subscription = await registration.pushManager.getSubscription();

// 		if (subscription) {
// 			await subscription.unsubscribe();
// 			await removeSubscription(supabase, userId);
// 			console.log('Successfully unsubscribed from push notifications');
// 		}
// 	} catch (error) {
// 		console.error('Failed to unsubscribe from push notifications:', error);
// 	}
// }

// /**
//  * Save push subscription to database
//  */
// async function saveSubscription(
// 	supabase: SupabaseClient,
// 	userId: string,
// 	subscription: PushSubscription
// ): Promise<void> {
// 	const { error } = await supabase.from('push_subscriptions').upsert({
// 		user_id: userId,
// 		subscription: subscription.toJSON(),
// 		updated_at: new Date().toISOString()
// 	});

// 	if (error) {
// 		console.error('Failed to save subscription:', error);
// 		throw error;
// 	}
// }

// /**
//  * Remove push subscription from database
//  */
// async function removeSubscription(supabase: SupabaseClient, userId: string): Promise<void> {
// 	const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', userId);

// 	if (error) {
// 		console.error('Failed to remove subscription:', error);
// 	}
// }

// /**
//  * Send a local notification (fallback when push isn't available)
//  */
// export function sendLocalNotification(payload: NotificationPayload): void {
// 	if (!isNotificationSupported() || Notification.permission !== 'granted') {
// 		return;
// 	}

// 	new Notification(payload.title, {
// 		body: payload.body,
// 		icon: payload.icon || '/favicon.png',
// 		badge: '/favicon.png',
// 		tag: payload.tag || 'location-share',
// 		data: payload.data,
// 		requireInteraction: payload.requireInteraction || false
// 	});
// }

// /**
//  * Convert VAPID public key to Uint8Array
//  */
// function urlBase64ToUint8Array(base64String: string): Uint8Array {
// 	if (!base64String || base64String.trim() === '') {
// 		throw new Error('VAPID key is empty or undefined');
// 	}

// 	try {
// 		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
// 		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

// 		const rawData = window.atob(base64);
// 		const outputArray = new Uint8Array(rawData.length);

// 		for (let i = 0; i < rawData.length; ++i) {
// 			outputArray[i] = rawData.charCodeAt(i);
// 		}
// 		return outputArray;
// 	} catch (error) {
// 		throw new Error(`Failed to decode VAPID key: ${error}`);
// 	}
// }

// /**
//  * Check if user has push notification subscription
//  */
// export async function hasPushSubscription(): Promise<boolean> {
// 	if (!isNotificationSupported()) {
// 		return false;
// 	}

// 	try {
// 		const registration = await navigator.serviceWorker.ready;
// 		const subscription = await registration.pushManager.getSubscription();
// 		return subscription !== null;
// 	} catch {
// 		return false;
// 	}
// }

// /**
//  * Get notification permission status
//  */
// export function getNotificationPermission(): NotificationPermission | null {
// 	if (!isNotificationSupported()) {
// 		return null;
// 	}
// 	return Notification.permission;
// }

// // // src/lib/notifications.ts
// // import type { SupabaseClient } from '@supabase/supabase-js';
// // import { browser } from '$app/environment';

// // // VAPID public key - you'll need to generate this
// // // Use: npx web-push generate-vapid-keys
// // // Then add to your .env file as PUBLIC_VAPID_KEY
// // const VAPID_PUBLIC_KEY = import.meta.env.PUBLIC_VAPID_KEY || '';

// // export interface NotificationPayload {
// // 	title: string;
// // 	body: string;
// // 	icon?: string;
// // 	tag?: string;
// // 	data?: any;
// // 	requireInteraction?: boolean;
// // 	actions?: Array<{
// // 		action: string;
// // 		title: string;
// // 	}>;
// // }

// // /**
// //  * Check if notifications are supported
// //  */
// // export function isNotificationSupported(): boolean {
// // 	return browser && 'Notification' in window && 'serviceWorker' in navigator;
// // }

// // /**
// //  * Request notification permission
// //  */
// // export async function requestNotificationPermission(): Promise<boolean> {
// // 	if (!isNotificationSupported()) {
// // 		console.error('Notifications not supported');
// // 		return false;
// // 	}

// // 	if (Notification.permission === 'granted') {
// // 		return true;
// // 	}

// // 	if (Notification.permission === 'denied') {
// // 		console.log('Notification permission denied');
// // 		return false;
// // 	}

// // 	const permission = await Notification.requestPermission();
// // 	return permission === 'granted';
// // }

// // /**
// //  * Subscribe to push notifications
// //  */
// // export async function subscribeToPushNotifications(
// // 	supabase: SupabaseClient,
// // 	userId: string
// // ): Promise<PushSubscription | null> {
// // 	if (!isNotificationSupported()) {
// // 		console.error('Push notifications not supported');
// // 		return null;
// // 	}

// // 	try {
// // 		// Request permission first
// // 		const hasPermission = await requestNotificationPermission();
// // 		if (!hasPermission) {
// // 			console.log('Notification permission not granted');
// // 			return null;
// // 		}

// // 		// Wait for service worker to be ready
// // 		const registration = await navigator.serviceWorker.ready;

// // 		// Check if already subscribed
// // 		let subscription = await registration.pushManager.getSubscription();

// // 		if (!subscription) {
// // 			// Subscribe to push notifications
// // 			subscription = await registration.pushManager.subscribe({
// // 				userVisibleOnly: true,
// // 				applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
// // 			});
// // 		}

// // 		// Save subscription to database
// // 		await saveSubscription(supabase, userId, subscription);

// // 		console.log('Successfully subscribed to push notifications');
// // 		return subscription;
// // 	} catch (error) {
// // 		console.error('Failed to subscribe to push notifications:', error);
// // 		return null;
// // 	}
// // }

// // /**
// //  * Unsubscribe from push notifications
// //  */
// // export async function unsubscribeFromPushNotifications(
// // 	supabase: SupabaseClient,
// // 	userId: string
// // ): Promise<void> {
// // 	if (!isNotificationSupported()) return;

// // 	try {
// // 		const registration = await navigator.serviceWorker.ready;
// // 		const subscription = await registration.pushManager.getSubscription();

// // 		if (subscription) {
// // 			await subscription.unsubscribe();
// // 			await removeSubscription(supabase, userId);
// // 			console.log('Successfully unsubscribed from push notifications');
// // 		}
// // 	} catch (error) {
// // 		console.error('Failed to unsubscribe from push notifications:', error);
// // 	}
// // }

// // /**
// //  * Save push subscription to database
// //  */
// // async function saveSubscription(
// // 	supabase: SupabaseClient,
// // 	userId: string,
// // 	subscription: PushSubscription
// // ): Promise<void> {
// // 	const { error } = await supabase.from('push_subscriptions').upsert({
// // 		user_id: userId,
// // 		subscription: subscription.toJSON(),
// // 		updated_at: new Date().toISOString()
// // 	});

// // 	if (error) {
// // 		console.error('Failed to save subscription:', error);
// // 		throw error;
// // 	}
// // }

// // /**
// //  * Remove push subscription from database
// //  */
// // async function removeSubscription(supabase: SupabaseClient, userId: string): Promise<void> {
// // 	const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', userId);

// // 	if (error) {
// // 		console.error('Failed to remove subscription:', error);
// // 	}
// // }

// // /**
// //  * Send a local notification (fallback when push isn't available)
// //  */
// // export function sendLocalNotification(payload: NotificationPayload): void {
// // 	if (!isNotificationSupported() || Notification.permission !== 'granted') {
// // 		return;
// // 	}

// // 	new Notification(payload.title, {
// // 		body: payload.body,
// // 		icon: payload.icon || '/favicon.png',
// // 		badge: '/favicon.png',
// // 		tag: payload.tag || 'location-share',
// // 		data: payload.data,
// // 		requireInteraction: payload.requireInteraction || false
// // 	});
// // }

// // /**
// //  * Convert VAPID public key to Uint8Array
// //  */
// // function urlBase64ToUint8Array(base64String: string) {
// // 	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
// // 	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

// // 	const rawData = window.atob(base64);
// // 	const outputArray = new Uint8Array(rawData.length);

// // 	for (let i = 0; i < rawData.length; ++i) {
// // 		outputArray[i] = rawData.charCodeAt(i);
// // 	}
// // 	return outputArray;
// // }

// // /**
// //  * Check if user has push notification subscription
// //  */
// // export async function hasPushSubscription(): Promise<boolean> {
// // 	if (!isNotificationSupported()) {
// // 		return false;
// // 	}

// // 	try {
// // 		const registration = await navigator.serviceWorker.ready;
// // 		const subscription = await registration.pushManager.getSubscription();
// // 		return subscription !== null;
// // 	} catch {
// // 		return false;
// // 	}
// // }

// // /**
// //  * Get notification permission status
// //  */
// // export function getNotificationPermission(): NotificationPermission | null {
// // 	if (!isNotificationSupported()) {
// // 		return null;
// // 	}
// // 	return Notification.permission;
// // }

// // // ---- Google AI
// // // import { PUBLIC_VAPID_KEY } from '$env/static/public';
// // // import { createClient } from '@supabase/supabase-js';
// // // import type { SupabaseClient } from '@supabase/supabase-js';
// // // import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';

// // // export async function requestNotificationPermission(): Promise<boolean> {
// // // 	if (!('Notification' in window)) {
// // // 		console.log('Notifications not supported');
// // // 		return false;
// // // 	}

// // // 	if (Notification.permission === 'granted') {
// // // 		return true;
// // // 	}

// // // 	if (Notification.permission !== 'denied') {
// // // 		const permission = await Notification.requestPermission();
// // // 		return permission === 'granted';
// // // 	}

// // // 	return false;
// // // }

// // // export function sendNotification(title: string, body: string, icon?: string) {
// // // 	if (Notification.permission === 'granted') {
// // // 		new Notification(title, {
// // // 			body,
// // // 			icon: icon || '/favicon.png',
// // // 			badge: '/favicon.png',
// // // 			tag: 'location-share',
// // // 			requireInteraction: false
// // // 		});
// // // 	}
// // // }

// // // /**
// // //  * Registers the service worker if not already registered.
// // //  */
// // // export async function initializeServiceWorker(): Promise<ServiceWorkerRegistration | null> {
// // // 	try {
// // // 		if (!('serviceWorker' in navigator)) {
// // // 			console.warn('Service workers are not supported in this browser.');
// // // 			return null;
// // // 		}

// // // 		const registration = await navigator.serviceWorker.register('/service-worker.js', {
// // // 			scope: '/'
// // // 		});

// // // 		console.log('Service Worker registered:', registration);
// // // 		return registration;
// // // 	} catch (err) {
// // // 		console.error('Service Worker registration failed:', err);
// // // 		return null;
// // // 	}
// // // }

// // // /**
// // //  * Checks if the user already has an active push subscription.
// // //  */
// // // export async function hasPushSubscription(): Promise<boolean> {
// // // 	if (!('serviceWorker' in navigator)) return false;

// // // 	const registration = await navigator.serviceWorker.ready;
// // // 	const subscription = await registration.pushManager.getSubscription();

// // // 	return !!subscription;
// // // }

// // // /**
// // //  * Subscribes the current Supabase user to push notifications and
// // //  * saves the subscription JSON in the push_subscriptions table.
// // //  */
// // // export async function subscribeToPushNotifications(
// // // 	supabase: SupabaseClient
// // // ): Promise<PushSubscription | null> {
// // // 	try {
// // // 		const registration = await initializeServiceWorker();
// // // 		if (!registration) throw new Error('Service Worker not registered.');

// // // 		// Ask user for notification permission
// // // 		const permission = await Notification.requestPermission();
// // // 		if (permission !== 'granted') {
// // // 			console.warn('Push notification permission not granted.');
// // // 			return null;
// // // 		}

// // // 		// Ensure user is logged in
// // // 		const {
// // // 			data: { user },
// // // 			error: userError
// // // 		} = await supabase.auth.getUser();

// // // 		if (userError || !user) {
// // // 			console.warn('User must be signed in to enable push notifications.');
// // // 			return null;
// // // 		}

// // // 		// Subscribe user to push
// // // 		const subscription = await registration.pushManager.subscribe({
// // // 			userVisibleOnly: true,
// // // 			applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
// // // 		});

// // // 		// Save subscription to Supabase
// // // 		const { error: upsertError } = await supabase.from('push_subscriptions').upsert(
// // // 			{
// // // 				user_id: user.id,
// // // 				subscription: subscription.toJSON()
// // // 			},
// // // 			{ onConflict: 'user_id' }
// // // 		);

// // // 		if (upsertError) {
// // // 			console.error('Error saving push subscription to Supabase:', upsertError);
// // // 			return null;
// // // 		}

// // // 		console.log('Push subscription saved to Supabase for user:', user.id);
// // // 		return subscription;
// // // 	} catch (err) {
// // // 		console.error('Failed to subscribe to push notifications:', err);
// // // 		return null;
// // // 	}
// // // }

// // // /**
// // //  * Converts a base64 VAPID key to a Uint8Array for the PushManager.
// // //  */
// // // function urlBase64ToUint8Array(base64String: String) {
// // // 	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
// // // 	const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

// // // 	const rawData = window.atob(base64);
// // // 	const outputArray = new Uint8Array(rawData.length);

// // // 	for (let i = 0; i < rawData.length; ++i) {
// // // 		outputArray[i] = rawData.charCodeAt(i);
// // // 	}
// // // 	return outputArray;
// // // }
// // // -----  End Google AI
