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

  // 🆕 形态变化类型（来自 FormSummary）
  changeType?: 'costume' | 'makeup' | 'damage' | 'transformation' | 'age' | 'other';
  // 🆕 变化差异描述（相对于基础形态的差异）
  delta?: string;
  // 🆕 优先级（数字越小越靠前）
  priority?: number;
  // 🆕 是否为关键帧形态
  isKeyframe?: boolean;
  // 🆕 外观描述（用于提示词生成）
  appearance?: string;

  // 🆕 形态设定图（1×4 横向四分屏）
  imageSheetUrl?: string;

  // 🆕 生图元信息
  imageGenerationMeta?: {
    modelName: string;
    styleName: string;
    generatedAt: string;
    taskCode?: string;
    taskCreatedAt?: string;
  };
}

export interface CharacterRef {
  id: string;
  name: string;
  data?: string; // base64 图片数据（可选，不再强制上传）
  // 外观描述（用于提示词生成，使AI保持角色一致性）
  appearance?: string; // 例如："黑色短发少年，穿黑色风衣，冷峻表情"
  gender?: '男' | '女' | '未知';
  ageGroup?: '儿童' | '少年' | '青年' | '中年' | '老年';

  // 🆕 角色设定图（单张设定图：三视图 + 面部特写，通常为 2×2 四分屏）
  // 说明：仅保存整张设定图的 OSS URL；UI 可直接展示整图。
  imageSheetUrl?: string;

  // 🆕 用户手动上传的参考图 URL（通过 AI 分析长相时保存）
  referenceImageUrl?: string;

  // 🆕 兼容字段：若未来仍需要保存拆分后的多张独立图，可使用该字段。
  // 顺序约定：0=正面全身, 1=侧面全身, 2=背面全身, 3=面部特写
  imageUrls?: string[];

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

  // 🆕 角色经典台词/座右铭
  quote?: string;

  // 🆕 身份演变路线（如：高中生 ➔ 觉醒NPC ➔ 机甲驾驶员 ➔ 救世主）
  identityEvolution?: string;

  // 🆕 核心能力进化
  abilities?: string[];

  // 🆕 多形态/变装支持
  forms?: CharacterForm[];

