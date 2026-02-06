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
 * 🆕 根据集数获取角色在该集应使用的形态描述
 * 如果角色有forms数组，会根据episodeRange匹配当前集数
 * 匹配逻辑：
 *   - "Ep 5" → 仅第5集
 *   - "Ep 1-20" → 第1到20集
 *   - "Ep 46+" → 第46集及以后
 */
export function getCharacterAppearanceForEpisode(
  character: CharacterRef,
  episodeNumber?: number
): string {
  // 如果没有集数或没有forms，返回基础外观
  if (!episodeNumber || !character.forms || character.forms.length === 0) {
    return character.appearance || '';
  }

  // 尝试匹配当前集数的形态
  for (const form of character.forms) {
    if (!form.episodeRange) continue;

    const range = form.episodeRange.trim();

    // 格式1: "Ep 5" - 仅该集
    const singleMatch = range.match(/^Ep\s*(\d+)$/i);
    if (singleMatch) {
      const ep = parseInt(singleMatch[1], 10);
      if (ep === episodeNumber) {
        return form.description || form.visualPromptCn || character.appearance || '';
      }
      continue;
    }

    // 格式2: "Ep 1-20" - 范围
    const rangeMatch = range.match(/^Ep\s*(\d+)\s*[-–]\s*(\d+)$/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (episodeNumber >= start && episodeNumber <= end) {
        return form.description || form.visualPromptCn || character.appearance || '';
      }
      continue;
    }

    // 格式3: "Ep 46+" - 该集及以后
    const plusMatch = range.match(/^Ep\s*(\d+)\+$/i);
    if (plusMatch) {
      const start = parseInt(plusMatch[1], 10);
      if (episodeNumber >= start) {
        return form.description || form.visualPromptCn || character.appearance || '';
      }
      continue;
    }
  }

  // 没有匹配到任何形态，返回基础外观
  return character.appearance || '';
}

/**
 * 🆕 为指定集数构建角色外观描述列表
 */
export function buildCharacterDescriptionsForEpisode(
  characters: CharacterRef[],
  episodeNumber?: number
): { name: string; gender?: string; appearance: string }[] {
  return characters.map(c => ({
    name: c.name,
    gender: c.gender,
    appearance: getCharacterAppearanceForEpisode(c, episodeNumber)
  }));
}

/**
 * 🆕 根据集数获取该集可用的场景列表
 */
export function getScenesForEpisode(
  scenes: SceneRef[],
  episodeNumber?: number
): SceneRef[] {
  if (!episodeNumber) return scenes;
  return scenes.filter(s =>
    s.appearsInEpisodes && s.appearsInEpisodes.includes(episodeNumber)
  );
}

/**
 * 🆕 构建场景描述信息，用于分镜生成
 */
export function buildSceneDescriptionsForPrompt(
  scenes: SceneRef[],
  episodeNumber?: number
): string {
  const episodeScenes = getScenesForEpisode(scenes, episodeNumber);
  if (episodeScenes.length === 0) return '';

  return `
═══════════════════════════════════════════════════════════════
【场景库】本集可用场景的视觉描述：
═══════════════════════════════════════════════════════════════
${episodeScenes.map(s => `• ${s.name}：${s.description}
  氛围：${s.atmosphere}
  提示词(CN)：${s.visualPromptCn}`).join('\n\n')}

⚠️ 当剧本提到以上场景时，请使用对应的视觉描述
`;
}

/**
 * 🆕 美术风格类型
 */
export type ArtStyleType = 'anime' | 'realistic' | '3d' | 'illustration' | 'unknown';

/**
 * 🆕 根据项目类型和视觉风格判断美术风格类型
 */
export function detectArtStyleType(genre: string, visualStyle: string): ArtStyleType {
  const combined = `${genre} ${visualStyle}`.toLowerCase();

  // 二次元/动漫风格关键词
  const animeKeywords = [
    '动漫', '动画', '二次元', 'anime', '日系', '漫画',
    '赛璐璐', '卡通', '插画', '番剧', '短剧动画'
  ];

  // 写实风格关键词
  const realisticKeywords = [
    '写实', '真人', '电影', 'realistic', 'photorealistic',
    '实拍', 'live action', '真实'
  ];

  // 3D风格关键词
  const threeDKeywords = [
    '3d', '三维', 'cg', '渲染', 'render', 'unreal', 'unity'
  ];

  // 插画风格关键词
  const illustrationKeywords = [
    '插画', '水彩', '油画', '手绘', 'illustration', 'painting'
  ];

  for (const keyword of animeKeywords) {
    if (combined.includes(keyword)) return 'anime';
  }
  for (const keyword of realisticKeywords) {
    if (combined.includes(keyword)) return 'realistic';
  }
  for (const keyword of threeDKeywords) {
    if (combined.includes(keyword)) return '3d';
  }
  for (const keyword of illustrationKeywords) {
    if (combined.includes(keyword)) return 'illustration';
  }

  return 'unknown';
}

/**
 * 🆕 根据美术风格生成提示词约束
 */
export function getArtStyleConstraints(artStyle: ArtStyleType): string {
  switch (artStyle) {
    case 'anime':
      return `
═══════════════════════════════════════════════════════════════
【🎨 美术风格约束：二次元/动漫】
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
✅ 使用3D渲染描述：
  - 3D模型质感、材质反射
  - 全局光照、环境光遮蔽
  - 虚幻引擎/Unity风格的画面
`;
    default:
      return '';
  }
}

// 支持两种环境：Vite (浏览器) 和 Node.js (测试)
const getApiKey = () => {
  // Vite 环境
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_OPENROUTER1_API_KEY;
  }
  // Node.js 环境
  return process.env.VITE_OPENROUTER1_API_KEY;
};

// 获取 DeepSeek API Key
const getDeepSeekApiKey = () => {
  // Vite 环境
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_DEEPSEEK_API_KEY;
  }
  // Node.js 环境
  return process.env.VITE_DEEPSEEK_API_KEY;
};

// 延迟创建客户端，确保环境变量已加载
let openRouterClient: OpenAI | null = null;
let deepSeekClient: OpenAI | null = null;

// 获取 OpenRouter 客户端
const getOpenRouterClient = () => {
  if (!openRouterClient) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(
        '未找到 VITE_OPENROUTER1_API_KEY 环境变量。\n' +
        '请确保 .env.local 文件存在，并包含：\n' +
        'VITE_OPENROUTER1_API_KEY=sk-or-v1-...'
      );
    }

    openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://visionary-storyboard-studio.app',
        'X-Title': 'Visionary Storyboard Studio',
      },
      dangerouslyAllowBrowser: true,
    });
  }
  return openRouterClient;
};

// 获取 DeepSeek 客户端
const getDeepSeekClient = () => {
  if (!deepSeekClient) {
    const apiKey = getDeepSeekApiKey();
    if (!apiKey) {
      throw new Error(
        '未找到 VITE_DEEPSEEK_API_KEY 环境变量。\n' +
        '请确保 .env.local 文件存在，并包含：\n' +
        'VITE_DEEPSEEK_API_KEY=sk-...'
      );
    }

    deepSeekClient = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }
  return deepSeekClient;
};

// 根据模型选择合适的客户端
const getClient = (model?: string) => {
  if (model && model.startsWith('deepseek-')) {
    return getDeepSeekClient();
  }
  return getOpenRouterClient();
};

/**
 * 可用的模型配置
 *
 * ╔════════════════════════════════════════════════════════════════════════════════╗
 * ║                   OpenRouter 模型价格表 (2025年12月)                             ║
 * ╠══════════════════════════════╦═══════════════╦═══════════════╦════════════════╣
 * ║ 模型                         ║ 输入 ($/M)    ║ 输出 ($/M)    ║ 备注           ║
 * ╠══════════════════════════════╬═══════════════╬═══════════════╬════════════════╣
 * ║ GPT-4o Mini                  ║ $0.15         ║ $0.60         ║ OpenAI经济型    ║
 * ║ Gemini 2.5 Flash             ║ $0.30         ║ $2.50         ║ Google快速型    ║
 * ║ Gemini 3 Flash Preview       ║ $0.50         ║ $3.00         ║ ✅ 默认推荐     ║
 * ║ Claude Haiku 4.5             ║ $1.00         ║ $5.00         ║ Anthropic快速型 ║
 * ║ Gemini 2.5 Pro               ║ $1.25         ║ $10.00        ║ Google高质量    ║
 * ║ Gemini 3 Pro Preview         ║ $1.25         ║ $10.00        ║ 思维链推理      ║
 * ║ Claude Sonnet 4.5            ║ $3.00         ║ $15.00        ║ 最高质量        ║
 * ╚══════════════════════════════╩═══════════════╩═══════════════╩════════════════╝
 *
 * 数据来源: https://openrouter.ai/models (2025-12-23)
 */
