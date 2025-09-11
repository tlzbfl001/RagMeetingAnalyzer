<script lang="ts">
	import { generateCommonMeetingReport } from '$lib/meetingReport.js';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	
	interface FileInfo {
		id: string;
		name: string;
		size: number;
		type: string;
		fileData?: File; // 실제 File 객체 (선택적)
	}

	interface AnalysisResult {
		summary: string;
		speakers: Array<{ name: string; percentage: number }>;
		keywords: Array<{ word: string; count: number }>;
		sentiment: { positive: number; negative: number; neutral: number };
		keyPoints: string[];
	}

	interface LearnedData {
		totalMeetings: number;
		commonKeywords: string[];
		speakerPatterns: Array<{ name: string; role: string; frequency: number }>;
		futurePredictions: string[];
	}

	let uploadedFiles: FileInfo[] = [];
	let extractedTexts: string[] = [];
	let analysisResults: AnalysisResult | null = null;
	let isProcessing = false;
	let processingStep = '';
	let showResults = false;
	let hadMediaInLastAnalysis = false; // 음성/영상 포함 여부
	let latestAnalysisId: string | null = null;
	let learnedData: LearnedData = {
		totalMeetings: 0,
		commonKeywords: [],
		speakerPatterns: [],
		futurePredictions: []
	};
	let analysisHistory: any[] = [];

	// 지정한 시간(ms) 안에 응답이 없으면 Abort하는 유틸
	function fetchWithTimeout(resource: string, options: RequestInit = {}, timeoutMs = 300000) {
		const controller = new AbortController();
		const id = setTimeout(() => controller.abort(), timeoutMs);
		return fetch(resource, { ...options, signal: controller.signal })
			.finally(() => clearTimeout(id));
	}

	// 페이지 로드 시 데이터 로드
	onMount(() => {
		loadData();
	});

	async function loadData() {
		try {
			// 서버에서 히스토리 데이터 가져오기
			const response = await fetchWithTimeout('/api/history');
			if (response.ok) {
				const result = await response.json();
				analysisHistory = result.data || [];
				console.log('서버에서 히스토리 로드:', analysisHistory.length, '개');
			} else {
				console.error('히스토리 로드 실패:', response.status);
				// 서버 실패 시 로컬 스토리지에서 로드 (fallback)
				const savedHistory = localStorage.getItem('analysisHistory');
				if (savedHistory) {
					analysisHistory = JSON.parse(savedHistory) || [];
					console.log('로컬에서 히스토리 로드:', analysisHistory.length, '개');
				}
			}
			
			// 서버에서 학습 데이터 가져오기
			const learnedResponse = await fetchWithTimeout('/api/learned-data');
			if (learnedResponse.ok) {
				const learnedResult = await learnedResponse.json();
				learnedData = {
					totalMeetings: analysisHistory.length, // 실제 히스토리 기반으로 계산
					commonKeywords: learnedResult.data.commonKeywords || [],
					speakerPatterns: learnedResult.data.speakerPatterns || [],
					futurePredictions: learnedResult.data.futurePredictions || []
				};
			} else {
				console.error('학습 데이터 로드 실패:', learnedResponse.status);
				// 서버 실패 시 로컬 스토리지에서 로드 (fallback)
				const savedLearnedData = localStorage.getItem('learnedData');
				if (savedLearnedData) {
					const parsed = JSON.parse(savedLearnedData);
					learnedData = {
						totalMeetings: analysisHistory.length, // 실제 히스토리 기반으로 계산
						commonKeywords: parsed.commonKeywords || [],
						speakerPatterns: parsed.speakerPatterns || [],
						futurePredictions: parsed.futurePredictions || []
					};
				} else {
					learnedData = {
						totalMeetings: analysisHistory.length, // 실제 히스토리 기반으로 계산
						commonKeywords: [],
						speakerPatterns: [],
						futurePredictions: []
					};
				}
			}
		} catch (error) {
			console.error('데이터 로드 중 오류:', error);
			// 오류 발생 시 로컬 스토리지에서 로드 (fallback)
			const savedHistory = localStorage.getItem('analysisHistory');
			const savedLearnedData = localStorage.getItem('learnedData');
			
			if (savedHistory) {
				analysisHistory = JSON.parse(savedHistory) || [];
			}
			
			if (savedLearnedData) {
				const parsed = JSON.parse(savedLearnedData);
				learnedData = {
					totalMeetings: analysisHistory.length,
					commonKeywords: parsed.commonKeywords || [],
					speakerPatterns: parsed.speakerPatterns || [],
					futurePredictions: parsed.futurePredictions || []
				};
			} else {
				learnedData = {
					totalMeetings: analysisHistory.length,
					commonKeywords: [],
					speakerPatterns: [],
					futurePredictions: []
				};
			}
			// 에러 시에도 초기 렌더 차단하지 않음
			return;
		}
	}

	function handleFileUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		if (!target.files) return;

		// 한 번에 최대 5개 파일만 업로드 가능
		if (target.files && target.files.length > 5) {
			alert('한 번에 최대 5개 파일까지만 업로드할 수 있습니다.');
			target.value = '';
			return;
		}
		
		// 히스토리에서 총 분석횟수 10회 제한 확인
		if (analysisHistory.length >= 10) {
			alert('더 이상 분석할 수 없습니다. 히스토리에서 기존 분석 결과를 삭제한 후 다시 시도해주세요.');
			target.value = '';
			return;
		}

		// 파일 크기 제한 확인 (100MB = 100 * 1024 * 1024 bytes)
		const maxFileSize = 100 * 1024 * 1024; // 100MB
		const oversizedFiles = Array.from(target.files).filter(file => file.size > maxFileSize);
		
		if (oversizedFiles.length > 0) {
			const fileNames = oversizedFiles.map(file => file.name).join(', ');
			alert(`다음 파일들이 100MB 제한을 초과합니다:\n\n${fileNames}\n\n파일 크기를 100MB 이하로 줄여주세요.`);
			target.value = '';
			return;
		}

		const files = Array.from(target.files);
		
		const newFiles: FileInfo[] = files.map(file => ({
			id: Math.random().toString(36).substr(2, 9),
			name: file.name,
			size: file.size,
			type: file.type,
			fileData: file // 실제 File 객체 저장
		}));

		uploadedFiles = [...uploadedFiles, ...newFiles];
		console.log('전체 업로드된 파일:', uploadedFiles);
		target.value = '';
	}

	function removeFile(id: string) {
		if (confirm('파일을 삭제하시겠습니까?')) {
			uploadedFiles = uploadedFiles.filter(file => file.id !== id);
		}
	}

	// 화자 역할 분류 함수
	function getSpeakerRole(speakerName: string): string {
		const name = speakerName.toLowerCase();
		
		// 최고 경영진
		if (name.includes('대표') || name.includes('사장') || name.includes('회장') || name.includes('이사장') || name.includes('ceo')) {
			return '최고경영진';
		}
		
		// 이사급
		if (name.includes('이사') || name.includes('상무') || name.includes('전무') || name.includes('부사장') || name.includes('사장대행')) {
			return '이사급';
		}
		
		// 고급 관리자
		if (name.includes('부장') || name.includes('본부장') || name.includes('그룹장') || name.includes('센터장') || name.includes('실장') || name.includes('팀장')) {
			return '고급관리자';
		}
		
		// 중간 관리자
		if (name.includes('과장') || name.includes('수석') || name.includes('책임') || name.includes('선임') || name.includes('주임')) {
			return '중간관리자';
		}
		
		// 주요 업무자
		if (name.includes('대리') || name.includes('주임') || name.includes('선임') || name.includes('사원')) {
			return '주요업무자';
		}
		
		// 전문직
		if (name.includes('연구원') || name.includes('개발자') || name.includes('엔지니어') || name.includes('디자이너') || name.includes('기획자') || name.includes('마케터')) {
			return '전문직';
		}
		
		// 외부 참석자
		if (name.includes('고객') || name.includes('파트너') || name.includes('협력사') || name.includes('컨설턴트') || name.includes('변호사') || name.includes('회계사')) {
			return '외부참석자';
		}
		
		// 학생/인턴
		if (name.includes('학생') || name.includes('인턴') || name.includes('수습') || name.includes('신입')) {
			return '신입/인턴';
		}
		
		// 기본값
		return '팀원';
	}

	// 화자명 유효성 검사: 직함(ROLE_TITLES)로 끝나고, 직함 앞 한글 2자 이상
	function isValidRoleName(name: string): boolean {
		if (!name) return false;
		const ROLE_TITLES = [
			'대표','부장','사장','부사장','전무','상무','이사','이사장','회장','사장대행','고문','자문',
			'본부장','센터장','그룹장','실장','팀장','파트장','지점장','소장','과장','차장','대리','주임','사원',
			'수석','책임','선임','전임','연구원','주임연구원','선임연구원','책임연구원','수석연구원',
			'박사','석사','학사','전문위원','전문가','컨설턴트','PM','PO','PL','QA','QC',
			'개발자','엔지니어','디자이너','기획자','분석가','데이터사이언티스트','데이터엔지니어','ML엔지니어','리서처',
			'마케터','세일즈','영업','CS','고객지원','운영','매니저','코치','트레이너','강사','교수','교사',
			'회계사','변호사','변리사','세무사','노무사','감사','내부감사','재무담당','인사담당','총무담당','법무담당',
			'PR담당','IR담당','브랜드매니저','프로덕트오너','프로덕트매니저','프로젝트매니저','UX리서처','UX디자이너','UI디자이너',
			'백엔드','프론트엔드','풀스택','클라우드아키텍트','아키텍트','SRE','보안담당','CISO','CFO','CTO','COO','CEO',
			'대표이사','총괄','책임자','실무자','담당자','주관','주최','발표자','발언자','사회자','진행자',
			'인턴','수습','신입','주니어','시니어','리드','헤드','디렉터','VP'
		];
		const nameStr = String(name).trim();
		const roleRegex = new RegExp(`(${ROLE_TITLES.join('|')})$`);
		const m = nameStr.match(roleRegex);
		if (!m) return false;
		const role = m[1];
		const before = nameStr.slice(0, nameStr.length - role.length).trim();
		return /[가-힣]{2,}/.test(before);
	}

	// 차트 표시용 화자 목록: 직함이 있는 화자만 표시
	function getSpeakersForChart(ar: AnalysisResult) {
		const strict = (ar?.speakers || []).filter(s => isValidRoleName(s.name));
		if (strict.length > 0) return strict;
		const looseRole = (ar?.speakers || []).filter(s => /(대표|부장|사장|이사장|이사|상무|전무|본부장|센터장|그룹장|실장|팀장|과장|차장|대리|주임|수석|책임|선임|연구원|매니저|디렉터|VP)/.test(String(s.name)));
		if (looseRole.length > 0) return looseRole;
		// 직함이 없는 화자는 표시하지 않음
		return [];
	}

	// 데이터 기반 미래 예측 생성 함수
	function generateDataBasedPredictions(currentAnalysis: any, learnedData: any, analysisHistory: any[]): string[] {
		const predictions: string[] = [];
		
		// 1. 감성 분석 트렌드 기반 예측
		// 총 회의 수는 실제 히스토리 개수를 사용 (현재 분석 포함 시 +1 고려 가능)
		const currentSentiment = currentAnalysis.sentiment;
		
		// 전체 히스토리의 감성 분석 평균 계산
		let totalPositive = currentSentiment.positive;
		let totalNegative = currentSentiment.negative;
		let totalNeutral = currentSentiment.neutral;
		let historyCount = 1;
		
		analysisHistory.forEach(history => {
			if (history.sentiment) {
				totalPositive += history.sentiment.positive;
				totalNegative += history.sentiment.negative;
				totalNeutral += history.sentiment.neutral;
				historyCount++;
			}
		});
		
		const avgPositive = totalPositive / historyCount;
		const avgNegative = totalNegative / historyCount;
		const avgNeutral = totalNeutral / historyCount;
		
		// 감성 기반 예측
		if (avgPositive > 60) {
			predictions.push(`긍정적인 회의 분위기가 지속되고 있습니다 (평균 ${avgPositive.toFixed(1)}%). 향후 회의에서도 건설적이고 협력적인 논의가 이루어질 것으로 예측됩니다.`);
		} else if (avgPositive > 40) {
			predictions.push(`회의 분위기가 안정적으로 유지되고 있습니다 (긍정 ${avgPositive.toFixed(1)}%, 중립 ${avgNeutral.toFixed(1)}%). 균형잡힌 논의가 지속될 것으로 보입니다.`);
		} else {
			predictions.push(`회의 분위기 개선이 필요한 상황입니다 (긍정 ${avgPositive.toFixed(1)}%, 부정 ${avgNegative.toFixed(1)}%). 더 건설적인 방향으로 개선될 것으로 예측됩니다.`);
		}
		
		// 2. 키워드 트렌드 기반 예측
		const currentKeywords = currentAnalysis.keywords.map((k: any) => k.word);
		
		// 가장 자주 언급되는 키워드 찾기
		const keywordFrequency: { [key: string]: number } = {};
		[analysisHistory, [currentAnalysis]].flat().forEach(history => {
			if (history.keywords) {
				history.keywords.forEach((keyword: any) => {
					keywordFrequency[keyword.word] = (keywordFrequency[keyword.word] || 0) + keyword.count;
				});
			}
		});
		
		const topKeywords = Object.entries(keywordFrequency)
			.sort(([,a], [,b]) => b - a)
			.slice(0, 3)
			.map(([word]) => word);
		
		if (topKeywords.length > 0) {
			predictions.push(`주요 키워드 "${topKeywords[0]}"와 "${topKeywords[1] || ''}"는 지속적으로 핵심 주제로 다뤄질 것으로 예측됩니다. 이는 프로젝트의 핵심 이슈임을 시사합니다.`);
		}
		
		// 3. 화자 패턴 기반 예측
		const speakerRoles = learnedData.speakerPatterns.map((p: any) => p.role);
		const roleFrequency: { [key: string]: number } = {};
		
		speakerRoles.forEach((role: string) => {
			roleFrequency[role] = (roleFrequency[role] || 0) + 1;
		});
		
		const dominantRole = Object.entries(roleFrequency)
			.sort(([,a], [,b]) => b - a)[0];
		
		if (dominantRole) {
			predictions.push(`"${dominantRole[0]}" 역할의 참석자들이 회의를 주도하는 패턴이 보입니다. 향후 회의에서도 이 계층의 의견이 중요한 영향을 미칠 것으로 예측됩니다.`);
		}
		
		// 4. 회의 진행 패턴 기반 예측
		const recentMeetings = analysisHistory.slice(0, 3); // 최근 3개 회의
		const hasConsistentTopics = recentMeetings.every(meeting => 
			meeting.keywords && meeting.keywords.some((k: any) => 
				currentKeywords.includes(k.word)
			)
		);
		
		if (hasConsistentTopics && recentMeetings.length > 0) {
			predictions.push(`최근 ${recentMeetings.length}개 회의에서 일관된 주제가 논의되고 있습니다. 이는 장기 프로젝트나 지속적인 이슈에 대한 집중적인 논의가 이루어질 것으로 예측됩니다.`);
		}
		
		// 5. 참석자 수 기반 예측
		const avgParticipants = analysisHistory.reduce((sum, history) => 
			sum + (history.speakers ? history.speakers.length : 0), 
			currentAnalysis.speakers.length
		) / (analysisHistory.length + 1);
		
		if (avgParticipants > 8) {
			predictions.push(`평균 ${avgParticipants.toFixed(1)}명의 참석자로 대규모 회의가 진행되고 있습니다. 향후 회의에서는 더 체계적인 의사소통과 역할 분담이 중요해질 것으로 예측됩니다.`);
		} else if (avgParticipants > 4) {
			predictions.push(`중간 규모의 회의가 주로 진행되고 있습니다 (평균 ${avgParticipants.toFixed(1)}명). 효율적인 의사결정과 실행력 있는 논의가 이루어질 것으로 보입니다.`);
		}
		
		// 6. 파일 유형 기반 예측
		const fileTypes = analysisHistory.reduce((types: string[], history) => {
			if (history.files) {
				history.files.forEach((file: any) => {
					if (!types.includes(file.type)) types.push(file.type);
				});
			}
			return types;
		}, []);
		
		const hasMultimedia = fileTypes.some(type => 
			type.includes('audio') || type.includes('video') || type.includes('mp3') || type.includes('mp4')
		);
		
		if (hasMultimedia) {
			predictions.push(`음성/영상 파일이 포함된 회의가 진행되고 있습니다. 향후 회의에서는 더욱 풍부한 정보와 컨텍스트를 바탕으로 한 심화 논의가 예상됩니다.`);
		}
		
		// 7. 시간대 기반 예측 (가능한 경우)
		const currentHour = new Date().getHours();
		if (currentHour < 12) {
			predictions.push(`오전 회의로 진행되고 있어, 참석자들의 집중도가 높고 활발한 논의가 이루어질 것으로 예측됩니다.`);
		} else if (currentHour < 18) {
			predictions.push(`오후 회의로 진행되고 있어, 실무적인 논의와 구체적인 실행 계획 수립이 활발해질 것으로 보입니다.`);
		}
		
		// 8. 종합적 전망
		const overallSentiment = avgPositive > 50 ? '긍정적' : avgPositive > 30 ? '안정적' : '개선 필요';
		predictions.push(`전반적으로 ${overallSentiment}인 분위기로 진행되고 있습니다. 지속적인 모니터링과 개선을 통해 더욱 효과적인 회의 문화를 만들어갈 것으로 예측됩니다.`);
		
		return predictions.slice(0, 8); // 최대 8개 예측 반환
	}

	async function analyzeFiles() {
		if (uploadedFiles.length === 0) {
			alert('분석할 파일을 먼저 업로드해주세요.');
			return;
		}

		isProcessing = true;
		processingStep = '파일 업로드 중...';

		try {
			console.log('분석 시작 - 업로드된 파일:', uploadedFiles);
			
			// 파일 데이터 유효성 검사
			const validFiles = uploadedFiles.filter(file => file.fileData);
			if (validFiles.length === 0) {
				throw new Error('업로드된 파일이 없거나 파일 데이터가 손실되었습니다. 파일을 다시 업로드해주세요.');
			}
			
			// 서버 연결 시도 (선택적)
			let uploadResult: { fileIds: string[] } = { fileIds: [] };
			
			try {
				// 서버에 파일 업로드 및 분석 요청 (한 번에 처리)
				const formData = new FormData();
				validFiles.forEach(file => {
					if (file.fileData) {
						formData.append('files', file.fileData);
						console.log('FormData에 추가된 파일:', file.name, file.fileData);
					}
				});

				processingStep = '파일 분석 중...';

				// 업로드 파일에 음성/영상 포함 여부 기록
				hadMediaInLastAnalysis = validFiles.some(f => f.type.startsWith('audio/') || f.type.startsWith('video/'));
				
				let analysisResponse: Response;
				try {
				analysisResponse = await fetchWithTimeout('/api/analyze', {
					method: 'POST',
					body: formData
				});
				} catch (e) {
					console.warn('분석 타임아웃 발생: 5분 내 응답 없음', e);
					processingStep = '분석이 5분 안에 완료되지 않았습니다.';
					alert('분석 요청이 타임아웃되었습니다. 서버 처리 시간이 길 수 있습니다.');
					isProcessing = false;
					return;
				}

				console.log('분석 응답:', analysisResponse.status, analysisResponse.statusText);

				if (analysisResponse.ok) {
					const analysisData = await analysisResponse.json();
					console.log('분석 성공:', analysisData);
					latestAnalysisId = analysisData.analysisId || null;
					
					// 서버 분석 결과 사용
					analysisResults = analysisData.results;
					
					// extractedTexts 설정 (서버에서 받은 텍스트 또는 파일 내용)
					if (analysisData.extractedTexts && Array.isArray(analysisData.extractedTexts)) {
						extractedTexts = analysisData.extractedTexts;
					} else if (analysisData.extractedText) {
						extractedTexts = [analysisData.extractedText];
					} else {
						// 파일 내용을 직접 읽어서 설정
						extractedTexts = await Promise.all(validFiles.map(async (file) => {
							if (file.fileData) {
								return await file.fileData.text();
							}
							return '';
						}));
					}
					
					// 업로드 결과 시뮬레이션 (파일 다운로드용)
					uploadResult = {
						fileIds: validFiles.map((_, index) => `file_${Date.now()}_${index}`)
					};
				} else {
					let serverMsg = `${analysisResponse.status} ${analysisResponse.statusText}`;
					try {
						const err = await analysisResponse.json();
						if (err && (err.error || err.details)) {
							serverMsg += ` - ${err.error || ''} ${err.details || ''}`.trim();
						}
					} catch {}
					console.error('서버 분석 실패:', serverMsg);
					throw new Error(`서버 분석 실패: ${serverMsg}`);
				}
			} catch (serverError) {
				console.error('서버 연결 실패:', serverError);
				throw new Error(`서버 연결 실패: ${serverError instanceof Error ? serverError.message : '알 수 없는 서버 오류'}`);
			}

			// 서버 분석이 실패한 경우
			if (!analysisResults) {
				throw new Error('서버 분석에 실패했습니다. 서버 상태를 확인하고 다시 시도해주세요.');
			}

			// 학습 데이터 업데이트
			// 총 분석회의 수를 실제 히스토리 기반으로 계산
			learnedData.totalMeetings = analysisHistory.length + 1;
			console.log('총 분석회의 수 업데이트:', learnedData.totalMeetings, '(히스토리:', analysisHistory.length, '+ 현재분석: 1)');
			learnedData.commonKeywords = [...new Set([...learnedData.commonKeywords, ...analysisResults!.keywords.map(k => k.word)])];
			
			// 화자 패턴 업데이트 (ROLE_TITLES 기준으로 끝나는 유효 이름만 반영)
			analysisResults!.speakers
				.filter(s => isValidRoleName(s.name))
				.forEach(speaker => {
					const existing = learnedData.speakerPatterns.find(p => p.name === speaker.name);
					if (existing) {
						existing.frequency = (existing.frequency + speaker.percentage) / 2;
					} else {
						learnedData.speakerPatterns.push({
							name: speaker.name,
							role: getSpeakerRole(speaker.name),
							frequency: speaker.percentage
						});
					}
				});
			
			// 히스토리에 저장 (서버 파일 정보 포함)
			const historyItem = {
				id: Math.random().toString(36).substr(2, 9),
				date: new Date().toLocaleDateString('ko-KR'),
				files: uploadedFiles.map((file, index) => ({
					id: file.id,
					name: file.name,
					size: file.size,
					type: file.type,
					serverFilename: uploadResult.fileIds[index], // 서버에 저장된 파일명
					downloadUrl: `/api/files/${uploadResult.fileIds[index]}` // 다운로드 URL
				})),
				...analysisResults,
				futurePredictions: learnedData.futurePredictions // 미래예측 데이터 추가
			};
			
			analysisHistory = [historyItem, ...analysisHistory];
			
			// localStorage에 저장 (fallback용)
			localStorage.setItem('learnedData', JSON.stringify(learnedData));
			localStorage.setItem('analysisHistory', JSON.stringify(analysisHistory));
			
			// 히스토리 데이터 다시 로드 (서버와 동기화)
			await loadData();
			// 데이터 기반 미래 예측 생성 (동기화된 최신 히스토리 기준)
			learnedData.futurePredictions = generateDataBasedPredictions(analysisResults!, learnedData, analysisHistory);
			
			showResults = true;
			uploadedFiles = [];
			
		} catch (error) {
			console.error('분석 중 오류:', error);
			const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
			alert('분석 중 오류가 발생했습니다: ' + errorMessage);
		} finally {
			isProcessing = false;
		}
	}

	function downloadReport() {
		if (!analysisResults) return;
		
		// 현재 날짜 생성
		const now = new Date();
		const currentDate = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
		
		// 히스토리와 동일한 방식으로 회의 내용 텍스트 구성
		let extractedText = '';
		if (extractedTexts && Array.isArray(extractedTexts) && extractedTexts.length > 0) {
			extractedText = extractedTexts[0];
		} else if (typeof extractedTexts === 'string') {
			extractedText = extractedTexts;
		}

		const analysisResultsWithText = {
			...analysisResults,
			extractedText: (extractedText || '').toString()
		};

		// 전사 완료 전이라 비어있거나 실패 메시지일 경우, 서버 히스토리의 최신 전사 텍스트로 보강
		(async () => {
			const bad = !analysisResultsWithText.extractedText || analysisResultsWithText.extractedText.trim().length < 20 || analysisResultsWithText.extractedText.includes('음성 인식 실패');
			if (bad) {
				try {
					const resp = await fetch('/api/history');
					if (resp.ok) {
						const hist = await resp.json();
						let matched = null;
						if (Array.isArray(hist.data)) {
							matched = latestAnalysisId ? hist.data.find((h: any) => h.id === latestAnalysisId) : (hist.data[0] || null);
						}
						if (matched && matched.extractedTexts && Array.isArray(matched.extractedTexts) && matched.extractedTexts[0]) {
							analysisResultsWithText.extractedText = matched.extractedTexts[0];
						}
					}
				} catch {}
			}
		
			const reportAsync = generateCommonMeetingReport(analysisResultsWithText, currentDate);
			const blobAsync = new Blob([reportAsync], { type: 'text/html;charset=utf-8' });
			const urlAsync = URL.createObjectURL(blobAsync);
			const aAsync = document.createElement('a');
			aAsync.href = urlAsync;
			aAsync.download = '회의록.html';
			document.body.appendChild(aAsync);
			aAsync.click();
			document.body.removeChild(aAsync);
			URL.revokeObjectURL(urlAsync);
		})();
		// 기존 동기 다운로드 경로는 비활성화 (위의 보강 경로 사용)
	}

	async function clearData() {
		if (confirm('모든 데이터를 초기화하시겠습니까?')) {
			try {
				const clearAllResponse = await fetchWithTimeout('/api/analysis', {
					method: 'DELETE'
				});
				
				if (clearAllResponse.ok) {
					console.log('서버 전체 삭제 성공');
				} else {
					console.error('서버 전체 삭제 실패:', clearAllResponse.status);
					// 개별 삭제로 대체
					if (analysisHistory.length > 0) {
						console.log('개별 삭제로 대체...');
						for (const history of analysisHistory) {
							try {
								const deleteResponse = await fetchWithTimeout(`/api/analysis/${history.id}`, {
									method: 'DELETE'
								});
								
								if (deleteResponse.ok) {
									console.log(`분석 결과 삭제 성공: ${history.id}`);
								} else {
									console.error(`분석 결과 삭제 실패: ${history.id}`);
								}
							} catch (error) {
								console.error(`삭제 요청 실패: ${history.id}`, error);
							}
						}
					}
				}
				
				// 프론트엔드 데이터 초기화
				uploadedFiles = [];
				extractedTexts = [];
				analysisResults = null;
				showResults = false;
				learnedData = {
					totalMeetings: 0,
					commonKeywords: [],
					speakerPatterns: [],
					futurePredictions: []
				};
				analysisHistory = [];
				
				// localStorage 완전 초기화
				localStorage.clear();
				
				alert('모든 데이터가 성공적으로 삭제되었습니다. 페이지가 새로고침됩니다.');
				
				// 페이지 새로고침으로 완전한 초기화
				window.location.reload();
			} catch (error) {
				console.error('데이터 삭제 중 오류:', error);
				const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
				alert('데이터 삭제 중 오류가 발생했습니다: ' + errorMessage);
			}
		}
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
			<a href="{base}/" class="nav-link active" data-sveltekit-preload-data="off" data-sveltekit-preload-code="off">🏠 메인</a>
			<a href="{base}/history" class="nav-link" data-sveltekit-preload-data="off" data-sveltekit-preload-code="off">📊 히스토리</a>
		</nav>
		</div>
</header>

<div class="main-container">
	<div class="container">
		<!-- 파일 업로드 섹션 -->
		<section class="upload-section">
			<div class="section-header">
				<h2>📁 파일 업로드</h2>
				<p>회의 관련 파일을 업로드하여 AI 분석을 시작하세요</p>
		</div>
			
			<div class="upload-area">
				{#if analysisHistory.length >= 10}
					<div class="upload-disabled">
						<div class="upload-icon">🚫</div>
						<p>분석 횟수 제한에 도달했습니다</p>
						<span class="upload-hint">최대 10회까지 분석 가능합니다. 히스토리에서 분석 결과를 삭제한 후 다시 시도해주세요.</span>
					</div>
				{:else}
					<input type="file" id="fileInput" multiple accept=".txt,.doc,.docx,.mp3,.wav,.mp4" on:change={handleFileUpload} />
					<label for="fileInput" class="upload-label">
						<div class="upload-icon">📁</div>
						<p>파일을 선택하거나 여기에 드래그하세요</p>
						<span class="upload-hint">지원 형식: TXT, DOC, MP3, WAV, MP4 | 파일 크기: 최대 100MB</span>
					</label>
				{/if}
		</div>

			{#if uploadedFiles.length > 0}
				<div class="file-list">
					<h3>업로드된 파일 ({uploadedFiles.length}개)</h3>
					{#each uploadedFiles as file}
						<div class="file-item">
							<span class="file-name">{file.name}</span>
							<span class="file-size">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
							<button class="remove-btn" on:click={() => removeFile(file.id)}>삭제</button>
	</div>
					{/each}
					
					<div class="upload-actions">
						<button class="analyze-btn" on:click={analyzeFiles} disabled={isProcessing}>
							{isProcessing ? '분석 중...' : '분석 시작'}
						</button>
			</div>
			</div>
			{/if}
</section>

		{#if isProcessing}
			<section class="processing-section">
				<div class="processing-content">
					<div class="spinner"></div>
					<h3>AI 분석 중...</h3>
					<p>{processingStep}</p>
				</div>
			</section>
		{/if}

		{#if showResults && analysisResults}
			<!-- 분석 결과 섹션 -->
			<section class="results-section">
				<div class="section-header">
					<h2>📊 실시간 분석 결과</h2>
					<p>AI가 분석한 회의 내용의 핵심 정보</p>
			</div>

				<div class="results-grid">
					<!-- 회의 요약 -->
					<div class="result-card summary-card">
						<h3>📝 회의 요약</h3>
						<p>{analysisResults.summary}</p>
			</div>

					<!-- 화자별 발언 비중 -->
					<div class="result-card speaker-card">
						<h3>👥 화자별 발언 비중</h3>
						<div class="speaker-chart">
							{#each getSpeakersForChart(analysisResults) as speaker}
								<div class="speaker-item">
									<span class="speaker-name">{speaker.name}</span>
									<div class="speaker-bar">
										<div class="bar" style="width: {speaker.percentage}%"></div>
				</div>
									<span class="speaker-percentage">{Math.round(speaker.percentage)}%</span>
					</div>
							{/each}
					</div>
					</div>

					<!-- 키워드 발생 빈도 -->
					<div class="result-card keyword-card">
						<h3>🔑 키워드 발생 빈도</h3>
						<div class="keyword-chart">
							{#each analysisResults.keywords as keyword}
								<div class="keyword-item">
									<span class="keyword-word">{keyword.word}</span>
									<div class="keyword-bar">
										<div class="bar" style="width: {(keyword.count / analysisResults.keywords[0].count) * 100}%"></div>
		</div>
									<span class="keyword-count">{keyword.count}회</span>
					</div>
							{/each}
					</div>
				</div>

					<!-- 감성 분석 -->
					<div class="result-card sentiment-card">
						<h3>😊 감성 분석</h3>
						<div class="sentiment-chart">
							<div class="sentiment-item">
								<span class="sentiment-label">긍정</span>
								<div class="sentiment-bar">
									<div class="bar positive" style="width: {analysisResults.sentiment.positive}%"></div>
					</div>
								<span class="sentiment-value">{analysisResults.sentiment.positive}%</span>
					</div>
							<div class="sentiment-item">
								<span class="sentiment-label">부정</span>
								<div class="sentiment-bar">
									<div class="bar negative" style="width: {analysisResults.sentiment.negative}%"></div>
				</div>
								<span class="sentiment-value">{analysisResults.sentiment.negative}%</span>
				</div>
							<div class="sentiment-item">
								<span class="sentiment-label">중립</span>
								<div class="sentiment-bar">
									<div class="bar neutral" style="width: {analysisResults.sentiment.neutral}%"></div>
					</div>
								<span class="sentiment-value">{analysisResults.sentiment.neutral}%</span>
					</div>
				</div>
				</div>

					<!-- 주요 포인트 -->
					<div class="result-card points-card">
						<h3>💡 주요 포인트</h3>
						<ul class="points-list">
							{#each analysisResults.keyPoints as point}
								<li>{point}</li>
							{/each}
						</ul>
					</div>
				</div>
			</section>

			<!-- 학습된 결과 섹션 -->
			<section class="learned-section">
				<div class="section-header">
					<h2>📚 과거 기록 기반 분석</h2>
					<p>누적된 회의 데이터를 기반으로 한 패턴 분석 및 미래 예측</p>
				</div>
				<div class="learned-grid">
					<!-- 통계 요약 -->
					<div class="learned-card stats-card">
						<h3>📈 누적 통계</h3>
						<div class="stats-grid">
							<div class="stat-item">
								<div class="stat-number">{learnedData?.totalMeetings || 0}</div>
								<div class="stat-label">총 분석 회의</div>
				</div>
							<div class="stat-item">
								<div class="stat-number">{learnedData?.commonKeywords?.length || 0}</div>
								<div class="stat-label">누적 키워드</div>
										</div>
							<div class="stat-item">
								<div class="stat-number">{learnedData?.speakerPatterns?.length || 0}</div>
								<div class="stat-label">화자 패턴</div>
										</div>
									</div>
								</div>

					<!-- 공통 키워드 -->
					<div class="learned-card keyword-card">
						<h3>🔑 공통 키워드</h3>
						<div class="keyword-tags">
							{#each (learnedData?.commonKeywords || []).slice(0, 10) as keyword}
								<span class="keyword-tag">{keyword}</span>
							{/each}
				</div>
			</div>

					<!-- 화자 패턴 -->
					<div class="learned-card pattern-card">
						<h3>👥 화자 패턴</h3>
						<div class="pattern-list">
							{#each (learnedData?.speakerPatterns || []).slice(0, 5) as pattern}
								<div class="pattern-item">
									<div class="pattern-info">
										<span class="pattern-name">{pattern.name}</span>
										<span class="pattern-role">{pattern.role}</span>
				</div>
									<span class="pattern-freq">{pattern.frequency}%</span>
						</div>
							{/each}
					</div>
						</div>

					<!-- 미래 예측 -->
					<div class="learned-card prediction-card">
						<h3>🔮 미래 예측</h3>
						<div class="prediction-list">
							{#each (learnedData?.futurePredictions || []) as prediction}
								<div class="prediction-item">
									<p>{prediction}</p>
					</div>
							{/each}
			</div>
		</div>
	</div>
</section>

			<!-- 액션 섹션 -->
			<section class="action-section">
				<div class="section-header">
					<h2>📋 문서 및 데이터 관리</h2>
					<p>분석 결과를 다운로드하고 데이터를 관리하세요</p>
				</div>

				<div class="action-grid">
					{#if hadMediaInLastAnalysis}
						<a class="action-btn primary" href="{base}/history">📄 히스토리에서 회의록 다운로드</a>
					{:else}
						<button class="action-btn primary" on:click={downloadReport}>📄 회의 결과 보고서 다운로드</button>
					{/if}
					<button class="action-btn secondary" on:click={clearData}>
						🗑️ 학습 데이터 초기화
			</button>
	</div>
</section>
		{/if}
					</div>
				</div>

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
	.main-container {
		padding: 3rem 0;
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	/* 섹션 공통 스타일 */
	.section-header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.section-header h2 {
		font-size: 2.5rem;
		color: #1f2937;
		margin-bottom: 1rem;
	}

	.section-header p {
		font-size: 1.2rem;
		color: #6b7280;
	}

	/* 파일 업로드 */
	.upload-section {
		background: white;
		border-radius: 1rem;
		padding: 3rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		margin-bottom: 3rem;
	}

	.upload-area {
		position: relative;
		border: 2px dashed #d1d5db;
		border-radius: 1rem;
		padding: 3rem;
		text-align: center;
		transition: border-color 0.3s ease;
	}

	.upload-area:hover {
		border-color: #667eea;
	}

	.upload-disabled {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		border: 2px dashed #ccc;
		border-radius: 12px;
		background-color: #f8f9fa;
		color: #6c757d;
		text-align: center;
		cursor: not-allowed;
	}

	.upload-disabled .upload-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.upload-disabled p {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: #dc3545;
	}

	.upload-disabled .upload-hint {
		font-size: 0.9rem;
		color: #6c757d;
	}

	.upload-area input[type="file"] {
		position: absolute;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
		z-index: 1;
	}

	.upload-label {
		cursor: pointer;
		position: relative;
		z-index: 2;
	}

	.upload-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.upload-hint {
		font-size: 0.9rem;
		color: #6b7280;
		margin-top: 0.5rem;
		display: block;
	}

	.upload-warning {
		background: #fef3c7;
		color: #92400e;
		padding: 0.75rem;
		border-radius: 0.5rem;
		margin-top: 1rem;
		font-size: 0.9rem;
		font-weight: 600;
		border: 1px solid #f59e0b;
	}

	.file-list {
		margin-top: 2rem;
	}

	.file-list h3 {
		font-size: 1.5rem;
		color: #374151;
		margin-bottom: 1rem;
	}

	.file-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
		background: #f9fafb;
	}

	.file-name {
		font-weight: 600;
		color: #374151;
	}

	.file-size {
		color: #6b7280;
		font-size: 0.9rem;
	}

	.remove-btn {
		background: #ef4444;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.upload-actions {
		margin-top: 1.5rem;
		text-align: center;
	}

	.analyze-btn {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
		padding: 1rem 2rem;
		border-radius: 0.5rem;
		font-size: 1.1rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.3s ease;
	}

	.analyze-btn:hover:not(:disabled) {
		transform: translateY(-2px);
	}

	.analyze-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* 처리 중 */
	.processing-section {
		background: white;
		border-radius: 1rem;
		padding: 4rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		margin-bottom: 3rem;
		text-align: center;
	}

	.spinner {
		width: 3rem;
		height: 3rem;
		border: 3px solid #e5e7eb;
		border-top: 3px solid #667eea;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* 결과 섹션 */
	.results-section {
		margin-bottom: 3rem;
	}

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
		gap: 2rem;
	}

	.result-card {
		background: white;
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.result-card h3 {
		font-size: 1.5rem;
		color: #1f2937;
		margin-bottom: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* 화자 차트 */
	.speaker-chart {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.speaker-item {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.speaker-name {
		font-weight: 600;
		color: #374151;
		min-width: 80px;
	}

	.speaker-bar {
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

	.speaker-percentage {
		font-weight: 700;
		color: #374151;
		min-width: 50px;
		text-align: right;
	}

	/* 키워드 차트 */
	.keyword-chart {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.keyword-item {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.keyword-word {
		font-weight: 600;
		color: #374151;
		min-width: 80px;
	}

	.keyword-bar {
		flex: 1;
		height: 1.5rem;
		background: #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.keyword-bar .bar {
		height: 100%;
		background: linear-gradient(90deg, #10b981, #059669);
		transition: width 0.3s ease;
	}

	.keyword-count {
		font-weight: 700;
		color: #374151;
		min-width: 50px;
		text-align: right;
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

	/* 포인트 리스트 */
	.points-list {
		list-style: none;
		padding: 0;
	}

	.points-list li {
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
		margin-bottom: 0.75rem;
		color: #374151;
		line-height: 1.6;
		border-left: 4px solid #667eea;
	}

	/* 학습된 결과 */
	.learned-section {
		margin-bottom: 3rem;
	}

	.learned-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
		gap: 2rem;
	}

	.learned-card {
		background: white;
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.learned-card h3 {
		font-size: 1.5rem;
		color: #1f2937;
		margin-bottom: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* 통계 그리드 */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.stat-item {
		text-align: center;
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
	}

	.stat-number {
		font-size: 2rem;
		font-weight: bold;
		color: #667eea;
		margin-bottom: 0.5rem;
	}

	.stat-label {
		font-size: 0.9rem;
		color: #6b7280;
	}

	/* 키워드 태그 */
	.keyword-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.keyword-tag {
		background: #667eea;
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 2rem;
		font-size: 0.9rem;
		font-weight: 500;
	}

	/* 화자 패턴 */
	.pattern-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.pattern-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
	}

	.pattern-name {
		font-weight: 600;
		color: #374151;
	}

	.pattern-role {
		font-size: 0.9rem;
		color: #6b7280;
		margin-left: 0.5rem;
	}

	.pattern-freq {
		font-weight: 700;
		color: #667eea;
	}

	/* 미래 예측 */
	.prediction-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.prediction-item {
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
		border-left: 4px solid #10b981;
	}

	.prediction-item p {
		margin: 0;
		color: #374151;
		line-height: 1.6;
	}

	/* 액션 섹션 */
	.action-section {
		background: white;
		border-radius: 1rem;
		padding: 3rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.action-grid {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	.action-btn {
		border: none;
		padding: 1rem 2rem;
		border-radius: 0.5rem;
		font-size: 1.1rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.3s ease;
	}

	.action-btn.primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}

	.action-btn.secondary {
		background: #6b7280;
		color: white;
	}

	.action-btn:hover {
		transform: translateY(-2px);
	}

	/* 반응형 */
	@media (max-width: 768px) {
		.container {
			padding: 0 1rem;
		}

		.logo h1 {
			font-size: 2rem;
		}

		.subtitle {
			font-size: 1rem;
		}

		.results-grid,
		.learned-grid {
			grid-template-columns: 1fr;
		}

		.action-grid {
			flex-direction: column;
		}
	}
</style>
  