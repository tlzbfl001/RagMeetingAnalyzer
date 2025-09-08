import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
const isProd = process.env.NODE_ENV === 'production';
const config = {
	preprocess: vitePreprocess(),
	kit: {
		paths: { base: isProd ? '/rag-system' : '' }
	}
};
export default config;
