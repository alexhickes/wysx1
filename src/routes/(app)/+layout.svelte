<script lang="ts">
	import '../../app.css';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	$: profile = data.profile;
	$: currentPath = $page.url.pathname;

	const navItems = [
		{ path: '/home', label: 'Home', icon: '🏠' },
		{ path: '/map', label: 'Map', icon: '🗺️' },
		{ path: '/friends', label: 'Friends', icon: '👥' },
		{ path: '/places', label: 'Places', icon: '📍' }
	];

	async function handleSignOut() {
		await data.supabase.auth.signOut();
		goto('/');
	}
</script>

<div class="app-shell">
	<!-- Header -->
	<header class="header">
		<div class="header-content">
			<h1 class="app-title">
				{#if currentPath === '/home'}
					Home
				{:else if currentPath === '/map'}
					Map
					<!-- {:else if currentPath === '/friends'}
					Friends
				{:else if currentPath === '/places'} -->
					Places
				{:else}
					Location Share
				{/if}
			</h1>

			<div class="header-actions">
				<button class="icon-btn" on:click={() => goto('/profile')} aria-label="Profile">
					<div class="avatar">
						{profile?.display_name?.charAt(0)?.toUpperCase() ||
							profile?.username?.charAt(0)?.toUpperCase() ||
							'?'}
					</div>
				</button>
				<button class="icon-btn" on:click={() => goto('/settings')} aria-label="Settings">
					⚙️
				</button>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="main-content">
		<slot />
	</main>

	<!-- Bottom Navigation -->
	<nav class="bottom-nav">
		{#each navItems as item}
			<a
				href={item.path}
				class="nav-item"
				class:active={currentPath === item.path}
				aria-label={item.label}
			>
				<span class="nav-icon">{item.icon}</span>
				<span class="nav-label">{item.label}</span>
			</a>
		{/each}
	</nav>
</div>

<style>
	.app-shell {
		/* display: flex; */
		flex-direction: column;
		height: 100vh;
		background: #000;
		color: #fff;
	}

	/* Header */
	.header {
		background: #000;
		border-bottom: 1px solid #1a1a1a;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		max-width: 100%;
	}

	.app-title {
		font-size: 24px;
		font-weight: 700;
		margin: 0;
		color: #fff;
	}

	.header-actions {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.icon-btn {
		background: transparent;
		border: none;
		padding: 8px;
		cursor: pointer;
		border-radius: 50%;
		transition: background 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-btn:hover {
		background: #1a1a1a;
	}

	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 16px;
		color: #fff;
	}

	/* Main Content */
	.main-content {
		flex: 1;
		overflow-y: auto;
		background: #000;
		padding-bottom: 70px; /* Space for bottom nav */
	}

	/* Bottom Navigation */
	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		background: #0a0a0a;
		border-top: 1px solid #1a1a1a;
		padding: 8px 0;
		z-index: 100;
	}

	.nav-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 8px 0;
		text-decoration: none;
		color: #666;
		transition: color 0.2s;
	}

	.nav-item.active {
		color: var(--color-primary);
	}

	.nav-item:hover {
		color: var(--color-primary);
	}

	.nav-icon {
		font-size: 24px;
		margin-bottom: 4px;
	}

	.nav-label {
		font-size: 11px;
		font-weight: 600;
	}

	/* Scrollbar styling */
	.main-content::-webkit-scrollbar {
		width: 6px;
	}

	.main-content::-webkit-scrollbar-track {
		background: #0a0a0a;
	}

	.main-content::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 3px;
	}
</style>
