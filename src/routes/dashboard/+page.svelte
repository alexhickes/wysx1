<!-- Example: Add to your dashboard page -->
<!-- src/routes/dashboard/+page.svelte -->

<script lang="ts">
	import InvitationsWidget from '$lib/components/InvitationsWidget.svelte';
	import InvitationBadge from '$lib/components/InvitationBadge.svelte';

	import type { PageData } from './$types';

	export let data: PageData;
</script>

<div class="dashboard">
	<!-- Top Navigation Bar -->
	<nav class="top-nav">
		<h1>Dashboard</h1>
		<div class="nav-actions">
			<!-- Invitation Badge with Notification Count -->
			<InvitationBadge supabase={data.supabase} />
		</div>
	</nav>

	<!-- Dashboard Content -->
	<div class="dashboard-content">
		<!-- Invitations Widget (shows recent invitations) -->
		<div class="section">
			<InvitationsWidget supabase={data.supabase} maxDisplay={3} />
		</div>

		<!-- Other dashboard widgets -->
		<div class="section">
			<!-- Your other content -->
		</div>
	</div>
</div>

<style>
	.dashboard {
		min-height: 100vh;
		background: #000;
		color: #fff;
	}

	.top-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid #1a1a1a;
		position: sticky;
		top: 0;
		background: #000;
		z-index: 100;
	}

	.top-nav h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
	}

	.nav-actions {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.dashboard-content {
		padding: 20px;
		max-width: 1200px;
		margin: 0 auto;
	}

	.section {
		margin-bottom: 24px;
	}

	@media (max-width: 768px) {
		.top-nav h1 {
			font-size: 20px;
		}

		.dashboard-content {
			padding: 16px;
		}
	}
</style>
