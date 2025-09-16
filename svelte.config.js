import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isProd = process.env.NODE_ENV === 'production';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		// 프로덕션에서만 /rag-system 적용, 로컬(dev)은 빈 값
		paths: { base: isProd ? '/rag-system' : '' },
		adapter: adapter({ out: 'build' })
	}
};

export default config;