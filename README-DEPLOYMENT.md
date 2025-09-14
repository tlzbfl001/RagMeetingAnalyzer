# AWS 배포 가이드

## 🚀 AWS EC2 배포 방법

### 1. EC2 인스턴스 생성
- Ubuntu 20.04 LTS 이상
- t3.medium 이상 (최소 2GB RAM)
- 보안 그룹에서 포트 3000 열기

### 2. 서버 설정
```bash
# 업데이트
sudo apt update && sudo apt upgrade -y

# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Node.js 설치 (선택사항)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. 코드 배포
```bash
# 코드 클론
git clone <your-repo-url>
cd rag-system

# 환경변수 설정
cp server/env.example server/.env
# server/.env 파일을 편집하여 API 키 등 설정

# 배포 실행
./deploy.sh
```

### 4. 서비스 확인
```bash
# 컨테이너 상태 확인
docker ps

# 로그 확인
docker logs rag-system

# 서비스 테스트
curl http://localhost:3000/api/health
```

## 🔧 환경변수 설정

### .env 파일 설정
```bash
# server/.env 파일 생성
cp server/env.example server/.env

# .env 파일 편집
nano server/.env
```

### 필수 환경변수
- `OPENAI_API_KEY`: OpenAI API 키 (Whisper 사용 시)

### 선택 환경변수
- `OLLAMA_HOST`: Ollama 서버 주소 (기본값: http://localhost:11434)
- `OLLAMA_MODEL`: Ollama 모델명 (기본값: llama3.2:1b)
- `USE_OLLAMA`: Ollama 사용 여부 (기본값: true)
- `PORT`: 서버 포트 (기본값: 3000)

## 📁 파일 저장소
- 업로드된 파일: `./uploads/` 폴더
- 분석 데이터: `./data/` 폴더

## 🌐 접속 방법
- 메인 페이지: `http://your-server-ip:3000`
- API 엔드포인트: `http://your-server-ip:3000/api`

## 🔄 업데이트 방법
```bash
# 코드 업데이트
git pull origin main

# 재배포
docker stop rag-system
docker rm rag-system
./deploy.sh
```

## 🛠️ 문제 해결
```bash
# 컨테이너 재시작
docker restart rag-system

# 로그 확인
docker logs -f rag-system

# 컨테이너 내부 접속
docker exec -it rag-system /bin/sh
```
