import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
// SvelteKit Node 어댑터 핸들러 (prod에서 CSR/SSR 라우팅 담당)
// SvelteKit handler 사용은 제거. 정적 결과를 직접 서빙.
// S3 관련 import 제거

// 환경변수 로드
dotenv.config();

// 공통 직함 목록
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

// 현재 작업 디렉토리 설정 (ES 모듈에서 __dirname 대체)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 업로드 폴더 생성
const uploadsDir = path.join(__dirname, 'uploads');

// Ollama API 설정
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';
const USE_OLLAMA = process.env.USE_OLLAMA !== 'false'; // 'false'면 Ollama 우회

// OpenAI Whisper API 설정
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_WHISPER_MODEL = 'whisper-1';

// 서버 시작 시 uploads 폴더 생성
function ensureUploadsDirectory() {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('uploads 폴더가 생성되었습니다:', uploadsDir);
    } else {
      console.log('uploads 폴더가 이미 존재합니다:', uploadsDir);
    }
  } catch (error) {
    console.error('uploads 폴더 생성 실패:', error);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 정적 파일 서빙
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// SvelteKit 빌드된 정적 파일 서빙 (프로덕션 환경)
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '..', '.svelte-kit/output/client');
  app.use(express.static(buildPath));

  // SPA 라우팅을 위한 fallback - 실제 빌드 파일명 사용(상대경로)
  app.get('*', (req, res) => {
    try {
      const entryPath = path.join(buildPath, '_app/immutable/entry');
      const assetsPath = path.join(buildPath, '_app/immutable/assets');

      const entryFiles = fs.readdirSync(entryPath);
      const startFile = entryFiles.find((f) => f.startsWith('start.') && f.endsWith('.js'));
      const appFile = entryFiles.find((f) => f.startsWith('app.') && f.endsWith('.js'));

      const assetFiles = fs.readdirSync(assetsPath);
      const cssFiles = assetFiles.filter((f) => f.endsWith('.css'));

      const cssLinks = cssFiles
        .map((css) => `<link rel="stylesheet" href="_app/immutable/assets/${css}">`)
        .join('\n  ');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="favicon.ico" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RAG 기반 회의 분석 시스템</title>
  ${startFile ? `<link rel=\"modulepreload\" href=\"_app/immutable/entry/${startFile}\">` : ''}
  ${appFile ? `<link rel=\"modulepreload\" href=\"_app/immutable/entry/${appFile}\">` : ''}
  ${cssLinks}
</head>
<body>
  <div id="app"></div>
  ${startFile ? `<script type=\"module\" data-sveltekit-hydrate=\"1\" src=\"_app/immutable/entry/${startFile}\"></script>` : ''}
</body>
</html>`;
      res.send(html);
    } catch (e) {
      res.status(500).send('App bootstrap error');
    }
  });
}

// 파일 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const originalName = decodeURIComponent(escape(file.originalname));
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(originalName)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB 제한
  fileFilter: (req, file, cb) => {
    // 한글 파일명 디코딩
    const originalName = decodeURIComponent(escape(file.originalname));
    
    // 허용된 파일 확장자
    const allowedExtensions = /\.(jpeg|jpg|png|gif|mp4|avi|mov|mp3|wav|txt|pdf|doc|docx)$/i;
    const extname = allowedExtensions.test(path.extname(originalName));
    
    // 허용된 MIME 타입
    const allowedMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'video/mp4', 'video/avi', 'video/quicktime',
      'audio/mpeg', 'audio/mp3', 'audio/wav',
      'text/plain',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream' // curl 등에서 파일 타입을 제대로 감지하지 못할 때
    ];
    
    const mimetype = allowedMimeTypes.includes(file.mimetype);
    
    // 디버깅 로그 추가
    console.log(`파일 필터 체크: ${originalName}`);
    console.log(`  - MIME 타입: ${file.mimetype}`);
    console.log(`  - 확장자: ${path.extname(originalName)}`);
    console.log(`  - 확장자 체크: ${extname}`);
    console.log(`  - MIME 체크: ${mimetype}`);
    
    if (extname && mimetype) {
      console.log(`파일 허용: ${originalName}`);
      return cb(null, true);
    } else {
      console.log(`파일 거부됨: ${originalName}, MIME: ${file.mimetype}, 확장자: ${path.extname(originalName)}`);
      cb(new Error('지원하지 않는 파일 형식입니다.'));
    }
  }
});

// 메모리 기반 데이터 저장 (파일로 영속화)
/** @type {Array<any>} */
let analysisHistory = [];
/** @type {any} */
let learnedData = {
  totalMeetings: 0,
  commonKeywords: [],
  speakerPatterns: [],
  sentimentTrends: [],
  futurePredictions: []
};

// 데이터 파일 경로
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'analysis_history.json');
const LEARNED_DATA_FILE = path.join(DATA_DIR, 'learned_data.json');

// 데이터 디렉토리 생성
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 저장된 데이터 로드 함수 + uploads와 정합성 검증
async function loadSavedData() {
  try {
    // 분석 히스토리 로드
    if (fs.existsSync(HISTORY_FILE)) {
      const historyData = fs.readFileSync(HISTORY_FILE, 'utf-8');
      analysisHistory = JSON.parse(historyData);
      // 히스토리 10건 제한 유지
      if (analysisHistory.length > 10) {
        analysisHistory = analysisHistory.slice(0, 10);
      }
      console.log(`저장된 분석 히스토리 ${analysisHistory.length}개 로드됨`);
    }
    
    // 학습 데이터 로드
    if (fs.existsSync(LEARNED_DATA_FILE)) {
      const learnedDataContent = fs.readFileSync(LEARNED_DATA_FILE, 'utf-8');
      learnedData = JSON.parse(learnedDataContent);
      console.log('저장된 학습 데이터 로드됨');
    }

    // 파일과 정합성: 존재하지 않는 파일을 참조하는 히스토리 제거
    const before = analysisHistory.length;
    const validHistory = [];
    
    for (const h of analysisHistory) {
      try {
        if (!h.files || !Array.isArray(h.files) || h.files.length === 0) continue;
        
        // 로컬 파일 시스템에서 파일 존재 확인
        let allFilesExist = true;
        for (const f of h.files) {
          const filePath = path.join(__dirname, 'uploads', f.serverFilename || f.name);
          if (!fs.existsSync(filePath)) {
            allFilesExist = false;
            break;
          }
        }
        
        if (allFilesExist) {
          validHistory.push(h);
        }
      } catch { continue; }
    }
    
    analysisHistory = validHistory;
    if (before !== analysisHistory.length) {
      console.log(`파일 정합성 정리: ${before - analysisHistory.length}개 히스토리 제거`);
    }
    
    // uploads 폴더에 파일이 없으면 히스토리 초기화
    const uploadsFiles = fs.readdirSync(uploadsDir);
    if (uploadsFiles.length === 0 && analysisHistory.length > 0) {
      analysisHistory = [];
      console.log('uploads 폴더 비어있음: 히스토리 초기화');
    }

    // learnedData 재계산 및 영속화
    recomputeLearnedData();
    persistData();
  } catch (error) {
    console.error('저장된 데이터 로드 중 오류:', error);
    // 오류 발생 시 기본값 사용
    analysisHistory = [];
    learnedData = {
      totalMeetings: 0,
      commonKeywords: [],
      speakerPatterns: [],
      sentimentTrends: [],
      futurePredictions: []
    };
  }
}

// 데이터 저장 함수
function persistData() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(analysisHistory, null, 2));
    fs.writeFileSync(LEARNED_DATA_FILE, JSON.stringify(learnedData, null, 2));
  } catch (e) {
    console.error('데이터 저장 실패:', e);
  }
}

// 서버 시작 시 저장된 데이터 로드
loadSavedData().catch(err => console.error('데이터 로드 실패:', err));

// 학습데이터 재계산 함수 (uploads 기반 히스토리로부터)
function recomputeLearnedData() {
  const INVALID_NAME_TOKENS = [];
  const ROLE_REGEX = new RegExp(`(${ROLE_TITLES.join('|')})$`);
  const totals = { totalMeetings: analysisHistory.length };
  const keywords = new Map();
  const speakerMap = new Map();
  const sentimentTrends = []
  
  for (const h of analysisHistory) {
    const ar = h.analysisResults || h;
    if (ar?.keywords) {
      for (const k of ar.keywords) {
        const key = k.word || k;
        keywords.set(key, (keywords.get(key) || 0) + (k.count || 1));
      }
    }
    if (ar?.speakers) {
      for (const s of ar.speakers) {
        const nameRaw = s.name || String(s);
        const nameStr = String(nameRaw).trim();
        // 금지어 포함 제외
        if (INVALID_NAME_TOKENS.some(t => nameStr.includes(t))) continue;
        // 직함으로 끝나지 않으면 제외 (ROLE_TITLES 기준)
        const roleMatch = nameStr.match(ROLE_REGEX);
        if (!roleMatch) continue;
        const role = roleMatch[1];
        // 직함 앞에 실제 한글 이름(2자 이상)이 존재하는지 확인
        const nameBeforeRole = nameStr.slice(0, nameStr.length - role.length).trim();
        if (!/[가-힣]{2,}/.test(nameBeforeRole)) continue;
        const prev = speakerMap.get(nameStr) || { name: nameStr, frequency: 0, role };
        prev.frequency = Math.max(prev.frequency, s.percentage || s.count || 0);
        prev.role = role;
        speakerMap.set(nameStr, prev);
      }
    }
    if (ar?.sentiment) {
      sentimentTrends.push({
        date: h.date || new Date().toISOString(),
        positive: ar.sentiment.positive || 0,
        negative: ar.sentiment.negative || 0,
        neutral: ar.sentiment.neutral || 0
      });
    }
  }

  learnedData.totalMeetings = totals.totalMeetings;
  learnedData.commonKeywords = Array.from(keywords.entries())
    .sort((a,b)=>b[1]-a[1])
    .slice(0,50)
    .map(([word,count])=>({ word, count }));
  // 표시 우선: 일단 수집된 화자 패턴을 그대로 노출 (필요 시 프런트에서 2차 필터)
  learnedData.speakerPatterns = Array.from(speakerMap.values());
  learnedData.sentimentTrends = sentimentTrends;
  generateFuturePredictions();
}

// Ollama API 호출 함수
/**
 * @param {string} prompt - AI에게 전달할 프롬프트
 * @param {string} systemPrompt - 시스템 프롬프트 (기본값: '')
 * @returns {Promise<string>} AI 응답 텍스트
 */
async function callOllama(prompt, systemPrompt = '') {
  try {
    // Ollama 서버 연결 확인 (짧은 타임아웃 적용)
    const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 1500);
    const healthController = new AbortController();
    const healthTimeoutId = setTimeout(() => healthController.abort(), OLLAMA_TIMEOUT_MS);
    const healthCheck = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      signal: healthController.signal
    }).catch(() => null);
    clearTimeout(healthTimeoutId);

    if (!healthCheck || !healthCheck.ok) {
      console.warn('Ollama 서버에 연결할 수 없습니다. 기본 분석을 사용합니다.');
      throw new Error('Ollama 서버 연결 실패');
    }

    // 타임아웃 설정 (Ollama 분석용으로 5분으로 증가)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: systemPrompt + '\n\n' + prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 2000
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama API 오류: ${response.status}`);
    }

    const result = await response.json();
    return result.response;
  } catch (error) {
    console.error('Ollama API 호출 오류:', error);
    throw error;
  }
}

