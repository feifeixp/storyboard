/**
 * 角色形态（用于支持变装、变身等多形态角色）
 * 参考：晋安的12种形态（高中校服→焚衣半裸→类人尖兵→神性素体...）
 */
export interface CharacterForm {
  id: string;
  name: string;              // 形态名称，如 "🤖 类人尖兵"
  episodeRange?: string;     // 出现集数范围，如 "Ep 32-36"
  description: string;       // 详细描述
  note?: string;             // 备注
  visualPromptCn?: string;   // 中文视觉提示词
  visualPromptEn?: string;   // 英文视觉提示词
}

export interface CharacterRef {
  id: string;
  name: string;
  data?: string; // base64 图片数据（可选，不再强制上传）
  // 外观描述（用于提示词生成，使AI保持角色一致性）
  appearance?: string; // 例如："黑色短发少年，穿黑色风衣，冷峻表情"
  gender?: '男' | '女' | '未知';
  ageGroup?: '儿童' | '少年' | '青年' | '中年' | '老年';

  // 🆕 角色经典台词/座右铭
  quote?: string;

  // 🆕 身份演变路线（如：高中生 ➔ 觉醒NPC ➔ 机甲驾驶员 ➔ 救世主）
  identityEvolution?: string;

  // 🆕 核心能力进化
  abilities?: string[];

  // 🆕 多形态/变装支持
  forms?: CharacterForm[];
}

// ═══════════ 景别类型（中英文）- 🆕 扩展到11种 ═══════════
// 参考文档：.augment/rules/角度规则优化总结.ini
export type ShotSize =
  // 基础景别（8种）
  | '大远景(ELS)'    // Extreme Long Shot - 环境占主导，人物极小
  | '远景(LS)'       // Long Shot - 环境占比更大（3:7），交代空间关系
  | '全景(FS)'       // Full Shot - 人物和环境平衡（5:5），人物全身清晰
  | '中全景(MLS)'    // Medium Long Shot - 膝盖以上
  | '中景(MS)'       // Medium Shot - 腰部以上
  | '中近景(MCU)'    // Medium Close-Up - 胸部以上
  | '近景(CU)'       // Close-Up - 肩部以上
  | '特写(ECU)'      // Extreme Close-Up - 面部占满画面
  | '大特写(BCU)'    // Big Close-Up - 面部局部（眼睛、嘴唇）
  | '局部特写(DS)'   // Detail Shot - 身体其他部位（手、脚、物品）
  | '微距(Macro)';   // Macro Shot - 极端特写

// ═══════════ 角度-朝向子维度 ═══════════
export type AngleDirection =
  | '正面(Front)' | '3/4正面(3/4 Front)' | '1/3侧面(1/3 Side)'
  | '正侧面(Full Side)' | '1/3背面(1/3 Back)' | '3/4背面(3/4 Back)' | '背面(Back)'
  | '主观视角(POV)';  // 🆕 第一人称视角，从角色眼睛看出去

// ═══════════ 角度-高度子维度 ═══════════
export type AngleHeight =
  | '鸟瞰(Bird Eye)' | '极端俯拍(Extreme High)' | '中度俯拍(Moderate High)'
  | '轻微俯拍(Mild High)' | '平视(Eye Level)' | '轻微仰拍(Mild Low)'
  | '中度仰拍(Moderate Low)' | '极端仰拍(Extreme Low)' | '虫视(Worm Eye)';

// ═══════════ 运镜类型 ═══════════
export type CameraMove =
  | '固定(Static)' | '推镜(Dolly In)' | '拉镜(Dolly Out)'
  | '左摇(Pan Left)' | '右摇(Pan Right)' | '上摇(Tilt Up)' | '下摇(Tilt Down)'
  | '跟拍(Tracking)' | '移焦(Rack Focus)' | '希区柯克变焦(Dolly Zoom)'
  | '升镜(Crane Up)' | '降镜(Crane Down)' | '环绕(Arc)' | '手持(Handheld)';

// ═══════════ 镜头类型 ═══════════
export type ShotType = '静态' | '运动';

