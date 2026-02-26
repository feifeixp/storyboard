/**
 * 角色工具函数
 * 提供角色匹配、形态匹配、特征描述提取等功能
 * 用于九宫格生成、单格重绘等需要角色参考的场景
 */

import type { CharacterRef, CharacterForm } from '../types';

/**
 * 根据集数匹配角色的正确形态
 * 匹配逻辑：
 *   - "Ep 5" → 仅第5集
 *   - "Ep 1-20" → 第1到20集
 *   - "Ep 46+" → 第46集及以后
 * @returns 匹配到的 CharacterForm，或 undefined
 */
export function matchFormForEpisode(
  forms: CharacterForm[],
  episodeNumber: number
): CharacterForm | undefined {
  for (const form of forms) {
    if (!form.episodeRange) continue;
    const range = form.episodeRange.trim();

    // 格式1: "Ep 5" - 仅该集
    const singleMatch = range.match(/^Ep\s*(\d+)$/i);
    if (singleMatch && parseInt(singleMatch[1], 10) === episodeNumber) return form;

    // 格式2: "Ep 1-20" - 范围
    const rangeMatch = range.match(/^Ep\s*(\d+)\s*[-–]\s*(\d+)$/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (episodeNumber >= start && episodeNumber <= end) return form;
    }

    // 格式3: "Ep 46+" - 该集及以后
    const plusMatch = range.match(/^Ep\s*(\d+)\+$/i);
    if (plusMatch && episodeNumber >= parseInt(plusMatch[1], 10)) return form;
  }
  return undefined;
}

/**
 * 根据集数获取角色在该集应使用的形态描述
 * 如果角色有forms数组，会根据episodeRange匹配当前集数
 */
export function getCharacterAppearanceForEpisode(
  character: CharacterRef,
  episodeNumber?: number
): string {
  // 如果没有集数或没有forms，返回基础外观
  if (!episodeNumber || !character.forms || character.forms.length === 0) {
    return character.appearance || '';
  }
  // 使用统一的形态匹配函数
  const form = matchFormForEpisode(character.forms, episodeNumber);
  if (form) {
    return form.description || form.visualPromptCn || character.appearance || '';
  }
  // 没有匹配到任何形态，返回基础外观
  return character.appearance || '';
}

/**
 * 从角色信息中提取10字以内的特征描述
 * 优先级：appearance字段 → 年龄+性别组合 → 角色名
 * @param character 角色信息
 * @returns 10字以内的特征描述，如"白发老年女性"
 */
export function buildBriefCharacterDescription(character: CharacterRef): string {
  // 1. 优先从 appearance 提取
  if (character.appearance) {
    // 移除标点符号，提取关键词
    const cleanDesc = character.appearance
      .replace(/[，。、；：；,!；:：]/g, ' ')
      .trim();

    // 如果描述较短，直接使用
    if (cleanDesc.length <= 12) {
      return cleanDesc.length > 10 ? cleanDesc.slice(0, 10) : cleanDesc;
    }

    // 提取第一个分句/短语
    const firstPart = cleanDesc.split(/[，。、；；,]/)[0]?.trim();
    if (firstPart && firstPart.length <= 12) {
      return firstPart.length > 10 ? firstPart.slice(0, 10) : firstPart;
    }
  }

  // 2. 从年龄+性别组合构建
  const parts: string[] = [];
  if (character.ageGroup) {
    const ageMap: Record<string, string> = {
      '儿童': '幼童',
      '少年': '少年',
      '青年': '青年',
      '中年': '中年',
      '老年': '老年'
    };
    parts.push(ageMap[character.ageGroup] || character.ageGroup);
  }
  if (character.gender && character.gender !== '未知') {
    const genderMap: Record<string, string> = {
      '男': '男性',
      '女': '女性'
    };
    parts.push(genderMap[character.gender] || character.gender);
  }
  if (parts.length > 0) {
    const combined = parts.join('');
    return combined.length > 10 ? combined.slice(0, 10) : combined;
  }

  // 3. 回退：使用角色名的前4字
  return character.name.length > 4 ? character.name.slice(0, 4) : character.name;
}

/**
 * 角色参考图信息
 */
export interface CharacterReferenceImage {
  name: string;
  briefDesc: string;
  imageUrl: string;
  imageIndex: number;
}

/**
 * 根据集数获取角色的参考图信息
 * @param characters 所有角色列表
 * @param episodeNumber 当前集数
 * @returns 包含角色名、简要描述（≤10字）、图片URL的列表
 */
export function getCharacterReferenceImagesForEpisode(
  characters: CharacterRef[],
  episodeNumber?: number
): CharacterReferenceImage[] {
  const result: CharacterReferenceImage[] = [];

  for (const character of characters) {
    let imageUrl: string | undefined;
    let briefDesc = '';

    // 1. 优先：根据集数匹配形态的设定图
    if (episodeNumber && character.forms && character.forms.length > 0) {
      const matchedForm = matchFormForEpisode(character.forms, episodeNumber);
      if (matchedForm?.imageSheetUrl) {
        imageUrl = matchedForm.imageSheetUrl;
        // 简要描述：优先用形态名（去除emoji前缀），限制10字以内
        const cleanName = matchedForm.name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').trim();
        briefDesc = cleanName.length > 10 ? cleanName.slice(0, 10) : cleanName;
      }
    }

    // 2. 回退：使用角色主体设定图
    if (!imageUrl && character.imageSheetUrl) {
      imageUrl = character.imageSheetUrl;
      // 简要描述：用角色外观的前10字
      const desc = character.appearance || character.name;
      briefDesc = desc.length > 10 ? desc.slice(0, 10) : desc;
    }

    if (imageUrl) {
      result.push({ name: character.name, briefDesc, imageUrl, imageIndex: result.length + 1 });
    }
  }

  return result;
}