// 회의 분석 함수
/**
 * @param {string} text - 분석할 회의 텍스트
 * @returns {Promise<any>} 분석 결과 객체
 */
async function analyzeMeeting(text) {
  try {
    if (!USE_OLLAMA) {
      console.log('USE_OLLAMA=false: Ollama 호출 우회, 기본 분석 사용');
      return fallbackAnalysis(text);
    }
    
    // 화자명 유효성 검사 함수 (직함이 있는 화자명만 허용)
    const isValidRoleName = (name) => {
      if (!name) return false;
      const nameStr = String(name).trim();
      
      // 직함이 있는 경우만 허용
      const roleRegex = new RegExp(`(${ROLE_TITLES.join('|')})$`);
      const m = nameStr.match(roleRegex);
      if (!m) return false;
      const role = m[1];
      const before = nameStr.slice(0, nameStr.length - role.length).trim();
      return /[가-힣]{1,}/.test(before);
    };
    // AI 분석 프롬프트
    const analysisPrompt = `다음 회의 내용을 분석하고 완전한 JSON 형식으로만 응답하세요. 모든 필드를 포함해야 합니다.

회의 내용:
${text}

반드시 다음 형식의 완전한 JSON으로 응답하세요:
{
  "summary": "회의 요약 (100자 이내)",
  "speakers": [{"name": "화자명", "count": 발언횟수, "percentage": 발언비중}],
  "keywords": [{"word": "키워드", "count": 발생횟수, "weight": 중요도}],
  "sentiment": {"positive": 긍정비율, "negative": 부정비율, "neutral": 중립비율},
  "keyPoints": ["주요포인트1", "주요포인트2", "주요포인트3"]
}

중요한 규칙:
1. 반드시 모든 필드(summary, speakers, keywords, sentiment, keyPoints)를 포함하세요
2. 화자가 없으면 speakers는 빈 배열 []로 설정
3. 화자가 있으면 실제 텍스트에서 찾은 화자만 포함
4. sentiment는 0-1 사이의 숫자로 설정 (예: 0.7, 0.2, 0.1)
5. JSON 외의 다른 텍스트는 절대 포함하지 마세요
6. 하나의 완전한 JSON 객체만 응답하세요`;

    const aiResponse = await callOllama(analysisPrompt);
    console.log('AI 응답 원본:', aiResponse);
    
    // JSON 파싱 시도
    try {
      // AI 응답에서 첫 번째 JSON 객체만 추출
      let jsonText = aiResponse;
      
      // 첫 번째 JSON 객체의 시작과 끝을 찾아서 추출
      const jsonStart = jsonText.indexOf('{');
      if (jsonStart === -1) {
        throw new Error('JSON 시작을 찾을 수 없습니다');
      }
      
      // 중괄호 카운팅으로 첫 번째 JSON 객체의 끝 찾기
      let braceCount = 0;
      let jsonEnd = -1;
      for (let i = jsonStart; i < jsonText.length; i++) {
        if (jsonText[i] === '{') braceCount++;
        if (jsonText[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
      
      if (jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd);
        console.log('추출된 JSON:', jsonText);
      } else {
        throw new Error('JSON 끝을 찾을 수 없습니다');
      }
      
      const parsedResponse = JSON.parse(jsonText);
      console.log('파싱된 응답:', parsedResponse);
      
      // 화자 필터링: 직함이 있는 화자만 유지
      if (parsedResponse.speakers && Array.isArray(parsedResponse.speakers)) {
        parsedResponse.speakers = parsedResponse.speakers.filter(speaker => {
          const name = speaker.name || String(speaker);
          return isValidRoleName(name);
        });
      }
      
      // keyPoints가 객체인 경우 배열로 변환
      if (parsedResponse.keyPoints && !Array.isArray(parsedResponse.keyPoints)) {
        if (typeof parsedResponse.keyPoints === 'object') {
          parsedResponse.keyPoints = Object.values(parsedResponse.keyPoints);
        } else {
          parsedResponse.keyPoints = [String(parsedResponse.keyPoints)];
        }
      }
      
      return parsedResponse;
    } catch (parseError) {
      // JSON 파싱 실패 시 기본 분석
      console.log('AI 응답 JSON 파싱 실패, 기본 분석 사용:', aiResponse);
      console.log('파싱 오류:', parseError.message);
      return fallbackAnalysis(text);
    }
  } catch (error) {
    console.error('AI 분석 오류:', error);
    return fallbackAnalysis(text);
  }
}

// Whisper API를 사용하여 음성 파일을 텍스트로 변환
/**
 * @param {string} filePath - 음성 파일 경로
 * @returns {Promise<string>} 변환된 텍스트
 */
async function transcribeAudioWithWhisper(filePath) {
  try {
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    // 파일을 FormData로 준비
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const fileBlob = new Blob([fileBuffer]);
    formData.append('file', fileBlob, path.basename(filePath));
    formData.append('model', OPENAI_WHISPER_MODEL);
    formData.append('language', 'ko'); // 한국어 우선, 자동 감지도 가능

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Whisper API 오류: ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json();
    return result.text;
  } catch (error) {
    console.error('Whisper API 호출 오류:', error);
    throw error;
  }
}

// 기본 분석 함수 (AI 실패 시 사용)
/**
 * @param {string} text - 분석할 텍스트
 * @returns {any} 기본 분석 결과 객체
 */
function fallbackAnalysis(text) {
  const wordCount = text.split(/\s+/).length;
  const hasPositiveWords = /좋|성공|성장|향상|긍정|우수|완료|완성/.test(text);
  const hasNegativeWords = /문제|실패|어려움|부정|실패|지연|취소/.test(text);
  
  // 화자명 유효성 검사 함수 (직함이 있는 화자명만 허용)
  const isValidRoleName = (name) => {
    if (!name) return false;
    const nameStr = String(name).trim();
    
    // 직함이 있는 경우만 허용
    const roleRegex = new RegExp(`(${ROLE_TITLES.join('|')})$`);
    const m = nameStr.match(roleRegex);
    if (!m) return false;
    const role = m[1];
    const before = nameStr.slice(0, nameStr.length - role.length).trim();
    return /[가-힣]{1,}/.test(before);
  };
  
  // 화자 추출 - 엄격한 패턴으로 찾기
  let speakers = [];
  
  // 방법 1: "이름:" 패턴으로 찾기 (가장 신뢰할 수 있는 패턴)
  const namePattern1 = text.match(/([가-힣]{2,4}):/g) || [];
  const names1 = namePattern1.map(s => s.replace(':', ''));
  
  // 방법 2: "이름 (직급)" 패턴으로 찾기
  const namePattern2 = text.match(/([가-힣]{2,4})\s*\(([가-힣]+)\)/g) || [];
  const names2 = namePattern2.map(s => {
    const match = s.match(/([가-힣]{2,4})\s*\(([가-힣]+)\)/);
    if (match && validRoles.includes(match[2])) {
      return match[1];
    }
    return null;
  }).filter(Boolean);
  
  // 방법 3: "직급 이름" 패턴으로 찾기
  const validRoles = ["대표", "부장", "사장", "부사장", "전무", "상무", "이사", "이사장", "회장", "사장대행", "고문", "자문", "본부장", "센터장", "그룹장", "실장", "팀장", "파트장", "지점장", "소장", "과장", "차장", "대리", "주임", "사원", "수석", "책임", "선임", "전임", "연구원", "주임연구원", "선임연구원", "책임연구원", "수석연구원", "박사", "석사", "학사", "전문위원", "전문가", "컨설턴트", "PM", "PO", "PL", "QA", "QC", "개발자", "엔지니어", "디자이너", "기획자", "분석가", "데이터사이언티스트", "데이터엔지니어", "ML엔지니어", "리서처", "마케터", "세일즈", "영업", "CS", "고객지원", "운영", "매니저", "코치", "트레이너", "강사", "교수", "교사", "회계사", "변호사", "변리사", "세무사", "노무사", "감사", "내부감사", "재무담당", "인사담당", "총무담당", "법무담당", "PR담당", "IR담당", "브랜드매니저", "프로덕트오너", "프로덕트매니저", "프로젝트매니저", "UX리서처", "UX디자이너", "UI디자이너", "백엔드", "프론트엔드", "풀스택", "클라우드아키텍트", "아키텍트", "SRE", "보안담당", "CISO", "CFO", "CTO", "COO", "CEO", "대표이사", "총괄", "책임자", "실무자", "담당자", "주관", "주최", "발표자", "발언자", "사회자", "진행자", "인턴", "수습", "신입", "주니어", "시니어", "리드", "헤드", "디렉터", "VP"];
  const namePattern3 = text.match(/([가-힣]+)\s+([가-힣]{2,4})/g) || [];
  const names3 = namePattern3.map(s => {
    const parts = s.split(/\s+/);
    if (parts.length === 2 && validRoles.includes(parts[0])) {
      return parts[1];
    }
    return null;
  }).filter(Boolean);
  
  // 모든 방법으로 찾은 이름들을 합치고 중복 제거
  const allNames = [...names1, ...names2, ...names3];
  
  // 화자 필터링 - 엄격한 조건 적용
  speakers = Array.from(new Set(allNames)).filter(name => isValidRoleName(name));
  
  // 키워드 추출 (200개 이상 비즈니스 키워드)
  const commonWords = [
    // 기본 비즈니스 용어
    '회의', '프로젝트', '시장', '분석', '계획', '고객', '개발', '마케팅', '제품', '서비스',
    '매출', '수익', '비용', '예산', '투자', '자금', '재무', '인사', '채용', '교육',
    '훈련', '성과', '목표', '전략', '전술', '운영', '관리', '품질', '보안', '인프라',
    '시스템', '플랫폼', '솔루션', '아키텍처', '데이터', '정보', '지식', '혁신', '창의성', '효율성',
    '생산성', '협업', '소통', '리더십', '팀워크', '문화', '가치', '미션', '비전', '성장',
    '확장', '글로벌', '국제', '지역', '산업', '섹터', '경쟁', '협력', '파트너십', '네트워크',
    '커뮤니티', '스테이크홀더', '주주', '이해관계자', '고객만족', '고객경험', '브랜드', '이미지', '평판', '신뢰',
    '윤리', '지속가능성', '환경', '사회', '거버넌스', 'ESG', '리스크', '위험', '보험', '법무',
    '규정', '정책', '절차', '표준', '가이드라인', '체크리스트', '템플릿', '프로세스', '워크플로우', '자동화',
    '디지털화', '전자화', '온라인', '오프라인', '하이브리드', '원격', '재택', '사무실', '공간', '환경',
    '설비', '장비', '도구', '소프트웨어', '하드웨어', '클라우드', '서버', '데이터베이스', 'API', '인터페이스',
    '사용자', '관리자', '개발자', '테스터', '디자이너', '기획자', '분석가', '컨설턴트', '전문가', '전문직',
    '일반직', '계약직', '정규직', '비정규직', '아르바이트', '인턴', '신입', '경력', '시니어', '주니어',
    '수습', '수습기간', '평가', '성과평가', '인사고과', '승진', '승급', '보상', '급여', '연봉',
    '상여금', '성과급', '스톡옵션', '주식', '지분', '소유권', '경영권', '의결권', '참여권', '감시권',
    '감사', '회계', '세무', '법인세', '부가가치세', '소득세', '법인세', '소득세', '부가가치세', '법인세',
    '재무제표', '손익계산서', '재무상태표', '현금흐름표', '자본변동표', '재무비율', '수익성', '안정성', '성장성', '효율성',
    '유동비율', '부채비율', 'ROE', 'ROA', 'ROI', 'EPS', 'PER', 'PBR', 'EV/EBITDA', '현금흐름',
    '운전자본', '자본금', '자본잉여금', '이익잉여금', '자본조정', '자본거래', '자본변동', '자본구조', '자본조달', '자본배분',
    '배당', '배당률', '배당정책', '배당성향', '배당수익률', '배당성장률', '배당안정성', '배당지속성', '배당가능성', '배당의지',
    '기업가치', '주가', '주식가격', '시가총액', '기업가치평가', 'DCF', '할인율', '성장률', '영구가치', '잔존가치',
    'M&A', '합병', '인수', '매각', '분할', '분사', '지주회사', '자회사', '관계회사', '계열사',
    '전략적제휴', '기술제휴', '마케팅제휴', '유통제휴', '생산제휴', '연구개발제휴', '라이센싱', '프랜차이징', '대리점', '직영점',
    '온라인쇼핑몰', '오프라인매장', '멀티채널', '옴니채널', '크로스채널', '통합마케팅', '디지털마케팅', '소셜마케팅', '콘텐츠마케팅', '바이럴마케팅',
    '인플루언서', 'KOL', '키오스크', '자동판매기', 'POS', '결제시스템', '전자결제', '모바일결제', 'QR결제', '바이오인증',
    '블록체인', '암호화폐', '가상화폐', '디지털자산', 'NFT', '메타버스', 'AI', '머신러닝', '딥러닝', '빅데이터',
    '데이터마이닝', '데이터분석', '통계', '예측', '모델링', '시뮬레이션', '최적화', '알고리즘', '코딩', '프로그래밍',
    '테스트', '디버깅', '배포', '운영', '모니터링', '로깅', '백업', '복구', '보안', '암호화',
    '인증', '권한', '접근제어', '방화벽', '백신', '백도어', '해킹', '피싱', '랜섬웨어', '스팸',
    '개인정보', '데이터보호', 'GDPR', '개인정보보호법', '정보통신망법', '전자상거래법', '소비자보호법', '공정거래법', '독점규제법', '부정경쟁방지법'
  ];
  const keywords = commonWords.map(word => {
    const count = (text.match(new RegExp(word, 'g')) || []).length;
    return { word, count, weight: count * 10 };
  }).filter(k => k.count > 0).sort((a, b) => b.count - a.count);
  
  // 최종 화자 필터링: isValidRoleName 함수 사용
  const validSpeakers = speakers.filter(speaker => isValidRoleName(speaker));
  
  return {
    summary: validSpeakers.length > 0 
      ? `기본 분석: ${wordCount}단어, ${validSpeakers.length}명의 참석자가 확인되었습니다.`
      : `기본 분석: ${wordCount}단어, 참석자 정보가 확인되지 않았습니다.`,
    speakers: validSpeakers.length > 0 ? validSpeakers.map((speaker) => {
      const count = (text.match(new RegExp(speaker, 'g')) || []).length;
      const totalMentions = validSpeakers.reduce((sum, s) => sum + (text.match(new RegExp(s, 'g')) || []).length, 0);
      const percentage = totalMentions > 0 ? Math.round((count / totalMentions) * 100) : 0;
      
      return {
        name: speaker,
        count: count,
        percentage: percentage
      };
    }).sort((a, b) => b.count - a.count) : [],
    keywords: keywords.slice(0, 8),
    sentiment: {
      positive: hasPositiveWords ? 60 : 30,
      negative: hasNegativeWords ? 25 : 15,
      neutral: 100 - (hasPositiveWords ? 60 : 30) - (hasNegativeWords ? 25 : 15)
    },
    keyPoints: speakers.length > 0 ? [
      `총 ${wordCount}단어 추출`,
      `${speakers.length}명의 참석자 확인`,
      '기본 키워드 분석 완료',
      '기본 감성 분석 완료'
    ] : [
      `총 ${wordCount}단어 추출`,
      '참석자 정보 없음',
      '기본 키워드 분석 완료',
      '기본 감성 분석 완료'
    ]
  };
}

// API 라우트

// 1. 서버 상태 확인
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      ragServer: true,
      analysisEngine: true,
      ollama: true
    },
    ollama: {
      host: OLLAMA_HOST,
      model: OLLAMA_MODEL
    }
  });
});

