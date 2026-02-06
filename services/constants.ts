/**
 * 全局常量配置
 *
 * 集中管理，便于维护和修改
 *
 * ⚠️ 角度规则依据：.augment/rules/角度规则优化总结.ini
 * 修改 DEFAULTS.ANGLE_HEIGHT 和 SHOT_RULES 前必须查阅规则文件
 */

// ═══════════════════════════════════════════════════════════════
// localStorage 存储键
// ═══════════════════════════════════════════════════════════════

export const STORAGE_KEYS = {
  // 核心状态
  CURRENT_STEP: 'storyboard_current_step',
  SCRIPT: 'storyboard_script',
  SHOTS: 'storyboard_shots',
  CHARACTER_REFS: 'storyboard_character_refs',
  CHAT_HISTORY: 'storyboard_chat_history',
  
  // 样式配置
  SELECTED_STYLE: 'storyboard_selected_style',
  CUSTOM_STYLE_PROMPT: 'storyboard_custom_style_prompt',
  
  // 生成结果
  HQ_URLS: 'storyboard_hq_urls',
  
  // 思维链状态
  COT_STAGE1: 'storyboard_cot_stage1',
  COT_STAGE2: 'storyboard_cot_stage2',
  COT_STAGE3: 'storyboard_cot_stage3',
  COT_STAGE4: 'storyboard_cot_stage4',
  COT_STAGE5: 'storyboard_cot_stage5',
  
  // 项目管理
  PROJECTS: 'storyboard_projects',
  CURRENT_PROJECT_ID: 'storyboard_current_project_id',
} as const;

// ═══════════════════════════════════════════════════════════════
// 生成限制
// ═══════════════════════════════════════════════════════════════

export const LIMITS = {
  /** 每批处理的镜头数量 */
  SHOTS_PER_BATCH: 6,
  
  /** API 重试次数 */
  MAX_RETRIES: 3,
  
  /** 重试间隔（毫秒） */
  RETRY_DELAY_MS: 2000,
  
  /** localStorage 最大存储（字符数） */
  MAX_STORAGE_SIZE: 5_000_000, // 约 5MB
  
  /** 单集剧本最大长度 */
  MAX_SCRIPT_LENGTH: 50_000,
  
  /** 最大镜头数（单集） */
  MAX_SHOTS_PER_EPISODE: 100,
} as const;

// ═══════════════════════════════════════════════════════════════
// 默认值
// ⚠️ 修改前必读：.augment/rules/角度规则优化总结.ini
// ═══════════════════════════════════════════════════════════════

export const DEFAULTS = {
  /** 默认镜头时长 */
  SHOT_DURATION: '4s',

  /** 默认景别 */
  SHOT_SIZE: '中景(MS)',

  /** 默认角度方向 */
  ANGLE_DIRECTION: '3/4正面(3/4 Front)',

  /**
   * 默认角度高度
   * ⚠️ 必须为 '轻微仰拍(Mild Low)'，不能是平视
   * 依据：.augment/rules/角度规则优化总结.ini - 默认选择轻微仰拍/轻微俯拍（40-50%）
   */
  ANGLE_HEIGHT: '轻微仰拍(Mild Low)',

  /** 默认运镜 */
  CAMERA_MOVE: '固定(Static)',
} as const;

// ═══════════════════════════════════════════════════════════════
// 分镜规则限制
// ⚠️ 修改前必读：.augment/rules/角度规则优化总结.ini
// ═══════════════════════════════════════════════════════════════

export const SHOT_RULES = {
  /**
   * 正面镜头最大数量（整集）
   * ⚠️ 必须为 2（30个镜头最多2个，占比≤7%）
   * 依据：.augment/rules/角度规则优化总结.ini
   */
  MAX_FRONT_VIEW_SHOTS: 2,

  /**
   * 平视镜头最大占比
   * ⚠️ 必须为 0.15（15%），禁止连续2个以上
   * 依据：.augment/rules/角度规则优化总结.ini
   */
  MAX_EYE_LEVEL_RATIO: 0.15,

  /**
   * 平视镜头最大连续数量
   * ⚠️ 禁止连续2个以上平视镜头
   */
  MAX_CONSECUTIVE_EYE_LEVEL: 2,

  /** 3/4正面镜头最大占比 */
  MAX_THREE_QUARTER_FRONT_RATIO: 0.25,

  /** 固定镜头最大数量（整集） */
  MAX_STATIC_SHOTS: 2,

  /** 连续相同景别的最大数量 */
  MAX_CONSECUTIVE_SAME_SIZE: 3,

  /**
   * 极端角度最小占比
   * ⚠️ 必须≥15%（极端仰拍/极端俯拍/鸟瞰/虫视）
   * 依据：.augment/rules/角度规则优化总结.ini
   */
  MIN_EXTREME_ANGLE_RATIO: 0.15,
} as const;

// ═══════════════════════════════════════════════════════════════
// UI 配置
// ═══════════════════════════════════════════════════════════════

export const UI_CONFIG = {
  /** 思维链阶段名称 */
  COT_STAGE_NAMES: {
    1: '剧本分析',
    2: '视觉策略',
    3: '镜头分配',
    4: '逐镜设计',
    5: '质量检查',
  } as const,
  
  /** 进度消息模板 */
  PROGRESS_MESSAGES: {
    ANALYZING: '【阶段{stage}/5】{name}中...',
    BATCH: '【阶段4/5】逐镜设计 {current}/{total}...',
    RETRY: '【阶段{stage}/5】网络错误，{delay}秒后重试 ({current}/{max})...',
    COMPLETE: '✅ 思维链生成完成！共 {count} 个镜头',
  } as const,
} as const;

