import type { SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { PUBLIC_VAPID_KEY } from '$env/static/public';

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
 * Check if notifications are supported in this browser
 */
export function isNotificationSupported(): boolean {
	return (
		browser && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
	);
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<boolean> {
	if (!isNotificationSupported()) {
		console.error('❌ Notifications not supported');
		return false;
	}

	if (Notification.permission === 'granted') {
		console.log('✓ Notification permission already granted');
		return true;
	}

	if (Notification.permission === 'denied') {
		console.log('❌ Notification permission denied');
		return false;
	}

	console.log('🔐 Requesting notification permission...');
	const permission = await Notification.requestPermission();
	console.log('Permission result:', permission);

	return permission === 'granted';
}

/**
 * Check if user has push notification subscription
 * Checks both browser AND database for consistency
 */
export async function hasPushSubscription(
	supabase: SupabaseClient,
	userId: string
): Promise<boolean> {
	if (!isNotificationSupported()) {
		console.log('❌ Notifications not supported');
		return false;
	}

	try {
		// Check browser subscription
		const registration = await navigator.serviceWorker.ready;
		const browserSubscription = await registration.pushManager.getSubscription();

		if (!browserSubscription) {
			console.log('ℹ️ No browser subscription found');
			return false;
		}

		console.log('✓ Browser subscription found');

		// Check database subscription
		const { data: dbSubscription, error } = await supabase
			.from('push_subscriptions')
			.select('subscription')
			.eq('user_id', userId)
			.maybeSingle();

		if (error) {
			console.log('⚠️ Error checking database subscription:', error.message);
			return false;
		}

		if (!dbSubscription) {
			console.log('ℹ️ No database subscription found');
			return false;
		}

		// Verify the endpoints match
		if (dbSubscription.subscription?.endpoint === browserSubscription.endpoint) {
			console.log('✓ Valid subscription found in both browser and database');
			return true;
		}

		console.log('⚠️ Subscription mismatch between browser and database');
		return false;
	} catch (error) {
		console.error('❌ Error checking push subscription:', error);
		return false;
	}
}

/**
 * Subscribe to push notifications
 * Handles browser subscription and database storage
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
		// Validate VAPID key is configured
		if (!PUBLIC_VAPID_KEY || PUBLIC_VAPID_KEY.trim() === '') {
			console.error('❌ VAPID public key not configured');
			console.warn('Generate keys with: npx web-push generate-vapid-keys');
			return null;
		}

		console.log('✓ VAPID key configured, length:', PUBLIC_VAPID_KEY.length);

		// Get service worker registrations
		console.log('⏳ Getting service worker registration...');
		const registrations = await navigator.serviceWorker.getRegistrations();

		if (registrations.length === 0) {
			console.error('❌ No service worker registered');
			console.warn('Ensure service worker is registered in your app initialization');
			return null;
		}

		let registration = registrations[0];
		console.log('✓ Found service worker registration, scope:', registration.scope);

		// Wait for service worker to be active
		if (!registration.active || registration.active.state !== 'activated') {
			console.log('⏳ Waiting for service worker to activate...');
			registration = await navigator.serviceWorker.ready;

			// Extra delay for mobile devices
			const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
				navigator.userAgent
			);
			const delay = isMobile ? 1000 : 500;
			console.log(`⏳ Waiting ${delay}ms for full activation...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		// Verify service worker is actually active
		if (!registration.active || registration.active.state !== 'activated') {
			console.error('❌ Service worker still not activated after waiting');
			return null;
		}

		console.log('✓ Service worker is active and ready, state:', registration.active.state);

		// Check for existing browser subscription
		console.log('🔍 Checking existing browser subscription...');
		let subscription: PushSubscription | null = null;

		try {
			subscription = await registration.pushManager.getSubscription();
		} catch (error) {
			console.warn('⚠️ Error checking existing subscription:', error);
		}

		// If subscription exists in browser, validate against database
		if (subscription) {
			console.log('✓ Found existing browser subscription');
			console.log('Endpoint:', subscription.endpoint);

			// Check if it exists in database
			const { data: dbData } = await supabase
				.from('push_subscriptions')
				.select('subscription')
				.eq('user_id', userId)
				.maybeSingle();

			// If it matches database, we're done
			if (dbData?.subscription?.endpoint === subscription.endpoint) {
				console.log('✓ Subscription already exists in database and matches');
				return subscription;
			}

			// If it exists in browser but not in database, save it
			if (!dbData) {
				console.log('📤 Browser subscription not in database - saving...');
				await saveSubscription(supabase, userId, subscription);
				return subscription;
			}

			// If endpoints don't match, unsubscribe and create new one
			console.log('🔄 Subscription mismatch - creating new subscription...');
			try {
				await subscription.unsubscribe();
				console.log('✓ Old subscription unsubscribed');
			} catch (e) {
				console.warn('⚠️ Failed to unsubscribe old subscription:', e);
			}
			subscription = null;
		} else {
			console.log('ℹ️ No existing browser subscription found');
		}

		// Request permission
		console.log('🔐 Requesting notification permission...');
		const permission = await Notification.requestPermission();
		console.log('Permission result:', permission);

		if (permission !== 'granted') {
			console.log('❌ Notification permission not granted');
			return null;
		}

		// Additional wait after permission grant (especially important on mobile)
		const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
			navigator.userAgent
		);
		const postPermissionDelay = isMobile ? 1000 : 500;
		console.log(`⏳ Waiting ${postPermissionDelay}ms after permission grant...`);
		await new Promise((resolve) => setTimeout(resolve, postPermissionDelay));

		// Create new subscription with retry logic
		console.log('📤 Creating push subscription...');
		subscription = await subscribeWithRetry(registration, PUBLIC_VAPID_KEY, 5);

		console.log('✓ Push subscription created successfully');
		console.log('Endpoint:', subscription.endpoint);

		// Save subscription to database
		console.log('💾 Saving subscription to database...');
		await saveSubscription(supabase, userId, subscription);
		console.log('✅ Subscription saved successfully');

		return subscription;
	} catch (error: any) {
		console.error('❌ Failed to subscribe:', error);
		console.error('Error name:', error.name);
		console.error('Error message:', error.message);

		if (error.name === 'InvalidAccessError') {
			console.error('VAPID key is invalid or malformed');
			console.error('Current key length:', PUBLIC_VAPID_KEY?.length || 0);
			console.error('Expected: 88 characters (base64url encoded)');
		} else if (error.name === 'AbortError') {
			console.error('Push subscription aborted - service worker not ready');
			console.error('This usually means the service worker needs more time to initialize');
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
 * Mobile devices often need multiple attempts due to slower initialization
 */
async function subscribeWithRetry(
	registration: ServiceWorkerRegistration,
	vapidKey: string,
	maxRetries: number = 5
): Promise<PushSubscription> {
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`📤 Subscription attempt ${attempt}/${maxRetries}...`);

			// Re-verify service worker is active before each attempt
			if (!registration.active || registration.active.state !== 'activated') {
				console.warn(`⚠️ Service worker not active on attempt ${attempt}, waiting...`);
				await new Promise((resolve) => setTimeout(resolve, 1000));
				continue;
			}

			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapidKey)
			});

			console.log(`✅ Subscription successful on attempt ${attempt}`);
			return subscription;
		} catch (error: any) {
			console.warn(`⚠️ Attempt ${attempt} failed:`, error.name, error.message);
			lastError = error;

			// Don't retry on certain errors
			if (
				error.name === 'NotAllowedError' ||
				error.name === 'NotSupportedError' ||
				error.name === 'InvalidAccessError'
			) {
				console.error('Non-retryable error - stopping attempts');
				throw error;
			}

			// Wait longer between retries with exponential backoff
			if (attempt < maxRetries) {
				const waitTime = Math.min(attempt * 1000, 5000); // 1s, 2s, 3s, 4s, 5s (max)
				console.log(`⏳ Waiting ${waitTime}ms before retry...`);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}
		}
	}

	console.error(`❌ All ${maxRetries} subscription attempts failed`);
	throw lastError || new Error('Push subscription failed after all retries');
}

