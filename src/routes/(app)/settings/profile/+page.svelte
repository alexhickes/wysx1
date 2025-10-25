<!-- src/routes/(app)/settings/profile/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: profile = data.profile;
	$: session = data.session;

	// Form state - initialize from profile
	$: displayName = profile?.display_name || '';
	$: username = profile?.username || '';
	$: isSharing = profile?.is_sharing || false;

	let saving = false;
	let signingOut = false;

	// Debug logging
	$: console.log('Profile:', profile);
	$: console.log('Form result:', form);
</script>

<svelte:head>
	<title>Account - Location Share</title>
</svelte:head>

<div class="account-page">
	<!-- Header -->
	<div class="header">
		<button class="back-btn" on:click={() => goto('/places')}> ← Back </button>
	</div>

	<!-- Content -->
	<div class="content">
		<div class="page-header">
			<h1>Account Settings</h1>
			<p class="subtitle">Manage your profile and preferences</p>
		</div>

		{#if !profile}
			<div class="error-message">⚠️ Profile data not loaded. Check console for details.</div>
		{/if}

		{#if form?.error}
			<div class="error-message">{form.error}</div>
		{/if}

		{#if form?.success}
			<div class="success-message">✅ Settings saved successfully!</div>
		{/if}

		<!-- Profile Information Form -->
		<form
			method="POST"
			action="?/update"
			use:enhance={() => {
				saving = true;

				return async ({ result, update }) => {
					saving = false;
					await update();
				};
			}}
		>
			<div class="section">
				<h2>Profile Information</h2>

				<div class="settings-card">
					<div class="form-group">
						<label for="email">Email</label>
						<input
							id="email"
							type="text"
							value={session?.user?.email || ''}
							disabled
							class="disabled-input"
						/>
						<span class="help-text">Your email address cannot be changed</span>
					</div>

					<div class="form-group">
						<label for="username">Username *</label>
						<input
							id="username"
							name="username"
							type="text"
							bind:value={username}
							placeholder="your-username"
							maxlength="50"
							required
						/>
						<span class="help-text">Letters, numbers, underscores, and hyphens only</span>
					</div>

					<div class="form-group">
						<label for="displayName">Display Name</label>
						<input
							id="displayName"
							name="display_name"
							type="text"
							bind:value={displayName}
							placeholder="Your Name"
							maxlength="100"
						/>
						<span class="help-text">This is how others will see your name</span>
					</div>
				</div>
			</div>

			<!-- Location Sharing -->
			<div class="section">
				<h2>Location Sharing</h2>

				<div class="settings-card">
					<div class="setting-item">
						<div class="setting-info">
							<div class="setting-title">📍 Share My Location</div>
							<div class="setting-description">
								Allow friends and groups to see when you check in at places
							</div>
						</div>
						<label class="toggle">
							<input type="checkbox" name="is_sharing" value="true" bind:checked={isSharing} />
							<span class="toggle-slider"></span>
						</label>
					</div>
				</div>
			</div>

			<!-- Hidden field for when checkbox is unchecked -->
			{#if !isSharing}
				<input type="hidden" name="is_sharing" value="false" />
			{/if}

			<!-- Save Button -->
			<div class="actions">
				<button class="save-btn" type="submit" disabled={saving || !username.trim()}>
					{saving ? 'Saving...' : '💾 Save Settings'}
				</button>
			</div>
		</form>

		<!-- Sign Out Form -->
		<form
			method="POST"
			action="?/signout"
			use:enhance={() => {
				signingOut = true;
				return async ({ update }) => {
					await update();
				};
			}}
		>
			<div class="actions" style="margin-top: 0; padding-top: 0; border-top: none;">
				<button class="signout-btn" type="submit" disabled={signingOut}>
					{signingOut ? 'Signing out...' : '🚪 Sign Out'}
				</button>
			</div>
		</form>
	</div>
</div>

<!-- src/routes/(app)/settings/profile/+page.svelte -->
<!--
<script lang="ts">
	import { goto } from '$app/navigation';
	import Avatar from './Avatar.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	// Reactive declarations
	$: profile = data.profile;
	$: session = data.session;
	$: supabase = data.supabase;

	// Form state - reactive to profile changes
	$: displayName = profile?.display_name || '';
	$: username = profile?.username || '';
	$: isSharing = profile?.is_sharing || false;

	let loading = false;
	let saving = false;
	let error = '';

	// Debug: Log when component mounts and data changes
	$: {
		console.log('Profile data:', profile);
		console.log('Session:', session);
		console.log('Data object:', data);
	}

	async function saveSettings() {
		console.log('saveSettings called!'); // Debug log

		if (!username.trim()) {
			error = 'Username is required';
			return;
		}

		// Basic username validation
		if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
			error = 'Username can only contain letters, numbers, underscores, and hyphens';
			return;
		}

		saving = true;
		error = '';

		try {
			console.log('Saving profile settings...', {
				username,
				display_name: displayName,
				is_sharing: isSharing,
				user_id: session?.user?.id
			});

			if (!session?.user?.id) {
				throw new Error('No user session found');
			}

			const { data: updateData, error: updateError } = await supabase
				.from('profiles')
				.update({
					username: username.trim(),
					display_name: displayName.trim() || null,
					is_sharing: isSharing
				})
				.eq('id', session.user.id)
				.select();

			if (updateError) {
				console.error('Update error:', updateError);
				throw updateError;
			}

			console.log('Profile updated:', updateData);

			// Reload profile data
			const { data: newProfile, error: fetchError } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', session.user.id)
				.single();

			if (fetchError) {
				console.error('Error reloading profile:', fetchError);
				throw fetchError;
			} else {
				// Update the profile data
				profile = newProfile;
				console.log('Profile reloaded:', newProfile);
			}

			alert('Settings saved successfully!');
		} catch (err: any) {
			console.error('Save error:', err);
			error = err.message || 'Failed to save settings';
		} finally {
			saving = false;
		}
	}

	async function handleSignOut() {
		console.log('handleSignOut called!'); // Debug log
		loading = true;

		try {
			const { error: signOutError } = await supabase.auth.signOut();

			if (signOutError) {
				console.error('Sign out error:', signOutError);
				alert('Error signing out: ' + signOutError.message);
			} else {
				goto('/login');
			}
		} catch (err) {
			console.error('Unexpected sign out error:', err);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Account - Location Share</title>
</svelte:head>

<div class="account-page">
	<!-- Header 
	<div class="header">
		<button class="back-btn" on:click={() => goto('/places')}> ← Back </button>
	</div>

	<!-- Content 
	<div class="content">
		<div class="page-header">
			<h1>Account Settings</h1>
			<p class="subtitle">Manage your profile and preferences</p>
		</div>

		<!-- Debug Info (remove after fixing) 
		{#if !profile}
			<div class="error-message">
				⚠️ Profile data not loaded. Check console for details.
				<br />
				<small>Session: {session?.user?.id ? 'Active' : 'Missing'}</small>
			</div>
		{/if}

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		<!-- Profile Information 
		<div class="section">
			<h2>Profile Information</h2>

			<div class="settings-card">
				<div class="form-group">
					<label for="email">Email</label>
					<input
						id="email"
						type="text"
						value={session?.user?.email || ''}
						disabled
						class="disabled-input"
					/>
					<span class="help-text">Your email address cannot be changed</span>
				</div>

				<div class="form-group">
					<label for="username">Username *</label>
					<input
						id="username"
						type="text"
						bind:value={username}
						placeholder="your-username"
						maxlength="50"
					/>
					<span class="help-text">Letters, numbers, underscores, and hyphens only</span>
				</div>

				<div class="form-group">
					<label for="displayName">Display Name</label>
					<input
						id="displayName"
						type="text"
						bind:value={displayName}
						placeholder="Your Name"
						maxlength="100"
					/>
					<span class="help-text">This is how others will see your name</span>
				</div>
			</div>
		</div>

		<!-- Location Sharing 
		<div class="section">
			<h2>Location Sharing</h2>

			<div class="settings-card">
				<div class="setting-item">
					<div class="setting-info">
						<div class="setting-title">📍 Share My Location</div>
						<div class="setting-description">
							Allow friends and groups to see when you check in at places
						</div>
					</div>
					<label class="toggle">
						<input type="checkbox" bind:checked={isSharing} />
						<span class="toggle-slider"></span>
					</label>
				</div>
			</div>
		</div>

		<!-- Actions 
		<div class="actions">
			<button
				class="save-btn"
				on:click={saveSettings}
				disabled={saving || !username.trim()}
				type="button"
			>
				{saving ? 'Saving...' : '💾 Save Settings'}
			</button>

			<button class="signout-btn" on:click={handleSignOut} disabled={loading} type="button">
				{loading ? 'Signing out...' : '🚪 Sign Out'}
			</button>
		</div>
	</div>
</div>

<!-- 
<script lang="ts">
	import { goto } from '$app/navigation';
	import Avatar from './Avatar.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	// This makes 'profile' reactive to changes in 'data.profile'
	$: profile = data.profile;

	// This makes 'session' reactive to changes in 'data.session'
	$: session = data.session;

	// This makes 'supabase' reactive to changes in 'data.supabase'
	$: supabase = data.supabase;

	// These variables will now react and update when 'profile' changes
	$: displayName = profile?.display_name || '';
	$: username = profile?.username || '';
	$: isSharing = profile?.is_sharing || false;

	let loading = false;
	let saving = false;
	let error = '';

	// export let data: PageData;
	// // Use a reactive declaration to ensure 'profile' updates when 'data.profile' does.
	// // This is already good, but your other variables need the same treatment.
	// $: profile = data.profile;

	// let session = data.session;
	// // console.log('/settings/profile:', profile);
	// let supabase = data.supabase;

	// let loading = false;
	// let saving = false;
	// let error = '';

	// // Form state
	// // These reactive declarations will now re-run when 'profile' is updated.
	// $: displayName = profile?.display_name || '';
	// $: username = profile?.username || '';
	// $: isSharing = profile?.is_sharing || false;

	async function saveSettings() {
		if (!username.trim()) {
			error = 'Username is required';
			return;
		}

		// Basic username validation
		if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
			error = 'Username can only contain letters, numbers, underscores, and hyphens';
			return;
		}

		saving = true;
		error = '';

		try {
			console.log('Saving profile settings...', {
				username,
				display_name: displayName,
				is_sharing: isSharing
			});

			const { data: updateData, error: updateError } = await supabase
				.from('profiles')
				.update({
					username: username.trim(),
					display_name: displayName.trim() || null,
					is_sharing: isSharing
				})
				.eq('id', session!.user.id)
				.select();

			if (updateError) {
				console.error('Update error:', updateError);
				throw updateError;
			}

			console.log('Profile updated:', updateData);

			// Reload profile data
			const { data: newProfile, error: fetchError } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', session!.user.id)
				.single();

			if (fetchError) {
				console.error('Error reloading profile:', fetchError);
			} else {
				profile = newProfile;
				displayName = profile?.display_name || '';
				username = profile?.username || '';
				isSharing = profile?.is_sharing || false;
			}

			alert('Settings saved successfully!');
		} catch (err: any) {
			console.error('Save error:', err);
			error = err.message || 'Failed to save settings';
		} finally {
			saving = false;
		}
	}

	async function handleSignOut() {
		loading = true;
		const { error: signOutError } = await supabase.auth.signOut();

		if (signOutError) {
			console.error('Sign out error:', signOutError);
			alert('Error signing out: ' + signOutError.message);
			loading = false;
		} else {
			goto('/login');
		}
	}
</script>

<svelte:head>
	<title>Account - Location Share</title>
</svelte:head>

<div class="account-page">
	<!-- Header 
	<div class="header">
		<button class="back-btn" on:click={() => goto('/places')}> ← Back </button>
	</div>

	<!-- Content 
	<div class="content">
		<div class="page-header">
			<h1>Account Settings</h1>
			<p class="subtitle">Manage your profile and preferences</p>
		</div>

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		<!-- Avatar Section 
		<div class="section">
			<h2>Profile Picture</h2>
			<div class="avatar-section">
				<!-- <Avatar
					{supabase}
					bind:url={profile.avatar_url}
					size={10}
					onupload={async () => {
						// Reload profile after avatar upload
						const { data: newProfile } = await supabase
							.from('profiles')
							.select('*')
							.eq('id', session.user.id)
							.single();
						if (newProfile) profile = newProfile;
					}}
				/> 
			</div>
		</div>

		<!-- Profile Information 
		<div class="section">
			<h2>Profile Information</h2>

			<div class="settings-card">
				<div class="form-group">
					<label for="email">Email</label>
					<input
						id="email"
						type="text"
						value={session.user.email}
						disabled
						class="disabled-input"
					/>
					<span class="help-text">Your email address cannot be changed</span>
				</div>

				<div class="form-group">
					<label for="username">Username *</label>
					<input
						id="username"
						type="text"
						bind:value={username}
						placeholder="your-username"
						maxlength="50"
					/>
					<span class="help-text">Letters, numbers, underscores, and hyphens only</span>
				</div>

				<div class="form-group">
					<label for="displayName">Display Name</label>
					<input
						id="displayName"
						type="text"
						bind:value={displayName}
						placeholder="Your Name"
						maxlength="100"
					/>
					<span class="help-text">This is how others will see your name</span>
				</div>
			</div>
		</div>

		<!-- Location Sharing 
		<div class="section">
			<h2>Location Sharing</h2>

			<div class="settings-card">
				<div class="setting-item">
					<div class="setting-info">
						<div class="setting-title">📍 Share My Location</div>
						<div class="setting-description">
							Allow friends and groups to see when you check in at places
						</div>
					</div>
					<label class="toggle">
						<input type="checkbox" bind:checked={isSharing} />
						<span class="toggle-slider"></span>
					</label>
				</div>
			</div>
		</div>

		<!-- Actions 
		<div class="actions">
			<button class="save-btn" on:click={saveSettings} disabled={saving || !username.trim()}>
				{saving ? 'Saving...' : '💾 Save Settings'}
			</button>

			<button class="signout-btn" on:click={handleSignOut} disabled={loading}>
				{loading ? 'Signing out...' : '🚪 Sign Out'}
			</button>
		</div>
	</div>
</div>

<style>
	.account-page {
		min-height: 100vh;
		background: #000;
		color: #fff;
		padding-bottom: 80px;
	}

	/* Header */
	.header {
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

	/* Content */
	.content {
		padding: 20px;
		max-width: 800px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 32px;
	}

	.page-header h1 {
		font-size: 28px;
		margin: 0 0 8px 0;
		font-weight: 700;
	}

	.subtitle {
		color: #666;
		margin: 0;
		font-size: 15px;
	}

	/* Error Message */
	.error-message {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid #f44336;
		color: #f44336;
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 24px;
		font-size: 14px;
	}

	/* Sections */
	.section {
		margin-bottom: 32px;
	}

	.section h2 {
		font-size: 20px;
		margin: 0 0 16px 0;
		font-weight: 700;
	}

	/* Avatar Section */
	.avatar-section {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 24px;
		display: flex;
		justify-content: center;
	}

	/* Settings Card */
	.settings-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		overflow: hidden;
	}

	/* Form Groups */
	.form-group {
		padding: 20px;
		border-bottom: 1px solid #1a1a1a;
	}

	.form-group:last-child {
		border-bottom: none;
	}

	.form-group label {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: #fff;
		margin-bottom: 8px;
	}

	.form-group input[type='text'] {
		width: 100%;
		background: #000;
		border: 1px solid #333;
		color: #fff;
		padding: 12px;
		border-radius: 8px;
		font-size: 15px;
	}

	.form-group input[type='text']:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.disabled-input {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.help-text {
		display: block;
		font-size: 12px;
		color: #666;
		margin-top: 6px;
	}

	/* Setting Item (for toggles) */
	.setting-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
	}

	.setting-info {
		flex: 1;
	}

	.setting-title {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.setting-description {
		font-size: 13px;
		color: #666;
	}

	/* Toggle Switch */
	.toggle {
		position: relative;
		display: inline-block;
		width: 50px;
		height: 28px;
	}

	.toggle input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: #333;
		transition: 0.3s;
		border-radius: 28px;
	}

	.toggle-slider:before {
		position: absolute;
		content: '';
		height: 20px;
		width: 20px;
		left: 4px;
		bottom: 4px;
		background-color: white;
		transition: 0.3s;
		border-radius: 50%;
	}

	.toggle input:checked + .toggle-slider {
		background-color: #4caf50;
	}

	.toggle input:checked + .toggle-slider:before {
		transform: translateX(22px);
	}

	/* Actions */
	.actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 32px;
		padding-top: 32px;
		border-top: 1px solid #1a1a1a;
	}

	.save-btn,
	.signout-btn {
		width: 100%;
		padding: 16px 24px;
		border-radius: 12px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
	}

	.save-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.save-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.signout-btn {
		background: transparent;
		border: 2px solid #f44336;
		color: #f44336;
	}

	.signout-btn:hover:not(:disabled) {
		background: rgba(244, 67, 54, 0.1);
	}

	.signout-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.content {
			padding: 16px;
		}

		.page-header h1 {
			font-size: 24px;
		}
	}
</style> 

<style>
	.account-page {
		min-height: 100vh;
		background: #000;
		color: #fff;
		padding-bottom: 80px;
	}

	.header {
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

	.content {
		padding: 20px;
		max-width: 800px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 32px;
	}

	.page-header h1 {
		font-size: 28px;
		margin: 0 0 8px 0;
		font-weight: 700;
	}

	.subtitle {
		color: #666;
		margin: 0;
		font-size: 15px;
	}

	.error-message {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid #f44336;
		color: #f44336;
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 24px;
		font-size: 14px;
	}

	.section {
		margin-bottom: 32px;
	}

	.section h2 {
		font-size: 20px;
		margin: 0 0 16px 0;
		font-weight: 700;
	}

	.settings-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		overflow: hidden;
	}

	.form-group {
		padding: 20px;
		border-bottom: 1px solid #1a1a1a;
	}

	.form-group:last-child {
		border-bottom: none;
	}

	.form-group label {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: #fff;
		margin-bottom: 8px;
	}

	.form-group input[type='text'] {
		width: 100%;
		background: #000;
		border: 1px solid #333;
		color: #fff;
		padding: 12px;
		border-radius: 8px;
		font-size: 15px;
	}

	.form-group input[type='text']:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.disabled-input {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.help-text {
		display: block;
		font-size: 12px;
		color: #666;
		margin-top: 6px;
	}

	.setting-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
	}

	.setting-info {
		flex: 1;
	}

	.setting-title {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.setting-description {
		font-size: 13px;
		color: #666;
	}

	.toggle {
		position: relative;
		display: inline-block;
		width: 50px;
		height: 28px;
	}

	.toggle input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: #333;
		transition: 0.3s;
		border-radius: 28px;
	}

	.toggle-slider:before {
		position: absolute;
		content: '';
		height: 20px;
		width: 20px;
		left: 4px;
		bottom: 4px;
		background-color: white;
		transition: 0.3s;
		border-radius: 50%;
	}

	.toggle input:checked + .toggle-slider {
		background-color: #4caf50;
	}

	.toggle input:checked + .toggle-slider:before {
		transform: translateX(22px);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 32px;
		padding-top: 32px;
		border-top: 1px solid #1a1a1a;
	}

	.save-btn,
	.signout-btn {
		width: 100%;
		padding: 16px 24px;
		border-radius: 12px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
	}

	.save-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.save-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.signout-btn {
		background: transparent;
		border: 2px solid #f44336;
		color: #f44336;
	}

	.signout-btn:hover:not(:disabled) {
		background: rgba(244, 67, 54, 0.1);
	}

	.signout-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.content {
			padding: 16px;
		}

		.page-header h1 {
			font-size: 24px;
		}
	}
</style> -->

<style>
	.account-page {
		min-height: 100vh;
		background: #000;
		color: #fff;
		padding-bottom: 80px;
	}

	/* Header */
	.header {
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

	/* Content */
	.content {
		padding: 20px;
		max-width: 800px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 32px;
	}

	.page-header h1 {
		font-size: 28px;
		margin: 0 0 8px 0;
		font-weight: 700;
	}

	.subtitle {
		color: #666;
		margin: 0;
		font-size: 15px;
	}

	/* Messages */
	.error-message {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid #f44336;
		color: #f44336;
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 24px;
		font-size: 14px;
	}

	.success-message {
		background: rgba(76, 175, 80, 0.1);
		border: 1px solid #4caf50;
		color: #4caf50;
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 24px;
		font-size: 14px;
	}

	/* Sections */
	.section {
		margin-bottom: 32px;
	}

	.section h2 {
		font-size: 20px;
		margin: 0 0 16px 0;
		font-weight: 700;
	}

	/* Settings Card */
	.settings-card {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		overflow: hidden;
	}

	/* Form Groups */
	.form-group {
		padding: 20px;
		border-bottom: 1px solid #1a1a1a;
	}

	.form-group:last-child {
		border-bottom: none;
	}

	.form-group label {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: #fff;
		margin-bottom: 8px;
	}

	.form-group input[type='text'] {
		width: 100%;
		background: #000;
		border: 1px solid #333;
		color: #fff;
		padding: 12px;
		border-radius: 8px;
		font-size: 15px;
	}

	.form-group input[type='text']:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.disabled-input {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.help-text {
		display: block;
		font-size: 12px;
		color: #666;
		margin-top: 6px;
	}

	/* Setting Item (for toggles) */
	.setting-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
	}

	.setting-info {
		flex: 1;
	}

	.setting-title {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.setting-description {
		font-size: 13px;
		color: #666;
	}

	/* Toggle Switch */
	.toggle {
		position: relative;
		display: inline-block;
		width: 50px;
		height: 28px;
	}

	.toggle input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: #333;
		transition: 0.3s;
		border-radius: 28px;
	}

	.toggle-slider:before {
		position: absolute;
		content: '';
		height: 20px;
		width: 20px;
		left: 4px;
		bottom: 4px;
		background-color: white;
		transition: 0.3s;
		border-radius: 50%;
	}

	.toggle input:checked + .toggle-slider {
		background-color: #4caf50;
	}

	.toggle input:checked + .toggle-slider:before {
		transform: translateX(22px);
	}

	/* Actions */
	.actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 32px;
		padding-top: 32px;
		border-top: 1px solid #1a1a1a;
	}

	.save-btn,
	.signout-btn {
		width: 100%;
		padding: 16px 24px;
		border-radius: 12px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
	}

	.save-btn {
		background: linear-gradient(135deg, var(--color-primary) 0%, #ff6b35 100%);
		color: #fff;
	}

	.save-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(252, 76, 2, 0.4);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.signout-btn {
		background: transparent;
		border: 2px solid #f44336;
		color: #f44336;
	}

	.signout-btn:hover:not(:disabled) {
		background: rgba(244, 67, 54, 0.1);
	}

	.signout-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.content {
			padding: 16px;
		}

		.page-header h1 {
			font-size: 24px;
		}
	}
</style>
