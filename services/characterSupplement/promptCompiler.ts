/**
 * PromptCompiler：将结构化配置（AppearanceConfig + CostumeConfig）
 * 确定性地编译为英文生图 Prompt，无需额外 LLM 调用。
 * 支持 Baseline + Delta 深合并逻辑（多形态一致性）。
 */

import type { AppearanceConfig, CostumeConfig, CostumeLayer } from './types';

// ─── 接口定义 ───────────────────────────────────────────────────────────────

export interface PromptCompilerInput {
  /** 基础外貌配置（来自 Stage3） */
  appearanceConfig: AppearanceConfig;
  /** 基础服装配置（来自 Stage4） */
  costumeConfig: CostumeConfig;
  /** 角色性别，如 "男" | "女" */
  gender: string;
  /** 时代背景，如 "中国90年代" */
  era: string;
  /** 具体年龄，如 22 */
  ageValue?: number;
  /** 可选：形态级别的外貌覆盖（Delta） */
  deltaAppearance?: Partial<AppearanceConfig>;
  /** 可选：形态级别的服装覆盖（Delta） */
  deltaCostume?: Partial<CostumeConfig>;
  /** 渲染风格，来自 UI 手选或项目默认，如 "photorealistic" | "oil_painting" */
  stylePreset?: string;
}

export interface PromptCompilerOutput {
  positivePrompt: string;
  negativePrompt: string;
  /** 编译所用渲染风格 key */
  styleUsed: string;
  /** 是否成功使用结构化配置（false 时说明降级） */
  compiledFromConfig: boolean;
}

// ─── 映射表 ─────────────────────────────────────────────────────────────────

type Mapping = [string, string][];

const FACE_SHAPES: Mapping = [
  ['鹅蛋脸', 'oval face'], ['瓜子脸', 'heart-shaped face'],
  ['方下颌', 'square jaw'], ['方脸', 'square face'],
  ['圆脸', 'round face'], ['菱形脸', 'diamond-shaped face'], ['长脸', 'long face'],
];

const EYES: Mapping = [
  ['桃花眼', 'alluring peach-blossom eyes'], ['凤眼', 'upturned phoenix eyes'],
  ['丹凤眼', 'phoenix eyes'], ['杏眼', 'almond-shaped eyes'],
  ['圆眼', 'large round eyes'], ['细长', 'narrow elongated eyes'],
  ['清澈', 'clear and bright eyes'], ['深邃', 'deep-set and soulful eyes'],
  ['明亮', 'bright eyes'], ['温柔', 'gentle eyes'],
];

const SKIN: Mapping = [
  ['白皙细腻', 'fair and delicate skin'], ['白皙', 'fair skin'],
  ['细腻', 'smooth skin'], ['红润', 'rosy complexion'],
  ['健康小麦', 'warm tan skin'], ['小麦色', 'warm tan skin'],
  ['黝黑', 'dark skin'], ['苍白', 'pale skin'], ['温润', 'warm smooth skin'],
];

const HAIR_STYLES: Mapping = [
  ['齐耳短发', 'ear-length bob'], ['齐肩短发', 'shoulder-length bob'],
  ['长发', 'long hair'], ['短发', 'short hair'],
  ['盘发', 'elegant updo'], ['半盘发', 'half-up style'],
  ['马尾', 'ponytail'], ['麻花辫', 'braids'], ['辫子', 'braided hair'],
  ['卷发', 'curly hair'], ['直发', 'straight hair'],
];

const HAIR_TEXTURES: Mapping = [
  ['顺滑', 'silky smooth'], ['柔顺', 'soft and flowing'],
  ['光泽', 'lustrous'], ['飘逸', 'flowing'], ['粗', 'coarse but resilient'],
];

const BODY_TYPES: Mapping = [
  ['纤细', 'slender'], ['苗条', 'slim'], ['匀称', 'well-proportioned'],
  ['微胖', 'slightly plump'], ['强壮', 'athletic and strong'], ['丰腴', 'curvaceous'],
];

const MATERIALS: Mapping = [
  ['丝绒', 'velvet'], ['真丝', 'pure silk'], ['丝绸', 'silk'],
  ['羊毛', 'wool'], ['毛呢', 'woolen cloth'],
  ['雪纺', 'chiffon'], ['蕾丝', 'lace'],
  ['棉布', 'cotton cloth'], ['棉', 'cotton'],
  ['麻布', 'linen'], ['亚麻', 'linen'], ['粗布', 'coarse cotton'],
  ['皮革', 'leather'], ['人造革', 'faux leather'],
  ['针织', 'knitted'], ['毛线', 'woolen knit'],
];

const COLORS: Mapping = [
  ['米白', 'off-white'], ['象牙白', 'ivory'], ['白', 'white'],
  ['酒红', 'burgundy'], ['深红', 'dark red'], ['大红', 'vivid red'], ['红', 'red'],
  ['靛蓝', 'indigo'], ['深蓝', 'deep navy'], ['藏蓝', 'dark navy'], ['天蓝', 'sky blue'], ['蓝', 'blue'],
  ['墨绿', 'dark forest green'], ['深绿', 'dark green'], ['绿', 'green'],
  ['鹅黄', 'pale yellow'], ['黄', 'yellow'],
  ['深灰', 'dark gray'], ['浅灰', 'light gray'], ['灰', 'gray'],
  ['黑', 'black'], ['棕', 'brown'], ['咖啡', 'coffee brown'],
  ['淡粉', 'light pink'], ['粉', 'pink'], ['紫', 'purple'], ['橙', 'orange'],
];

