import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// AWS 설정
const AWS_ENV = process.env.AWS_ENV || 'local';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;

// S3 클라이언트 초기화 (배포 환경에서만 활성화)
let s3 = null;
if (AWS_ENV === 'aws' && process.env.NODE_ENV === 'production' && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
    s3 = new AWS.S3({
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        region: AWS_REGION
    });
}

/**
 * 파일을 S3에 업로드
 * @param {string} filePath - 로컬 파일 경로
 * @param {string} key - S3에 저장할 키 (파일명)
 * @returns {Promise<string>} S3 URL
 */
export async function uploadToS3(filePath, key) {
    if (AWS_ENV !== 'aws' || process.env.NODE_ENV !== 'production' || !s3) {
        // 로컬 환경에서는 로컬 파일 경로 반환
        return `http://localhost:3000/api/files/${path.basename(filePath)}`;
    }

    try {
        const fileContent = fs.readFileSync(filePath);
        
        const params = {
            Bucket: AWS_S3_BUCKET,
            Key: key,
            Body: fileContent,
            ContentType: getContentType(filePath)
        };

        const result = await s3.upload(params).promise();
        console.log(`파일 S3 업로드 성공: ${key}`);
        return result.Location;
    } catch (error) {
        console.error('S3 업로드 실패:', error);
        throw error;
    }
}

/**
 * S3에서 파일 다운로드
 * @param {string} key - S3 키
 * @returns {Promise<Buffer>} 파일 데이터
 */
export async function downloadFromS3(key) {
    if (AWS_ENV !== 'aws' || process.env.NODE_ENV !== 'production' || !s3) {
        // 로컬 환경에서는 로컬 파일 읽기
        const filePath = path.join(__dirname, 'uploads', key);
        return fs.readFileSync(filePath);
    }

    try {
        const params = {
            Bucket: AWS_S3_BUCKET,
            Key: key
        };

        const result = await s3.getObject(params).promise();
        return result.Body;
    } catch (error) {
        console.error('S3 다운로드 실패:', error);
        throw error;
    }
}

/**
 * S3에서 파일 삭제
 * @param {string} key - S3 키
 * @returns {Promise<void>}
 */
export async function deleteFromS3(key) {
    if (AWS_ENV !== 'aws' || process.env.NODE_ENV !== 'production' || !s3) {
        // 로컬 환경에서는 로컬 파일 삭제
        const filePath = path.join(__dirname, 'uploads', key);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return;
    }

    try {
        const params = {
            Bucket: AWS_S3_BUCKET,
            Key: key
        };

        await s3.deleteObject(params).promise();
        console.log(`S3 파일 삭제 성공: ${key}`);
    } catch (error) {
        console.error('S3 삭제 실패:', error);
        throw error;
    }
}

/**
 * 파일 확장자에 따른 Content-Type 반환
 * @param {string} filePath - 파일 경로
 * @returns {string} Content-Type
 */
function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
        '.txt': 'text/plain',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime'
    };
    return contentTypes[ext] || 'application/octet-stream';
}

/**
 * 현재 환경이 AWS인지 확인
 * @returns {boolean}
 */
export function isAWSEnvironment() {
    return AWS_ENV === 'aws' && process.env.NODE_ENV === 'production' && s3 !== null;
}