/**
 * 项目管理类型定义
 * 支持多集剧本的统一管理，跨集共享角色、场景、世界观
 * 参考：《启示录/山海经》深度分析格式
 */

import { Shot, CharacterRef, ScriptCleaningResult } from '../types';

// ============================================
// 项目级类型
// ============================================

/**
 * 故事分卷结构（如：第一卷 Ep 1-20 觉醒与日常崩坏）
 */
export interface StoryVolume {
  id: string;
  volumeNumber: number;           // 卷号
  title: string;                  // 卷标题，如 "觉醒与日常崩坏"
  episodeRange: [number, number]; // 集数范围，如 [1, 20]
  coreConflict: string;           // 核心冲突
  keyPlots: string[];             // 关键剧情列表
  color?: string;                 // 标记颜色（UI用）
}

/**
 * BOSS/反派档案
 */
export interface Antagonist {
  id: string;
  name: string;                   // BOSS名称
  volumeOrArc: string;            // 所属篇章
  formDescription: string;        // 形态描述
  outcome: string;                // 结局
}

/**
 * 项目 - 代表整部剧（60-80集）
 */
export interface Project {
  id: string;
  name: string;                    // 项目名称，如 "某某动漫"
  createdAt: string;               // ISO日期字符串
  updatedAt: string;

  // 📋 项目级设定（跨集共享）
  settings: ProjectSettings;

  // 👥 角色库（跨集共享）
  characters: CharacterRef[];

  // 🏛️ 场景库（跨集共享）
  scenes: SceneRef[];

  // 📖 故事分卷（按卷组织剧情）
  volumes?: StoryVolume[];

  // 👹 反派/BOSS档案
  antagonists?: Antagonist[];

  // 📚 剧情大纲（每集一句话概要 + 角色状态）
  storyOutline: EpisodeSummary[];

  // 📺 剧集列表
  episodes: Episode[];
}

/**
 * 项目媒体类型 - 全部为AI生成，非实拍
 * - ai-2d: AI 2D漫剧 - 日系/国漫风格，AI生成
 * - ai-3d: AI 3D漫剧 - 3D渲染风格，AI生成
 * - ai-realistic: AI 真人漫剧 - 写实真人风格，完全AI生成（非实拍）
 */
export type ProjectMediaType = 'ai-2d' | 'ai-3d' | 'ai-realistic';

/**
 * 项目媒体类型配置
 */
export const PROJECT_MEDIA_TYPES: Record<ProjectMediaType, {
  name: string;
  description: string;
  avgDuration: string;      // 每集平均时长
  firstEpDuration: string;  // 第一集时长（通常较长）
  visualStyle: string;      // 默认视觉风格
  aiPromptHint: string;     // AI生图时的提示
}> = {
  'ai-2d': {
    name: 'AI 2D漫剧',
    description: '日系/国漫风格的2D动画短剧，AI生成，成本最低',
    avgDuration: '1-2分钟',
    firstEpDuration: '2-3分钟',
    visualStyle: '日系动漫风格',
    aiPromptHint: '2D anime style, clean lines, vibrant colors, vertical composition',
  },
  'ai-3d': {
    name: 'AI 3D漫剧',
    description: '3D渲染风格的动画短剧，AI生成，视觉冲击力强',
    avgDuration: '1-2分钟',
    firstEpDuration: '2-3分钟',
    visualStyle: '3D渲染风格',
    aiPromptHint: '3D rendered style, strong depth, realistic lighting, vertical composition',
  },
  'ai-realistic': {
    name: 'AI 真人漫剧',
    description: '写实真人风格的短剧，完全AI生成（非实拍），适合现代都市题材',
    avgDuration: '1-2分钟',
    firstEpDuration: '2-3分钟',
    visualStyle: '写实真人风格',
    aiPromptHint: 'photorealistic style, real human appearance, cinematic lighting, vertical composition',
  },
};

/**
 * 项目设定
 */
export interface ProjectSettings {
  /** 媒体类型：2D漫剧、3D漫剧、真人短剧、真人漫剧 */
  mediaType?: ProjectMediaType;

  /** 类型/题材：仙侠、科幻、现代、奇幻、混合等 */
  genre: string;

  /** 世界观概述 */
  worldView: string;

  /** 整体视觉风格 */
  visualStyle: string;

  /** 专有名词解释 */
  keyTerms: KeyTerm[];
}

/**
 * 专有名词
 */
export interface KeyTerm {
  term: string;          // 术语，如 "失落世界"
  explanation: string;   // 解释，如 "虚拟空间，物理规则可被代码改写"
}

/**
 * 场景设定
 */
export interface SceneRef {
  id: string;
  name: string;              // 场景名称，如 "深渊底层核心"
  description: string;       // 场景描述
  visualPromptCn: string;    // 中文视觉提示词
  visualPromptEn: string;    // 英文视觉提示词
  atmosphere: string;        // 氛围，如 "冷蓝+金色暖光"
  appearsInEpisodes: number[]; // 出现在哪些集

