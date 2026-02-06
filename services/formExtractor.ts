/**
 * 角色形态自动提取工具
 * 从剧本中提取角色的所有形态标记
 */

import { ScriptFile } from '../types/project';

export interface ExtractedForm {
  name: string;
  episodeNumber: number;
  context: string; // 上下文，用于判断是否是真实形态
}

/**
 * 从剧本中提取某个角色的所有形态
 * 
 * 识别模式：
 * 1. 直接描述：晋安换上了XX装束、晋安变成了XX形态
 * 2. 形态名称：XX形态的晋安、XX状态的晋安
 * 3. 外观变化：晋安的XX发光、晋安身上出现XX
 */
export function extractCharacterForms(
  characterName: string,
  scripts: ScriptFile[]
): ExtractedForm[] {
  const forms: ExtractedForm[] = [];
  const seenForms = new Set<string>();

  for (const script of scripts) {
    const content = script.content;
    const episodeNumber = script.episodeNumber || 0;

    // 模式1: 换装/变形描述
    // 例如："晋安换上了战斗服"、"晋安变成了类人尖兵"
    const pattern1 = new RegExp(
      `${characterName}(?:换上了|变成了|化作|变为|穿上了|披上了)([^，。！？\\n]{2,15})`,
      'g'
    );
    let match;
    while ((match = pattern1.exec(content)) !== null) {
      const formName = match[1].trim();
      const formKey = `${formName}-${episodeNumber}`;
      if (!seenForms.has(formKey)) {
        seenForms.add(formKey);
        forms.push({
          name: formName,
          episodeNumber,
          context: content.slice(Math.max(0, match.index - 50), match.index + 100),
        });
      }
    }

    // 模式2: 形态名称
    // 例如："焚衣半裸的晋安"、"类人尖兵形态的晋安"
    const pattern2 = new RegExp(
      `([^，。！？\\n]{2,15})(?:形态|状态|装束|模式)(?:的|下的)?${characterName}`,
      'g'
    );
    while ((match = pattern2.exec(content)) !== null) {
      const formName = match[1].trim() + '形态';
      const formKey = `${formName}-${episodeNumber}`;
      if (!seenForms.has(formKey)) {
        seenForms.add(formKey);
        forms.push({
          name: formName,
          episodeNumber,
          context: content.slice(Math.max(0, match.index - 50), match.index + 100),
        });
      }
    }

    // 模式3: 外观变化
    // 例如："晋安的眼睛发光"、"晋安身上出现数据流"
    const pattern3 = new RegExp(
      `${characterName}(?:的)?([^，。！？\\n]{2,10})(?:发光|闪烁|显现|浮现|出现|覆盖)`,
      'g'
    );
    while ((match = pattern3.exec(content)) !== null) {
      const feature = match[1].trim();
      // 只记录明显的形态特征
      if (feature.includes('眼睛') || feature.includes('身体') || feature.includes('数据') || 
          feature.includes('光芒') || feature.includes('符文') || feature.includes('纹路')) {
        const formName = `${feature}觉醒`;
        const formKey = `${formName}-${episodeNumber}`;
        if (!seenForms.has(formKey)) {
          seenForms.add(formKey);
          forms.push({
            name: formName,
            episodeNumber,
            context: content.slice(Math.max(0, match.index - 50), match.index + 100),
          });
        }
      }
    }
  }

  return forms;
}

/**
 * 计算角色形态的完整度
 * @param characterName 角色名称
 * @param currentFormsCount 当前已记录的形态数量
 * @param scripts 所有剧本
 * @returns 完整度百分比 (0-100)
 */
export function calculateFormCompleteness(
  characterName: string,
  currentFormsCount: number,
  scripts: ScriptFile[]
): {
  completeness: number;
  extractedFormsCount: number;
  missingFormsCount: number;
  extractedForms: ExtractedForm[];
} {
  const extractedForms = extractCharacterForms(characterName, scripts);
  const extractedFormsCount = extractedForms.length;

  // 如果剧本中没有提取到形态，说明可能是配角，给予基础分数
  if (extractedFormsCount === 0) {
    return {
      completeness: currentFormsCount > 0 ? 100 : 80, // 有形态就100%，没有就80%
      extractedFormsCount: 0,
      missingFormsCount: 0,
      extractedForms: [],
    };
  }

  // 计算完整度：当前形态数 / 提取到的形态数
  const completeness = Math.min(100, Math.round((currentFormsCount / extractedFormsCount) * 100));
  const missingFormsCount = Math.max(0, extractedFormsCount - currentFormsCount);

  return {
    completeness,
    extractedFormsCount,
    missingFormsCount,
    extractedForms,
  };
}

