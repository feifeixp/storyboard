/**
 * 动态加载外貌参考资料
 *
 * 根据 {era, beautyLevel, gender} 三层继承架构精准组合外貌词汇
 * 调用方：Stage3（外貌描述创作）
 * 注意：本库只返回外貌词汇（发型/五官/妆容等），不包含服装数据
 */

import appearanceData from './appearance-reference.json';
import type {
  AppearanceQueryParams,
  AppearanceReferenceData,
  AppearanceUniversalData,
  AppearanceEraDefaults,
  AppearanceBeautyData,
  EraAppearanceData,
  GenderSpecificAppearanceData,
} from './appearance-reference.types';

// ═══════════════════════════════════════════
// 时期映射表（与 getCostumeReference 保持一致）
// ═══════════════════════════════════════════
const ERA_MAPPING: Record<string, string> = {
  // 现代（2000年代至今）
  '现代': '现代', '当代': '现代', '都市': '现代', '21世纪': '现代',
  '2000': '现代', '2001': '现代', '2002': '现代', '2003': '现代',
  '2004': '现代', '2005': '现代', '2006': '现代', '2007': '现代',
  '2008': '现代', '2009': '现代', '2010': '现代', '2011': '现代',
  '2012': '现代', '2013': '现代', '2014': '现代', '2015': '现代',
  '2016': '现代', '2017': '现代', '2018': '现代', '2019': '现代',
  '2020': '现代', '2021': '现代', '2022': '现代', '2023': '现代',
  '2024': '现代', '2025': '现代', '2026': '现代',

  // 90年代
  '90年代': '90年代', '1990年代': '90年代', '九十年代': '90年代',
  '1990': '90年代', '1991': '90年代', '1992': '90年代', '1993': '90年代',
  '1994': '90年代', '1995': '90年代', '1996': '90年代', '1997': '90年代',
  '1998': '90年代', '1999': '90年代',

  // 80年代
  '80年代': '80年代', '1980年代': '80年代', '八十年代': '80年代',
  '1980': '80年代', '1981': '80年代', '1982': '80年代', '1983': '80年代',
  '1984': '80年代', '1985': '80年代', '1986': '80年代', '1987': '80年代',
  '1988': '80年代', '1989': '80年代',

  // 民国
  '民国': '民国', '民国时期': '民国',
  '1912': '民国', '1913': '民国', '1914': '民国', '1915': '民国',
  '1916': '民国', '1917': '民国', '1918': '民国', '1919': '民国',
  '1920': '民国', '1921': '民国', '1922': '民国', '1923': '民国',
  '1924': '民国', '1925': '民国', '1926': '民国', '1927': '民国',
  '1928': '民国', '1929': '民国', '1930': '民国', '1931': '民国',
  '1932': '民国', '1933': '民国', '1934': '民国', '1935': '民国',
  '1936': '民国', '1937': '民国', '1938': '民国', '1939': '民国',
  '1940': '民国', '1941': '民国', '1942': '民国', '1943': '民国',
  '1944': '民国', '1945': '民国', '1946': '民国', '1947': '民国',
  '1948': '民国', '1949': '民国',

  // 古代
  '古代': '古代', '古装': '古代', '古风': '古代',
  '秦朝': '古代', '汉朝': '古代', '唐朝': '古代', '宋朝': '古代',
  '元朝': '古代', '明朝': '古代', '清朝': '古代', '古代中国': '古代',
  '武侠': '古代', '架空': '古代',

  // 玄幻修仙
  '玄幻修仙': '玄幻修仙', '修仙': '玄幻修仙', '玄幻': '玄幻修仙',
  '修真': '玄幻修仙', '仙侠': '玄幻修仙', '架空玄幻': '玄幻修仙',
  '架空修仙': '玄幻修仙',
};

/** 美型等级映射：beautyLevel → JSON key */
const BEAUTY_LEVEL_MAP: Record<string, string> = {
  idealized: '极致美型',
  balanced: '平衡',
  realistic: '真实',
};

// ═══════════════════════════════════════════
// 内部辅助函数
// ═══════════════════════════════════════════

