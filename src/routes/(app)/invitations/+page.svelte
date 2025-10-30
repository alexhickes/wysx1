<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import {
		getMyPendingInvitations,
		acceptGroupInvitation,
		declineGroupInvitation
	} from '$lib/groupInvitations';

	export let data: PageData;

	let invitations: any[] = [];
	let loading = true;
	let processing: Set<string> = new Set();

	onMount(async () => {
		await loadInvitations();
		loading = false;
	});

	async function loadInvitations() {
		const { data: invitationsData, error } = await getMyPendingInvitations(data.supabase);

		if (!error && invitationsData) {
			invitations = invitationsData;
		}
	}

	async function handleAccept(invitationId: string, groupId: string) {
		processing.add(invitationId);
		processing = processing;

		const { data: result, error } = await acceptGroupInvitation(data.supabase, invitationId);

		if (error || !result.success) {
			alert('Failed to accept invitation: ' + (error?.message || result.error));
			processing.delete(invitationId);
			processing = processing;
			return;
		}

		// Navigate to the group
		goto(`/groups/${groupId}`);
	}

	async function handleDecline(invitationId: string) {
		if (!confirm('Are you sure you want to decline this invitation?')) {
			return;
		}

		processing.add(invitationId);
		processing = processing;

		const { error } = await declineGroupInvitation(data.supabase, invitationId);

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

	function formatDate(dateString: string): string {
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
</script>

<svelte:head>
	<title>Invitations - Location Share</title>
</svelte:head>

<div class="invitations-page">
	<!-- Header -->
	<div class="header">
		<button class="back-btn" on:click={() => goto('/dashboard')}> ← Back </button>
		<h1>Invitations</h1>
	</div>

	<!-- Content -->
	<div class="content">
		{#if loading}
			<div class="loading">
				<div class="spinner"></div>
			</div>
		{:else if invitations.length === 0}
			<div class="empty-state">
				<span class="empty-icon">📬</span>
				<h2>No pending invitations</h2>
				<p>When friends invite you to groups, they'll appear here</p>
			</div>
		{:else}
			<div class="invitations-list">
				{#each invitations as invitation}
					{@const group = invitation.groups}
					{@const place = group?.place}
					{@const inviter = invitation.inviter}
					<div class="invitation-card">
						<div class="card-header">
							<div class="place-icon">
								{getPlaceIcon(place?.place_type || 'other')}
							</div>
							<div class="card-info">
								<h3 class="group-name">{group?.name || 'Unknown Group'}</h3>
								<div class="place-name">(group_members.size) group members</div>
							</div>
						</div>

						{#if group?.description}
							<p class="group-description">{group.description}</p>
						{/if}

						<div class="invitation-meta">
							<div class="inviter-info">
								<div class="inviter-avatar">
									{getDisplayName(inviter).charAt(0).toUpperCase()}
								</div>
								<div class="inviter-details">
									<div class="inviter-name">
										Invited by {getDisplayName(inviter)}
									</div>
									<div class="invite-time">{formatDate(invitation.created_at)}</div>
								</div>
							</div>

							{#if group?.is_public}
								<span class="group-badge">Public</span>
							{:else}
								<span class="group-badge private">Private</span>
							{/if}
						</div>

						<div class="card-actions">
							<button
								class="decline-btn"
								on:click={() => handleDecline(invitation.id)}
								disabled={processing.has(invitation.id)}
							>
								{#if processing.has(invitation.id)}
									<span class="spinner-small"></span>
								{:else}
									Decline
								{/if}
							</button>
							<button
								class="accept-btn"
								on:click={() => handleAccept(invitation.id, group?.id)}
								disabled={processing.has(invitation.id)}
							>
								{#if processing.has(invitation.id)}
									<span class="spinner-small"></span>
								{:else}
									Accept & Join
								{/if}
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.invitations-page {
		min-height: 100vh;
		background: #000;
		color: #fff;
		padding-bottom: 80px;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px;
		border-bottom: 1px solid #1a1a1a;
		position: sticky;
		top: 0;
		background: #000;
		z-index: 10;
	}

	.back-btn {
		background: transparent;
		border: none;
		color: var(--color-primary);
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		padding: 8px 12px;
	}

	.header h1 {
		font-size: 24px;
		margin: 0;
		font-weight: 700;
	}

	.content {
		padding: 20px;
		max-width: 600px;
		margin: 0 auto;
	}

	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 400px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #333;
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.spinner-small {
		width: 14px;
		height: 14px;
		border: 2px solid #333;
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		display: inline-block;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.empty-state {
		text-align: center;
		padding: 60px 20px;
	}

	.empty-icon {
		font-size: 72px;
		display: block;
		margin-bottom: 20px;
	}

	.empty-state h2 {
		font-size: 22px;
		font-weight: 700;
		color: #fff;
		margin: 0 0 12px 0;
	}

	.empty-state p {
		font-size: 15px;
		color: #666;
		margin: 0;
	}

	.invitations-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.invitation-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 20px;
		transition: all 0.2s;
	}

	.invitation-card:hover {
		border-color: var(--color-primary);
	}

	.card-header {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 12px;
	}

	.place-icon {
		font-size: 40px;
		flex-shrink: 0;
	}

	.card-info {
		flex: 1;
		min-width: 0;
	}

	.group-name {
		font-size: 18px;
		font-weight: 700;
		color: #fff;
		margin: 0 0 6px 0;
	}

	.place-name {
		font-size: 14px;
		color: #999;
	}

	.group-description {
		font-size: 14px;
		color: #ccc;
		line-height: 1.6;
		margin: 0 0 16px 0;
	}

	.invitation-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
		padding-top: 16px;
		border-top: 1px solid #1a1a1a;
	}

	.inviter-info {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.inviter-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 14px;
		color: #fff;
		flex-shrink: 0;
	}

	.inviter-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.inviter-name {
		font-size: 13px;
		color: #fff;
		font-weight: 600;
	}

	.invite-time {
		font-size: 12px;
		color: #666;
	}

	.group-badge {
		padding: 4px 10px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		background: rgba(76, 175, 80, 0.2);
		color: #4caf50;
		flex-shrink: 0;
	}

	.group-badge.private {
		background: rgba(158, 158, 158, 0.2);
		color: #999;
	}

	.card-actions {
		display: flex;
		gap: 12px;
	}

	.decline-btn,
	.accept-btn {
		flex: 1;
		padding: 14px 24px;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.decline-btn {
		background: transparent;
		border: 2px solid #f44336;
		color: #f44336;
	}

	.decline-btn:hover:not(:disabled) {
		background: rgba(244, 67, 54, 0.1);
	}

	.accept-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.accept-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.decline-btn:disabled,
	.accept-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.card-actions {
			flex-direction: column-reverse;
		}

		.invitation-meta {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}
	}
</style>
