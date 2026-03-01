/**
 * 识别主要角色
 * 根据出场次数、台词等判断角色重要性
 */

import type { CharacterRef } from '../../types';

/**
 * 明显群像/集合类角色名（保守过滤）
 * 说明：这类名称通常不是单一人物，不应进入“主要角色自动补全”候选。
 * 注意：仅用于自动识别/推荐；用户仍可在 UI 中手动补全。
 */
const GROUP_NAME_KEYWORDS = [
  '群雄',
  '众人',
  '诸人',
  '众修',
  '众弟子',
  '群众',
  '路人',
  '士兵',
  '侍卫',
  '护卫'
];

function isGroupCharacterName(name?: string): boolean {
  const n = (name || '').trim();
  if (!n) return true;

  // 精确匹配、后缀匹配（如：正道群雄）
  if (GROUP_NAME_KEYWORDS.some(k => n === k || n.endsWith(k))) return true;

  // 前缀匹配（如：路人甲、士兵乙）
  if (['路人', '士兵', '侍卫', '护卫', '群众'].some(k => n.startsWith(k))) return true;

  return false;
}

function hasStructuredAppearance(appearance?: string): boolean {
  if (!appearance) return false;

  // ✅ 必须同时包含正确的标记
  const hasCorrectMarkers = appearance.includes('【主体人物】') && appearance.includes('【外貌特征】');

  // ❌ 如果包含错误的标记（来自 projectAnalysis.ts 的旧格式），视为无效
  const hasWrongMarkers = appearance.includes('【外貌描述】') || appearance.includes('【干体人物】');

  // ⚠️ 检查内容质量：即使有正确标记，但内容太简单（<100字）也视为无效
  // 这样可以强制重新生成详细的 CoT 描述
  const isContentTooShort = appearance.length < 100;

  // 只有包含正确标记、不包含错误标记、且内容足够详细时才认为有效
  return hasCorrectMarkers && !hasWrongMarkers && !isContentTooShort;
}

function hasStructuredCostume(appearance?: string): boolean {
  return !!appearance && appearance.includes('【服饰造型】');
}

/**
 * 🆕 角色定位权重（用于主要角色识别打分）
 * 说明：
 * 1. 优先使用 Stage1 回写的 role 字段（最准确）
 * 2. 如果没有 role 字段，尝试从 name/description 中识别主角关键词（兜底）
 * 3. 权重设计要明显大于普通特征分数，以保证主角能够稳定压过仅靠出场次数堆出来的角色
 */
function getRoleWeight(char: CharacterRef): number {
  const role = (char as any).role as CharacterRef['role'] | undefined;

  // 1. 优先使用 Stage1 的 role 字段
  if (role) {
    switch (role) {
      case '主角':
        return 1000; // 确保主角在排序中绝对靠前
      case '重要配角':
        return 400;
      case '反派':
        return 300;
      case '配角':
        return 100;
      default:
        return 0;
    }
  }

  // 2. 兜底：从 description 中提取角色定位标记（projectAnalysis 阶段写入）
  const desc = char.description || '';

  // 优先识别 projectAnalysis 写入的标记（格式：【主角】、【重要配角】、【配角】、【反派】）
  if (/【主角】/.test(desc)) {
    return 800; // 略低于 Stage1 的 1000，但足够高
  }
  if (/【重要配角】/.test(desc)) {
    return 350;
  }
  if (/【反派】/.test(desc)) {
    return 250;
  }
  if (/【配角】/.test(desc)) {
    return 80;
  }

  // 3. 最后兜底：从 name/description 中识别关键词（适用于旧数据）
  const name = char.name || '';
  const combined = name + ' ' + desc;

  // 主角关键词（权重 800）
  if (/主角|男主|女主|男主角|女主角/.test(combined)) {
    return 800;
  }

  // 反派关键词（权重 250）
  if (/反派|恶人|坏人|反角/.test(combined)) {
    return 250;
  }

  return 0;
}

export interface MainCharacterCriteria {
  minAppearances?: number; // 最少出场次数
  hasQuote?: boolean; // 是否有台词
  maxCount?: number; // 最多返回几个角色
}

/**
 * 识别主要角色
 */
