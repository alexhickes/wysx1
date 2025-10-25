<!-- src/lib/components/InviteToGroupModal.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import {
		getInvitableFriends,
		sendGroupInvitation,
		cancelGroupInvitation,
		getGroupInvitations,
		type InvitableFriend
	} from '$lib/groupInvitations';

	export let supabase: SupabaseClient;
	export let groupId: string;
	export let groupName: string;
	export let isOpen: boolean = false;
	export let onClose: () => void;

	let friends: InvitableFriend[] = [];
	let pendingInvitations: any[] = [];
	let loading = true;
	let searchQuery = '';
	let sending: Set<string> = new Set();
	let canceling: Set<string> = new Set();

	$: filteredFriends = friends.filter((friend) => {
		const searchLower = searchQuery.toLowerCase();
		const displayName = friend.display_name?.toLowerCase() || '';
		const username = friend.username.toLowerCase();
		return displayName.includes(searchLower) || username.includes(searchLower);
	});

	$: invitableFriends = filteredFriends.filter(
		(friend) => !friend.is_member && !friend.already_invited
	);
	$: alreadyMembers = filteredFriends.filter((friend) => friend.is_member);
	$: alreadyInvited = filteredFriends.filter(
		(friend) => friend.already_invited && !friend.is_member
	);

	onMount(() => {
		if (isOpen) {
			loadData();
		}
	});

	$: if (isOpen) {
		loadData();
	}

	async function loadData() {
		loading = true;
		await Promise.all([loadFriends(), loadPendingInvitations()]);
		loading = false;
	}

	async function loadFriends() {
		const { data, error } = await getInvitableFriends(supabase, groupId);
		if (!error && data) {
			friends = data;
		}
	}

	async function loadPendingInvitations() {
		const { data, error } = await getGroupInvitations(supabase, groupId);
		if (!error && data) {
			pendingInvitations = data;
		}
	}

	async function handleInvite(userId: string) {
		sending.add(userId);
		sending = sending; // Trigger reactivity

		const { error } = await sendGroupInvitation(supabase, groupId, userId);

		if (error) {
			alert('Failed to send invitation: ' + error.message);
		} else {
			await loadData();
		}

		sending.delete(userId);
		sending = sending;
	}

	async function handleCancelInvitation(invitationId: string) {
		canceling.add(invitationId);
		canceling = canceling;

		const { error } = await cancelGroupInvitation(supabase, invitationId);

		if (error) {
			alert('Failed to cancel invitation: ' + error.message);
		} else {
			await loadData();
		}

		canceling.delete(invitationId);
		canceling = canceling;
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function getDisplayName(friend: InvitableFriend): string {
		return friend.display_name || friend.username;
	}
</script>

{#if isOpen}
	<div class="modal-overlay" on:click={handleOverlayClick} role="presentation">
		<div class="modal-content">
			<div class="modal-header">
				<h2>Invite to {groupName}</h2>
				<button class="close-btn" on:click={onClose} aria-label="Close modal">✕</button>
			</div>

			<div class="modal-body">
				<!-- Search -->
				<div class="search-box">
					<input
						type="text"
						placeholder="Search friends..."
						bind:value={searchQuery}
						class="search-input"
					/>
				</div>

				{#if loading}
					<div class="loading-state">
						<div class="spinner"></div>
						<p>Loading friends...</p>
					</div>
				{:else if friends.length === 0}
					<div class="empty-state">
						<span class="empty-icon">👥</span>
						<p>No friends to invite</p>
						<p class="empty-hint">Add friends first to invite them to groups</p>
					</div>
				{:else}
					<!-- Invitable Friends -->
					{#if invitableFriends.length > 0}
						<div class="section">
							<h3 class="section-title">Friends ({invitableFriends.length})</h3>
							<div class="friends-list">
								{#each invitableFriends as friend}
									<div class="friend-item">
										<div class="friend-avatar">
											{getDisplayName(friend).charAt(0).toUpperCase()}
										</div>
										<div class="friend-info">
											<div class="friend-name">{getDisplayName(friend)}</div>
											<div class="friend-username">@{friend.username}</div>
										</div>
										<button
											class="invite-btn"
											on:click={() => handleInvite(friend.user_id)}
											disabled={sending.has(friend.user_id)}
										>
											{#if sending.has(friend.user_id)}
												<span class="spinner-small"></span>
											{:else}
												+ Invite
											{/if}
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Already Invited -->
					{#if alreadyInvited.length > 0}
						<div class="section">
							<h3 class="section-title">Pending Invitations ({alreadyInvited.length})</h3>
							<div class="friends-list">
								{#each alreadyInvited as friend}
									{@const invitation = pendingInvitations.find(
										(inv) => inv.invitee_id === friend.user_id
									)}
									<div class="friend-item invited">
										<div class="friend-avatar">
											{getDisplayName(friend).charAt(0).toUpperCase()}
										</div>
										<div class="friend-info">
											<div class="friend-name">{getDisplayName(friend)}</div>
											<div class="friend-username">@{friend.username}</div>
											<div class="invited-badge">Invitation sent</div>
										</div>
										{#if invitation}
											<button
												class="cancel-btn"
												on:click={() => handleCancelInvitation(invitation.id)}
												disabled={canceling.has(invitation.id)}
											>
												{#if canceling.has(invitation.id)}
													<span class="spinner-small"></span>
												{:else}
													Cancel
												{/if}
											</button>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Already Members -->
					{#if alreadyMembers.length > 0}
						<div class="section">
							<h3 class="section-title">Already Members ({alreadyMembers.length})</h3>
							<div class="friends-list">
								{#each alreadyMembers as friend}
									<div class="friend-item member">
										<div class="friend-avatar">
											{getDisplayName(friend).charAt(0).toUpperCase()}
										</div>
										<div class="friend-info">
											<div class="friend-name">{getDisplayName(friend)}</div>
											<div class="friend-username">@{friend.username}</div>
										</div>
										<span class="member-badge">✓ Member</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if invitableFriends.length === 0 && alreadyInvited.length === 0 && alreadyMembers.length > 0}
						<div class="all-invited">
							<span class="check-icon">✓</span>
							<p>All your friends are already in this group!</p>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-content {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 16px;
		width: 100%;
		max-width: 500px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid #1a1a1a;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		color: #fff;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: #666;
		font-size: 24px;
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: #1a1a1a;
		color: #fff;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
	}

	.search-box {
		margin-bottom: 20px;
	}

	.search-input {
		width: 100%;
		background: #000;
		border: 1px solid #333;
		color: #fff;
		padding: 12px 16px;
		border-radius: 8px;
		font-size: 15px;
		font-family: inherit;
	}

	.search-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.search-input::placeholder {
		color: #666;
	}

	.loading-state {
		text-align: center;
		padding: 40px 20px;
		color: #666;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #333;
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 16px;
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

	.loading-state p {
		margin: 0;
		color: #666;
	}

	.empty-state,
	.all-invited {
		text-align: center;
		padding: 40px 20px;
		color: #666;
	}

	.empty-icon,
	.check-icon {
		font-size: 48px;
		display: block;
		margin-bottom: 12px;
	}

	.check-icon {
		color: #4caf50;
	}

	.empty-state p,
	.all-invited p {
		margin: 0;
		color: #666;
	}

	.empty-hint {
		font-size: 13px;
		margin-top: 4px;
	}

	.section {
		margin-bottom: 24px;
	}

	.section:last-child {
		margin-bottom: 0;
	}

	.section-title {
		font-size: 14px;
		font-weight: 700;
		color: #999;
		text-transform: uppercase;
		margin: 0 0 12px 0;
		letter-spacing: 0.5px;
	}

	.friends-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.friend-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: #000;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		transition: all 0.2s;
	}

	.friend-item:hover {
		border-color: #333;
	}

	.friend-item.invited {
		background: rgba(252, 76, 2, 0.05);
		border-color: rgba(252, 76, 2, 0.2);
	}

	.friend-item.member {
		opacity: 0.6;
	}

	.friend-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 16px;
		color: #fff;
		flex-shrink: 0;
	}

	.friend-info {
		flex: 1;
		min-width: 0;
	}

	.friend-name {
		font-size: 15px;
		font-weight: 600;
		color: #fff;
		margin-bottom: 2px;
	}

	.friend-username {
		font-size: 13px;
		color: #666;
	}

	.invited-badge {
		font-size: 12px;
		color: var(--color-primary);
		margin-top: 4px;
		font-weight: 600;
	}

	.invite-btn,
	.cancel-btn {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
		flex-shrink: 0;
		min-width: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}

	.invite-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.invite-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(252, 76, 2, 0.3);
	}

	.invite-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cancel-btn {
		background: transparent;
		border: 1px solid #f44336;
		color: #f44336;
	}

	.cancel-btn:hover:not(:disabled) {
		background: rgba(244, 67, 54, 0.1);
	}

	.cancel-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.member-badge {
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		background: rgba(76, 175, 80, 0.2);
		color: #4caf50;
		flex-shrink: 0;
	}

	/* Mobile Responsive */
	@media (max-width: 480px) {
		.modal-content {
			max-height: 90vh;
			border-radius: 12px;
		}

		.modal-header {
			padding: 16px;
		}

		.modal-header h2 {
			font-size: 18px;
		}

		.modal-body {
			padding: 16px;
		}

		.friend-item {
			padding: 10px;
		}

		.friend-avatar {
			width: 36px;
			height: 36px;
			font-size: 14px;
		}

		.invite-btn,
		.cancel-btn {
			padding: 6px 12px;
			font-size: 13px;
			min-width: 70px;
		}
	}
</style>
