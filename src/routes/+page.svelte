<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, SubmitFunction } from './$types.js';

	interface Props {
		form: ActionData;
	}
	let { form }: Props = $props();

	let loading = $state(false);

	const handleSubmit: SubmitFunction = () => {
		loading = true;
		return async ({ update }) => {
			update();
			loading = false;
		};
	};
</script>

<svelte:head>
	<title>Wys X</title>
</svelte:head>

<form class="row flex flex-center" method="POST" use:enhance={handleSubmit}>
	<div class="col-6 form-widget">
		<h1 class="header">Wys X</h1>
		<p class="description">Sign in via magic link with your email below</p>
		{#if form?.message !== undefined}
			<div class="success {form?.success ? '' : 'fail'}">
				{form?.message}
			</div>
		{/if}
		<div>
			<label for="email">Email address</label>
			<input
				id="email"
				name="email"
				class="inputField"
				type="email"
				placeholder="Your email"
				value={form?.email ?? ''}
			/>
		</div>
		{#if form?.errors?.email}
			<span class="flex items-center text-sm error">
				{form?.errors?.email}
			</span>
		{/if}
		<div>
			<button class="button primary block">
				{loading ? 'Loading' : 'Send magic link'}
			</button>
		</div>
	</div>
</form>

<!-- Cool ai generated user / password and signup dialog-->
<!-- <script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import type { ActionData, SubmitFunction } from './$types.js';

	interface Props {
		form: ActionData;
		data: PageData;
	}
	let { form, data }: Props = $props();

	let loading = $state(false);

	const handleSubmit: SubmitFunction = () => {
		loading = true;
		return async ({ update }) => {
			update();
			loading = false;
		};
	};

	onMount(() => {
		if (data.session) {
			goto('/map');
		}
	});

	let email = '';
	let password = '';
	let isSignUp = false;
	// let loading = false;
	let error = '';

	async function handleAuth() {
		loading = true;
		error = '';

		try {
			if (isSignUp) {
				const { error: signUpError } = await data.supabase.auth.signUp({
					email,
					password
				});
				if (signUpError) throw signUpError;
				alert('Check your email for confirmation link!');
			} else {
				const { error: signInError } = await data.supabase.auth.signInWithPassword({
					email,
					password
				});
				if (signInError) throw signInError;
				goto('/map');
			}
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Wys X</title>
</svelte:head>

<form class="row flex flex-center" method="POST" use:enhance={handleSubmit}>
	<div class="col-6 form-widget">
		<h1 class="header">Supabase + SvelteKit</h1>
		<p class="description">Sign in via magic link with your email below</p>
		{#if form?.message !== undefined}
			<div class="success {form?.success ? '' : 'fail'}">
				{form?.message}
			</div>
		{/if}
		<div>
			<label for="email">Email address</label>
			<input
				id="email"
				name="email"
				class="inputField"
				type="email"
				placeholder="Your email"
				value={form?.email ?? ''}
			/>
		</div>
		{#if form?.errors?.email}
			<span class="flex items-center text-sm error">
				{form?.errors?.email}
			</span>
		{/if}
		<div>
			<button class="button primary block">
				{loading ? 'Loading' : 'Send magic link'}
			</button>
		</div>
	</div>
</form>

<div class="container">
	<div class="auth-card">
		<h1>📍 Wys X</h1>
		<p>What you saying?</p>

		{#if error}
			<div class="error">{error}</div>
		{/if}

		<form on:submit|preventDefault={handleAuth}>
			<input type="email" placeholder="Email" bind:value={email} required />
			<input type="password" placeholder="Password" bind:value={password} required />
			<button type="submit" disabled={loading}>
				{loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
			</button>
		</form>

		<button class="toggle" on:click={() => (isSignUp = !isSignUp)}>
			{isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
		</button>
	</div>
</div>

<style>
	.container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		padding: 20px;
	}

	.auth-card {
		background: white;
		padding: 40px;
		border-radius: 12px;
		box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
		max-width: 400px;
		width: 100%;
	}

	h1 {
		margin: 0 0 10px 0;
		color: #333;
	}

	p {
		color: #666;
		margin: 0 0 30px 0;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 15px;
	}

	input {
		padding: 12px;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 16px;
	}

	button {
		padding: 12px;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 16px;
		cursor: pointer;
		font-weight: 600;
	}

	button:hover {
		background: #45a049;
	}

	button:disabled {
		background: #ccc;
		cursor: not-allowed;
	}

	.toggle {
		background: transparent;
		color: #4caf50;
		margin-top: 10px;
	}

	.toggle:hover {
		background: #f0f0f0;
	}

	.error {
		background: #ffebee;
		color: #c62828;
		padding: 10px;
		border-radius: 6px;
		margin-bottom: 15px;
	}
</style> -->