// ═══════════ 分镜草图风格（用于快速出图） ═══════════
export interface StoryboardStyle {
  id: string;
  name: string;
  description: string;
  promptSuffix: string;      // 添加到英文提示词末尾
  promptSuffixCn: string;    // 添加到中文提示词末尾
  previewColor: string;      // UI预览颜色
  previewImage?: string;     // 预览效果图 URL（可选）
  isCustom?: boolean;        // 是否为自定义风格
}

// 分镜风格预览图 - 使用真实的分镜效果示例图
// 这些图片展示了对应风格的实际分镜效果
export const STORYBOARD_STYLES: StoryboardStyle[] = [
  {
    id: 'rough_sketch',
    name: '粗略线稿',
    description: '最快出图，极简黑白线条',
    promptSuffix: 'rough pencil sketch, quick gesture drawing, minimal lines, black and white, no shading, storyboard style',
    promptSuffixCn: '粗略铅笔线稿，快速动态草图，极简线条，黑白，无阴影，分镜风格',
    previewColor: '#374151',
    // 粗略分镜线稿风格
    previewImage: 'https://cdn.dribbble.com/users/1355613/screenshots/15132259/media/63b7c4dd9c9e095c9b9ff57f13e5a7a5.jpg?resize=400x300'
  },
  {
    id: 'pencil_draft',
    name: '铅笔草图',
    description: '传统铅笔质感，适度阴影',
    promptSuffix: 'pencil sketch, graphite drawing, light hatching, grayscale, rough texture, film storyboard',
    promptSuffixCn: '铅笔素描，石墨画，轻微排线，灰度，粗糙质感，电影分镜',
    previewColor: '#6b7280',
    // 铅笔素描分镜风格
    previewImage: 'https://cdn.dribbble.com/users/1355613/screenshots/10879952/media/b2be3c3e2f22d2f7b4d0d1f5e0d0c5b5.jpg?resize=400x300'
  },
  {
    id: 'ink_wash',
    name: '水墨速写',
    description: '东方水墨风格，写意笔触',
    promptSuffix: 'ink wash painting, sumi-e style, brush strokes, black ink on white, minimal detail, zen aesthetic',
    promptSuffixCn: '水墨画，写意风格，毛笔笔触，黑墨白底，极简细节，禅意美学',
    previewColor: '#1f2937',
    // 水墨画风格
    previewImage: 'https://cdn.dribbble.com/users/2367469/screenshots/14835012/media/d5c4a5f0f5e5c5d5e5f5f5e5d5c5b5a5.png?resize=400x300'
  },
  {
    id: 'comic_bw',
    name: '漫画线稿',
    description: '清晰线条，漫画分镜感',
    promptSuffix: 'manga storyboard, clean black ink lines, comic panel style, high contrast, no screentone, professional manga draft',
    promptSuffixCn: '漫画分镜，清晰黑色线条，漫画格风格，高对比度，无网点，专业漫画草稿',
    previewColor: '#111827',
    // 漫画分镜风格
    previewImage: 'https://cdn.dribbble.com/users/1355613/screenshots/14102489/media/a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7.jpg?resize=400x300'
  },
  {
    id: 'charcoal',
    name: '炭笔速写',
    description: '粗犷炭笔，强烈明暗',
    promptSuffix: 'charcoal drawing, expressive strokes, dramatic lighting, smudged edges, rough artistic sketch',
    promptSuffixCn: '炭笔画，表现性笔触，戏剧性光影，模糊边缘，粗犷艺术速写',
    previewColor: '#4b5563',
    // 炭笔画风格
    previewImage: 'https://cdn.dribbble.com/users/1626229/screenshots/9621626/media/c5d5e5f5a5b5c5d5e5f5a5b5c5d5e5f5.jpg?resize=400x300'
  },
  {
    id: 'blueprint',
    name: '蓝图风格',
    description: '技术图纸感，适合科幻',
    promptSuffix: 'blueprint style, technical drawing, white lines on dark blue, schematic, engineering diagram aesthetic',
    promptSuffixCn: '蓝图风格，技术图纸，深蓝底白线，示意图，工程图纸美学',
    previewColor: '#1e3a5f',
    // 蓝图技术风格
    previewImage: 'https://cdn.dribbble.com/users/2367469/screenshots/11234567/media/b5c5d5e5f5a5b5c5d5e5f5a5b5c5d5e5.png?resize=400x300'
  }
];

