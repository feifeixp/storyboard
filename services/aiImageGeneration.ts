/**
 * AI图片生成服务
 * 基于接口文档: AI图片生成接口文档.md
 */

import { getAccessToken, getUserInfo } from './auth';
import { uploadToOSS, generateOSSPath } from './oss';

const API_BASE_URL = 'https://dev.neodomain.cn';

// ============================================
// 类型定义
// ============================================

/** 场景类型 */
export enum ScenarioType {
  IMAGE_TOOL = 1,      // 图片工具
  CANVAS = 2,          // 画布
  REDRAW = 3,          // 重绘
  DESIGN = 4,          // 设计
  STORYBOARD = 5,      // 分镜
}

/** 图片生成模型配置 */
export interface ImageGenerationModel {
  model_id: number;
  model_name: string;
  model_display_name: string;
  model_description: string;
  provider: string;
  model_type: string;
  display_type: number;
  is_default_design_model: boolean;
  is_default_shot_model: boolean;
  support_seed: boolean;
  support_custom_aspect_ratio: boolean;
  max_reference_images: number;
  image_count_options: string[];
  points_cost_per_image: number;
  size_pricing_config: string;
  supported_output_formats: string[];
  supported_aspect_ratios: string[];
  supported_sizes: string[];
  require_membership: boolean;
  min_membership_level: number;
  max_membership_level: number;
}

/** 图片生成请求参数 */
export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  modelName: string;
  imageUrls?: string[];
  aspectRatio?: string;
  numImages: string;
  outputFormat?: string;
  syncMode?: boolean;
  safetyTolerance?: string;
  guidanceScale?: number;
  seed?: number;
  size?: string;
  sourceType?: string;
  showPrompt?: boolean;
}

/** 图片生成任务状态 */
export enum TaskStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

/** 图片生成任务结果 */
export interface ImageGenerationResult {
  task_code: string;
  status: TaskStatus;
  image_urls: string[] | null;
  failure_reason: string | null;
  create_time: string;
}

/** API响应接口 */
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  errCode: string | null;
  errMessage: string | null;
}

// ============================================
// API调用函数
// ============================================

/**
 * 获取场景下可用的图片生成模型列表
 */
export async function getModelsByScenario(
  scenarioType: ScenarioType,
  userId?: string
): Promise<ImageGenerationModel[]> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('未登录，无法获取模型列表');
  }

  const params = new URLSearchParams({
    scenarioType: scenarioType.toString(),
  });
  if (userId) {
    params.append('userId', userId);
  }

  const response = await fetch(
    `${API_BASE_URL}/agent/ai-image-generation/models/by-scenario?${params}`,
    {
      method: 'GET',
      headers: {
        'accessToken': accessToken,
      },
    }
  );

  const result: ApiResponse<ImageGenerationModel[]> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.errMessage || '获取模型列表失败');
  }

  return result.data;
}

/**
 * 提交图片生成请求
 */
export async function generateImage(
  request: ImageGenerationRequest
): Promise<ImageGenerationResult> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('未登录，无法生成图片');
  }

  // 获取用户信息
  const userInfo = getUserInfo();
  console.log('[Neodomain] 用户信息:', userInfo);

  if (!userInfo || !userInfo.userId) {
    console.error('[Neodomain] 用户信息不完整:', userInfo);
    throw new Error('用户信息不完整，无法生成图片');
  }

  // 添加 userId 到请求参数
  const requestWithUserId = {
    ...request,
    userId: userInfo.userId,
  };

  console.log('[Neodomain] 图像生成请求参数:', {
    ...requestWithUserId,
    prompt: requestWithUserId.prompt.substring(0, 100) + '...',
  });

  const response = await fetch(
    `${API_BASE_URL}/agent/ai-image-generation/generate`,
    {
      method: 'POST',
      headers: {
        'accessToken': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestWithUserId),
    }
  );

  const result: ApiResponse<ImageGenerationResult> = await response.json();

  console.log('[Neodomain] 图像生成响应:', result);

  if (!result.success || !result.data) {
    console.error('[Neodomain] 图像生成失败:', result);
    throw new Error(result.errMessage || '图片生成请求失败');
  }

  return result.data;
}

