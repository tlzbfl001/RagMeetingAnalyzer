#!/bin/bash

# AWS 배포 스크립트
echo "🚀 RAG 시스템 AWS 배포 시작..."

# .env 파일 확인
if [ ! -f "server/.env" ]; then
    echo "❌ server/.env 파일이 없습니다."
    echo "📝 server/env.example을 복사해서 .env 파일을 생성하고 설정하세요."
    exit 1
fi

# Docker 이미지 빌드
echo "📦 Docker 이미지 빌드 중..."
docker build -t rag-system .

# Docker 컨테이너 실행 (환경변수 파일 사용)
echo "🏃 Docker 컨테이너 실행 중..."
docker run -d \
  --name rag-system \
  -p 3000:3000 \
  --env-file server/.env \
  -v $(pwd)/uploads:/app/server/uploads \
  -v $(pwd)/data:/app/server/data \
  --restart unless-stopped \
  rag-system

echo "✅ 배포 완료!"
echo "🌐 서버 주소: http://your-server-ip:3000"
echo "📊 API 엔드포인트: http://your-server-ip:3000/api"
