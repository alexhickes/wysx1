<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { getMyPendingInvitations } from '$lib/groupInvitations';

	export let supabase: SupabaseClient;

	let count = 0;
	let loading = true;
	let subscription: any = null;

	onMount(async () => {
		await loadCount();
		subscribeToChanges();
		loading = false;
	});

	onDestroy(() => {
		if (subscription) {
			subscription.unsubscribe();
		}
	});

	async function loadCount() {
		const { data, error } = await getMyPendingInvitations(supabase);
		if (!error && data) {
			count = data.length;
		}
	}

	function subscribeToChanges() {
		// Subscribe to changes in group_invitations table
		subscription = supabase
			.channel('invitation_changes')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'group_invitations'
				},
				() => {
					loadCount();
				}
			)
			.subscribe();
	}

	function handleClick() {
		goto('/invitations');
	}
</script>

{#if !loading && count > 0}
	<button class="invitation-badge" on:click={handleClick}>
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
