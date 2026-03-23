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
    if (typeof import.meta !== 'undefined') {
        if (import.meta.env?.VITE_WORKER_PROXY_URL) {
            return import.meta.env.VITE_WORKER_PROXY_URL;
        }
        if (import.meta.env?.VITE_WORKER_URL) {
            return import.meta.env.VITE_WORKER_URL;
        }
    }
    // Fallback to production worker URL if env is missing
    return 'https://storyboard.neodomain.ai';
};

/**
 * 创建视频生成任务
 */
export async function createVideoTask(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
  const baseUrl = getProxyBaseUrl();
  const url = `${baseUrl}/volcengine/api/v3/contents/generations/tasks`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create video task: ${response.status} ${errorText}`);
  }

  const result: VideoGenerationResponse = await response.json();
  return result;
}

/**
 * 轮询视频生成任务状态
 */
export async function getVideoTaskResult(taskId: string): Promise<VideoTaskResult> {
  const baseUrl = getProxyBaseUrl();
  const url = `${baseUrl}/volcengine/api/v3/contents/generations/tasks/${taskId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to query video task: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * 带有重试和超时的轮询封装
 */
export async function pollVideoTask(
  taskId: string,
  onProgress?: (status: string, attempt: number) => void,
  maxTimeoutMs = 600000 // default 10 mins 
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
