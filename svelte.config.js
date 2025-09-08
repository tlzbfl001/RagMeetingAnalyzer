const isProd = process.env.NODE_ENV === 'production';
const config = {
	kit: {
	paths: { base: isProd ? '/rag-system' : '' }
	}
};
export default config;