  // 🆕 角色描述（从剧本分析中提取的人物简介）
  description?: string;
  // 🆕 角色定位（主角/配角/反派等）
  role?: string;
  // 🆕 外观配置（可为字符串或结构化 AppearanceConfig 对象，用 unknown 避免循环依赖）
  appearanceConfig?: unknown;
  // 🆕 服装配置（可为字符串或结构化 CostumeConfig 对象，用 unknown 避免循环依赖）
  costumeConfig?: unknown;
  // 🆕 出现的剧集列表
  appearsInEpisodes?: number[];
  // 🆕 形态摘要列表（Phase 1 轻量扫描结果，类型为 unknown[] 避免循环依赖）
  formSummaries?: unknown[];
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
  // ========== 🆕 12种专业风格（与角色/场景生成统一） ==========
  {
    id: '3d_anime_xianxia',
    name: '3D国潮动漫',
    description: '修真漫剧、皮克斯风格动画、现代国潮广告',
    promptSuffix: '3D animation style, Pixar style, modern oriental aesthetics, Cinema 4D render, Octane render, subsurface scattering (SSS), soft studio lighting, clean textures, flowing simulation, masterpiece, 8k',
    promptSuffixCn: '3D动画风格，皮克斯风格，现代东方美学，C4D渲染，OC渲染，次表面散射(SSS)材质，柔和影棚光，干净的纹理，流体模拟，杰作',
    previewColor: '#f59e0b',
  },
  {
    id: 'ink_wash',
    name: '水墨写意',
    description: '传统文化、高意境修真、回忆片段',
    promptSuffix: 'Traditional Chinese ink wash painting style, watercolor, splashing ink, wet and dry brushstrokes, negative space (liubai), rice paper texture, black and white with subtle colors, abstract, zen atmosphere',
    promptSuffixCn: '中国传统水墨画风格，水彩，泼墨，干湿笔触，留白，宣纸纹理，黑白略带淡彩，写意抽象，禅意氛围',
    previewColor: '#6b7280',
  },
  {
    id: 'anime_cel_shading',
    name: '日式赛璐璐',
    description: '青春校园、热血战斗、二次元短视频',
    promptSuffix: 'Japanese anime style, cel shading, Makoto Shinkai style, vibrant and fresh colors, clean black outlines, hard-edge shadows, lens flare, highly detailed background, aesthetic, 2D animation',
    promptSuffixCn: '日式动画风格，赛璐璐上色，新海诚风格，鲜艳清新的色彩，清晰的黑色轮廓线，硬边阴影，镜头光晕，高细节背景，唯美，2D动画',
    previewColor: '#ec4899',
  },
  {
    id: 'cinematic_photorealism',
    name: '电影超写实',
    description: '悬疑剧、高端商业广告、影视解说',
    promptSuffix: 'Cinematic photography style, photorealistic, shot on Arri Alexa, 8k resolution, depth of field, film grain, dramatic lighting, detailed skin texture, ray tracing, hyper-realistic',
    promptSuffixCn: '电影级摄影风格，照片级写实，阿莱Alexa拍摄，8k分辨率，景深，电影胶片颗粒，戏剧性布光，真实的皮肤纹理，光线追踪，超写实',
    previewColor: '#1f2937',
  },
  {
    id: '3d_clay_popmart',
    name: '3D 黏土/盲盒',
    description: '趣味搞笑、IP营销、轻松科普',
    promptSuffix: '3D Pop Mart toy style, blind box aesthetic, clay material, smooth vinyl texture, rounded edges, pastel colors, soft volumetric lighting, cute, chibi proportions, clean background, 3D icon',
    promptSuffixCn: '3D泡泡玛特玩具风格，盲盒美学，黏土材质，光滑的软胶质感，圆润的边缘，糖果色，柔和体积光，可爱，Q版比例，干净背景，3D图标',
    previewColor: '#fbbf24',
  },
  {
    id: 'digital_impasto',
    name: '数字艺术厚涂',
    description: '史诗战争、游戏转场、概念设计',
    promptSuffix: 'Digital concept art, impasto oil painting style, thick visible brushstrokes, palette knife texture, speedpaint look, blocky shapes, rich and deep colors, artistic lighting, trending on ArtStation',
    promptSuffixCn: '数字概念艺术，厚涂油画风格，清晰厚重的笔触，油画刀纹理，快速绘画质感，块面结构，丰富深沉的色彩，艺术光影，ArtStation流行风格',
    previewColor: '#7c3aed',
  },
  {
    id: 'american_comic',
    name: '美式漫画',
    description: '超级英雄题材、夸张喜剧、快节奏广告',
    promptSuffix: 'Vintage American comic book style, halftone dot texture, bold black outlines, flat saturated colors, pop art, dynamic contrast, comic illustration, retro aesthetic',
    promptSuffixCn: '复古美式漫画风格，半调网点纹理，粗黑轮廓线，高饱和度平涂色彩，波普艺术，动态对比，漫画插图，复古美学',
    previewColor: '#dc2626',
  },
  {
    id: 'low_poly',
    name: '低多边形',
    description: '极简设计、科技感视频、独立游戏风格',
    promptSuffix: 'Low poly art style, faceted geometry, triangular mesh, sharp edges, no smooth curves, minimalist, flat shading, vivid colors, abstract 3D art, digital aesthetic',
    promptSuffixCn: '低多边形艺术风格，面片几何，三角形网格，锐利边缘，无平滑曲线，极简主义，平面着色，生动色彩，抽象3D艺术，数字美学',
    previewColor: '#06b6d4',
  },
  {
    id: 'pixel_art',
    name: '像素艺术',
    description: '复古游戏怀旧、电子风格、故障艺术',
    promptSuffix: 'Pixel art style, 16-bit retro game aesthetic, visible pixels, jagged edges, limited color palette, dithering, sprite art, nostalgic, digital arcade style',
    promptSuffixCn: '像素艺术风格，16位复古游戏美学，清晰像素点，锯齿边缘，有限色板，抖动算法，精灵图艺术，怀旧，电子街机风格',
    previewColor: '#8b5cf6',
  },
  {
    id: '2d_chibi_cartoon',
    name: '2D Q版卡通',
    description: '贴纸表情包、儿童内容、轻松叙事',
    promptSuffix: '2D vector illustration, flat chibi cartoon style, thick outlines, sticker art, bright solid colors, simple shapes, cute and exaggerated, white border, vector graphics',
    promptSuffixCn: '2D矢量插画，扁平Q版卡通风格，粗轮廓线，贴纸艺术，明亮的纯色，简单图形，可爱夸张，白边，矢量图形',
    previewColor: '#f472b6',
  },
  {
    id: 'film_noir',
    name: '黑白电影',
    description: '侦探推理、复古回忆、情绪片',
    promptSuffix: 'Black and white Film Noir style, vintage photography, high contrast, chiaroscuro lighting, heavy film grain, dramatic shadows, mysterious atmosphere, 1940s cinema look',
    promptSuffixCn: '黑白黑色电影风格，复古摄影，高对比度，明暗对照法布光，重度胶片颗粒，戏剧性阴影，神秘氛围，1940年代电影质感',
    previewColor: '#374151',
  },
  {
    id: 'hand_drawn_sketch',
    name: '手绘线稿',
    description: '创意手绘视频、设计草图、极简叙事',
    promptSuffix: 'Hand-drawn sketch style, pencil drawing, graphite lines, rough hatching, monochrome, white paper background, unfinished art look, minimalist line art',
    promptSuffixCn: '手绘素描风格，铅笔画，石墨线条，粗糙排线，单色，白纸背景，未完成的艺术感，极简线稿',
    previewColor: '#9ca3af',
  },

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
  assignedSceneId?: string; // 🆕 关联或计算出的最终使用的场景ID

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
  selectedCharacterForms?: Record<string, string>; // 🆕 角色ID -> 子形态ID映射（用于视频生成参考图覆盖）
  startFrameUrl?: string;   // 生成的首帧图片URL
  endFrameUrl?: string;     // 生成的尾帧图片URL

