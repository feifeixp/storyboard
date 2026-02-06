/**
 * 剧本模板导出服务
 * 从项目数据中提取信息，生成标准化的剧本模板文件
 */

import { Project, Episode, SceneRef, GeneratedEpisodeSummary } from '../types/project';
import { Shot, CharacterRef } from '../types';

/**
 * 导出剧本模板
 * @param project 项目数据
 * @param episodeNumber 剧集编号
 * @param shots 分镜脚本数据
 * @param sceneLayouts 场景空间布局数据（来自分镜生成阶段）
 * @param episodeSummary 本集概述（从思维链结果生成，可选）
 * @param characterRefs 角色引用列表（当前加载的角色数据）
 * @returns 剧本模板文本内容
 */
export function exportScriptTemplate(
  project: Project,
  episodeNumber: number,
  shots: Shot[],
  sceneLayouts?: Array<{
    sceneId: string;
    spatialSummary: string;
    landmarks: string[];
    defaultPositions: { [characterName: string]: string };
    hiddenSettings?: string;
  }>,
  episodeSummary?: GeneratedEpisodeSummary | null,
  characterRefs?: CharacterRef[]
): string {
  const episode = project.episodes?.find(ep => ep.episodeNumber === episodeNumber);
  if (!episode) {
    throw new Error(`未找到第${episodeNumber}集`);
  }

  // 1. 剧集信息
  const header = generateHeader(episodeNumber, episode.title);

  // 2. 本集人物人设
  const characters = generateCharacterSection(project, shots, characterRefs);

  // 3. 本集场景描述
  const scenes = generateSceneSection(project, shots);

  // 4. 场景空间布局
  const layouts = generateLayoutSection(sceneLayouts);

  // 5. 本集故事梗概（优先使用已生成的概述）
  const summary = generateStorySummary(shots, episodeSummary);

  // 6. 分镜故事内容
  const storyContent = generateStoryContent(shots);

  // 🆕 不再导出 AI 图片提示词部分

  // 组合所有部分
  return [
    header,
    characters,
    scenes,
    layouts,
    summary,
    storyContent
    // aiPrompts - 已移除
  ].filter(Boolean).join('\n\n');
}

/**
 * 生成文件头部（剧集信息）
 */
function generateHeader(episodeNumber: number, episodeTitle: string): string {
  return `第${episodeNumber}集 ${episodeTitle}

导出时间：${new Date().toLocaleString('zh-CN')}
═══════════════════════════════════════════════════════════════`;
}

/**
 * 生成本集人物人设部分
 * 🔧 修复：当分镜未标注角色时，fallback 到项目全部角色
 * 🔧 增强：输出更丰富的角色信息（性别、能力、形态等）
 */
function generateCharacterSection(project: Project, shots: Shot[], characterRefs?: CharacterRef[]): string {
  // 从分镜脚本中提取本集出现的角色（通过 assignedCharacterIds）
  const characterIdsInEpisode = new Set<string>();
  shots.forEach(shot => {
    if (shot.assignedCharacterIds) {
      shot.assignedCharacterIds.forEach(id => characterIdsInEpisode.add(id));
    }
  });

  // 优先使用 characterRefs（当前加载的角色数据），降级使用 project.characters
  const characterSource = characterRefs && characterRefs.length > 0
    ? characterRefs
    : (project.characters || []);

  let episodeCharacters: CharacterRef[] = [];

  if (characterIdsInEpisode.size > 0) {
    // 通过 ID 或名称匹配（兼容两种情况）
    episodeCharacters = characterSource.filter(char =>
      characterIdsInEpisode.has(char.id) || characterIdsInEpisode.has(char.name)
    );
  }

  // 🔧 如果通过分镜匹配不到角色，fallback 到全部项目角色
  if (episodeCharacters.length === 0 && characterSource.length > 0) {
    episodeCharacters = characterSource;
  }

  if (episodeCharacters.length === 0) {
    return `本集出场人物人设：

（项目中暂无角色信息）`;
  }

  const characterTexts = episodeCharacters.map(char => {
    const parts: string[] = [];

    // 角色名称和身份演变
    let nameLine = `【${char.name}】`;
    if (char.identityEvolution) {
      nameLine += `  ${char.identityEvolution}`;
    }
    parts.push(nameLine);

    // 性别和年龄段
    const basicInfo: string[] = [];
    if (char.gender && char.gender !== '未知') {
      basicInfo.push(char.gender);
    }
    if (char.ageGroup) {
      basicInfo.push(char.ageGroup);
    }
    if (basicInfo.length > 0) {
      parts.push(`基本信息：${basicInfo.join('，')}`);
    }

    // 性格/经典台词
    if (char.quote) {
      parts.push(`性格：${char.quote}`);
    }

    // 外貌
    if (char.appearance) {
      parts.push(`外貌：${char.appearance}`);
    } else {
      parts.push(`外貌：`);
    }

    // 能力
    if (char.abilities && char.abilities.length > 0) {
      parts.push(`能力：${char.abilities.join('、')}`);
    }

    // 多形态/变装
    if (char.forms && char.forms.length > 0) {
      const formTexts = char.forms.map(form => {
        let formLine = `  - ${form.name}`;
        if (form.episodeRange) {
          formLine += `（${form.episodeRange}）`;
        }
        if (form.description) {
          formLine += `：${form.description}`;
        }
        return formLine;
      });
      parts.push(`形态：\n${formTexts.join('\n')}`);
    }

    // 造型（保留占位，供用户手动填写）
    parts.push(`造型：`);

    return parts.join('\n');
  });

  return `本集出场人物人设：（人物性格一定要精准，同时你的第一主要人物性格一定要放在第一个）（人名加粗，每个人物写完之后空一个，同一人物身份和性格之间不用空格）

${characterTexts.join('\n\n')}`;
}

