import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		// base 경로 제거 - nginx에서 프록시 처리
		paths: { base: '' }
	}
};

export default config;