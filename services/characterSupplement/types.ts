/**
 * 角色补充思维链 - 类型定义
 * 参考分镜思维链架构
 */

/**
 * 时间线阶段（用于重生/穿越/前世等多时间线角色）
 * 在 Stage 1 通读全文时提取，全局复用于 Phase 1 预标注和 Phase 3 设计。
 */
export interface TimelinePhase {
  /** 阶段标签，如 "前世" | "重生后" | "幼年" | "觉醒前" */
  label: string;
  /** 该阶段的推断年龄，如 32 */
  estimatedAge: number;
  /** 时代背景，如 "20世纪90年代初农村" */
  era: string;
  /** 身份与处境简述，如 "被逼嫁家暴男，饱受折磨，惨死" */
  identityState: string;
  /** 识别关键词（从剧本中提取），如 ["逼嫁", "血泊", "惨死", "雨夜"] */
  markers: string[];
}

import { CharacterRef, CharacterForm } from '../../types';
import { ScriptFile } from '../../types/project';

/**
 * 补充模式
 */
export type SupplementMode = 'fast' | 'detailed';

/**
 * 美型程度
 */
export type BeautyLevel = 'realistic' | 'balanced' | 'idealized';

/**
 * 补充选项
 */
export interface SupplementOptions {
  mode: SupplementMode;
  beautyLevel: BeautyLevel;
}

/**
 * 补全缓存上下文（强隔离：项目/角色/剧本/模式）
 * 说明：用于避免跨项目串缓存、脚本变更后仍命中旧缓存等问题。
 */
export interface SupplementCacheContext {
  projectId: string;
  characterId: string;
  scriptHash: string;
  mode: SupplementMode;
  beautyLevel: BeautyLevel;
}

/**
 * 阶段1: 剧本分析输出
 */
export interface Stage1ScriptAnalysis {
  // Step 1.1: 时代背景分析
  basicInfo: {
    era: string;           // "中国90年代"
    gender: string;        // "男" | "女"
    ageGroup: string;     // "儿童" | "少年" | "青年" | "中年" | "老年"
    specificAge?: number; // 🆕 具体年龄(如18、20、25等),用于生图模型
    occupation?: string;  // "农村女孩"
  };

  // Step 1.2: 角色行为分析
  behaviorAnalysis: {
    keyBehaviors: string[];     // ["反抗家暴", "利用陌生人"]
    personalityTraits: string[]; // ["坚韧", "决绝", "自尊"]
  };

  // Step 1.3: 角色定位分析
  characterPosition: {
    role: '主角' | '配角' | '反派';
    socialClass: '富裕' | '中产' | '底层';
  };

  // Step 1.4: 剧本风格与美学定位
  scriptType: {
    category: string;  // 剧本类型（如'女频言情'、'都市职场'、'历史剧'等）
    genre: string;  // 具体题材（如'重生/甜宠/逆袭'、'现实主义'等）
    aestheticDirection: string; // 美学方向描述（如'追求精致优雅的影视剧美学'）
    reasoning: string; // 判断理由
  };

  // Step 1.5: 场景判断
  sceneInfo: {
    mainScene: string;  // 主要场景（如'日常'、'办公'、'社交'、'活动'、'特殊'）
    specificScenes: string[];  // 具体场景列表（如['在家', '晚宴', '运动']）
  };

  // 🆕 Step 1.9: 时间线与身份演变分析（仅当角色有多个时间线时输出）
  // 用途：Stage1 通读全文后一次性提取，供 Phase1 预标注和 Phase3 直接引用，彻底消除跨场景猜测
  timelinePhases?: TimelinePhase[];

  // Step 1.6: 美学风格判断
  aestheticStyle: {
    style: string;  // 美学风格（如'真实'、'美化'、'华丽'、'时尚'）
    reasoning: string;  // 判断理由
  };

  // Step 1.7: 季节判断
  seasonInfo: {
    season: string;  // 季节（如'春季'、'夏季'、'秋季'、'冬季'、'通用'）
    reasoning: string;  // 判断理由
  };

  // Step 1.8: 剧本服饰描述提取
  scriptAppearanceDescription?: {
    costumeDescription: string;  // 剧本中的服饰描述（如果有）
    hairDescription: string;  // 剧本中的发型描述（如果有）
    makeupDescription: string;  // 剧本中的妆容描述（如果有）
    otherDescription: string;  // 剧本中的其他外观描述（如果有）
  };