// 2. 파일 업로드 및 분석
app.post('/api/analyze', upload.array('files', 10), async (req, res) => {
  const uploadedFiles = [];
  
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '업로드된 파일이 없습니다.' });
    }

    const analysisId = uuidv4();
    const analysisDate = new Date().toISOString();
    
    // 파일 정보 수집
    /** @type {Array<any>} */
    const files = /** @type {Array<any>} */ (req.files).map(/** @param {any} file */ file => ({
      name: decodeURIComponent(escape(file.originalname)),
      size: file.size,
      type: file.mimetype,
      path: path.join(uploadsDir, file.filename)
    }));

    uploadedFiles.push(...files);

    // 텍스트 추출 (Whisper API 사용)
    let extractedTexts = [];
    for (const file of /** @type {Array<any>} */ (req.files)) {
      try {
        const originalName = decodeURIComponent(escape(file.originalname));
        if (file.mimetype.startsWith('text/') || originalName.endsWith('.txt')) {
          // 텍스트 파일
          const content = fs.readFileSync(path.join(uploadsDir, file.filename), 'utf-8');
          extractedTexts.push(content);
        } else if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/') || 
                   originalName.match(/\.(mp3|wav|mp4|avi|mov)$/i)) {
          // 음성/영상 파일 - 항상 동기 처리로 전사 완료 후 분석
          // 동기 처리 모드: Whisper로 즉시 전사
          try {
            if (!OPENAI_API_KEY) {
              console.log(`📊 파일 정보: ${originalName}, ${(file.size / 1024 / 1024).toFixed(2)} MB, ${file.mimetype}`);
              console.log(`⚠️ 음성 인식 실패: OpenAI API 키가 설정되지 않았습니다`);
              continue;
            }
            const transcribedText = await transcribeAudioWithWhisper(path.join(uploadsDir, file.filename));
            console.log(`📊 파일 정보: ${originalName}, ${(file.size / 1024 / 1024).toFixed(2)} MB, ${file.mimetype}`);
            console.log(`✅ 음성 인식 성공: ${transcribedText.length}자, ${transcribedText.split(/\s+/).length}개 단어`);
            console.log(`🔍 인식된 내용:\n${transcribedText}`);
            extractedTexts.push(transcribedText);
          } catch (whisperError) {
            console.error(`Whisper API 오류 (${originalName}):`, whisperError);
            let errorMessage = '';
            if (whisperError.message.includes('API 키')) {
              errorMessage = 'OpenAI API 키가 설정되지 않았습니다.';
            } else if (whisperError.message.includes('rate limit')) {
              errorMessage = 'API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요.';
            } else if (whisperError.message.includes('quota')) {
              errorMessage = 'API 크레딧이 부족합니다. OpenAI 계정에서 크레딧을 확인해주세요.';
            } else {
              errorMessage = `음성 인식 실패: ${whisperError.message}`;
            }
            console.log(`📊 파일 정보: ${originalName}, ${(file.size / 1024 / 1024).toFixed(2)} MB, ${file.mimetype}`);
            console.log(`⚠️ 음성 인식 실패: ${errorMessage}`);
            console.log(`🔍 오류 상세: ${whisperError.message}`);
            extractedTexts.push(`음성 인식 실패: ${errorMessage}`);
          }
        } else {
          // 기타 파일
          extractedTexts.push(`[${originalName} - 지원하지 않는 파일 형식입니다.]`);
        }
      } catch (fileError) {
        const originalName = decodeURIComponent(escape(file.originalname));
        console.error(`파일 처리 오류 (${originalName}):`, fileError);
        extractedTexts.push(`[파일 처리 실패: ${originalName}]`);
      }
    }

    // 미디어 즉시응답 모드에서는 전사를 백그라운드로 처리하므로 비어 있어도 허용
    if (extractedTexts.length === 0 && !files.some(f => f.type?.startsWith('audio/') || f.type?.startsWith('video/'))) {
      throw new Error('텍스트를 추출할 수 있는 파일이 없습니다.');
    }

    // 미디어 파일도 동기 처리로 완료되었으므로 일반 분석 경로로 진행

    // AI 분석 수행 (일반 경로)
    const allText = extractedTexts.join('\n\n');
    console.time('analyze_llm');
    const analysisResults = await analyzeMeeting(allText);
    console.timeEnd('analyze_llm');

    // 먼저 응답을 반환하여 프론트엔드 대기 시간을 줄임
    res.json({
      success: true,
      analysisId: analysisId,
      results: analysisResults,
      message: '분석이 완료되었습니다.'
    });

    // 파일은 로컬 uploads 폴더에 유지

    // 히스토리에 저장 (uploads 파일 기반)
    try {
      const item = {
        id: analysisId,
        date: analysisDate,
        files: files.map(f => ({ name: f.name, size: f.size, type: f.type, serverFilename: path.basename(f.path) })),
        extractedTexts,
        analysisResults
      };
      analysisHistory.unshift(item);
      // 10건 제한: 초과분 제거
      if (analysisHistory.length > 10) {
        analysisHistory = analysisHistory.slice(0, 10);
      }
      // 최신 learnedData 반영 후 저장
      recomputeLearnedData();
      // 영속화
      persistData();
    } catch (persistError) {
      console.error('히스토리 저장 실패:', persistError);
    }
  } catch (error) {
    console.error('분석 오류:', error);
    
    // 오류 발생 시 업로드된 파일 정리
    uploadedFiles.forEach(file => {
      try {
        const filePath = path.join(uploadsDir, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (deleteError) {
        console.error('오류 후 파일 정리 실패:', deleteError);
      }
    });
    
    res.status(500).json({ 
      error: '분석 중 오류가 발생했습니다.',
      details: /** @type {Error} */ (error).message 
    });
  }
});

