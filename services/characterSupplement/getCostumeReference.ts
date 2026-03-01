/**
 * 动态加载服装参考资料
 * 
 * 根据查询参数精准定位到对应的参考资料，减少token消耗
 */

import costumeData from './costume-reference.json';
import type { CostumeQueryParams, SeasonData, CostumeReferenceData, UniversalData, EraDefaults } from './costume-reference.types';

/**
 * 时期映射表（支持模糊匹配）
 */
const ERA_MAPPING: Record<string, string> = {
  // 现代（2000年代至今）
  '现代': '现代',
  '2000': '现代',
  '2001': '现代',
  '2002': '现代',
  '2003': '现代',
  '2004': '现代',
  '2005': '现代',
  '2006': '现代',
  '2007': '现代',
  '2008': '现代',
  '2009': '现代',
  '2010': '现代',
  '2011': '现代',
  '2012': '现代',
  '2013': '现代',
  '2014': '现代',
  '2015': '现代',
  '2016': '现代',
  '2017': '现代',
  '2018': '现代',
  '2019': '现代',
  '2020': '现代',
  '2021': '现代',
  '2022': '现代',
  '2023': '现代',
  '2024': '现代',
  '2025': '现代',
  '2026': '现代',
  '21世纪': '现代',
  '当代': '现代',

  // 90年代
  '90年代': '90年代',
  '1990年代': '90年代',
  '九十年代': '90年代',
  '1990': '90年代',
  '1991': '90年代',
  '1992': '90年代',
  '1993': '90年代',
  '1994': '90年代',
  '1995': '90年代',
  '1996': '90年代',
  '1997': '90年代',
  '1998': '90年代',
  '1999': '90年代',

  // 80年代
  '80年代': '80年代',
  '1980年代': '80年代',
  '八十年代': '80年代',
  '1980': '80年代',
  '1981': '80年代',
  '1982': '80年代',
  '1983': '80年代',
  '1984': '80年代',
  '1985': '80年代',
  '1986': '80年代',
  '1987': '80年代',
  '1988': '80年代',
  '1989': '80年代',

  // 民国
  '民国': '民国',
  '民国时期': '民国',
  'Republic of China': '民国',
  '1912': '民国',
  '1913': '民国',
  '1914': '民国',
  '1915': '民国',
  '1916': '民国',
  '1917': '民国',
  '1918': '民国',
  '1919': '民国',
  '1920': '民国',
  '1921': '民国',
  '1922': '民国',
  '1923': '民国',
  '1924': '民国',
  '1925': '民国',
  '1926': '民国',
  '1927': '民国',
  '1928': '民国',
  '1929': '民国',
  '1930': '民国',
  '1931': '民国',
  '1932': '民国',
  '1933': '民国',
  '1934': '民国',
  '1935': '民国',
  '1936': '民国',
  '1937': '民国',
  '1938': '民国',
  '1939': '民国',
  '1940': '民国',
  '1941': '民国',
  '1942': '民国',
  '1943': '民国',
  '1944': '民国',
  '1945': '民国',
  '1946': '民国',
  '1947': '民国',
  '1948': '民国',
  '1949': '民国',

  // 古代
  '古代': '古代',
  '古装': '古代',
  '清朝': '古代',
  '明朝': '古代',
  '唐朝': '古代',
  '宋朝': '古代',
  '元朝': '古代',
  '汉朝': '古代',
  '秦朝': '古代',
  '古代中国': '古代',
  '古风': '古代',
  '武侠': '古代',

  // 玄幻修仙（独立时期）
  '玄幻修仙': '玄幻修仙',
  '修仙': '玄幻修仙',
  '玄幻': '玄幻修仙',
  '修真': '玄幻修仙',
  '仙侠': '玄幻修仙',
  '架空玄幻': '玄幻修仙',
  '架空修仙': '玄幻修仙',
  '架空玄幻修仙': '玄幻修仙',
  '修仙世界': '玄幻修仙',
  '玄幻世界': '玄幻修仙',
  '修真世界': '玄幻修仙',
  '玄幻修仙时代': '玄幻修仙',
  '修仙时代': '玄幻修仙',
  '玄幻时代': '玄幻修仙',

  // 架空（映射到古代）
  '架空': '古代',
};