/**
 * 获取指定集数可用的场景列表
 * @param scenes 场景列表
 * @param episodeNumber 当前集数
 * @returns 该集可用的场景列表
 */
export function getScenesForEpisode(scenes: any[], episodeNumber?: number): any[] {
  if (!episodeNumber) return scenes;
  return scenes.filter((s: any) =>
    s.appearsInEpisodes && s.appearsInEpisodes.includes(episodeNumber)
  );
}

/**
 * 构建场景描述信息，用于分镜生成
 * @param scenes 场景列表
 * @param episodeNumber 当前集数
 * @returns 场景描述字符串
 */
export function buildSceneDescriptionsForPrompt(scenes: any[], episodeNumber?: number): string {
  const episodeScenes = getScenesForEpisode(scenes, episodeNumber);
  if (episodeScenes.length === 0) return '';

  return `
═══════════════════════════════════════════════════
【场景库】本集可用场景的视觉描述：
═════════════════════════════════════════════════
${episodeScenes.map((s: any) => `• ${s.name}：${s.description}
 氛围：${s.atmosphere}
 提示词(CN)：${s.visualPromptCn}`).join('\n\n')}

⚠️ 当剧本提到以上场景时，请使用对应的视觉描述
`;
}

/**
 * 为指定集数构建角色外观描述列表
 * @param characters 角色列表
 * @param episodeNumber 当前集数
 * @returns 角色描述列表
 */
export function buildCharacterDescriptionsForEpisode(
  characters: CharacterRef[],
  episodeNumber?: number
): { name: string; gender?: string; appearance: string }[] {
  return characters.map(c => ({
    name: c.name,
    gender: c.gender,
    appearance: getCharacterAppearanceForEpisode(c, episodeNumber)
  }));
}

/**
 * 获取单个镜头涉及的角色信息
 * @param shot 镜头信息（需包含 assignedCharacterIds）
 * @param allCharacters 所有角色列表
 * @param episodeNumber 当前集数（用于匹配形态）
 * @returns 该镜头涉及的角色列表
 */
export interface ShotCharacter {
  id: string;
  name: string;
  briefDesc: string;
  imageUrl?: string;
  imageIndex: number;
}

export function getCharactersForShot(
  shot: { id?: string; assignedCharacterIds?: string[] },
  allCharacters: CharacterRef[],
  episodeNumber?: number
): ShotCharacter[] {
  const result: ShotCharacter[] = [];

  if (!shot.assignedCharacterIds || shot.assignedCharacterIds.length === 0) {
    return result;
  }

  for (const charId of shot.assignedCharacterIds) {
    const character = allCharacters.find(c => c.id === charId);
    if (!character) continue;

    let imageUrl: string | undefined;
    let briefDesc = '';

    // 1. 根据集数匹配形态的设定图
    if (episodeNumber && character.forms && character.forms.length > 0) {
      const matchedForm = matchFormForEpisode(character.forms, episodeNumber);
      if (matchedForm?.imageSheetUrl) {
        imageUrl = matchedForm.imageSheetUrl;
        // 简要描述：优先用形态名（去除emoji前缀），限制10字以内
        const cleanName = matchedForm.name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').trim();
        briefDesc = cleanName.length > 10 ? cleanName.slice(0, 10) : cleanName;
      }
    }

    // 2. 回退：使用角色主体设定图
    if (!imageUrl && character.imageSheetUrl) {
      imageUrl = character.imageSheetUrl;
      briefDesc = buildBriefCharacterDescription(character);
    }

    result.push({ id: character.id, name: character.name, briefDesc, imageUrl, imageIndex: result.length + 1 });
  }

  return result;
}

/**
 * 获取九宫格涉及的角色参考图信息
 * @param gridShots 九宫格的镜头列表
 * @param allCharacters 所有角色列表
 * @param episodeNumber 当前集数
 * @returns 该九宫格涉及的角色参考图列表
 */
export function getCharactersForGrid(
  gridShots: { assignedCharacterIds?: string[] }[],
  allCharacters: CharacterRef[],
  episodeNumber?: number
): CharacterReferenceImage[] {
  const result: CharacterReferenceImage[] = [];
  const characterIdsInGrid = new Set<string>();

  // 收集该九宫格涉及的所有角色ID
  for (const shot of gridShots) {
    if (shot.assignedCharacterIds) {
      shot.assignedCharacterIds.forEach(id => characterIdsInGrid.add(id));
    }
  }

  let globalImageIndex = 0;
  for (const character of allCharacters) {
    if (characterIdsInGrid.has(character.id)) {
      let imageUrl: string | undefined;
      let briefDesc = '';

      // 1. 根据集数匹配形态的设定图
      if (episodeNumber && character.forms && character.forms.length > 0) {
        const matchedForm = matchFormForEpisode(character.forms, episodeNumber);
        if (matchedForm?.imageSheetUrl) {
          imageUrl = matchedForm.imageSheetUrl;
          const cleanName = matchedForm.name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').trim();
          briefDesc = cleanName.length > 10 ? cleanName.slice(0, 10) : cleanName;
        }
      }

      // 2. 回退：使用角色主体设定图
      if (!imageUrl && character.imageSheetUrl) {
        imageUrl = character.imageSheetUrl;
        briefDesc = buildBriefCharacterDescription(character);
      }

      if (imageUrl) {
        globalImageIndex += 1;
        result.push({ name: character.name, briefDesc, imageUrl, imageIndex: globalImageIndex });
      }
    }
  }

  return result;
}
