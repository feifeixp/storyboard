/**
 * OpenRouter API 服务
 * 支持多种模型，包括 Gemini 2.5 Pro 和思维链推理
 */

import OpenAI from 'openai';
import type { ScriptAnalysis } from '../prompts/chain-of-thought/types';
import { buildStage1Prompt } from '../prompts/chain-of-thought/stage1-script-analysis';
import { mergeThinkingAndResult } from '../prompts/chain-of-thought/utils';
import type { StoryboardStyle, CharacterRef, CharacterForm } from '../types';
import type { SceneRef } from '../types/project';
import {
  GRID_LAYOUT_TEMPLATE,
  PANEL_POSITION_NAMES,
  getPanelPositionName,
  getStaticPanelTemplate,
  getMotionPanelTemplate,
  getEmptyPanelTemplate,
} from './promptTemplates';
import {
  angleDirectionPrecision,
  angleHeightPrecision,
  getAngleInfo,
  extractAngleFromText,
} from './cameraAngleMappings';
import type { CharacterReferenceImage, ShotCharacter } from './characterUtils';
import {
  matchFormForEpisode,
  getCharacterAppearanceForEpisode,
  getCharacterReferenceImagesForEpisode,
  getScenesForEpisode,
  buildSceneDescriptionsForPrompt,
  buildCharacterDescriptionsForEpisode,
  getCharactersForShot,
  getCharactersForGrid,
  buildBriefCharacterDescription,
} from './characterUtils';

/**
 * 🆕 将分镜术语（角度高度）转换为中文摄影术语
 */
function convertAngleHeightToPhotography(term: string): string {
  if (!term) return '';

  const mapping: Record<string, string> = {
    '鸟瞰(Bird Eye)': '航拍视角',
    '极端俯拍(Extreme High)': '从高处拍摄',
    '中度俯拍(Moderate High)': '从上方拍摄',
    '轻微俯拍(Mild High)': '略微从上方拍摄',
    '平视(Eye Level)': '与眼睛同高',
    '轻微仰拍(Mild Low)': '略微从下方拍摄',
    '中度仰拍(Moderate Low)': '从下方拍摄',
    '极端仰拍(Extreme Low)': '从极低处拍摄',
    '虫视(Worm Eye)': '贴近地面仰视',
    '荷兰角(Dutch Angle)': '镜头倾斜拍摄',
  };

  // 先尝试完整匹配
  if (mapping[term]) return mapping[term];

  // 提取中文部分再尝试
  const cnOnly = term.replace(/\([^)]+\)/g, '').trim();
  return mapping[cnOnly] || term;
}

/**
 * 🆕 将分镜术语（角度朝向）转换为中文摄影术语
 */
function convertAngleDirectionToPhotography(term: string): string {
  if (!term) return '';

  const mapping: Record<string, string> = {
    '正面(Front)': '直视镜头',
    '微侧正面(Slight Front)': '略微向右转',
    '3/4正面(3/4 Front)': '轻微向右转',
    '1/3侧面(1/3 Side)': '侧身轮廓带部分正面',
    '正侧面(Full Side)': '右侧面轮廓',
    '1/3背面(1/3 Back)': '侧身轮廓带部分背面',
    '3/4背面(3/4 Back)': '转身背对，回头看肩',
    '背面(Back)': '背对镜头',
    '主观视角(POV)': '主观视角',
  };

  // 先尝试完整匹配
  if (mapping[term]) return mapping[term];

  // 提取中文部分再尝试
  const cnOnly = term.replace(/\([^)]+\)/g, '').trim();
  return mapping[cnOnly] || term;
}

/**
 * 🆕 清除文本中的中文字符（包括中文标点）
 * 用于清理英文提示词中混入的中文内容
 */
export function removeChinese(text: string): string {
  if (!text) return text;

  // 移除所有中文字符（包括中文标点）
  // Unicode范围：
  // - \u4e00-\u9fa5: 中文汉字
  // - \u3000-\u303f: CJK符号和标点
  // - \uff00-\uffef: 全角ASCII、全角标点
  return text
    .replace(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g, ' ')  // 替换为空格
    .replace(/\s+/g, ' ')  // 合并多个空格
    .trim();
}

/**
 * 🆕 根据集数匹配角色的正确形态
 * 匹配逻辑：
 *   - "Ep 5" → 仅第5集
 *   - "Ep 1-20" → 第1到20集
 *   - "Ep 46+" → 第46集及以后
 * @returns 匹配到的 CharacterForm，或 undefined
 */




/**
 * 🆕 美术风格类型
 * 🔧 新增 '3d_anime' 复合类型，用于3D国漫/3D动漫等项目
 */
export type ArtStyleType = 'anime' | 'realistic' | '3d' | '3d_anime' | 'illustration' | 'unknown';

/**
 * 🆕 根据项目类型和视觉风格判断美术风格类型
 * 🔧 修复优先级问题：3D+动漫组合时应返回 '3d_anime' 而非 'anime'
 */
export function detectArtStyleType(genre: string, visualStyle: string): ArtStyleType {
  const combined = `${genre} ${visualStyle}`.toLowerCase();

  // 二次元/动漫风格关键词
  const animeKeywords = [
    '动漫', '动画', '二次元', 'anime', '日系', '漫画',
    '赛璐璐', '卡通', '番剧', '短剧动画', '国漫'
  ];

  // 3D风格关键词
  const threeDKeywords = [
    '3d', '三维', 'cg', '渲染', 'render', 'unreal', 'unity',
    'c4d', 'octane', 'blender', '皮克斯', 'pixar'
  ];

  // 写实风格关键词
  const realisticKeywords = [
    '写实', '真人', '电影', 'realistic', 'photorealistic',
    '实拍', 'live action', '真实'
  ];

  // 插画风格关键词
  const illustrationKeywords = [
    '插画', '水彩', '油画', '手绘', 'illustration', 'painting'
  ];

  // 🔧 关键修复：先检测是否同时包含 3D 和 动漫 关键词
  // 如果同时存在，说明是"3D国漫"类复合风格，应优先匹配
  const has3D = threeDKeywords.some(k => combined.includes(k));
  const hasAnime = animeKeywords.some(k => combined.includes(k));

  if (has3D && hasAnime) {
    return '3d_anime';  // 3D + 动漫 = 3D国漫复合风格
  }

  // 纯3D（无动漫关键词）
  if (has3D) return '3d';

  // 纯动漫（无3D关键词）
  if (hasAnime) return 'anime';

  // 写实
  for (const keyword of realisticKeywords) {
    if (combined.includes(keyword)) return 'realistic';
  }

  // 插画
  for (const keyword of illustrationKeywords) {
    if (combined.includes(keyword)) return 'illustration';
  }

  return 'unknown';
}

/**
 * 🆕 根据美术风格生成提示词约束
 * 🔧 新增 '3d_anime' 复合风格约束；增强 '3d' 约束（加禁止项）
 */
export function getArtStyleConstraints(artStyle: ArtStyleType): string {
  switch (artStyle) {
    case 'anime':
      return `
═══════════════════════════════════════════════════════════════
【🎨 美术风格约束：二次元/动漫（纯2D）】
═══════════════════════════════════════════════════════════════
⚠️ 提示词禁止使用写实描述：
  ❌ "realistic skin", "photorealistic", "skin pores", "skin texture"
  ❌ "subsurface scattering", "SSS皮肤", "真实皮肤纹理"
  ❌ "realistic lighting on skin", "skin imperfections"

✅ 应使用动漫风格描述：
  ✅ "anime style", "2D cel-shaded", "flat color", "clean lines"
  ✅ "anime eyes", "anime face", "stylized features"
  ✅ "smooth skin", "clean rendering", "vibrant colors"

人物描述要点：
  - 眼睛：大而明亮，有光点/高光
  - 皮肤：平滑干净，无毛孔纹理
  - 线条：清晰的轮廓线
  - 着色：平涂或渐变，避免复杂光影
`;
    case '3d_anime':
      return `
═══════════════════════════════════════════════════════════════
【🎨 美术风格约束：3D国漫/3D动漫】
═══════════════════════════════════════════════════════════════
⚠️ 这是 3D渲染 + 动漫角色设计 的复合风格！必须严格遵守！

❌ 绝对禁止的描述（会导致风格偏移！）：
  ❌ "2D", "flat color", "cel-shaded", "2D cel-shaded" — 禁止2D平涂风格
  ❌ "hand-drawn", "sketch", "line art" — 禁止手绘线条风格
  ❌ "photorealistic", "real skin", "skin pores" — 禁止真人写实风格
  ❌ "watercolor", "ink wash" — 禁止水彩水墨风格

✅ 必须使用的描述（3D渲染质感）：
  ✅ "3D animation style", "3D rendered", "CGI quality"
  ✅ "Pixar-like rendering", "Cinema 4D", "Octane render"
  ✅ "subsurface scattering (SSS)", "volumetric lighting"
  ✅ "smooth 3D model", "clean 3D textures", "global illumination"
  ✅ "soft studio lighting", "ambient occlusion"

✅ 角色设计要点（动漫化的3D角色）：
  - 眼睛：大而有神，带有高光反射，3D渲染质感（非平涂）
  - 皮肤：光滑有质感的3D渲染皮肤，带SSS次表面散射效果
  - 头发：3D建模的动漫发型，有体积感和光泽
  - 整体：像《完美世界》《斗破苍穹》等3D国漫的画面风格
  - 材质：有3D模型的塑料/陶瓷质感，不是2D平涂

🎯 风格参考：3D Chinese anime, like Perfect World / Battle Through the Heavens style
`;
    case 'realistic':
      return `
═══════════════════════════════════════════════════════════════
【🎨 美术风格约束：写实/电影】
═══════════════════════════════════════════════════════════════
✅ 使用写实描述：
  - 真实的皮肤纹理、毛孔、细节
  - 真实的光影效果、反射
  - 电影级别的画面质感
`;
    case '3d':
      return `
═══════════════════════════════════════════════════════════════
【🎨 美术风格约束：3D渲染】
═══════════════════════════════════════════════════════════════
❌ 禁止使用的描述（会导致风格偏移）：
  ❌ "2D", "flat color", "cel-shaded" — 禁止2D平涂风格
  ❌ "hand-drawn", "sketch", "line art" — 禁止手绘线条风格
  ❌ "watercolor", "ink wash" — 禁止水彩水墨风格

✅ 使用3D渲染描述：
  ✅ "3D rendered", "CGI quality", "3D model"
  ✅ "global illumination", "ambient occlusion"
  ✅ "volumetric lighting", "material reflections"
  ✅ "Unreal Engine / Unity style rendering"
`;
    default:
      return '';
  }
}

// 获取 AI API Key（固定使用 gemini-2.5-flash）
const getApiKey = () => {
  // Vite 环境
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_OPENROUTER1_API_KEY;
  }
  // Node.js 环境
  return process.env.VITE_OPENROUTER1_API_KEY;
};

// 延迟创建客户端，确保环境变量已加载
let geminiClient: OpenAI | null = null;

// 获取自建 Gemini 客户端
const getGeminiClient = () => {
  if (!geminiClient) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(
        '未找到 VITE_OPENROUTER1_API_KEY 环境变量。\n' +
        '请确保 .env 文件存在，并包含：\n' +
        'VITE_OPENROUTER1_API_KEY=sk-...'
      );
    }

    // 自建 LLM 代理接口
    const baseURL = 'http://alb-r3li6yh4ktpwq7ugkg.ap-southeast-1.alb.aliyuncsslbintl.com:7000/v1';

    geminiClient = new OpenAI({
      baseURL,
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }
  return geminiClient;
};

// 统一返回 Gemini 客户端（固定模型，不再区分 DeepSeek/OpenRouter）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getClient = (_model?: string) => {
  return getGeminiClient();
};

/**
 * 统一 API 错误日志工具 - 提取 OpenAI SDK APIError 的详细信息
 * 当服务器返回 500/4xx 时，会打印完整的响应体，方便排查问题
 */
function logApiError(context: string, error: unknown): void {
  if (error instanceof OpenAI.APIError) {
    console.error(`[API Error] ${context}`);
    console.error(`  状态码: ${error.status}`);
    console.error(`  错误消息: ${error.message}`);
    console.error(`  响应体:`, error.error);
    console.error(`  请求ID:`, error.headers?.['x-request-id'] || '无');
  } else if (error instanceof Error) {
    console.error(`[Error] ${context}: ${error.message}`);
  } else {
    console.error(`[Unknown Error] ${context}:`, error);
  }
}