// 3. 분석 히스토리 조회 (저장된 히스토리에서, 단 파일이 존재하는 항목만)
app.get('/api/history', async (req, res) => {
  try {
    let filtered = [];
    
    // 로컬 환경: uploads 폴더 파일 존재 여부로 필터링
    const uploadPath = path.join(__dirname, 'uploads');
    const fileSet = fs.existsSync(uploadPath) ? new Set(fs.readdirSync(uploadPath)) : new Set();
    filtered = analysisHistory.filter(h => h.files?.every(f => f.serverFilename ? fileSet.has(f.serverFilename) : fileSet.has(f.name)));
    
    res.json({ success: true, data: filtered, total: filtered.length });
  } catch (error) {
    res.status(500).json({ error: '히스토리 조회 중 오류가 발생했습니다.' });
  }
});

// 4. 학습된 데이터 조회 (uploads 유효 히스토리 기반)
app.get('/api/learned-data', (req, res) => {
  try {
    // 현재 uploads에 존재하는 파일을 기준으로 유효 히스토리 산출
    const uploadPath = path.join(__dirname, 'uploads');
    const fileSet = fs.existsSync(uploadPath) ? new Set(fs.readdirSync(uploadPath)) : new Set();
    const validHistory = (analysisHistory || []).filter(h => {
      try {
        if (!h.files || !Array.isArray(h.files) || h.files.length === 0) return false;
        return h.files.every(f => f.serverFilename ? fileSet.has(f.serverFilename) : fileSet.has(f.name));
      } catch { return false; }
    });

    // 키워드 집계
    const keywordCounts = new Map();
    for (const h of validHistory) {
      const ar = h.analysisResults || h;
      if (ar?.keywords) {
        for (const k of ar.keywords) {
          const key = k.word || k;
          keywordCounts.set(key, (keywordCounts.get(key) || 0) + (k.count || 1));
        }
      }
    }
    const commonKeywordsList = Array.from(keywordCounts.entries())
      .sort((a,b)=>b[1]-a[1])
      .slice(0,50)
      .map(([word]) => word)
      .filter(Boolean);

    // 화자 패턴 집계 (표시 우선, 직함 강제 필터링 없이 노출)
    const spMap = new Map();
    const inferRole = (name = '') => {
      const n = String(name).toLowerCase();
      if (/(대표|사장|회장|이사장|ceo)/.test(n)) return '최고경영진';
      if (/(이사|상무|전무|부사장)/.test(n)) return '이사급';
      if (/(부장|본부장|그룹장|센터장|실장|팀장)/.test(n)) return '고급관리자';
      if (/(과장|수석|책임|선임|주임)/.test(n)) return '중간관리자';
      if (/(대리|사원)/.test(n)) return '주요업무자';
      if (/(고객|파트너|협력사|컨설턴트|변호사|회계사)/.test(n)) return '외부참석자';
      if (/(학생|인턴|수습|신입)/.test(n)) return '신입/인턴';
      return '팀원';
    };
    // 직함이 있는 화자만 필터링하는 함수
    const isValidRoleName = (name) => {
      if (!name) return false;
      const nameStr = String(name).trim();
      const roleRegex = new RegExp(`(${ROLE_TITLES.join('|')})$`);
      const m = nameStr.match(roleRegex);
      if (!m) return false;
      const role = m[1];
      const before = nameStr.slice(0, nameStr.length - role.length).trim();
      return /[가-힣]{1,}/.test(before);
    };

    for (const h of validHistory) {
      const ar = h.analysisResults || h;
      if (ar?.speakers) {
        for (const s of ar.speakers) {
          const name = s.name || String(s);
          // 직함이 있는 화자만 추가
          if (isValidRoleName(name)) {
            const prev = spMap.get(name) || { name, role: inferRole(name), frequency: 0 };
            prev.frequency = Math.max(prev.frequency, s.percentage || s.count || 0);
            spMap.set(name, prev);
          }
        }
      }
    }
    const speakerPatterns = Array.from(spMap.values());

    // 미래 예측은 기존 로직을 사용하기 위해 learnedData에 반영 후 생성
    learnedData.totalMeetings = validHistory.length;
    learnedData.commonKeywords = commonKeywordsList.map(w => ({ word: w, count: 1 }));
    learnedData.speakerPatterns = speakerPatterns;
    learnedData.sentimentTrends = (validHistory || []).map(h => ({
      date: h.date,
      positive: (h.analysisResults?.sentiment?.positive) || 0,
      negative: (h.analysisResults?.sentiment?.negative) || 0,
      neutral: (h.analysisResults?.sentiment?.neutral) || 0,
    }));
    generateFuturePredictions();

    const payload = {
      totalMeetings: Number(learnedData.totalMeetings || 0),
      commonKeywords: commonKeywordsList,
      speakerPatterns,
      futurePredictions: Array.isArray(learnedData.futurePredictions) ? learnedData.futurePredictions : []
    };

    return res.json({ success: true, data: payload });
  } catch (e) {
    return res.json({ success: true, data: { totalMeetings: 0, commonKeywords: [], speakerPatterns: [], futurePredictions: [] } });
  }
});