/**
 * 规范化时期名称（支持模糊匹配和智能匹配）
 */
function normalizeEra(era: string): string {
  // 1. 精确匹配
  if (ERA_MAPPING[era]) {
    return ERA_MAPPING[era];
  }

  // 2. 模糊匹配：检查是否包含映射表中的关键词
  for (const [key, value] of Object.entries(ERA_MAPPING)) {
    if (era.includes(key)) {
      console.log(`[getCostumeReference] 模糊匹配: "${era}" → "${value}"`);
      return value;
    }
  }

  // 3. 关键词智能匹配
  // 玄幻/修仙 → 玄幻修仙
  if (
    era.includes('玄幻') ||
    era.includes('修仙') ||
    era.includes('修真') ||
    era.includes('仙侠')
  ) {
    console.log(`[getCostumeReference] 关键词智能匹配: "${era}" → "玄幻修仙"`);
    return '玄幻修仙';
  }

  // 架空/武侠/古风 → 古代
  if (
    era.includes('架空') ||
    era.includes('武侠') ||
    era.includes('古风')
  ) {
    console.log(`[getCostumeReference] 关键词智能匹配: "${era}" → "古代"`);
    return '古代';
  }

  // 民国相关
  if (era.includes('民国')) {
    console.log(`[getCostumeReference] 关键词智能匹配: "${era}" → "民国"`);
    return '民国';
  }

  // 现代相关
  if (
    era.includes('现代') ||
    era.includes('当代') ||
    era.includes('都市') ||
    era.includes('21世纪')
  ) {
    console.log(`[getCostumeReference] 关键词智能匹配: "${era}" → "现代"`);
    return '现代';
  }

  // 4. 年份智能匹配
  const yearMatch = era.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);

    if (year >= 2000 && year <= 2026) {
      console.log(`[getCostumeReference] 年份智能匹配: "${era}" (${year}) → "现代"`);
      return '现代';
    }

    if (year >= 1990 && year <= 1999) {
      console.log(`[getCostumeReference] 年份智能匹配: "${era}" (${year}) → "90年代"`);
      return '90年代';
    }

    if (year >= 1980 && year <= 1989) {
      console.log(`[getCostumeReference] 年份智能匹配: "${era}" (${year}) → "80年代"`);
      return '80年代';
    }

    if (year >= 1912 && year <= 1949) {
      console.log(`[getCostumeReference] 年份智能匹配: "${era}" (${year}) → "民国"`);
      return '民国';
    }

    if (year < 1912) {
      console.log(`[getCostumeReference] 年份智能匹配: "${era}" (${year}) → "古代"`);
      return '古代';
    }
  }

  // 5. 如果都没匹配到，返回原值
  console.log(`[getCostumeReference] ⚠️ 无法匹配时期: "${era}"，返回原值`);
  return era;
}

/**
 * 规范化场景名称（处理斜杠分隔的多个场景 + 关键词映射）
 */
function normalizeScene(scene?: string): string | undefined {
  if (!scene) return undefined;

  // 如果包含斜杠，取第一个场景
  let normalizedScene = scene;
  if (scene.includes('/')) {
    normalizedScene = scene.split('/')[0].trim();
    console.log(`[getCostumeReference] 场景包含斜杠，取第一个: "${scene}" → "${normalizedScene}"`);
  }

  // 🆕 关键词映射：将特定关键词映射到"特殊"场景
  const specialSceneKeywords = [
    '战斗', '厮杀', '血战', '打斗', '决斗', '比武', '格斗',
    '仪式', '大典', '祭祀', '典礼', '庆典', '婚礼', '葬礼',
    '追杀', '逃亡', '潜入', '刺杀', '暗杀',
    '修炼', '闭关', '炼丹', '炼器',
    '宴会', '舞会', '晚宴', '盛宴'
  ];

  for (const keyword of specialSceneKeywords) {
    if (normalizedScene.includes(keyword)) {
      console.log(`[getCostumeReference] 检测到特殊场景关键词"${keyword}"，映射到"特殊": "${normalizedScene}" → "特殊"`);
      return '特殊';
    }
  }

  return normalizedScene;
}

