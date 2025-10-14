<!-- Drawer.svelte -->
<script>
	import { onMount } from 'svelte';
	export let isOpen = false;

	function closeOnEscape(event) {
		if (event.key === 'Escape') {
			isOpen = false;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', closeOnEscape);
		return () => {
			window.removeEventListener('keydown', closeOnEscape);
		};
	});
</script>

{#if isOpen}
	<div class="overlay" on:click={() => (isOpen = false)}></div>
	<div class="drawer" class:is-open={isOpen}>
		<div class="content">
			<slot />
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		z-index: 10;
	}
	.drawer {
		position: fixed;
		bottom: 0;
		left: 0;
		width: 100%;
		background-color: white;
		box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.2);
		transform: translateY(100%);
		transition: transform 0.3s ease-in-out;
		z-index: 20;
	}
	.drawer.is-open {
		transform: translateY(0);
	}
	.content {
		padding: 2rem;
	}
</style>
