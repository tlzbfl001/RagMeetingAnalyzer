import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isProd = process.env.NODE_ENV === 'production';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		// 프로덕션에서만 /rag-system 적용, 로컬(dev)은 빈 값
		paths: { base: isProd ? '/rag-system' : '' },
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false
		})
	}
};

export default config;