  // 思考过程
  thinking: {
    step1_1: string;
    step1_2: string;
    step1_3: string;
    step1_4: string;
    step1_5: string;
    step1_6: string;
    step1_7: string;
    step1_9?: string;  // 🆕 时间线分析步骤（可选）
  };
}

/**
 * 阶段2: 视觉标签设计输出
 */
export interface Stage2VisualTags {
  // Step 2.1: 角色理解与视觉定位
  positioning: {
    roleUnderstanding: string;   // 对角色的理解
    visualDirection: string;     // 视觉设计方向
    aestheticStrategy: string;   // 美学策略
  };

  // Step 2.2: 视觉标签列表
  visualTags: {
    tag: string;           // "齐耳短发"
    description: string;   // "发质略粗但富有光泽"
    meaning: string;       // "体现朴素但自尊的性格"
  }[];

  // Step 2.3: 自我批判
  selfCritique: {
    qualityCheck: string;    // 质量检查结果
    improvements: string;    // 改进说明
  };

  // 思考过程
  thinking: {
    step2_1: string;
    step2_2: string;
    step2_3: string;
  };
}

/**
 * 外貌结构化配置（供 PromptCompiler 精确映射）
 * 来源：Stage3 并行输出（与 finalDescription 文本共存）
 */
export interface AppearanceConfig {
  faceShape: string;      // 脸型，如 "鹅蛋脸" | "方下颌" | "圆脸"
  eyes: string;           // 眼型 + 大小 + 神态
  brows: string;          // 眉型 + 浓淡
  nose: string;           // 鼻子描述
  lips: string;           // 嘴唇描述
  skin: string;           // 肤色 + 质感，如 "白皙细腻"
  hair: {
    style: string;        // 发型（符合时代背景）
    length: string;       // "长" | "中" | "短" | "极短"
    texture: string;      // 发质描述
    accessories?: string; // 发饰（如簪子、发带），可选
  };
  body: {
    proportion: string;   // 头身比，如 "7.5头身"
    bodyType: string;     // "纤细" | "匀称" | "微胖" | "强壮"
    posture: string;      // 体态，如 "挺拔" | "微微前倾"
  };
  uniqueMarks?: string[]; // 记忆点：疤痕 / 胎记 / 特殊标志
}

/**
 * 单层服装描述（6 维度）
 * 来源：Stage4 结构化输出
 */
export interface CostumeLayer {
  material: string;     // 材质，如 "丝绒" | "粗布麻"
  cut: string;          // 版型剪裁，如 "宽松" | "收腰" | "直筒"
  color: string;        // 颜色
  pattern?: string;     // 花纹，如 "碎花" | "暗纹" | "素色"
  details?: string;     // 工艺细节，如 "刺绣" | "盘扣" | "流苏"
  wornState?: string;   // 新旧程度，如 "全新" | "略旧" | "破损"
}

/**
 * 服装结构化配置（供 PromptCompiler 精确拼装）
 * 来源：Stage4 并行输出（与 finalDescription 文本共存）
 */
export interface CostumeConfig {
  inner?: CostumeLayer;   // 内层（贴身），可选
  middle: CostumeLayer;   // 中层（主体上装），必有
  outer?: CostumeLayer;   // 外层（外套/披风），可选
  bottom: CostumeLayer;   // 下装（裙/裤/连衣裙），必有
  shoes: CostumeLayer;    // 鞋靴
  accessories?: {
    jewelry?: string;     // 首饰
    belt?: string;        // 腰带/腰封
    bag?: string;         // 包/配包
    props?: string;       // 随身道具（扇子/剑/书本）
  };
}

/**
 * 阶段3: 外貌描述创作输出
 */
export interface Stage3AppearanceDesign {
  // Step 3.1: 角色理解
  roleUnderstanding: {
    understanding: string;      // 对角色的理解
    emotionalTone: string;      // 情感基调
    charmPoint: string;         // 魅力点
  };

  // Step 3.2: 视觉风格定位
  visualStyle: {
    aestheticDirection: string;      // 美学方向
    balanceStrategy: string;         // 真实与美的平衡策略
    personalityExpression: string;   // 性格体现
  };

  // Step 3.3: 外貌特征设计
  appearanceDesign: {
    hairDesign: string;      // 发型设计
    eyesDesign: string;      // 眼睛设计
    facialDesign: string;    // 五官设计
    bodyType: string;        // 🆕 体型设计（如：纤细、匀称、微胖、强壮等）
    uniqueFeature: string;   // 独特特征
  };

