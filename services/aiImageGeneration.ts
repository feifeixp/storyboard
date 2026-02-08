/**
 * AI图片生成服务
 * 基于接口文档: AI图片生成接口文档.md
 */

import { getAccessToken, getUserInfo } from './auth';
import { uploadToOSS, generateOSSPath } from './oss';

// 🔧 尝试使用与登录 API 相同的域名
const API_BASE_URL = 'https://story.neodomain.cn';

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

  console.log('[Neodomain] 图像生成请求参数:', {
    ...request,
    prompt: request.prompt.substring(0, 100) + '...',
  });

  // 🔧 尝试使用 Authorization header（标准 JWT 认证方式）
  const response = await fetch(
    `${API_BASE_URL}/agent/ai-image-generation/generate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'accessToken': accessToken,  // 同时保留 accessToken header
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
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
 * @param maxRetries 最大重试次数：用于计算总超时预算（maxRetries * retryInterval），默认约3分钟
 * @param retryInterval 初始重试间隔（毫秒），默认3000ms（后续将按 2 倍指数退避增长）
 */
export async function pollGenerationResult(
  taskCode: string,
  onProgress?: (status: TaskStatus, attempt: number) => void,
  maxRetries: number = 60,
  retryInterval: number = 3000
): Promise<ImageGenerationResult> {
  // 说明：采用指数退避（strict doubling）以减少请求次数。
  // 首次查询将等待 retryInterval（默认3秒），之后等待时间每次翻倍：3s → 6s → 12s → ...
  // 同时保持总超时预算约为 maxRetries * retryInterval（默认 60 * 3000ms ≈ 180s）。
  let attempt = 0; // 实际查询次数（不是等待次数）
  let elapsedMs = 0;
  let delayMs = retryInterval;
  const totalTimeoutMs = Math.max(0, maxRetries * retryInterval);

  while (elapsedMs < totalTimeoutMs) {
    const remainingMs = totalTimeoutMs - elapsedMs;
    const waitMs = Math.min(delayMs, remainingMs);

    // 等待后再查询（满足“3秒开始查询”的需求）
    await new Promise(resolve => setTimeout(resolve, waitMs));
    elapsedMs += waitMs;

    attempt++;
    const result = await getGenerationResult(taskCode);

    if (onProgress) {
      onProgress(result.status, attempt);
    }

    // 成功或失败时返回结果
    if (result.status === TaskStatus.SUCCESS || result.status === TaskStatus.FAILED) {
      return result;
    }

    // 未完成则指数退避（严格翻倍）
    delayMs *= 2;
  }

  throw new Error(`图片生成超时（已查询${attempt}次，等待约${Math.ceil(elapsedMs / 1000)}秒）`);
}


// ============================================
// 高级功能函数
// ============================================

/**
 * 将第三方返回的临时图片链接下载后上传到 OSS，返回可长期访问的 OSS URL 列表。
 * 说明：该步骤可能因网络中断而失败；配合 task_code 持久化，可在网络恢复后重试。
 */
async function downloadAndUploadToOSS(
  imageUrls: string[],
  projectId: string,
  shotNumber: string,
  onProgress?: (stage: string, percent: number) => void
): Promise<string[]> {
  if (!imageUrls || imageUrls.length === 0) {
    throw new Error('未获取到生成的图片');
  }

  const ossUrls: string[] = [];
  const total = imageUrls.length;

  for (let i = 0; i < total; i++) {
    const imageUrl = imageUrls[i];

    // 下载图片
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: HTTP ${response.status}`);
    }
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
      if (!onProgress) return;
      // 80~100 区间用于上传阶段
      const perImageWeight = 20 / total;
      const totalPercent = 80 + i * perImageWeight + (percent / 100) * perImageWeight;
      onProgress(`上传到OSS (${i + 1}/${total})`, totalPercent);
    });

    ossUrls.push(ossUrl);
  }

  return ossUrls;
}

/**
 * 根据已有 task_code 继续轮询生成结果，并在成功后下载并上传到 OSS。
 * 用途：断网/刷新后，仍可用已保存的 task_code 恢复之前任务。
 */
export async function pollAndUploadFromTask(
  taskCode: string,
  projectId: string,
  shotNumber: string,
  onProgress?: (stage: string, percent: number) => void,
  options?: {
    /**
     * 跳过 OSS 上传，直接返回 Neodomain 侧的 image_urls（永久链接）。
     * 用途：角色/场景设定图可直接保存该链接，避免“下载→再上传OSS”链路导致的丢图/不稳定。
     */
    skipOSSUpload?: boolean;
  }
): Promise<string[]> {
  // 1) 轮询查询结果
  if (onProgress) onProgress('AI生成中', 30);
  const result = await pollGenerationResult(
    taskCode,
    (status, attempt) => {
      if (!onProgress) return;
      const percent = Math.min(30 + attempt * 2, 70);
      onProgress(`AI生成中 (${attempt}次查询)`, percent);
    }
  );

  // 2) 检查生成结果
  if (result.status === TaskStatus.FAILED) {
    throw new Error(result.failure_reason || '图片生成失败');
  }
  if (!result.image_urls || result.image_urls.length === 0) {
    throw new Error('未获取到生成的图片');
  }

  // 2.5) 可选：直接返回第三方永久链接（不经 OSS）
  if (options?.skipOSSUpload) {
    if (onProgress) onProgress('完成', 100);
    return result.image_urls;
  }

  // 3) 下载并上传到 OSS
  if (onProgress) onProgress('上传到OSS', 80);
  const ossUrls = await downloadAndUploadToOSS(result.image_urls, projectId, shotNumber, onProgress);

  if (onProgress) onProgress('完成', 100);
  return ossUrls;
}

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
  onProgress?: (stage: string, percent: number) => void,

  /**
   * 任务创建回调：在提交成功拿到 task_code 后立即触发。
   * 说明：用于“断网/刷新后可恢复”的场景，建议在回调内把 task_code 持久化到 D1。
   */
  onTaskCreated?: (taskCode: string) => void | Promise<void>,

  /**
   * 生成/上传策略选项
   */
  options?: {
    /**
     * 跳过 OSS 上传，直接返回 Neodomain 侧的 image_urls（永久链接）。
     */
    skipOSSUpload?: boolean;
  }
): Promise<string[]> {
  // 1. 提交生成请求
  if (onProgress) onProgress('提交生成请求', 10);
  const task = await generateImage(request);

  // 1.1 任务创建后立即回调（用于提前持久化 task_code）
  if (onTaskCreated) {
    try {
      await Promise.resolve(onTaskCreated(task.task_code));
    } catch (err) {
      // 不阻断主流程：即使持久化失败，仍尝试继续生成；但会失去“断网恢复”的保障。
      console.warn('[aiImageGeneration] onTaskCreated 回调执行失败:', err);
    }
  }

  // 2. 基于 task_code 轮询并上传
  return await pollAndUploadFromTask(task.task_code, projectId, shotNumber, onProgress, options);
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