/**
 * 可用的模型配置
 *
 * ╔════════════════════════════════════════════════════════════════════════════════╗
 * ║                   OpenRouter 模型价格表 (2026年2月)                              ║
 * ╠══════════════════════════════╦═══════════════╦═══════════════╦════════════════╣
 * ║ 模型                         ║ 上下文        ║ 输入/输出     ║ 备注           ║
 * ╠══════════════════════════════╬═══════════════╬═══════════════╬════════════════╣
 * ║ GPT-5 Mini                   ║ 400K          ║ $0.25/$2      ║ OpenAI最新      ║
 * ║ Gemini 2.5 Flash             ║ 1.05M         ║ $0.30/$2.50   ║ ✅ 默认推荐     ║
 * ║ MiniMax M2.5                 ║ 196K          ║ $0.30/$1.10   ║ 高性价比        ║
 * ║ Kimi k2.5                    ║ 262K          ║ $0.45/$2.20   ║ Moonshot高性价比║
 * ║ Gemini 3 Flash Preview       ║ 1.05M         ║ $0.50/$3      ║ Google新版      ║
 * ║ Claude Haiku 4.5             ║ 200K          ║ $1/$5         ║ Anthropic快速型 ║
 * ╚══════════════════════════════╩═══════════════╩═══════════════╩════════════════╝
 *
 * 数据来源: https://openrouter.ai/models (2026-02-25)
 *
 * 注：以下模型常量保留供内部使用，但不在UI中展示：
 * - DeepSeek Chat, GPT-4o Mini, Gemini 2.5 Pro, Gemini 3 Pro Preview, Claude Sonnet 4.5
 */
// 按价格从便宜到贵排序
export const MODELS = {
  // === UI 可选的 6 个主力模型（按价格排序）===

  // 1. GPT-5 Mini - $0.25/$2 (400K context)
  GPT_5_MINI: 'openai/gpt-5-mini',

  // 2. Gemini 2.5 Flash - $0.30/$2.50 (1.05M context) ✅ 默认推荐
  GEMINI_2_5_FLASH: 'google/gemini-2.5-flash',

  // 3. MiniMax M2.5 - $0.30/$1.10 (196K context)
  MINIMAX_M2_5: 'minimax/minimax-m2.5',

  // 4. Kimi k2.5 - $0.45/$2.20 (262K context)
  KIMI_K_2_5: 'moonshotai/kimi-k2.5',

  // 5. Gemini 3 Flash Preview - $0.50/$3.00 (1.05M context)
  GEMINI_3_FLASH_PREVIEW: 'google/gemini-3-flash-preview',

  // 6. Claude Haiku 4.5 - $1.00/$5.00 (200K context)
  CLAUDE_HAIKU_4_5: 'anthropic/claude-haiku-4.5',

  // === 保留模型（内部备用，不在UI展示）===

  // DeepSeek Chat - ¥1/¥2 (约$0.14/$0.28)
  DEEPSEEK_CHAT: 'deepseek-chat',

  // GPT-4o Mini - $0.15/$0.60
  GPT_4O_MINI: 'openai/gpt-4o-mini',

  // Gemini 2.5 Pro - $1.25/$10.00
  GEMINI_2_5_PRO: 'google/gemini-2.5-pro',

  // Gemini 3 Pro Preview - $1.25/$10.00 (思维链)
  GEMINI_3_PRO_PREVIEW: 'google/gemini-3-pro-preview',

  // Claude Sonnet 4.5 - $3.00/$15.00
  CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4.5',

  // 图像生成专用（不在文本列表中）
  GEMINI_3_PRO_IMAGE_PREVIEW: 'google/gemini-3-pro-image-preview',
} as const;

// 判断是否为 DeepSeek 模型
export const isDeepSeekModel = (model: string): boolean => {
  return model.startsWith('deepseek-');
};

/**
 * 模型分类（按价格从便宜到贵排序）
 * 注：THINKING 和 FAST 主要包含 UI 可选的 6 个主力模型
 */
export const MODEL_CATEGORIES = {
  THINKING: [
    MODELS.KIMI_K_2_5,              // $0.45/$2.20 (适合长文本思考)
    MODELS.CLAUDE_HAIKU_4_5,        // $1/$5
    // 保留模型（内部备用）
    MODELS.GEMINI_3_PRO_PREVIEW,    // $1.25/$10
    MODELS.GEMINI_2_5_PRO,          // $1.25/$10
    MODELS.CLAUDE_SONNET_4_5,       // $3/$15
  ],
  FAST: [
    MODELS.GPT_5_MINI,              // $0.25/$2 ✅ UI可选
    MODELS.GEMINI_2_5_FLASH,        // $0.30/$2.50 ✅ 默认推荐
    MODELS.MINIMAX_M2_5,            // $0.30/$1.10 ✅ UI可选
    MODELS.GEMINI_3_FLASH_PREVIEW,  // $0.50/$3 ✅ UI可选
    // 保留模型（内部备用）
    MODELS.DEEPSEEK_CHAT,           // ¥1/¥2
    MODELS.GPT_4O_MINI,             // $0.15/$0.60
  ],
  IMAGE: [
    MODELS.GEMINI_3_PRO_IMAGE_PREVIEW,
  ],
} as const;

/**
 * 模型显示名称（含价格信息，按价格从便宜到贵排序）
 */
export const MODEL_NAMES: Record<string, string> = {
  // === UI 可选的 6 个主力模型 ===
  [MODELS.GPT_5_MINI]: 'GPT-5 Mini (400K ctx, $0.25/$2)',
  [MODELS.GEMINI_2_5_FLASH]: 'Gemini 2.5 Flash (1.05M ctx, $0.30/$2.50, $1/M audio) ⭐推荐',
  [MODELS.MINIMAX_M2_5]: 'MiniMax M2.5 (196K ctx, $0.30/$1.10，速度较慢，建议耐心等待结果)',
  [MODELS.KIMI_K_2_5]: 'Kimi k2.5 (262K ctx, $0.45/$2.20，速度非常慢，仅在需要深度思考时使用)',
  [MODELS.GEMINI_3_FLASH_PREVIEW]: 'Gemini 3 Flash Preview (1.05M ctx, $0.50/$3, $1/M audio)',
  [MODELS.CLAUDE_HAIKU_4_5]: 'Claude Haiku 4.5 (200K ctx, $1/$5)',

  // === 保留模型（内部备用）===
  [MODELS.DEEPSEEK_CHAT]: 'DeepSeek V3 (¥1) 🔥最便宜',
  [MODELS.GPT_4O_MINI]: 'GPT-4o Mini ($0.15)',
  [MODELS.GEMINI_2_5_PRO]: 'Gemini 2.5 Pro ($1.25)',
  [MODELS.GEMINI_3_PRO_PREVIEW]: 'Gemini 3 Pro Preview ($1.25) 思维链',
  [MODELS.CLAUDE_SONNET_4_5]: 'Claude Sonnet 4.5 ($3.00) 最强',
  [MODELS.GEMINI_3_PRO_IMAGE_PREVIEW]: 'Gemini 3 Pro Image (图像理解)',
};

/**
 * 默认模型配置
 * Gemini 2.5 Flash 是高性价比模型，速度快且价格低
 */
// 固定使用自建 API 的 gemini-2.5-flash
export const DEFAULT_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_THINKING_MODEL = 'google/gemini-2.5-flash';
// 注意：DEFAULT_IMAGE_MODEL 是 OpenRouter 的 modelId（用于多模态/图像理解等），不是 Neodomain 生图的 modelName。
export const DEFAULT_IMAGE_MODEL = 'google/gemini-3-pro-image-preview';

// Neodomain 生图默认模型（modelName）
export const DEFAULT_NEODOMAIN_IMAGE_MODEL = 'nanobanana-pro';

/**
 * 生成分镜脚本（传统模式）
 */
export async function* generateStoryboard(
  script: string,
  prompt: string,
  model: string = DEFAULT_MODEL
) {
  try {
    const client = getClient(model);
    const stream = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\n## 剧本\n${script}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 8192,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullText += content;
        yield content;
      }
    }

    return fullText;
  } catch (error) {
    logApiError('generateStoryboard', error);
    throw error;
  }
}

/**
 * 阶段1：剧本分析（思维链模式）
 * 使用 Gemini 3 Pro 支持推理
 */
export async function* generateStage1Analysis(
  script: string,
  model: string = DEFAULT_THINKING_MODEL
) {
  const prompt = buildStage1Prompt(script);

  try {
    console.log('[DEBUG] 开始调用 OpenRouter API...');
    console.log('[DEBUG] 模型:', model);
    console.log('[DEBUG] 提示词长度:', prompt.length, '字符');

    const client = getClient(model);
    const stream = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 16000,
      stream: true,
      // 启用思维链推理（仅 Gemini 3 Pro Preview 支持）
      // 注意：extra_body 可能不被 openai 客户端支持，暂时禁用
      // extra_body: model === MODELS.GEMINI_3_PRO_PREVIEW ? { reasoning: { enabled: true } } : {},
    });

    console.log('[DEBUG] API 调用成功，开始接收流式数据...\n');

    let fullText = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullText += content;
        yield content;
      }
    }

    console.log('\n[DEBUG] 流式数据接收完成，总长度:', fullText.length, '字符');

    return fullText;
  } catch (error) {
    logApiError('generateStage1Analysis', error);
    throw error;
  }
}

/**
 * 解析阶段1的输出
 * 更加健壮的解析，处理各种可能的 JSON 结构
 */
export function parseStage1Output(fullText: string): ScriptAnalysis {
  try {
    // 先尝试宽松解析，不要求所有字段
    const result = mergeThinkingAndResult<any>(
      fullText,
      ['basicInfo'] // 只要求最基本的字段
    );

    // 处理 AI 可能返回的不同结构
    // 如果 emotionArc 在 emotionAnalysis 下
    if (result.emotionAnalysis) {
      result.emotionArc = result.emotionAnalysis.emotionArc || result.emotionAnalysis;
      result.climax = result.emotionAnalysis.climax;
      delete result.emotionAnalysis;
    }

    // 尝试多种可能的 scenes 字段名
    const scenesAliases = ['scenes', 'sceneBreakdown', 'sceneDivision', 'sceneSegments', 'segments', 'paragraphs'];
    for (const alias of scenesAliases) {
      if (!result.scenes && result[alias]) {
        result.scenes = result[alias];
        delete result[alias];
        break;
      }
    }

    // 确保 scenes 是数组
    if (result.scenes && !Array.isArray(result.scenes)) {
      // 如果是对象，尝试转换为数组
      if (typeof result.scenes === 'object') {
        result.scenes = Object.values(result.scenes);
      }
    }

    // 尝试多种可能的 conflict 字段名
    const conflictAliases = ['conflict', 'conflictAnalysis', 'coreConflict', 'mainConflict'];
    for (const alias of conflictAliases) {
      if (result[alias] && !result.conflict) {
        result.conflict = result[alias];
        if (alias !== 'conflict') {
          delete result[alias];
          console.warn(`已将 ${alias} 转换为 conflict`);
        }
        break;
      }
    }

    // 验证必需字段，提供更详细的错误信息
    const missingFields: string[] = [];
    if (!result.basicInfo) missingFields.push('basicInfo');
    if (!result.emotionArc) missingFields.push('emotionArc');
    if (!result.climax) missingFields.push('climax');
    if (!result.conflict) missingFields.push('conflict');
    if (!result.scenes || !Array.isArray(result.scenes) || result.scenes.length === 0) {
      missingFields.push('scenes');
    }

    if (missingFields.length > 0) {
      console.warn('警告：缺少以下字段:', missingFields.join(', '));
      console.warn('已解析的字段:', Object.keys(result).join(', '));

      // 如果只缺少 scenes，创建默认值
      if (missingFields.includes('scenes')) {
        // 尝试从 emotionArc 推断场景
        if (result.emotionArc && Array.isArray(result.emotionArc)) {
          result.scenes = result.emotionArc.map((e: any, i: number) => ({
            id: `S${i + 1}`,
            description: e.event || `场景${i + 1}`,
            duration: '30秒',
            mood: e.emotion || '待定'
          }));
          console.warn('已从 emotionArc 推断 scenes');
          // 移除 scenes 从缺失列表
          const idx = missingFields.indexOf('scenes');
          if (idx > -1) missingFields.splice(idx, 1);
        }
      }

      // 如果还有其他缺失字段，抛出错误
      if (missingFields.length > 0 && !missingFields.every(f => f === 'scenes')) {
        throw new Error(`缺少必需字段: ${missingFields.join(', ')}`);
      }
    }

    return result as ScriptAnalysis;
  } catch (error) {
    console.error('解析阶段1输出失败:', error);
    throw new Error(`无法解析剧本分析结果: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// ============================================
// 阶段2：视觉策略规划
// ============================================

import { buildStage2Prompt } from '../prompts/chain-of-thought/stage2-visual-strategy';
import type { VisualStrategy } from '../prompts/chain-of-thought/types';

/**
 * 生成阶段2：视觉策略规划
 */
export async function* generateStage2Analysis(
  stage1Result: ScriptAnalysis,
  model: string = DEFAULT_THINKING_MODEL
): AsyncGenerator<string, string, unknown> {
  const prompt = buildStage2Prompt(stage1Result);

  console.log('[DEBUG] 开始调用阶段2 API...');
  console.log('[DEBUG] 模型:', model);
  console.log('[DEBUG] 提示词长度:', prompt.length, '字符');

  try {
    const client = getClient(model);
    const stream = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 8192,
      stream: true,
    });

    console.log('[DEBUG] 阶段2 API 调用成功，开始接收流式数据...');

    let fullText = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullText += content;
        yield content;
      }
    }

    console.log('\n[DEBUG] 阶段2流式数据接收完成，总长度:', fullText.length, '字符');

    return fullText;
  } catch (error) {
    logApiError('generateStage2Analysis', error);
    throw error;
  }
}

/**
 * 解析阶段2的输出
 */
export function parseStage2Output(fullText: string): VisualStrategy {
  try {
    const result = mergeThinkingAndResult<any>(
      fullText,
      ['overallStyle', 'cameraStrategy', 'spatialContinuity', 'rhythmControl']
    );

    return result as VisualStrategy;
  } catch (error) {
    console.error('解析阶段2输出失败:', error);
    throw new Error(`无法解析视觉策略结果: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// ============================================
// 阶段3：镜头分配计划
// ============================================

import { buildStage3Prompt } from '../prompts/chain-of-thought/stage3-shot-planning';
import type { ShotPlanning } from '../prompts/chain-of-thought/types';

/**
 * 生成阶段3：镜头分配计划
 * @param originalScript 原始剧本文本（必须传入以确保镜头内容准确）
 */
export async function* generateStage3Analysis(
  originalScript: string,
  stage1Result: ScriptAnalysis,
  stage2Result: VisualStrategy,
  model: string = DEFAULT_THINKING_MODEL
): AsyncGenerator<string, string, unknown> {
  const prompt = buildStage3Prompt(originalScript, stage1Result, stage2Result);

  console.log('[DEBUG] 开始调用阶段3 API...');
  console.log('[DEBUG] 模型:', model);
  console.log('[DEBUG] 提示词长度:', prompt.length, '字符');

  try {
    const client = getClient(model);
    const stream = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 12000,
      stream: true,
    });

    console.log('[DEBUG] 阶段3 API 调用成功，开始接收流式数据...');

    let fullText = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullText += content;
        yield content;
      }
    }

    console.log('\n[DEBUG] 阶段3流式数据接收完成，总长度:', fullText.length, '字符');

    return fullText;
  } catch (error) {
    logApiError('generateStage3Analysis', error);
    throw error;
  }
}