  // 🆕 场景设定图（单张 16:9 设定图，通常为 2×2 四分屏：多角度 + 关键特写）
  imageSheetUrl?: string;

  // 🆕 生图元信息（用于追溯使用的模型/风格）
  imageGenerationMeta?: {
    modelName: string;
    styleName: string;
    generatedAt: string; // ISO 时间字符串

		// 🆕 任务编码（用于断网/刷新后重试获取结果）
		// 说明：任务创建成功后即可写入；当 imageSheetUrl 为空但 taskCode 存在时，可尝试恢复该任务。
		taskCode?: string;
		taskCreatedAt?: string; // ISO 时间字符串
  };
}

// ============================================
// 剧集级类型
// ============================================

/**
 * 剧情大纲条目（每集一条）
 */
export interface EpisodeSummary {
  episodeNumber: number;
  title: string;                   // 本集标题，如 "铸剑阶段"
  summary: string;                 // 一句话概要
  characterStates: CharacterState[]; // 角色在本集的状态
}

/**
 * 角色在某集的状态
 */
export interface CharacterState {
  characterId: string;
  characterName: string;
  stateDescription: string;   // 状态描述，如 "悬浮于光茧内部，无法移动"
  location?: string;          // 位置，如 "光茧内部"
}

/**
 * 本集概述（从思维链结果生成）
 * 用于页面显示和导出剧本模板
 */
export interface GeneratedEpisodeSummary {
  episodeNumber: number;
  episodeTitle: string;
  totalDuration: string;      // "90-110秒"
  totalShots: number;         // 28
  storySummary: string;       // 故事梗概（三段式结构）
  characters: Array<{         // 出场角色
    name: string;
    role: string;
  }>;
  scenes: Array<{             // 涉及场景
    name: string;
    description: string;
  }>;
  emotionCurve: string;       // 情绪曲线描述
  visualStyle: string;        // 视觉风格描述
}

/**
 * 剧集
 */
export interface Episode {
  id: string;
  episodeNumber: number;
  title: string;

  /** 原始剧本内容 */
  script: string;

  /** 剧本清洗结果 */
  cleaningResult?: ScriptCleaningResult;

  /** 分镜列表 */
  shots: Shot[];

  /** 状态 */
  status: EpisodeStatus;

  /** 更新时间 */
  updatedAt: string;
}

export type EpisodeStatus = 
  | 'draft'      // 草稿，只有剧本
  | 'cleaned'    // 已清洗
  | 'generated'  // 已生成分镜
  | 'reviewed'   // 已审核
  | 'exported';  // 已导出

// ============================================
// 项目创建向导类型
// ============================================

/**
 * 新建项目向导的步骤
 */
export type ProjectWizardStep = 
  | 'basic-info'      // 基础信息
  | 'upload-scripts'  // 上传剧本
  | 'ai-analyzing'    // AI分析中
  | 'review-confirm'; // 审核确认

/**
 * 上传的剧本文件
 */
export interface ScriptFile {
  fileName: string;
  content: string;
  episodeNumber?: number;  // 从文件名推断的集数
}

/**
 * AI分析结果（支持深度分析格式）
 */
export interface ProjectAnalysisResult {
  worldView: string;
  genre: string;
  visualStyle: string;
  keyTerms: KeyTerm[];
  characters: CharacterRef[];
  scenes: SceneRef[];
  volumes?: StoryVolume[];        // 🆕 分卷结构
  antagonists?: Antagonist[];     // 🆕 反派/BOSS档案
  episodeSummaries: EpisodeSummary[];
}

/**
 * 分批分析进度回调参数
 */
export interface BatchAnalysisProgress {
  currentBatch: number;           // 当前批次 (1-based)
  totalBatches: number;           // 总批次数
  batchEpisodeRange: string;      // 当前批次集数范围，如 "1-20"
  partialResult: ProjectAnalysisResult;  // 累积的分析结果（实时更新）
  status: 'analyzing' | 'merging' | 'complete';
}

// ============================================
// 辅助函数类型
// ============================================

/**
 * 创建空白项目
 */
export function createEmptyProject(name: string): Project {
  const now = new Date().toISOString();
  return {
    id: `proj-${Date.now()}`,
    name,
    createdAt: now,
    updatedAt: now,
    settings: {
      genre: '',
      worldView: '',
      visualStyle: '',
      keyTerms: [],
    },
    characters: [],
    scenes: [],
    storyOutline: [],
    episodes: [],
  };
}

/**
 * 创建空白剧集
 */
export function createEmptyEpisode(episodeNumber: number, script: string = ''): Episode {
  return {
    id: `ep-${Date.now()}-${episodeNumber}`,
    episodeNumber,
    title: `第${episodeNumber}集`,
    script,
    shots: [],
    status: 'draft',
    updatedAt: new Date().toISOString(),
  };
}

