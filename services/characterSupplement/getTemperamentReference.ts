/**
 * 气质/美型模板库查询工具
 * 调用方：stage2-visual-tags-optimized.ts / stage2-visual-tags-fast.ts
 *         stage3-appearance-design-optimized.ts / stage3-appearance-design-fast.ts
 * 设计原则：软匹配（性别过滤 + 关键词打分），返回引导词注入 Prompt，而非硬编码规则
 */

import type { Stage1ScriptAnalysis } from './types';
import type { TemperamentTemplate, TemperamentReferenceData } from './temperament-reference.types';
import temperamentData from './temperament-reference.json';

const data = temperamentData as TemperamentReferenceData;

/** 所有模板展开为平铺列表 */
function getAllTemplates(): TemperamentTemplate[] {
  return [
    ...(data.冷系 || []),
    ...(data.暖系 || []),
    ...(data.中性系 || []),
    ...(data.特殊系 || []),
  ];
}

/**
 * 性别过滤：模板未限定性别（undefined/空）则通用
 */
function isGenderCompatible(template: TemperamentTemplate, gender: string): boolean {
  if (!template.gender || template.gender.length === 0) return true;
  if (template.gender.includes('通用')) return true;
  // 映射常见性别文本
  const isFemale = gender.includes('女') || gender === 'female';
  const isMale = gender.includes('男') || gender === 'male';
  if (isFemale && template.gender.includes('女性')) return true;
  if (isMale && template.gender.includes('男性')) return true;
  return false;
}

/**
 * 根据 personalityTraits 与模板 keyFeatures 计算匹配分数
 * 简单字符串包含匹配（双向检测）
 */
function scoreTemplate(template: TemperamentTemplate, traits: string[]): number {
  let score = 0;
  const traitText = traits.join('');
  for (const feature of template.keyFeatures) {
    // 模板关键词 → 角色特质包含
    if (traitText.includes(feature)) score += 2;
  }
  for (const trait of traits) {
    // 角色特质 → 模板描述中包含
    if (template.description.includes(trait)) score += 1;
    if (template.suitableCharacterTypes.some(t => t.includes(trait))) score += 1;
  }
  return score;
}

/**
 * 匹配最佳气质模板（最多 2 个）
 */
export function matchTemperament(
  stage1: Stage1ScriptAnalysis,
  maxResults = 2
): TemperamentTemplate[] {
  const gender = stage1.basicInfo.gender || '';
  const traits = stage1.behaviorAnalysis?.personalityTraits || [];

  const candidates = getAllTemplates()
    .filter(t => isGenderCompatible(t, gender))
    .map(t => ({ template: t, score: scoreTemplate(t, traits) }))
    .sort((a, b) => b.score - a.score);

  // 分数 > 0 优先取有分数的，否则取前 N 个（按顺序的默认推荐）
  const withScore = candidates.filter(c => c.score > 0);
  const result = withScore.length >= 1 ? withScore : candidates;
  return result.slice(0, maxResults).map(c => c.template);
}

/**
 * 生成注入到 Stage2 的气质参考段落（视觉定位阶段）
 */
export function getTemperamentGuideForStage2(stage1: Stage1ScriptAnalysis): string {
  const matches = matchTemperament(stage1, 2);
  if (matches.length === 0) return '';

  const lines = matches.map(t => {
    const gender = stage1.basicInfo.gender || '';
    const isFemale = gender.includes('女') || gender === 'female';
    const eyeGuide = isFemale
      ? t.eyeGuidance['女性']?.join('、')
      : t.eyeGuidance['男性']?.join('、') || t.eyeGuidance['通用']?.join('、');

    return `**${t.name}**（${t.description}）
- 核心气质词：${t.keyFeatures.join('、')}
- 色彩方向：${t.colorDirection}
${eyeGuide ? `- 眼神参考：${eyeGuide}` : ''}
- 服装思考：${t.stageGuidance.costume || '参考色彩方向与核心气质词'}`;
  }).join('\n\n');

  return `
### 🎭 气质参考（推荐模板，供 LLM 专业判断，非硬性规则）

${lines}

> 思考：以上气质模板是否符合这个角色？如果有更贴切的气质方向，请以角色实际为准。
`;
}

/**
 * 生成注入到 Stage3 的气质外貌引导（外貌描述阶段）
 */
export function getTemperamentGuideForStage3(stage1: Stage1ScriptAnalysis): string {
  const matches = matchTemperament(stage1, 2);
  if (matches.length === 0) return '';

  const lines = matches.map(t => {
    return `**${t.name}**：${t.stageGuidance.appearance || `思考如何通过五官体现"${t.keyFeatures.join('、')}"的气质`}`;
  }).join('\n');

  return `
### 🎭 气质外貌引导（提问式引导，供 LLM 专业判断）

${lines}
`;
}

