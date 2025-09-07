/**
 * @typedef {Object} MeetingInfo
 * @property {string} [date] - 회의 날짜
 * @property {string} [time] - 회의 시간
 * @property {string} [location] - 회의 장소
 * @property {string} [participants] - 참석자
 * @property {string} [purpose] - 회의 목적
 * @property {string} [topic] - 회의 주제
 */

// 회의 정보 추출 함수
/**
 * @param {string} text - 분석할 텍스트
 * @returns {MeetingInfo} 추출된 회의 정보
 */
function extractMeetingInfo(text) {
	if (!text) return {};
	
	const info = {};
	
	// 날짜 추출
	const dateMatch = text.match(/회의\s*일시[:\s]*([0-9년월일\s]+)/);
	if (dateMatch) {
		info.date = dateMatch[1].trim();
	}
	
	// 시간 추출
	const timeMatch = text.match(/(오전|오후)\s*([0-9]+시)/);
	if (timeMatch) {
		info.time = timeMatch[0].trim();
	}
	
	// 장소 추출
	const locationMatch = text.match(/장소[:\s]*([^\n]+)/);
	if (locationMatch) {
		info.location = locationMatch[1].trim();
	}
	
	// 참석자 추출
	const participantsMatch = text.match(/참석자[:\s]*([^\n]+)/);
	if (participantsMatch) {
		info.participants = participantsMatch[1].trim();
	}
	
	// 목적/목표 추출 (안건, 목적, 목표 등 다양한 표현 대응)
	const purposeMatch = text.match(/(?:안건|목적|목표)[:\s]*([^\n]+)/);
	if (purposeMatch) {
		info.purpose = purposeMatch[1].trim();
	}
	
	// 주제 추출 (주제, 논의사항 등 다양한 표현 대응)
	const topicMatch = text.match(/(?:주제|논의사항|안건)[:\s]*([^\n]+)/);
	if (topicMatch) {
		info.topic = topicMatch[1].trim();
	}
	
	// 결론 추출
	const conclusionMatch = text.match(/결론[:\s]*([^\n]+)/);
	if (conclusionMatch) {
		info.conclusion = conclusionMatch[1].trim();
	}
	
	// 다음 회의 추출
	const nextMeetingMatch = text.match(/다음\s*회의[:\s]*([^\n]+)/);
	if (nextMeetingMatch) {
		info.nextMeeting = nextMeetingMatch[1].trim();
	}
	
	return info;
}

// 바이너리 데이터 감지 함수
/**
 * @param {string} text - 검사할 텍스트
 * @returns {boolean} 바이너리 데이터 포함 여부
 */
