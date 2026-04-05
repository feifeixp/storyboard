import { getAccessToken } from '../../services/auth';

export enum VideoTaskStatus {
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  PENDING = 'pending', // used locally
}

export interface VideoContentItem {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url';
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
  role?: string; // e.g., 'first_frame', 'last_frame', 'reference_image', 'reference_video'
}

export interface VideoGenerationRequest {
  model: string;
  content: VideoContentItem[];
  generate_audio?: boolean;
  resolution?: string; // '480p' | '720p'
  ratio?: string; // '16:9', 'adaptive', etc.
  duration?: number; // 4~15 or -1
  watermark?: boolean;
}

export interface VideoGenerationResponse {
  req_id: string;
  id: string; // task_id
}

export interface VideoTaskResult {
  id: string;
  status: VideoTaskStatus;
  created_at?: string;
  updated_at?: string;
  content?: {
    video_url?: string;
  };
  error?: {
    message: string;
    code?: string;
  };
}

// 代理 URL 根据环境变量配置或默认相对路径
const getProxyBaseUrl = () => {
    // 本地开发环境必须返回空字符串，以使用 vite.config.ts 中的代理
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
        return '';
    }
    
    // 生产环境读取配置
    if (typeof import.meta !== 'undefined') {
        if (import.meta.env?.VITE_WORKER_PROXY_URL) {
            return import.meta.env.VITE_WORKER_PROXY_URL;
        }
        if (import.meta.env?.VITE_WORKER_URL) {
            return import.meta.env.VITE_WORKER_URL;
        }
    }
    // Fallback to production worker URL if env is missing
    return 'https://storyboard-api.neodomain.ai';
};

/**
 * 创建视频生成任务
 */
export async function createVideoTask(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
  const baseUrl = getProxyBaseUrl();
  const url = `${baseUrl}/agent/user/video/generate`;
  
  // Transform standard request content list to new API JSON structure
  const textItem = request.content.find(c => c.type === 'text');
  const imageItems = request.content.filter(c => c.type === 'image_url');
  const videoItems = request.content.filter(c => c.type === 'video_url');

  let generationType = 'TEXT_TO_VIDEO';
  if (videoItems.length > 0) generationType = 'UNIVERSAL_TO_VIDEO';
  else if (imageItems.length > 0) generationType = 'IMAGE_TO_VIDEO';

  const firstFrameImageUrl = imageItems.length > 0 ? imageItems[0].image_url?.url : undefined;
  const imageUrls = imageItems.map(c => c.image_url?.url).filter(Boolean);
  const referenceVideoUrls = videoItems.map(c => c.video_url?.url).filter(Boolean);

  let modelName = 'neo-video-2-0';
  if (request.model.includes('fast') || request.model === 'neo-video-2-0-fast') {
      modelName = 'neo-video-2-0-fast';
  }

  const payload = {
    modelName,
    generationType,
    prompt: textItem?.text || '',
    firstFrameImageUrl,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    referenceVideoUrls: referenceVideoUrls.length > 0 ? referenceVideoUrls : undefined,
    aspectRatio: request.ratio,
    duration: request.duration ? `${request.duration}s` : undefined,
    generateAudio: request.generate_audio,
  };

  let retries = 3;
  let lastError: Error | null = null;

  while (retries > 0) {
    try {
      const accessToken = getAccessToken();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const reqId = response.headers.get('x-request-id') || 'unknown';
        // 如果是 405 报错并且 reqId 未知，极大概率是 Vite HMR 代理断联导致的本地报错
        if (response.status === 405 && reqId === 'unknown') {
          console.warn(`[Vite Proxy] 检测到本地代理 405 拦截，正在重试... (剩余 ${retries - 1} 次)`);
          throw new Error(`Failed to create video task: ${response.status} ${errorText} (ReqID: ${reqId})`);
        }
        // 如果是 500 系列或 429 限流，也可以重试
        if (response.status >= 500 || response.status === 429) {
          throw new Error(`Failed to create video task: ${response.status} ${errorText} (ReqID: ${reqId})`);
        }
        
        // 否则直接报错，不重试
        throw new Error(`Failed to create video task: ${response.status} ${errorText} (ReqID: ${reqId})`);
      }

      const result = await response.json();
      if (!result.success || !result.data) {
        throw new Error(`API returned error: ${result.errMessage || JSON.stringify(result)}`);
      }
      return {
        req_id: 'new-api',
        id: result.data.generationRecordId
      };
    } catch (err: any) {
      lastError = err;
      retries--;
      if (retries > 0 && err.message.includes('405') && err.message.includes('unknown')) {
        await new Promise(res => setTimeout(res, 2000)); // 代理断连时等待 2 秒再重试
      } else if (retries > 0 && (err.message.includes('50') || err.message.includes('429'))) {
        await new Promise(res => setTimeout(res, 3000));
      } else {
        throw err; // 不可重试或耗尽直接抛出
      }
    }
  }
  
  throw lastError;
}

/**
 * 轮询视频生成任务状态
 */
export async function getVideoTaskResult(taskId: string): Promise<VideoTaskResult> {
  const baseUrl = getProxyBaseUrl();
  const url = `${baseUrl}/agent/user/video/status/${taskId}`;

  const accessToken = getAccessToken();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to query video task: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  if (!result.success || !result.data) {
     throw new Error(`API returned error mapping status: ${result.errMessage || JSON.stringify(result)}`);
  }

  const apiData = result.data;
  let status = VideoTaskStatus.PENDING;
  switch (apiData.status) {
    case 'SUCCESS': status = VideoTaskStatus.SUCCEEDED; break;
    case 'FAILED': status = VideoTaskStatus.FAILED; break;
    case 'PROCESSING': status = VideoTaskStatus.RUNNING; break;
    case 'PENDING': status = VideoTaskStatus.PENDING; break;
  }

  return {
    id: apiData.generationRecordId,
    status,
    content: {
      video_url: apiData.ossVideoUrl,
    },
    error: apiData.errorMessage ? { message: apiData.errorMessage, code: apiData.errorCode } : undefined,
  };
}

/**
 * 带有重试和超时的轮询封装
 */
export async function pollVideoTask(
  taskId: string,
  onProgress?: (status: string, attempt: number) => void,
  maxTimeoutMs = 1800000 // default 30 mins 
): Promise<VideoTaskResult> {
  const startTime = Date.now();
  let attempt = 0;
  let delay = 3000; // start with 3 seconds

  while (Date.now() - startTime < maxTimeoutMs) {
    attempt++;
    const result = await getVideoTaskResult(taskId);
    if (onProgress) {
        onProgress(result.status, attempt);
    }

    if (result.status === VideoTaskStatus.SUCCEEDED || result.status === VideoTaskStatus.FAILED) {
      return result;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 30000); // max 30s interval
  }

  throw new Error(`Video generation polling timed out after ${maxTimeoutMs / 1000} seconds`);
}
