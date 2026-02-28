/**
 * 气质/美型模板库数据结构类型定义
 * 用途：为 Stage2（视觉策略）和 Stage3（外貌描述）提供气质参考词库
 * 调用方：stage2-visual-tags-optimized.ts、stage3-appearance-design-optimized.ts
 * 注意：本库聚焦气质方向，不直接指定具体款式（避免硬编码反模式）
 */

/**
 * 按性别分类的气质引导词
 */
export interface GenderSpecificTemperamentData {
  女性?: string[];
  男性?: string[];
  通用?: string[];
}

/**
 * 单个气质模板的完整定义
 */
export interface TemperamentTemplate {
  /** 唯一标识符，英文 snake_case */
  id: string;

  /** 中文名称，如"冷感美人" */
  name: string;

  /** 适合哪些性别（不填表示通用） */
  gender?: ('女性' | '男性' | '通用')[];

  /** 一句话描述气质核心 */
  description: string;

  /** 核心视觉关键词（3-5个，供注入 Stage3 提示词） */
  keyFeatures: string[];

  /**
   * 眼神/眼型建议（按性别分类）
   * 不是硬编码，而是"这种气质适合什么眼神"的引导
   */
  eyeGuidance: GenderSpecificTemperamentData;

  /**
   * 色彩方向建议
   * 描述整体色调感觉，而非具体颜色
   */
  colorDirection: string;

  /**
   * 给各 Stage 的设计引导（引导 LLM 思考，而非硬编码规则）
   */
  stageGuidance: {
    /** Stage3 外貌设计引导语（描述"应该让LLM思考什么"） */
    appearance?: string;
    /** Stage4 服装设计引导语 */
    costume?: string;
  };

  /**
   * 适合的角色类型（举例，非穷举）
   * 帮助 LLM 判断是否匹配当前角色
   */
  suitableCharacterTypes: string[];

  /**
   * 与哪些其他气质可以叠加混搭
   * 引用其他模板的 id
   */
  compatibleWith?: string[];
}

/**
 * 完整气质模板库数据结构
 * 一级 key：气质大类（冷系/暖系/中性系/特殊系）
 * 二级：具体模板列表
 */
export interface TemperamentReferenceData {
  /** 元数据 */
  _meta: {
    version: string;
    description: string;
    lastUpdated: string;
    totalTemplates: number;
  };

  /** 冷系气质（疏离感、高冷、神秘） */
  冷系: TemperamentTemplate[];

  /** 暖系气质（亲和力、活力、甜美） */
  暖系: TemperamentTemplate[];

  /** 中性系气质（知性、干练、英气） */
  中性系: TemperamentTemplate[];

  /** 特殊系气质（妖娆、少年感、仙气等跨性别标签） */
  特殊系: TemperamentTemplate[];
}