/**
 * 解析阶段3的输出
 */
export function parseStage3Output(fullText: string): ShotPlanning {
  try {
    const result = mergeThinkingAndResult<any>(
      fullText,
      ['shotCount', 'shotDistribution', 'pacingCurve', 'shotList']
    );

    return result as ShotPlanning;
  } catch (error) {
    console.error('解析阶段3输出失败:', error);
    throw new Error(`无法解析镜头分配结果: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// ============================================
// 阶段4：逐镜详细设计
// ============================================

import { buildStage4Prompt, type ShotListItem } from '../prompts/chain-of-thought/stage4-shot-design';
import type { ShotDesign } from '../prompts/chain-of-thought/types';

/**
 * 生成阶段4：逐镜详细设计（批量处理）
 * 每次处理5-8个镜头以避免输出过长
 * 
 * ⚠️ 新增：传入完整剧本 script，用于严格对齐 storyBeat.dialogue 的对白，禁止改写
 */
export async function* generateStage4Analysis(
	  script: string,
	  stage1Result: ScriptAnalysis,
	  stage2Result: VisualStrategy,
	  stage3Result: ShotPlanning,
	  shotBatch: ShotListItem[],
	  model: string = DEFAULT_THINKING_MODEL
	): AsyncGenerator<string, string, unknown> {
	  const prompt = buildStage4Prompt(script, stage1Result, stage2Result, stage3Result, shotBatch);

  console.log('[DEBUG] 开始调用阶段4 API...');
  console.log('[DEBUG] 模型:', model);
  console.log('[DEBUG] 提示词长度:', prompt.length, '字符');
  console.log('[DEBUG] 处理镜头数:', shotBatch.length);

  try {
    const client = getClient(model);
    const stream = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 16000,
      stream: true,
    });

    console.log('[DEBUG] 阶段4 API 调用成功，开始接收流式数据...');

    let fullText = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullText += content;
        yield content;
      }
    }

    console.log('\n[DEBUG] 阶段4流式数据接收完成，总长度:', fullText.length, '字符');

    return fullText;
  } catch (error) {
    logApiError('generateStage4Analysis', error);
    throw error;
  }
}

/**
 * 解析阶段4的输出
 * v3增强容错处理：处理截断的JSON、格式错误、字段名不匹配等
 */
export function parseStage4Output(fullText: string): { shots: ShotDesign[] } {
  try {
    const result = mergeThinkingAndResult<any>(
      fullText,
      ['shots'] // 先尝试标准字段名
    );

    console.log(`[解析成功] 解析到 ${result.shots.length} 个镜头`);
    return result as { shots: ShotDesign[] };
  } catch (error) {
    console.warn('⚠️ 标准解析失败，启动修复流程:', error instanceof Error ? error.message : error);

    // 🆕 v3：先尝试字段别名处理
    try {
      const aliasResult = tryFieldAliases(fullText);
      if (aliasResult) {
        console.log(`✅ [字段别名成功] 解析到 ${aliasResult.shots.length} 个镜头`);
        return aliasResult;
      }
    } catch (e) {
      console.warn('字段别名处理失败:', e instanceof Error ? e.message : e);
    }

    // 🆕 v2修复策略：多层次容错
    return tryFixStage4JSON(fullText, error);
  }
}

/**
 * 🆕 v3：尝试字段别名处理
 * AI 可能返回不同的字段名，如 shotDesigns, shotList, designs 等
 */
function tryFieldAliases(fullText: string): { shots: ShotDesign[] } | null {
  const aliases = ['shots', 'shotDesigns', 'shotList', 'designs', 'shotDetails', '镜头列表', '镜头设计'];

  for (const alias of aliases) {
    try {
      const result = mergeThinkingAndResult<any>(fullText, [alias]);

      // 找到了该字段，转换为标准格式
      if (result[alias] && Array.isArray(result[alias])) {
        console.log(`[字段别名] 检测到字段名: "${alias}"，转换为标准格式 "shots"`);
        return { shots: result[alias] };
      }
    } catch (e) {
      // 继续尝试下一个别名
      continue;
    }
  }

  return null;
}

/**
 * 🆕 v2：多层次JSON修复策略
 */
function tryFixStage4JSON(fullText: string, originalError: any): { shots: ShotDesign[] } {
  // 策略0: 先尝试修复常见的JSON语法错误（最快）
  try {
    const fixed0 = fixCommonJSONErrors(fullText);
    if (fixed0) {
      console.log(`✅ [修复策略0成功] 语法修复，解析到 ${fixed0.shots.length} 个镜头`);
      return fixed0;
    }
  } catch (e) {
    console.warn('修复策略0失败:', e instanceof Error ? e.message : e);
  }

  // 策略1: 智能截断到最后一个完整对象
  try {
    const fixed1 = fixBySmartTruncation(fullText);
    if (fixed1) {
      console.log(`✅ [修复策略1成功] 智能截断，解析到 ${fixed1.shots.length} 个镜头`);
      return fixed1;
    }
  } catch (e) {
    console.warn('修复策略1失败:', e instanceof Error ? e.message : e);
  }

  // 策略2: 逐个提取完整的镜头对象
  try {
    const fixed2 = fixByExtractingShots(fullText);
    if (fixed2 && fixed2.shots.length > 0) {
      console.log(`✅ [修复策略2成功] 逐个提取，解析到 ${fixed2.shots.length} 个镜头`);
      return fixed2;
    }
  } catch (e) {
    console.warn('修复策略2失败:', e instanceof Error ? e.message : e);
  }

  // 策略3: 强制修复 - 定位错误位置并修复
  try {
    const fixed3 = forceFixJSONAtErrorPosition(fullText, originalError);
    if (fixed3) {
      console.log(`✅ [修复策略3成功] 强制修复，解析到 ${fixed3.shots.length} 个镜头`);
      return fixed3;
    }
  } catch (e) {
    console.warn('修复策略3失败:', e instanceof Error ? e.message : e);
  }

  // 策略4: 激进截断 - 截断到错误位置之前的最后一个完整镜头
  try {
    const fixed4 = fixByAggressiveTruncation(fullText, originalError);
    if (fixed4 && fixed4.shots.length > 0) {
      console.log(`✅ [修复策略4成功] 激进截断，解析到 ${fixed4.shots.length} 个镜头`);
      return fixed4;
    }
  } catch (e) {
    console.warn('修复策略4失败:', e instanceof Error ? e.message : e);
  }

  // 所有策略都失败
  throw new Error(`❌ 无法解析镜头设计结果（已尝试5种修复策略）: ${originalError instanceof Error ? originalError.message : '未知错误'}`);
}

/**
 * 修复策略1: 智能截断到最后一个完整对象
 */
function fixBySmartTruncation(fullText: string): { shots: ShotDesign[] } | null {
  const shotsMatch = fullText.match(/"shots"\s*:\s*\[/);
  if (!shotsMatch) return null;

  const shotsStartIndex = shotsMatch.index! + shotsMatch[0].length;
  const shotsContent = fullText.slice(shotsStartIndex);

  // 找到所有完整的对象
  let depth = 0;
  let lastCompleteIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < shotsContent.length; i++) {
    const char = shotsContent[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          // 检查下一个字符
          const remaining = shotsContent.slice(i + 1);
          const nextChar = remaining.match(/^\s*([,\]])/);
          if (nextChar) {
            lastCompleteIndex = i;
          }
        }
      }
    }
  }

  if (lastCompleteIndex > 0) {
    let fixedContent = shotsContent.slice(0, lastCompleteIndex + 1);
    // 移除尾随逗号并闭合数组
    fixedContent = fixedContent.trim();
    if (fixedContent.endsWith(',')) {
      fixedContent = fixedContent.slice(0, -1);
    }
    const fixedJson = `{"shots": [${fixedContent}]}`;

    // 清理并解析
    const cleaned = fixedJson
      .replace(/,\s*]/g, ']')
      .replace(/,\s*}/g, '}');

    return JSON.parse(cleaned);
  }

  return null;
}

/**
 * 修复策略2: 逐个提取完整的镜头对象
 */
function fixByExtractingShots(fullText: string): { shots: ShotDesign[] } | null {
  const shots: ShotDesign[] = [];

  // 更宽松的正则：匹配包含 shotNumber 的对象
  const shotPattern = /\{\s*"shotNumber"\s*:\s*\d+[\s\S]*?\}/g;

  let match: RegExpExecArray | null;
  while ((match = shotPattern.exec(fullText)) !== null) {
    try {
      // 尝试解析这个对象
      const shotStr = match[0];
      const shot = JSON.parse(shotStr);

      // 验证必需字段
      if (shot.shotNumber && shot.description && shot.aiPrompt) {
        shots.push(shot);
      }
    } catch {
      // 跳过无法解析的对象
    }
  }

  return shots.length > 0 ? { shots } : null;
}

/**
 * 修复策略3: 修复常见的JSON语法错误
 */
function fixCommonJSONErrors(fullText: string): { shots: ShotDesign[] } | null {
  let fixed = fullText;

  // 1. 移除注释
  fixed = fixed.replace(/\/\/[^\n]*\n/g, '\n');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  // 2. 修复缺少逗号的情况（属性值后直接换行接新属性）
  fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');
  fixed = fixed.replace(/(\d+)\s*\n\s*"/g, '$1,\n"');
  fixed = fixed.replace(/true\s*\n\s*"/g, 'true,\n"');
  fixed = fixed.replace(/false\s*\n\s*"/g, 'false,\n"');

  // 3. 移除多余的逗号
  fixed = fixed.replace(/,\s*]/g, ']');
  fixed = fixed.replace(/,\s*}/g, '}');

  // 4. 修复未闭合的字符串（简单情况）
  const lines = fixed.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const quoteCount = (line.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0 && line.includes(':')) {
      // 可能是未闭合的字符串值
      if (!line.trim().endsWith('"') && !line.trim().endsWith(',')) {
        lines[i] = line + '"';
      }
    }
  }
  fixed = lines.join('\n');

  // 5. 尝试提取JSON
  const jsonMatch = fixed.match(/\{[\s\S]*"shots"\s*:\s*\[[\s\S]*\]\s*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // 如果还是失败，尝试截断到最后一个完整对象
      const truncated = truncateToLastCompleteObject(jsonMatch[0]);
      if (truncated) {
        try {
          return JSON.parse(truncated);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  return null;
}

/**
 * 辅助函数：截断到最后一个完整对象
 */
function truncateToLastCompleteObject(jsonText: string): string | null {
  const shotsMatch = jsonText.match(/"shots"\s*:\s*\[/);
  if (!shotsMatch) return null;

  const shotsStartIndex = shotsMatch.index! + shotsMatch[0].length;
  const shotsContent = jsonText.slice(shotsStartIndex);

  let depth = 0;
  let lastCompleteIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < shotsContent.length; i++) {
    const char = shotsContent[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          lastCompleteIndex = i;
        }
      }
    }
  }

  if (lastCompleteIndex > 0) {
    let fixedContent = shotsContent.slice(0, lastCompleteIndex + 1);
    fixedContent = fixedContent.trim();
    if (fixedContent.endsWith(',')) {
      fixedContent = fixedContent.slice(0, -1);
    }
    return `{"shots": [${fixedContent}]}`;
  }

  return null;
}

/**
 * 修复策略4: 强制修复 - 定位错误位置并修复
 * 根据错误信息定位到具体位置，尝试修复
 */
function forceFixJSONAtErrorPosition(fullText: string, error: any): { shots: ShotDesign[] } | null {
  // 提取错误位置信息
  const errorMsg = error instanceof Error ? error.message : String(error);
  const positionMatch = errorMsg.match(/position (\d+)/);

  if (!positionMatch) {
    console.warn('[强制修复] 无法从错误信息中提取位置');
    return null;
  }

  const errorPosition = parseInt(positionMatch[1], 10);
  console.log(`[强制修复] 错误位置: ${errorPosition}`);

  // 提取JSON部分
  const jsonMatch = fullText.match(/\{[\s\S]*"shots"\s*:\s*\[[\s\S]*$/);
  if (!jsonMatch) {
    console.warn('[强制修复] 无法找到shots数组');
    return null;
  }

  let jsonText = jsonMatch[0];

  // 在错误位置附近查找问题
  const contextStart = Math.max(0, errorPosition - 100);
  const contextEnd = Math.min(jsonText.length, errorPosition + 100);
  const context = jsonText.slice(contextStart, contextEnd);

  console.log(`[强制修复] 错误位置附近的内容:\n${context}`);

  // 常见问题修复
  // 1. 缺少逗号（在属性之间）
  jsonText = jsonText.replace(/"\s*\n\s*"/g, '",\n"');

  // 1.1 修复对象属性之间缺少逗号的问题
  // 匹配模式：属性值后面直接跟着新的属性名（没有逗号）
  jsonText = jsonText.replace(/("\s*)\n(\s*"[^"]+"\s*:)/g, '$1,\n$2');

  // 1.2 修复对象结束后缺少逗号的问题
  jsonText = jsonText.replace(/}\s*\n\s*{/g, '},\n{');

  // 2. 多余的逗号
  jsonText = jsonText.replace(/,\s*]/g, ']');
  jsonText = jsonText.replace(/,\s*}/g, '}');

  // 3. 修复未闭合的对象（在aiPrompt等嵌套对象中）
  // 如果发现 "aiPrompt": { 后面没有闭合，尝试添加 }
  jsonText = jsonText.replace(/"aiPrompt"\s*:\s*\{\s*$/gm, '"aiPrompt": {}');

  // 4. 未闭合的字符串（在错误位置附近）
  const lines = jsonText.split('\n');
  let currentPos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineStart = currentPos;
    const lineEnd = currentPos + lines[i].length;

    if (errorPosition >= lineStart && errorPosition <= lineEnd) {
      // 这是错误所在的行
      console.log(`[强制修复] 错误在第 ${i + 1} 行: ${lines[i]}`);

      // 检查是否缺少引号
      const line = lines[i];
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        // 奇数个引号，可能缺少闭合引号
        console.log('[强制修复] 检测到未闭合的引号，尝试修复');
        lines[i] = line + '"';
      }

      // 检查是否缺少逗号（更严格的检查）
      if (i < lines.length - 1) {
        const trimmedLine = line.trim();
        const nextLine = lines[i + 1].trim();

        // 如果当前行是属性值结束（以 " 或 } 结尾），下一行是新属性开始（以 " 开头）
        if ((trimmedLine.endsWith('"') || trimmedLine.endsWith('}')) &&
            !trimmedLine.endsWith(',') &&
            !trimmedLine.endsWith('{') &&
            !trimmedLine.endsWith('[') &&
            (nextLine.startsWith('"') || nextLine.startsWith('{'))) {
          console.log('[强制修复] 检测到缺少逗号，尝试修复');
          lines[i] = line + ',';
        }
      }

      // 检查下一行是否也有问题
      if (i < lines.length - 1) {
        const nextLine = lines[i + 1];
        const nextQuoteCount = (nextLine.match(/"/g) || []).length;
        if (nextQuoteCount % 2 !== 0) {
          console.log(`[强制修复] 下一行（第 ${i + 2} 行）也有未闭合的引号: ${nextLine}`);
          lines[i + 1] = nextLine + '"';
        }
      }

      break;
    }

    currentPos = lineEnd + 1; // +1 for newline
  }

  jsonText = lines.join('\n');

  // 4. 截断到最后一个完整的对象
  const lastCloseBrace = jsonText.lastIndexOf('}');
  if (lastCloseBrace > 0) {
    // 检查后面是否有逗号或数组闭合
    const remaining = jsonText.slice(lastCloseBrace + 1);
    if (!remaining.includes(']')) {
      // 需要闭合数组
      jsonText = jsonText.slice(0, lastCloseBrace + 1) + ']}';
    }
  }

  // 尝试解析修复后的JSON
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed.shots && Array.isArray(parsed.shots) && parsed.shots.length > 0) {
      console.log(`[强制修复] 成功修复，解析到 ${parsed.shots.length} 个镜头`);
      return parsed;
    }
  } catch (e) {
    console.warn('[强制修复] 修复后仍然无法解析:', e instanceof Error ? e.message : e);
  }

  return null;
}

/**
 * 修复策略5: 激进截断 - 截断到错误位置之前的最后一个完整镜头
 */
function fixByAggressiveTruncation(fullText: string, error: any): { shots: ShotDesign[] } | null {
  // 提取错误位置
  const errorMsg = error instanceof Error ? error.message : String(error);
  const positionMatch = errorMsg.match(/position (\d+)/);

  if (!positionMatch) {
    console.warn('[激进截断] 无法从错误信息中提取位置');
    return null;
  }

  const errorPosition = parseInt(positionMatch[1], 10);
  console.log(`[激进截断] 错误位置: ${errorPosition}，尝试截断到之前的最后一个完整镜头`);

  // 提取JSON部分
  const jsonMatch = fullText.match(/\{[\s\S]*"shots"\s*:\s*\[[\s\S]*$/);
  if (!jsonMatch) {
    console.warn('[激进截断] 无法找到shots数组');
    return null;
  }

  let jsonText = jsonMatch[0];

  // 截断到错误位置之前
  const beforeError = jsonText.slice(0, errorPosition);

  // 找到最后一个完整的镜头对象（以 } 结尾）
  const lastShotEnd = beforeError.lastIndexOf('}');
  if (lastShotEnd === -1) {
    console.warn('[激进截断] 无法找到完整的镜头对象');
    return null;
  }

  // 截断到最后一个完整镜头
  let truncated = beforeError.slice(0, lastShotEnd + 1);

  // 闭合数组和对象
  truncated += '\n]}';

  console.log(`[激进截断] 截断后的JSON长度: ${truncated.length}，原长度: ${jsonText.length}`);

  // 尝试解析
  try {
    const parsed = JSON.parse(truncated);
    if (parsed.shots && Array.isArray(parsed.shots) && parsed.shots.length > 0) {
      console.log(`[激进截断] 成功解析，得到 ${parsed.shots.length} 个镜头`);
      return parsed;
    }
  } catch (e) {
    console.warn('[激进截断] 解析失败:', e instanceof Error ? e.message : e);
  }

  return null;
}

// ============================================
// 阶段5：质量自检与优化
// ============================================

import { buildStage5Prompt, type ShotDesignResult } from '../prompts/chain-of-thought/stage5-quality-review';
import type { QualityCheck } from '../prompts/chain-of-thought/types';

/**
 * 生成阶段5：质量自检与优化
 */
export async function* generateStage5Review(
  stage1Result: ScriptAnalysis,
  stage2Result: VisualStrategy,
  allShots: ShotDesignResult[],
  model: string = DEFAULT_THINKING_MODEL
): AsyncGenerator<string, string, unknown> {
  const prompt = buildStage5Prompt(stage1Result, stage2Result, allShots);

  console.log('[DEBUG] 开始调用阶段5 API...');
  console.log('[DEBUG] 模型:', model);
  console.log('[DEBUG] 提示词长度:', prompt.length, '字符');
  console.log('[DEBUG] 审核镜头数:', allShots.length);

  try {
    const client = getClient(model);
    const stream = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5, // 更低的温度以获得更一致的评估
      max_tokens: 8192,
      stream: true,
    });

    console.log('[DEBUG] 阶段5 API 调用成功，开始接收流式数据...');

    let fullText = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullText += content;
        yield content;
      }
    }

    console.log('\n[DEBUG] 阶段5流式数据接收完成，总长度:', fullText.length, '字符');

    return fullText;
  } catch (error) {
    logApiError('generateStage5Review', error);
    throw error;
  }
}

/**
 * 解析阶段5的输出
 */
export function parseStage5Output(fullText: string): QualityCheck {
  try {
    const result = mergeThinkingAndResult<any>(
      fullText,
      ['overallScore', 'categoryScores', 'issues']
    );

    return result as QualityCheck;
  } catch (error) {
    console.error('解析阶段5输出失败:', error);
    throw new Error(`无法解析质量审核结果: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// ============================================
// 兼容 gemini.ts 的函数 - 用于 App.tsx
// ============================================

import type { Shot, ReviewSuggestion } from '../types';
import { buildExtractCharactersPrompt } from '../prompts/extractCharactersPrompt';
import { buildCleanScriptPrompt } from '../prompts/cleanScriptPrompt';
import { buildGenerateShotListPrompt } from '../prompts/generateShotListPrompt';
import { buildReviewStoryboardPrompt } from '../prompts/reviewStoryboardPrompt';
import { buildExtractImagePromptsPrompt } from '../prompts/extractImagePromptsPrompt';
import { buildChatEditShotListPrompt } from '../prompts/chatEditShotListPrompt';

const cleanJsonOutput = (text: string): string => {
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

/**
 * 安全解析自检返回的 JSON 数组，自动修复常见的小错误。
 *
 * 入参：期望为 ReviewSuggestion[] 的 JSON 字符串，可以包含换行与轻微格式问题。
 * 出参：解析成功时返回 ReviewSuggestion[]；否则返回空数组，不抛出异常，
 *       具体错误由调用方按需记录日志。
 */
const safeParseReviewSuggestions = (text: string): ReviewSuggestion[] => {
  const tryParse = (input: string): ReviewSuggestion[] | null => {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? (parsed as ReviewSuggestion[]) : null;
    } catch {
      return null;
    }
  };

  let jsonStr = text.trim();
  if (!jsonStr) {
    return [];
  }

  // 1️⃣ 直接尝试解析
  let result = tryParse(jsonStr);
  if (result) return result;

  // 2️⃣ 修复常见的尾逗号错误: `,]` / `,}`
  let fixed = jsonStr.replace(/,\s*([}\]])/g, '$1');
  result = tryParse(fixed);
  if (result) return result;

  // 3️⃣ 修复因换行导致的未闭合字符串（简单场景）
  fixed = fixed.replace(/:\s*"([^"\n]*)\n/g, ': "$1",\n');
  result = tryParse(fixed);
  if (result) return result;

  // 4️⃣ 截断到最后一个闭合的 ] 或 }
  const lastBracket = fixed.lastIndexOf(']');
  const lastBrace = fixed.lastIndexOf('}');
  const cutPos = Math.max(lastBracket, lastBrace);
  if (cutPos > 0) {
    const truncated = fixed.substring(0, cutPos + 1);
    result = tryParse(truncated);
    if (result) return result;
  }

  return [];
};

