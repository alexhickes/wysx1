<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
	import {
		getMyPendingInvitations,
		subscribeGroupInvitationChanges,
		unsubscribeGroupInvitationChanges
	} from '$lib/groupInvitations';

	interface Props {
		supabase: SupabaseClient;
		userId: string;
	}

	let { supabase, userId }: Props = $props();

	let count = $state(0);
	let loading = $state(true);
	let realtimeChannel = $state<RealtimeChannel | null>(null);

	onMount(async () => {
		console.log('🔔 InvitationBadge mounted');
		await loadCount();
		loading = false;

		// Setup Realtime subscription
		if (userId) {
			console.log('📡 Setting up group invitation subscription...');
			realtimeChannel = subscribeGroupInvitationChanges(supabase, userId, handleRealtimeUpdate);
		}
	});

	onDestroy(() => {
		console.log('🔌 InvitationBadge unmounting');
		if (realtimeChannel) {
			unsubscribeGroupInvitationChanges(supabase, realtimeChannel);
		}
	});

	/**
	 * Handle realtime updates - reload count when invitations change
	 */
	function handleRealtimeUpdate() {
		console.log('🔄 Group invitation update received, reloading count...');
		loadCount();
	}

	async function loadCount() {
		const { data, error } = await getMyPendingInvitations(supabase);
		console.log('📊 Pending invitations:', data?.length || 0);

		if (!error && data) {
			count = data.length;
		}
	}

	function handleClick() {
		goto('/invitations');
	}
</script>

{#if !loading && count > 0}
	<button class="invitation-badge" onclick={handleClick}>
		<span class="badge-icon">📬</span>
		<span class="badge-count">{count}</span>
	</button>
{/if}

<style>
	.invitation-badge {
		position: relative;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		border: none;
		color: #fff;
		padding: 10px 16px;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		transition: all 0.2s;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(252, 76, 2, 0.7);
		}
		50% {
			box-shadow: 0 0 0 10px rgba(252, 76, 2, 0);
		}
	}

	.invitation-badge:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(252, 76, 2, 0.4);
	}

	.badge-icon {
		font-size: 18px;
	}

	.badge-count {
		background: #fff;
		color: var(--color-primary);
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 700;
		min-width: 20px;
		text-align: center;
	}
</style>