// 按价格从便宜到贵排序
export const MODELS = {
  // 1. DeepSeek Chat - ¥1/¥2 (约$0.14/$0.28) 最便宜
  DEEPSEEK_CHAT: 'deepseek-chat',

  // 2. GPT-4o Mini - $0.15/$0.60
  GPT_4O_MINI: 'openai/gpt-4o-mini',

  // 3. Gemini 2.5 Flash - $0.30/$2.50
  GEMINI_2_5_FLASH: 'google/gemini-2.5-flash',

  // 4. Gemini 3 Flash Preview - $0.50/$3.00 ✅ 默认推荐
  GEMINI_3_FLASH_PREVIEW: 'google/gemini-3-flash-preview',

  // 5. Claude Haiku 4.5 - $1.00/$5.00
  CLAUDE_HAIKU_4_5: 'anthropic/claude-haiku-4.5',

  // 6. Gemini 2.5 Pro - $1.25/$10.00
  GEMINI_2_5_PRO: 'google/gemini-2.5-pro',

  // 7. Gemini 3 Pro Preview - $1.25/$10.00
  GEMINI_3_PRO_PREVIEW: 'google/gemini-3-pro-preview',

  // 8. GPT-5 Mini (价格未知，暂列此处)
  GPT_5_MINI: 'openai/gpt-5-mini',

  // 9. Claude Sonnet 4.5 - $3.00/$15.00 最贵
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
 */
export const MODEL_CATEGORIES = {
  THINKING: [
    MODELS.GEMINI_3_PRO_PREVIEW,   // $1.25/$10
    MODELS.GEMINI_2_5_PRO,          // $1.25/$10
    MODELS.CLAUDE_SONNET_4_5,       // $3/$15
  ],
  FAST: [
    MODELS.DEEPSEEK_CHAT,           // ¥1/¥2 最便宜
    MODELS.GPT_4O_MINI,             // $0.15/$0.60
    MODELS.GEMINI_2_5_FLASH,        // $0.30/$2.50
    MODELS.GEMINI_3_FLASH_PREVIEW,  // $0.50/$3 ✅ 默认
    MODELS.CLAUDE_HAIKU_4_5,        // $1/$5
    MODELS.GPT_5_MINI,
  ],
  IMAGE: [
    MODELS.GEMINI_3_PRO_IMAGE_PREVIEW,
  ],
} as const;

/**
 * 模型显示名称（含价格信息，按价格从便宜到贵排序）
 */
export const MODEL_NAMES: Record<string, string> = {
  [MODELS.DEEPSEEK_CHAT]: 'DeepSeek V3 (¥1) 🔥最便宜',
  [MODELS.GPT_4O_MINI]: 'GPT-4o Mini ($0.15)',
  [MODELS.GEMINI_2_5_FLASH]: 'Gemini 2.5 Flash ($0.30)',
  [MODELS.GEMINI_3_FLASH_PREVIEW]: 'Gemini 3 Flash Preview ($0.50) ⭐推荐',
  [MODELS.CLAUDE_HAIKU_4_5]: 'Claude Haiku 4.5 ($1.00)',
  [MODELS.GEMINI_2_5_PRO]: 'Gemini 2.5 Pro ($1.25) 高质量',
  [MODELS.GEMINI_3_PRO_PREVIEW]: 'Gemini 3 Pro Preview ($1.25) 思维链',
  [MODELS.GPT_5_MINI]: 'GPT-5 Mini (最新)',
  [MODELS.CLAUDE_SONNET_4_5]: 'Claude Sonnet 4.5 ($3.00) 最强',
  [MODELS.GEMINI_3_PRO_IMAGE_PREVIEW]: 'Gemini 3 Pro Image (图像理解)',
};

/**
 * 默认模型配置
 * Gemini 3 Flash Preview 是目前最便宜的高质量模型
 */
export const DEFAULT_MODEL = MODELS.GEMINI_3_FLASH_PREVIEW;
export const DEFAULT_THINKING_MODEL = MODELS.GEMINI_3_FLASH_PREVIEW;
// Nano Banana Pro - 唯一的图像生成模型
export const DEFAULT_IMAGE_MODEL = 'google/gemini-3-pro-image-preview';

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
    console.error('生成分镜脚本失败:', error);
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
      max_tokens: 8192,
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
    console.error('[ERROR] 阶段1生成失败:', error);
    if (error instanceof Error) {
      console.error('[ERROR] 错误信息:', error.message);
    }
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
    console.error('[ERROR] 阶段2生成失败:', error);
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
    console.error('[ERROR] 阶段3生成失败:', error);
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
    console.error('[ERROR] 阶段4生成失败:', error);
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
    console.error('[ERROR] 阶段5生成失败:', error);
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

const BASE_ROLE_DEFINITION = `Role: AI 漫剧导演 & 提示词专家. You are an expert in Cinematic Storytelling (Framed Ink).`;

const cleanJsonOutput = (text: string): string => {
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
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
  const prompt = `
# 任务：从剧本中提取角色，并生成AI生图用的外观描述

## 剧本内容
\`\`\`
${script}
\`\`\`

## 提取要求
1. 识别所有有台词或有动作描述的主要角色（不含群众演员如"高手们"）
2. 根据名字推断性别（名字偏中性则标"未知"）
3. **为每个角色创作详细的视觉外观描述**（用于AI生图保持一致性）

## 外观描述要求（重要！）
外观描述必须是**可视化的设计说明**，包含以下要素：
- **发型发色**：如"浅棕色碎短发、蓬松有层次感"
- **面部特征**：如"深棕色狭长眼眸、五官清爽利落、表情平静带清冷感"
- **身形体态**：如"身形高挑纤瘦、肤色白皙、少年感体态"
- **服饰造型**：如"纯白色圆领宽松T恤、黑色修身长裤、黑白拼色运动鞋"
- **整体气质**：如"日系动漫风格、清瘦修长、简约干净气质"

❌ 错误示例："少年，声音沙哑，双手合十"（这是动作描述，不是外观）
✅ 正确示例："浅棕色碎短发少年，深棕色狭长眼眸，五官清爽利落，身形高挑纤瘦，穿白色圆领T恤和黑色长裤，简约干净气质"

## 输出格式
直接输出JSON数组：
[
  {"name": "晋安", "gender": "男", "appearance": "浅棕色碎短发、蓬松有层次感，深棕色狭长眼眸、五官清爽利落，身形高挑纤瘦、肤色白皙，穿纯白色宽松T恤、黑色修身长裤，日系动漫风格少年，简约干净气质"},
  {"name": "林溪", "gender": "女", "appearance": "黑色长直发、发丝柔顺，大眼睛、五官精致可爱，身材娇小纤细，穿浅色连衣裙，温柔甜美气质的少女"}
]

⚠️ 第一个字符必须是 [，最后一个字符必须是 ]
⚠️ 外观描述要详细具体，至少50字，用于AI生图
`;

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
    console.error('提取角色失败:', error);
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
  const prompt = `
# 任务：剧本清洗与预处理

你是一位资深电影分镜师，需要对剧本进行"清洗"，分离画面内容和非画面信息。

## 原始剧本
\`\`\`
${script}
\`\`\`

## 清洗规则

### 1. 信息分类
| 类型 | 处理方式 | 举例 |
|-----|---------|------|
| 角色动作 | ✅ 提取为画面内容 | "晋安双手合十" |
| 场景描述 | ✅ 提取为画面内容 | "波纹扩散" |
| 对白 | ✅ 单独提取 | "抓到你了……" |
| 字幕/UI | ✅ 提取为画内元素 | "[警告：核心温度 300%]" |
| **音效** | ⚠️ 提取为情绪标签 | "音效：滋滋声" → 情绪：紧张 |
| **BGM** | ⚠️ 提取为情绪标签 | "BGM：紧张音" → 情绪：恐惧 |
| **时间码** | ❌ 记录后忽略 | "(8–18s)" |
| **镜头建议** | ⚠️ 记录为参考 | "镜头：中景→特写" |

### 2. 提取设定约束
识别剧本中的规则/设定，这些在后续分镜中必须遵守：
- 如"无物理杀伤力" → 禁止画物体破碎/爆炸
- 如"虚拟空间" → 可以有数字化视觉效果

### 3. 评估剧情权重
分析每个场景的重要性，用于指导镜头分配：
- high: 核心事件/高潮/转折 → 建议3-5个镜头
- medium: 重要情节 → 建议2-3个镜头
- low: 铺垫/过渡 → 建议1-2个镜头

## 输出格式

⚠️ 严格要求：直接输出JSON对象，不要任何解释文字！
⚠️ 不要输出 \`\`\`json 代码块，直接输出 { 开头的JSON！
⚠️ 第一个字符必须是 {，最后一个字符必须是 }

{
  "cleanedScenes": [
    {
      "id": "01",
      "originalText": "原始剧本文本...",
      "visualContent": "纯画面内容：晋安双手合十，指尖有电火花",
      "dialogues": ["晋安：抓到你了……"],
      "uiElements": ["[警告：核心温度 300%]"],
      "moodTags": ["紧张", "科技恐惧"]
    }
  ],
  "audioEffects": ["血液接触电路的滋滋声", "虚拟空间扭曲声"],
  "musicCues": ["低沉电子紧张音"],
  "timeCodes": ["(8–18s)"],
  "cameraSuggestions": ["镜头：环绕推进", "镜头：中景→特写"],
  "constraints": [
    {
      "rule": "无物理杀伤力",
      "implication": "波纹不能破坏物体、不能有爆炸",
      "source": "波纹从晋安为圆心扩散，无物理杀伤力"
    }
  ],
  "sceneWeights": [
    {
      "sceneId": "01",
      "weight": "medium",
      "suggestedShots": 2,
      "reason": "开场铺垫，展示主角状态"
    },
    {
      "sceneId": "02",
      "weight": "high",
      "suggestedShots": 4,
      "reason": "核心事件：波纹扩散，规则崩塌"
    }
  ]
}
`;

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
    console.error('剧本清洗失败:', error);
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

  const contentInput = `
  ${BASE_ROLE_DEFINITION}

  你是专业的动画分镜师，需要将剧本转换为可执行的分镜脚本。

  ## 用户自定义指令
  ${customPrompt}
  ${characterDescriptions}

  ## 原始剧本
  ${script}

  ================================================================================
  ## 🧹 第一步：剧本预处理（内部思考，不输出）

  在生成分镜之前，先在内心对剧本进行"清洗"：

  ### 1. 分离画面 vs 非画面信息
  | 类型 | 处理方式 | 举例 |
  |-----|---------|------|
  | 角色动作 | ✅ 保留为画面核心 | "晋安双手合十" |
  | 场景描述 | ✅ 保留为画面核心 | "波纹从晋安为圆心扩散" |
  | 对白 | ✅ 保留，标注为对白 | "抓到你了……" |
  | 字幕/UI | ✅ 保留，标注为画内元素 | "[警告：核心温度 300%]" |
  | **音效** | ⚠️ 转为情绪参考，不画面化 | "音效：滋滋声" → 理解为紧张氛围，但不画"电路火花" |
  | **BGM** | ⚠️ 转为情绪参考，不画面化 | "BGM：电子紧张音" → 理解为科幻恐惧氛围 |
  | **时间码** | ❌ 忽略 | "(8–18s)" → 删除，不影响分镜 |
  | **镜头建议** | ⚠️ 仅作参考，不照搬 | "镜头：中景→特写" → 可以参考但根据情境调整 |

  ### 2. 提取剧本设定约束
  识别剧本中的"设定规则"，后续分镜不可违反：
  - 示例：原文"波纹从晋安为圆心扩散，无物理杀伤力"
  - 提取设定：【约束】波纹无物理杀伤力 → 禁止画"物体破碎/爆炸"

  ### 3. 剧情节拍权重分析
  分析每个场景段落的剧情重要性，用于指导镜头分配：
  - 核心事件（高潮/转折）→ 分配更多镜头（3-4个）
  - 过渡/铺垫场景 → 控制镜头数量（1-2个）
  - 单一动作不应拆分超过3个镜头

  ================================================================================
  ## 🎯 短剧漫剧节奏核心要求（必须遵守）

  ### 节奏原则（90秒时长，以秒为单位把控）
  1. **黄金10秒定生死**：开场必须直接切入冲突场景，不做冗余铺垫
     - ❌ 禁止：开场加"开场氛围渲染：天空中的电子眼俯瞰大地"这种与后续动作无直接关联的镜头
     - ✅ 正确：直接从主角的关键动作/冲突开始
  2. **场景快速切换**：多采用10-20秒的短场景，用硬切加快节奏
  3. **单一动作不过度拆分**：
     - 如"晋安双手合十"最多拆成2个镜头（过程+结果）
     - ❌ 禁止拆成5个以上：大远景→中景→特写→面部→瞳孔→...
  4. **不改剧本只丰富画面**：只能补充和丰富原剧本的画面表达，转为生动的动画语言，不要添加原剧本没有的剧情内容

  ### 🚨🚨🚨 镜头数量强制要求（最重要！必须遵守！）

  **🔢 计算公式：剧本段落数 × 3 = 最少镜头数**

  例如：8个剧本段落 × 3 = 最少24个镜头！

  | 剧本段落数 | 最少镜头数 | 推荐镜头数 |
  |-----------|----------|----------|
  | 6段 | 18个 | 22-26个 |
  | 8段 | 24个 | 28-32个 |
  | 10段 | 30个 | 35-40个 |

  ⚠️⚠️⚠️ **硬性规则（违反=任务失败）：**
  - **镜头数 < 剧本段落数×3 = 必须返工！**
  - **绝对禁止：镜头数 ≤ 剧本段落数（如8段只出8个镜头）**
  - **每个剧本段落 = 必须拆分为 3-5 个镜头！**

  ### 📋 剧本段落拆分规则（强制执行！）

  **剧本中的"01｜特写·晋安双手合十"这样的标记是「叙事段落」，不是「镜头」！**
  **每个叙事段落必须拆分为 3-5 个镜头！**

  | 剧本段落类型 | 最少镜头数 | 拆分方式示例 |
  |------------|----------|------------|
  | 角色动作段落 | 3个 | 准备→动作→效果 |
  | 对话段落 | 3个 | 说话者→反应→环境 |
  | 高潮/冲突段落 | 4-5个 | 起因→发展→高潮→反应→后果 |
  | 场景转换段落 | 3个 | 离开→过渡→到达 |

  **拆分示例：**
  剧本段落："01｜特写·晋安双手合十，字幕闪现[警告：核心温度300%]"

  ❌ 错误：只生成1个镜头
  ✅ 正确：拆分为3个镜头
    - 镜头01：晋安面部特写，眼神锐利
    - 镜头02：双手合十的动作特写
    - 镜头03：警告字幕叠加在晋安瞳孔上

  **如何增加镜头（必须执行！）**：
  1. **环境反应镜头**：如"波纹扫过武器架，武器架开始消融"
  2. **角色反应镜头**：如"魔教教主惊恐后退"、"众高手面面相觑"
  3. **UI/界面镜头**：如"系统警告弹窗大特写"、"错误代码快速滚动"
  4. **氛围渲染镜头**：如"天空裂开"、"地面出现裂纹"
  5. **细节特写镜头**：如"晋安手指颤抖"、"汗珠滑落"
  6. **过渡镜头**：如"光芒逐渐扩散"、"阴影笼罩广场"

  ### 开场节奏约束
  - 开场第一个场景最多3-4个镜头，不要超过5个

  ================================================================================
  ## 🎬 第二步：剧本缺口检测与补充（重要！）

  ### 🔍 什么是"剧本缺口"？

  剧本缺口是指相邻段落之间缺失的过渡动作或因果关系。

  **示例（来自当前剧本）**：
  - 段落05："晋安拔剑"
  - 段落06："天道激怒·红雷降下"

  **缺口问题**：
  1. 拔剑之后做了什么？只是站着？挥剑？
  2. 这把剑后续有什么用？段落07-08都没提到剑
  3. 拔剑和天道降雷之间的因果关系是什么？

  ### ✅ 如何补充剧本缺口？

  **规则：在分镜中插入"桥接镜头"，补充缺失的动作或因果**

  | 缺口类型 | 补充方式 | 示例 |
  |---------|---------|------|
  | **动作缺口** | 补充动作后续 | "拔剑后晋安持剑指向天空电子眼" |
  | **因果缺口** | 补充反应镜头 | "天眼瞳孔收缩——它注意到了晋安的挑衅" |
  | **物品缺口** | 交代物品去向 | "剑融入晋安手臂，化为数据流" |
  | **情感缺口** | 补充角色表情 | "林溪惊恐地看着天空变红" |

  **针对当前剧本05→06缺口的补充建议**：
  1. 拔剑后：插入"晋安持剑斜指天空电子眼，挑衅姿态"
  2. 天眼反应：插入"电子眼瞳孔骤然收缩，愤怒转动"
  3. 剑的去向：在后续镜头暗示"剑刃发光，准备吸收/偏转雷霆"

  ### 🔄 缺口检测清单（生成前必须执行！）

  阅读剧本时，对每对相邻段落检查：
  - [ ] 上一段的动作有自然结束吗？
  - [ ] 上一段引入的物品在下一段有交代吗？
  - [ ] 两段之间的因果关系清晰吗？
  - [ ] 需要插入过渡/反应镜头吗？

  ================================================================================
  ## 🎬 第三步：加戏规则（当剧本内容不足以支撑目标时长时）

  ### 🚫 禁止的加戏类型
  1. **违反剧本设定**：
     - 如剧本说"无物理杀伤力"，禁止画"石狮子裂开/爆炸"
     - 如剧本没有某角色，禁止凭空添加
  2. **音效画面化**：
     - "音效：血液接触电路的滋滋声" ❌ 不能画成"血液流入电路火花飞溅"
     - 音效只影响情绪氛围，不能成为画面主体
  3. **过度拆分**：
     - 单一动作（如"双手合十"）最多拆成2-3个镜头
     - 禁止把一个简单动作拆成7个以上镜头
  4. **无意义重复**：
     - 相似画面（如"角色惊恐表情"）不应连续出现超过2次
     - 避免"同一动作的微小变体"占用多个镜头

  ### ✅ 允许的加戏类型（按优先级）
  1. **桥接缺口镜头**（最优先！）：
     - 补充剧本段落间缺失的动作/因果/物品去向
     - 如"拔剑后 → 持剑指向天空 → 天眼反应 → 红雷降下"
  2. **环境反应**：
     - 周围物体/空间的变化（如"波纹扩散时，周围浮尘悬浮"）
     - 背景NPC的反应（如"围观士兵身体开始透明化"）
  3. **角色反应**：
     - 主角动作引发的其他角色表情/动作反应
     - 如"独孤云惊恐" → 可加"周围小兵也露出恐惧表情"
  4. **UI/界面元素**：
     - 科幻/赛博设定的虚拟界面、警告弹窗
     - 如"警告文字覆盖在晋安瞳孔上"
  5. **氛围渲染**：
     - 强化情绪的环境镜头（天空变色、云层翻滚）
     - 但不能违反物理设定

  ### 加戏优先级
  \`\`\`
  桥接缺口 > 剧情推进 > 环境反应 > 角色反应 > 氛围渲染
  \`\`\`

  ### 节奏分配原则
  - 高潮/转折点：可以用更多镜头（3-5个）
  - 铺垫/过渡：控制镜头数（1-2个）
  - 避免开场拖沓：第一个场景不要超过5个镜头

  ================================================================================
  ## 输出格式规范

  返回JSON数组，每个镜头对象必须包含以下字段：

  {
    // ═══════════ 基础信息 ═══════════
    "shotNumber": "01",
    "duration": "5s",
    "shotType": "运动",  // "静态" 或 "运动"

    // ═══════════ 叙事内容 ═══════════
    "storyBeat": "晋安和林溪逃入废弃管道，喘息着确认安全",
    "dialogue": "晋安：这里暂时安全……",

    // ═══════════ 景别（必须使用中英文格式） ═══════════
    "shotSize": "中景(MS)",
    // 可选值: 大远景(ELS), 远景(LS), 中全景(MLS), 中景(MS), 中近景(MCU), 近景(CU), 特写(ECU), 微距(Macro)

    // ═══════════ 角度-朝向子维度 ═══════════
    "angleDirection": "3/4正面(3/4 Front)",
    // 可选值: 正面(Front View), 微侧正面(Slight Front), 3/4正面(3/4 Front), 1/3侧面(1/3 Side), 正侧面(Full Side), 1/3背面(1/3 Back), 3/4背面(3/4 Back), 背面(Back View)

    // ═══════════ 角度-高度子维度 ═══════════
    "angleHeight": "轻微仰拍(Mild Low)",
    // 可选值: 鸟瞰(Bird's Eye), 极端俯拍(Extreme High), 中度俯拍(High Angle), 轻微俯拍(Mild High), 平视(Eye Level), 轻微仰拍(Mild Low), 中度仰拍(Low Angle), 极端仰拍(Extreme Low), 虫视(Worm's Eye), 荷兰角(Dutch Angle)

    "dutchAngle": "",  // 荷兰角角度（可选），如 "右倾15°"

    // ═══════════ 三层构图 ═══════════
    "foreground": "模糊的管道边缘框架，形成画面遮挡",
    "midground": "二人奔跑，晋安在前林溪在后，动态姿态",
    "background": "幽深的管道通道，尽头有微弱冷光",

    // ═══════════ 光影 ═══════════
    "lighting": "顶光从管道缝隙漏下形成体积光柱，主体处于明暗交界，冷青色调",

    // ═══════════ 运镜 ═══════════
    "cameraMove": "跟拍(Tracking)",
    // 可选值: 固定(Static), 推镜(Dolly In), 拉镜(Dolly Out), 左摇(Pan Left), 右摇(Pan Right), 上摇(Tilt Up), 下摇(Tilt Down), 跟拍(Tracking), 移焦(Rack Focus), 希区柯克变焦(Dolly Zoom), 升镜(Crane Up), 降镜(Crane Down), 环绕(Arc), 手持(Handheld)

    "cameraMoveDetail": "镜头跟随二人向前移动，逐渐推近",

    // ═══════════ 🚨动线轨迹（必填！不可留空！） ═══════════
    "motionPath": "二人从画面左侧管道入口入画，向右前方跑动穿过前景框架，停在画面中央偏右。镜头侧向跟拍推进。",
    // ⚠️ 即使没有运动也必须说明！如："角色保持静止，仅有轻微呼吸起伏。镜头固定，几乎静止但有微弱呼吸感。"

    // ═══════════ 🚨首帧画面描述（必填！自然语言描述，用于分镜脚本表） ═══════════
    "startFrame": "晋安与林溪位于画面左1/3处管道入口，二人并排奔跑身体前倾步幅巨大，表情极度紧张，林溪右手持长剑。前景是模糊管道边缘，背景是追兵红光。侧逆光勾勒轮廓。",

    // ═══════════ 尾帧画面描述（运动镜头必填！自然语言描述，用于分镜脚本表） ═══════════
    "endFrame": "两人移动至画面中央，晋安右手撑墙弯腰喘气，林溪持剑警戒站立，表情喘息疲惫，晋安左手发出微弱蓝光。前景是管道边缘柔焦，背景是管道深处红光。冷暖对比光影。",

    // ═══════════ 🚨首帧AI提示词（必填！精确角度参数+自然语言描述） ═══════════
    "promptCn": "全景(LS)，轻微俯拍(5-15°俯视)，正侧面(90°)。晋安与林溪位于画面左侧边缘，两人并排快速奔跑身体前倾，表情紧张专注咬牙向前，林溪右手持长剑剑身反射冷光。前景是虚化的金属管道边缘结构遮挡画面边缘。中景是两人奔跑的侧身轮廓，脚下溅起微弱蓝色电弧火花。背景是布满发光蓝色苔藓和电路纹路的圆柱形管壁向右方深处延伸至黑暗。侧逆光勾勒角色轮廓，苔藓发出幽暗蓝光，管道缝隙透出危险红光。",

    // ═══════════ 🚨尾帧AI提示词（运动镜头必填！精确角度参数+自然语言描述） ═══════════
    "endFramePromptCn": "中景(MS)，轻微俯拍(5-15°俯视)，正侧面(90°)。两人位于画面右侧中心保持奔跑姿态带有速度感，晋安左手向前挥动掌心闪烁微弱蓝色光芒，表情咬牙喘息。前景是飞溅的发光蓝色碎片和虚化的管道结构。中景是两人奔跑的侧身轮廓，衣摆和披风向后飘动。背景是管道内部透出强烈的危险红光。红蓝光影从两侧交织照射，画面充满速度感和紧迫感。",

    // ═══════════ 🚨视频生成提示词（必须包含七要素！使用中文！） ═══════════
    "videoPromptCn": "从首帧到尾帧，镜头侧向跟拍缓慢推进，两人在暗色生物管道中快速奔跑从画面左侧向右侧移动，脚步溅起蓝色电弧火花，管壁发光苔藓随经过明暗闪烁，光影从冷蓝调逐渐转为红蓝交织，先慢后快节奏，5秒。",

    // ═══════════ 理论依据 ═══════════
    "theory": "使用轻微仰拍增加角色主动性，前景框架引导视线并增加纵深，跟拍运镜增强代入感和紧迫感"
  }

  ================================================================================
  ## 🚨🚨🚨 首帧/尾帧描述与提示词规范

  ### 分镜脚本表的首帧/尾帧描述（自然语言）
  用于分镜生成阶段，startFrame和endFrame字段：
  - 使用自然语言完整描述画面内容
  - 必须包含：人物位置、姿态动作、表情情绪、道具状态、构图层次、光影氛围
  - 不使用特殊符号（如【】：|等）

  ### 提示词表的首帧提示词（角度参数+自然语言）
  用于提示词生成阶段，promptCn和endFramePromptCn字段：
  - 开头必须是角度参数：景别(英文缩写)，视角高度(角度)，角色朝向(角度)
  - 后续使用自然语言描述画面内容
  - 控制在800字以内

  ### 首帧/尾帧描述示例（分镜脚本表用，自然语言）
  \`\`\`
  "startFrame": "晋安与林溪位于画面左侧边缘，两人并排快速奔跑身体前倾，表情紧张专注咬牙向前，林溪右手持长剑剑身反射冷光。前景是虚化的金属管道边缘结构，中景是两人奔跑的侧身轮廓，背景是布满蓝色苔藓的管壁向深处延伸。侧逆光勾勒人物轮廓，管道透出危险红光。"

  "endFrame": "两人移动至画面右侧中心，保持奔跑姿态带有速度感，晋安左手向前挥动掌心闪烁微弱蓝色光芒，表情咬牙喘息。前景是飞溅的发光蓝色碎片，中景是两人奔跑的侧身轮廓衣摆向后飘动，背景管道透出强烈红光。红蓝光影从两侧交织照射。"
  \`\`\`

  ### ❌ 错误示例
  \`\`\`
  "promptCn": "中景，平视，3/4正面。【人物位置】画面中央 | 【姿态】晋安喘气"
  问题1：提示词中不应使用【】和|符号！
  问题2：角度参数缺少精确的英文缩写和角度范围！
  \`\`\`

  ### ✅ 正确的首帧提示词示例（精确角度参数+自然语言+锚点声明）
  \`\`\`
  "promptCn": "全景(LS)，轻微俯拍(5-15°俯视)，正侧面(90°)。晋安与林溪位于画面左侧边缘，两人并排快速奔跑身体前倾，表情紧张专注咬牙向前，林溪右手持长剑剑身反射冷光。前景是虚化的金属管道边缘结构遮挡画面边缘。中景是两人奔跑的侧身轮廓，脚下溅起微弱蓝色电弧火花。背景是布满发光蓝色苔藓和电路纹路的圆柱形管壁向右方深处延伸至黑暗（管壁结构和苔藓分布保持不变）。侧逆光勾勒角色轮廓，苔藓发出幽暗蓝光，管道缝隙透出危险红光。"
  \`\`\`

  ### ✅ 正确的尾帧提示词示例（精确角度参数+自然语言+锚点呼应）
  \`\`\`
  "endFramePromptCn": "中全景(MLS)，轻微俯拍(5-15°俯视)，正侧面(90°)。两人位于画面中央偏右保持奔跑姿态带有速度感，晋安左手向前挥动掌心闪烁微弱蓝色光芒，表情咬牙喘息。前景是飞溅的发光蓝色碎片和虚化的管道结构。中景是两人奔跑的侧身轮廓，衣摆和披风向后飘动。背景是相同的圆柱形管壁和发光苔藓（与首帧一致），管道内部透出强烈的危险红光。红蓝光影从两侧交织照射，画面充满速度感和紧迫感。"
  \`\`\`

  **📝 注意上述示例中的优化：**
  - 景别跨度：全景(LS)→中全景(MLS)，仅跨1级（原错误示例跨2级）
  - 位置变化：左侧边缘→中央偏右（合理位移）
  - 锚点声明：首帧"管壁结构和苔藓分布保持不变"，尾帧"与首帧一致"

  ================================================================================
  ## 🚨🚨🚨 首尾帧设计规范（运动镜头核心！）

  ### 首尾帧变化设计
  运动镜头的首尾帧必须体现**至少两项**变化：
  | 变化维度 | 首帧 | 尾帧 | 变化幅度建议 |
  |---------|------|------|-------------|
  | 景别变化 | 全景(LS) | 中景(MS) | 相邻景别，避免跳跃 |
  | 视角高度 | 轻微俯拍 | 平视 | 15°以内变化 |
  | 角色朝向 | 正侧面(90°) | 3/4正面(45°) | 通过环绕运镜实现 |
  | 人物位置 | 画面左侧 | 画面右侧 | 同一水平线移动 |
  | 姿态变化 | 奔跑前倾 | 停下喘气 | 自然过渡动作 |
  | 表情变化 | 紧张专注 | 如释重负 | 符合情绪逻辑 |
  | 光影变化 | 冷蓝色调 | 暖黄色调 | 渐变过渡 |

  ### 🎬 运镜与首尾帧变化对应
  | 运镜方式 | 实现的变化 | 视频提示词写法 |
  |---------|-----------|---------------|
  | 推进 Push In | 景别变近 | 镜头缓慢推进 |
  | 拉远 Pull Out | 景别变远 | 镜头缓慢拉远 |
  | 升降 Crane | 视角高度变化 | 镜头从高处缓慢下降 |
  | 环绕 Arc | 角色朝向变化 | 镜头从侧面环绕至正面 |
  | 跟随 Track | 人物位置变化 | 镜头侧向跟随移动 |

  ### 🚨 首尾帧设计禁忌
  | 禁忌 | 问题 | 修正方案 |
  |-----|------|---------|
  | 差异过大 | AI无法补全中间过程 | 拆分为多段 |
  | 视角跳变 | 俯拍→仰拍，画面不连贯 | 保持视角高度一致 |
  | 主体消失 | 首帧有人，尾帧无人 | 确保核心主体贯穿 |
  | 背景突变 | 首帧森林，尾帧城市 | 通过过渡元素连接 |
  | 多维度同时剧变 | 景别+位置+姿态全变 | 控制在2-3项变化 |

  ================================================================================
  ## 🚨🚨🚨 动线描述规则（必填！不可留空！）

  ### 有运动时
  \`\`\`
  "motionPath": "晋安从画面左侧蓄力半蹲，向右前方猛然冲出步幅巨大，冲到画面右侧中心停下。镜头跟拍横移，保持人物在画面中央。"
  \`\`\`

  ### 无运动时（也必须说明！）
  \`\`\`
  "motionPath": "角色保持静止，仅有轻微的呼吸起伏和眼神移动。镜头固定，几乎静止但有微弱呼吸感晃动。"
  \`\`\`

  ### ❌ 禁止留空或使用"—"
  \`\`\`
  "motionPath": "—"  // ❌ 错误！
  "motionPath": ""   // ❌ 错误！
  \`\`\`

  ================================================================================
  ## 关键规则

  ### 🎬 视频模式判断（三种模式）

  #### 判断流程图
  \`\`\`
  场景描述 → 检查关键词 →
    ├─ 包含[变身/转变/穿越/跳转/昼夜/拥抱/奔跑/飞行] → Keyframe模式（首尾帧）
    ├─ 包含[眨眼/微笑/呼吸/飘动/闪烁/氛围] + 时长≤5秒 → I2V模式（图生视频）
    └─ 无明显运动关键词 + 时长≤3秒 → Static模式（静态/呼吸感）
  \`\`\`

  #### 三种模式详解
  | 模式 | 适用场景 | 需要字段 | 示例 |
  |-----|---------|---------|------|
  | **Static** | 完全静态、定格画面、静物展示 | promptCn | 远景城市夜景定格 |
  | **I2V** | 微小动作、环境微动、5秒内简单动态 | promptCn + videoPromptCn | 人物转头、树叶飘动 |
  | **Keyframe** | 大位移、形态转变、空间跳转、多主体互动 | promptCn + endFramePromptCn + videoPromptCn | 人物奔跑、变身、场景切换 |

  #### Keyframe模式触发关键词
  | 类型 | 关键词 |
  |-----|-------|
  | 形态转变 | 变身、转变、融合、分裂、消散、凝聚 |
  | 空间跳转 | 穿越、进入、离开、室内到室外 |
  | 时间流逝 | 昼夜、日出、日落、黎明、黄昏 |
  | 多主体互动 | 拥抱、握手、对视、交接 |
  | 大位移 | 奔跑、冲刺、飞行、跳跃、滑行 |
  | 明确叙事 | 出发、抵达、起身、坐下、倒下 |

  #### I2V模式适用关键词
  | 类型 | 关键词 |
  |-----|-------|
  | 微小动作 | 眨眼、微笑、呼吸、转头、点头、注视 |
  | 环境微动 | 飘动、摇曳、闪烁、波动、涟漪、飘落 |
  | 氛围类 | 氛围、静态、定格 |

  ### shotType与videoMode的关系
  - "运动" + Keyframe关键词 → **Keyframe模式**：必须填写 startFrame, endFrame, promptCn, endFramePromptCn, videoPromptCn, motionPath
  - "运动" + I2V关键词 → **I2V模式**：必须填写 promptCn, videoPromptCn；endFrame可选
  - "静态" + ≤3秒 → **Static模式**：仅填写 promptCn；videoPromptCn可选（添加呼吸感）
  - "静态" + >3秒 → **I2V模式**：填写 promptCn + videoPromptCn（添加微动效果）

  ### 角度选择理论（基于Framed Ink + 角度规则优化）

  #### 🚨 角色面对镜头朝向（8种选项）：
  | 朝向 | 角度范围 | 情绪效果 | 使用频率 |
  |-----|---------|---------|---------|
  | 正面(Front View) | ±5° | 直观情绪，代入感 | ⚠️极少用：30镜头≤2个 |
  | 微侧正面(Slight Front) | 15-30° | 破解正面呆板 | 常用于对话 |
  | 3/4正面(3/4 Front) | 30-45° | 平衡表情与轮廓 | ✅最常用 |
  | 1/3侧面(1/3 Side) | 60°左右 | 突出动作 | 行走、观察 |
  | 正侧面(Full Side) | 90° | 清晰动作轨迹 | 追逐、格斗 |
  | 1/3背面(1/3 Back) | 60°左右 | 轻微悬念 | 窥探、犹豫 |
  | 3/4背面(3/4 Back) | 30-45° | 神秘、孤独 | 独自前行 |
  | 背面(Back View) | ±5° | 强悬念 | 揭秘铺垫 |

  #### 🚨 视角高度（10种选项）：
  | 高度 | 角度范围 | 情绪效果 | 使用频率 |
  |-----|---------|---------|---------|
  | 鸟瞰(Bird's Eye) | 90°垂直 | 上帝视角、命运感 | 战场全局 |
  | 极端俯拍(Extreme High) | 45°以上 | 渺小、被审视 | 绝境时刻 |
  | 中度俯拍(High Angle) | 15-45° | 压抑、孤立 | 被围困 |
  | 轻微俯拍(Mild High) | 5-15° | 轻微弱化 | 犹豫、不安 |
  | 平视(Eye Level) | ±5° | 中立客观 | ⚠️仅用于无情绪说明性镜头，≤15% |
  | 轻微仰拍(Mild Low) | 5-15° | 轻微崇高 | ✅默认选择，~40% |
  | 中度仰拍(Low Angle) | 15-45° | 力量、威胁 | 反派施压 |
  | 极端仰拍(Extreme Low) | 45°以上 | 压迫、神圣 | 史诗时刻 |
  | 虫视(Worm's Eye) | 贴近地面 | 环境宏大 | 巨人脚下 |
  | 荷兰角(Dutch Angle) | 倾斜5-30° | 失衡、疯狂 | 追逐、灾难 |

  #### 🚨 角度分布规则（必须遵守！）
  - 平视占比：≤15%（30镜头最多4-5个）
  - 正面占比：≤7%（30镜头最多2个）
  - 轻微仰/俯拍：~40-50%（默认选择）
  - 极端角度：≥15%（必须有冲击力镜头）

  ================================================================================
  ## 🎨 透视类型与冲击力设计（Framed Ink核心）

  ### 透视类型分布要求（强制！）

  **问题诊断**：当前分镜设计缺少大透视冲击力画面，视觉过于平淡。

  **解决方案**：每个项目必须包含多种透视类型，分布如下：

  | 透视类型 | 目标占比 | 用途 | 视觉冲击力 |
  |---------|---------|------|----------|
  | **一点透视** | 30-40% | 走廊/隧道纵深、引导视线 | ⭐⭐⭐ 中等 |
  | **两点透视** | 30-40% | 建筑/街道、空间立体感 | ⭐⭐⭐ 中等 |
  | **三点透视** | 15-25% | 极端仰视/俯视、戏剧冲击 | ⭐⭐⭐⭐⭐ 极高 |
  | **平面构图** | <15% | 特写、静态情绪镜头 | ⭐ 低 |

  ### 三点透视的威力（必须使用！）

  **向上三点透视**（消失点在天空）：
  - 效果：崇高感、压迫感、建筑高耸
  - 应用：仰拍摩天大楼、反派俯视、英雄抬头看巨物
  - 画面特征：垂直线向上汇聚到天空中的第三消失点

  **向下三点透视**（消失点在地面深处）：
  - 效果：眩晕感、危险、失控、上帝视角
  - 应用：俯瞰悬崖、高处坠落、城市鸟瞰
  - 画面特征：垂直线向下汇聚，地面细节缩小

  **示例 - 如何描述三点透视镜头**：
  \`\`\`
  ✅ 正确描述：
  "极端仰拍，三点透视向上，晋安从下方看去，下巴和肩膀轮廓突出，
   垂直的建筑线条向天空汇聚，背景是翻滚的乌云，形成强烈的压迫感"

  ❌ 错误描述：
  "极端仰拍，晋安站立"（没有透视描述，AI会画成平视）
  \`\`\`

  ### 高冲击力画面检查清单

  在生成分镜前，检查以下问题：
  1. 是否有至少3-5个极端角度镜头（极端仰拍/极端俯拍）？
  2. 是否有使用三点透视的镜头？
  3. 高潮场景是否使用了冲击力镜头？
  4. 是否避免了连续3个以上平视镜头？

  ================================================================================
  ## 🔍 角度-透视-构图一致性规则（理解逻辑，非简单禁止）

  ### 核心原则：相机位置决定可见内容

  **理解逻辑**：不同相机位置，物理上能看到的角色朝向不同。
  这不是"禁止"，而是"物理现实"。

  | 相机高度 | 能看到的角色朝向 | 透视特征 | 画面中的人物表现 |
  |---------|----------------|---------|----------------|
  | 鸟瞰 | 头顶、背部、侧面轮廓 | 向下三点透视 | 人物被压扁，只见头顶和肩膀轮廓 |
  | 极端俯拍 | 头顶、低头的脸、背部 | 向下透视 | 头顶突出，脸部透视缩短 |
  | 极端仰拍 | 下巴、鼻孔、仰视的脸 | 向上三点透视 | 下巴突出，肩膀宽大，天空背景 |
  | 虫视 | 腿部、身体底部、仰视天空 | 极端向上透视 | 人物呈高耸剪影，腿部放大 |

  ### 角度组合的正确理解

  **"鸟瞰 + 正面"的问题**：
  - 物理上：从正上方看，只能看到头顶/背部，看不到正脸
  - 如果你想要"正面表情"：使用平视或轻微俯拍，而非鸟瞰
  - 如果你想要"上帝视角"：接受只能看到头顶/背部，这正是鸟瞰的意义

  **"极端仰拍 + 正面"是可以的**：
  - 从下往上看人物正面 → 看到下巴、鼻孔、额头
  - 这正是仰拍的威胁感/压迫感来源
  - 提示词必须体现这种透视："下巴突出，仰视角度，人物高耸"

  **"前景手 + 中景人物正面"的解决**：
  - 问题：如果相机正对人物正面，手如何出现在前景？
  - 解决1：侧面视角 - 手从画面一侧伸入
  - 解决2：轻微仰拍 - 手从下方伸入画面
  - 解决3：POV主观镜头 - 自己的手在前景，看向对面的人

  ### 提示词中的透视描述（AI绘图关键！）

  **仰拍镜头的正确描述**：
  \`\`\`
  promptCn: "极端仰拍，三点透视向上，[角色名]从下方视角看去，下巴轮廓突出，
            肩膀呈倒三角，背景是高耸的天空/建筑，垂直线条向上汇聚"
  promptEn: "(Extreme Low Angle:1.4), (three-point perspective upward:1.3),
            (worm's eye view:1.2), character seen from below, chin prominent,
            shoulders forming inverted triangle, vertical lines converging upward"
  \`\`\`

  **俯拍镜头的正确描述**：
  \`\`\`
  promptCn: "鸟瞰视角，三点透视向下，[角色名]的头顶和背部轮廓，
            地面细节丰富，垂直元素向地面中心汇聚，强调孤立渺小"
  promptEn: "(Bird's Eye View:1.4), (three-point perspective downward:1.3),
            (top-down view:1.2), character seen from above, head and shoulders visible,
            ground details prominent, vertical lines converging downward"
  \`\`\`

  ================================================================================
  ## 📊 镜头角度分布要求（避免视觉单调）

  ### 🚨🚨🚨 开场镜头多样性（强制规则！）

  **问题**：前3个镜头连续使用相同角度（如连续3个正面特写）= 视觉单调！

  **开场规则（必须遵守）**：
  | 镜头 | 角度要求 | 朝向要求 | 景别要求 |
  |------|---------|---------|---------|
  | #01 | 任意 | 任意 | 远景/全景/中景 优先 |
  | #02 | **必须与#01不同** | **必须与#01不同** | 任意 |
  | #03 | **必须与#01、#02都不同** | 至少换一个朝向 | 任意 |

  **示例（正确开场）**：
  - #01：大远景，鸟瞰，广场全貌
  - #02：中景，正面仰拍，主角站立
  - #03：特写，3/4侧面，手部动作

  **示例（错误开场）**：
  - #01：特写，正面，脸部 ❌
  - #02：特写，正面，手部 ❌ （连续正面特写）
  - #03：特写，正面，UI界面 ❌ （连续正面特写）

  ### 📐 相机角度选择规范（情绪驱动！）

  **核心原则**：角度 = 朝向子维度 + 高度子维度，完全服务于剧情情绪

  **思考流程**：
  1. 分析镜头的**情绪需求**
  2. 根据情绪选择**高度**和**朝向**
  3. **轻微仰拍/轻微俯拍是默认选择**，平视仅用于"无情绪倾向"的说明性镜头

  ### 高度子维度（cameraAngle）

  | 高度 | 角度范围 | 叙事效果 | 适用场景 |
  |-----|---------|---------|---------|
  | 鸟瞰 bird's eye | 90°垂直俯视 | 客观、命运感 | 战场全局、城市俯瞰 |
  | 极端俯拍 extreme high | 45°以上 | 渺小、宿命 | 角色陷入绝境 |
  | 中度俯拍 high angle | 15-45° | 压抑、孤立 | 被围困、情绪低落 |
  | 轻微俯拍 mild high | 5-15° | 轻微弱化 | 犹豫、不安 |
  | **平视 eye level** | ±5° | 中立客观 | **⚠️仅用于无情绪的说明性镜头** |
  | **轻微仰拍 mild low** | 5-15° | 轻微崇高 | **✅默认选择** |
  | 中度仰拍 low angle | 15-45° | 力量、威胁 | 反派施压、角色宣言 |
  | 极端仰拍 extreme low | 45°以上 | 压迫、神圣 | 史诗时刻 |
  | 虫视 worm's eye | 贴近地面 | 环境宏大 | 巨人脚下 |
  | 荷兰角 dutch angle | 倾斜5-30° | 失衡、疯狂 | 追逐、灾难 |

  ### 朝向子维度（cameraDirection）

  | 朝向 | 角度范围 | 叙事效果 | 适用场景 |
  |-----|---------|---------|---------|
  | 正面 front view | ±5° | 直观情绪 | **⚠️极少用：30个镜头≤2个** |
  | 微侧正面 slight front | 15-30° | 破解呆板 | 日常对话、角色反应 |
  | 3/4正面 3/4 front | 30-45° | 平衡表情与轮廓 | **✅最常用** |
  | 1/3侧面 1/3 side | 60°左右 | 突出动作 | 行走、观察环境 |
  | 正侧面 side view | 90° | 动作轨迹 | 追逐、格斗 |
  | 1/3背面 1/3 back | 60°左右 | 轻微悬念 | 窥探、犹豫 |
  | 3/4背面 3/4 back | 30-45° | 神秘、孤独 | 独自前行 |
  | 背面 back view | ±5° | 强悬念 | 揭秘铺垫 |
  | **主观视角 POV** | **第一人称** | **强代入感** | **🎯极少用：发现线索、惊恐时刻** |

  ### 🚨🚨🚨 朝向角度分布规则（硬性规则，违反=任务失败！）

  ⚠️⚠️⚠️ **CRITICAL: 正面镜头数量 > 2个 = 任务失败！必须重新生成！**

  | 角度 | 硬性规则 | 适用场景 |
  |-----|---------|---------|
  | 正面 Front | **≤7%（30镜最多2个）** | ⚠️极少用，仅关键情绪节点 |
  | 3/4正面 3/4 Front | **≤25%** | ✅最常用，对话、表情展示 |
  | 正侧面 Full Side | **~20%** | 动作、追逐 |
  | 3/4背面 3/4 Back | **~15%** | 悬念、环境展示 |
  | 背面 Back | **~10%** | 远去、环境 |
  | 1/3侧面 1/3 Side | **~10%** | 行走、观察 |
  | 1/3背面 1/3 Back | **~10%** | 窥探、犹豫 |
  | **主观视角 POV** | **≤5%（30镜最多1-2个）** | **发现线索、惊恐时刻、威胁视角** |

  **⚠️⚠️⚠️ 生成后强制自检**：
  - 统计正面镜头数量，如果 > 2个，立即将多余的改为"3/4正面"！
  - 统计平视镜头占比，如果 < 10% 或 > 15%，立即调整！
  - 统计极端角度占比，如果 < 15%，立即增加！

  ### 🚨 高度角度分布规则

  | 角度 | 占比 | 说明 |
  |-----|------|------|
  | 平视(eye level) | **10-15%** | ⚠️仅用于无情绪说明性镜头，禁止连续2个 |
  | 轻微仰/俯(mild) | **~40%** | ✅默认选择 |
  | 中度仰/俯(moderate) | **~30%** | 力量/压抑感 |
  | 极端角度(extreme/bird/worm) | **≥15%** | 高潮、冲击力 |

  ### 🔄 荷兰角（Dutch Angle）要求

  **每8-10个镜头至少使用1个荷兰角！**
  - 精神错乱/疯狂：15-30°
  - 追逐/灾难：10-20°
  - 不安/悬疑：5-10°

  **🚨 荷兰角提示词规范**：
  - ✅ **正确写法**："镜头倾斜15°，人物保持垂直站立，画面呈倾斜构图"
  - ✅ **英文**："tilted camera 15°, character standing upright, tilted composition"
  - ❌ **错误写法**："人物倾斜15°"（会导致AI画出倾斜的人物）
  - **核心原则**：荷兰角是**镜头倾斜**，不是人物倾斜！

  ### 禁止规则

  - ❌ 禁止连续2个平视镜头
  - ❌ 禁止连续3个3/4正面镜头
  - ❌ 禁止连续3个相同运镜类型

  ================================================================================
  ### 🎬 运镜分布规则（重要！避免呆板！）

  | 运镜类型 | 占比 | 说明 |
  |---------|------|------|
  | **完全固定 Static** | **≤5%（一集最多1-2个）** | ⚠️极少使用！ |
  | 轻微推拉 Subtle | **~25%** | "固定"也应有轻微缓慢运动 |
  | 推镜/拉镜 Dolly | **~25%** | 强调/建立 |
  | 横摇/竖摇 Pan/Tilt | **~20%** | 展示空间/跟随 |
  | 跟拍 Tracking | **~15%** | 动态感 |
  | 升降/环绕 Crane/Arc | **~10%** | 史诗感/揭示 |

  **⚠️ 即使标注"固定"，也应描述为"轻微缓慢推进"或"几乎静止但有微弱呼吸感"**

  ### 运镜情绪匹配
  - 推镜(Dolly In)：聚焦情绪、强化紧张
  - 拉镜(Dolly Out)：揭示环境、孤独感
  - 跟拍(Tracking)：增强代入感、速度感
  - 希区柯克变焦(Dolly Zoom)：心理崩溃、眩晕
  - 环绕(Arc)：史诗感、揭示、360°审视

  ### 🚨🚨🚨 首尾帧规范（AI视频生成关键！必须完整！）

  #### 首帧/尾帧必须独立包含完整的8要素：
  1. **景别**：远景/中景/特写等
  2. **视角高度**：轻微俯拍/平视/仰拍等 + 角度度数
  3. **角色面对镜头角度**：正面/3/4正面/正侧面等
  4. **人物位置**：画面左侧/中心/右1/3处等
  5. **姿态**：站立/奔跑/蹲下等具体动作
  6. **表情**：紧张/愤怒/平静等具体情绪
  7. **道具**：手持物品、发光效果等
  8. **🆕锚点元素**：首尾帧保持不变的核心元素（如"背景管道结构保持不变"）

  #### 首帧提示词格式（promptCn - 精确角度参数+自然语言+锚点！）
  \`\`\`
  "promptCn": "景别(英文缩写)，视角高度(角度范围)，角色朝向(角度范围)。人物位于画面具体位置，姿态动作描述，表情描述，道具状态描述。前景元素描述。中景主体描述。背景环境描述(声明锚点元素)。光影氛围描述。"
  \`\`\`

  #### 尾帧提示词格式（endFramePromptCn - Keyframe模式必填！）
  \`\`\`
  "endFramePromptCn": "景别(英文缩写)，视角高度(角度范围)，角色朝向(角度范围)。人物位于画面具体位置，姿态动作描述，表情描述，道具状态描述。前景元素描述。中景主体描述。背景环境描述(与首帧相同锚点)。光影氛围描述。"
  \`\`\`

  #### 🆕 首尾帧一致性五原则（仅 Keyframe 模式需要）
  | 原则 | 规则 | 必要性 |
  |-----|------|--------|
  | 景别跨度 | ≤2级安全，3级需快速推进 | ✅ 必须 |
  | 元素对齐 | 核心元素保持可追踪 | ✅ 必须 |
  | 锚点声明 | 有不变元素声明更好 | ⚠️ 推荐 |
  | 风格统一 | 首尾美学风格一致 | ✅ 必须 |
  | 构图衔接 | 空间框架连贯 | ✅ 必须 |

  #### 景别跨度详细说明
  | 跨度 | 风险等级 | 说明 | 示例 |
  |-----|---------|------|------|
  | 1级 | ✅ 安全 | 常规推进/拉远 | 全景→中全景 |
  | 2级 | ✅ 安全 | 正常推镜效果 | 全景→中景 |
  | 3级 | ⚠️ 需注意 | 需配合快速推进运镜 | 远景→中景（快推） |
  | 4级+ | ❌ 高风险 | AI难以补全，建议拆分 | 远景→特写（应拆2段） |

  #### ⚠️ 视频模式选择（优化版）
  | 模式 | 适用场景 | 时长 | 首帧描述 | 尾帧描述 |
  |-----|---------|-----|---------|---------|
  | **I2V** | 微动、跟拍运动、呼吸感、氛围 | ≤10秒 | ✅ 必须 | ❌ 不需要 |
  | **Keyframe** | 形态转变、定点位移、空间跳转 | 任意 | ✅ 必须 | ✅ 必须 |

  **🚨 重要：所有运动镜头都必须有首帧描述！**
  - I2V模式：首帧描述用于生成单张图 → 必须包含人物位置/姿态/表情/道具
  - Keyframe模式：首帧+尾帧描述用于生成两张图 → 都必须详细描述

  #### 跟拍 vs 定点位移（重要区分！）
  | 场景 | 模式 | 原因 |
  |-----|------|------|
  | 人物奔跑 + 镜头跟随 | **I2V** | 镜头跟主体，相对静止 |
  | 人物从A点跑到B点（定点） | **Keyframe** | 需要锚定起止位置 |
  | 静止人物 + 环境微动 | **I2V** | 添加呼吸感即可 |
  | 人物变身/形态转变 | **Keyframe** | 需要明确起止状态 |

  ### 首尾帧差异点（Keyframe运动镜头）
  - 景别可能不同（如全景→中景，推镜效果）**跨2级内安全**
  - 视角高度可能不同（如平视→仰拍）
  - 人物位置不同（从画面边缘→画面中央）**确保有明确运动轨迹**
  - 人物姿态不同（奔跑→停下喘气）
  - 表情变化（紧张→喘息）
  - 环境细节变化（入口→内部）**但锚点元素保持不变**

  ### 🚨 空间连续性规则（180度法则+位置追踪）
  - **相邻镜头的角色空间位置必须逻辑连贯**
  - 如果A镜头尾帧：角色A在画面左侧，角色B在画面右侧 → B镜头首帧必须保持这个左右关系
  - 如果A镜头用右摇结束于角色B → B镜头必须以角色B为主体开始，位置在画面相应位置
  - **墙壁/环境参照物必须明确**：
    * 如果角色靠着某面墙，下一镜头中这面墙的方位必须一致
    * 用"左侧墙""右侧墙""背后墙""正前方墙"明确描述
  - **禁止跳轴**：保持同一场景内相同轴线（除非有明确过渡镜头）
  - 提示词中必须明确描述：
    * 角色在画面中的具体位置（左1/3、中央、右侧等）
    * 角色朝向（面向左/面向右/面向镜头/背对镜头）
    * 环境参照物的相对位置

  ### 🚨 相邻镜头叙事连贯性（必须遵守）

  #### 因果关系明确：
  - 如果A镜头是"角色挥剑"，B镜头必须是挥剑的结果（如"敌人被击中"、"剑气划过"）
  - ❌ 禁止：A="晋安挥剑" → B="武器架消融"（没有因果关联的突兀跳跃）
  - ✅ 正确：A="晋安挥剑" → B="剑气划过敌人" → C="环境在剑气扩散下消融"

  #### 视觉过渡规则：
  - 如果从"角色动作"切到"环境反应"，需要有视觉桥接
  - 桥接方式：
    * 运镜过渡：镜头从角色摇/推到环境
    * 视线引导：角色看向某处 → 下一镜头是角色视线所及
    * 动作延续：剑气/波纹从角色位置扩散到环境
  - ❌ 禁止硬切到完全无关的画面

  #### 插入镜头规则（Insert Shot）：
  - 环境/细节插入镜头最多连续2个，必须回到主线剧情
  - 每个插入镜头必须在"storyBeat"中说明与主线的关联
  - 如："【环境反应】波纹扫过石像，呼应晋安释放能量的效果"

  ### 🚨🚨🚨 提示词必须包含完整构图信息（极重要！）

  **问题**：当前生成的提示词经常丢失构图层次(FG/MG/BG)信息！

  **promptCn（中文提示词）必须包含以下所有信息（缺一不可！）**：
  1. 【景别】如"广角镜头拍摄" / "中景拍摄" / "近景拍摄"
  2. 【相机角度-高度】如"镜头从下方拍摄" / "镜头与眼睛同高" / "镜头从上方拍摄"
  3. 【相机角度-朝向】如"背对镜头" / "轻微向右转" / "直视镜头"
  4. 【主体描述】如"晋安站在画面中央，表情坚定"
  5. 【场景设定】如"场景设定在武道广场，古老亭台环绕"
  6. 【光影描述】如"由地面红光照亮，与天空蓝光形成冷暖对比"
  7. 【前景/中景/背景】如"前景有失焦的焦黑地砖边缘。中景是晋安站立的轮廓。背景是宏伟的武道广场"

  **promptEn（英文提示词）必须包含以下所有信息（缺一不可！）**：
  1. 【景别】如"A wide-angle shot of..." / "A medium shot of..." / "A close-up of..."
  2. 【相机角度-高度】如"captured from below" / "captured at eye level" / "captured from above"
  3. 【相机角度-朝向】如"back to camera" / "looking slightly to the right" / "looking forward"
  4. 【主体描述】如"The subject is Jin An standing at center, determined expression"
  5. 【场景设定】如"The scene is set in a martial arts plaza with ancient pavilions"
  6. 【光影描述】如"illuminated by red ground glow contrasting with blue sky light"
  7. 【前景/中景/背景】如"Foreground has blurred charred tile edges. Midground is Jin An's silhouette. Background is the grand plaza"

  #### 📋 强制结构模板（🆕 使用自然语言描述）

  **中文模板**：
  \`\`\`
  promptCn: "{景别}拍摄，镜头{角度高度}，{角度朝向}。{主体描述}。场景设定在{环境描述}，由{光影描述}照亮。前景{前景元素}。中景{中景元素}。背景{背景元素}。"
  \`\`\`

  **英文模板**：
  \`\`\`
  promptEn: "A {shot type} of {subject}, captured {camera height}. The subject is {action/expression}. The scene is set in {environment}, illuminated by {lighting}. Foreground {foreground elements}. Midground {midground elements}. Background {background elements}."
  \`\`\`

  #### ✅ 正确示例（🆕 自然语言描述）

  **中文**：
  \`\`\`
  promptCn: "远景拍摄，镜头从上方拍摄，直视镜头。晋安站在画面中央，背影纤细，周围有热浪扭曲效果，地面有红色电路纹路。场景设定在宏伟的武道广场，古老亭台环绕，天空中悬浮着巨大的半透明机械眼，由地面红光与天空蓝光形成冷暖对比照亮。前景有失焦的焦黑地砖边缘形成画框。中景是晋安站立的轮廓。背景是宏伟的武道广场。"
  \`\`\`

  **英文**：
  \`\`\`
  promptEn: "A long shot of Jin An standing in the center, captured from above, looking forward. The subject has a slender back silhouette with heat wave distortion around, red circuit patterns on the ground. The scene is set in a grand martial arts plaza with ancient pavilions, a giant translucent mechanical eye floating in the sky, illuminated by cold-warm contrast lighting with red ground glow meeting blue eye light. Foreground has blurred charred tile edges as frame. Midground is Jin An's standing silhouette. Background is the grand martial arts plaza."
  \`\`\`

  #### ❌ 错误示例（信息丢失）
  \`\`\`
  promptCn: "远景，晋安站在广场，地面有红色电路"
  promptEn: "Long shot, Jin An standing in plaza, red circuit on ground"
  问题：缺少前景、后景、角度、光影！
  \`\`\`

  #### 🔍 自检：提示词是否完整？
  生成每个提示词后检查：
  - [ ] 有景别描述？
  - [ ] 有角度描述（高度+朝向）？
  - [ ] 有主体描述？
  - [ ] 有场景设定？
  - [ ] 有光影描述？
  - [ ] 有前景/中景/背景？
  - [ ] 有光影描述？

  **如果任一项缺失，必须补充！**

  #### 相机角度必须体现在画面描述中：
  - 如果是"极端仰拍"，描述中必须体现仰视透视效果（如"chin prominent"、"nostrils visible"）
  - 如果是"1/3侧面"，描述中必须体现侧面角度（如"face turned 30 degrees"、"profile partially visible"）
  - 如果是"鸟瞰"，描述中必须体现俯视效果（如"top of head visible"、"looking down"）
  - ⚠️ 禁止角度标签和画面描述不一致！如标注"1/3侧面"却画出正面！

  ================================================================================
  ## 🧍 人物透视变形规则（基于《Framed Perspective》）

  ### 核心原则：相机角度决定人物变形！

  不同相机角度下，人物必须表现出相应的透视变形效果。
  **提示词中必须包含这些透视特征！**

  | 相机角度 | 人物透视变形 | 必须描述的特征 | 禁止出现 |
  |----------|-------------|---------------|---------|
  | **极端仰拍/虫视** | 下半身放大，上半身缩小 | 下巴锋利突出、鼻孔隐约可见、肩膀呈宽大倒三角、腿部透视缩短 | 正常比例、头顶可见 |
  | **中度仰拍** | 轻微下半身放大 | 下巴略突出、胸部底面可见、人物显高大 | 头顶突出 |
  | **平视** | 正常比例 | 地平线在眼睛位置、正常人体比例 | 极端透视变形 |
  | **中度俯拍** | 轻微上半身放大 | 头顶略突出、肩膀顶面可见 | 下巴突出 |
  | **极端俯拍/鸟瞰** | 上半身放大，下半身几乎不可见 | 头顶和发型突出、肩膀顶面为主、背部轮廓、脸部透视压缩 | 下巴可见、完整脸部表情 |

  ### 透视缩短效果（Foreshortening）

  **朝向镜头的肢体**：
  - 手臂伸向镜头 → 手部放大，手臂缩短
  - 拳头冲向镜头 → 拳头巨大，手臂几乎不可见
  - 脚踢向镜头 → 脚底放大，腿部缩短

  **远离镜头的肢体**：
  - 手臂远离镜头 → 手部缩小，手臂看起来更长
  - 人物背向跑去 → 背部放大，腿部缩小

  ### 人物变形提示词模板

  **极端仰拍人物描述**：
  \`\`\`
  promptCn: "极端仰拍，[角色名]从下方仰视，下巴轮廓锋利突出，
            鼻孔隐约可见，肩膀呈宽大倒三角剪影，腿部透视缩短几乎不可见，
            垂直的身体线条向天空汇聚"
  promptEn: "(extreme low angle:1.4), [character] seen from below,
            (chin prominent:1.3), (nostrils faintly visible:1.2),
            (shoulders forming wide inverted triangle:1.3),
            (foreshortened legs:1.2), vertical lines converging upward"
  \`\`\`

  **极端俯拍/鸟瞰人物描述**：
  \`\`\`
  promptCn: "鸟瞰视角，[角色名]的头顶和肩膀轮廓清晰可见，
            背部弧线突出，脸部只见额头和头发，
            身体呈缩小的圆形剪影，地面细节占主导"
  promptEn: "(bird's eye view:1.4), [character] seen from above,
            (top of head and shoulders prominent:1.3),
            (back visible:1.2), (face foreshortened only forehead visible:1.2),
            figure diminished, ground details dominant"
  \`\`\`

  ================================================================================
  ## 💡 角度与光影配合规则（基于《Framed Perspective Vol.2》）

  ### 核心原则：光影方向必须与相机角度逻辑一致！

  | 相机角度 | 推荐光源 | 阴影位置 | 情绪效果 |
  |----------|---------|---------|---------|
  | **仰拍+顶光** | 顶光/背光 | 下巴下方深重阴影 | 威胁感、剪影效果 |
  | **仰拍+底光** | 底光 | 眼窝、额头阴影 | 恐怖、诡异 |
  | **俯拍+顶光** | 顶光 | 头顶亮、眼窝阴影 | 脆弱、被审视 |
  | **侧面+侧光** | 侧光 | 半明半暗 | 神秘、立体感 |
  | **逆光** | 背光 | 正面全黑剪影 | 威胁、神秘、史诗感 |

  ### 边缘光/轮廓光（Rim Light）

  背光照亮物体边缘，效果：
  - 将主体与背景分离
  - 创造发光的轮廓线
  - 增加三维立体感

  **轮廓光提示词**：
  \`\`\`
  promptCn: "背光轮廓光勾勒边缘，头发和肩膀发出金色光边"
  promptEn: "(rim light:1.3), (backlight:1.2), golden glow outlining hair and shoulders"
  \`\`\`

  ### 反射光（Reflected Light）

  从地面/墙壁反弹的光：
  - 软化阴影边界
  - 让黑暗区域不至于死黑
  - 特别适合雪地、水面、室内场景

  ================================================================================
  ## 🎬 动作拆解规范（复杂动作必须拆解！）

  复杂动作必须拆解为单一步骤，避免AI理解混乱：

  | 动作类型 | ❌ 错误写法 | ✅ 正确写法 |
  |---------|-----------|-----------|
  | 幅度控制 | 快速甩头 | 小幅度缓慢转动头部 |
  | 动作拆解 | 挥手 | 缓慢抬起小臂→手腕轻微转动→手掌张开 |
  | 肢体保护 | 跳舞 | 上半身轻微摆动，双手自然下垂 |
  | 起身动作 | 站起来 | 双手撑地→膝盖缓慢伸直→上身逐渐直立 |
  | 转身动作 | 转身 | 头部先转向目标方向→肩膀跟随转动→身体完成转向 |

  ================================================================================
  ## 💡 光影描述具象化规范（禁止抽象表述！）

  光影变化必须具象化描述，避免抽象表述：

  | ❌ 抽象写法 | ✅ 具象写法 |
  |-----------|-----------|
  | 光线变亮 | 晨光透过树叶在地面形成移动的光斑 |
  | 光线变暗 | 夕阳余晖从人物左肩缓慢移动至右肩 |
  | 灯光闪烁 | 台灯暖光逐渐照亮书页文字 |
  | 光影变化 | 侧光从左脸缓慢移动至右脸，阴影区域逐渐缩小 |
  | 氛围变冷 | 蓝色月光从窗外渗入，在地板上形成长方形光斑 |

  ================================================================================
  ## 👘 服装褶皱与动态规则（基于《Framed Perspective Vol.2》）

  ### 褶皱产生的四种力

  | 力的类型 | 产生位置 | 褶皱特征 | 示例 |
  |----------|----------|----------|------|
  | **重力** | 悬挂点 | 垂直向下的褶皱 | 披风、裙摆 |
  | **张力** | 拉伸点 | 从拉伸点向外辐射 | 弯曲的肘部、膝盖 |
  | **压缩** | 挤压点 | 密集的褶皱堆积 | 弯腰时的腰部 |
  | **扭转** | 旋转点 | 螺旋状褶皱 | 扭转的手臂 |

  ### 运动中的布料动态

  **规则**：
  - 布料向运动相反方向飘动
  - 运动越快，飘动越剧烈
  - 停止瞬间，布料会有"滞后"飘动

  **动态镜头提示词**：
  \`\`\`
  promptCn: "[角色]快速[奔跑/挥剑/跳跃]，[披风/衣袖/裙摆]向[后方/侧向]飘动，
            褶皱从[肩膀/腰部]向外辐射，形成流动的曲线"
  promptEn: "[character] rapidly [running/slashing/jumping],
            (cape billowing backward:1.3), (sleeves flowing:1.2),
            folds radiating from [shoulders/waist], creating flowing curves"
  \`\`\`

  ### 静态 vs 动态对比

  | 镜头类型 | 布料状态 | 描述方式 |
  |----------|---------|---------|
  | 静态/对话 | 布料自然下垂 | "披风垂落，轻微摆动" |
  | 行走 | 轻微飘动 | "衣摆轻轻摆动" |
  | 奔跑 | 明显飘动 | "披风向后飘动" |
  | 跳跃/战斗 | 剧烈飘动 | "披风剧烈翻飞，褶皱辐射" |

  - 禁止使用模糊描述，必须具体到方位和动作

  ## 输出要求
  - 所有描述使用中文自然语言，不使用【】：|等特殊符号
  - promptCn格式：景别(英文缩写)，视角高度(角度)，角色朝向(角度)。人物位置、姿态、表情、道具的自然语言描述。构图和光影描述。
  - endFramePromptCn格式与promptCn相同（运动镜头必填）
  - videoPromptCn 使用中文描述视频生成提示词
  - 提示词控制在800字以内，精炼浓缩
  - 返回纯JSON数组，不要markdown代码块

  ## 🚨🚨🚨 视频提示词七要素规范（所有镜头强制遵守！必须使用中文！）

  ### 🔴 强制规则：所有镜头都必须以"从首帧到尾帧"开头！
  无论是静态镜头、I2V模式还是Keyframe模式，videoGenPrompt都必须遵循统一格式！

  ### 核心公式（必须严格遵守！）
  \`\`\`
  "videoPromptCn": "从首帧到尾帧，[过渡方式] + [运镜方式] + [主体动作+运动轨迹] + [环境响应] + [光影过渡] + [速度节奏]，[时长]秒。"
  \`\`\`

  ### 七要素详解（每条都必须包含！缺一不可！）
  | 要素 | 说明 | 静态镜头示例 | 运动镜头示例 |
  |-----|------|------------|------------|
  | 1.过渡方式 | 明确变化类型 | 镜头固定 | 形态渐变/空间平移 |
  | 2.运镜方式 | 镜头运动 | 固定镜头 | 侧向跟拍/缓慢推进/环绕 |
  | 3.主体动作 | 拆分为步骤 | 保持静止姿态仅有轻微呼吸起伏 | 缓慢抬手→手腕转动→手掌张开 |
  | 4.运动轨迹 | 明确方向 | 身体微微前倾 | 从画面左侧向右侧移动 |
  | 5.环境响应 | 背景变化 | 背景光影微妙变化 | 苔藓随经过闪烁/花瓣飘落 |
  | 6.光影过渡 | 光线变化 | 侧光微妙变化在面部形成光影流动 | 从冷蓝调转为暖黄调 |
  | 7.速度节奏 | 量化控制 | 缓慢节奏 | 匀速/先慢后快/前3秒缓慢后2秒加速 |

  ### ⚠️ 字数要求
  - 最少50字，最多150字
  - 静态镜头通常50-80字
  - 运动镜头通常80-150字

  ### ✅ 正确示例（包含七要素）
  \`\`\`
  "videoPromptCn": "从首帧到尾帧，镜头侧向跟拍缓慢推进，两人在暗色生物管道中快速奔跑从画面左侧向右侧移动，脚步溅起蓝色电弧火花，管壁发光苔藓随经过明暗闪烁，光影从冷蓝调逐渐转为红蓝交织，先慢后快节奏，5秒。"
  \`\`\`

  ### ❌ 错误示例
  \`\`\`
  "videoPromptCn": "镜头侧向平移跟随两人全速奔跑，高速运动感，5秒。"
  // 问题：缺少过渡锚定、运动轨迹、环境响应、光影过渡
  \`\`\`

  ### 🚨 AI识别准确性规则（必须遵守！）
  | ❌ 禁止使用 | 问题 | ✅ 正确替换 |
  |-----------|------|-----------|
  | 动态剪影 | 太抽象 | 侧身轮廓/奔跑轮廓 |
  | 数据火花/数据碎片 | 太抽象 | 蓝色电弧火花/发光蓝色碎片 |
  | 更明显/更强烈 | 比较级 | 强烈的/浓烈的 |
  | 动态模糊/运动模糊 | 后期效果 | 带有速度感/衣角飘动 |
  | 全速奔跑/极度紧张 | 程度过度 | 快速奔跑/紧张专注 |

  ## ⚠️ 重要：提示词禁止包含美术风格！
  - promptCn, endFramePromptCn, videoPromptCn 中禁止出现以下内容：
    * "水墨", "线稿", "铅笔", "素描"
    * "水彩", "油画", "数字绘画"
    * "动漫风格", "漫画风格", "赛璐璐"
    * 任何其他美术风格描述
  - 提示词只描述画面内容、构图、光影，风格由用户在绘图阶段另行选择

  ================================================================================
  ## 🚨🚨🚨 最终自检（输出前必须执行！）

  在生成JSON数组之前，必须自检：

  ### 步骤1：数镜头数
  数一数你的JSON数组有多少个镜头对象？

  ### 步骤2：判断是否合格
  - 镜头数 >= 24 → ✅ 合格，输出
  - 镜头数 < 24 → ❌ 不合格！必须增加镜头！

  ### 步骤3：如果不合格，增加镜头
  从以下方式选择增加镜头：
  1. 为动作添加「准备→动作→效果」三步分解
  2. 添加「环境反应镜头」（如波纹扫过石柱）
  3. 添加「角色反应镜头」（如魔教教主惊恐）
  4. 添加「UI界面特写镜头」（如警告弹窗）
  5. 添加「氛围渲染镜头」（如天空裂开）

  ### ⚠️ 绝对禁止
  - 输出 < 20 个镜头 = 任务失败！
  - 每个剧本段落只有 1-2 个镜头 = 任务失败！

  ================================================================================
  `;

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

  const contentInput = `
  角色：资深动画导演 / 分镜审核专家

  ## 审核标准（用户自定义）
  ${customCriteria}
  ${shotCountWarning}

  ## 审核重点
  0. **🚨镜头数量**：当前共 ${currentShotCount} 个镜头。如果少于24个，必须在第一条建议中指出并要求增加！
  1. **叙事连贯性**：故事事件是否清晰？读者能否理解每个镜头在讲什么？
  2. **构图合理性**：景别、角度是否符合情绪？有没有过多的平视或中景？
  3. **动线清晰度**：角色的移动路径是否明确？是否遵守180度法则？
  4. **首尾帧质量**：对于需要动画的镜头，首帧和尾帧描述是否足够具体？
  5. **视觉多样性**：镜头是否有足够变化？避免连续相同的景别或角度
  6. **AI可生成性**：提示词是否避免了"8k"、"超写实"等不适合水墨风格的词汇？
  7. **🚨空间连续性**：
     - 相邻镜头的角色位置是否逻辑连贯（如A镜头右摇到B角色→B镜头必须以B角色开始）
     - 墙壁等环境参照物的方位是否一致（左侧墙/右侧墙是否跳轴）
     - 运动镜头的尾帧与下一镜头的首帧是否空间衔接
  8. **🚨提示词完整性**：
     - promptCn/promptEn是否包含完整信息（景别、角度、角色位置、动作、构图、光影）
     - 是否有模糊描述需要具体化（如"指着墙"→"手指向画面右侧墙面"）

  ## 输出要求
  - 所有内容必须使用**中文**输出
  - 返回JSON数组，每个建议包含：
    - shotNumber: 镜头编号（如"01"）或"GLOBAL"表示全局问题
    - suggestion: 具体修改建议（中文）
    - reason: 修改原因和理论依据（中文）
  - **如果镜头数量不足24个，第一条必须是镜头数量不足的建议！**

  ## 输出格式
  返回纯JSON数组，不要markdown代码块。示例：
  [
    {"shotNumber": "GLOBAL", "suggestion": "镜头数量不足！需要增加X个镜头", "reason": "标准90秒动画需要24-30个镜头"},
    {"shotNumber": "05", "suggestion": "将平视改为低角度仰拍", "reason": "此时敌人出现，低角度可以增加威胁感，符合Framed Ink的权力角度理论"},
    {"shotNumber": "12", "suggestion": "补充首帧描述，明确角色起始位置", "reason": "当前首帧描述过于简略，AI视频生成可能无法正确理解运动起点"}
  ]

  ## 分镜数据（共${currentShotCount}个镜头）
  ${JSON.stringify(shots)}
  `;

  const client = getClient(model);
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: contentInput }],
    max_tokens: 4000,
  });

  const rawText = response.choices[0]?.message?.content || '[]';

  // 增强 JSON 提取 - 找到数组边界
  let jsonText = rawText;
  const jsonStart = rawText.indexOf('[');
  const jsonEnd = rawText.lastIndexOf(']');

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    jsonText = rawText.substring(jsonStart, jsonEnd + 1);
  }

  try {
    return JSON.parse(cleanJsonOutput(jsonText));
  } catch (e) {
    console.error('自检 JSON 解析失败，原始文本:', rawText);
    // 返回空数组而不是崩溃
    return [];
  }
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
  const prompt = `你是专业的AI绘图提示词工程师，精通 Nano Banana Pro (Gemini 3 Pro) 的提示词规范。

## 任务
从分镜脚本中提取 **纯画面描述的AI生图提示词**，供 Nano Banana Pro 模型生成分镜草图。

## Nano Banana Pro 提示词公式（官方手册）
**[主体描述] + [环境/背景] + [动作/状态] + [技术参数(景别/角度/光影)]**

- **主体描述**：具体的角色或物体，包含外貌、服装、在画面中的位置（如"画面左1/3处"）
- **环境/背景**：场景、天气、时间
- **动作/状态**：正在做什么，表情、姿态
- **技术参数**：景别(如medium shot)、角度(如low angle, 3/4 front view)、光影(如dramatic side lighting)

## 🚨 关键规则

### 1. 禁止包含美术风格！
❌ 禁止词：ink sketch, pencil drawing, watercolor, anime style, 线稿, 水墨, 素描, 漫画风格
✅ 只描述纯画面内容，风格由用户在生图时选择

### 2. 运动镜头需要首尾帧
- 静态镜头：只生成 imagePromptCn/En
- 运动镜头：必须生成 imagePromptCn/En（首帧）+ endImagePromptCn/En（尾帧）

### 3. 提示词格式（🚨 必须严格遵守！）

#### 中文版格式
- 使用自然语言描述，清晰具体
- 格式：{景别}拍摄，镜头{角度高度}，{角度朝向}。{主体描述}。{环境描述}。{光影描述}。
- 示例："广角镜头拍摄，镜头从上方拍摄，背对镜头。画面中心是一道细长的红色闪电状裂缝正缓慢撕裂，周围布满分层翻滚的红色几何状数据云团。场景设定在深邃黑暗的二进制虚空中，由裂缝辐射出的戏剧性红光照亮，勾勒出云团边缘。前景有失焦的二进制碎片形成散景效果。"

**🚨 中文提示词必须使用摄影术语，不使用分镜术语！**

**术语映射表**：
| 分镜术语 | 中文摄影术语 |
|---------|------------|
| 特写(CU) | 特写拍摄 / 近距离拍摄 |
| 大远景(ELS) | 广角镜头拍摄 / 远景拉开 |
| 远景(LS) | 远景拍摄 / 宽镜头拍摄 |
| 中景(MS) | 中景拍摄 |
| 近景(MCU) | 近景拍摄 |
| 中度俯拍 | 从上方拍摄 / 高角度拍摄 |
| 轻微俯拍 | 略微从上方拍摄 |
| 平视 | 与眼睛同高 / 水平视线 |
| 轻微仰拍 | 略微从下方拍摄 |
| 中度仰拍 | 从下方拍摄 / 低角度拍摄 |
| 正面 | 直视镜头 / 面向镜头 |
| 3/4正面 | 轻微向右转 / 轻微向左转 |
| 正侧面 | 右侧面轮廓 / 左侧面轮廓 |
| 3/4背面 | 转身背对，回头看肩 |
| 背面 | 背对镜头 / 面向远方 |

**正确示例**：
✅ "远景拍摄，镜头略微从上方拍摄，右侧面轮廓。晋安与林溪位于画面左侧边缘..."
❌ "远景(LS)，轻微俯拍(5-15°)，正侧面(90°)。晋安与林溪位于画面左侧边缘..."

#### 英文版格式（🆕 使用自然语言描述，不使用权重参数格式）
- **使用自然语言描述**，而非权重参数格式
- 格式：A [shot type] of [subject], captured [camera height]. The subject is [action/expression]. The scene is set in [environment], illuminated by [lighting].
- ❌ **禁止使用权重参数格式**：如 (medium shot:1.2), (low angle:1.3)
- ✅ **必须使用自然语言描述**：如 "A medium shot of...", "captured from below"

**错误示例（权重参数格式）**：
❌ "(medium shot:1.2), (eye level), (front view), character standing at center frame"

**正确示例（自然语言描述）**：
✅ "A medium shot of a character standing at center frame, captured at eye level, looking forward. The character has a focused expression, hands naturally down. The scene is set in a dim indoor environment with cracked walls and wet floor, illuminated by side lighting creating contrast on the face."

### 3.5 🚨 英文提示词必须纯英文（极重要！）
- **imagePromptEn** 和 **endImagePromptEn** 必须100%纯英文
- ❌ **绝对禁止**包含任何中文字符（包括中文标点）
- ❌ **绝对禁止**包含中文描述如"角色穿着服装，站在画面中央"
- ✅ 只能包含英文字母、数字、英文标点
- ✅ 如果AI生成时混入中文，必须立即删除所有中文部分

### 4. 必须包含的信息
- 角色在画面中的具体位置（左侧/中央/右侧/画面前景等）
- 角色朝向（面向镜头/背对/侧面等）
- 景别和角度的英文术语（必须精确！见下方角度规则）
- 光影描述

### 4.5 🚨 角度精确描述规则（🆕 使用摄影术语，不使用电影分镜术语）

#### 景别术语（摄影术语）
| 中文术语 | 摄影术语（英文） | 说明 |
|---------|----------------|------|
| 大远景 | wide-angle shot / zoomed out photo | 展示广阔环境 |
| 远景 | long shot / wide shot | 主体完整呈现，环境占主导 |
| 中景 | medium shot | 人物膝盖/腰部以上 |
| 近景 | close-up / close shot | 人物胸部以上 |
| 特写 | extreme close-up | 面部占满画面 |

#### 水平朝向角度（🆕 使用摄影术语）
| 中文术语 | 摄影术语（英文） | 关键特征 |
|---------|----------------|---------|
| 正面 | looking forward / facing camera / looking directly at camera | 双眼双耳对称可见 |
| **微侧正面** | **looking slightly to the left / looking slightly to the right** | ⚠️ 一边脸颊更突出 |
| **3/4正面** | **turned slightly to the right / looking slightly to the right** | ⚠️ 易被误画！必须强调"一边脸颊更突出" |
| 正侧面 | in profile looking right / in profile looking left / perfect side profile | 完美剪影轮廓 |
| 3/4背面 | turned away, looking over shoulder / back view with shoulder glance | 主要看到后脑勺 |
| 背面 | back to camera / facing away / back view | 只看到背影 |

#### 垂直高度角度（🆕 使用摄影术语）
| 中文术语 | 摄影术语（英文） | 透视变形 |
|---------|----------------|---------|
| 鸟瞰 | aerial shot / directly from above / overhead view | 头顶为主，身体垂直压缩 |
| 极端俯拍 | from high above / extreme high-angle shot | 头顶突出，脸部缩短 |
| 中度俯拍 | from above / high-angle shot | 头顶略突出 |
| 轻微俯拍 | from slightly above / mild high-angle shot | 轻微俯视 |
| 平视 | at eye level / eye-level shot | 正常比例 |
| 轻微仰拍 | from slightly below / mild low-angle shot | 轻微仰视 |
| 中度仰拍 | from below / low-angle shot | 下巴突出，身体向上延伸 |
| 极端仰拍 | from far below / extreme low-angle shot | 下巴突出，鼻孔可见 |
| 虫视 | from ground level / worm's-eye view | 极端透视变形 |

**参考文档**：.augment/rules/AI图像生成提示词术语对照表.md

### 5. 🚨 前景描述规则（重要！避免AI误解）
❌ **禁止写法**：
- "[前景: 模糊的破碎衣袖边框]" → AI会理解为画面四周的装饰边框
- "[foreground: blurred frame of cloth]" → AI会生成画面边缘的框

✅ **正确写法**：
- 使用 "in the foreground" 或 "foreground out of focus" 这样的自然描述
- 明确说明是"镜头前方的虚化元素"而非"边框"
- 用 "partial view of..." "blurred partial..." 代替 "边框"

**前景正确示例**：
- ❌ "[前景: 模糊的破碎衣袖边框]"
- ✅ "shallow depth of field, blurred torn fabric visible at bottom edge of frame"
- ✅ "extreme close foreground: out-of-focus ragged cloth edge intrudes from bottom"

- ❌ "[前景: 模糊的手掌侧缘]"
- ✅ "foreground bokeh: partial palm silhouette soft and out of focus at frame edge"
- ✅ "shallow DOF, blurred hand edge visible in immediate foreground"

**中文正确示例**：
- ❌ "[前景: 模糊的破碎衣袖边框]"
- ✅ "浅景深，画面底部有虚化的破碎衣袖边缘入画"
- ✅ "镜头前方近距离：失焦的衣袖残片遮挡画面一角"

## 输入分镜数据
${JSON.stringify(shots.map(s => ({
  shotNumber: s.shotNumber,
  shotType: s.shotType,
  storyBeat: s.storyBeat,
  dialogue: s.dialogue,
  shotSize: s.shotSize,
  angleDirection: s.angleDirection,
  angleHeight: s.angleHeight,
  foreground: s.foreground,
  midground: s.midground,
  background: s.background,
  lighting: s.lighting,
  cameraMove: s.cameraMove,
  startFrame: s.startFrame,
  endFrame: s.endFrame,
  promptCn: s.promptCn,
  promptEn: s.promptEn
})), null, 2)}

## 输出格式
返回JSON数组，每个对象包含：
{
  "shotNumber": "01",
  "imagePromptCn": "中文生图提示词（首帧/静态）",
  "imagePromptEn": "English image prompt (start frame/static)",
  "endImagePromptCn": "中文生图提示词（尾帧，运动镜头需要）",
  "endImagePromptEn": "English image prompt (end frame, for motion shots)",
  "videoGenPrompt": "视频生成提示词（🚨必须使用中文！格式见下方七要素规范）"
}

## 🚨 透视与人物变形规则（必须遵守！）

### 透视类型与提示词模板

#### 一点透视（适用场景：走廊、隧道、街道）
**中文模板**：
消失点在画面中央，向远处延伸，两侧元素向消失点汇聚

**英文模板**：
vanishing point at center, receding into distance, elements converging to VP

#### 两点透视（适用场景：建筑外观、街角）
**中文模板**：
地平线在画面1/3处，建筑呈角度朝向观众，左右墙面向各自消失点汇聚

**英文模板**：
horizon at third, building at angle to viewer, walls converging to left and right VPs

#### 三点透视向上（适用场景：仰拍高楼、英雄登场）
**中文模板**：
第三消失点在天空，垂直线向上汇聚，建筑/人物呈高耸倒三角

**英文模板**：
third VP in sky, verticals converging upward, towering inverted triangle

#### 三点透视向下（适用场景：俯拍深渊、脆弱角色）
**中文模板**：
第三消失点在地面深处，垂直线向下汇聚，人物呈缩小的头顶视角

**英文模板**：
third VP at nadir, verticals converging downward, diminished top-down view

---

### 人物透视变形对照表

不同角度下，人物必须表现相应的透视变形：

| 相机角度 | 人物变形特征 | 中文关键词 | 英文关键词 |
|----------|-------------|----------|-----------|
| 极端仰拍 | 下巴突出、鼻孔可见、肩膀放大、腿部缩短 | 下巴锋利突出，鼻孔隐约可见，肩膀呈宽大倒三角，腿部透视缩短 | chin prominent, nostrils visible, shoulders widened, foreshortened legs |
| 仰拍 | 下巴略突出、胸部底面可见、人物显高大 | 下巴略突出，胸部底面可见，人物高耸 | slight chin prominence, chest underside visible, figure towering |
| 平视 | 正常比例、地平线在眼睛位置 | 正常比例，地平线在眼睛位置 | normal proportions, horizon at eye level |
| 俯拍 | 头顶突出、肩膀顶面可见、人物显矮小 | 头顶突出，肩膀顶面可见，人物显矮小 | head top prominent, shoulder tops visible, figure appears shorter |
| 鸟瞰 | 只见头顶背部、脸部透视压缩、地面占主导 | 只见头顶和肩膀轮廓，脸部透视压缩，地面细节占主导 | top of head and shoulders visible, face foreshortened, ground dominant |

---

### 布料动态规则
运动镜头必须描述布料动态：
- 奔跑：披风/衣袖向后飘动
- 跳跃：布料向上/侧向翻飞
- 静止：布料自然下垂

### 光影配合规则
- 仰拍+顶光：下巴阴影深重，形成威胁感
- 仰拍+背光：轮廓光勾勒边缘，剪影效果
- 俯拍+顶光：头顶亮，眼窝阴影，脆弱感

**参考文档**：.augment/rules/透视知识-项目应用指南.md

## 示例输出

### 静态镜头示例（平视，I2V模式 - 微动呼吸感）
{
  "shotNumber": "05",
  "imagePromptCn": "中景，平视，3/4正面。林溪站在画面中央，穿着深色战术服，单手持剑置于身侧，正常人体比例，表情警惕地望向画面右侧。背景是废弃工厂的锈蚀钢梁，前景有模糊的碎片。侧光从左侧打来，形成半明半暗的立体感。",
  "imagePromptEn": "(medium shot:1.2), (eye level), (3/4 front view), young woman with ponytail in dark tactical suit, standing at center frame, normal proportions, holding sword at her side, alert expression looking right, abandoned factory with rusty steel beams in background, blurred debris in foreground, (dramatic side lighting from left:1.2), half-lit half-shadowed face, high contrast",
  "endImagePromptCn": "",
  "endImagePromptEn": "",
  "videoGenPrompt": "从首帧到尾帧，镜头固定，林溪保持静止站姿仅有轻微呼吸起伏，胸口微微起伏，眼神缓慢从左向右扫视，侧光微妙变化在面部形成光影流动，缓慢节奏，3秒。"
}

### 仰拍镜头示例（含人物透视变形！I2V模式）
{
  "shotNumber": "08",
  "imagePromptCn": "中近景，极端仰拍，3/4正面，三点透视向上。晋安从下方仰视，下巴轮廓锋利突出，鼻孔隐约可见，肩膀呈宽大倒三角剪影，腿部透视缩短几乎不可见。披风向后上方飘动褶皱辐射。背景是翻滚乌云和向天空汇聚的垂直建筑线条。顶光逆光勾勒轮廓光边，威压感强烈。",
  "imagePromptEn": "(medium close-up:1.2), (extreme low angle:1.4), (3/4 front view), (three-point perspective upward:1.3), male figure seen from below, (chin sharp and prominent:1.3), (nostrils faintly visible:1.2), (shoulders forming wide inverted triangle:1.3), (foreshortened legs barely visible:1.2), cape billowing backward and upward with radiating folds, churning clouds and vertical building lines converging toward sky in background, (rim light from top backlight:1.3) outlining silhouette, overwhelming imposing presence",
  "endImagePromptCn": "",
  "endImagePromptEn": "",
  "videoGenPrompt": "从首帧到尾帧，镜头固定保持仰拍角度，晋安保持威压站姿身体微微前倾，披风随风缓慢向后飘动褶皱变化，背景乌云翻滚流动从左向右移动，逆光轮廓光微妙闪烁，缓慢节奏，4秒。"
}

### 鸟瞰镜头示例（含人物透视变形！I2V模式）
{
  "shotNumber": "12",
  "imagePromptCn": "远景，鸟瞰，三点透视向下。林溪的头顶和肩膀轮廓渺小，跪倒在废墟中央，只见头顶发型和背部弧线，脸部透视压缩只见额头。垂直的断壁残垣向地面中心汇聚。顶光从上方照下只照亮她小小的身影，四周巨大阴影包围，强调孤立与脆弱。",
  "imagePromptEn": "(long shot:1.2), (bird's eye view:1.4), (three-point perspective downward:1.3), female figure small and diminished, (top of head and shoulders visible:1.3), kneeling in center of ruins, only hair and back arc visible, (face foreshortened only forehead seen:1.2), vertical broken walls converging toward ground center, (top light from above:1.2) illuminating only her small figure, massive shadows surrounding, emphasizing isolation and vulnerability",
  "endImagePromptCn": "",
  "endImagePromptEn": "",
  "videoGenPrompt": "从首帧到尾帧，镜头固定俯瞰视角，林溪跪倒姿态身体微微颤抖，肩膀随呼吸轻微起伏，废墟中尘埃缓慢从上方飘落，顶光强度微妙闪烁变化，缓慢沉重节奏，4秒。"
}

### 动态追逐镜头示例（含布料动态！）
{
  "shotNumber": "15",
  "imagePromptCn": "中景，轻微仰拍，正侧面，一点透视。狭长走廊向远处延伸消失点在画面中央偏右。林溪位于画面左1/3处快速奔跑，披风和衣袖向后剧烈飘动形成流动曲线，褶皱从肩膀辐射。两侧墙壁向消失点汇聚营造纵深感。顶光体积光穿透，尘埃飞扬。",
  "imagePromptEn": "(medium shot:1.2), (mild low angle:1.2), (full side view), (one-point perspective:1.3), narrow corridor receding into distance VP slightly right of center, young woman at left third of frame running fast, (cape billowing backward dramatically:1.3), (sleeves flowing:1.2), folds radiating from shoulders creating flowing curves, walls on both sides converging to VP creating depth, (volumetric top light:1.2) piercing through, dust particles floating",
  "endImagePromptCn": "中景，平视，3/4正面。林溪停在画面中央喘息，披风缓缓落下有滞后飘动，褶皱从肩膀自然下垂。前方走廊尽头可见微弱光源。",
  "endImagePromptEn": "(medium shot:1.2), (eye level), (3/4 front view), young woman stopped at center frame catching breath, cape settling down with delayed flutter, folds naturally falling from shoulders, faint light source visible at end of corridor ahead",
  "videoGenPrompt": "从首帧到尾帧，镜头跟拍向前推进，林溪在狭长走廊中快速奔跑，披风剧烈向后飘动，然后逐渐减速停下喘息，披风缓缓落下，快速转中速节奏，5秒。"
}

### 🚨 前景虚化特写示例（正确写法！I2V模式）
{
  "shotNumber": "20",
  "imagePromptCn": "特写，平视，正面。浅景深效果：画面底部边缘可见失焦的破碎衣袖残片入画，虚化模糊。中景主体：晋安双手合十于胸前，鲜血从指缝渗出，与隐形电路接触产生脉冲蓝光。后景是深暗的玄青色虚空。强戏剧性高对比光影，蓝色电路流作为动态光源照亮面部。",
  "imagePromptEn": "(close-up:1.3), (eye level:1.2), (front view), (shallow depth of field:1.3), extreme foreground: out-of-focus torn fabric edge softly intruding from bottom of frame, midground subject: male with hands pressed together at chest, blood seeping through fingers, contact with invisible circuit generating pulsing blue glow, deep dark cyan-green void in background, (strong dramatic high contrast lighting:1.3), blue circuit streams as dynamic light source illuminating face",
  "endImagePromptCn": "",
  "endImagePromptEn": "",
  "videoGenPrompt": "从首帧到尾帧，镜头固定，晋安双手合十保持静止姿态，鲜血从指缝缓慢渗出滴落，与隐形电路接触产生脉动蓝光逐渐增强，蓝色光芒在面部形成动态光影变化，缓慢节奏，3秒。"
}

只返回纯JSON数组，不要markdown代码块。`;

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
 * 根据对话修改分镜（流式）- 兼容 gemini.ts 的 chatEditShotListStream
 */