// ============================================
// 剧本清洗功能
// ============================================

/**
 * 从剧本中提取角色信息
 */
export async function extractCharactersFromScript(
  script: string,
  model: string = DEFAULT_MODEL
): Promise<Array<{ name: string; gender: '男' | '女' | '未知'; appearance: string }>> {
  const prompt = buildExtractCharactersPrompt(script);

  try {
    const client = getClient(model);
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
    });

    const text = response.choices[0]?.message?.content || '[]';

    // 提取JSON数组
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonStr = text.substring(jsonStart, jsonEnd + 1);
      return JSON.parse(jsonStr);
    }

    return [];
  } catch (error) {
    logApiError('extractCharactersFromScript', error);
    return [];
  }
}

/**
 * 清洗剧本（流式）- 分离画面内容和非画面信息
 */
export async function* cleanScriptStream(
  script: string,
  model: string = DEFAULT_MODEL
): AsyncGenerator<string, void, unknown> {
  const prompt = buildCleanScriptPrompt(script);

  try {
    const client = getClient(model);
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 8000, // 增加输出长度，避免JSON被截断
    });

    let fullText = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullText += content;
      yield fullText;
    }
  } catch (error) {
    logApiError('cleanScriptStream', error);
    throw error;
  }
}

/**
 * 生成分镜脚本（流式）- 兼容 gemini.ts 的 generateShotListStream
 */