// 5. 특정 분석 결과 조회
app.get('/api/analysis/:id', (req, res) => {
  // 저장형 히스토리 미사용: 개별 조회는 비활성화
  return res.status(404).json({ error: '개별 분석 조회는 비활성화되었습니다.' });
});

// 6. 분석 결과 삭제
app.delete('/api/analysis/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const idx = analysisHistory.findIndex(h => h.id === id);
    if (idx === -1) {
      // 이미 정리되었거나 존재하지 않는 경우에도 성공 처리 (멱등성 보장)
      return res.json({ success: true, message: '해당 분석 결과가 이미 삭제되었거나 존재하지 않습니다.' });
    }

    // 해당 항목에 연결된 파일 삭제
    try {
      const files = analysisHistory[idx].files || [];
      
      // 로컬 환경: uploads 폴더에서 파일 삭제
      for (const f of files) {
        const candidate = f.serverFilename ? path.join(uploadsDir, f.serverFilename) : path.join(uploadsDir, f.name);
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            fs.unlinkSync(candidate);
          }
        } catch {}
      }
    } catch {}

    // 히스토리에서 제거
    analysisHistory.splice(idx, 1);

    // 정합성 재계산 및 저장
    recomputeLearnedData();
    persistData();

    return res.json({ success: true, message: '분석 결과 및 관련 파일이 삭제되었습니다.' });
  } catch (e) {
    console.error('개별 삭제 오류:', e);
    return res.status(500).json({ error: '개별 삭제 중 오류가 발생했습니다.' });
  }
});