/**
 * 规范化风格名称（处理斜杠分隔的多个风格）
 */
function normalizeStyle(style?: string): string | undefined {
  if (!style) return undefined;

  // 如果风格包含斜杠，取第一个风格
  if (style.includes('/')) {
    const firstStyle = style.split('/')[0].trim();
    console.log(`[getCostumeReference] 风格包含斜杠，取第一个: "${style}" → "${firstStyle}"`);
    return firstStyle;
  }

  return style;
}

/**
 * 规范化季节名称（处理斜杠分隔的多个季节）
 */
function normalizeSeason(season?: string): string | undefined {
  if (!season) return undefined;

  // 如果季节包含斜杠，取第一个季节
  if (season.includes('/')) {
    const firstSeason = season.split('/')[0].trim();
    console.log(`[getCostumeReference] 季节包含斜杠，取第一个: "${season}" → "${firstSeason}"`);
    return firstSeason;
  }

  return season;
}

/**
 * 获取服装参考资料
 *
 * @param params 查询参数
 * @returns 格式化后的参考资料文本
 */
export function getCostumeReference(params: CostumeQueryParams): string {
  const { era, scene, style, season } = params;

  console.log('[getCostumeReference] 查询参数:', params);

  // 规范化时期名称
  const normalizedEra = normalizeEra(era);
  console.log('[getCostumeReference] 规范化后的时期:', normalizedEra);

  // 规范化场景名称
  const normalizedScene = normalizeScene(scene);
  console.log('[getCostumeReference] 规范化后的场景:', normalizedScene);

  // 规范化风格名称
  const normalizedStyle = normalizeStyle(style);
  if (normalizedStyle !== style) {
    console.log('[getCostumeReference] 规范化后的风格:', normalizedStyle);
  }

  // 规范化季节名称
  const normalizedSeason = normalizeSeason(season);
  if (normalizedSeason !== season) {
    console.log('[getCostumeReference] 规范化后的季节:', normalizedSeason);
  }

  // 尝试精确匹配（使用规范化后的值）
  const exactData = getExactMatch(normalizedEra, normalizedScene, normalizedStyle, normalizedSeason);
  if (exactData) {
    console.log('[getCostumeReference] ✅ 精确匹配成功');
    // 根据格式路由：新格式（delta）走三层合并，旧格式走原格式化函数
    return isDeltaFormat(exactData)
      ? formatMergedForLLM(exactData, params)
      : formatForLLM(exactData, params);
  }

  // 降级策略：逐步放宽条件（使用规范化后的值）
  const fallbackData = getFallbackMatch(normalizedEra, normalizedScene, normalizedStyle, normalizedSeason);
  if (fallbackData) {
    console.log('[getCostumeReference] ⚠️ 使用降级策略');
    return isDeltaFormat(fallbackData)
      ? formatMergedForLLM(fallbackData, params)
      : formatForLLM(fallbackData, params);
  }

  // 如果完全找不到，返回通用提示
  console.log('[getCostumeReference] ❌ 未找到参考资料');
  return `未找到"${era}"的参考资料，请使用常识进行设计。`;
}

/**
 * 精确匹配
 */
function getExactMatch(
  era: string,
  scene?: string,
  style?: string,
  season?: string
): SeasonData | null {
  try {
    const data = costumeData as CostumeReferenceData;
    // 使用类型断言确保访问 场景 属性（_universal 键不会被传入 era 参数）
    const eraData = data[era] as import('./costume-reference.types').EraData;

    if (!eraData?.场景) return null;
    if (!scene) return null;
    if (!eraData.场景[scene]) return null;
    if (!style) return null;
    if (!eraData.场景[scene].风格[style]) return null;
    if (!season) return null;

    const seasonData = eraData.场景[scene].风格[style].季节[season];
    if (seasonData) return seasonData;

    // 尝试"通用"季节
    return eraData.场景[scene].风格[style].季节["通用"] || null;
  } catch (error) {
    return null;
  }
}

