# Node.js 18 기반 이미지 사용
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./
COPY server/package*.json ./server/

# 의존성 설치
RUN npm install
RUN cd server && npm install

# 소스 코드 복사 (.env 제외)
COPY . .
RUN rm -f server/.env  # .env 파일 제거 (docker-compose에서 주입)

# 프론트엔드 빌드
RUN npm run build

# 포트 노출
EXPOSE 3000

# 서버 시작
CMD ["node", "server/server.js"]