function isBinaryData(text) {
	// MP4/MP3 바이너리 메타데이터 패턴
	const binaryPatterns = [
		'mdhd', 'trak', 'stco', 'stsz', 'stsc', 'mdia', 'minf', 'smhd',
		'hdlr', 'dinf', 'dref', 'stbl', 'mp4a', 'avc1', 'tkhd', 'mdat',
		'moov', 'mvhd', 'udta', 'stco', 'stsz', 'stsc', 'mdia', 'minf',
		'smhd', 'hdlr', 'dinf', 'dref', 'stbl', 'mp4a', 'avc1', 'tkhd',
		'mdat', 'moov', 'mvhd', 'udta', 'stco', 'stsz', 'stsc', 'mdia',
		'minf', 'smhd', 'hdlr', 'dinf', 'dref', 'stbl', 'mp4a', 'avc1',
		'tkhd', 'mdat', 'moov', 'mvhd', 'udta'
	];
	
	// 바이너리 패턴이 포함되어 있는지 확인
	const hasBinaryPattern = binaryPatterns.some(pattern => 
		text.toLowerCase().includes(pattern.toLowerCase())
	);
	
	// 특수 바이너리 문자 패턴 (86 등)
	const hasSpecialBinary = /[^\u0000-\u007F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\s\w\.,!?;:()[\]{}"'\-]/g.test(text);
	
	// 바이너리 데이터로 판단되는 경우
	return hasBinaryPattern || hasSpecialBinary;
}

// 회의 내용 요약 함수 (100줄 기준, 파일별 처리)
/**
 * @param {string} text - 요약할 텍스트
 * @param {string} [filename] - 파일명 (확장자로 파일 타입 판단)
 * @returns {string} 요약된 텍스트
 */
function generateMeetingSummary(text, filename = '') {
	if (!text || text.trim().length === 0) {
		return '회의 내용을 요약할 수 없습니다.';
	}
	
	// 파일 확장자에 따른 텍스트 정제
	let cleanedText = text;
	
	if (filename) {
		const extension = filename.toLowerCase().split('.').pop();
		
		switch (extension) {
			case 'pdf':
				// PDF에서 한글 텍스트만 추출 (강화된 정제)
				cleanedText = text
					// 1단계: PDF 메타데이터 및 바이너리 정보 완전 제거
					.replace(/CMYK[\s\S]*?endstream/g, '') // CMYK 정보 제거
					.replace(/Adobe PDF library[\s\S]*?endobj/g, '') // Adobe 정보 제거
					.replace(/stream[\s\S]*?endstream/g, '') // stream 정보 제거
					.replace(/obj[\s\S]*?endobj/g, '') // obj 정보 제거
					.replace(/C=\d+\s+M=\d+\s+Y=\d+\s+K=\d+/g, '') // CMYK 색상 정보 제거
					.replace(/PROCESS[\s\S]*?\d+\.\d+/g, '') // PROCESS 정보 제거
					.replace(/startxref[\s\S]*?%%EOF/g, '') // PDF 끝부분 정보 제거
					.replace(/endstream[\s\S]*?endobj/g, '') // endstream-endobj 블록 제거
					.replace(/h[^]*/g, '') // 바이너리 데이터 제거
					.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\s]/g, '') // 한글과 공백만 유지
					.replace(/\s+/g, ' ') // 연속 공백 정리
					.trim();
				
				// 2단계: 한글 문장만 추출 (한글이 포함된 줄만)
				const lines = cleanedText.split('\n');
				const koreanLines = lines.filter(line => {
					const koreanCount = (line.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
					return koreanCount > 0 && line.trim().length > 2;
				});
				
				cleanedText = koreanLines.join('\n');
				
				// 3단계: 한글이 없으면 안내 메시지
				if (!cleanedText || cleanedText.trim().length < 5) {
					cleanedText = 'PDF 파일에서 한글 텍스트를 추출할 수 없습니다. 한글이 포함된 PDF 파일인지 확인해주세요.';
				}
				break;
				
			case 'doc':
			case 'docx':
				// Word 문서 메타데이터 제거, 깨진 글자 제거
				cleanedText = text
					.replace(/Microsoft Word[\s\S]*?Document/g, '') // Word 메타데이터 제거
					.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\s\w\.,!?;:()[\]{}"'\-]/g, '') // 깨진 글자 완전 제거
					.replace(/\s+/g, ' ') // 연속 공백 정리
					.trim();
				break;
				
			case 'mp3':
			case 'wav':
				// 오디오 파일: Whisper API 처리 결과 확인
				if (text.includes('음성 인식 실패') || text.includes('API 키') || text.includes('음성 인식 결과') || 
					text.includes('Whisper API') || text.includes('음성 인식 결과')) {
					// Whisper API 처리 결과가 있는 경우
					cleanedText = text;
				} else if (isBinaryData(text)) {
					// 바이너리 데이터가 감지된 경우
					cleanedText = '🎵 오디오 파일입니다.\n\n' +
						'⚠️ 음성 인식에 실패했습니다.\n\n' +
						'📋 해결 방법:\n' +
						'1. OpenAI API 키 설정 확인\n' +
						'2. server/.env 파일에 OPENAI_API_KEY 입력\n' +
						'3. 서버 재시작\n' +
						'4. API 크레딧 확인\n\n' +
						'💡 임시 해결책: 음성 파일을 텍스트로 변환 후 .txt 파일로 업로드';
				} else {
					// 기타 바이너리 데이터가 그대로 나온 경우
					cleanedText = '🎵 오디오 파일입니다.\n\n' +
						'⚠️ 음성 인식에 실패했습니다.\n\n' +
						'📋 해결 방법:\n' +
						'1. OpenAI API 키 설정 확인\n' +
						'2. server/.env 파일에 OPENAI_API_KEY 입력\n' +
						'3. 서버 재시작\n' +
						'4. API 크레딧 확인\n\n' +
						'💡 임시 해결책: 음성 파일을 텍스트로 변환 후 .txt 파일로 업로드';
				}
				break;
				
			case 'mp4':
			case 'avi':
			case 'mov':
				// 비디오 파일: Whisper API 처리 결과 확인
				if (text.includes('음성 인식 실패') || text.includes('API 키') || text.includes('음성 인식 결과') || 
					text.includes('Whisper API') || text.includes('음성 인식 결과')) {
					// Whisper API 처리 결과가 있는 경우
					cleanedText = text;
				} else if (isBinaryData(text)) {
					// 바이너리 데이터가 감지된 경우
					cleanedText = '🎬 비디오 파일입니다.\n\n' +
						'⚠️ 음성 인식에 실패했습니다.\n\n' +
						'📋 해결 방법:\n' +
						'1. OpenAI API 키 설정 확인\n' +
						'2. server/.env 파일에 OPENAI_API_KEY 입력\n' +
						'3. 서버 재시작\n' +
						'4. API 크레딧 확인\n\n' +
						'💡 임시 해결책: 비디오 파일을 텍스트로 변환 후 .txt 파일로 업로드';
				} else {
					// 기타 바이너리 데이터가 그대로 나온 경우
					cleanedText = '🎬 비디오 파일입니다.\n\n' +
						'⚠️ 음성 인식에 실패했습니다.\n\n' +
						'📋 해결 방법:\n' +
						'1. OpenAI API 키 설정 확인\n' +
						'2. server/.env 파일에 OPENAI_API_KEY 입력\n' +
						'3. 서버 재시작\n' +
						'4. API 크레딧 확인\n\n' +
						'💡 임시 해결책: 비디오 파일을 텍스트로 변환 후 .txt 파일로 업로드';
				}
				break;
				
			default:
				// txt 등 텍스트 파일은 깨진 글자만 제거
				cleanedText = text
					.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\s\w\.,!?;:()[\]{}"'\-]/g, '') // 깨진 글자 완전 제거
					.replace(/\s+/g, ' ') // 연속 공백 정리
					.trim();
				break;
		}
	}
	
	// 정제된 텍스트가 비어있으면 원본 사용
	if (!cleanedText || cleanedText.trim().length === 0) {
		cleanedText = text;
	}
	
	// 텍스트를 줄 단위로 분리하고 엔터와 빈 줄 모두 유지
	const lines = cleanedText.split('\n');
	
	// 100줄 이하면 전체 내용 반환
	if (lines.length <= 100) {
		return lines.join('\n');
	}
	
	// 100줄을 넘으면 마지막 100줄의 첫 번째 문단부터 시작
	const last100Start = Math.max(0, lines.length - 100);
	let startIndex = last100Start;
	
	// 마지막 100줄 내에서 첫 번째 문단 시작점 찾기 (빈 줄 다음에 오는 첫 번째 내용)
	for (let i = last100Start; i < lines.length; i++) {
		if (lines[i].length > 0) {
			startIndex = i;
			break;
		}
	}
	
	// 마지막 100줄부터 끝까지 추출
	const selectedLines = lines.slice(startIndex);
	return selectedLines.join('\n');
}