/**
 * 降级匹配策略
 */
function getFallbackMatch(
  era: string,
  scene?: string,
  style?: string,
  season?: string
): SeasonData | null {
  const data = costumeData as CostumeReferenceData;
  // 使用类型断言确保访问 场景 属性（_universal 键不会被传入 era 参数）
  const eraData = data[era] as import('./costume-reference.types').EraData;

  if (!eraData?.场景) {
    console.log('[getFallbackMatch] 时期不存在:', era);
    return null;
  }

  // 策略1: 忽略季节，使用"通用"
  if (scene && style && eraData.场景[scene]) {
    try {
      const generalSeason = eraData.场景[scene]?.风格[style]?.季节["通用"];
      if (generalSeason) {
        console.log('[getFallbackMatch] ✅ 策略1成功: 忽略季节，使用"通用"');
        return generalSeason;
      }
    } catch (error) {
      console.log('[getFallbackMatch] 策略1失败');
    }
  }

  // 🆕 策略2: 优先尝试"特殊"场景（保持原风格和季节）
  if (style && season && eraData.场景["特殊"]) {
    try {
      const specialScene = eraData.场景["特殊"]?.风格[style]?.季节[season];
      if (specialScene) {
        console.log('[getFallbackMatch] ✅ 策略2成功: 使用"特殊"场景（保持原风格和季节）');
        return specialScene;
      }
    } catch (error) {
      console.log('[getFallbackMatch] 策略2失败');
    }
  }

  // 🆕 策略2.5: 尝试"特殊"场景 + 通用季节
  if (style && eraData.场景["特殊"]) {
    try {
      const specialSceneGeneral = eraData.场景["特殊"]?.风格[style]?.季节["通用"];
      if (specialSceneGeneral) {
        console.log('[getFallbackMatch] ✅ 策略2.5成功: 使用"特殊"场景 + 通用季节');
        return specialSceneGeneral;
      }
    } catch (error) {
      console.log('[getFallbackMatch] 策略2.5失败');
    }
  }

  // 策略3: 使用默认场景"日常"（保持原风格和季节）
  if (style && season) {
    try {
      const dailyScene = eraData.场景["日常"]?.风格[style]?.季节[season];
      if (dailyScene) {
        console.log('[getFallbackMatch] ✅ 策略3成功: 使用默认场景"日常"');
        return dailyScene;
      }
    } catch (error) {
      console.log('[getFallbackMatch] 策略3失败');
    }
  }

  // 策略3.5: 使用默认场景"日常" + 通用季节
  if (style) {
    try {
      const dailySceneGeneral = eraData.场景["日常"]?.风格[style]?.季节["通用"];
      if (dailySceneGeneral) {
        console.log('[getFallbackMatch] ✅ 策略3.5成功: 使用默认场景"日常" + 通用季节');
        return dailySceneGeneral;
      }
    } catch (error) {
      console.log('[getFallbackMatch] 策略3.5失败');
    }
  }

  // 策略4: 使用默认风格"真实"
  if (scene && season && eraData.场景[scene]) {
    try {
      const realisticStyle = eraData.场景[scene]?.风格["真实"]?.季节[season];
      if (realisticStyle) {
        console.log('[getFallbackMatch] ✅ 策略4成功: 使用默认风格"真实"');
        return realisticStyle;
      }
    } catch (error) {
      console.log('[getFallbackMatch] 策略4失败');
    }
  }

  // 策略5: 使用最通用的组合（日常+真实+通用）
  try {
    const fallback = eraData.场景["日常"]?.风格["真实"]?.季节["通用"];
    if (fallback) {
      console.log('[getFallbackMatch] ✅ 策略5成功: 使用最通用组合（日常+真实+通用）');
      return fallback;
    }
  } catch (error) {
    console.log('[getFallbackMatch] 策略5失败');
  }

  console.log('[getFallbackMatch] ❌ 所有降级策略都失败');
  return null;
}