/**
 * 生成本集场景描述部分
 * 🆕 P4修复：优先使用 sceneId 匹配，提高准确率
 */
function generateSceneSection(project: Project, shots: Shot[]): string {
  // 从分镜脚本中提取本集涉及的场景
  const sceneIdsInEpisode = new Set<string>();
  const sceneNamesInEpisode = new Set<string>();

  shots.forEach(shot => {
    // 🆕 优先使用 sceneId 匹配（最准确）
    if (shot.sceneId) {
      sceneIdsInEpisode.add(shot.sceneId);
    }

    // 备选：通过背景描述匹配场景名称（兼容旧数据）
    (project.scenes || []).forEach(scene => {
      if (shot.background?.includes(scene.name) ||
          shot.midground?.includes(scene.name) ||
          shot.foreground?.includes(scene.name)) {
        sceneNamesInEpisode.add(scene.name);
      }
    });
  });

  // 筛选本集场景
  const episodeScenes = (project.scenes || []).filter(scene =>
    sceneIdsInEpisode.has(scene.id) ||  // 🆕 优先使用 sceneId 匹配
    sceneNamesInEpisode.has(scene.name) ||
    scene.appearsInEpisodes.includes(shots[0]?.shotNumber ? parseInt(shots[0].shotNumber) : 0)
  );

  if (episodeScenes.length === 0) {
    return `本集场景描述：

（本集未标注场景信息）`;
  }

  const sceneTexts = episodeScenes.map(scene => {
    const parts = [];

    parts.push(`场景名称：${scene.name}`);

    if (scene.description) {
      parts.push(`场景描述：${scene.description}`);
    }

    if (scene.atmosphere) {
      parts.push(`氛围：${scene.atmosphere}`);
    }

    if (scene.visualPromptCn) {
      parts.push(`视觉提示词（中文）：${scene.visualPromptCn}`);
    }

    if (scene.visualPromptEn) {
      parts.push(`视觉提示词（英文）：${scene.visualPromptEn}`);
    }

    return parts.join('\n');
  });

  return `本集场景描述：

${sceneTexts.join('\n\n')}`;
}

/**
 * 生成场景空间布局部分
 */
function generateLayoutSection(
  sceneLayouts?: Array<{
    sceneId: string;
    spatialSummary: string;
    landmarks: string[];
    defaultPositions: { [characterName: string]: string };
    hiddenSettings?: string;
  }>
): string {
  if (!sceneLayouts || sceneLayouts.length === 0) {
    return `场景空间布局：

（本集未生成场景空间布局数据）`;
  }

  const layoutTexts = sceneLayouts.map(layout => {
    const parts = [`场景 ${layout.sceneId}`];

    parts.push(`空间概况：${layout.spatialSummary}`);

    if (layout.landmarks.length > 0) {
      parts.push(`关键地标：${layout.landmarks.join('、')}`);
    }

    const positions = Object.entries(layout.defaultPositions);
    if (positions.length > 0) {
      const posTexts = positions.map(([name, pos]) => `  - ${name}：${pos}`);
      parts.push(`角色默认站位：\n${posTexts.join('\n')}`);
    }

    if (layout.hiddenSettings) {
      parts.push(`隐藏设定：${layout.hiddenSettings}`);
    }

    return parts.join('\n');
  });

  return `场景空间布局：

${layoutTexts.join('\n\n')}`;
}