/** 规范化时期名称（精确 + 模糊 + 年份智能匹配） */
function normalizeEra(era: string): string {
  if (ERA_MAPPING[era]) return ERA_MAPPING[era];

  for (const [key, value] of Object.entries(ERA_MAPPING)) {
    if (era.includes(key)) {
      console.log(`[getAppearanceReference] 模糊匹配: "${era}" → "${value}"`);
      return value;
    }
  }

  if (era.includes('玄幻') || era.includes('修仙') || era.includes('修真') || era.includes('仙侠')) return '玄幻修仙';
  if (era.includes('架空') || era.includes('武侠') || era.includes('古风')) return '古代';
  if (era.includes('民国')) return '民国';
  if (era.includes('现代') || era.includes('当代') || era.includes('都市')) return '现代';

  const yearMatch = era.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    if (year >= 2000) return '现代';
    if (year >= 1990) return '90年代';
    if (year >= 1980) return '80年代';
    if (year >= 1912) return '民国';
    if (year < 1912) return '古代';
  }

  console.log(`[getAppearanceReference] ⚠️ 无法匹配时期: "${era}"，返回原值`);
  return era;
}

/** 从 GenderSpecificAppearanceData 中按性别提取字符串列表 */
function pickByGender(data: GenderSpecificAppearanceData | undefined, genderKey?: string): string[] {
  if (!data) return [];
  const result: string[] = [];
  if (genderKey && data[genderKey as keyof GenderSpecificAppearanceData]) {
    result.push(...(data[genderKey as keyof GenderSpecificAppearanceData] as string[]));
  }
  if (data.通用) result.push(...data.通用);
  if (!genderKey) {
    if (data.女性) result.push(...data.女性);
    if (data.男性) result.push(...data.男性);
  }
  return result;
}

/** 获取 _universal 层 */
function getUniversalData(): AppearanceUniversalData | null {
  try {
    return (appearanceData as unknown as AppearanceReferenceData)._universal || null;
  } catch { return null; }
}

/** 获取 _era_defaults 层 */
function getEraDefaults(normalizedEra: string): AppearanceEraDefaults | null {
  try {
    const eraData = (appearanceData as unknown as AppearanceReferenceData)[normalizedEra] as EraAppearanceData;
    return eraData?._era_defaults || null;
  } catch { return null; }
}

/** 获取 beautyLevel 节点（delta 层） */
function getBeautyData(normalizedEra: string, beautyLevelKey: string): AppearanceBeautyData | null {
  try {
    const eraData = (appearanceData as unknown as AppearanceReferenceData)[normalizedEra] as EraAppearanceData;
    return (eraData?.[beautyLevelKey as keyof EraAppearanceData] as AppearanceBeautyData) || null;
  } catch { return null; }
}

// ═══════════════════════════════════════════
// 格式化输出
// ═══════════════════════════════════════════

/**
 * 格式化三层合并后的外貌参考为 LLM 可理解文本
 * 调用方：Stage3 prompt 构建
 */
