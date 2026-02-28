/**
 * 角色完整度计算工具
 * 用于评估角色信息的完整程度，并提供补充建议
 */

import { CharacterRef } from '../types';
import { ScriptFile } from '../types/project';
import { calculateFormCompleteness, ExtractedForm } from './formExtractor';

function hasStructuredAppearance(appearance?: string): boolean {
  return !!appearance && appearance.includes('【主体人物】') && appearance.includes('【外貌特征】');
}

function hasStructuredCostume(appearance?: string): boolean {
  return !!appearance && appearance.includes('【服饰造型】');
}

export interface MissingField {
  field: string;
  label: string;
  weight: number;
}

export interface CharacterCompleteness {
  character: CharacterRef;
  completeness: number;  // 0-100
  missingFields: MissingField[];
  suggestedEpisodes: number[];  // 建议重新分析的集数
  extractedForms?: ExtractedForm[];  // 从剧本中提取的形态
  missingFormsCount?: number;  // 缺失的形态数量
}

/**
 * 计算角色完整度
 *
 * 评分标准：
 * - 基础信息（name, gender, appearance）: 30分
 * - 多形态（forms）: 30分（基于剧本中实际形态数量）
 * - 经典台词（quote）: 15分
 * - 能力进化（abilities）: 15分
 * - 身份演变（identityEvolution）: 10分
 */
