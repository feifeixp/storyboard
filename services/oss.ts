/**
 * OSS上传服务
 * 基于接口文档: OSS-STS令牌接口文档.md
 */

import { getAccessToken } from './auth';

const API_BASE_URL = 'https://story.neodomain.cn';

// STS令牌响应接口
export interface STSToken {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  bucketName: string;
  env: string;
}

// API响应接口
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  errCode: string | null;
  errMessage: string | null;
}

// STS令牌缓存
let stsTokenCache: STSToken | null = null;
let tokenExpirationTime: number = 0;

/**
 * 获取OSS STS临时访问凭证
 */
export async function getSTSToken(): Promise<STSToken> {
  // 检查缓存是否有效（提前5分钟刷新）
  const now = Date.now();
  if (stsTokenCache && tokenExpirationTime > now + 5 * 60 * 1000) {
    return stsTokenCache;
  }

  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('未登录，无法获取OSS访问凭证');
  }

  const response = await fetch(`${API_BASE_URL}/agent/sts/oss/token`, {
    method: 'GET',
    headers: {
      'accessToken': accessToken,
    },
  });

  const result: ApiResponse<STSToken> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.errMessage || '获取OSS访问凭证失败');
  }

  // 缓存令牌
  stsTokenCache = result.data;
  // expiration是秒数，转换为毫秒时间戳
  tokenExpirationTime = now + parseInt(result.data.expiration) * 1000;

  return result.data;
}

/**
 * 上传文件到OSS
 * @param file 文件对象或Blob
 * @param fileName 文件名（包含路径，如 "storyboard/project1/shot1.png"）
 * @param onProgress 上传进度回调
 */
export async function uploadToOSS(
  file: File | Blob,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  // 动态导入ali-oss
  const OSS = await import('ali-oss');

  // 获取STS令牌
  const stsToken = await getSTSToken();

  // 初始化OSS客户端
  const client = new OSS.default({
    region: 'oss-cn-shanghai',
    accessKeyId: stsToken.accessKeyId,
    accessKeySecret: stsToken.accessKeySecret,
    stsToken: stsToken.securityToken,
    bucket: stsToken.bucketName,
  });

  try {
    // 上传文件
    const result = await client.put(fileName, file, {
      // 上传进度回调（ali-oss 类型定义未包含 progress，使用类型断言）
      progress: (p: number) => {
        if (onProgress) {
          onProgress(Math.floor(p * 100));
        }
      },
    } as Parameters<typeof client.put>[2]);

    // 返回文件URL
    return result.url;
  } catch (error) {
    console.error('OSS上传失败:', error);
    throw new Error('文件上传失败');
  }
}

/**
 * 上传Base64图片到OSS
 * @param base64Data Base64编码的图片数据
 * @param fileName 文件名
 * @param onProgress 上传进度回调
 */
export async function uploadBase64ToOSS(
  base64Data: string,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  // 将Base64转换为Blob
  const blob = base64ToBlob(base64Data);
  
  // 上传到OSS
  return uploadToOSS(blob, fileName, onProgress);
}

/**
 * 将Base64字符串转换为Blob对象
 */
function base64ToBlob(base64Data: string): Blob {
  // 移除Base64前缀（如 "data:image/png;base64,"）
  const base64String = base64Data.split(',')[1] || base64Data;
  
  // 解码Base64
  const byteCharacters = atob(base64String);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  
  // 获取MIME类型
  const mimeMatch = base64Data.match(/data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  
  return new Blob([byteArray], { type: mimeType });
}

/**
 * 生成OSS文件路径
 * @param projectId 项目ID
 * @param shotNumber 镜头编号
 * @param type 文件类型（如 "image", "video"）
 * @param extension 文件扩展名（如 "png", "mp4"）
 */
export function generateOSSPath(
  projectId: string,
  shotNumber: string,
  type: 'image' | 'video',
  extension: string
): string {
  const timestamp = Date.now();
  return `storyboard/${projectId}/${type}/shot_${shotNumber}_${timestamp}.${extension}`;
}