/**
 * 辅助函数：将数据转换为数组（兼容新旧格式）
 */
function toArray(data: any, gender?: string): string[] {
  // 如果是数组，直接返回
  if (Array.isArray(data)) {
    return data;
  }

  // 如果是对象（新格式：{女性: [...], 男性: [...], 通用: [...]}）
  if (typeof data === 'object' && data !== null) {
    const result: string[] = [];

    // 优先使用性别对应的数据
    if (gender && data[gender]) {
      result.push(...data[gender]);
    }

    // 添加通用数据
    if (data['通用']) {
      result.push(...data['通用']);
    }

    // 如果没有性别信息，合并所有数据
    if (!gender) {
      if (data['女性']) result.push(...data['女性']);
      if (data['男性']) result.push(...data['男性']);
      if (data['通用']) result.push(...data['通用']);
    }

    return result;
  }

  // 其他情况返回空数组
  return [];
}

/**
 * 判断叶节点是否为新的 delta 格式（三层继承架构）
 * 依据：包含 exclusive 字段即为新格式
 */
function isDeltaFormat(data: SeasonData): boolean {
  return !!(data.上装_exclusive || data.下装_exclusive || data.配饰_exclusive || data.面料_exclusive);
}

/**
 * 获取 _universal 层数据（Layer 1）
 */
function getUniversalData(): UniversalData | null {
  try {
    const data = costumeData as CostumeReferenceData;
    return (data._universal as UniversalData) || null;
  } catch {
    return null;
  }
}

/**
 * 获取 _era_defaults 层数据（Layer 2）
 */
function getEraDefaults(era: string): EraDefaults | null {
  try {
    const data = costumeData as CostumeReferenceData;
    const eraData = data[era] as import('./costume-reference.types').EraData;
    return eraData?._era_defaults || null;
  } catch {
    return null;
  }
}

/**
 * 格式化三层合并数据为 LLM 可理解文本（新格式 delta 叶节点）
 *
 * 合并策略：
 * - 颜色：Layer1 全量色谱 + Layer3 accent/forbidden 标记
 * - 面料/花纹：三层全合并，一个完整列表
 * - 发型：三层全合并
 * - 上装/下装/配饰：分区展示（场景推荐 vs 时期通用）
 * - 风格关键词：只用 Layer3（场景专属）
 */