// 7. 모든 분석 결과 삭제 (전체 초기화)
app.delete('/api/analysis', async (req, res) => {
  try {
    // 로컬 환경: uploads 폴더 내 모든 파일 삭제
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(/** @param {string} file */ file => {
        const fullPath = path.join(uploadsDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isFile()) {
            fs.unlinkSync(fullPath);
          }
        } catch {}
      });
    }
    
    // 기록 완전 초기화 (파일 비우면 데이터도 비움)
    analysisHistory = [];
    learnedData = { totalMeetings: 0, commonKeywords: [], speakerPatterns: [], sentimentTrends: [], futurePredictions: [] };
    persistData();
    
    const message = 'uploads와 데이터 기록을 모두 정리했습니다.';
    return res.json({ success: true, message });
  } catch (error) {
    console.error('파일 삭제 중 오류:', error);
    return res.status(500).json({ error: '파일 삭제 중 오류가 발생했습니다.' });
  }
});

// 수동 정합성 정리 엔드포인트 (uploads 기준으로 data 파일 갱신)
app.post('/api/reconcile', async (req, res) => {
  try {
    await loadSavedData();
    persistData();
    return res.json({ success: true, message: '정합성 정리 완료' });
  } catch (e) {
    return res.status(500).json({ success: false, error: '정합성 정리 중 오류' });
  }
});