export function calculateCharacterCompleteness(
  character: CharacterRef,
  scripts?: ScriptFile[]
): CharacterCompleteness {
  let score = 0;
  const missingFields: { field: string; label: string; weight: number }[] = [];

  // 1. 基础信息（30分）
  if (character.name) score += 10;
  if (character.gender) score += 5;

  // 外观描述（15分）- 🔧 结构化校验：避免“长文本但其实是剧本原句”误判为完整
  // 说明：appearance 字段包含外貌（Stage3）与服饰造型（Stage4），用段落标记区分。
  const appearanceText = typeof character.appearance === 'string' ? character.appearance.trim() : '';
  if (!appearanceText) {
    missingFields.push({ field: 'appearance', label: '外观描述', weight: 15 });
    // 🔧 修复：appearance 完全为空时，costume 也必须一并生成（Stage3+Stage4 强绑定）
    // 原逻辑只在 else 分支里检测 costume，导致空 appearance 角色只有 appearance 进缺失列表，
    // costume 被遗漏，手动触发时 Stage4 被跳过，【服饰造型】永远无法生成。
    missingFields.push({ field: 'costume', label: '服装设计', weight: 8 });
  } else {
    const isStructured = hasStructuredAppearance(appearanceText);
    const hasCostume = hasStructuredCostume(appearanceText);

    // 10分：主体人物/外貌特征（结构化 + 字数）
    if (!isStructured) {
      // 有文本但不结构化：给少量分数，同时强烈提示补全
      score += 5;
      missingFields.push({
        field: 'appearance',
        label: '外观描述缺少结构化段落（需包含【主体人物】【外貌特征】）',
        weight: 10
      });
    } else if (appearanceText.length < 100) {
      score += 5;
      missingFields.push({
        field: 'appearance',
        label: `外观描述太简略（当前${appearanceText.length}字，需≥100字，且需包含【主体人物】【外貌特征】）`,
        weight: 10
      });
    } else if (appearanceText.length < 150) {
      score += 10;
      missingFields.push({
        field: 'appearance',
        label: `外观描述可以更详细（当前${appearanceText.length}字，建议≥150字）`,
        weight: 5
      });
    } else {
      score += 10;
    }

    // 5分：服饰造型（必须有【服饰造型】段落）
    if (hasCostume) {
      score += 5;
    } else {
      missingFields.push({
        field: 'costume',
        label: '服装设计（缺少【服饰造型】段落）',
        weight: 8
      });
    }
  }

  // 2. 多形态（30分）- 基于剧本中实际形态数量
  let extractedForms: ExtractedForm[] = [];
  let missingFormsCount = 0;

  if (scripts && scripts.length > 0) {
    // 从剧本中提取形态
    const formAnalysis = calculateFormCompleteness(
      character.name,
      character.forms?.length || 0,
      scripts
    );
    extractedForms = formAnalysis.extractedForms;
    missingFormsCount = formAnalysis.missingFormsCount;

    // 根据实际完整度给分
    score += Math.round(formAnalysis.completeness * 0.3);

    if (formAnalysis.completeness < 100) {
      missingFields.push({
        field: 'forms',
        label: `多形态（已录${character.forms?.length || 0}个，剧本中发现${formAnalysis.extractedFormsCount}个）`,
        weight: Math.round((100 - formAnalysis.completeness) * 0.3),
      });
    } else if (formAnalysis.extractedFormsCount === 0 && character.formSummaries === undefined) {
      // 🆕 正则扫描未发现形态，但 LLM 从未扫描过（formSummaries 不存在）
      // → 触发 Stage5.5 LLM 扫描，让 LLM 发现正则无法识别的语义性形态变化
      missingFields.push({
        field: 'forms',
        label: '形态列表（LLM智能扫描，识别受伤/情绪/服装等状态变化）',
        weight: 5, // 低权重：不确定是否有形态，仅触发扫描
      });
    }
  } else {
    // 没有剧本时，使用旧逻辑
    if (character.forms && character.forms.length > 0) {
      const formsScore = Math.min(character.forms.length * 5, 30);
      score += formsScore;
      if (formsScore < 30) {
        missingFields.push({
          field: 'forms',
          label: `多形态（当前${character.forms.length}个，建议3-6个）`,
          weight: 30 - formsScore,
        });
      }
    } else {
      missingFields.push({ field: 'forms', label: '多形态/换装图鉴', weight: 30 });
    }
  }

  // 3. 经典台词（15分）- 取消字数限制，有内容即可
  if (!character.quote || character.quote.trim().length === 0) {
    missingFields.push({ field: 'quote', label: '经典台词', weight: 15 });
  } else {
    score += 15; // 有内容就给满分
  }

  // 4. 能力进化（15分）
  if (character.abilities && character.abilities.length > 0) {
    const abilitiesScore = Math.min(character.abilities.length * 5, 15);
    score += abilitiesScore;
    if (abilitiesScore < 15) {
      missingFields.push({ 
        field: 'abilities', 
        label: `能力进化（当前${character.abilities.length}个）`, 
        weight: 15 - abilitiesScore 
      });
    }
  } else {
    missingFields.push({ field: 'abilities', label: '能力进化', weight: 15 });
  }

  // 5. 身份演变（10分）- 检查格式（必须包含箭头）
  if (!character.identityEvolution) {
    missingFields.push({ field: 'identityEvolution', label: '身份演变', weight: 10 });
  } else if (!character.identityEvolution.includes('➔') && !character.identityEvolution.includes('→')) {
    score += 5;
    missingFields.push({
      field: 'identityEvolution',
      label: '身份演变格式不正确（需要用➔连接多个阶段）',
      weight: 5
    });
  } else {
    score += 10;
  }

  // 提取建议分析的集数（从forms中获取）
  const suggestedEpisodes: number[] = [];
  if (character.forms) {
    for (const form of character.forms) {
      if (form.episodeRange) {
        const match = form.episodeRange.match(/Ep\s*(\d+)(?:-(\d+))?/);
        if (match) {
          const start = parseInt(match[1]);
          const end = match[2] ? parseInt(match[2]) : start;
          for (let ep = start; ep <= end; ep++) {
            if (!suggestedEpisodes.includes(ep)) {
              suggestedEpisodes.push(ep);
            }
          }
        }
      }
    }
  }

  return {
    character,
    completeness: Math.round(score),
    missingFields: missingFields.sort((a, b) => b.weight - a.weight),
    suggestedEpisodes: suggestedEpisodes.sort((a, b) => a - b),
    extractedForms,
    missingFormsCount,
  };
}

/**
 * 批量计算角色完整度
 */
export function calculateAllCharactersCompleteness(
  characters: CharacterRef[],
  scripts?: ScriptFile[]
): CharacterCompleteness[] {
  return characters.map(char => calculateCharacterCompleteness(char, scripts));
}

/**
 * 获取完整度等级
 */
export function getCompletenessLevel(completeness: number): {
  level: 'low' | 'medium' | 'high';
  color: string;
  emoji: string;
  label: string;
} {
  if (completeness >= 85) {
    return { level: 'high', color: 'text-green-400', emoji: '🟢', label: '完整' };
  } else if (completeness >= 60) {
    return { level: 'medium', color: 'text-yellow-400', emoji: '🟡', label: '良好' };
  } else {
    return { level: 'low', color: 'text-red-400', emoji: '🔴', label: '待补充' };
  }
}

