/**
 * 提示词校验工具
 * 
 * 基于《提示词规范标准.ini》进行校验：
 * - 字数校验
 * - 违规词汇检测
 * - 视频模式自动选择
 */

// ═══════════════════════════════════════════════════════════════
// 字数限制常量
// ═══════════════════════════════════════════════════════════════

export const PROMPT_LENGTH_LIMITS = {
  /** 第一层：首尾帧状态描述 */
  STATE_DESCRIPTION: { min: 50, max: 100 },
  /** 第二层：首尾帧图片提示词 */
  IMAGE_PROMPT: {
    min: 80,
    max: 200,
    recommended: { min: 100, max: 150 }
  },
  /** 第三层：视频过渡提示词 */
  VIDEO_PROMPT: { min: 50, max: 150 },
} as const;

// ═══════════════════════════════════════════════════════════════
// 违规词汇列表（基于AI识别准确性规则）
// ═══════════════════════════════════════════════════════════════

export const FORBIDDEN_TERMS: Array<{ term: string; reason: string; suggestion: string }> = [
  // ========== 元术语（AI无法理解的专业术语）==========
  // 基于第65集测试结果，96.6%的提示词包含"镜头"或"画面"
  { term: '镜头前方', reason: '元术语', suggestion: '改为"前景"' },
  { term: '镜头前缘', reason: '元术语', suggestion: '改为"前景边缘"' },
  { term: '镜头', reason: '元术语，AI无法理解', suggestion: '删除或改为"视角""视线"' },
  { term: '画面中央', reason: '元术语', suggestion: '改为"中央"' },
  { term: '画面中心', reason: '元术语', suggestion: '改为"中心"' },
  { term: '画面左侧', reason: '元术语', suggestion: '改为"左侧"' },
  { term: '画面右侧', reason: '元术语', suggestion: '改为"右侧"' },
  { term: '画面左1/3', reason: '元术语', suggestion: '改为"左1/3处"' },
  { term: '画面右1/3', reason: '元术语', suggestion: '改为"右1/3处"' },
  { term: '画面', reason: '元术语，AI无法理解', suggestion: '删除或改为"构图""视野"' },
  { term: '分镜', reason: '元术语', suggestion: '删除' },
  { term: '构图', reason: '元术语', suggestion: '删除或改为具体位置描述' },
  { term: '视角', reason: '元术语', suggestion: '删除或改为"视线"' },
  { term: '取景', reason: '元术语', suggestion: '删除' },

  // ========== 误导性POV描述（基于实测：会导致画面出现眼睛特写）==========
  { term: '从眼睛看出去', reason: '会被误解为画眼睛特写', suggestion: '改为"主观视角"' },
  { term: '眼睛位置', reason: '会被误解为画眼睛特写', suggestion: '改为"主观视角"' },
  { term: '从角色眼睛', reason: '会被误解为画眼睛特写', suggestion: '改为"主观视角"' },
  { term: '从晋安眼睛', reason: '会被误解为画眼睛特写', suggestion: '改为"主观视角"' },
  { term: '从林溪眼睛', reason: '会被误解为画眼睛特写', suggestion: '改为"主观视角"' },
  { term: '角色视线看出去', reason: '可能误导', suggestion: '改为"主观视角"' },

  // ========== 抽象概念词 ==========
  { term: '动态剪影', reason: '太抽象', suggestion: '侧身轮廓/奔跑轮廓' },
  { term: '数据火花', reason: '太抽象', suggestion: '蓝色电弧火花/荧光粒子飞溅' },
  { term: '数据碎片', reason: '太抽象', suggestion: '发光的蓝色碎片/荧光方块碎片' },
  { term: '数据光', reason: '太抽象', suggestion: '蓝色光芒/荧光' },

  // ========== 比较级词汇 ==========
  { term: '更明显', reason: '比较级，AI无参照', suggestion: '强烈的/浓烈的' },
  { term: '更强烈', reason: '比较级，AI无参照', suggestion: '强烈的/浓烈的' },
  { term: '更亮', reason: '比较级，AI无参照', suggestion: '明亮的/耀眼的' },
  { term: '更暗', reason: '比较级，AI无参照', suggestion: '昏暗的/幽暗的' },

  // ========== 后期效果词 ==========
  { term: '动态模糊', reason: '后期效果', suggestion: '带有速度感/衣角飘动' },
  { term: '景深效果', reason: '后期效果', suggestion: '前景虚化/背景虚化' },
  { term: '运动模糊', reason: '后期效果', suggestion: '带有速度感/运动轨迹' },

  // ========== 程度过度词 ==========
  { term: '极度前倾', reason: '程度过度', suggestion: '身体前倾' },
  { term: '极度紧张', reason: '程度过度', suggestion: '紧张专注' },
  { term: '全速奔跑', reason: '超出AI能力', suggestion: '快速奔跑/保持奔跑姿态' },
  { term: '步幅巨大', reason: '程度过度', suggestion: '步幅大/奔跑中' },
];

