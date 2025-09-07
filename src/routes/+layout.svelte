<script lang="ts">
	import '../app.css';
</script>

<div class="app-layout">
	<!-- 페이지 콘텐츠 영역 -->
	<main class="main-content">
		<slot />
	</main>
</div>

<style>
	/* 기본 스타일 */
	* {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	body {
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		line-height: 1.6;
		color: #1f2937;
	}

	/* 앱 레이아웃 */
	.app-layout {
		min-height: 100vh;
		background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
	}

	/* 메인 콘텐츠 */
	.main-content {
		padding: 0;
	}
</style>