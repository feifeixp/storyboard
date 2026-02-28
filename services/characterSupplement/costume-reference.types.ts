/**
 * 服装参考资料数据结构类型定义
 *
 * 三层继承架构：_universal（全局通用）→ _era_defaults（时期通用）→ 叶节点delta（场景专属）
 * 四维结构：时期 → 场景 → 风格 → 季节
 */

/**
 * 性别特定数据结构（用于支持男女区分的服装选项）
 */
export interface GenderSpecificData {
  女性?: string[];
  男性?: string[];
  通用?: string[];
}

/**
 * Layer 1: 全局通用数据（_universal）
 * 判断标准：秦朝和2026年都有才能放
 */
export interface UniversalData {
  颜色: {
    暖色系: string[];
    冷色系: string[];
    中性色: string[];
    高级色: string[];
    特殊色: string[];
  };
  面料_基础: string[];   // 天然纤维等基础面料
  花纹_基础: string[];   // 纯色/条纹/格纹等基础图案概念
  // 注：发型/妆容数据已迁移至 appearance-reference.json，由 getAppearanceReference 提供
}

/**
 * Layer 2: 时期级通用数据（_era_defaults）
 * 时期内所有场景共享的基准内容
 */
export interface EraDefaults {
  面料?: string[];                       // 时期特有面料
  花纹?: string[];                       // 时期特有花纹
  颜色_流行?: string[];                  // 时期流行色系
  // 注：发型_特色 已迁移至 appearance-reference.json
  上装_基础?: GenderSpecificData;        // 时期内所有场景都适用的上装基础款
  下装_基础?: GenderSpecificData;        // 时期内所有场景都适用的下装基础款
  配饰_基础?: GenderSpecificData;        // 时期内所有场景都适用的基础配饰
  设计指导?: string;                     // 该时期服装设计方向（文字描述，LLM据此自由创作）
  禁止事项?: string;                     // 必须避免的元素（防穿越/防破坏感）
}

/**
 * Layer 3: 季节（叶节点）数据
 * 支持旧格式（完整字段）和新格式（仅场景专属delta字段）
 */
export interface SeasonData {
  // ── 旧格式字段（向后兼容）──
  上装?: string[] | GenderSpecificData;
  下装?: string[] | GenderSpecificData;
  外套?: string[] | GenderSpecificData;
  配饰?: string[] | GenderSpecificData;
  颜色?: {
    常见色?: string[];
    流行色?: string[];
    禁忌色?: string[];
  };
  面料?: string[];
  花纹?: string[];
  // 注：妆容（发型+妆容特点）已迁移至 appearance-reference.json，由 Stage3 通过 getAppearanceReference 提供
  风格关键词?: string[];

  // ── 新格式字段（delta，场景专属）──
  上装_exclusive?: GenderSpecificData;   // 场景推荐上装（优先展示）
  下装_exclusive?: GenderSpecificData;   // 场景推荐下装（优先展示）
  外套_exclusive?: GenderSpecificData | string[];
  配饰_exclusive?: GenderSpecificData;   // 场景推荐配饰（优先展示）
  面料_exclusive?: string[];             // 场景专属面料（优先推荐）
  颜色_accent?: string[];               // 场景强调色（推荐色）
  颜色_forbidden?: string[];            // 场景禁忌色
}

/**
 * 风格数据结构（包含所有季节）
 */
export interface StyleData {
  季节: {
    [season: string]: SeasonData;  // "春季" | "夏季" | "秋季" | "冬季" | "通用"
  };
}

/**
 * 场景数据结构（包含所有风格）
 */
export interface SceneData {
  风格: {
    [style: string]: StyleData;  // "真实" | "美化" | "华丽" | "时尚"
  };
}

/**
 * 时期数据结构（包含所有场景）
 */
export interface EraData {
  _era_defaults?: EraDefaults;   // Layer 2: 时期通用数据
  场景: {
    [scene: string]: SceneData;  // "日常" | "职场" | "社交" | "活动" | "特殊"
  };
}

/**
 * 完整的服装参考资料数据结构
 */
export interface CostumeReferenceData {
  _universal?: UniversalData;    // Layer 1: 全局通用数据
  [era: string]: EraData | UniversalData | undefined;  // 各时期数据
}

/**
 * 查询参数
 */
export interface CostumeQueryParams {
  era: string;      // 时期：如"现代"、"职场"、"民国"
  scene?: string;   // 场景：如"日常"、"办公"、"社交"
  style?: string;   // 风格：如"真实"、"美化"、"华丽"
  season?: string;  // 季节：如"春季"、"夏季"、"秋季"、"冬季"
  gender?: string;  // 性别：如"男"、"女"（用于选择性别特定的服装）
}

/**
 * 场景类型枚举
 */
export enum SceneType {
  DAILY = "日常",      // 日常场景：在家、外出
  OFFICE = "办公",     // 办公场景
  SOCIAL = "社交",     // 社交场景：晚宴、婚礼、派对
  ACTIVITY = "活动",   // 活动场景：运动、旅行
  SPECIAL = "特殊"     // 特殊场景：战斗、受伤、伪装
}

/**
 * 美学风格枚举
 */
export enum AestheticStyle {
  REALISTIC = "真实",   // 真实风格：历史准确、朴素自然
  ENHANCED = "美化",    // 美化风格：适度美化、符合影视审美
  GLAMOROUS = "华丽",   // 华丽风格：最大化美化、影视化创作
  FASHIONABLE = "时尚"  // 时尚风格：追求潮流
}

/**
 * 季节枚举
 */
export enum Season {
  SPRING = "春季",  // 春季：3-5月，10-20°C
  SUMMER = "夏季",  // 夏季：6-8月，25-35°C
  AUTUMN = "秋季",  // 秋季：9-11月，10-20°C
  WINTER = "冬季",  // 冬季：12-2月，-10-10°C
  GENERAL = "通用"  // 通用：不分季节
}

