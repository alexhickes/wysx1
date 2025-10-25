// src/lib/offlineQueue.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';

export interface QueuedRequest {
	id: string;
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
	timestamp: number;
	retries: number;
}

const QUEUE_STORAGE_KEY = 'offline-queue';
const MAX_RETRIES = 3;

/**
 * Add a request to the offline queue
 */
export async function queueRequest(
	url: string,
	method: string,
	headers: Record<string, string>,
	body?: any
): Promise<void> {
	if (!browser) return;

	const queue = getQueue();

	const request: QueuedRequest = {
		id: crypto.randomUUID(),
		url,
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
		timestamp: Date.now(),
		retries: 0
	};

	queue.push(request);
	saveQueue(queue);

	// Notify service worker
	if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
		navigator.serviceWorker.controller.postMessage({
			type: 'QUEUE_REQUEST',
			request
		});
	}

	console.log('Request queued:', request.id);
}

/**
 * Process the offline queue
 */
export async function processQueue(supabase: SupabaseClient): Promise<void> {
	if (!browser || !navigator.onLine) {
		console.log('Cannot process queue - offline or not in browser');
		return;
	}

	const queue = getQueue();

	if (queue.length === 0) {
		console.log('Queue is empty');
		return;
	}

	console.log(`Processing ${queue.length} queued request(s)...`);
	const remaining: QueuedRequest[] = [];

	for (const request of queue) {
		try {
			// Reconstruct the request
			const response = await fetch(request.url, {
				method: request.method,
				headers: request.headers,
				body: request.body
			});

			if (!response.ok) {
				throw new Error(`Request failed: ${response.status} ${response.statusText}`);
			}

			console.log('✓ Successfully processed queued request:', request.id);
		} catch (error) {
			console.error('✗ Failed to process queued request:', request.id, error);

			// Retry logic
			if (request.retries < MAX_RETRIES) {
				request.retries++;
				remaining.push(request);
				console.log(`  Retry ${request.retries}/${MAX_RETRIES} for request ${request.id}`);
			} else {
				console.warn(`  Max retries reached for request ${request.id} - discarding`);
			}
		}
	}

	saveQueue(remaining);

	if (remaining.length === 0) {
		console.log('✓ All queued requests processed successfully');
	} else {
		console.log(`${remaining.length} request(s) remaining in queue`);
	}
}

/**
 * Queue a check-in for later processing
 */
export async function queueCheckIn(
	supabaseUrl: string,
	accessToken: string,
	checkInData: {
		user_id: string;
		place_id: string;
		group_id?: string;
		activity_id?: string;
		check_in_type: string;
		latitude: number;
		longitude: number;
	}
): Promise<void> {
	await queueRequest(
		`${supabaseUrl}/rest/v1/check_ins`,
		'POST',
		{
			'Content-Type': 'application/json',
			apikey: accessToken,
			Authorization: `Bearer ${accessToken}`,
			Prefer: 'return=representation'
		},
		checkInData
	);

	console.log('Check-in queued for place:', checkInData.place_id);
}

/**
 * Queue a check-out for later processing
 */
export async function queueCheckOut(
	supabaseUrl: string,
	accessToken: string,
	checkInId: string
): Promise<void> {
	await queueRequest(
		`${supabaseUrl}/rest/v1/check_ins?id=eq.${checkInId}`,
		'PATCH',
		{
			'Content-Type': 'application/json',
			apikey: accessToken,
			Authorization: `Bearer ${accessToken}`
		},
		{
			checked_out_at: new Date().toISOString()
		}
	);

	console.log('Check-out queued for check-in:', checkInId);
}

/**
 * Queue a location update for later processing
 */
export async function queueLocationUpdate(
	supabaseUrl: string,
	accessToken: string,
	locationData: {
		user_id: string;
		latitude: number;
		longitude: number;
		accuracy?: number;
		place_name?: string;
	}
): Promise<void> {
	await queueRequest(
		`${supabaseUrl}/rest/v1/locations`,
		'POST',
		{
			'Content-Type': 'application/json',
			apikey: accessToken,
			Authorization: `Bearer ${accessToken}`,
			Prefer: 'resolution=merge-duplicates'
		},
		locationData
	);

	console.log('Location update queued for user:', locationData.user_id);
}

/**
 * Get the current queue
 */
function getQueue(): QueuedRequest[] {
	if (!browser) return [];

	try {
		const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch (error) {
		console.error('Error reading queue from localStorage:', error);
		return [];
	}
}

/**
 * Save the queue to storage
 */
function saveQueue(queue: QueuedRequest[]): void {
	if (!browser) return;

	try {
		localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
	} catch (error) {
		console.error('Failed to save queue to localStorage:', error);
	}
}

/**
 * Clear the queue
 */
export function clearQueue(): void {
	if (!browser) return;

	try {
		localStorage.removeItem(QUEUE_STORAGE_KEY);
		console.log('Queue cleared');
	} catch (error) {
		console.error('Failed to clear queue:', error);
	}
}

/**
 * Get the number of items in the queue
 */
export function getQueueSize(): number {
	return getQueue().length;
}

/**
 * Get all queued requests (for debugging)
 */
export function getQueuedRequests(): QueuedRequest[] {
	return getQueue();
}

/**
 * Initialize queue processing on network reconnect
 */
export function initializeQueueProcessor(supabase: SupabaseClient): void {
	if (!browser) return;

	// Process queue when coming back online
	window.addEventListener('online', () => {
		console.log('🌐 Network restored - processing offline queue...');
		processQueue(supabase);
	});

	// Check if we're online and have queued items on initialization
	if (navigator.onLine && getQueueSize() > 0) {
		console.log('📡 Online and have queued items - processing now...');
		// Small delay to ensure everything is initialized
		setTimeout(() => {
			processQueue(supabase);
		}, 1000);
	}

	console.log('✓ Offline queue processor initialized');
}