export async function* chatEditShotListStream(
  shots: Shot[],
  userInstruction: string,
  model: string = DEFAULT_MODEL
) {
  const prompt = `Task: AI Director Co-pilot. Modify storyboard based on user instruction.
  User Instruction: "${userInstruction}"

  ⚠️⚠️⚠️ **CRITICAL RULES - 内容完整性保护（最高优先级）**：

  1. **禁止删除关键信息**：
     - 如果用户说"减少镜头数量"、"简化"、"太多了"，你应该**合并镜头**，而不是删除镜头！
     - 合并镜头时，必须保留所有关键信息：
       * 故事详细描述（storyDescription）
       * 首尾帧详细描述（firstFrameDescription, lastFrameDescription）
       * 对话内容（dialogue）
       * 剧情内容
     - 例如：将镜头#1和#2合并为新镜头#1，新镜头的storyDescription应该包含原#1和#2的所有剧情内容

  2. **镜头数量限制**：
     - 如果用户没有明确要求减少镜头数量，禁止删除镜头！
     - 如果用户要求减少镜头数量，镜头数量不得减少超过20%！
     - 减少镜头时，优先合并相似或连续的镜头，而不是直接删除

  3. **内容合并规则**：
     - 合并镜头时，storyDescription = 原镜头1的storyDescription + " " + 原镜头2的storyDescription
     - 合并镜头时，firstFrameDescription = 原镜头1的firstFrameDescription
     - 合并镜头时，lastFrameDescription = 原镜头2的lastFrameDescription
     - 合并镜头时，dialogue = 原镜头1的dialogue + " " + 原镜头2的dialogue（如果有）
     - 合并镜头时，duration = 原镜头1的duration + 原镜头2的duration

  4. **质量保证**：
     - Keep prompts PURE (no style tags like "Ink Sketch", "watercolor", etc.). Style will be added at render time.
     - Ensure updated prompts DO NOT contain realistic keywords like '8k', 'photorealistic', 'ultra realistic'.
     - Maintain JSON structure with all required fields.
     - Return ONLY valid JSON array, no markdown code blocks, no explanations.

  5. **输出格式**（⚠️ 严格遵守！）：
     - 你必须只返回一个有效的JSON数组，不要包含任何其他文本！
     - 不要使用markdown代码块（如 \`\`\`json）
     - 不要添加任何说明文字
     - 直接以 [ 开头，以 ] 结尾

  Current Storyboard (${shots.length} shots): ${JSON.stringify(shots)}`;

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
 * 调用 OpenRouter 图像生成 API 生成单张图像
 * 支持传入角色设定图作为参考
 */
async function generateSingleImage(
  prompt: string,
  imageModel: string = DEFAULT_IMAGE_MODEL,
  characterRefs: CharacterRef[] = []
): Promise<string | null> {
  try {
    // 图像生成始终使用 OpenRouter（DeepSeek 不支持图像生成）
    const client = getClient(imageModel);

    console.log(`[OpenRouter] 图像生成请求: ${prompt.substring(0, 100)}...`);
    if (characterRefs.length > 0) {
      console.log(`[OpenRouter] 附带 ${characterRefs.length} 张角色设定图作为参考`);
    }

    // 构建消息内容 - 支持多模态（文本 + 图像参考）
    const messageContent: any[] = [];

    // 如果有角色设定图，先添加角色参考指令和图片
    if (characterRefs.length > 0) {
      // 添加角色参考提示
      const charNames = characterRefs.map(c => c.name).filter(Boolean).join('、');
      messageContent.push({
        type: 'text',
        text: `【角色参考】以下是角色设定图，请在生成分镜时保持角色外观一致：${charNames ? `涉及角色: ${charNames}` : ''}\n`
      });

      // 添加所有角色设定图
      for (const ref of characterRefs) {
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: ref.data // base64 data URL
          }
        });
      }

      // 添加分隔
      messageContent.push({
        type: 'text',
        text: '\n【分镜生成任务】\n' + prompt
      });
    } else {
      // 没有角色设定图，直接使用文本提示词
      messageContent.push({
        type: 'text',
        text: prompt
      });
    }

    // OpenRouter 图像生成 API 调用
    const response = await (client as any).chat.completions.create({
      model: imageModel,
      messages: [
        {
          role: 'user',
          content: characterRefs.length > 0 ? messageContent : prompt,
        },
      ],
      // 启用图像生成模式
      modalities: ['image', 'text'],
      // 图像配置 - 使用1K分辨率加速预览
      // 支持的尺寸: 1K (快速预览), 2K, 4K (高质量)
      // 支持的宽高比: 1:1, 3:4, 4:3, 9:16, 16:9
      image_config: {
        aspect_ratio: '16:9',  // 九宫格分镜草图使用16:9横版
        image_size: '1K',       // 1K分辨率，生成速度更快
      },
    });

    // 从响应中提取图像
    const message = response.choices?.[0]?.message;
    if (message?.images && message.images.length > 0) {
      const imageUrl = message.images[0]?.image_url?.url;
      if (imageUrl) {
        console.log('[OpenRouter] 图像生成成功');
        return imageUrl;
      }
    }

    console.warn('[OpenRouter] 响应中未找到图像，响应内容:', JSON.stringify(response, null, 2));
    return null;
  } catch (error) {
    // 🆕 增强错误处理：区分不同类型的错误
    if (error instanceof SyntaxError) {
      console.error('[OpenRouter] JSON解析失败（可能是API响应不完整）:', error.message);
      console.error('[OpenRouter] 建议：检查网络连接或稍后重试');
    } else if (error && typeof error === 'object' && 'response' in error) {
      // @ts-ignore
      console.error('[OpenRouter] API请求失败:', error.response?.status, error.response?.statusText);
      // @ts-ignore
      console.error('[OpenRouter] 错误详情:', error.response?.data);
    } else {
      console.error('[OpenRouter] 图像生成失败:', error);
    }
    return null;
  }
}