  // ═══════════ 🆕 视频生成结果 ═══════════
  videoUrl?: string;        // 最终生成的视频URL
  errorMessage?: string;    // 🆕 记录失败原因与请求ID
  videoGenerationMeta?: {   // 视频生成元信息
    taskCode: string;
    taskCreatedAt: string;
    taskCompletedAt?: string; // 🆕 任务完成时间
    taskDurationMs?: number;  // 🆕 任务花费总时长（毫秒）
    model: string;
    duration: number;
    contentList?: any[];    // 🆕 记录当时生成时传递的多模态图文数组
  };

  // ═══════════ 🆕 自定义/继承的视频与图片参考 ═══════════
  customVideoReferences?: string[]; // 用户手动上传或前置关联的自定义参考图/视频的URL

  // ═══════════ 🆕 九宫格草图映射（虚拟切割，不生成独立小图文件） ═══════════
  storyboardGridUrl?: string;        // 九宫格图片URL（该镜头所属页）
  storyboardGridCellIndex?: number;  // 该镜头在九宫格中的格子索引（0-8，按行优先）

  // 🆕 九宫格生图任务元信息（用于断网/刷新后自动恢复）
  // 说明：九宫格生成时会先提交任务并获得 taskCode；我们把它持久化到 shots 内，
  //      之后即便刷新/断网，也能通过 taskCode 再次轮询拿回永久 image_urls。
  // 注意：该字段不等同于 storyboardGridUrl（后者是“已应用到分镜表”的最终结果）。
  storyboardGridGenerationMeta?: {
    taskCode: string;
    taskCreatedAt: string; // ISO 时间字符串
    gridIndex: number;     // 九宫格索引（0-based）
  };

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

  // 🆕 解析信息
  parseError?: boolean;
  rawOutput?: string;
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

/**
 * 剧集拆分结果
 */
export interface EpisodeSplit {
  episodeNumber: number;    // 剧集编号（从1开始）
  title?: string;           // 剧集标题（可选）
  script: string;          // 该剧集的剧本内容
  marker: string;          // 检测到的标记文本（如"第一集"、"EP1"）
  startIndex: number;       // 在原剧本中的起始位置
  endIndex: number;         // 在原剧本中的结束位置
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
  EXTRACT_PROMPTS = 5,    // 提取AI图片提示词（分支1：九宫格生成）
  EXTRACT_VIDEO_PROMPTS = 8, // 🆕 提取AI视频提示词（分支2：Seedance 2.0生成）
  GENERATE_VIDEO = 9,     // 🆕 视频批量生成
  GENERATE_IMAGES = 6,
  FINAL_STORYBOARD = 7    // 🆕 最终故事板预览
}

/**
 * 🆕 分镜编辑Tab类型
 * 用于在统一的分镜编辑页面中切换不同的功能
 */
export type EditTab = 'generate' | 'review' | 'manual';

// ═══════════ 🆕 视频分组相关类型 ═══════════

/**
 * 单个镜头的时间段（用于视频提示词中的时间轴描述）
 */
export interface ShotTimeRange {
  shotIndex: number;        // 在 shots 数组中的索引
  shotNumber: string;       // 镜头编号
  startSecond: number;      // 开始秒数
  endSecond: number;        // 结束秒数
  shot: Shot;               // 完整的镜头数据
}

/**
 * 视频分组（根据场景和时长限制生成的分组）
 * 每组最多15秒，优先按场景分组
 */
export interface VideoGroup {
  id: string;               // 分组ID，格式："{sceneId}_{groupIndex}" 或 "ungrouped_{groupIndex}"
  groupName: string;        // 分组名称，如 "场景1-1" 或 "未分组-1"
  sceneId?: string;         // 关联的场景ID
  sceneName?: string;       // 场景名称
  totalDuration: number;    // 总时长（秒）
  shots: ShotTimeRange[];   // 该组包含的镜头及其时间段
}

/**
 * 视频生成提示词（遵循 Seedance 2.0 规范）
 * 公式：[素材@定义] + [整体风格与画质基调] + [0-N秒：镜头A+动作A+台词] + [转场方式] + [N-M秒：镜头B+动作B+特效] + [M-15秒：落版与字幕]
 */
export interface VideoGroupPrompt {
  groupId: string;          // 分组ID
  groupName: string;        // 分组名称
  // 素材定义（如果有图片/视频参考）— 核心规范一
  assets?: string;          // 素材@定义部分，如"以@图片1为首帧"
  // 整体风格与画质基调
  style?: string;           // 风格描述
  // 时间轴脚本（X-Y秒画面描述）— 核心规范二
  timelineScript: string;   // 时间轴分段描述（含运镜+动作+台词+转场）
  // 运镜备注 — 核心规范三
  cameraNotes?: string;     // 运镜语言描述（如"一镜到底"/"多镜头切换"）
  // 转场备注 — 核心规范二补充
  transitionNotes?: string; // 转场方式汇总（如"硬切""无缝渐变转场"）
  // 完整的中文提示词（组合以上内容）
  fullPromptCn: string;     // 完整的中文提示词
}