export function identifyMainCharacters(
  characters: CharacterRef[],
  criteria: MainCharacterCriteria = {}
): CharacterRef[] {
  
  const {
    minAppearances = 3,
    hasQuote = false,
    maxCount = 5
  } = criteria;
  
  // 0. 过滤明显群像/集合类名称（保守过滤）
  const candidates = (characters || []).filter(c => !isGroupCharacterName(c?.name));

  // 计算每个角色的重要性分数
  const scored = candidates.map(char => {
    let score = 0;

    // 0. 基础分数（确保所有角色都有分数）
    score += 10;

    // 1. 出场次数
    const appearances = char.appearsInEpisodes?.length || 0;
    score += appearances * 10;

    // 2. 有台词
    if (char.quote && char.quote.length > 0) {
      score += 50;
    }

    // 3. 有身份演变
    if (char.identityEvolution && char.identityEvolution.length > 0) {
      score += 30;
    }

    // 4. 有能力描述
    if (char.abilities && char.abilities.length > 0) {
      score += 20;
    }

    // 5. 有多个形态
    if (char.forms && char.forms.length > 1) {
      score += 40;
    }

    // 6. 🆕 剧情关键性：有详细描述（说明是重要角色）
    // 注意：不再使用性别作为评分因素，符合"通用工具原则"
    if (char.description && char.description.length > 50) {
      score += 15;
    }

    // 7. 有年龄组信息
    if (char.ageGroup && char.ageGroup.length > 0) {
      score += 10;
    }

    // 8. 🆕 阶段1角色定位权重（主角/重要配角/反派）
    // 说明：role 来自阶段1 characterPosition.role，通过补全流程回写到 CharacterRef
    score += getRoleWeight(char);

    return { char, score, appearances };
  });
  
  // 过滤和排序
  let filtered = scored;
  
  // 过滤：最少出场次数
  if (minAppearances > 0) {
    filtered = filtered.filter(s => s.appearances >= minAppearances);
  }
  
  // 过滤：必须有台词
  if (hasQuote) {
    filtered = filtered.filter(s => s.char.quote && s.char.quote.length > 0);
  }
  
  // 排序：按分数降序
  filtered.sort((a, b) => b.score - a.score);
  
  // 🆕 结果选择策略：
  // 1）所有已标记为「主角」的角色无视 maxCount，全部纳入；
  // 2）剩余名额按分数从高到低补足到 maxCount；
  const mainRoleChars: CharacterRef[] = [];
  const otherChars: CharacterRef[] = [];

  for (const s of filtered) {
    const role = (s.char as any).role as CharacterRef['role'] | undefined;
    if (role === '主角') {
      mainRoleChars.push(s.char);
    } else {
      otherChars.push(s.char);
    }
  }

  const result: CharacterRef[] = [];

  // 先加入所有主角（可能超过 maxCount，这是预期行为）
  for (const c of mainRoleChars) {
    if (!result.includes(c)) {
      result.push(c);
    }
  }

  // 再按分数补充其他角色，直到达到 maxCount
  for (const c of otherChars) {
    if (result.length >= maxCount) break;
    if (!result.includes(c)) {
      result.push(c);
    }
  }

  console.log('[识别主要角色] 总角色数:', characters.length);
  console.log('[识别主要角色] 候选角色数(已过滤群像):', candidates.length);
  console.log('[识别主要角色] 所有角色分数:', scored.map(s => `${s.char.name}(${s.score}分,出场${s.appearances}次)`).join(', '));
  console.log('[识别主要角色] 过滤后角色数:', filtered.length);
  console.log('[识别主要角色] 主要角色数:', result.length);
  console.log('[识别主要角色] 主要角色:', result.map(c => c.name).join(', '));

  return result;
}

/**
 * 判断角色是否需要补充
 */
export function needsSupplement(char: CharacterRef): boolean {
  // 群像/集合类：不自动补全（仍可手动补全）
  if (isGroupCharacterName(char?.name)) return false;

  // 外观描述：必须具备结构化标记（避免“长文本但其实是剧本原句”误判为完整）
  if (!hasStructuredAppearance(char?.appearance)) return true;

  // 服饰造型：在 appearance 中以段落标记存在
  if (!hasStructuredCostume(char?.appearance)) return true;

  return false;
}

/**
 * 获取需要补充的字段
 */
export function getMissingFields(char: CharacterRef): Array<{field: string, label: string, weight: number}> {
  const missing: Array<{field: string, label: string, weight: number}> = [];

  // 检查外貌描述
  if (!hasStructuredAppearance(char?.appearance)) {
    missing.push({ field: 'appearance', label: '外观描述', weight: 100 });
  }

  // 检查服装描述
  if (!hasStructuredCostume(char?.appearance)) {
    missing.push({ field: 'costume', label: '服装设计', weight: 80 });
  }

  // 🆕 检查形态（forms）：若无任何形态，触发 Stage5.5（智能形态补全）
  // Stage5.5 会：提取所有形态 → S2加权评分 → 只为最重要1个形态生成结构化描述
  if (!char?.forms || char.forms.length === 0) {
    missing.push({ field: 'forms', label: '角色形态', weight: 60 });
  }

  return missing;
}

