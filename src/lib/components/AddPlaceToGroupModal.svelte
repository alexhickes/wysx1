<!-- src/lib/components/AddPlaceToGroupModal.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';

	export let isOpen = false;
	export let supabase: SupabaseClient;
	export let groupId: string;
	export let existingPlaceIds: string[] = [];
	export let onPlaceAdded: (placeId: string) => void;
	export let onClose: () => void;

	let places: any[] = [];
	let loading = true;
	let error = '';
	let searchQuery = '';
	let selectedPlaceId = '';

	$: filteredPlaces = places.filter((place) => {
		const matchesSearch = place.name.toLowerCase().includes(searchQuery.toLowerCase());
		const notAlreadyAdded = !existingPlaceIds.includes(place.id);
		return matchesSearch && notAlreadyAdded;
	});

	onMount(() => {
		if (isOpen) {
			loadPlaces();
		}
	});

	$: if (isOpen) {
		loadPlaces();
	}

	async function loadPlaces() {
		loading = true;
		error = '';

		try {
			const { data, error: fetchError } = await supabase
				.from('places')
				.select('*')
				.eq('is_public', true)
				.order('name');

			if (fetchError) throw fetchError;

			places = data || [];
		} catch (err: any) {
			error = err.message || 'Failed to load places';
		} finally {
			loading = false;
		}
	}

	function handleSelectPlace(placeId: string) {
		selectedPlaceId = placeId;
	}

	async function handleAddPlace() {
		if (!selectedPlaceId) {
			error = 'Please select a place';
			return;
		}

		try {
			onPlaceAdded(selectedPlaceId);
			handleClose();
		} catch (err: any) {
			error = err.message || 'Failed to add place';
		}
	}

	function handleClose() {
		selectedPlaceId = '';
		searchQuery = '';
		error = '';
		onClose();
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
</script>

{#if isOpen}
	<div class="modal-overlay" on:click={handleClose} role="button" tabindex="0">
		<div class="modal-content" on:click|stopPropagation role="dialog" tabindex="-1">
			<div class="modal-header">
				<h2>Add Location to Group</h2>
				<button class="close-btn" on:click={handleClose} aria-label="Close">×</button>
			</div>

			<div class="modal-body">
				{#if error}
					<div class="error-message">{error}</div>
				{/if}

				<!-- Search -->
				<div class="search-box">
					<input
						type="text"
						placeholder="Search places..."
						bind:value={searchQuery}
						class="search-input"
					/>
				</div>

				{#if loading}
					<div class="loading">
						<div class="spinner"></div>
						<p>Loading places...</p>
					</div>
				{:else if filteredPlaces.length === 0}
					<div class="empty-state">
						<span class="empty-icon">📍</span>
						<p>
							{searchQuery ? 'No places found matching your search' : 'No available places to add'}
						</p>
					</div>
				{:else}
					<div class="places-list">
						{#each filteredPlaces as place}
							<button
								class="place-item"
								class:selected={selectedPlaceId === place.id}
								on:click={() => handleSelectPlace(place.id)}
							>
								<div class="place-icon">
									{getPlaceIcon(place.place_type)}
								</div>
								<div class="place-info">
									<div class="place-name">{place.name}</div>
									{#if place.description}
										<div class="place-description">{place.description}</div>
									{/if}
									<div class="place-meta">
										{place.radius}m radius
										{#if place.address}
											• {place.address}
										{/if}
									</div>
								</div>
								{#if selectedPlaceId === place.id}
									<div class="selected-indicator">✓</div>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="cancel-btn" on:click={handleClose}>Cancel</button>
				<button class="add-btn" on:click={handleAddPlace} disabled={!selectedPlaceId || loading}>
					Add Location
				</button>
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
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 16px;
		width: 100%;
		max-width: 600px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		padding: 24px;
		border-bottom: 1px solid #1a1a1a;
		display: flex;
		justify-content: space-between;
		align-items: center;
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
		font-size: 32px;
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: #1a1a1a;
		color: #fff;
	}

	.modal-body {
		padding: 24px;
		overflow-y: auto;
		flex: 1;
	}

	.error-message {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid #f44336;
		color: #f44336;
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 16px;
		font-size: 14px;
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
	}

	.search-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.loading {
		text-align: center;
		padding: 40px 20px;
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

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading p {
		color: #666;
		margin: 0;
	}

	.empty-state {
		text-align: center;
		padding: 40px 20px;
	}

	.empty-icon {
		font-size: 48px;
		display: block;
		margin-bottom: 12px;
	}

	.empty-state p {
		color: #666;
		margin: 0;
	}

	.places-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.place-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		background: #000;
		border: 2px solid #1a1a1a;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
		width: 100%;
	}

	.place-item:hover {
		border-color: #333;
		background: #0a0a0a;
	}

	.place-item.selected {
		border-color: var(--color-primary);
		background: rgba(252, 76, 2, 0.05);
	}

	.place-icon {
		font-size: 32px;
		flex-shrink: 0;
	}

	.place-info {
		flex: 1;
		min-width: 0;
	}

	.place-name {
		font-size: 16px;
		font-weight: 600;
		color: #fff;
		margin-bottom: 4px;
	}

	.place-description {
		font-size: 13px;
		color: #999;
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.place-meta {
		font-size: 12px;
		color: #666;
	}

	.selected-indicator {
		font-size: 24px;
		color: var(--color-primary);
		flex-shrink: 0;
	}

	.modal-footer {
		padding: 20px 24px;
		border-top: 1px solid #1a1a1a;
		display: flex;
		gap: 12px;
	}

	.cancel-btn,
	.add-btn {
		flex: 1;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
	}

	.cancel-btn {
		background: #1a1a1a;
		color: #fff;
	}

	.cancel-btn:hover {
		background: #333;
	}

	.add-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.add-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.modal-content {
			max-height: 90vh;
		}

		.modal-header {
			padding: 20px;
		}

		.modal-body {
			padding: 20px;
		}
	}
</style>