// 创建自定义风格
export function createCustomStyle(customPrompt: string): StoryboardStyle {
  return {
    id: 'custom',
    name: '自定义风格',
    description: '用户自定义提示词风格',
    promptSuffix: customPrompt,
    promptSuffixCn: customPrompt,
    previewColor: '#8b5cf6',
    isCustom: true
  };
}

export interface Shot {
  id: string;

  // ═══════════ 基础信息 ═══════════
  shotNumber: string;       // "01", "02"...
  duration: string;         // "3s", "5s"
  shotType: ShotType;       // 静态/运动，决定是否需要首尾帧
  sceneId?: string;         // 🆕 所属场景ID（如 "S1"），用于关联空间布局

  // ═══════════ 🆕 视频生成模式（优化版） ═══════════
  // I2V: 图生视频（微动、跟拍运动、呼吸感、氛围）- ≤10秒，只需一张图+视频提示词
  // Keyframe: 首尾帧模式（形态转变、定点位移、空间跳转）- 需要首帧图+尾帧图+过渡提示词
  // 注：Static 已废弃，原静态场景改用 I2V + 呼吸感微动
  videoMode?: 'I2V' | 'Keyframe';
  videoModeReason?: string;  // 判断原因，便于用户理解为何选择该模式

  // ═══════════ 叙事内容 ═══════════
  storyBeat: string | {     // 故事节拍：一句话说清这个镜头讲什么
    event: string;          // 事件描述
    dialogue?: string | null; // 对白
    sound?: string;         // 音效
    emotion?: string;       // 情绪
  };
  dialogue: string;         // 对白/音效

  // ═══════════ 景别（中英文） ═══════════
  shotSize: ShotSize;       // 如 "中景(MS)"

  // ═══════════ 角度（双维度） ═══════════
  angleDirection: AngleDirection;  // 朝向：正面/侧面/背面等
  angleHeight: AngleHeight;        // 高度：俯拍/平视/仰拍等
  dutchAngle?: string;             // 荷兰角（可选），如 "右倾15°"

  // ═══════════ 三层构图 ═══════════
  foreground: string;       // 前景(FG)：框架元素、遮挡物
  midground: string;        // 中景(MG)：主体人物/动作
  background: string;       // 后景(BG)：环境、纵深

  // ═══════════ 光影 ═══════════
  lighting: string;         // 光源位置、类型、明暗对比

  // ═══════════ 运镜 ═══════════
  cameraMove: CameraMove;   // 运镜类型
  cameraMoveDetail?: string; // 运镜细节描述

  // ═══════════ 动线轨迹（运动镜头） ═══════════
  motionPath?: string;      // 角色动线：入画位置→路径→出画位置

  // ═══════════ 首尾帧（运动镜头必填） ═══════════
  startFrame?: string;      // 【首帧】完整画面描述 (Frozen Moment #1)
  endFrame?: string;        // 【尾帧】完整画面描述 (Frozen Moment #2)

  // ═══════════ AI提示词（分镜生成阶段产出，包含镜头语言） ═══════════
  promptCn: string;         // 中文提示词（首帧/静态帧，必须包含完整7要素）
  promptEn?: string;        // 英文提示词（首帧/静态帧，可选）
  endFramePromptCn?: string; // 中文提示词（尾帧，运动镜头必须包含完整7要素）
  endFramePromptEn?: string; // 英文提示词（尾帧，可选）
  videoPromptCn?: string;   // 视频生成提示词（必须使用中文）
  videoPrompt?: string;     // 视频生成提示词（兼容旧版，英文）

