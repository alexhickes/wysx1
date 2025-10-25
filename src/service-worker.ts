/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

// const self = self as unknown as ServiceWorkerGlobalScope;
// This gives `self` the correct types
const self = globalThis.self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = `location-share-${version}`;
const OFFLINE_QUEUE_NAME = 'offline-queue';

// Assets to cache on install
const ASSETS = [
	...build, // SvelteKit build files
	...files // Static files from /static
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
	async function addFilesToCache() {
		const cache = await caches.open(CACHE_NAME);
		await cache.addAll(ASSETS);
	}

	event.waitUntil(addFilesToCache());
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		const keys = await caches.keys();

		for (const key of keys) {
			if (key !== CACHE_NAME && key !== OFFLINE_QUEUE_NAME) {
				await caches.delete(key);
			}
		}
	}

	event.waitUntil(deleteOldCaches());
	self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
	const { request } = event;

	// Skip non-GET requests
	if (request.method !== 'GET') return;

	// Skip Supabase API requests (we want these to fail fast when offline)
	const url = new URL(request.url);
	if (url.hostname.includes('supabase')) {
		return;
	}

	async function respond() {
		// Try network first
		try {
			const response = await fetch(request);

			// Cache successful responses
			if (response.ok) {
				const cache = await caches.open(CACHE_NAME);
				cache.put(request, response.clone());
			}

			return response;
		} catch {
			// Network failed, try cache
			const cached = await caches.match(request);

			if (cached) {
				return cached;
			}

			// Return offline page for navigation requests
			if (request.mode === 'navigate') {
				return new Response('Offline', {
					status: 503,
					statusText: 'Service Unavailable',
					headers: new Headers({
						'Content-Type': 'text/html'
					})
				});
			}

			// For other requests, throw error
			return new Response('Network error', {
				status: 408,
				statusText: 'Request Timeout'
			});
		}
	}

	event.respondWith(respond());
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
	if (!event.data) return;

	const data = event.data.json();
	const title = data.title || 'Location Update';
	const options: NotificationOptions = {
		body: data.body || 'Someone is at a location',
		icon: data.icon || '/favicon.png',
		badge: '/favicon.png',
		tag: data.tag || 'location-share',
		data: data.data || {},
		requireInteraction: data.requireInteraction || false,
		actions: data.actions || [
			{
				action: 'view',
				title: 'View'
			},
			{
				action: 'dismiss',
				title: 'Dismiss'
			}
		]
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	if (event.action === 'dismiss') {
		return;
	}

	// Handle 'view' action or notification click
	const urlToOpen = event.notification.data?.url || '/';

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// Check if there's already a window open
			for (const client of clientList) {
				if (client.url.includes(urlToOpen) && 'focus' in client) {
					return client.focus();
				}
			}
			// Open new window if none exists
			if (self.clients.openWindow) {
				return self.clients.openWindow(urlToOpen);
			}
		})
	);
});

// Background sync event - process offline queue
self.addEventListener('sync', (event) => {
	if (event.tag === 'sync-offline-queue') {
		event.waitUntil(processOfflineQueue());
	}
});

// Process offline queue
async function processOfflineQueue() {
	const cache = await caches.open(OFFLINE_QUEUE_NAME);
	const requests = await cache.keys();

	for (const request of requests) {
		try {
			const response = await cache.match(request);
			if (!response) continue;

			const data = await response.json();

			// Retry the request
			const retryResponse = await fetch(data.url, {
				method: data.method,
				headers: data.headers,
				body: data.body
			});

			if (retryResponse.ok) {
				// Success - remove from queue
				await cache.delete(request);
				console.log('Successfully processed queued request');
			}
		} catch (error) {
			console.error('Failed to process queued request:', error);
			// Keep in queue for next sync
		}
	}
}

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}

	if (event.data && event.data.type === 'QUEUE_REQUEST') {
		event.waitUntil(queueRequest(event.data.request));
	}
});

// Queue a request for later processing
async function queueRequest(requestData: any) {
	const cache = await caches.open(OFFLINE_QUEUE_NAME);
	const request = new Request(`offline-queue-${Date.now()}`, {
		method: 'POST'
	});

	const response = new Response(JSON.stringify(requestData));
	await cache.put(request, response);

	// Register background sync if available
	if ('sync' in self.registration) {
		await self.registration.sync.register('sync-offline-queue');
	}
}