/**
 * 生成本集故事梗概
 * 🆕 优先使用已生成的概述（从思维链结果提取）
 * @param shots 分镜脚本数据
 * @param episodeSummary 已生成的本集概述（可选）
 */
function generateStorySummary(shots: Shot[], episodeSummary?: GeneratedEpisodeSummary | null): string {
  // 🆕 优先使用已生成的概述
  if (episodeSummary && episodeSummary.storySummary && episodeSummary.storySummary !== '（暂无故事梗概）') {
    return `本集故事梗概：

${episodeSummary.storySummary}`;
  }

  // 降级：从所有镜头的storyBeat中提取关键剧情点
  const storyBeats = shots
    .map(shot => shot.storyBeat)
    .filter(beat => beat && beat.trim().length > 0);

  if (storyBeats.length === 0) {
    return `本集故事梗概：

（未生成故事梗概）`;
  }

  // 🆕 智能概括：提取关键剧情点
  // 策略：取开头、中间、结尾的关键镜头，形成三段式结构
  const totalBeats = storyBeats.length;
  const keyBeats = [];

  // 开头（前3个镜头）
  if (totalBeats > 0) {
    keyBeats.push(storyBeats.slice(0, Math.min(3, totalBeats)).join('，'));
  }

  // 中间（中间2-3个镜头）
  if (totalBeats > 6) {
    const midStart = Math.floor(totalBeats / 2) - 1;
    keyBeats.push(storyBeats.slice(midStart, midStart + 2).join('，'));
  }

  // 结尾（最后2-3个镜头）
  if (totalBeats > 3) {
    keyBeats.push(storyBeats.slice(-Math.min(3, totalBeats)).join('，'));
  }

  // 合并成连贯的故事
  const summary = keyBeats.join('。') + '。';
  const truncated = summary.length > 300 ? summary.substring(0, 297) + '...' : summary;

  return `本集故事梗概：

${truncated}`;
}

/**
 * 生成分镜故事内容（🆕 不包含AI提示词）
 */
function generateStoryContent(shots: Shot[]): string {
  const storyTexts = shots.map((shot, index) => {
    const parts = [];
    const shotNum = shot.shotNumber || (index + 1).toString();

    // 镜头编号
    parts.push(`${shotNum}-${index + 1}`);

    // 场景信息（从background提取）
    if (shot.background) {
      parts.push(`场景：${shot.background}`);
    }

    // 人物信息
    if (shot.assignedCharacterIds && shot.assignedCharacterIds.length > 0) {
      parts.push(`人物：${shot.assignedCharacterIds.join('、')}`);
    }

    // 故事节拍（动作描述）
    if (shot.storyBeat) {
      parts.push(`▲${shot.storyBeat}`);
    }

    // 对白
    if (shot.dialogue) {
      parts.push(shot.dialogue);
    }

    return parts.join('\n');
  });

  return `分镜故事内容：

${storyTexts.join('\n\n')}`;
}

/**
 * 生成AI图片提示词部分
 */
function generateAIPrompts(shots: Shot[]): string {
  const promptTexts = shots.map((shot, index) => {
    const shotNum = shot.shotNumber || (index + 1).toString();
    const isMotion = shot.shotType === '运动';

    const parts = [`镜头 #${shotNum} ${isMotion ? '（运动镜头）' : '（静态镜头）'}`];

    if (isMotion) {
      // 运动镜头：区分首帧和尾帧
      if (shot.promptCn || shot.imagePromptCn) {
        parts.push(`【首帧】中文提示词：\n${shot.imagePromptCn || shot.promptCn || '（未生成）'}`);
      }

      if (shot.endFramePromptCn || shot.endImagePromptCn) {
        parts.push(`【尾帧】中文提示词：\n${shot.endImagePromptCn || shot.endFramePromptCn || '（未生成）'}`);
      }

      if (shot.videoGenPrompt) {
        parts.push(`【视频提示词】：\n${shot.videoGenPrompt}`);
      }
    } else {
      // 静态镜头：只有单一提示词
      if (shot.promptCn || shot.imagePromptCn) {
        parts.push(`中文提示词：\n${shot.imagePromptCn || shot.promptCn || '（未生成）'}`);
      }
    }

    return parts.join('\n\n');
  });

  return `AI图片提示词：

${promptTexts.join('\n\n───────────────────────────────────────\n\n')}`;
}

