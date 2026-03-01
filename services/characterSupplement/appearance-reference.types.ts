/**
 * 外貌参考资料数据结构类型定义
 * 三层继承架构：_universal（全局通用）→ _era_defaults（时期通用）→ beautyLevel节点（美型等级专属）
 * 调用方：Stage3（外貌描述创作）
 * 注意：本库只包含外貌相关数据（发型、五官、肤色、体态等），不包含服装数据
 */

/**
 * 性别分类的外貌词汇
 */
export interface GenderSpecificAppearanceData {
  女性?: string[];
  男性?: string[];
  通用?: string[];
}

/**
 * 全局通用外貌词汇（跨时代、跨场景均适用）
 * 收录标准：秦朝和2026年都有的才能放（极度保守）
 */
export interface AppearanceUniversalData {
  /** 脸型词汇：瓜子脸、鹅蛋脸、圆脸等 */
  脸型_词汇: string[];
  /** 眼型词汇：按性别分类 */
  眼型_词汇: GenderSpecificAppearanceData;
  /** 鼻型词汇 */
  鼻型_词汇: string[];
  /** 唇型词汇 */
  唇型_词汇: string[];
  /** 肤色词汇 */
  肤色_词汇: string[];
  /** 体态词汇：按性别分类 */
  体态_词汇: GenderSpecificAppearanceData;
  /** 发质词汇 */
  发质_词汇: string[];
  /** 气质词汇：按性别分类 */
  气质_词汇: GenderSpecificAppearanceData;
}

/**
 * 时期外貌默认设置（时代特征，覆盖通用值）
 */
export interface AppearanceEraDefaults {
  /** 该时代流行的发型推荐（按性别） */
  发型_推荐: GenderSpecificAppearanceData;
  /** 该时代的妆容风格描述列表 */
  妆容_风格: string[];
  /** 该时代的整体美学方向描述 */
  美学_方向: string;
  /** 该时代的肤色审美偏好（可选） */
  肤色_审美?: string;
  /** 给LLM的设计指导（自由创作引导） */
  设计指导?: string;
  /** 防穿越禁止事项 */
  禁止事项?: string;
}

/**
 * 美型等级专属外貌数据（delta，在时期默认值基础上的差异化）
 * beautyLevel：极致美型 / 平衡 / 真实
 */
export interface AppearanceBeautyData {
  /** 该美型等级精选发型（可选，优先于 _era_defaults.发型_推荐） */
  发型_精选?: GenderSpecificAppearanceData;
  /** 该美型等级精选妆容风格（可选） */
  妆容_精选?: string[];
  /** 面部特征强调点（可选） */
  面部_强调?: string[];
  /** 该美型等级的设计指导 */
  设计指导?: string;
}

/**
 * 单个时期的完整外貌数据
 */
export interface EraAppearanceData {
  /** 时期通用外貌特征 */
  _era_defaults: AppearanceEraDefaults;
  /** 极致美型等级（理想化美型，如偶像剧/言情剧） */
  极致美型?: AppearanceBeautyData;
  /** 平衡等级（美型与真实之间的平衡） */
  平衡?: AppearanceBeautyData;
  /** 真实等级（接地气，如纪实剧/现实主义剧） */
  真实?: AppearanceBeautyData;
}

/**
 * 完整外貌参考数据结构
 */
export interface AppearanceReferenceData {
  /** 全局通用词汇（跨时代均适用） */
  _universal: AppearanceUniversalData;
  /** 各时期数据，key为时期名称 */
  [era: string]: EraAppearanceData | AppearanceUniversalData;
}

/**
 * 外貌库查询参数
 */
export interface AppearanceQueryParams {
  /** 时代背景，如 "现代"、"民国"、"古代"、"玄幻修仙" */
  era: string;
  /**
   * 美型等级，影响外貌词汇偏好
   * - idealized：极致美型（偶像剧/言情剧）
   * - balanced：平衡（都市剧/职场剧）
   * - realistic：真实（纪实剧/现实主义剧）
   */
  beautyLevel?: 'idealized' | 'balanced' | 'realistic';
  /** 角色性别（影响发型/体态等词汇筛选） */
  gender?: string;
}

/**
 * 格式化后的外貌参考（供LLM使用）
 */
export interface FormattedAppearanceReference {
  /** 通用外貌词汇（已格式化的文本） */
  universalVocabulary: string;
  /** 时期特征（已格式化的文本） */
  eraCharacteristics: string;
  /** 美型等级专属词汇（已格式化的文本，可能为空字符串） */
  beautyLevelVocabulary: string;
  /** 完整格式化文本（三层合并，供直接注入prompt） */
  fullText: string;
}