const CUTS: Mapping = [
  ['收腰', 'waist-fitted'], ['宽松', 'loose-fitting'], ['修身', 'slim-fit'],
  ['直筒', 'straight-cut'], ['A字', 'A-line'], ['喇叭', 'flared'],
  ['对襟', 'front-opening'], ['斜襟', 'diagonal-collar'],
];

const WORN_STATES: Mapping = [
  ['全新', 'pristine'], ['九成新', 'nearly new'], ['略旧', 'slightly worn'],
  ['陈旧', 'worn and faded'], ['破损', 'torn and tattered'], ['破旧', 'worn and ragged'],
];

const STYLE_PRESETS: Record<string, { tech: string; suffix: string }> = {
  photorealistic: { tech: 'film still, photorealistic', suffix: 'soft natural lighting, shallow depth of field, 8k ultra-detailed' },
  oil_painting: { tech: 'oil painting style, detailed brushwork', suffix: 'classical warm lighting, rich textures, fine art' },
  watercolor: { tech: 'watercolor illustration', suffix: 'soft washes, delicate linework, artistic' },
  anime: { tech: 'anime style, cel shading', suffix: 'clean linework, vibrant colors, detailed' },
  traditional_chinese: { tech: 'traditional Chinese ink painting, gongbi brushwork', suffix: 'elegant lines, subtle wash, classical aesthetic' },
};

const DEFAULT_NEGATIVE = [
  'lowres, bad anatomy, bad hands, text, error, missing fingers',
  'extra digit, fewer digits, cropped, worst quality, low quality',
  'normal quality, jpeg artifacts, signature, watermark, username, blurry',
  'deformed, disfigured, extra limbs, cloned face, gross proportions',
].join(', ');

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/** 在文本中查找第一个匹配项并返回英文翻译 */
function matchFirst(text: string, map: Mapping): string {
  for (const [zh, en] of map) {
    if (text.includes(zh)) return en;
  }
  return '';
}

/** 在文本中收集所有匹配项（去重） */
function matchAll(text: string, map: Mapping): string[] {
  const results: string[] = [];
  for (const [zh, en] of map) {
    if (text.includes(zh) && !results.includes(en)) results.push(en);
  }
  return results;
}

/** 从 "X头身" 格式提取比例描述 */
function compileProportion(proportion: string): string {
  const m = proportion.match(/(\d+(?:\.\d+)?)/);
  return m ? `${m[1]}-head-tall proportions` : '';
}

// ─── 编译函数 ────────────────────────────────────────────────────────────────

/** 将 AppearanceConfig 编译为英文外貌描述片段 */
function compileAppearance(config: AppearanceConfig, gender: string): string {
  const parts: string[] = [];

  // 脸型
  const face = matchFirst(config.faceShape, FACE_SHAPES);
  if (face) parts.push(face);

  // 眼睛
  const eyes = matchAll(config.eyes, EYES);
  if (eyes.length) parts.push(eyes.join(', '));

  // 肤色
  const skin = matchFirst(config.skin, SKIN);
  if (skin) parts.push(skin);

  // 发型（颜色 + 样式 + 质感 + 发饰）
  const hairStyle = matchFirst(config.hair.style, HAIR_STYLES);
  const hairColors = matchAll(config.hair.texture + ' ' + config.hair.style, COLORS);
  const hairTex = matchFirst(config.hair.texture, HAIR_TEXTURES);
  const hairParts: string[] = [];
  if (hairColors.length) hairParts.push(hairColors[0]);
  if (hairStyle) hairParts.push(hairStyle);
  if (hairTex) hairParts.push(hairTex);
  if (config.hair.accessories) {
    if (config.hair.accessories.includes('簪')) hairParts.push('with hair pin');
    else if (config.hair.accessories.includes('发带')) hairParts.push('with hair ribbon');
    else if (config.hair.accessories.includes('发卡')) hairParts.push('with hair clip');
  }
  if (hairParts.length) parts.push(hairParts.join(' ') + ' hair');

  // 体型
  const bodyType = matchFirst(config.body.bodyType, BODY_TYPES);
  const proportion = compileProportion(config.body.proportion);
  if (bodyType) parts.push(bodyType + ' figure');
  if (proportion) parts.push(proportion);

  // 记忆点（最多2个）
  if (config.uniqueMarks?.length) {
    parts.push(...config.uniqueMarks.slice(0, 2));
  }

  return parts.filter(Boolean).join(', ');
}