// ═══════════════════════════════════════════════════════════════
// 视频模式判断条件（基于《视频生成提示词规范.ini》第201-222行）
// ═══════════════════════════════════════════════════════════════

export type VideoMode = 'Static' | 'I2V';

export interface VideoModeDecision {
  mode: VideoMode;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}



/**
 * 跟拍大位移关键词（适合 I2V + 跟拍运镜）
 * 这类场景虽然位移大，但镜头跟随主体，不需要尾帧
 */
export const TRACKING_MOTION_KEYWORDS = [
  { keyword: '奔跑', category: '跟拍运动' },
  { keyword: '冲刺', category: '跟拍运动' },
  { keyword: '飞行', category: '跟拍运动' },
  { keyword: '滑行', category: '跟拍运动' },
  { keyword: '追逐', category: '跟拍运动' },
  { keyword: '行走', category: '跟拍运动' },
  { keyword: '漫步', category: '跟拍运动' },
];

/**
 * 适合图生视频(I2V)模式的场景关键词
 * 来源：视频生成提示词规范.ini 第17-49行
 */
export const I2V_SUITABLE_KEYWORDS = [
  // 微小动作
  { keyword: '眨眼', category: '微小动作' },
  { keyword: '微笑', category: '微小动作' },
  { keyword: '呼吸', category: '微小动作' },
  { keyword: '转头', category: '微小动作' },
  { keyword: '点头', category: '微小动作' },
  { keyword: '摇头', category: '微小动作' },
  { keyword: '注视', category: '微小动作' },
  { keyword: '凝视', category: '微小动作' },
  // 环境微动
  { keyword: '飘动', category: '环境微动' },
  { keyword: '摇曳', category: '环境微动' },
  { keyword: '闪烁', category: '环境微动' },
  { keyword: '波动', category: '环境微动' },
  { keyword: '涟漪', category: '环境微动' },
  { keyword: '飘落', category: '环境微动' },
  // 氛围类
  { keyword: '氛围', category: '氛围类' },
  { keyword: '静态', category: '氛围类' },
  { keyword: '定格', category: '氛围类' },
  { keyword: '静止', category: '氛围类' },
];

/**
 * 呼吸感/微动场景关键词（原 Static 模式，现归入 I2V 的微动子类）
 * 这类场景使用 I2V 添加呼吸感，不需要尾帧
 */
export const BREATHING_MOTION_KEYWORDS = [
  '静止',
  '定格',
  '静态',
  '静物',
  '凝视',
  '沉思',
  '等待',
  '伫立',
];

// ═══════════════════════════════════════════════════════════════
// 校验函数
// ═══════════════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 校验状态描述字数（第一层）
 */