export async function* generateShotListStream(
  script: string,
  customPrompt: string,
  model: string = DEFAULT_MODEL,
  characterRefs: CharacterRef[] = []
) {
  // 构建角色描述信息
  const characterDescriptions = characterRefs.length > 0
    ? `
  ## 角色设定（必须在分镜中保持一致）
  ${characterRefs.map(c => `- **${c.name}**：请根据上传的角色设定图保持外观一致`).join('\n')}

  ⚠️ 重要：在每个镜头的提示词(promptCn/promptEn)中，必须包含出场角色的外观特征描述，确保AI绘图时能保持角色一致性。
  `
    : '';

  const contentInput = buildGenerateShotListPrompt(script, customPrompt, characterDescriptions);

  const client = getClient(model);
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: contentInput }],
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullText += content;
    yield fullText;
  }
}

/**
 * 审核分镜脚本 - 兼容 gemini.ts 的 reviewStoryboard
 */
export async function reviewStoryboardOpenRouter(
  shots: Shot[],
  customCriteria: string,
  model: string = DEFAULT_MODEL
): Promise<ReviewSuggestion[]> {
  // 计算当前镜头数量，用于检查是否不足
  const currentShotCount = shots.length;
  const minimumShotCount = 24; // 最少镜头数
  const shotCountWarning = currentShotCount < minimumShotCount
    ? `\n\n  ## 🚨🚨🚨 镜头数量严重不足！

  **当前只有 ${currentShotCount} 个镜头，最少需要 ${minimumShotCount} 个！**

  这是最严重的问题，必须在第一条建议中指出！

  建议格式：
  {"shotNumber": "GLOBAL", "suggestion": "镜头数量严重不足！当前${currentShotCount}个，需要增加至少${minimumShotCount - currentShotCount}个镜头。建议：1.为动作段落增加准备/效果镜头 2.增加环境反应镜头 3.增加角色反应特写", "reason": "镜头数量过少会导致节奏过快、叙事不完整。标准90秒动画需要24-30个镜头。"}`
    : '';

  const contentInput = buildReviewStoryboardPrompt(shots, customCriteria, currentShotCount, shotCountWarning);

  const client = getClient(model);
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: contentInput }],
    max_tokens: 12000, // 🔧 从4000提升到12000，防止32个镜头自检JSON被截断
  });

	  const rawText = response.choices[0]?.message?.content || '[]';

	  // 先移除 markdown 代码块标记，再增强 JSON 提取 - 找到数组边界
	  let jsonText = cleanJsonOutput(rawText);
	  const jsonStart = jsonText.indexOf('[');
	  const jsonEnd = jsonText.lastIndexOf(']');

	  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
	    jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
	  }

	  const suggestions = safeParseReviewSuggestions(jsonText);
	  if (suggestions.length === 0 && jsonText.trim()) {
	    // 仅在有内容但完全解析失败时输出错误日志，方便后续排查
	    console.error('自检 JSON 解析失败，原始文本:', rawText);
	  }

	  return suggestions;
}

/**
 * 优化分镜脚本（流式）- 兼容 gemini.ts 的 optimizeShotListStream
 */
export async function* optimizeShotListStream(
  shots: Shot[],
  suggestions: ReviewSuggestion[],
  model: string = DEFAULT_MODEL
) {
  const prompt = `Task: Update storyboard JSON based on Director's Review.

  Strict Rules:
  - Apply the suggestions to update shot details.
  - If angle or camera move changes, update the corresponding fields.
  - Keep prompts PURE (no style tags). Style will be added later at render time.
  - Return COMPLETE JSON array of all shots with the same structure.
  - Return ONLY valid JSON array, no markdown code blocks.

  Data: ${JSON.stringify(shots)}
  Suggestions: ${JSON.stringify(suggestions)}`;

  const client = getClient(model);
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullText += content;
    yield fullText;
  }
}

/**
 * 与导演对话（流式）- 兼容 gemini.ts 的 chatWithDirectorStream
 */
export async function* chatWithDirectorStream(
  history: { role: string; content: string }[],
  userInstruction: string,
  model: string = DEFAULT_MODEL
) {
  const prompt = `You are an expert Storyboard Director (Framed Ink style).
  The user is consulting you about the storyboard.

  Your Goal:
  1. Analyze the user's request.
  2. Provide professional advice based on Cinematic Theory (180 rule, composition, lighting).
  3. If the user asks to "Make it more dramatic", suggest specific Camera Angles (Dutch, Low, Extreme Close-up).
  4. Output natural language in Chinese (Markdown allowed).

  Chat History:
  ${JSON.stringify(history)}

  User Input: "${userInstruction}"`;

  const client = getClient(model);
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    yield content;
  }
}

/**
 * ================================================================================
 * 🆕 提取AI生图提示词（Nano Banana Pro专用）
 * ================================================================================
 * 根据官方手册公式：[主体描述] + [环境/背景] + [动作/状态] + [技术参数(景别/角度/光影)]
 * 不含美术风格！风格在生图时由用户选择后附加。
 */
export async function* extractImagePromptsStream(
	  shots: Shot[],
	  model: string = DEFAULT_MODEL
	) {
  const prompt = buildExtractImagePromptsPrompt(shots);

  const client = getClient(model);
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    max_tokens: 32000, // 🔧 32个镜头×5个字段，输出体积大，必须设上限防止HTTP/2流超时中断
  });

  let fullText = '';
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullText += content;
    yield fullText;
  }
}

/**
 * 根据对话修改分镜（流式）- 兼容 gemini.ts 的 chatEditShotListStream
 */
export async function* chatEditShotListStream(
  shots: Shot[],
  userInstruction: string,
  model: string = DEFAULT_MODEL
) {
  const prompt = buildChatEditShotListPrompt(shots, userInstruction);

  const client = getClient(model);
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullText += content;
    yield fullText;
  }
}

/**
 * 🆕 下载图片并上传到 OSS
 * @param imageUrl Neodomain 返回的临时图片 URL
 * @param projectId 项目 ID
 * @param gridIndex 九宫格索引
 * @returns OSS 永久 URL
 */
async function downloadAndUploadToOSS(
  imageUrl: string,
  projectId: string,
  gridIndex: number
): Promise<string> {
  try {
    console.log(`[OSS] 开始下载九宫格图片 #${gridIndex + 1}: ${imageUrl.substring(0, 50)}...`);

    // 1. 下载图片
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    console.log(`[OSS] 图片下载成功，大小: ${(blob.size / 1024).toFixed(2)} KB`);

    // 2. 生成 OSS 路径
    const { generateOSSPath } = await import('./oss');
    const timestamp = Date.now();
    const ossPath = `storyboard/${projectId}/nine-grid/grid_${gridIndex}_${timestamp}.jpg`;

    // 3. 上传到 OSS
    const { uploadToOSS } = await import('./oss');
    const ossUrl = await uploadToOSS(blob, ossPath, (percent) => {
      if (percent % 20 === 0) {  // 每20%打印一次日志
        console.log(`[OSS] 九宫格 #${gridIndex + 1} 上传进度: ${percent}%`);
      }
    });

    console.log(`[OSS] ✅ 九宫格 #${gridIndex + 1} 上传成功: ${ossUrl}`);
    return ossUrl;
  } catch (error) {
    console.error(`[OSS] ❌ 九宫格 #${gridIndex + 1} 上传失败:`, error);
    // 上传失败时返回原始 URL（降级方案）
    console.warn(`[OSS] 降级使用 Neodomain 临时 URL: ${imageUrl}`);
    return imageUrl;
  }
}

/**
 * 🆕 使用 Neodomain API 生成单张图像
 * 替代原有的 OpenRouter 图像生成
 * 🔧 支持模型降级：nanobanana-pro → doubao-seedream-4.5
 * ✅ 动态获取模型名称，符合 Neodomain API 规范
 */
async function generateSingleImage(
  prompt: string,
  imageModel: string = DEFAULT_NEODOMAIN_IMAGE_MODEL,
  characterRefs: CharacterRef[] = [],
  onTaskCreated?: (taskCode: string) => void | Promise<void>,
  imageUrls?: string[]  // 🆕 角色参考图 URL 列表
): Promise<string | null> {
  // 动态导入 neodomain API
  const { generateImage, pollGenerationResult, TaskStatus, getModelsByScenario, ScenarioType } = await import('./aiImageGeneration');

  // 🔧 模型降级配置（使用关键词匹配，不区分大小写）
  const PRIMARY_MODEL_KEYWORDS = ['nano', 'banana', 'pro'];  // 匹配 "Nano Banana Pro"（必须包含 pro）
  const FALLBACK_MODEL_KEYWORDS = ['seedream'];  // 匹配 "Seedream 4.5" 或 "doubao-seedream-4-5"

  // ✅ 动态获取分镜场景下的可用模型列表
  console.log('[Neodomain] 获取分镜场景可用模型列表...');
  let availableModels;
  try {
    availableModels = await getModelsByScenario(ScenarioType.STORYBOARD);
    console.log(`[Neodomain] 获取到 ${availableModels.length} 个可用模型:`, availableModels.map(m => ({
      name: m.model_name,
      display: m.model_display_name,
      desc: m.model_description
    })));
  } catch (error) {
    console.error('[Neodomain] 获取模型列表失败:', error);
    throw new Error('无法获取可用模型列表，请稍后重试');
  }

  // 🔍 查找目标模型（通过关键词匹配 model_display_name）
  const findModelByKeywords = (keywords: string[]) => {
    return availableModels.find(m => {
      const displayNameLower = m.model_display_name.toLowerCase();
      const modelNameLower = m.model_name.toLowerCase();
      // 所有关键词都必须在 display_name 或 model_name 中出现
      return keywords.every(keyword =>
        displayNameLower.includes(keyword.toLowerCase()) ||
        modelNameLower.includes(keyword.toLowerCase())
      );
    });
  };

  const primaryModel = findModelByKeywords(PRIMARY_MODEL_KEYWORDS);
  const fallbackModel = findModelByKeywords(FALLBACK_MODEL_KEYWORDS);

  if (!primaryModel && !fallbackModel) {
    console.error('[Neodomain] 未找到可用的生图模型');
    console.error('[Neodomain] 可用模型列表:', availableModels.map(m => m.model_display_name));
    throw new Error('未找到可用的生图模型，请联系管理员');
  }

  // ✅ 优先使用 Nano Banana Pro，如果不可用则使用降级模型
  const preferredModel = primaryModel || fallbackModel;
  const preferredModelName = preferredModel!.model_name;

  console.log(`[Neodomain] ✅ 使用模型: ${preferredModelName} (显示名: ${preferredModel!.model_display_name})`);

  // 🔧 尝试使用首选模型
  try {
    console.log(`[Neodomain] 图像生成请求 (模型: ${preferredModelName}): ${prompt.substring(0, 100)}...`);

    const task = await generateImage({
      prompt: prompt,
	      negativePrompt: 'blurry, low quality, watermark, signature, logo, text, typography, letters, numbers, digits, caption, subtitle, label, annotations, UI overlay, distorted, deformed',
      modelName: preferredModelName,  // ✅ 使用动态获取的 model_name
      imageUrls: imageUrls && imageUrls.length > 0 ? imageUrls : undefined,  // 🆕 角色参考图
      numImages: '1',
      aspectRatio: '16:9',  // 九宫格分镜草图使用16:9横版
      size: '2K',           // 2K分辨率，平衡质量和速度
      outputFormat: 'jpeg',
      guidanceScale: 7.5,
      showPrompt: false,
    });

    console.log(`[Neodomain] 任务已提交: ${task.task_code}`);

			// 🆕 任务创建后立即回调（用于把 taskCode 持久化到 D1，支持断网/刷新自动恢复）
			if (onTaskCreated) {
				try {
					await Promise.resolve(onTaskCreated(task.task_code));
				} catch (err) {
					console.warn('[Neodomain] onTaskCreated 回调执行失败（忽略，不影响继续轮询）:', err);
				}
			}

    // 轮询查询结果
    const result = await pollGenerationResult(
      task.task_code,
      (status, attempt) => {
        console.log(`[Neodomain] 生成状态: ${status}, 第${attempt}次查询`);
      }
    );

    // 检查生成结果
    if (result.status === TaskStatus.SUCCESS && result.image_urls && result.image_urls.length > 0) {
      const imageUrl = result.image_urls[0];
      console.log(`[Neodomain] ✅ 图像生成成功 (模型: ${preferredModelName})`);
      return imageUrl;
    } else if (result.status === TaskStatus.FAILED) {
      console.error(`[Neodomain] ❌ 图像生成失败 (模型: ${preferredModelName}):`, result.failure_reason);

      // 🔧 如果是会员限制错误且使用的是主模型，尝试降级
      const isMembershipError = result.failure_reason?.includes('会员') ||
                                result.failure_reason?.includes('membership') ||
                                result.failure_reason?.includes('权限');

      if (isMembershipError && primaryModel && preferredModel === primaryModel && fallbackModel) {
        console.warn(`[Neodomain] ${preferredModel.model_display_name} 会员限制，降级到 ${fallbackModel.model_display_name}`);
        throw new Error('MEMBERSHIP_REQUIRED'); // 触发降级逻辑
      }

      return null;
    } else {
      console.warn('[Neodomain] ⚠️ 未获取到生成的图片');
      return null;
    }
  } catch (error) {
    // 🔧 如果是会员限制错误且使用的是主模型，尝试降级到备用模型
    const isMembershipError = error instanceof Error && error.message === 'MEMBERSHIP_REQUIRED';
    const shouldFallback = isMembershipError && primaryModel && preferredModel === primaryModel && fallbackModel;

    if (shouldFallback) {
      console.warn(`[Neodomain] 🔄 降级到备用模型: ${fallbackModel!.model_display_name} (${fallbackModel!.model_name})`);

      try {
        const fallbackTask = await generateImage({
          prompt: prompt,
	          negativePrompt: 'blurry, low quality, watermark, signature, logo, text, typography, letters, numbers, digits, caption, subtitle, label, annotations, UI overlay, distorted, deformed',
          modelName: fallbackModel!.model_name,  // ✅ 使用备用模型的 model_name
          imageUrls: imageUrls && imageUrls.length > 0 ? imageUrls : undefined,  // 🆕 角色参考图
          numImages: '1',
          aspectRatio: '16:9',
          size: '2K',
          outputFormat: 'jpeg',
          guidanceScale: 7.5,
          showPrompt: false,
        });

        console.log(`[Neodomain] 备用模型任务已提交: ${fallbackTask.task_code}`);

				// 🆕 若发生降级，则以备用任务的 taskCode 覆盖持久化（确保恢复时拿到真实可用任务）
				if (onTaskCreated) {
					try {
						await Promise.resolve(onTaskCreated(fallbackTask.task_code));
					} catch (err) {
						console.warn('[Neodomain] onTaskCreated(备用任务) 回调执行失败（忽略）:', err);
					}
				}

        const fallbackResult = await pollGenerationResult(
          fallbackTask.task_code,
          (status, attempt) => {
            console.log(`[Neodomain] 备用模型生成状态: ${status}, 第${attempt}次查询`);
          }
        );

        if (fallbackResult.status === TaskStatus.SUCCESS && fallbackResult.image_urls && fallbackResult.image_urls.length > 0) {
          const imageUrl = fallbackResult.image_urls[0];
          console.log(`[Neodomain] ✅ 备用模型生成成功 (${fallbackModel!.model_display_name})`);
          return imageUrl;
        } else {
          console.error(`[Neodomain] ❌ 备用模型生成失败:`, fallbackResult.failure_reason);
          return null;
        }
      } catch (fallbackError) {
        console.error(`[Neodomain] 备用模型生成失败:`, fallbackError);
        return null;
      }
    }

    console.error('[Neodomain] 图像生成失败:', error);
    return null;
  }
}

