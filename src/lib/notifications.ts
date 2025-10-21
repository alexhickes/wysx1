import { PUBLIC_VAPID_KEY } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';

export async function requestNotificationPermission(): Promise<boolean> {
	if (!('Notification' in window)) {
		console.log('Notifications not supported');
		return false;
	}

	if (Notification.permission === 'granted') {
		return true;
	}

	if (Notification.permission !== 'denied') {
		const permission = await Notification.requestPermission();
		return permission === 'granted';
	}

	return false;
}

export function sendNotification(title: string, body: string, icon?: string) {
	if (Notification.permission === 'granted') {
		new Notification(title, {
			body,
			icon: icon || '/favicon.png',
			badge: '/favicon.png',
			tag: 'location-share',
			requireInteraction: false
		});
	}
}

/**
 * Registers the service worker if not already registered.
 */
export async function initializeServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	try {
		if (!('serviceWorker' in navigator)) {
			console.warn('Service workers are not supported in this browser.');
			return null;
		}

		const registration = await navigator.serviceWorker.register('/service-worker.js', {
			scope: '/'
		});

		console.log('Service Worker registered:', registration);
		return registration;
	} catch (err) {
		console.error('Service Worker registration failed:', err);
		return null;
	}
}

/**
 * Checks if the user already has an active push subscription.
 */
export async function hasPushSubscription(): Promise<boolean> {
	if (!('serviceWorker' in navigator)) return false;

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();

	return !!subscription;
}

/**
 * Subscribes the current Supabase user to push notifications and
 * saves the subscription JSON in the push_subscriptions table.
 */
export async function subscribeToPushNotifications(
	supabase: SupabaseClient
): Promise<PushSubscription | null> {
	try {
		const registration = await initializeServiceWorker();
		if (!registration) throw new Error('Service Worker not registered.');

		// Ask user for notification permission
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') {
			console.warn('Push notification permission not granted.');
			return null;
		}

		// Ensure user is logged in
		const {
			data: { user },
			error: userError
		} = await supabase.auth.getUser();

		if (userError || !user) {
			console.warn('User must be signed in to enable push notifications.');
			return null;
		}

		// Subscribe user to push
		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
		});

		// Save subscription to Supabase
		const { error: upsertError } = await supabase.from('push_subscriptions').upsert(
			{
				user_id: user.id,
				subscription: subscription.toJSON()
			},
			{ onConflict: 'user_id' }
		);

		if (upsertError) {
			console.error('Error saving push subscription to Supabase:', upsertError);
			return null;
		}

		console.log('Push subscription saved to Supabase for user:', user.id);
		return subscription;
	} catch (err) {
		console.error('Failed to subscribe to push notifications:', err);
		return null;
	}
}

/**
 * Converts a base64 VAPID key to a Uint8Array for the PushManager.
 */
function urlBase64ToUint8Array(base64String: String) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}