/** 将单层服装（CostumeLayer）编译为英文短语 */
function compileLayer(layer: CostumeLayer, context: string): string {
  const parts: string[] = [];
  const colors = matchAll(layer.color, COLORS);
  const mat = matchFirst(layer.material, MATERIALS);
  const cut = matchFirst(layer.cut, CUTS);
  const worn = layer.wornState ? matchFirst(layer.wornState, WORN_STATES) : '';

  if (colors.length) parts.push(colors[0]);
  if (mat) parts.push(mat);
  if (cut) parts.push(cut);
  parts.push(context);
  if (layer.pattern && !layer.pattern.includes('素色')) {
    parts.push(`with ${layer.pattern} pattern`);
  }
  if (layer.details) parts.push(`with ${layer.details}`);
  if (worn && worn !== 'pristine') parts.push(`(${worn})`);

  return parts.filter(Boolean).join(' ');
}

/** 将 CostumeConfig 编译为英文服装描述片段 */
function compileCostume(config: CostumeConfig): string {
  const layers: string[] = [];

  if (config.inner) layers.push(compileLayer(config.inner, 'inner layer'));
  layers.push(compileLayer(config.middle, 'top'));
  if (config.outer) layers.push(compileLayer(config.outer, 'outerwear'));
  layers.push(compileLayer(config.bottom, 'bottom'));
  layers.push(compileLayer(config.shoes, 'footwear'));

  if (config.accessories) {
    const { jewelry, belt, bag, props } = config.accessories;
    if (jewelry) layers.push(jewelry);
    if (belt) layers.push(belt);
    if (bag) layers.push(bag);
    if (props) layers.push(props);
  }

  return 'wearing ' + layers.filter(Boolean).join(', ');
}

// ─── 核心函数 ────────────────────────────────────────────────────────────────

/**
 * 深合并 Baseline + Delta（Partial 覆盖）。
 * 嵌套对象（hair / body / accessories）使用浅合并，保证脸型/人种等基础特征不被破坏。
 */
export function mergeConfig<T extends object>(baseline: T, delta: Partial<T>): T {
  const result = { ...baseline };
  for (const key in delta) {
    if (delta[key] !== undefined) {
      const v = delta[key] as any;
      const b = (baseline as any)[key];
      if (v && b && typeof v === 'object' && !Array.isArray(v)) {
        (result as any)[key] = { ...b, ...v };
      } else {
        (result as any)[key] = v;
      }
    }
  }
  return result;
}

/** 解析渲染风格（支持中英文关键词） */
function resolveStyle(preset?: string): { key: string; style: { tech: string; suffix: string } } {
  if (!preset) return { key: 'photorealistic', style: STYLE_PRESETS.photorealistic };
  const lower = preset.toLowerCase();
  if (lower.includes('油画') || lower.includes('oil')) return { key: 'oil_painting', style: STYLE_PRESETS.oil_painting };
  if (lower.includes('水彩') || lower.includes('water')) return { key: 'watercolor', style: STYLE_PRESETS.watercolor };
  if (lower.includes('动漫') || lower.includes('anime')) return { key: 'anime', style: STYLE_PRESETS.anime };
  if (lower.includes('国风') || lower.includes('chinese')) return { key: 'traditional_chinese', style: STYLE_PRESETS.traditional_chinese };
  return { key: 'photorealistic', style: STYLE_PRESETS.photorealistic };
}

/**
 * 主编译函数：将结构化配置 → 高质量英文生图 Prompt。
 *
 * 编译顺序：
 *   1. Baseline + Delta 合并
 *   2. 基础信息（性别 / 年龄 / 时代）
 *   3. 外貌描述（脸型 / 眼 / 肤 / 发 / 体型）
 *   4. 服装描述（各层 + 配饰）
 *   5. 渲染风格词组
 */
export function compilePrompt(input: PromptCompilerInput): PromptCompilerOutput {
  const { appearanceConfig, costumeConfig, gender, era, ageValue, deltaAppearance, deltaCostume, stylePreset } = input;

  // Baseline + Delta 合并
  const appearance = deltaAppearance ? mergeConfig(appearanceConfig, deltaAppearance) : appearanceConfig;
  const costume = deltaCostume ? mergeConfig(costumeConfig, deltaCostume) : costumeConfig;

  const { key: styleKey, style } = resolveStyle(stylePreset);

  // 基础信息（确定性翻译）
  const genderEn = gender === '女' ? '1girl, Chinese young woman' : '1boy, Chinese young man';
  const ageEn = ageValue ? `${ageValue} years old` : '';
  const eraEn = era
    .replace(/中国/g, 'China')
    .replace(/(\d+)世纪/g, '$1th century')
    .replace(/(\d+)年代/g, '$1s')
    .replace(/现代|当代/g, 'contemporary')
    .replace(/古代/g, 'ancient China');

  const basicInfo = [genderEn, ageEn, eraEn].filter(Boolean).join(', ');
  const appearancePart = compileAppearance(appearance, gender);
  const costumePart = compileCostume(costume);

  const positivePrompt = [basicInfo, appearancePart, costumePart, style.tech, style.suffix]
    .filter(Boolean)
    .join(',\n');

  return {
    positivePrompt,
    negativePrompt: DEFAULT_NEGATIVE,
    styleUsed: styleKey,
    compiledFromConfig: true,
  };
}