/**
 * 生成九宫格分镜草图 - 直接让AI生成包含9个分镜的九宫格图
 * 每张九宫格包含9个镜头（3x3布局），生成一张显示一张
 * 27个镜头 → 3张九宫格图
 */
export async function generateMergedStoryboardSheet(
  shots: Shot[],
  characterRefs: CharacterRef[],
  mode: 'draft' | 'hq',
  imageModel: string = DEFAULT_IMAGE_MODEL,
  style?: StoryboardStyle,
  onProgress?: (current: number, total: number, shotNumber: string) => void,
  onGridComplete?: (gridIndex: number, imageUrl: string) => void,
  episodeNumber?: number,  // 🆕 当前集数，用于匹配角色形态
  scenes?: SceneRef[],     // 🆕 场景库，用于匹配场景描述
  artStyleType?: ArtStyleType  // 🆕 美术风格类型，用于调整提示词
): Promise<string[]> {
  const styleName = style?.name || '粗略线稿';
  const styleSuffix = style?.promptSuffix || 'rough sketch, black and white, storyboard style';
  console.log(`[OpenRouter] 九宫格AI生成请求: ${shots.length} 个镜头, 模型: ${imageModel}, 风格: ${styleName}${episodeNumber ? `, 第${episodeNumber}集` : ''}${artStyleType ? `, 美术风格: ${artStyleType}` : ''}`);

  const GRID_SIZE = 9; // 每张图9个镜头 (3x3)
  const totalGrids = Math.ceil(shots.length / GRID_SIZE);
  const results: string[] = [];

  // 🆕 构建场景描述信息（如果有场景库）
  const sceneSection = scenes ? buildSceneDescriptionsForPrompt(scenes, episodeNumber) : '';

  // 🆕 构建美术风格约束
  const artStyleSection = artStyleType ? getArtStyleConstraints(artStyleType) : '';

  // 逐张生成九宫格图
  for (let gridIndex = 0; gridIndex < totalGrids; gridIndex++) {
    const startIdx = gridIndex * GRID_SIZE;
    const endIdx = Math.min(startIdx + GRID_SIZE, shots.length);
    const gridShots = shots.slice(startIdx, endIdx);

    // 回调进度
    if (onProgress) {
      onProgress(gridIndex + 1, totalGrids, `第${gridIndex + 1}张九宫格`);
    }

    console.log(`[OpenRouter] 生成第 ${gridIndex + 1}/${totalGrids} 张九宫格 (镜头 #${startIdx + 1} - #${endIdx})`);

    // 🆕 构建九宫格提示词 - 传入角色信息、集数、场景信息和美术风格约束
    const gridPrompt = buildNineGridPrompt(gridShots, gridIndex + 1, totalGrids, styleSuffix, styleName, characterRefs, episodeNumber, sceneSection, artStyleSection);

    // 调用AI生成九宫格图
    // 注意：大多数图像生成模型不支持图片参考，所以角色信息以文字形式写入提示词
    const imageUrl = await generateSingleImage(gridPrompt, imageModel, []);

    if (imageUrl) {
      results.push(imageUrl);
      // 生成一张就回调显示一张
      if (onGridComplete) {
        onGridComplete(gridIndex, imageUrl);
      }
    } else {
      console.warn(`[OpenRouter] 第 ${gridIndex + 1} 张九宫格生成失败`);
      // 失败时推入空字符串作为占位
      results.push('');
    }
  }

  console.log(`[OpenRouter] 九宫格生成完成: ${results.filter(r => r).length}/${totalGrids} 成功`);
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
 * @returns 生成的图片URL，失败返回null
 */
export async function generateSingleGrid(
  gridIndex: number,
  shots: Shot[],
  characterRefs: CharacterRef[],
  imageModel: string = DEFAULT_IMAGE_MODEL,
  style?: StoryboardStyle,
  episodeNumber?: number,
  scenes?: SceneRef[],
  artStyleType?: ArtStyleType
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

  console.log(`[OpenRouter] 单独生成第 ${gridIndex + 1}/${totalGrids} 张九宫格, 模型: ${imageModel}, 风格: ${styleName}`);

  // 计算该九宫格包含的镜头范围
  const startIdx = gridIndex * GRID_SIZE;
  const endIdx = Math.min(startIdx + GRID_SIZE, shots.length);
  const gridShots = shots.slice(startIdx, endIdx);

  // 构建场景描述信息
  const sceneSection = scenes ? buildSceneDescriptionsForPrompt(scenes, episodeNumber) : '';

  // 构建美术风格约束
  const artStyleSection = artStyleType ? getArtStyleConstraints(artStyleType) : '';

  // 构建九宫格提示词
  const gridPrompt = buildNineGridPrompt(
    gridShots,
    gridIndex + 1,
    totalGrids,
    styleSuffix,
    styleName,
    characterRefs,
    episodeNumber,
    sceneSection,
    artStyleSection
  );

  // 调用AI生成九宫格图
  const imageUrl = await generateSingleImage(gridPrompt, imageModel, []);

  if (imageUrl) {
    console.log(`[OpenRouter] 第 ${gridIndex + 1} 张九宫格生成成功`);
    return imageUrl;
  } else {
    console.warn(`[OpenRouter] 第 ${gridIndex + 1} 张九宫格生成失败`);
    return null;
  }
}

/**
 * 构建九宫格提示词 - 让AI直接生成一张包含9个分镜的图
 * 使用中文标注（首帧/尾帧），并强调镜头角度
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
  artStyleSection: string = ''  // 🆕 美术风格约束
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

  // 构建每个格子的场景描述
  const panelDescriptions = shots.map((shot, idx) => {
    const position = idx + 1;
    const row = Math.floor(idx / 3) + 1;
    const col = (idx % 3) + 1;
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
    const angleAnnotation = angleLabel.cn ? `【角度：${angleLabel.cn}】` : '';
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

      return `格子 ${position} (第${row}行第${col}列) - 运动镜头:
  镜号 #${shot.shotNumber} | ${shot.duration || '?s'} | ${shot.shotSize || 'LS'} ${angleAnnotation}
  ${angleInstruction ? angleInstruction + '\n  ' : ''}[首帧]: ${startFrame}
  [尾帧]: ${endFrame}
  → 左半部分画首帧，右半部分画尾帧，中间用箭头 → 连接
  ⚠️ 格子左上角标注: "#${shot.shotNumber} | ${shot.duration || '?s'} | ${angleLabel.cn || '平视'}"`;
    } else {
      // 静态镜头：单帧
      const sceneDesc = shot.imagePromptEn || shot.promptEn || shot.promptCn || 'empty scene';

      return `格子 ${position} (第${row}行第${col}列) - 静态镜头:
  镜号 #${shot.shotNumber} | ${shot.duration || '?s'} | ${shot.shotSize || 'LS'} ${angleAnnotation}
  ${angleInstruction ? angleInstruction + '\n  ' : ''}画面: ${sceneDesc}
  ⚠️ 格子左上角标注: "#${shot.shotNumber} | ${shot.duration || '?s'} | ${angleLabel.cn || '平视'}"`;
    }
  }).join('\n\n');

  // 填充空格子
  const emptyPanels = [];
  for (let i = shots.length; i < 9; i++) {
    const position = i + 1;
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    emptyPanels.push(`格子 ${position} (第${row}行第${col}列): 空白格子，显示"完"字`);
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
  return `• ${c.name}${genderLabel}：${appearanceDesc}`;
}).join('\n')}

⚠️ 重要规则：
- 同一角色在不同镜头中必须可识别为同一个人
- 严格按照上述外观描述绘制，不可随意修改
- 角色的发型、服装、体型必须保持一致
`
    : '';

  return `生成专业电影分镜表，3x3 九宫格布局。

═══════════════════════════════════════════════════════════════
【布局要求】
═══════════════════════════════════════════════════════════════
- 3列 × 3行 网格布局
- 每个格子用黑色边框清晰分隔
- 标题: "分镜表 第${pageNum}/${totalPages}页"
- 每个格子左上角标注镜号（#XX）和时长
${characterSection}${sceneSection}${artStyleSection}
═══════════════════════════════════════════════════════════════
【标注语言】使用中文标注！
═══════════════════════════════════════════════════════════════
- 用"首帧"不要用"START FRAME"
- 用"尾帧"不要用"END FRAME"
- 镜号格式: "#03 | 3s | 极端仰拍" （必须包含中文角度！）
- 每个格子左上角必须标注：镜号 + 时长 + 中文角度
- 角度示例：极端仰拍、俯拍、平视、鸟瞰、仰拍等

═══════════════════════════════════════════════════════════════
【镜头详情】
═══════════════════════════════════════════════════════════════

${allPanels}

═══════════════════════════════════════════════════════════════
【视觉风格】
═══════════════════════════════════════════════════════════════
- 画面风格: ${styleSuffix}
- 所有格子保持 ${styleName} 风格一致
- 运动镜头: 左右分割，左边首帧，右边尾帧，中间箭头 →

【关键要求】
- 生成一张包含全部9个格子的图
- 整体16:9横版比例
- 专业电影分镜质量
- 格子之间视觉区分清晰
- ⚠️ 严格按照每个镜头指定的【角度】绘制！如"极端仰拍"必须从地面向上看的视角
- ⚠️ 同一角色在不同格子中保持外观一致！`;
}


