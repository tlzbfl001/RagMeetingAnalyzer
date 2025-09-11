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
 * S3에서 파일 삭제
 * @param {string} key - S3 키 (파일명)
 * @returns {Promise<boolean>} 삭제 성공 여부
 */
export async function deleteFromS3(key) {
    if (!isAWSEnvironment()) {
        console.log('AWS 환경이 아니므로 S3 삭제를 건너뜁니다.');
        return false;
    }

    try {
        const params = {
            Bucket: AWS_S3_BUCKET,
            Key: key
        };

        await s3.deleteObject(params).promise();
        console.log(`S3 파일 삭제 완료: ${key}`);
        return true;
    } catch (error) {
        console.error(`S3 파일 삭제 실패 (${key}):`, error);
        return false;
    }
}

/**
 * S3에서 여러 파일 삭제
 * @param {string[]} keys - S3 키 배열
 * @returns {Promise<boolean>} 삭제 성공 여부
 */
export async function deleteMultipleFromS3(keys) {
    if (!isAWSEnvironment() || !keys || keys.length === 0) {
        return false;
    }

    try {
        const params = {
            Bucket: AWS_S3_BUCKET,
            Delete: {
                Objects: keys.map(key => ({ Key: key }))
            }
        };

        await s3.deleteObjects(params).promise();
        console.log(`S3 파일들 삭제 완료: ${keys.length}개`);
        return true;
    } catch (error) {
        console.error('S3 파일들 삭제 실패:', error);
        return false;
    }
}

/**
 * S3에서 파일 목록 조회
 * @param {string} prefix - 검색할 접두사 (선택사항)
 * @returns {Promise<string[]>} 파일 키 목록
 */
export async function listS3Files(prefix = '') {
    if (!isAWSEnvironment()) {
        console.log('AWS 환경이 아니므로 S3 목록 조회를 건너뜁니다.');
        return [];
    }

    try {
        const params = {
            Bucket: AWS_S3_BUCKET,
            Prefix: prefix
        };

        const result = await s3.listObjectsV2(params).promise();
        const files = result.Contents ? result.Contents.map(obj => obj.Key) : [];
        console.log(`S3 파일 목록 조회 완료: ${files.length}개`);
        return files;
    } catch (error) {
        console.error('S3 파일 목록 조회 실패:', error);
        return [];
    }
}

/**
 * S3에서 특정 파일 존재 여부 확인
 * @param {string} key - S3 키 (파일명)
 * @returns {Promise<boolean>} 파일 존재 여부
 */
export async function existsInS3(key) {
    if (!isAWSEnvironment()) {
        return false;
    }

    try {
        const params = {
            Bucket: AWS_S3_BUCKET,
            Key: key
        };

        await s3.headObject(params).promise();
        return true;
    } catch (error) {
        if (error.statusCode === 404) {
            return false;
        }
        console.error(`S3 파일 존재 확인 실패 (${key}):`, error);
        return false;
    }
}

/**
 * 현재 환경이 AWS인지 확인
 * @returns {boolean}
 */
export function isAWSEnvironment() {
    return AWS_ENV === 'aws' && process.env.NODE_ENV === 'production' && s3 !== null;
}