/**
 * 查询图片生成结果
 */
export async function getGenerationResult(
  taskCode: string
): Promise<ImageGenerationResult> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('未登录，无法查询生成结果');
  }

  const response = await fetch(
    `${API_BASE_URL}/agent/ai-image-generation/result/${taskCode}`,
    {
      method: 'GET',
      headers: {
        'accessToken': accessToken,
      },
    }
  );

  const result: ApiResponse<ImageGenerationResult> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.errMessage || '查询生成结果失败');
  }

  return result.data;
}

/**
 * 轮询查询图片生成结果，直到成功或失败
 * @param taskCode 任务编码
 * @param onProgress 进度回调
 * @param maxRetries 最大重试次数，默认60次（约3分钟）
 * @param retryInterval 重试间隔（毫秒），默认3000ms
 */
export async function pollGenerationResult(
  taskCode: string,
  onProgress?: (status: TaskStatus, attempt: number) => void,
  maxRetries: number = 60,
  retryInterval: number = 3000
): Promise<ImageGenerationResult> {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    const result = await getGenerationResult(taskCode);

    if (onProgress) {
      onProgress(result.status, attempt);
    }

    // 成功或失败时返回结果
    if (result.status === TaskStatus.SUCCESS || result.status === TaskStatus.FAILED) {
      return result;
    }

    // 等待后继续轮询
    await new Promise(resolve => setTimeout(resolve, retryInterval));
  }

  throw new Error(`图片生成超时（已重试${maxRetries}次）`);
}


// ============================================
// 高级功能函数
// ============================================

/**
 * 生成图片并上传到OSS
 * @param request 图片生成请求
 * @param projectId 项目ID
 * @param shotNumber 镜头编号
 * @param onProgress 进度回调
 */
export async function generateAndUploadImage(
  request: ImageGenerationRequest,
  projectId: string,
  shotNumber: string,
  onProgress?: (stage: string, percent: number) => void
): Promise<string[]> {
  // 1. 提交生成请求
  if (onProgress) onProgress('提交生成请求', 10);
  const task = await generateImage(request);

  // 2. 轮询查询结果
  if (onProgress) onProgress('AI生成中', 30);
  const result = await pollGenerationResult(
    task.task_code,
    (status, attempt) => {
      if (onProgress) {
        const percent = Math.min(30 + attempt * 2, 70);
        onProgress(`AI生成中 (${attempt}次查询)`, percent);
      }
    }
  );

  // 3. 检查生成结果
  if (result.status === TaskStatus.FAILED) {
    throw new Error(result.failure_reason || '图片生成失败');
  }

  if (!result.image_urls || result.image_urls.length === 0) {
    throw new Error('未获取到生成的图片');
  }

  // 4. 下载并上传到OSS
  if (onProgress) onProgress('上传到OSS', 80);
  const ossUrls: string[] = [];

  for (let i = 0; i < result.image_urls.length; i++) {
    const imageUrl = result.image_urls[i];

    // 下载图片
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    // 生成OSS路径
    const ossPath = generateOSSPath(
      projectId,
      `${shotNumber}_${i + 1}`,
      'image',
      'jpg'
    );

    // 上传到OSS
    const ossUrl = await uploadToOSS(blob, ossPath, (percent) => {
      if (onProgress) {
        const totalPercent = 80 + (percent / result.image_urls!.length) * 0.2;
        onProgress(`上传到OSS (${i + 1}/${result.image_urls!.length})`, totalPercent);
      }
    });

    ossUrls.push(ossUrl);
  }

  if (onProgress) onProgress('完成', 100);
  return ossUrls;
}

/**
 * 获取默认分镜模型
 */
export async function getDefaultStoryboardModel(): Promise<ImageGenerationModel | null> {
  const models = await getModelsByScenario(ScenarioType.STORYBOARD);
  return models.find(m => m.is_default_shot_model) || models[0] || null;
}

/**
 * 获取默认设计模型
 */
export async function getDefaultDesignModel(): Promise<ImageGenerationModel | null> {
  const models = await getModelsByScenario(ScenarioType.DESIGN);
  return models.find(m => m.is_default_design_model) || models[0] || null;
}