// 공통 회의록 생성 함수
/**
 * @typedef {Object} Speaker
 * @property {string} name - 화자 이름
 * @property {number} percentage - 발언 비율
 */

/**
 * @param {Object} analysisResults - 분석 결과 객체
 * @param {string} analysisResults.extractedText - 추출된 텍스트
 * @param {Array<Speaker>} [analysisResults.speakers] - 화자 정보 배열
 * @param {string} [analysisResults.filename] - 파일명
 * @param {string} currentDate - 현재 날짜
 * @returns {string} HTML 형식의 회의록
 */
export function generateCommonMeetingReport(analysisResults, currentDate) {
	// extractedText에서 회의 정보 추출
	const meetingInfo = extractMeetingInfo(analysisResults.extractedText || '');
	
	return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>회의록 - ${meetingInfo.date || currentDate}</title>
    <style>
        body { 
            font-family: 'Malgun Gothic', sans-serif; 
            margin: 40px; 
            line-height: 1.6;
            color: #333;
        }
        .header { 
            text-align: center; 
            margin-bottom: 40px; 
            border-bottom: 3px solid #667eea;
            padding-bottom: 20px;
        }
        .header h1 {
            color: #667eea;
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        .meeting-info { 
            margin-bottom: 30px; 
            background: #f8f9fa;
            padding: 25px;
            border-radius: 10px;
        }
        .section { 
            margin-bottom: 30px; 
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
        }
        .section h3 {
            background: #667eea;
            color: white;
            margin: 0;
            padding: 15px 20px;
            font-size: 1.3rem;
        }
        .section-content {
            padding: 20px;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 15px 0; 
            background: white;
        }
        th, td { 
            border: 1px solid #ddd; 
            padding: 15px; 
            text-align: left; 
        }
        th { 
            background-color: #f1f5f9; 
            font-weight: 600;
            color: #374151;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 회의록</h1>
        <p>생성 일시: ${currentDate}</p>
    </div>
    
    <div class="meeting-info">
        <h2>📅 회의 기본 정보</h2>
        <table>
            <tr>
                <th>구분</th>
                <th>내용</th>
            </tr>
            <tr>
                <td>📅 날짜</td>
                <td>${meetingInfo.date || ''}</td>
            </tr>
            <tr>
                <td>⏰ 시간</td>
                <td>${meetingInfo.time || ''}</td>
            </tr>
            <tr>
                <td>📍 장소</td>
                <td>${meetingInfo.location || ''}</td>
            </tr>
            <tr>
                <td>👥 참석자</td>
                <td>${meetingInfo.participants || analysisResults.speakers?.map(s => s.name).join(', ') || ''}</td>
            </tr>
            <tr>
                <td>🎯 목적/목표</td>
                <td>${meetingInfo.purpose || ''}</td>
            </tr>
            <tr>
                <td>📋 주제</td>
                <td>${meetingInfo.topic || ''}</td>
            </tr>
        </table>
    </div>
    
    <div class="section">
        <h3>📝 회의 내용</h3>
        <div class="section-content">
            <p>${analysisResults.extractedText ? generateMeetingSummary(analysisResults.extractedText, analysisResults.filename || '').replace(/\n/g, '<br>') : '회의 내용을 분석할 수 없습니다.'}</p>
        </div>
    </div>
</body>
</html>`;
}
