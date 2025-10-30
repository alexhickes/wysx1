import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
			images: {
				sizes: [640, 828, 1200, 1920, 3840],
				domains: ['wysx1.vercel.app']
			}
		})
	}
};

export default config;