export function validateStateDescription(text: string): ValidationResult {
  const length = text.length;
  const { min, max } = PROMPT_LENGTH_LIMITS.STATE_DESCRIPTION;
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (length < min) {
    errors.push(`状态描述字数不足：${length}字，最少需要${min}字`);
  }
  if (length > max) {
    warnings.push(`状态描述字数过多：${length}字，建议控制在${max}字以内`);
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 校验图片提示词字数（第二层）
 */
export function validateImagePrompt(text: string): ValidationResult {
  const length = text.length;
  const { min, max } = PROMPT_LENGTH_LIMITS.IMAGE_PROMPT;
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (length < min) {
    warnings.push(`图片提示词字数偏少：${length}字，建议至少${min}字以获得更好效果`);
  }
  if (length > max) {
    errors.push(`图片提示词字数过多：${length}字，最多${max}字`);
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 校验视频提示词字数（第三层）
 */
export function validateVideoPrompt(text: string): ValidationResult {
  const length = text.length;
  const { min, max } = PROMPT_LENGTH_LIMITS.VIDEO_PROMPT;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (length < min) {
    warnings.push(`视频提示词字数偏少：${length}字，建议至少${min}字`);
  }
  if (length > max) {
    warnings.push(`视频提示词字数过多：${length}字，建议控制在${max}字以内`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 检测违规词汇
 */
export function detectForbiddenTerms(text: string): Array<{ term: string; reason: string; suggestion: string }> {
  const found: Array<{ term: string; reason: string; suggestion: string }> = [];

  for (const item of FORBIDDEN_TERMS) {
    if (text.includes(item.term)) {
      found.push(item);
    }
  }

  return found;
}

/**
 * 判断视频生成模式（统一 I2V）
 * 所有镜头使用 I2V（图生视频）模式：一张图 + 视频提示词
 */
export function determineVideoMode(
  storyBeat: string,
  duration: number,
  _hasSignificantChange: boolean,
  shotType?: '静态' | '运动',
  _cameraMove?: string
): VideoModeDecision {
  // 静态镜头：I2V + 呼吸感
  if (shotType === '静态') {
    return {
      mode: 'I2V',
      reason: '静态镜头使用 I2V 添加呼吸感微动',
      confidence: 'high'
    };
  }

  // 所有运动场景：I2V
  for (const item of I2V_SUITABLE_KEYWORDS) {
    if (storyBeat.includes(item.keyword)) {
      return {
        mode: 'I2V',
        reason: `场景包含"${item.keyword}"(${item.category})，适合图生视频`,
        confidence: 'high'
      };
    }
  }

  if (duration > 10) {
    return {
      mode: 'I2V',
      reason: `时长${duration}秒超过10秒，建议拆分为多段，当前使用 I2V`,
      confidence: 'low'
    };
  }

  return {
    mode: 'I2V',
    reason: '默认使用图生视频模式',
    confidence: 'low'
  };
}

/**
 * 综合校验Shot的所有提示词
 */
export interface ShotPromptValidation {
  startFrame: ValidationResult;
  promptCn: ValidationResult;
  videoPromptCn: ValidationResult | null;
  forbiddenTerms: Array<{ field: string; terms: Array<{ term: string; reason: string; suggestion: string }> }>;
  videoMode: VideoModeDecision | null;
}

export function validateShotPrompts(shot: {
  startFrame?: string;
  promptCn: string;
  videoPromptCn?: string;
  storyBeat?: string;
  duration?: string;
  shotType?: string;
}): ShotPromptValidation {
  const result: ShotPromptValidation = {
    startFrame: validateStateDescription(shot.startFrame || ''),
    promptCn: validateImagePrompt(shot.promptCn || ''),
    videoPromptCn: shot.videoPromptCn ? validateVideoPrompt(shot.videoPromptCn) : null,
    forbiddenTerms: [],
    videoMode: null,
  };

  // 检测各字段的违规词汇
  const fieldsToCheck = [
    { field: 'startFrame', text: shot.startFrame },
    { field: 'promptCn', text: shot.promptCn },
    { field: 'videoPromptCn', text: shot.videoPromptCn },
  ];

  for (const { field, text } of fieldsToCheck) {
    if (text) {
      const terms = detectForbiddenTerms(text);
      if (terms.length > 0) {
        result.forbiddenTerms.push({ field, terms });
      }
    }
  }

  // 判断视频模式（统一 I2V，不再依赖 endFrame）
  if (shot.storyBeat) {
    const durationNum = parseInt((shot as any).duration || '5');
    result.videoMode = determineVideoMode(shot.storyBeat, durationNum, false);
  }

  return result;
}

/**
 * 生成校验报告摘要
 */
export function generateValidationSummary(validation: ShotPromptValidation): string {
  const lines: string[] = [];

  // 字数校验
  if (!validation.startFrame.valid || validation.startFrame.warnings.length > 0) {
    lines.push(...validation.startFrame.errors, ...validation.startFrame.warnings);
  }
  if (!validation.promptCn.valid || validation.promptCn.warnings.length > 0) {
    lines.push(...validation.promptCn.errors, ...validation.promptCn.warnings);
  }
  if (validation.videoPromptCn && (!validation.videoPromptCn.valid || validation.videoPromptCn.warnings.length > 0)) {
    lines.push(...validation.videoPromptCn.errors, ...validation.videoPromptCn.warnings);
  }

  // 违规词汇
  for (const { field, terms } of validation.forbiddenTerms) {
    for (const t of terms) {
      lines.push(`[${field}] 包含违规词汇"${t.term}"(${t.reason})，建议改为：${t.suggestion}`);
    }
  }

  // 视频模式建议
  if (validation.videoMode) {
    lines.push(`推荐视频模式：${validation.videoMode.mode}（${validation.videoMode.reason}）`);
  }

  return lines.length > 0 ? lines.join('\n') : '✅ 所有校验通过';
}

// ═══════════════════════════════════════════════════════════════
// 🆕 视频提示词七要素校验
// ═══════════════════════════════════════════════════════════════

/**
 * 视频提示词七要素
 * required: true 表示必须包含，false 表示建议包含
 */
export const VIDEO_PROMPT_SEVEN_ELEMENTS = [
  { name: '运动描述', keywords: ['镜头固定', '镜头', '形态渐变', '空间平移', '时间流逝', '推进', '拉远', '跟拍'], required: true },
  { name: '运镜方式', keywords: ['固定', '推进', '拉远', '跟拍', '环绕', '横摇', '竖摇', '升降'], required: true },
  { name: '主体动作', keywords: ['保持', '站姿', '奔跑', '行走', '转身', '抬手', '蹲下', '跳跃', '挥动', '静止', '双手', '手'], required: true },
  { name: '运动轨迹', keywords: ['从', '向', '移动', '位置', '左侧', '右侧', '中央', '前倾', '起伏', '眼神', '胸口', '披风'], required: false }, // 静态镜头可能没有明显轨迹
  { name: '环境响应', keywords: ['背景', '环境', '苔藓', '花瓣', '尘埃', '光影', '乌云', '树叶', '飘动', '闪烁', '流动', '走廊', '虚空'], required: false }, // 特写镜头可能不强调环境
  { name: '光影过渡', keywords: ['光', '影', '照射', '变化', '逆光', '侧光', '顶光', '冷', '暖', '蓝', '红', '黄', '光芒', '光源'], required: false }, // 某些镜头可能不强调光影
  { name: '速度节奏', keywords: ['缓慢', '匀速', '先慢后快', '先快后慢', '节奏', '快速', '逐渐', '转'], required: true },
] as const;

/**
 * 校验视频提示词是否包含七要素
 */
export function validateVideoPromptSevenElements(videoPrompt: string): {
  valid: boolean;
  missingElements: string[];
  suggestions: string[];
  score: number; // 0-100分
} {
  if (!videoPrompt || videoPrompt.trim().length === 0) {
    return {
      valid: false,
      missingElements: VIDEO_PROMPT_SEVEN_ELEMENTS.map(e => e.name),
      suggestions: ['视频提示词为空，请生成完整的视频提示词'],
      score: 0
    };
  }

  const missingElements: string[] = [];
  const suggestions: string[] = [];
  let foundCount = 0;
  let requiredCount = 0;

  // 检查每个要素
  for (const element of VIDEO_PROMPT_SEVEN_ELEMENTS) {
    const found = element.keywords.some(keyword => videoPrompt.includes(keyword));
    if (found) {
      foundCount++;
    } else {
      if (element.required) {
        missingElements.push(element.name);
        suggestions.push(`缺少【${element.name}】，建议添加：${element.keywords.slice(0, 3).join('/')}`);
      } else {
        // 非必需要素，只给建议不算错误
        suggestions.push(`建议添加【${element.name}】以提升质量：${element.keywords.slice(0, 3).join('/')}`);
      }
    }
    if (element.required) {
      requiredCount++;
    }
  }

  // 检查字数
  const length = videoPrompt.length;
  if (length < PROMPT_LENGTH_LIMITS.VIDEO_PROMPT.min) {
    suggestions.push(`字数不足：当前${length}字，建议至少${PROMPT_LENGTH_LIMITS.VIDEO_PROMPT.min}字`);
  } else if (length > PROMPT_LENGTH_LIMITS.VIDEO_PROMPT.max) {
    suggestions.push(`字数过多：当前${length}字，建议不超过${PROMPT_LENGTH_LIMITS.VIDEO_PROMPT.max}字`);
  }

  // 检查是否包含时长（只给建议，不算错误）
  if (!videoPrompt.match(/\d+秒/)) {
    suggestions.push('建议在末尾添加时长标注"X秒"');
  }

  const score = Math.round((foundCount / VIDEO_PROMPT_SEVEN_ELEMENTS.length) * 100);

  // 只有缺少必需要素才算无效
  const valid = missingElements.length === 0 && length >= PROMPT_LENGTH_LIMITS.VIDEO_PROMPT.min;

  return {
    valid,
    missingElements,
    suggestions,
    score
  };
}

/**
 * 🆕 智能修复视频提示词
 * 根据现有内容和镜头信息，自动补全缺失的要素
 */
export function autoFixVideoPrompt(
  currentPrompt: string,
  shotType: string,
  cameraMove?: string,
  startFrame?: string,
  endFrame?: string
): string {
  // 如果已经是完整的提示词且字数足够，只做格式修正
  const validation = validateVideoPromptSevenElements(currentPrompt);
  if (validation.valid && currentPrompt.length >= PROMPT_LENGTH_LIMITS.VIDEO_PROMPT.min) {
    return currentPrompt;
  }

  // 构建基础框架
  let fixed = '从首帧到尾帧，';

  // 1. 运镜方式
  if (cameraMove) {
    fixed += `${cameraMove}，`;
  } else {
    fixed += '镜头固定，';
  }

  // 2. 主体动作 + 运动轨迹（从原提示词提取或使用默认）
  let actionPart = '';
  if (currentPrompt) {
    // 移除"镜头固定"等前缀
    let cleaned = currentPrompt
      .replace(/^(从首帧到尾帧，)?/, '')
      .replace(/^镜头固定，/, '')
      .replace(/^镜头[^，]*，/, '');

    // 尝试提取完整的动作描述（包括多个逗号分隔的部分）
    // 提取到"节奏"或"秒"之前的所有内容
    const fullActionMatch = cleaned.match(/^([^节秒]+)/);
    if (fullActionMatch) {
      actionPart = fullActionMatch[1].trim();
      // 移除末尾的逗号
      actionPart = actionPart.replace(/，$/, '');
    }

    // 如果提取失败或太短，使用整个清理后的文本
    if (!actionPart || actionPart.length < 15) {
      actionPart = cleaned.replace(/[，。]*节奏.*$/, '').replace(/\d+秒.*$/, '').trim();
    }
  }

  if (!actionPart || actionPart.length < 15) {
    actionPart = '主体保持姿态仅有轻微呼吸起伏，身体微微前倾';
  }

  fixed += `${actionPart}，`;

  // 4. 环境响应
  if (currentPrompt.includes('背景') || currentPrompt.includes('环境')) {
    const envMatch = currentPrompt.match(/背景[^，。]*/);
    if (envMatch) {
      fixed += `${envMatch[0]}，`;
    }
  } else {
    fixed += '背景环境微妙变化，';
  }

  // 5. 光影过渡
  if (currentPrompt.includes('光') || currentPrompt.includes('影')) {
    const lightMatch = currentPrompt.match(/[^，。]*光[影]?[^，。]{5,25}/);
    if (lightMatch) {
      fixed += `${lightMatch[0]}，`;
    }
  } else {
    fixed += '光影微妙变化在画面中形成动态效果，';
  }

  // 6. 速度节奏
  if (currentPrompt.includes('节奏') || currentPrompt.includes('缓慢') || currentPrompt.includes('快速')) {
    const rhythmMatch = currentPrompt.match(/(缓慢|快速|匀速|先慢后快|先快后慢)?节奏/);
    if (rhythmMatch) {
      fixed += `${rhythmMatch[0]}，`;
    }
  } else {
    fixed += '缓慢节奏，';
  }

  // 7. 时长（从原提示词提取或使用默认）
  const durationMatch = currentPrompt.match(/(\d+)秒/);
  if (durationMatch) {
    fixed += `${durationMatch[1]}秒。`;
  } else {
    // 根据镜头类型推断时长
    if (shotType === '运动') {
      fixed += '5秒。';
    } else {
      fixed += '3秒。';
    }
  }

  return fixed;
}

// ═══════════════════════════════════════════════════════════════
// 🆕 图片提示词四要素校验
// ═══════════════════════════════════════════════════════════════

/**
 * 🚨 图片提示词违规词汇列表
 *
 * 基于AI识别准确性规则（提示词规范标准.ini 第13-27行），
 * 以下描述词AI生图识别不准确，必须避免
 */
export const IMAGE_PROMPT_FORBIDDEN_TERMS = [
  // 1. 太抽象的概念（规范第18-22行）
  { term: '动态剪影', category: '太抽象', suggestion: '两人奔跑的侧身轮廓，衣摆和披风向后飘动' },
  { term: '数据碎片', category: '太抽象', suggestion: '发光的蓝色碎片/荧光方块碎片' },
  { term: '数据火花', category: '太抽象', suggestion: '蓝色电弧火花/荧光粒子飞溅' },
  { term: '能量波动', category: '太抽象', suggestion: '蓝色光芒闪烁/光晕扩散' },
  { term: '时空裂缝', category: '太抽象', suggestion: '扭曲的空间裂纹/发光的裂隙' },
  { term: '数据流', category: '太抽象', suggestion: '蓝色光线流动/发光线条流动' },

  // 2. 比较级词汇（AI无参照）（规范第19行）
  { term: '更明显', category: '比较级', suggestion: '明显/清晰可见' },
  { term: '更强烈', category: '比较级', suggestion: '强烈/浓烈' },
  { term: '更加', category: '比较级', suggestion: '删除"更加"' },
  { term: '最强', category: '比较级', suggestion: '强烈/浓烈' },
  { term: '最明显', category: '比较级', suggestion: '明显/清晰' },

  // 3. 程度过度的词汇
  { term: '极度', category: '程度过度', suggestion: '删除"极度"' },
  { term: '完全', category: '程度过度', suggestion: '删除"完全"' },
  { term: '极其', category: '程度过度', suggestion: '删除"极其"' },
  { term: '极度前倾', category: '程度过度', suggestion: '身体前倾' },

  // 4. 超出AI能力的动作（规范第194行）
  { term: '全速奔跑', category: '超出AI能力', suggestion: '快速奔跑/保持奔跑姿态' },
  { term: '飞行', category: '超出AI能力', suggestion: '漂浮/悬浮' },
  { term: '跳跃', category: '超出AI能力', suggestion: '腾空姿态/离地姿态' },
  { term: '剧烈打斗', category: '超出AI能力', suggestion: '对峙姿态/攻击姿态' },
  { term: '跑酷', category: '超出AI能力', suggestion: '奔跑姿态' },
  { term: '复杂舞蹈', category: '超出AI能力', suggestion: '舞蹈姿态/摆动身体' },

  // 5. 后期效果词汇（规范第20行）
  { term: '景深效果', category: '后期效果', suggestion: '前景虚化/背景虚化' },
  { term: '动态模糊', category: '后期效果', suggestion: '带有速度感/衣角飘动' },
  { term: '强烈动态模糊', category: '后期效果', suggestion: '奔跑姿态带有速度感，衣角飘动' },
  { term: '光晕效果', category: '后期效果', suggestion: '光芒扩散/光晕' },
  { term: '虚化效果', category: '后期效果', suggestion: '虚化/失焦' },
  { term: '模糊效果', category: '后期效果', suggestion: '虚化/失焦' }
] as const;

/**
 * 🎨 图片提示词四要素定义（基于规范标准.ini）
 *
 * 核心公式：主体描述 + 环境背景 + 动作状态 + 光影氛围 + 技术参数
 *
 * 详细格式：
 * 景别(英文缩写)，视角高度(角度范围)，角色朝向(角度范围)。
 * 人物位于画面具体位置，姿态动作描述，表情情绪描述，道具状态描述。
 * 前景是[具体元素描述]。
 * 中景是[主体及状态描述]。
 * 背景是[环境及延伸描述]。
 * [光源方向]照射，[光影效果描述]。
 */
export const IMAGE_PROMPT_FOUR_ELEMENTS = [
  {
    name: '技术参数',
    keywords: [
      // 景别（必须有英文缩写）
      'LS', 'MS', 'CU', 'MCU', 'ECU', 'ELS',
      '特写', '中景', '全景', '远景', '大特写', '近景',
      // 视角高度（必须有角度范围）
      '俯拍', '仰拍', '平视', '鸟瞰', '俯视', '仰视',
      '°', '度',
      // 角色朝向
      '正面', '侧面', '背面', '3/4', '正侧面'
    ],
    required: true,
    description: '景别(英文缩写)、视角高度(角度范围)、角色朝向(角度范围)'
  },
  {
    name: '主体描述',
    keywords: [
      '位于', '站在', '坐在', '蹲在', '画面',
      '人物', '角色', '晋安', '林溪', '他', '她',
      '姿态', '动作', '表情', '情绪',
      '穿着', '服装', '作战服', '长袍', '披风',
      '持', '握', '拿', '手', '双手',
      '紧张', '专注', '警惕', '坚定', '微笑', '皱眉'
    ],
    required: true,
    description: '人物位于画面具体位置，姿态动作描述，表情情绪描述，道具状态描述'
  },
  {
    name: '环境层次',
    keywords: [
      '前景是', '前景',
      '中景是', '中景',
      '背景是', '背景',
      '虚化', '失焦', '模糊'
    ],
    required: true,
    description: '前景是[具体元素描述]。中景是[主体及状态描述]。背景是[环境及延伸描述]'
  },
  {
    name: '光影描述',
    keywords: [
      '光', '照射', '照亮', '光影', '明暗',
      '侧光', '逆光', '顶光', '底光', '轮廓光',
      '戏剧性', '柔光', '强光', '弱光',
      '光源', '光芒', '光晕', '光斑',
      '阴影', '高对比', '对比'
    ],
    required: true,
    description: '[光源方向]照射，[光影效果描述]'
  }
] as const;

/**
 * 校验图片提示词是否包含四要素
 */
export function validateImagePromptFourElements(imagePrompt: string): {
  valid: boolean;
  missingElements: string[];
  suggestions: string[];
  completenessScore: number; // 0-100分
  forbiddenTermsFound: Array<{ term: string; category: string; suggestion: string }>;
} {
  if (!imagePrompt || imagePrompt.trim().length === 0) {
    return {
      valid: false,
      missingElements: IMAGE_PROMPT_FOUR_ELEMENTS.map(e => e.name),
      suggestions: ['图片提示词为空，请生成完整的图片提示词'],
      completenessScore: 0,
      forbiddenTermsFound: []
    };
  }

  const missingElements: string[] = [];
  const suggestions: string[] = [];
  let foundCount = 0;

  // 检查每个要素
  for (const element of IMAGE_PROMPT_FOUR_ELEMENTS) {
    const found = element.keywords.some(keyword => imagePrompt.includes(keyword));
    if (found) {
      foundCount++;
    } else if (element.required) {
      missingElements.push(element.name);
      suggestions.push(`缺少【${element.name}】：${element.description}，建议添加相关描述`);
    }
  }

  // 检查字数
  const length = imagePrompt.length;
  const recommended = PROMPT_LENGTH_LIMITS.IMAGE_PROMPT.recommended;

  if (length < PROMPT_LENGTH_LIMITS.IMAGE_PROMPT.min) {
    suggestions.push(`字数偏少：当前${length}字，建议${recommended.min}-${recommended.max}字（质量优先于字数）`);
  } else if (length > PROMPT_LENGTH_LIMITS.IMAGE_PROMPT.max) {
    suggestions.push(`字数过多：当前${length}字，建议${recommended.min}-${recommended.max}字（保持简洁精炼）`);
  } else if (length < recommended.min || length > recommended.max) {
    // 在合法范围内但不在推荐范围内，给出温和提示
    suggestions.push(`字数可优化：当前${length}字，推荐${recommended.min}-${recommended.max}字`);
  }

  // 检查违规词汇
  const forbiddenTermsFound = IMAGE_PROMPT_FORBIDDEN_TERMS.filter(ft => imagePrompt.includes(ft.term));
  if (forbiddenTermsFound.length > 0) {
    forbiddenTermsFound.forEach(ft => {
      suggestions.push(`⚠️ 发现违规词汇"${ft.term}"（${ft.category}），建议改为：${ft.suggestion}`);
    });
  }

  const completenessScore = Math.round((foundCount / IMAGE_PROMPT_FOUR_ELEMENTS.length) * 100);

  // 只有缺少必需要素或字数不足才算无效
  const valid = missingElements.length === 0 &&
                length >= PROMPT_LENGTH_LIMITS.IMAGE_PROMPT.min &&
                forbiddenTermsFound.length === 0;

  return {
    valid,
    missingElements,
    suggestions,
    completenessScore,
    forbiddenTermsFound
  };
}

/**
 * 🆕 智能修复图片提示词
 * 根据现有内容，自动补全缺失的要素
 */
export function autoFixImagePrompt(
  currentPrompt: string,
  shotSize?: string,
  angleHeight?: string,
  angleDirection?: string,
  characterName?: string
): string {
  // 如果已经是完整的提示词且字数足够，只做违规词替换
  const validation = validateImagePromptFourElements(currentPrompt);

  let fixed = currentPrompt;

  // 1. 替换违规词汇
  if (validation.forbiddenTermsFound.length > 0) {
    validation.forbiddenTermsFound.forEach(ft => {
      // 如果建议是"删除XXX"，则直接删除该词
      if (ft.suggestion.startsWith('删除')) {
        fixed = fixed.replace(new RegExp(ft.term, 'g'), '');
      } else {
        // 否则使用建议的第一个选项
        fixed = fixed.replace(new RegExp(ft.term, 'g'), ft.suggestion.split('/')[0]);
      }
    });
  }

  // 2. 如果字数足够且四要素完整，直接返回
  if (validation.valid && fixed.length >= PROMPT_LENGTH_LIMITS.IMAGE_PROMPT.min) {
    return fixed;
  }

  // 🆕 检测语言（避免在英文提示词中添加中文）
  const isChinese = /[\u4e00-\u9fa5]/.test(currentPrompt);

  // 🚨 方案1：禁用英文提示词的自动修复
  // 原因：英文提示词由AI生成，如果缺少要素说明生成有问题，应该重新生成而不是用模板修复
  if (!isChinese && fixed.length > 50) {
    console.warn('[autoFixImagePrompt] 英文提示词缺少要素，但不使用模板修复（避免污染）');
    console.warn('[autoFixImagePrompt] 缺失要素:', validation.missingElements);
    console.warn('[autoFixImagePrompt] 建议重新生成该镜头的提示词');
    return fixed; // 只返回替换违规词后的结果，不添加模板
  }

  // 3. 重新校验修复后的内容
  const revalidation = validateImagePromptFourElements(fixed);

  // 4. 补充缺失的要素
  const parts: string[] = [];

  // 保留原有内容（已替换违规词）
  if (fixed.trim()) {
    parts.push(fixed.trim());
  }

  // 🔧 修复：isChinese 已在上面定义，这里不需要重复定义

  // 补充技术参数（如果缺失）
  if (revalidation.missingElements.includes('技术参数')) {
    const techParams: string[] = [];

    // 景别
    if (shotSize) {
      techParams.push(shotSize);
    } else {
      techParams.push(isChinese ? 'MS' : 'medium shot');
    }

    // 角度 - 🆕 组合高度和朝向
    if (angleHeight || angleDirection) {
      const angleParts = [angleHeight, angleDirection].filter(Boolean);
      techParams.push(angleParts.join('，'));
    } else {
      // 如果没有传入角度，跳过而不是使用默认值
      console.warn('[autoFixImagePrompt] 缺少 angleHeight 和 angleDirection 参数，跳过角度补充');
    }

    if (techParams.length > 0) {
      if (isChinese) {
        parts.unshift(techParams.join('，') + '。');
      } else {
        parts.unshift(techParams.join(', '));
      }
    }
  }

  // 补充主体描述（如果缺失）
  if (revalidation.missingElements.includes('主体描述')) {
    // 🆕 区分中英文，避免在英文提示词中添加中文
    if (isChinese) {
      if (characterName) {
        parts.push(`${characterName}穿着黑色作战服，站在画面中央，表情专注警惕，双手自然下垂`);
      } else {
        parts.push('角色穿着服装，站在画面中央，表情专注，双手自然下垂');
      }
    } else {
      // 英文提示词使用英文模板
      if (characterName) {
        parts.push(`${characterName} wearing black combat suit, standing at center frame, focused and alert expression, hands naturally down`);
      } else {
        parts.push('character wearing outfit, standing at center frame, focused expression, hands naturally down');
      }
    }
  }

  // 补充环境层次（如果缺失）
  if (revalidation.missingElements.includes('环境层次')) {
    // 🆕 区分中英文
    if (isChinese) {
      parts.push('前景是虚化的物体边缘。中景是角色站立的轮廓。背景是昏暗的室内场景，墙壁上有裂纹，地面潮湿');
    } else {
      parts.push('Foreground: blurred object edges. Midground: character standing silhouette. Background: dim indoor scene with cracked walls and wet floor');
    }
  }

  // 补充光影描述（如果缺失）
  if (revalidation.missingElements.includes('光影描述')) {
    // 🆕 区分中英文
    if (isChinese) {
      parts.push('侧光从左侧照射，在面部形成明暗对比');
    } else {
      parts.push('side lighting from left creating contrast on face');
    }
  }

  // 5. 拼接结果（不再强制补充字数，质量优先于字数）
  let result = parts.join('，');

  return result;
}

