/**
 * 质量评分模块
 * 评估生成的角色外观描述质量
 */

import type { CharacterRef } from '../../types';
import type { Stage1ScriptAnalysis } from './types';

export interface QualityReport {
  score: number; // 0-100分
  level: 'excellent' | 'good' | 'fair' | 'poor'; // 质量等级
  issues: string[]; // 发现的问题
  suggestions: string[]; // 改进建议
  details: {
    lengthScore: number; // 长度得分
    completenessScore: number; // 完整性得分
    consistencyScore: number; // 一致性得分
    qualityScore: number; // 内容质量得分
  };
}

/**
 * 评估角色外观描述质量
 */
export function evaluateQuality(
  result: CharacterRef,
  stage1: Stage1ScriptAnalysis,
  beautyLevel: 'realistic' | 'balanced' | 'idealized'
): QualityReport {
  
  let score = 100;
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  const details = {
    lengthScore: 100,
    completenessScore: 100,
    consistencyScore: 100,
    qualityScore: 100
  };
  
  // ========== 1. 长度检查 ==========
  if (result.appearance && result.appearance.length < 150) {
    const penalty = 10;
    details.lengthScore -= penalty;
    score -= penalty;
    issues.push('外观描述过短（建议150字以上）');
    suggestions.push('增加发型、五官、服装等细节描述');
  }
  
  if (result.appearance && result.appearance.length > 800) {
    const penalty = 5;
    details.lengthScore -= penalty;
    score -= penalty;
    issues.push('外观描述过长（建议800字以内）');
    suggestions.push('精简冗余描述，保留核心特征');
  }
  
  // ========== 2. 完整性检查 ==========
  const requiredElements = ['发型', '五官', '服装'];
  const appearance = result.appearance || '';
  
  const missingElements = requiredElements.filter(
    elem => !appearance.includes(elem) && 
            !appearance.includes(elem.replace('发型', '头发')) &&
            !appearance.includes(elem.replace('服装', '服饰'))
  );
  
  if (missingElements.length > 0) {
    const penalty = 15 * missingElements.length;
    details.completenessScore -= penalty;
    score -= penalty;
    issues.push(`缺少关键元素: ${missingElements.join(', ')}`);
    suggestions.push(`补充${missingElements.join('、')}的详细描述`);
  }
  
  // ========== 3. 时代背景一致性检查 ==========
  const era = stage1.basicInfo.era;
  
  // 现代词汇在古代背景中
  const modernWords = ['牛仔裤', 'T恤', '运动鞋', '西装', '高跟鞋', '眼镜'];
  if (era.includes('古代') || era.includes('修仙') || era.includes('玄幻')) {
    const foundModern = modernWords.filter(word => appearance.includes(word));
    if (foundModern.length > 0) {
      const penalty = 20;
      details.consistencyScore -= penalty;
      score -= penalty;
      issues.push(`服装与时代背景不符: ${foundModern.join(', ')}`);
      suggestions.push(`使用符合${era}的服饰描述`);
    }
  }
  
  // 古代词汇在现代背景中
  const ancientWords = ['长袍', '襦裙', '发髻', '玉簪', '绣花鞋'];
  if (era.includes('现代') || era.includes('都市') || era.includes('科幻')) {
    const foundAncient = ancientWords.filter(word => appearance.includes(word));
    if (foundAncient.length > 0) {
      const penalty = 20;
      details.consistencyScore -= penalty;
      score -= penalty;
      issues.push(`服装与时代背景不符: ${foundAncient.join(', ')}`);
      suggestions.push(`使用符合${era}的服饰描述`);
    }
  }
  
  // ========== 4. 禁止词汇检查 ==========
  const forbiddenWords = ['杂乱', '粗糙', '暗沉', '油腻', '邋遢', '肮脏', '丑陋'];
  const foundForbidden = forbiddenWords.filter(word => appearance.includes(word));
  
  if (foundForbidden.length > 0) {
    const penalty = 10 * foundForbidden.length;
    details.qualityScore -= penalty;
    score -= penalty;
    issues.push(`包含负面词汇: ${foundForbidden.join(', ')}`);
    suggestions.push('使用中性或正面的描述词汇');
  }
  
  // ========== 5. 美型程度一致性检查 ==========
  if (beautyLevel === 'idealized') {
    if (!appearance.includes('8头身') && !appearance.includes('黄金比例')) {
      const penalty = 5;
      details.consistencyScore -= penalty;
      score -= penalty;
      issues.push('理想美型应包含"8头身"或"黄金比例"');
      suggestions.push('添加身材比例描述');
    }
  }
  
  // ========== 6. 状态描述检查（不应在基础appearance中） ==========
  const stateWords = ['受伤', '战损', '血迹', '伤痕', '虚弱', '濒死', '苍白', '散乱'];
  const foundState = stateWords.filter(word => appearance.includes(word));
  
  if (foundState.length > 0) {
    const penalty = 15;
    details.consistencyScore -= penalty;
    score -= penalty;
    issues.push(`基础外观包含状态描述: ${foundState.join(', ')}`);
    suggestions.push('将特殊状态描述移至forms数组中');
  }
  
  // ========== 计算质量等级 ==========
  let level: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 90) level = 'excellent';
  else if (score >= 75) level = 'good';
  else if (score >= 60) level = 'fair';
  else level = 'poor';
  
  return {
    score: Math.max(0, Math.min(100, score)),
    level,
    issues,
    suggestions,
    details
  };
}

