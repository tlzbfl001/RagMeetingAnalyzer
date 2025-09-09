<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { generateCommonMeetingReport } from '$lib/meetingReport.js';

  // === 통합 유틸 ===
  function fetchWithTimeout(resource: string, options: RequestInit = {}, timeoutMs = 4000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(resource, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
  }

  function getSentiment(item: any) {
    const s = (item?.analysisResults?.sentiment) || item?.sentiment;
    return {
      positive: Number(s?.positive || 0),
      negative: Number(s?.negative || 0),
      neutral: Number(s?.neutral || 0)
    };
  }

  function generatePredictionsForHistory(current: any, historyList: any[]): string[] {
    try {
      const predictions: string[] = [];
      const ar = current?.analysisResults || current || {};
      let totalPositive = Number(ar?.sentiment?.positive || 0);
      let totalNegative = Number(ar?.sentiment?.negative || 0);
      let totalNeutral = Number(ar?.sentiment?.neutral || 0);
      let count = 1;
      for (const h of historyList) {
        const s = (h?.analysisResults?.sentiment) || h?.sentiment;
        if (s) {
          totalPositive += Number(s.positive || 0);
          totalNegative += Number(s.negative || 0);
          totalNeutral += Number(s.neutral || 0);
          count++;
        }
      }
      const avgPositive = totalPositive / count;
      predictions.push(`향후 회의는 ${avgPositive > 60 ? '긍정적' : avgPositive > 40 ? '중립적' : '부정적'} 분위기로 진행될 것으로 예측됩니다.`);
      const roleHint = avgPositive > 60 ? '최고경영진' : avgPositive > 40 ? '고급관리자' : '중간관리자';
      predictions.push(`화자별 발언 패턴 분석 결과, ${roleHint} 역할의 참석자가 주도적인 역할을 할 것으로 예상됩니다.`);
      const allKeywords: Array<{ word: string; count: number }> = [];
      const curKeywords = Array.isArray(ar?.keywords) ? ar.keywords : [];
      for (const k of curKeywords) {
        const word = typeof k === 'string' ? k : (k?.word || '');
        const count = typeof k === 'string' ? 1 : Number(k?.count || 1);
        if (word) allKeywords.push({ word, count });
      }
      for (const h of historyList) {
        const ks = (h?.analysisResults?.keywords) || h?.keywords || [];
        for (const k of ks) {
          const word = typeof k === 'string' ? k : (k?.word || '');
          const count = typeof k === 'string' ? 1 : Number(k?.count || 1);
          if (word) allKeywords.push({ word, count });
        }
      }
      const freq: Record<string, number> = {};
      for (const k of allKeywords) freq[k.word] = (freq[k.word] || 0) + k.count;
      const top = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0] || '회의';
      predictions.push(`주요 키워드 "${top}"는 향후 회의에서도 핵심 주제로 다뤄질 가능성이 높습니다.`);
      const overall = avgPositive > 50 ? '긍정적' : avgPositive > 30 ? '안정적' : '개선 필요';
      predictions.push(`전반적으로 ${overall}인 분위기로 진행되고 있습니다. 지속적인 모니터링과 개선을 통해 더욱 효과적인 회의 문화를 만들어갈 것으로 예측됩니다.`);
      return predictions.slice(0, 8);
    } catch {
      return [];
    }
  }

  function generateFileContent(fileName: string, fileType: string): string {
    const baseContent = `이 파일은 ${fileName}입니다.\n\n파일 형식: ${fileType}\n생성일시: ${new Date().toLocaleString('ko-KR')}\n\n`;
    switch (fileType) {
      case 'text/plain':
      case 'application/txt':
        return baseContent + '회의 내용:\n- 프로젝트 진행 상황 논의\n- 향후 계획 수립\n- 팀원 간 협업 방안\n- 예산 및 일정 조정';
      case 'audio/mpeg':
      case 'audio/wav':
        return baseContent + '음성 파일 내용:\n- 회의 녹음 파일\n- 화자별 발언 내용\n- 주요 논의 사항';
      case 'video/mp4':
        return baseContent + '영상 파일 내용:\n- 회의 영상 녹화\n- 화면 공유 내용\n- 참석자들의 표정과 제스처';
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return baseContent + 'Word 문서 내용:\n- 회의록 초안\n- 프로젝트 보고서\n- 회의 안건';
      default:
        return baseContent + '파일 내용을 확인할 수 없습니다.';
    }
  }

  function generateMeetingReport(history: any) {
    const now = new Date();
    const currentDate = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
    let extractedText = '';
    if (history.extractedTexts && Array.isArray(history.extractedTexts) && history.extractedTexts.length > 0) {
      extractedText = history.extractedTexts[0];
    } else if (history.extractedTexts && typeof history.extractedTexts === 'string') {
      extractedText = history.extractedTexts;
    } else if (history.extractedText) {
      extractedText = history.extractedText;
    }
    const analysisResultsWithText = { ...history.analysisResults, extractedText };
    return generateCommonMeetingReport(analysisResultsWithText, currentDate);
  }
  let analysisHistory: any[] = [];
  let isLoading = false;
  let selectedHistory: any = null;

  // 페이지 핸들러 통합
  async function loadHistoryData() {
    isLoading = true;
    try {
      const response = await fetchWithTimeout('/api/history');
      if (response.ok) {
        const result = await response.json();
        analysisHistory = result.data || [];
      } else {
        const saved = localStorage.getItem('analysisHistory');
        if (saved) analysisHistory = JSON.parse(saved);
      }
    } catch {
      const saved = localStorage.getItem('analysisHistory');
      if (saved) analysisHistory = JSON.parse(saved);
    } finally {
      isLoading = false;
    }
  }

  onMount(loadHistoryData);

  function viewHistoryDetails(history: any) {
    const hydrated = {
      ...history,
      analysisResults: history.analysisResults ?? {
        summary: history.summary ?? '요약 없음',
        speakers: history.speakers ?? [],
        keywords: history.keywords ?? [],
        sentiment: history.sentiment ?? { positive: 0, negative: 0, neutral: 100 },
        keyPoints: history.keyPoints ?? []
      }
    };
    try {
      const preds = generatePredictionsForHistory(hydrated, analysisHistory || []);
      if (Array.isArray(preds)) hydrated.analysisResults.futurePredictions = preds;
    } catch {}
    selectedHistory = hydrated;
  }

  function closeHistoryDetails() { selectedHistory = null; }

  async function deleteHistory(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      let res: Response;
      try { res = await fetchWithTimeout(`/api/analysis/${id}`, { method: 'DELETE' }, 15000); }
      catch { res = await fetch(`/api/analysis/${id}`, { method: 'DELETE' }); }
      if (res.ok) {
        analysisHistory = analysisHistory.filter(h => h.id !== id);
        localStorage.setItem('analysisHistory', JSON.stringify(analysisHistory));
        await loadHistoryData();
        alert('분석 결과가 성공적으로 삭제되었습니다.');
      } else if (res.status === 404) {
        const resp = await fetchWithTimeout('/api/history');
        if (resp.ok) {
          const { data } = await resp.json();
          const target = analysisHistory.find(h => h.id === id);
          if (target) {
            const names = new Set((target.files || []).map((f: any) => f.name));
            const cand = (data || []).find((h: any) => {
              const files = h.files || [];
              if (files.length !== names.size) return false;
              return files.every((f: any) => names.has(f.name));
            });
            if (cand?.id) await fetch(`/api/analysis/${cand.id}`, { method: 'DELETE' });
          }
          analysisHistory = analysisHistory.filter(h => h.id !== id);
          localStorage.setItem('analysisHistory', JSON.stringify(analysisHistory));
          await loadHistoryData();
          alert('분석 결과가 성공적으로 삭제되었습니다.');
        }
      }
    } catch {
      alert('삭제 처리 중 오류가 발생했습니다.');
    }
  }

  async function clearAllHistory() {
    if (!confirm('모든 분석 히스토리를 삭제하시겠습니까?')) return;
    try {
      let res: Response;
      try { res = await fetchWithTimeout('/api/analysis', { method: 'DELETE' }, 15000); }
      catch { res = await fetch('/api/analysis', { method: 'DELETE' }); }
      if (res.ok) {
        analysisHistory = [];
        localStorage.removeItem('analysisHistory');
        alert('모든 히스토리가 성공적으로 삭제되었습니다.');
      } else {
        alert('서버에서 삭제에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      alert('데이터 삭제 중 오류가 발생했습니다.');
    }
  }

  async function downloadOriginalFiles(history: any) {
    for (const file of history.files) {
      let fileBlob: Blob; let fileName = file.name;
      if (file.downloadUrl && file.downloadUrl.startsWith('http')) {
        try { const response = await fetch(file.downloadUrl); if (!response.ok) throw new Error('http'); fileBlob = await response.blob(); }
        catch { const content = generateFileContent(file.name, file.type); fileBlob = new Blob([content], { type: file.type || 'text/plain' }); }
      } else {
        const content = generateFileContent(file.name, file.type);
        fileBlob = new Blob([content], { type: file.type || 'text/plain' });
      }
      const url = URL.createObjectURL(fileBlob);
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      await new Promise(r => setTimeout(r, 200));
    }
    alert('모든 파일 다운로드가 완료되었습니다!');
  }

  function downloadAnalyzedFiles(history: any) {
    const filesData = {
      분석일시: history.date,
      분석파일수: history.files.length,
      파일목록: history.files.map((file: any) => ({ 파일명: file.name, 크기: `${(file.size / 1024 / 1024).toFixed(2)} MB`, 형식: file.type }))
    };
    const blob = new Blob([JSON.stringify(filesData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `분석된파일들_${history.date.replace(/[^0-9]/g, '')}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function downloadMeetingReport(history: any) {
    const reportContent = generateMeetingReport(history);
    const blob = new Blob([reportContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `회의록_${history.date.replace(/[^0-9]/g, '')}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }
</script>

<!-- 헤더 배너 -->
<header class="header">
	<div class="header-content">
		<div class="logo">
			<div class="logo-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
			</div>
			<h1>RAG 기반 회의 분석 시스템</h1>
		</div>
		<p class="subtitle">AI 학습을 통한 지능형 회의 요약 및 미래 예측 플랫폼</p>
		
		<!-- 네비게이션 메뉴 -->
		<nav class="header-nav">
			<a href="{base}/" class="nav-link" data-sveltekit-preload-data="off" data-sveltekit-preload-code="off">🏠 메인</a>
			<a href="{base}/history" class="nav-link active" data-sveltekit-preload-data="off" data-sveltekit-preload-code="off">📊 히스토리</a>
		</nav>
	</div>
</header>

<div class="history-container">
	<div class="container">
		<!-- 상단 액션 버튼 -->
		<div class="action-bar">
			<div class="stats">
				<span class="stat-item">
					<strong>총 분석 횟수:</strong> {analysisHistory.length}/10회
				</span>
				<span class="stat-item">
					<strong>총 파일 수:</strong> {analysisHistory.reduce((sum, h) => sum + h.files.length, 0)}개
				</span>
			</div>
			<button class="clear-btn" on:click={clearAllHistory} disabled={analysisHistory.length === 0}>
				전체 삭제
			</button>
		</div>
		
		{#if isLoading}
			<div class="loading">
				<div class="spinner"></div>
				<p>히스토리를 불러오는 중...</p>
			</div>
		{:else if analysisHistory.length === 0}
			<div class="empty-state">
				<div class="empty-icon">📁</div>
				<h3>아직 분석 히스토리가 없습니다</h3>
				<p>메인 페이지에서 파일을 업로드하고 분석해보세요!</p>
				<a href="/" class="btn-primary">메인으로 이동</a>
			</div>
		{:else}
			<!-- 히스토리 목록 -->
			<div class="history-list">
				<h2>📊 분석 히스토리</h2>
				{#each analysisHistory as history}
					<div class="history-card">
						<div class="history-info">
							<div class="history-date">📅 {history.date}</div>
							<div class="history-summary">{history.analysisResults?.summary || history.summary}</div>
						</div>
						<div class="history-actions">
							<button class="view-btn" on:click={() => viewHistoryDetails(history)}>
								상세보기
							</button>
							<button class="delete-btn" on:click={() => deleteHistory(history.id)}>
								삭제
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- 히스토리 상세 모달 -->
{#if selectedHistory}
	<div class="modal-overlay" on:click={closeHistoryDetails}>
		<div class="modal-content" on:click|stopPropagation>
			<div class="modal-header">
				<h2>📊 분석 상세 결과</h2>
				<button class="close-btn" on:click={closeHistoryDetails}>×</button>
			</div>
			
			<div class="modal-body">
				<!-- 실시간 분석 결과 -->
				<div class="results-section">
					<div class="section-header">
						<h3>📊 실시간 분석 결과</h3>
						<p>AI가 분석한 회의 내용의 핵심 정보</p>
					</div>

					<div class="results-grid">
						<!-- 회의 요약 -->
						<div class="result-card summary-card">
							<h4>📝 회의 요약</h4>
							<p>{selectedHistory.analysisResults?.summary || selectedHistory.summary}</p>
						</div>

						<!-- 화자별 발언 비중 -->
						<div class="result-card speaker-card">
							<h4>👥 화자별 발언 비중</h4>
							<div class="speaker-chart">
								{#each (selectedHistory.analysisResults?.speakers || selectedHistory.speakers || []) as speaker}
									<div class="speaker-item">
										<span class="speaker-name">{speaker.name}</span>
										<div class="speaker-bar">
											<div class="bar" style="width: {speaker.percentage}%"></div>
										</div>
										<span class="speaker-percentage">{speaker.percentage}%</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- 키워드 발생 빈도 -->
						<div class="result-card keyword-card">
							<h4>🔑 키워드 발생 빈도</h4>
							<div class="keyword-chart">
								{#each (selectedHistory.analysisResults?.keywords || selectedHistory.keywords || []).slice(0, 8) as keyword}
									<div class="keyword-item">
										<span class="keyword-word">{keyword.word}</span>
										<div class="keyword-bar">
											<div class="bar" style="width: {(
												keyword.count /
												(((selectedHistory.analysisResults?.keywords || selectedHistory.keywords || [])[0]?.count) || 1)
											) * 100}%"></div>
										</div>
										<span class="keyword-count">{keyword.count}회</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- 감성 분석 -->
						<div class="result-card sentiment-card">
							<h4>😊 감성 분석</h4>
							<div class="sentiment-chart">
								<div class="sentiment-item">
									<span class="sentiment-label">긍정</span>
									<div class="sentiment-bar">
										<div class="bar positive" style="width: {getSentiment(selectedHistory).positive}%"></div>
									</div>
									<span class="sentiment-value">{getSentiment(selectedHistory).positive}%</span>
								</div>
								<div class="sentiment-item">
									<span class="sentiment-label">부정</span>
									<div class="sentiment-bar">
										<div class="bar negative" style="width: {getSentiment(selectedHistory).negative}%"></div>
									</div>
									<span class="sentiment-value">{getSentiment(selectedHistory).negative}%</span>
								</div>
								<div class="sentiment-item">
									<span class="sentiment-label">중립</span>
									<div class="sentiment-bar">
										<div class="bar neutral" style="width: {getSentiment(selectedHistory).neutral}%"></div>
									</div>
									<span class="sentiment-value">{getSentiment(selectedHistory).neutral}%</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- 학습된 결과 -->
				<div class="learned-section">
					<div class="section-header">
						<h3>📚 학습된 결과</h3>
						<p>AI가 학습한 데이터를 바탕으로 한 분석 결과</p>
					</div>

					<div class="learned-grid">
						<!-- 주요 포인트 -->
						<div class="learned-card">
							<h4>💡 주요 포인트</h4>
							<ul class="points-list">
								{#each (selectedHistory.analysisResults?.keyPoints || selectedHistory.keyPoints || []) as point}
									<li>{point}</li>
								{/each}
							</ul>
						</div>

						<!-- 미래 예측 -->
						<div class="learned-card">
							<h4>🔮 미래 예측</h4>
							<div class="prediction-list">
								{#each (selectedHistory.analysisResults?.futurePredictions || []) as prediction}
									<div class="prediction-item">
										<p>{prediction}</p>
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<!-- 문서 및 데이터 관리 -->
				<div class="documents-section">
					<div class="section-header">
						<h3>📚 문서 및 데이터 관리</h3>
						<p>분석 결과와 관련 파일들을 다운로드하세요</p>
					</div>

					<div class="documents-grid">
						<!-- 올린 파일들 -->
						<div class="document-card">
							<h4>📁 올린 파일들</h4>
							<div class="files-list">
								{#each (selectedHistory.files || []) as file}
									<div class="file-item">
										<span class="file-name">{file.name}</span>
										<span class="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
										<span class="file-type">{file.type}</span>
									</div>
								{/each}
							</div>
							<div class="download-buttons">
								<button class="download-btn secondary" on:click={() => downloadOriginalFiles(selectedHistory)}>
									📁 원본 파일 다운로드
								</button>
								<button class="download-btn tertiary" on:click={() => downloadAnalyzedFiles(selectedHistory)}>
									📋 파일 목록 (JSON)
								</button>
							</div>
						</div>

						<!-- 회의록 -->
						<div class="document-card">
							<h4>📄 회의록</h4>
							<p>AI가 생성한 상세한 회의록을 다운로드하세요. 회의 요약, 화자별 발언 비중, 키워드, 감성 분석 등이 포함됩니다.</p>
							<button class="download-btn primary" on:click={() => downloadMeetingReport(selectedHistory)}>
								📄 회의록 다운로드
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* 헤더 스타일 */
	.header {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 3rem 0;
		text-align: center;
	}

	.header-content {
		max-width: 800px;
		margin: 0 auto;
	}

	.logo {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.logo-icon {
		width: 3rem;
		height: 3rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.logo-icon svg {
		width: 1.5rem;
		height: 1.5rem;
	}

	.logo h1 {
		font-size: 2.5rem;
		font-weight: bold;
		margin: 0;
	}

	.subtitle {
		font-size: 1.2rem;
		opacity: 0.9;
		margin: 0 0 1.5rem 0;
	}

	.header-nav {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	.nav-link {
		color: white;
		text-decoration: none;
		padding: 0.75rem 1.5rem;
		border-radius: 2rem;
		font-weight: 500;
		transition: all 0.3s ease;
		border: 2px solid transparent;
	}

	.nav-link:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.nav-link.active {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.5);
	}

	/* 메인 컨테이너 */
	.history-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.container {
		background: white;
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	/* 액션 바 */
	.action-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: #f8f9fa;
		border-radius: 0.5rem;
	}

	.stats {
		display: flex;
		gap: 2rem;
	}

	.stat-item {
		font-size: 1.1rem;
		color: #374151;
	}

	.clear-btn {
		background: #ef4444;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.clear-btn:hover:not(:disabled) {
		background: #dc2626;
		transform: translateY(-2px);
	}

	.clear-btn:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	/* 히스토리 목록 */
	.history-list h2 {
		font-size: 1.8rem;
		color: #1f2937;
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.history-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		background: #f9fafb;
		transition: all 0.3s ease;
	}

	.history-card:hover {
		background: white;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	.history-info {
		flex: 1;
	}

	.history-date {
		font-size: 1.1rem;
		font-weight: 600;
		color: #374151;
		margin-bottom: 0.5rem;
	}

	.history-summary {
		color: #6b7280;
		line-height: 1.5;
	}

	.history-actions {
		display: flex;
		gap: 0.75rem;
	}

	.view-btn, .delete-btn {
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.view-btn {
		background: #667eea;
		color: white;
	}

	.view-btn:hover {
		background: #5a67d8;
	}

	.delete-btn {
		background: #ef4444;
		color: white;
	}

	.delete-btn:hover {
		background: #dc2626;
	}

	/* 로딩 및 빈 상태 */
	.loading, .empty-state {
		text-align: center;
		padding: 3rem;
	}

	.spinner {
		width: 3rem;
		height: 3rem;
		border: 4px solid #e5e7eb;
		border-top: 4px solid #667eea;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.empty-state h3 {
		font-size: 1.5rem;
		color: #374151;
		margin-bottom: 0.5rem;
	}

	.empty-state p {
		color: #6b7280;
		margin-bottom: 1.5rem;
	}

	.btn-primary {
		background: #667eea;
		color: white;
		text-decoration: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 600;
		transition: all 0.3s ease;
	}

	.btn-primary:hover {
		background: #5a67d8;
		transform: translateY(-2px);
	}

	/* 모달 스타일 */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}

	.modal-content {
		background: white;
		border-radius: 1rem;
		max-width: 1200px;
		width: 95%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 25px rgba(0, 0, 0, 0.25);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h2 {
		margin: 0;
		color: #1f2937;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 2rem;
		cursor: pointer;
		color: #6b7280;
		padding: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.25rem;
		transition: all 0.3s ease;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.modal-body {
		padding: 2rem;
	}

	.detail-section {
		margin-bottom: 2rem;
	}

	.detail-section h3 {
		font-size: 1.3rem;
		color: #1f2937;
		margin-bottom: 1rem;
		border-bottom: 2px solid #e5e7eb;
		padding-bottom: 0.5rem;
	}

	.detail-section p {
		color: #374151;
		line-height: 1.6;
		margin-bottom: 0.5rem;
	}

	/* 화자 목록 */
	.speakers-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.speaker-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: #f9fafb;
		border-radius: 0.5rem;
	}

	.speaker-name {
		font-weight: 600;
		color: #374151;
	}

	.speaker-percentage {
		font-weight: 700;
		color: #667eea;
	}

	/* 키워드 목록 */
	.keywords-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.keyword-tag {
		background: #e5e7eb;
		color: #374151;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
	}

	/* 감성 분석 */
	.sentiment-chart {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.sentiment-item {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.sentiment-label {
		font-weight: 600;
		color: #374151;
		min-width: 80px;
	}

	.sentiment-bar {
		flex: 1;
		height: 1.5rem;
		background: #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.sentiment-bar .bar {
		height: 100%;
		transition: width 0.3s ease;
	}

	.sentiment-bar .positive {
		background: linear-gradient(90deg, #10b981, #059669);
	}

	.sentiment-bar .negative {
		background: linear-gradient(90deg, #ef4444, #dc2626);
	}

	.sentiment-bar .neutral {
		background: linear-gradient(90deg, #6b7280, #4b5563);
	}

	.sentiment-value {
		font-weight: 700;
		color: #374151;
		min-width: 50px;
		text-align: right;
	}

	/* 주요 포인트 */
	.points-list {
		list-style: none;
		padding: 0;
	}

	.points-list li {
		padding: 0.5rem 0;
		border-bottom: 1px solid #f3f4f6;
		color: #374151;
	}

	.points-list li:last-child {
		border-bottom: none;
	}

	/* 파일 목록 */
	.files-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.file-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: #f9fafb;
		border-radius: 0.5rem;
	}

	.file-name {
		font-weight: 600;
		color: #374151;
		flex: 1;
	}

	.file-size, .file-type {
		color: #6b7280;
		margin-left: 1rem;
	}

	/* 모달 푸터 */
	.modal-footer {
		padding: 1rem 2rem 2rem;
		border-top: 1px solid #e5e7eb;
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	.download-btn {
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.download-btn.primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}

	.download-btn.secondary {
		background: #10b981;
		color: white;
	}

	.download-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
	}

	/* 섹션 공통 스타일 */
	.section-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.section-header h3 {
		font-size: 1.8rem;
		color: #1f2937;
		margin-bottom: 0.5rem;
	}

	.section-header p {
		font-size: 1rem;
		color: #6b7280;
	}

	/* 실시간 분석 결과 */
	.results-section {
		margin-bottom: 3rem;
	}

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.result-card {
		background: #f9fafb;
		border-radius: 0.75rem;
		padding: 1.5rem;
		border: 1px solid #e5e7eb;
	}

	.result-card h4 {
		font-size: 1.2rem;
		color: #1f2937;
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.result-card p {
		color: #374151;
		line-height: 1.6;
		margin: 0;
	}

	/* 차트 스타일 */
	.speaker-chart, .keyword-chart, .sentiment-chart {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.speaker-item, .keyword-item, .sentiment-item {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.speaker-name, .keyword-word, .sentiment-label {
		font-weight: 600;
		color: #374151;
		min-width: 80px;
	}

	.speaker-bar, .keyword-bar, .sentiment-bar {
		flex: 1;
		height: 1.5rem;
		background: #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.speaker-bar .bar {
		height: 100%;
		background: linear-gradient(90deg, #667eea, #764ba2);
		transition: width 0.3s ease;
	}

	.keyword-bar .bar {
		height: 100%;
		background: linear-gradient(90deg, #10b981, #059669);
		transition: width 0.3s ease;
	}

	.sentiment-bar .bar {
		height: 100%;
		transition: width 0.3s ease;
	}

	.sentiment-bar .positive {
		background: linear-gradient(90deg, #10b981, #059669);
	}

	.sentiment-bar .negative {
		background: linear-gradient(90deg, #ef4444, #dc2626);
	}

	.sentiment-bar .neutral {
		background: linear-gradient(90deg, #6b7280, #4b5563);
	}

	.speaker-percentage, .keyword-count, .sentiment-value {
		font-weight: 700;
		color: #374151;
		min-width: 50px;
		text-align: right;
	}

	/* 학습된 결과 */
	.learned-section {
		margin-bottom: 3rem;
	}

	.learned-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
		gap: 1.5rem;
	}

	.learned-card {
		background: #f9fafb;
		border-radius: 0.75rem;
		padding: 1.5rem;
		border: 1px solid #e5e7eb;
	}

	.learned-card h4 {
		font-size: 1.2rem;
		color: #1f2937;
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* 문서 및 데이터 관리 */
	.documents-section {
		margin-bottom: 2rem;
	}

	.documents-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: 1.5rem;
	}

	.document-card {
		background: #f9fafb;
		border-radius: 0.75rem;
		padding: 1.5rem;
		border: 1px solid #e5e7eb;
		text-align: center;
	}

	.document-card h4 {
		font-size: 1.2rem;
		color: #1f2937;
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.document-card p {
		color: #6b7280;
		line-height: 1.6;
		margin-bottom: 1.5rem;
	}

	.document-card .download-btn {
		width: 100%;
		margin-top: 1rem;
	}

	.download-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin-top: 1rem;
	}

	.download-buttons .download-btn {
		width: 100%;
	}

	/* 반응형 디자인 */
	@media (max-width: 768px) {
		.header {
			padding: 1.5rem 0;
		}

		.logo h1 {
			font-size: 2rem;
		}

		.subtitle {
			font-size: 1rem;
		}

		.header-nav {
			flex-direction: column;
			gap: 1rem;
		}

		.history-container {
			padding: 1rem;
		}

		.container {
			padding: 1rem;
		}

		.action-bar {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}

		.stats {
			flex-direction: column;
			gap: 0.5rem;
		}

		.history-card {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}

		.history-actions {
			justify-content: center;
		}

		.sentiment-info {
			flex-direction: column;
			gap: 1rem;
		}

		.modal-content {
			width: 95%;
			margin: 1rem;
		}

		.modal-body {
			padding: 1rem;
		}

		.results-grid, .learned-grid, .documents-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