// 파일 다운로드 엔드포인트 
app.get('/api/files/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
    
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('파일 다운로드 오류:', err);
        res.status(500).json({ error: '파일 다운로드 중 오류가 발생했습니다.' });
      }
    });
  } catch (error) {
    console.error('파일 다운로드 처리 오류:', error);
    res.status(500).json({ error: '파일 다운로드 처리 중 오류가 발생했습니다.' });
  }
});

// 학습 데이터 업데이트 제거

// 미래 예측 생성 함수
function generateFuturePredictions() {
  // 총 회의 수는 uploads 정합성 적용된 히스토리 길이를 신뢰
  const avgPositive = learnedData.sentimentTrends.reduce(/** @param {any} sum @param {any} trend */ (sum, trend) => sum + trend.positive, 0) / learnedData.sentimentTrends.length;
  
  learnedData.futurePredictions = [
    `향후 회의는 ${avgPositive > 60 ? '긍정적' : avgPositive > 40 ? '중립적' : '부정적'} 분위기로 진행될 것으로 예측됩니다.`,
    `화자별 발언 패턴 분석 결과, ${avgPositive > 60 ? '최고경영진' : avgPositive > 40 ? '고급관리자' : '중간관리자'} 역할의 참석자가 ${learnedData.speakerPatterns.find(/** @param {any} s */ s => s.role === (avgPositive > 60 ? '최고경영진' : avgPositive > 40 ? '고급관리자' : '중간관리자'))?.frequency || 0}% 비중으로 주도적인 역할을 할 것으로 예상됩니다.`,
    (() => {
      const ck = learnedData.commonKeywords;
      let first = '회의';
      if (Array.isArray(ck) && ck.length > 0) {
        const k0 = ck[0];
        first = typeof k0 === 'string' ? k0 : (k0?.word || '회의');
      }
      return `주요 키워드 "${first}"는 향후 회의에서도 핵심 주제로 다뤄질 가능성이 높습니다.`;
    })(),
    `감성 분석 트렌드를 보면, 회의 분위기가 ${avgPositive > 60 ? '긍정적으로 유지' : avgPositive > 40 ? '안정적으로 진행' : '개선이 필요한'} 추세를 보이고 있어, 향후 ${avgPositive > 60 ? '건설적인 논의가 지속' : avgPositive > 40 ? '균형잡힌 논의가 이루어질' : '건설적인 방향으로 개선될'} 것으로 예측됩니다.`
  ];
}