/**
 * 生成九宫格分镜草图 - 直接让AI生成包含9个分镜的九宫格图
 * 每张九宫格包含9个镜头（3x3布局），生成一张显示一张
 * 27个镜头 → 3张九宫格图
 * 🆕 支持上传到 OSS（生成后自动上传，返回永久 URL）
 */
export async function generateMergedStoryboardSheet(
  shots: Shot[],
  characterRefs: CharacterRef[],
  mode: 'draft' | 'hq',
  imageModel: string = DEFAULT_NEODOMAIN_IMAGE_MODEL,
  style?: StoryboardStyle,
  onProgress?: (current: number, total: number, shotNumber: string) => void,
  onGridComplete?: (gridIndex: number, imageUrl: string) => void,
  onTaskCreated?: (taskCode: string, gridIndex: number) => void | Promise<void>,
  episodeNumber?: number,  // 🆕 当前集数，用于匹配角色形态
  scenes?: SceneRef[],     // 🆕 场景库，用于匹配场景描述
  artStyleType?: ArtStyleType,  // 🆕 美术风格类型，用于调整提示词
  projectId?: string,  // 🆕 项目 ID，用于上传到 OSS
  abortSignal?: AbortSignal  // 🆕 取消信号，用于停止生成
): Promise<string[]> {
  const styleName = style?.name || '粗略线稿';
  const styleSuffix = style?.promptSuffix || 'rough sketch, black and white, storyboard style';
  // ✅ 强制锁定生图模型：始终使用 nanobanana-pro（降级逻辑在 generateSingleImage 内处理）
  const requestedModel = imageModel;
  const effectiveModel = 'nanobanana-pro';
  const ignoredHint = requestedModel && requestedModel !== effectiveModel ? `, 忽略请求模型: ${requestedModel}` : '';
  console.log(`[OpenRouter] 九宫格AI生成请求: ${shots.length} 个镜头, 锁定模型: ${effectiveModel}${ignoredHint}, 风格: ${styleName}${episodeNumber ? `, 第${episodeNumber}集` : ''}${artStyleType ? `, 美术风格: ${artStyleType}` : ''}`);

  const GRID_SIZE = 9; // 每张图9个镜头 (3x3)
  const totalGrids = Math.ceil(shots.length / GRID_SIZE);
  let results: string[] = [];

  // 🆕 构建场景描述信息（如果有场景库）
  const sceneSection = scenes ? buildSceneDescriptionsForPrompt(scenes, episodeNumber) : '';

  // 🆕 构建美术风格约束
  const artStyleSection = artStyleType ? getArtStyleConstraints(artStyleType) : '';

  // 🚀 并行生成所有九宫格图（同时生成，不等待）
  console.log(`[OpenRouter] 🚀 开始并行生成 ${totalGrids} 张九宫格...`);

  // 🔧 优化：提前获取模型列表（避免每次生成都调用API）
  const { generateImage, pollGenerationResult, TaskStatus, getModelsByScenario, ScenarioType } = await import('./aiImageGeneration');

  console.log('[OpenRouter] 获取分镜场景可用模型列表...');
  let availableModels;
  try {
    availableModels = await getModelsByScenario(ScenarioType.STORYBOARD);
    console.log(`[OpenRouter] 获取到 ${availableModels.length} 个可用模型`);
  } catch (error) {
    console.error('[OpenRouter] 获取模型列表失败:', error);
    throw new Error('无法获取可用模型列表，请稍后重试');
  }

  // 🔍 查找目标模型
  const PRIMARY_MODEL_KEYWORDS = ['nano', 'banana', 'pro'];
  const FALLBACK_MODEL_KEYWORDS = ['seedream'];

  const findModelByKeywords = (keywords: string[]) => {
    return availableModels.find(m => {
      const displayNameLower = m.model_display_name.toLowerCase();
      const modelNameLower = m.model_name.toLowerCase();
      return keywords.every(keyword =>
        displayNameLower.includes(keyword.toLowerCase()) ||
        modelNameLower.includes(keyword.toLowerCase())
      );
    });
  };

  const primaryModel = findModelByKeywords(PRIMARY_MODEL_KEYWORDS);
  const fallbackModel = findModelByKeywords(FALLBACK_MODEL_KEYWORDS);
  const preferredModel = primaryModel || fallbackModel;

  if (!preferredModel) {
    throw new Error('未找到可用的生图模型');
  }

  const preferredModelName = preferredModel.model_name;
  console.log(`[OpenRouter] ✅ 使用模型: ${preferredModelName} (${preferredModel.model_display_name})`);

  // 🆕 获取角色参考图信息（根据集数匹配形态的设定图）
  const characterRefImages = getCharacterReferenceImagesForEpisode(characterRefs, episodeNumber);
  // 根据模型支持的最大参考图数量进行截断
  const maxRefImages = preferredModel.max_reference_images || 0;
  const limitedRefImages = maxRefImages > 0 ? characterRefImages.slice(0, maxRefImages) : characterRefImages;
  const referenceImageUrls = limitedRefImages.map(r => r.imageUrl);
  if (limitedRefImages.length > 0) {
    console.log(`[OpenRouter] 📸 角色参考图: ${limitedRefImages.length}张（模型最大支持${maxRefImages}张）`, limitedRefImages.map(r => `${r.name}(${r.briefDesc})`));
    if (characterRefImages.length > limitedRefImages.length) {
      console.warn(`[OpenRouter] ⚠️ 角色参考图超过模型限制，已截断: ${characterRefImages.length} → ${limitedRefImages.length}`);
    }
  }

  // 初始化 results 数组（预留位置）
  results = new Array(totalGrids).fill('');

  // 创建所有生成任务
  const generationTasks = Array.from({ length: totalGrids }, (_, gridIndex) => {
    return (async () => {
      // 🆕 错开提交时间：每张延迟 gridIndex * 1500ms，避免同时冲击 Neodomain API 导致并发冲突
      if (gridIndex > 0) {
        const staggerDelay = gridIndex * 1500;
        console.log(`[OpenRouter] 九宫格 #${gridIndex + 1} 错开 ${staggerDelay}ms 后提交...`);
        await new Promise(resolve => setTimeout(resolve, staggerDelay));
      }

      // 检查是否被取消
      if (abortSignal?.aborted) {
        console.log(`[OpenRouter] 九宫格 #${gridIndex + 1} 已被用户停止`);
        return;
      }

      const startIdx = gridIndex * GRID_SIZE;
      const endIdx = Math.min(startIdx + GRID_SIZE, shots.length);
      const gridShots = shots.slice(startIdx, endIdx);

      console.log(`[OpenRouter] 🎬 开始生成第 ${gridIndex + 1}/${totalGrids} 张九宫格 (镜头 #${startIdx + 1} - #${endIdx})`);

      // 构建九宫格提示词（🆕 传入角色参考图信息，用于在提示词中添加 [图N] 标记）
      const gridPrompt = buildNineGridPrompt(
        gridShots,
        gridIndex + 1,
        totalGrids,
        styleSuffix,
        styleName,
        characterRefs,
        episodeNumber,
        sceneSection,
        artStyleSection,
        limitedRefImages
      );

      try {
        // 🔧 直接调用 Neodomain API（不再调用 generateSingleImage，避免重复获取模型）
        // 🆕 添加并发冲突自动重试：遇到 BIZ_ERROR/数据并发冲突时，指数退避后重试
        const MAX_SUBMIT_RETRIES = 3;
        let task;
        for (let attempt = 0; attempt < MAX_SUBMIT_RETRIES; attempt++) {
          try {
            console.log(`[OpenRouter] 提交生成任务 #${gridIndex + 1}${attempt > 0 ? ` (第${attempt + 1}次尝试)` : ''}...`);
            task = await generateImage({
              prompt: gridPrompt,
              negativePrompt: 'blurry, low quality, watermark, signature, logo, text, typography, letters, numbers, digits, caption, subtitle, label, annotations, UI overlay, distorted, deformed',
              modelName: preferredModelName,
              imageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,  // 🆕 上传角色参考图
              numImages: '1',
              aspectRatio: '16:9',
              size: '2K',
              outputFormat: 'jpeg',
              guidanceScale: 7.5,
              showPrompt: false,
            });
            break; // 提交成功，退出重试循环
          } catch (submitError) {
            const errMsg = String((submitError as any)?.message || submitError);
            const isConflict = errMsg.includes('并发冲突') || errMsg.includes('BIZ_ERROR');
            if (isConflict && attempt < MAX_SUBMIT_RETRIES - 1) {
              const retryDelay = (attempt + 1) * 3000; // 3s, 6s 指数退避
              console.warn(`[OpenRouter] ⚠️ 任务 #${gridIndex + 1} 并发冲突，${retryDelay / 1000}s 后重试...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
              throw submitError; // 非冲突错误或已达最大重试次数，直接抛出
            }
          }
        }
        if (!task) throw new Error(`任务 #${gridIndex + 1} 提交失败`);

        console.log(`[OpenRouter] ✅ 任务 #${gridIndex + 1} 已提交: ${task.task_code}`);

        // 任务创建后立即回调
        if (onTaskCreated) {
          try {
            await Promise.resolve(onTaskCreated(task.task_code, gridIndex));
          } catch (err) {
            console.warn(`[OpenRouter] 任务 #${gridIndex + 1} 回调失败:`, err);
          }
        }

        // 回调进度
        if (onProgress) {
          onProgress(gridIndex + 1, totalGrids, `第${gridIndex + 1}张九宫格`);
        }

        // 轮询查询结果
        console.log(`[OpenRouter] 开始轮询任务 #${gridIndex + 1}...`);
        const result = await pollGenerationResult(
          task.task_code,
          (status, attempt) => {
            if (attempt % 5 === 0) { // 每5次查询打印一次日志
              console.log(`[OpenRouter] 任务 #${gridIndex + 1} 状态: ${status}, 第${attempt}次查询`);
            }
          }
        );

        if (result.status === TaskStatus.SUCCESS && result.image_urls && result.image_urls.length > 0) {
          const imageUrl = result.image_urls[0];
          console.log(`[OpenRouter] ✅ 九宫格 #${gridIndex + 1} 生成成功`);
          console.log(`[OpenRouter] 图片 URL: ${imageUrl}`);

          // 保存到 results 数组
          results[gridIndex] = imageUrl;

          // 立即回调显示图片
          if (onGridComplete) {
            onGridComplete(gridIndex, imageUrl);
          }
        } else {
          console.warn(`[OpenRouter] ❌ 第 ${gridIndex + 1} 张九宫格生成失败: ${result.failure_reason}`);
          results[gridIndex] = '';
        }
      } catch (error) {
        console.error(`[OpenRouter] ❌ 第 ${gridIndex + 1} 张九宫格生成异常:`, error);
        results[gridIndex] = '';
      }
    })();
  });

  // 等待所有任务完成
  console.log(`[OpenRouter] ⏳ 等待 ${totalGrids} 个并行任务完成...`);
  await Promise.all(generationTasks);

  console.log(`[OpenRouter] 🎉 所有九宫格生成完成！成功: ${results.filter(r => r).length}/${totalGrids}`);
  return results;
}

/**
 * 🆕 单独生成某一张九宫格图片
 * @param gridIndex 九宫格索引（从0开始）
 * @param shots 所有镜头列表
 * @param characterRefs 角色参考图列表
 * @param imageModel 图像生成模型
 * @param style 分镜风格
 * @param episodeNumber 当前集数
 * @param scenes 场景库
 * @param artStyleType 美术风格类型
 * @param projectId 项目 ID，用于上传到 OSS
 * @returns 生成的图片URL，失败返回null
 */
export async function generateSingleGrid(
  gridIndex: number,
  shots: Shot[],
  characterRefs: CharacterRef[],
  imageModel: string = DEFAULT_NEODOMAIN_IMAGE_MODEL,
  style?: StoryboardStyle,
  episodeNumber?: number,
  scenes?: SceneRef[],
  artStyleType?: ArtStyleType,
	onTaskCreated?: (taskCode: string) => void | Promise<void>,
  projectId?: string  // 🆕 项目 ID
): Promise<string | null> {
  const GRID_SIZE = 9; // 每张图9个镜头 (3x3)
  const totalGrids = Math.ceil(shots.length / GRID_SIZE);

  // 验证索引
  if (gridIndex < 0 || gridIndex >= totalGrids) {
    console.error(`[OpenRouter] 无效的九宫格索引: ${gridIndex}，总共 ${totalGrids} 张`);
    return null;
  }

  const styleName = style?.name || '粗略线稿';
  const styleSuffix = style?.promptSuffix || 'rough sketch, black and white, storyboard style';

  // 🔧 动态获取模型列表（与批量生成保持一致，获取 max_reference_images 信息）
  const { generateImage, pollGenerationResult, TaskStatus, getModelsByScenario, ScenarioType } = await import('./aiImageGeneration');

  console.log('[OpenRouter] 单格重绘 - 获取分镜场景可用模型列表...');
  let availableModels;
  try {
    availableModels = await getModelsByScenario(ScenarioType.STORYBOARD);
  } catch (error) {
    console.error('[OpenRouter] 获取模型列表失败:', error);
    throw new Error('无法获取可用模型列表，请稍后重试');
  }

  // 🔍 查找目标模型（与批量生成逻辑一致）
  const PRIMARY_MODEL_KEYWORDS = ['nano', 'banana', 'pro'];
  const FALLBACK_MODEL_KEYWORDS = ['seedream'];
  const findModelByKeywords = (keywords: string[]) => {
    return availableModels.find(m => {
      const displayNameLower = m.model_display_name.toLowerCase();
      const modelNameLower = m.model_name.toLowerCase();
      return keywords.every(keyword =>
        displayNameLower.includes(keyword.toLowerCase()) ||
        modelNameLower.includes(keyword.toLowerCase())
      );
    });
  };

  const primaryModel = findModelByKeywords(PRIMARY_MODEL_KEYWORDS);
  const fallbackModel = findModelByKeywords(FALLBACK_MODEL_KEYWORDS);
  const preferredModel = primaryModel || fallbackModel;

  if (!preferredModel) {
    throw new Error('未找到可用的生图模型');
  }

  const effectiveModel = preferredModel.model_name;
  console.log(`[OpenRouter] 单独生成第 ${gridIndex + 1}/${totalGrids} 张九宫格, 模型: ${effectiveModel} (${preferredModel.model_display_name}), 风格: ${styleName}`);

  // 计算该九宫格包含的镜头范围
  const startIdx = gridIndex * GRID_SIZE;
  const endIdx = Math.min(startIdx + GRID_SIZE, shots.length);
  const gridShots = shots.slice(startIdx, endIdx);

  // 构建场景描述信息
  const sceneSection = scenes ? buildSceneDescriptionsForPrompt(scenes, episodeNumber) : '';

  // 构建美术风格约束
  const artStyleSection = artStyleType ? getArtStyleConstraints(artStyleType) : '';

  // 🔧 获取角色参考图并按模型限制截断（与批量生成保持一致）
  const characterRefImages = getCharacterReferenceImagesForEpisode(characterRefs, episodeNumber);
  const maxRefImages = preferredModel.max_reference_images || 0;
  const limitedRefImages = maxRefImages > 0 ? characterRefImages.slice(0, maxRefImages) : characterRefImages;
  const referenceImageUrls = limitedRefImages.map(r => r.imageUrl);
  if (limitedRefImages.length > 0) {
    console.log(`[OpenRouter] 📸 单格重绘 - 角色参考图: ${limitedRefImages.length}张（模型最大支持${maxRefImages}张）`, limitedRefImages.map(r => `${r.name}(${r.briefDesc})`));
    if (characterRefImages.length > limitedRefImages.length) {
      console.warn(`[OpenRouter] ⚠️ 角色参考图超过模型限制，已截断: ${characterRefImages.length} → ${limitedRefImages.length}`);
    }
  }

  // 构建九宫格提示词（传入截断后的角色参考图信息）
  const gridPrompt = buildNineGridPrompt(
    gridShots,
    gridIndex + 1,
    totalGrids,
    styleSuffix,
    styleName,
    characterRefs,
    episodeNumber,
    sceneSection,
    artStyleSection,
    limitedRefImages
  );

  // 🔧 直接调用 Neodomain API（与批量生成一致，不再调用 generateSingleImage 避免重复获取模型）
  console.log(`[OpenRouter] 提交单格重绘任务 #${gridIndex + 1}...`);
  const task = await generateImage({
    prompt: gridPrompt,
    negativePrompt: 'blurry, low quality, watermark, signature, logo, text, typography, letters, numbers, digits, caption, subtitle, label, annotations, UI overlay, distorted, deformed',
    modelName: effectiveModel,
    imageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
    numImages: '1',
    aspectRatio: '16:9',
    size: '2K',
    outputFormat: 'jpeg',
    guidanceScale: 7.5,
    showPrompt: false,
  });

  // 任务创建后立即回调
  if (onTaskCreated) {
    try {
      await Promise.resolve(onTaskCreated(task.task_code));
    } catch (err) {
      console.warn(`[OpenRouter] 单格重绘任务回调失败:`, err);
    }
  }

  // 轮询查询结果
  console.log(`[OpenRouter] 开始轮询单格重绘任务...`);
  const result = await pollGenerationResult(
    task.task_code,
    (status, attempt) => {
      if (attempt % 5 === 0) {
        console.log(`[OpenRouter] 单格重绘状态: ${status}, 第${attempt}次查询`);
      }
    }
  );

  const tempImageUrl = (result.status === TaskStatus.SUCCESS && result.image_urls && result.image_urls.length > 0)
    ? result.image_urls[0]
    : null;

  if (tempImageUrl) {
    // 🔧 Neodomain 返回的 URL 已经是 OSS 永久 URL，无需再次上传
    console.log(`[OpenRouter] ✅ 第 ${gridIndex + 1} 张九宫格生成成功`);
    console.log(`[OpenRouter] 图片 URL: ${tempImageUrl}`);

    // 直接返回 Neodomain 的 OSS URL
    return tempImageUrl;
  } else {
    console.warn(`[OpenRouter] 第 ${gridIndex + 1} 张九宫格生成失败`);
    return null;
  }
}

	/**
	 * 构建九宫格提示词 - 让AI直接生成一张包含9个分镜的图
	 * ⚠️ 为了后续切割：整张图禁止任何文字/数字/标题/页码/水印，仅输出画面内容 + 网格。
	 * 并强调镜头角度（通过英文摄影术语约束生图）。
 * 风格通过 styleSuffix 附加
 * 角色信息通过 characterRefs 提供外观描述
 * 🆕 episodeNumber 用于匹配角色在该集的正确形态
 * 🆕 sceneSection 提供场景库的视觉描述
 * 🆕 artStyleSection 提供美术风格约束
 */
function buildNineGridPrompt(
  shots: Shot[],
  pageNum: number,
  totalPages: number,
  styleSuffix: string,
  styleName: string,
  characterRefs: CharacterRef[] = [],
  episodeNumber?: number,       // 🆕 当前集数，用于匹配角色形态
  sceneSection: string = '',    // 🆕 场景描述信息
  artStyleSection: string = '', // 🆕 美术风格约束
  characterRefImages: { name: string; briefDesc: string; imageUrl: string }[] = []  // 🆕 角色参考图信息
): string {
  // 🆕 精确角度参数映射（防止AI生图误解，如3/4正面变成正面）
  // 每个角度都有精确的角度范围描述，确保AI生图模型理解正确
  const angleDirectionPrecision: Record<string, string> = {
    // 正面系列
    '正面(Front)': 'front view, face looking DIRECTLY at camera (0° horizontal rotation), both eyes and ears equally visible',
    'Front': 'front view, face looking DIRECTLY at camera (0° horizontal rotation), both eyes and ears equally visible',
    'front': 'front view, face looking DIRECTLY at camera (0° horizontal rotation), both eyes and ears equally visible',
    // 3/4正面 - 最容易被误画成正面的角度！
    '3/4正面(3/4 Front)': '(3/4 front view:1.3), face turned 35-45° away from camera, (one cheek more prominent:1.2), far ear partially hidden, clear asymmetric face',
    '3/4 Front': '(3/4 front view:1.3), face turned 35-45° away from camera, (one cheek more prominent:1.2), far ear partially hidden, clear asymmetric face',
    '3/4 front': '(3/4 front view:1.3), face turned 35-45° away from camera, (one cheek more prominent:1.2), far ear partially hidden, clear asymmetric face',
    // 1/3侧面
    '1/3侧面(1/3 Side)': '1/3 side view, face turned 55-65° from camera, showing dominant profile with some far cheek visible',
    '1/3 Side': '1/3 side view, face turned 55-65° from camera, showing dominant profile with some far cheek visible',
    // 正侧面
    '正侧面(Full Side)': '(perfect profile view:1.3), face turned exactly 90° from camera, (only one side of face visible:1.2), nose silhouette clear',
    'Full Side': '(perfect profile view:1.3), face turned exactly 90° from camera, (only one side of face visible:1.2), nose silhouette clear',
    'full side': '(perfect profile view:1.3), face turned exactly 90° from camera, (only one side of face visible:1.2), nose silhouette clear',
    // 1/3背面
    '1/3背面(1/3 Back)': '1/3 back view, face turned 115-125° from camera, showing mostly profile with back of head visible',
    '1/3 Back': '1/3 back view, face turned 115-125° from camera, showing mostly profile with back of head visible',
    // 3/4背面
    '3/4背面(3/4 Back)': '(3/4 back view:1.2), face turned 135-150° from camera, (mostly back of head:1.2), only ear and slight cheek contour visible',
    '3/4 Back': '(3/4 back view:1.2), face turned 135-150° from camera, (mostly back of head:1.2), only ear and slight cheek contour visible',
    // 背面
    '背面(Back)': '(back view:1.3), showing only back of head (180° rotation), (no face visible:1.2), only hair and shoulders',
    'Back': '(back view:1.3), showing only back of head (180° rotation), (no face visible:1.2), only hair and shoulders',
    'back': '(back view:1.3), showing only back of head (180° rotation), (no face visible:1.2), only hair and shoulders',
    // 🆕 主观视角（POV）
    '主观视角(POV)': '(POV shot:1.4), (first-person perspective:1.3), viewing scene from character eyes, no character face visible in frame',
    'POV': '(POV shot:1.4), (first-person perspective:1.3), viewing scene from character eyes, no character face visible in frame',
    'pov': '(POV shot:1.4), (first-person perspective:1.3), viewing scene from character eyes, no character face visible in frame'
  };

  const angleHeightPrecision: Record<string, string> = {
    // 俯视系列
    '鸟瞰(Bird Eye)': '(extreme bird eye view:1.4), camera DIRECTLY above looking straight down (85-90° angle), (top of head dominant:1.3), body foreshortened vertically',
    'Bird Eye': '(extreme bird eye view:1.4), camera DIRECTLY above looking straight down (85-90° angle), (top of head dominant:1.3), body foreshortened vertically',
    '极端俯拍(Extreme High)': '(extreme high angle:1.3), camera 55-75° above eye level, (top of head very prominent:1.2), face foreshortened, body compressed',
    'Extreme High': '(extreme high angle:1.3), camera 55-75° above eye level, (top of head very prominent:1.2), face foreshortened, body compressed',
    '中度俯拍(Moderate High)': 'moderate high angle, camera 30-45° above eye level, noticeable downward perspective',
    'Moderate High': 'moderate high angle, camera 30-45° above eye level, noticeable downward perspective',
    '轻微俯拍(Mild High)': 'mild high angle, camera 10-25° above eye level, subtle downward tilt',
    'Mild High': 'mild high angle, camera 10-25° above eye level, subtle downward tilt',
    // 平视
    '平视(Eye Level)': 'eye level shot, camera at SAME height as subject face, neutral horizon line',
    'Eye Level': 'eye level shot, camera at SAME height as subject face, neutral horizon line',
    // 仰视系列
    '轻微仰拍(Mild Low)': 'mild low angle, camera 10-25° below eye level, subtle upward tilt',
    'Mild Low': 'mild low angle, camera 10-25° below eye level, subtle upward tilt',
    '中度仰拍(Moderate Low)': 'moderate low angle, camera 30-45° below eye level, noticeable upward perspective',
    'Moderate Low': 'moderate low angle, camera 30-45° below eye level, noticeable upward perspective',
    '极端仰拍(Extreme Low)': '(extreme low angle:1.3), camera 55-75° below eye level, (chin prominent:1.2), body towering upward',
    'Extreme Low': '(extreme low angle:1.3), camera 55-75° below eye level, (chin prominent:1.2), body towering upward',
    '仰拍(Low Angle)': 'low angle, camera 25-40° below eye level, looking up at subject',
    'Low Angle': 'low angle, camera 25-40° below eye level, looking up at subject',
    '俯拍(High Angle)': 'high angle, camera 25-40° above eye level, looking down at subject',
    'High Angle': 'high angle, camera 25-40° above eye level, looking down at subject',
    '蚁视(Worm Eye)': '(worm eye view:1.4), camera almost at ground level (80-90° below), looking STRAIGHT UP, (extreme foreshortening:1.3)',
    'Worm Eye': '(worm eye view:1.4), camera almost at ground level (80-90° below), looking STRAIGHT UP, (extreme foreshortening:1.3)'
  };

	  // Panel position names (avoid digits like 1-9 to reduce the chance of the model drawing numbers)
	  const panelPositionNames = [
	    'top left',
	    'top center',
	    'top right',
	    'middle left',
	    'center',
	    'middle right',
	    'bottom left',
	    'bottom center',
	    'bottom right',
	  ];
	  const getPanelPositionName = (idx: number) => panelPositionNames[idx] || 'unknown panel';

	// 构建每个格子的场景描述（注意：此处是“提示词文本”，但为了避免生图把这些编号当作需要画出来的文字，尽量不出现镜号/页码/数字标注）
	const panelDescriptions = shots.map((shot, idx) => {
		const panelPos = getPanelPositionName(idx);
		const isMotion = shot.shotType === '运动';

    // 获取角度信息（优先使用结构化字段，其次从文本提取）
    const getAngleLabel = (): { cn: string; en: string; preciseEn: string } => {
      // 优先使用结构化字段
      const heightCn = shot.angleHeight || '';
      const directionCn = shot.angleDirection || '';

      if (heightCn || directionCn) {
        // 🆕 使用术语映射将分镜术语转换为摄影术语
        // 直接在这里实现映射，避免动态导入的复杂性
        const angleHeightCn = convertAngleHeightToPhotography(heightCn);
        const angleDirectionCn = convertAngleDirectionToPhotography(directionCn);
        const cnLabel = [angleHeightCn, angleDirectionCn].filter(Boolean).join('，');

        // 提取英文部分（简单版本）
        const heightEn = heightCn.match(/\(([^)]+)\)/)?.[1] || '';
        const directionEn = directionCn.match(/\(([^)]+)\)/)?.[1] || '';
        const enLabel = [heightEn, directionEn].filter(Boolean).join(', ');

        // 🆕 获取精确英文描述（用于生图提示词）
        const preciseHeightEn = angleHeightPrecision[heightCn] || heightEn;
        const preciseDirectionEn = angleDirectionPrecision[directionCn] || directionEn;
        const preciseEnLabel = [preciseHeightEn, preciseDirectionEn].filter(Boolean).join('; ');

        return { cn: cnLabel, en: enLabel, preciseEn: preciseEnLabel };
      }

      // 从文本中提取角度信息
      // 🔧 修复：支持 storyBeat 的两种类型
      const storyBeatText = typeof shot.storyBeat === 'string'
        ? shot.storyBeat
        : (shot.storyBeat?.event || '');
      const text = shot.promptCn || storyBeatText || '';
      const angleMap: { pattern: RegExp; cn: string; en: string; preciseEn: string }[] = [
        { pattern: /极端仰拍|Extreme Low/i, cn: '极端仰拍', en: 'Extreme Low Angle', preciseEn: 'extreme low angle, camera 50-70° below eye level, looking up sharply' },
        { pattern: /极端俯拍|Bird's Eye|鸟瞰/i, cn: '极端俯拍/鸟瞰', en: 'Bird Eye View', preciseEn: 'extreme overhead shot, camera directly above (80-90° down)' },
        { pattern: /仰拍|Low Angle/i, cn: '仰拍', en: 'Low Angle', preciseEn: 'low angle, camera 25-40° below eye level' },
        { pattern: /俯拍|High Angle/i, cn: '俯拍', en: 'High Angle', preciseEn: 'high angle, camera 25-40° above eye level' },
        { pattern: /平视|Eye Level/i, cn: '平视', en: 'Eye Level', preciseEn: 'eye level shot, camera at same height as subject' },
      ];

      for (const { pattern, cn, en, preciseEn } of angleMap) {
        if (pattern.test(text)) {
          return { cn, en, preciseEn };
        }
      }
      return { cn: '', en: '', preciseEn: '' };
    };

		const angleLabel = getAngleLabel();
		// 🆕 使用精确角度描述，防止AI生图误解
    const angleInstruction = angleLabel.preciseEn
      ? `[CAMERA ANGLE: ${angleLabel.preciseEn}] ← MUST draw from this EXACT angle!`
      : (angleLabel.en ? `[CAMERA: ${angleLabel.en}] ← MUST draw from this angle!` : '');

    // 运动镜头：需要显示首帧和尾帧
    if (isMotion) {
      // 使用英文画面描述，但添加角度强调
      const startFrame = shot.imagePromptEn || shot.promptEn || shot.startFrame || 'scene start';

      // 🆕 修复尾帧默认值问题：如果尾帧为空，使用首帧而非 'scene end'
      let endFrame = shot.endImagePromptEn || shot.endFramePromptEn || shot.endFrame;
      if (!endFrame) {
        console.warn(`⚠️ 镜头 #${shot.shotNumber} 是运动镜头，但缺少尾帧描述！使用首帧作为尾帧。`);
        endFrame = startFrame;  // 使用首帧作为尾帧，保证画面一致性
      }

				return `${panelPos} panel (motion):
	${angleInstruction ? angleInstruction + '\n' : ''}Left half (start frame): ${startFrame}
	Right half (end frame): ${endFrame}
	IMPORTANT: Do NOT draw any text, labels, numbers, arrows, or captions inside the panel.`;
    } else {
      // 静态镜头：单帧
      const sceneDesc = shot.imagePromptEn || shot.promptEn || shot.promptCn || 'empty scene';

			return `${panelPos} panel (still):
	${angleInstruction ? angleInstruction + '\n' : ''}Scene content: ${sceneDesc}
	IMPORTANT: Do NOT draw any text, labels, numbers, or captions inside the panel.`;
    }
  }).join('\n\n');

  // 填充空格子
  const emptyPanels = [];
  for (let i = shots.length; i < 9; i++) {
			const positionName = getPanelPositionName(i);
			emptyPanels.push(
				`${positionName} panel: leave this panel blank with a plain neutral background (e.g., light gray). Absolutely no text.`
			);
  }

  const allPanels = panelDescriptions + (emptyPanels.length > 0 ? '\n\n' + emptyPanels.join('\n') : '');

  // 🆕 构建角色描述信息（根据集数匹配正确的形态）
  const characterDescriptions = buildCharacterDescriptionsForEpisode(characterRefs, episodeNumber);
  const characterSection = characterDescriptions.length > 0
    ? `
═══════════════════════════════════════════════════════════════
【角色设定】请严格按照以下外观描述绘制角色！${episodeNumber ? ` (第${episodeNumber}集形态)` : ''}
═══════════════════════════════════════════════════════════════
${characterDescriptions.map(c => {
  const genderLabel = c.gender && c.gender !== '未知' ? `(${c.gender})` : '';
  const appearanceDesc = c.appearance
    ? `外观：${c.appearance}`
    : '请保持外观一致（发型、服装、体型）';
  // 🆕 如果有参考图，添加 [图N] 标记，让生图模型通过标记关联上传的参考图
  const refIdx = characterRefImages.findIndex(r => r.name === c.name);
  const refTag = refIdx >= 0 ? ` → 参考[图${refIdx + 1}]${characterRefImages[refIdx].briefDesc}` : '';
  return `• ${c.name}${genderLabel}：${appearanceDesc}${refTag}`;
}).join('\n')}

⚠️ 重要规则：
- 同一角色在不同镜头中必须可识别为同一个人
- 严格按照上述外观描述绘制，不可随意修改
- 角色的发型、服装、体型必须保持一致
${characterRefImages.length > 0 ? '- 请参考上传的角色设定图（[图N]）来绘制对应角色，确保角色外观与设定图一致\n' : ''}`
    : '';

		// ⚠️ 关键：为了后续等分切割，必须禁止任何标题/页码/镜号等文字元素，且要求网格边到边均分。
		return `Create a professional storyboard sheet as a strict three-by-three grid (nine equal panels) on a single wide landscape canvas.

================================================================================
LAYOUT (MUST FOLLOW)
================================================================================
	- The canvas is divided into exactly three columns and three rows.
	- All panels are EXACTLY the same size (equal width and equal height).
- The grid must fill the entire canvas edge-to-edge: NO title area, NO page header/footer, NO margins, NO extra whitespace.
- Use thin, uniform panel separators (optional) to make the grid clear, but do NOT add any labels.
	- Panel lines must be perfectly straight and axis-aligned (no perspective tilt, no irregular comic panels).

================================================================================
ABSOLUTE PROHIBITIONS (CRITICAL)
================================================================================
- NO text, NO words, NO numbers, NO captions, NO subtitles, NO labels, NO UI overlays.
- NO watermark, NO signature, NO logo, NO page number, NO frame index.
- Do not draw any Chinese or English characters anywhere.

${characterSection}${sceneSection}${artStyleSection}

================================================================================
PANELS (CONTENT ONLY — DO NOT WRITE ANY TEXT ON THE IMAGE)
================================================================================

${allPanels}

================================================================================
STYLE
================================================================================
- Visual style: ${styleSuffix}
- Keep all panels consistent in ${styleName} style.
- For motion panels: split the panel vertically into two equal halves (left = start frame, right = end frame). No arrows, no text.

================================================================================
QUALITY REQUIREMENTS
================================================================================
- Professional storyboard quality.
- Follow each panel's requested camera angle strictly.
- Keep the same character recognizable and consistent across panels.`;
}

/**
 * ================================================================================
 * 🆕 AI剧本集数拆分
 * ================================================================================
 * 当文件名无集数信息时，用AI检测并拆分多集内容。
 * 返回各集的集号、标题（可选）、剧本内容。
 */

export interface EpisodeSplitResult {
  episodes: Array<{
    episodeNumber: number;
    title?: string;
    script: string;
  }>;
}

/**
 * 用AI将单个剧本文件拆分为多集
 *
 * @param scriptContent 剧本全文
 * @param model 使用的模型ID
 * @returns 拆分结果，episodes 数组；若未检测到多集则返回空数组或单集
 */
export async function splitEpisodesWithAI(
  scriptContent: string,
  model: string = DEFAULT_MODEL
): Promise<EpisodeSplitResult> {
  const prompt = `你是专业剧本编辑。请分析以下剧本内容，判断它是否包含多集内容（如"第一集"、"第二集"、"EP1"、"Episode 1"等分集标记）。

如果包含多集，请将各集内容分开，以JSON格式输出：
{
  "episodes": [
    { "episodeNumber": 1, "title": "集标题（如有）", "script": "本集完整剧本内容" },
    { "episodeNumber": 2, "title": "集标题（如有）", "script": "本集完整剧本内容" }
  ]
}

如果只有一集或无法识别分集，输出：
{
  "episodes": []
}

注意：
- 每集的 script 字段必须包含该集的完整剧本文字，不要省略。
- title 字段可选，没有标题时省略该字段。
- 只输出JSON，不要任何解释文字。

剧本内容：
${scriptContent.slice(0, 20000)}`;

  const client = getClient(model);
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    max_tokens: 16000,
  });

  const text = response.choices[0]?.message?.content || '';

  try {
    // 提取JSON（模型可能在JSON前后附加解释）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { episodes: [] };
    const parsed = JSON.parse(jsonMatch[0]) as EpisodeSplitResult;
    if (!Array.isArray(parsed.episodes)) return { episodes: [] };
    return parsed;
  } catch {
    console.error('[splitEpisodesWithAI] JSON解析失败:', text.slice(0, 200));
    return { episodes: [] };
  }
}
