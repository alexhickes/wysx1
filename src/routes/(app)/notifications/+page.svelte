<script lang="ts">
	import { notifications } from '$lib/stores/notifications';
	import { goto } from '$app/navigation';

	function handleNotificationClick(notification: any) {
		notifications.markAsRead(notification.id);

		if (notification.data?.url) {
			goto(notification.data.url);
		}
	}
</script>

<div class="notifications-page">
	<h1>Notifications</h1>

	{#if $notifications.length === 0}
		<p>No notifications yet</p>
	{:else}
		<div class="notification-list">
			{#each $notifications as notification}
				<button
					class="notification-item"
					class:unread={!notification.read}
					on:click={() => handleNotificationClick(notification)}
				>
					<div class="notification-content">
						<h3>{notification.title}</h3>
						<p>{notification.message}</p>
						<small>{new Date(notification.created_at).toLocaleString()}</small>
					</div>
					{#if !notification.read}
						<span class="unread-dot"></span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.notification-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: white;
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: background 0.2s;
	}

	.notification-item:hover {
		background: #f9fafb;
	}

	.notification-item.unread {
		background: #eff6ff;
		border-color: #3b82f6;
	}

	.unread-dot {
		width: 10px;
		height: 10px;
		background: #3b82f6;
		border-radius: 50%;
	}
</style>