// 서버 시작
const server = app.listen(PORT, async () => {
  console.log(`🚀 RAG 회의 분석 서버가 http://localhost:${PORT}에서 실행 중입니다.`);
  console.log(`📊 API 엔드포인트: http://localhost:${PORT}/api`);
  console.log(`🔍 Ollama 호스트: ${OLLAMA_HOST}`);
  console.log(`🤖 AI 모델: ${OLLAMA_MODEL}`);
  ensureUploadsDirectory(); // 서버 시작 시 uploads 폴더 생성

  // Ollama 워밍업: 콜드스타트 제거 (비차단, 실패해도 무시)
  if (USE_OLLAMA) {
    try {
      const warmupPrompt = '답변 없이 OK 만 출력';
      const t0 = Date.now();
      await callOllama('OK', warmupPrompt).catch(() => {});
      console.log(`🔥 Ollama 워밍업 완료 (${Date.now() - t0}ms)`);
    } catch {}
  }
});

// 에러 핸들링
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // 서버를 안전하게 종료
  server.close(() => {
    console.log('서버가 안전하게 종료되었습니다.');
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 서버 종료 시 정리 작업
process.on('SIGTERM', () => {
  console.log('SIGTERM 신호를 받았습니다. 서버를 종료합니다...');
  server.close(() => {
    console.log('서버가 정상적으로 종료되었습니다.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT 신호를 받았습니다. 서버를 종료합니다...');
  server.close(() => {
    console.log('서버가 정상적으로 종료되었습니다.');
    process.exit(0);
  });
});