  // Step 3.4: 自我批判
  selfCritique: {
    qualityCheck: string;    // 质量检查结果
    improvements: string;    // 改进说明
  };

  // 最终描述
  finalDescription: {
    mainCharacter: string;   // 【主体人物】内容
    facialFeatures: string;  // 【外貌特征】内容
  };

  // 🆕 结构化外貌配置（供 PromptCompiler 使用，与 finalDescription 并存）
  appearanceConfig?: AppearanceConfig;

  // 思考过程
  thinking: {
    step3_1: string;
    step3_2: string;
    step3_3: string;
    step3_4: string;
  };
}

/**
 * 阶段4: 服装设计输出
 */
export interface Stage4CostumeDesign {
  // Step 4.1: 时代和身份理解
  backgroundUnderstanding: {
    eraUnderstanding: string;       // 时代背景理解
    identityUnderstanding: string;  // 身份背景理解
    filmAesthetics: string;         // 影视剧美学理解
    charmStrategy: string;          // 魅力策略
  };

  // Step 4.2: 服装风格定位
  stylePositioning: {
    overallStyle: string;     // 整体风格
    balanceStrategy: string;  // 真实与美的平衡策略
    colorTone: string;        // 色彩基调
  };

  // Step 4.3: 具体搭配设计
  outfitDesign: {
    styleDesign: string;        // 款式设计
    colorDesign: string;        // 颜色设计
    materialDesign: string;     // 材质设计
    detailDesign: string;       // 细节设计
    accessoriesDesign: string;  // 配饰设计
  };

  // Step 4.4: 自我批判
  selfCritique: {
    qualityCheck: string;    // 质量检查结果
    improvements: string;    // 改进说明
  };

  // 最终服装描述
  finalDescription: string;

  // 🆕 结构化服装配置（供 PromptCompiler 使用，与 finalDescription 并存）
  costumeConfig?: CostumeConfig;

  // 思考过程
  thinking: {
    step4_1: string;
    step4_2: string;
    step4_3: string;
    step4_4: string;
  };
}

/**
 * 形态生成状态
 * - pending：待生成
 * - generating：生成中
 * - generated：已生成
 * - failed：生成失败
 */
export type FormGenerationStatus = 'pending' | 'generating' | 'generated' | 'failed';

/**
 * 形态摘要（Phase 1 轻量扫描输出）
 * 只包含元数据，不包含完整的外貌/服装描述。
 * 用于向用户展示"剧本中识别到的形态清单"，由用户决定哪些需要进一步生成详细描述（Phase 3）。
 */
export interface FormSummary {
  /** 唯一标识 */
  id: string;
  /** 形态名称，如"战甲形态"、"黑化觉醒" */
  name: string;
  /**
   * 变化类型
   * - costume：换装（服装变化为主）
   * - makeup：妆容（妆容/发型变化为主）
   * - damage：战损（外观损伤类）
   * - transformation：变身（体型/种族/气质整体变化）
   */
  changeType: 'costume' | 'makeup' | 'damage' | 'transformation';
  /** 出现的剧集范围，如"Ep.12-15" */
  episodeRange?: string;
  /** 触发事件简述，如"首次出征前换上战甲" */
  triggerEvent: string;
  /** 剧本原文依据（50字以内） */
  sourceQuote: string;
  /** 当前生成状态，初始为 'pending' */
  status: FormGenerationStatus;

  // 🆕 Phase 1 时间线预标注（由 Stage 1 的 timelinePhases 在扫描阶段自动打标）
  /** 所属时间线阶段，如 "前世" | "重生后"；若为单时间线角色则为 undefined */
  timelinePhase?: string;
  /** 该阶段的推断年龄，如 32；由 Stage 1 的 timelinePhases 标注，Phase 3 直接使用 */
  estimatedAge?: number;
}

/**
 * 最终合并结果
 */
export interface SupplementResult {
  appearance: string;  // 完整的外观描述（主体人物+外貌特征+服饰造型）
  forms?: CharacterForm[];
  abilities?: string[];
  quote?: string;
  identityEvolution?: string;
  //  角色定位（来自阶段1 characterPosition.role），用于主角识别等场景
  role?: '主角' | '重要配角' | '配角' | '反派';
}