  // ═══════════ 🆕 Nano Banana Pro 生图提示词（提取阶段产出，纯画面描述，不含风格） ═══════════
  // 公式：[主体描述] + [环境/背景] + [动作/状态] + [技术参数(景别/角度/光影)]
  imagePromptCn?: string;   // 生图提示词-中文（首帧/静态帧）
  imagePromptEn?: string;   // 生图提示词-英文（首帧/静态帧）⭐最终生图调用此字段
  endImagePromptCn?: string; // 生图提示词-中文（尾帧，运动镜头用）
  endImagePromptEn?: string; // 生图提示词-英文（尾帧，运动镜头用）
  videoGenPrompt?: string;  // 视频生成提示词（英文，用于Veo等视频模型）

  // ═══════════ 理论依据 ═══════════
  theory: string;           // Framed Ink理论说明

  // ═══════════ 🆕 导演意图与技术备注 ═══════════
  directorNote?: string;    // 导演意图/情绪说明：为什么这么设计、观众应感受到什么
  technicalNote?: string;   // 技术备注/特殊要求：慢动作、手持感、强对比光、景深变化等

  // ═══════════ 关联与状态 ═══════════
  assignedCharacterIds?: string[]; // 关联的角色ID
  startFrameUrl?: string;   // 生成的首帧图片URL
  endFrameUrl?: string;     // 生成的尾帧图片URL
  status: 'pending' | 'generating' | 'completed' | 'error';
}

export interface ReviewSuggestion {
  shotNumber: string;
  suggestion: string;
  reason: string;
  field?: string;      // 涉及的字段（如 "promptCn", "cameraAngle" 等）
  selected?: boolean;  // 是否被勾选应用
}

// ═══════════ 剧本清洗结果 ═══════════
export interface ScriptCleaningResult {
  // 原始剧本
  originalScript: string;

  // 清洗后的纯画面内容
  cleanedScenes: CleanedScene[];

  // 提取的非画面信息（仅作参考）
  audioEffects: string[];      // 音效描述
  musicCues: string[];         // BGM描述
  timeCodes: string[];         // 时间码（已忽略）
  cameraSuggestions: string[]; // 原剧本的镜头建议（仅参考）

  // 剧本设定约束（必须遵守）
  constraints: ScriptConstraint[];

  // 剧情节拍权重
  sceneWeights: SceneWeight[];
}

export interface CleanedScene {
  id: string;                  // 场景ID，如 "01"
  originalText: string;        // 原始剧本文本
  visualContent: string;       // 纯画面内容（角色动作、场景描述）
  dialogues: string[];         // 对白列表
  uiElements: string[];        // 字幕/UI元素
  moodTags: string[];          // 情绪标签（从音效/BGM转化）
}

export interface ScriptConstraint {
  rule: string;                // 设定规则，如 "无物理杀伤力"
  implication: string;         // 对分镜的影响，如 "禁止画物体破碎/爆炸"
  source: string;              // 来源原文
}

export interface SceneWeight {
  sceneId: string;
  weight: 'high' | 'medium' | 'low';  // 剧情权重
  suggestedShots: number;             // 建议镜头数
  reason: string;                     // 权重原因
}

export enum AppStep {
  // 🆕 项目管理
  PROJECT_LIST = -2,       // 项目列表
  PROJECT_WIZARD = -1,     // 新建项目向导
  PROJECT_DASHBOARD = -3,  // 🆕 项目主界面（角色库、场景库、剧情大纲、剧集列表）
  REANALYZE_PROJECT = -4,  // 🆕 重新分析项目（显示分析进度）

  // 原有流程
  INPUT_SCRIPT = 0,
  SCRIPT_CLEANING = 1,    // 剧本清洗
  GENERATE_LIST = 2,
  REVIEW_OPTIMIZE = 3,
  MANUAL_EDIT = 4,        // 手动编辑/AI对话精修
  EXTRACT_PROMPTS = 5,    // 提取AI提示词
  GENERATE_IMAGES = 6
}

/**
 * 🆕 分镜编辑Tab类型
 * 用于在统一的分镜编辑页面中切换不同的功能
 */
export type EditTab = 'generate' | 'review' | 'manual';