function formatMergedForLLM(leafDelta: SeasonData, params: CostumeQueryParams): string {
  const { era, scene, style, season, gender } = params;
  const genderKey = gender === '男' ? '男性' : gender === '女' ? '女性' : undefined;

  const universal = getUniversalData();
  const eraDefaults = getEraDefaults(era);

  // 上装/下装/配饰：分区展示
  const 上装推荐 = toArray(leafDelta.上装_exclusive, genderKey);
  const 上装通用 = eraDefaults ? toArray(eraDefaults.上装_基础, genderKey) : [];
  const 下装推荐 = toArray(leafDelta.下装_exclusive, genderKey);
  const 下装通用 = eraDefaults ? toArray(eraDefaults.下装_基础, genderKey) : [];
  const 配饰推荐 = toArray(leafDelta.配饰_exclusive, genderKey);
  const 配饰通用 = eraDefaults ? toArray(eraDefaults.配饰_基础, genderKey) : [];

  // 面料/花纹：三层全合并
  const 面料所有: string[] = [
    ...(leafDelta.面料_exclusive || []),
    ...(eraDefaults?.面料 || []),
    ...(universal?.面料_基础 || []),
  ];
  const 花纹所有: string[] = [
    ...(eraDefaults?.花纹 || []),
    ...(universal?.花纹_基础 || []),
  ];

  // 颜色信息
  const 颜色推荐 = leafDelta.颜色_accent || [];
  const 颜色禁忌 = leafDelta.颜色_forbidden || [];
  const 流行色 = eraDefaults?.颜色_流行 || [];
  const universalColors = universal?.颜色;

  return `
## 服装参考资料 | ${era} · ${scene || '未指定'} · ${style || '未指定'}

**时期**：${era}
**场景**：${scene || '未指定'}
**风格**：${style || '未指定'}
**季节**：${season || '未指定'}
${gender ? `**性别**：${gender}` : ''}

### 🎯 场景推荐款式
**上装推荐**：${上装推荐.length > 0 ? 上装推荐.join('、') : '参考时期通用款'}
**下装推荐**：${下装推荐.length > 0 ? 下装推荐.join('、') : '参考时期通用款'}
${配饰推荐.length > 0 ? `**配饰推荐**：${配饰推荐.join('、')}` : ''}

### 👗 时期通用款式（也可选）
${上装通用.length > 0 ? `**上装**：${上装通用.join('、')}` : ''}
${下装通用.length > 0 ? `**下装**：${下装通用.join('、')}` : ''}
${配饰通用.length > 0 ? `**配饰**：${配饰通用.join('、')}` : ''}

### 🎨 颜色参考
${颜色推荐.length > 0 ? `**场景推荐色**：${颜色推荐.join('、')}` : ''}
${流行色.length > 0 ? `**时期流行色**：${流行色.join('、')}` : ''}
${universalColors ? `**完整色谱（暖色）**：${(universalColors.暖色系 || []).join('、')}
**完整色谱（冷色）**：${(universalColors.冷色系 || []).join('、')}
**完整色谱（中性）**：${(universalColors.中性色 || []).join('、')}
**完整色谱（高级）**：${(universalColors.高级色 || []).join('、')}` : ''}
${颜色禁忌.length > 0 ? `**禁忌色**：${颜色禁忌.join('、')}` : ''}

### 🧵 面料选项（全量合并）
${面料所有.length > 0 ? 面料所有.join('、') : '参考常识'}

### 🌸 花纹选项（全量合并）
${花纹所有.length > 0 ? 花纹所有.join('、') : '参考常识'}

### 🏷️ 风格关键词
${(leafDelta.风格关键词 || []).join('、')}
${eraDefaults?.设计指导 ? `\n### 📐 设计规范（优先参考）\n${eraDefaults.设计指导}` : ''}
${eraDefaults?.禁止事项 ? `\n⚠️ **禁止**：${eraDefaults.禁止事项}` : ''}
`.trim();
}

/**
 * 格式化为LLM可理解的文本（旧格式，向后兼容）
 */
function formatForLLM(data: SeasonData, params: CostumeQueryParams): string {
  const { era, scene, style, season, gender } = params;

  // 转换性别格式（"男" → "男性"，"女" → "女性"）
  const genderKey = gender === '男' ? '男性' : gender === '女' ? '女性' : undefined;

  // 使用辅助函数处理数据
  const 上装选项 = toArray(data.上装, genderKey);
  const 下装选项 = toArray(data.下装, genderKey);
  const 外套选项 = data.外套 ? toArray(data.外套, genderKey) : [];
  const 配饰选项 = toArray(data.配饰, genderKey);

  return `
## 服装参考资料

**时期**：${era}
**场景**：${scene || '未指定'}
**风格**：${style || '未指定'}
**季节**：${season || '未指定'}
${gender ? `**性别**：${gender}` : ''}

### 上装选项
${上装选项.join('、')}

### 下装选项
${下装选项.join('、')}

${外套选项.length > 0 ? `### 外套选项\n${外套选项.join('、')}\n` : ''}

### 配饰选项
${配饰选项.join('、')}

### 颜色选项
**常见色**：${data.颜色?.常见色?.join('、') ?? ''}
${data.颜色?.流行色 ? `**流行色**：${data.颜色.流行色.join('、')}` : ''}
${data.颜色?.禁忌色 ? `**禁忌色**：${data.颜色.禁忌色.join('、')}` : ''}

### 面料选项
${data.面料?.join('、') ?? ''}

### 花纹选项
${data.花纹?.join('、') ?? ''}

### 风格关键词
${data.风格关键词?.join('、') ?? ''}
`.trim();
}