/**
 * Save push subscription to database
 */
async function saveSubscription(
	supabase: SupabaseClient,
	userId: string,
	subscription: PushSubscription
): Promise<void> {
	console.log('💾 Saving subscription for user:', userId);

	const subscriptionJson = subscription.toJSON();

	// Validate subscription has required fields
	if (!subscriptionJson.endpoint || !subscriptionJson.keys) {
		throw new Error('Invalid subscription object - missing endpoint or keys');
	}

	console.log('Subscription endpoint:', subscriptionJson.endpoint);

	const { error } = await supabase.from('push_subscriptions').upsert(
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

	console.log('✅ Subscription saved to database');
}

/**
 * Sync browser subscription with database subscription
 * Call this when app loads to ensure consistency
 */
export async function syncPushSubscription(
	supabase: SupabaseClient,
	userId: string
): Promise<void> {
	if (!isNotificationSupported()) {
		console.log('ℹ️ Notifications not supported - skipping sync');
		return;
	}

	console.log('🔄 Syncing push subscriptions...');

	try {
		const registration = await navigator.serviceWorker.ready;
		const browserSubscription = await registration.pushManager.getSubscription();

		// Get database subscription
		const { data: dbData } = await supabase
			.from('push_subscriptions')
			.select('subscription')
			.eq('user_id', userId)
			.maybeSingle();

		const dbSubscription = dbData?.subscription;

		// Case 1: Browser has subscription but database doesn't
		if (browserSubscription && !dbSubscription) {
			console.log('📤 Browser subscription exists but not in database - saving...');
			await saveSubscription(supabase, userId, browserSubscription);
			console.log('✅ Sync complete: saved to database');
			return;
		}

		// Case 2: Database has subscription but browser doesn't
		if (!browserSubscription && dbSubscription) {
			console.log("🗑️ Database subscription exists but browser doesn't - cleaning up...");
			await supabase.from('push_subscriptions').delete().eq('user_id', userId);
			console.log('✅ Sync complete: removed from database');
			return;
		}

		// Case 3: Both exist but endpoints don't match
		if (
			browserSubscription &&
			dbSubscription &&
			browserSubscription.endpoint !== dbSubscription.endpoint
		) {
			console.log('🔄 Subscription mismatch - updating database with browser subscription...');
			await saveSubscription(supabase, userId, browserSubscription);
			console.log('✅ Sync complete: updated database');
			return;
		}

		// Case 4: Both match - all good
		if (browserSubscription && dbSubscription) {
			console.log('✅ Subscriptions synced - no action needed');
		} else {
			console.log('ℹ️ No subscriptions found');
		}
	} catch (error) {
		console.error('❌ Error syncing push subscription:', error);
	}
}

/**
 * Unsubscribe from push notifications
 * Removes subscription from both browser and database
 */
export async function unsubscribeFromPushNotifications(
	supabase: SupabaseClient,
	userId: string
): Promise<void> {
	if (!isNotificationSupported()) {
		console.log('ℹ️ Notifications not supported');
		return;
	}

	console.log('🔕 Unsubscribing from push notifications...');

	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();

		if (subscription) {
			await subscription.unsubscribe();
			console.log('✓ Unsubscribed from browser push');
		}

		// Remove from database
		const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', userId);

		if (error) {
			console.error('❌ Failed to remove subscription from database:', error);
		} else {
			console.log('✓ Removed subscription from database');
		}

		console.log('✅ Successfully unsubscribed from push notifications');
	} catch (error) {
		console.error('❌ Failed to unsubscribe from push notifications:', error);
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

/**
 * Send a local notification (fallback when push isn't available)
 */
export function sendLocalNotification(payload: NotificationPayload): void {
	if (!isNotificationSupported() || Notification.permission !== 'granted') {
		console.warn('⚠️ Cannot send local notification - permission not granted');
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