function formatAppearanceForLLM(
  universal: AppearanceUniversalData | null,
  eraDefaults: AppearanceEraDefaults | null,
  beautyData: AppearanceBeautyData | null,
  params: AppearanceQueryParams,
  normalizedEra: string,
): string {
  const genderKey = params.gender === '男' ? '男性' : params.gender === '女' ? '女性' : undefined;

  // 发型：beautyLevel 精选 > era_defaults 推荐
  const hairstyleSource = beautyData?.发型_精选 || eraDefaults?.发型_推荐;
  const hairstyles = pickByGender(hairstyleSource, genderKey);

  // 妆容风格：beautyLevel 精选 > era_defaults 通用
  const makeupStyles = beautyData?.妆容_精选 || eraDefaults?.妆容_风格 || [];

  // 通用词汇（_universal）
  const faceShapes = universal?.脸型_词汇 || [];
  const eyeTypes = pickByGender(universal?.眼型_词汇, genderKey);
  const noseTypes = universal?.鼻型_词汇 || [];
  const lipTypes = universal?.唇型_词汇 || [];
  const skinTones = universal?.肤色_词汇 || [];
  const bodyPostures = pickByGender(universal?.体态_词汇, genderKey);
  const hairTextures = universal?.发质_词汇 || [];
  const temperaments = pickByGender(universal?.气质_词汇, genderKey);
  const faceEmphasis = beautyData?.面部_强调 || [];

  const beautyLevelChinese = BEAUTY_LEVEL_MAP[params.beautyLevel || ''] || params.beautyLevel || '平衡';

  return `
## 外貌参考词汇 | ${normalizedEra} · ${beautyLevelChinese}美型

**时代**：${normalizedEra}
**美型等级**：${beautyLevelChinese}
${params.gender ? `**角色性别**：${params.gender}` : ''}
${eraDefaults?.美学_方向 ? `**时代美学方向**：${eraDefaults.美学_方向}` : ''}
${eraDefaults?.肤色_审美 ? `**时代肤色审美**：${eraDefaults.肤色_审美}` : ''}

### 💇 发型词汇（${beautyData?.发型_精选 ? '美型等级精选' : '时代推荐'}）
${hairstyles.length > 0 ? hairstyles.join('、') : '参考时代常识设计'}

### 💄 妆容风格（${beautyData?.妆容_精选 ? '美型等级精选' : '时代通用'}）
${makeupStyles.length > 0 ? makeupStyles.join('、') : '参考时代常识设计'}

### 👤 面部特征词汇（跨时代通用）
**脸型**：${faceShapes.join('、')}
**眼型**：${eyeTypes.join('、')}
**鼻型**：${noseTypes.join('、')}
**唇型**：${lipTypes.join('、')}
**肤色**：${skinTones.join('、')}
**发质**：${hairTextures.join('、')}

### 🌟 体态与气质词汇（跨时代通用）
**体态**：${bodyPostures.join('、')}
**气质**：${temperaments.join('、')}

${faceEmphasis.length > 0 ? `### ✨ 面部强调点（${beautyLevelChinese}美型专属）\n${faceEmphasis.join('、')}` : ''}
${beautyData?.设计指导 ? `\n### 📐 设计指导（${beautyLevelChinese}美型）\n${beautyData.设计指导}` : ''}
${eraDefaults?.设计指导 ? `\n### 📝 时代设计指导\n${eraDefaults.设计指导}` : ''}
${eraDefaults?.禁止事项 ? `\n⚠️ **禁止事项（防穿越）**：${eraDefaults.禁止事项}` : ''}
`.trim();
}

// ═══════════════════════════════════════════
// 主导出函数
// ═══════════════════════════════════════════

/**
 * 获取外貌参考资料（三层合并）
 *
 * @param params - { era, beautyLevel, gender }
 * @returns 格式化后的外貌参考文本，供直接注入 Stage3 prompt
 *
 * @example
 * const ref = getAppearanceReference({ era: '90年代女频言情重生剧', beautyLevel: 'idealized', gender: '女' });
 */
export function getAppearanceReference(params: AppearanceQueryParams): string {
  const { era, beautyLevel = 'balanced', gender } = params;

  console.log('[getAppearanceReference] 查询参数:', params);

  const normalizedEra = normalizeEra(era);
  const beautyLevelKey = BEAUTY_LEVEL_MAP[beautyLevel] || '平衡';

  console.log('[getAppearanceReference] 规范化时期:', normalizedEra, '| 美型等级:', beautyLevelKey);

  const universal = getUniversalData();
  const eraDefaults = getEraDefaults(normalizedEra);
  const beautyData = getBeautyData(normalizedEra, beautyLevelKey);

  if (!eraDefaults) {
    console.log(`[getAppearanceReference] ⚠️ 未找到时期"${normalizedEra}"的外貌数据，降级到通用词汇`);
    // 降级：只用 _universal
    return formatAppearanceForLLM(universal, null, null, params, normalizedEra);
  }

  return formatAppearanceForLLM(universal, eraDefaults, beautyData, params, normalizedEra);
}

/**
 * 仅获取 _universal 通用外貌词汇（不依赖时期）
 */
export function getUniversalAppearanceData(): AppearanceUniversalData | null {
  return getUniversalData();
}

/**
 * 仅获取指定时期的外貌特征（不含 beautyLevel 专属数据）
 */
export function getEraAppearanceDefaults(era: string): AppearanceEraDefaults | null {
  const normalizedEra = normalizeEra(era);
  return getEraDefaults(normalizedEra);
}

