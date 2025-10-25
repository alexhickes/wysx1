<!-- src/lib/components/InvitationsWidget.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import {
		getMyPendingInvitations,
		acceptGroupInvitation,
		declineGroupInvitation
	} from '$lib/groupInvitations';

	export let supabase: SupabaseClient;
	export let maxDisplay: number = 3; // How many to show before "View All"

	let invitations: any[] = [];
	let loading = true;
	let processing: Set<string> = new Set();
	let subscription: any = null;

	onMount(async () => {
		await loadInvitations();
		subscribeToChanges();
		loading = false;
	});

	onDestroy(() => {
		if (subscription) {
			subscription.unsubscribe();
		}
	});

	async function loadInvitations() {
		const { data, error } = await getMyPendingInvitations(supabase);
		if (!error && data) {
			invitations = data;
		}
	}

	function subscribeToChanges() {
		subscription = supabase
			.channel('invitation_widget_changes')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'group_invitations'
				},
				() => {
					loadInvitations();
				}
			)
			.subscribe();
	}

	async function handleAccept(invitationId: string, groupId: string, event: Event) {
		event.stopPropagation();

		processing.add(invitationId);
		processing = processing;

		const { data: result, error } = await acceptGroupInvitation(supabase, invitationId);

		if (error || !result.success) {
			alert('Failed to accept invitation: ' + (error?.message || result.error));
		} else {
			goto(`/groups/${groupId}`);
		}

		processing.delete(invitationId);
		processing = processing;
	}

	async function handleDecline(invitationId: string, event: Event) {
		event.stopPropagation();

		processing.add(invitationId);
		processing = processing;

		const { error } = await declineGroupInvitation(supabase, invitationId);

		if (error) {
			alert('Failed to decline invitation: ' + error.message);
		} else {
			await loadInvitations();
		}

		processing.delete(invitationId);
		processing = processing;
	}

	function getPlaceIcon(placeType: string): string {
		const icons: Record<string, string> = {
			skatepark: '🛹',
			gym: '🏋️',
			climbing: '🧗',
			cafe: '☕',
			coworking: '💻',
			park: '🌳',
			sports: '⚽'
		};
		return icons[placeType] || '📍';
	}

	function getDisplayName(profile: any): string {
		return profile?.display_name || profile?.username || 'Unknown';
	}

	function formatTimeAgo(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	$: displayedInvitations = invitations.slice(0, maxDisplay);
	$: hasMore = invitations.length > maxDisplay;
</script>

{#if !loading && invitations.length > 0}
	<div class="invitations-widget">
		<div class="widget-header">
			<h3>
				<span class="header-icon">📬</span>
				Group Invitations
				<span class="count-badge">{invitations.length}</span>
			</h3>
		</div>

		<div class="invitations-list">
			{#each displayedInvitations as invitation}
				{@const group = invitation.groups}
				{@const place = group?.place}
				{@const inviter = invitation.inviter}
				<div class="invitation-item">
					<div class="invitation-content">
						<div class="invitation-header">
							<div class="place-icon">
								{getPlaceIcon(place?.place_type || 'other')}
							</div>
							<div class="invitation-info">
								<div class="group-name">{group?.name || 'Unknown Group'}</div>
								<div class="place-name">at {place?.name || 'Unknown Place'}</div>
							</div>
						</div>

						<div class="invitation-meta">
							<span class="inviter-name">
								{getDisplayName(inviter)} invited you
							</span>
							<span class="time-ago">{formatTimeAgo(invitation.created_at)}</span>
						</div>
					</div>

					<div class="invitation-actions">
						<button
							class="decline-btn-small"
							on:click={(e) => handleDecline(invitation.id, e)}
							disabled={processing.has(invitation.id)}
							title="Decline"
						>
							{#if processing.has(invitation.id)}
								<span class="spinner-tiny"></span>
							{:else}
								✕
							{/if}
						</button>
						<button
							class="accept-btn-small"
							on:click={(e) => handleAccept(invitation.id, group?.id, e)}
							disabled={processing.has(invitation.id)}
							title="Accept"
						>
							{#if processing.has(invitation.id)}
								<span class="spinner-tiny"></span>
							{:else}
								✓
							{/if}
						</button>
					</div>
				</div>
			{/each}
		</div>

		{#if hasMore}
			<button class="view-all-btn" on:click={() => goto('/invitations')}>
				View All {invitations.length} Invitations →
			</button>
		{/if}
	</div>
{/if}

<style>
	.invitations-widget {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		overflow: hidden;
	}

	.widget-header {
		padding: 16px 20px;
		border-bottom: 1px solid #1a1a1a;
	}

	.widget-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: #fff;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.header-icon {
		font-size: 20px;
	}

	.count-badge {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 700;
		margin-left: auto;
	}

	.invitations-list {
		display: flex;
		flex-direction: column;
	}

	.invitation-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 20px;
		border-bottom: 1px solid #1a1a1a;
		transition: background 0.2s;
	}

	.invitation-item:last-child {
		border-bottom: none;
	}

	.invitation-item:hover {
		background: rgba(252, 76, 2, 0.05);
	}

	.invitation-content {
		flex: 1;
		min-width: 0;
	}

	.invitation-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}

	.place-icon {
		font-size: 24px;
		flex-shrink: 0;
	}

	.invitation-info {
		flex: 1;
		min-width: 0;
	}

	.group-name {
		font-size: 14px;
		font-weight: 600;
		color: #fff;
		margin-bottom: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.place-name {
		font-size: 12px;
		color: #666;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.invitation-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}

	.inviter-name {
		color: #999;
	}

	.time-ago {
		color: #666;
		margin-left: auto;
	}

	.invitation-actions {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}

	.decline-btn-small,
	.accept-btn-small {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
		font-weight: 700;
		transition: all 0.2s;
	}

	.decline-btn-small {
		background: rgba(244, 67, 54, 0.1);
		color: #f44336;
		border: 1px solid rgba(244, 67, 54, 0.3);
	}

	.decline-btn-small:hover:not(:disabled) {
		background: rgba(244, 67, 54, 0.2);
		border-color: #f44336;
	}

	.accept-btn-small {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.accept-btn-small:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(252, 76, 2, 0.4);
	}

	.decline-btn-small:disabled,
	.accept-btn-small:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner-tiny {
		width: 12px;
		height: 12px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.view-all-btn {
		width: 100%;
		padding: 14px;
		background: transparent;
		border: none;
		color: var(--color-primary);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border-top: 1px solid #1a1a1a;
	}

	.view-all-btn:hover {
		background: rgba(252, 76, 2, 0.05);
	}

	@media (max-width: 768px) {
		.invitation-meta {
			flex-direction: column;
			align-items: flex-start;
			gap: 4px;
		}

		.time-ago {
			margin-left: 0;
		}
	}
</style>
