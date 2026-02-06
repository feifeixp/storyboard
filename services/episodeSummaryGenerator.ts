/**
 * 本集概述生成服务
 * 从思维链结果中提取信息，生成本集概述
 */

import type { GeneratedEpisodeSummary } from '../types/project';
import type { ScriptAnalysis, VisualStrategy, ShotPlanning } from '../prompts/chain-of-thought/types';
import type { Shot } from '../types';

/**
 * 从思维链结果生成本集概述
 * @param episodeNumber 剧集编号
 * @param episodeTitle 剧集标题
 * @param cotStage1 思维链阶段1结果（剧本分析）
 * @param cotStage2 思维链阶段2结果（视觉策略）
 * @param cotStage3 思维链阶段3结果（镜头分配）
 * @param shots 生成的镜头列表
 * @returns 本集概述
 */
export function generateEpisodeSummary(
  episodeNumber: number,
  episodeTitle: string,
  cotStage1: ScriptAnalysis | undefined,
  cotStage2: VisualStrategy | undefined,
  cotStage3: ShotPlanning | undefined,
  shots: Shot[]
): GeneratedEpisodeSummary {
  // 1. 基本信息
  const totalShots = shots.length;
  const totalDuration = cotStage3?.shotCount?.totalDuration || '未知';

  // 2. 故事梗概（从镜头的 storyBeat 提取）
  const storySummary = generateStorySummary(shots, cotStage1);

  // 3. 出场角色（从 cotStage1.characters 提取）
  const characters = extractCharacters(cotStage1);

  // 4. 涉及场景（从 cotStage1.scenes 提取）
  const scenes = extractScenes(cotStage1);

  // 5. 情绪曲线（从 cotStage1.emotionArc 提取）
  const emotionCurve = generateEmotionCurve(cotStage1);

  // 6. 视觉风格（从 cotStage2.overallStyle 提取）
  const visualStyle = generateVisualStyle(cotStage2);

  return {
    episodeNumber,
    episodeTitle,
    totalDuration,
    totalShots,
    storySummary,
    characters,
    scenes,
    emotionCurve,
    visualStyle,
  };
}

/**
 * 生成故事梗概（智能概括，20-300字）
 *
 * 策略：
 * 1. 优先使用 Stage1 的 basicInfo.plotSummary（如果有）
 * 2. 否则从镜头的 storyBeat 中提取关键剧情点，智能概括
 * 3. 最后降级到场景描述
 */
function generateStorySummary(shots: Shot[], cotStage1: ScriptAnalysis | undefined): string {
  // 🆕 优先使用 Stage1 的关键事件（如果有）
  if (cotStage1?.basicInfo?.keyEvents && cotStage1.basicInfo.keyEvents.length > 0) {
    const summary = cotStage1.basicInfo.keyEvents.join('，');
    // 确保长度在 20-300 字之间
    if (summary.length >= 20 && summary.length <= 300) {
      return summary;
    } else if (summary.length > 300) {
      return summary.substring(0, 297) + '...';
    }
  }

  // 🆕 从镜头的 storyBeat 中智能提取关键剧情点
  if (shots.length > 0) {
    const events = shots
      .map(shot => {
        // 支持 storyBeat 的两种类型
        if (typeof shot.storyBeat === 'string') {
          return shot.storyBeat;
        } else if (shot.storyBeat && typeof shot.storyBeat === 'object') {
          return shot.storyBeat.event;
        }
        return '';
      })
      .filter(event => event && event.trim().length > 0);

    if (events.length > 0) {
      // 🆕 智能概括：提取开头、高潮、结尾的关键剧情点
      const summary = summarizeKeyEvents(events);
      if (summary.length >= 20) {
        return summary;
      }
    }
  }

  // 降级：从 cotStage1.scenes 提取
  if (cotStage1?.scenes && cotStage1.scenes.length > 0) {
    const sceneDescriptions = cotStage1.scenes
      .map(scene => scene.description || scene.id)
      .join('，');
    return `${sceneDescriptions}。`;
  }

  return '（暂无故事梗概）';
}

/**
 * 智能概括关键事件（20-300字）
 *
 * 策略：
 * 1. 提取开头（前10%）、高潮（中间50%的关键事件）、结尾（后10%）
 * 2. 去除重复和冗余描述
 * 3. 组合成连贯的故事概括
 */
function summarizeKeyEvents(events: string[]): string {
  const totalEvents = events.length;

  // 1. 提取开头（前10%，至少1个）
  const beginningCount = Math.max(1, Math.ceil(totalEvents * 0.1));
  const beginning = events.slice(0, beginningCount);

  // 2. 提取高潮（中间50%的关键事件，选择包含关键词的）
  const middleStart = Math.floor(totalEvents * 0.25);
  const middleEnd = Math.floor(totalEvents * 0.75);
  const middleEvents = events.slice(middleStart, middleEnd);

  // 关键词：冲突、转折、情绪高潮
  const keywordPatterns = [
    /攻击|战斗|对抗|冲突|爆发|崩溃|毁灭|击中|贯穿/,
    /决定|选择|转折|逆转|反击|突破|觉醒/,
    /恐惧|愤怒|绝望|震惊|惊恐|疯狂|崩溃/,
    /胜利|成功|失败|牺牲|代价/
  ];

  const climaxEvents = middleEvents.filter(event =>
    keywordPatterns.some(pattern => pattern.test(event))
  );

  // 如果没有找到关键事件，使用中间部分的前2个
  const climax = climaxEvents.length > 0
    ? climaxEvents.slice(0, Math.min(3, climaxEvents.length))
    : middleEvents.slice(0, Math.min(2, middleEvents.length));

  // 3. 提取结尾（后10%，至少1个）
  const endingCount = Math.max(1, Math.ceil(totalEvents * 0.1));
  const ending = events.slice(-endingCount);

  // 4. 组合成连贯的故事
  const keyEvents = [...beginning, ...climax, ...ending];

  // 5. 去除重复（相似度>80%的事件）
  const uniqueEvents = deduplicateEvents(keyEvents);

  // 6. 拼接成概括（确保20-300字）
  let summary = uniqueEvents.join('，');

  // 确保长度在范围内
  if (summary.length > 300) {
    // 截断到最后一个句号或逗号
    const truncated = summary.substring(0, 297);
    const lastPunctuation = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('，')
    );
    summary = lastPunctuation > 0
      ? truncated.substring(0, lastPunctuation + 1)
      : truncated + '...';
  } else if (summary.length < 20) {
    // 太短，使用所有事件
    summary = events.join('，');
    if (summary.length > 300) {
      summary = summary.substring(0, 297) + '...';
    }
  }

  return summary;
}

/**
 * 去除重复事件（相似度>80%）
 */
function deduplicateEvents(events: string[]): string[] {
  const unique: string[] = [];

  for (const event of events) {
    // 检查是否与已有事件相似
    const isDuplicate = unique.some(existing => {
      const similarity = calculateSimilarity(event, existing);
      return similarity > 0.8;
    });

    if (!isDuplicate) {
      unique.push(event);
    }
  }

  return unique;
}

/**
 * 计算两个字符串的相似度（简单版本）
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0 || len2 === 0) return 0;

  // 计算公共子串长度
  let commonLength = 0;
  for (let i = 0; i < Math.min(len1, len2); i++) {
    if (str1[i] === str2[i]) {
      commonLength++;
    }
  }

  return commonLength / Math.max(len1, len2);
}

/**
 * 提取出场角色
 */
function extractCharacters(cotStage1: ScriptAnalysis | undefined): Array<{ name: string; role: string }> {
  // 🔧 修复：从 basicInfo.characters 提取（ScriptAnalysis 没有顶层 characters 字段）
  if (!cotStage1?.basicInfo?.characters || cotStage1.basicInfo.characters.length === 0) {
    return [];
  }

  return cotStage1.basicInfo.characters.map(charName => ({
    name: charName,
    role: '角色', // basicInfo.characters 只是字符串数组，没有 role 信息
  }));
}

/**
 * 提取涉及场景
 */
function extractScenes(cotStage1: ScriptAnalysis | undefined): Array<{ name: string; description: string }> {
  if (!cotStage1?.scenes || cotStage1.scenes.length === 0) {
    return [];
  }

  return cotStage1.scenes.map(scene => ({
    name: scene.id,
    description: scene.description || '（无描述）',
  }));
}

/**
 * 生成情绪曲线描述
 */
function generateEmotionCurve(cotStage1: ScriptAnalysis | undefined): string {
  if (!cotStage1?.emotionArc || cotStage1.emotionArc.length === 0) {
    return '（暂无情绪曲线数据）';
  }

  // 提取关键情绪点
  const emotionPoints = cotStage1.emotionArc.map(point => {
    const emotion = point.emotion || '未知';
    const intensity = point.intensity || 0;
    return `${emotion}（${intensity}）`;
  });

  // 用箭头连接
  return emotionPoints.join(' → ');
}

/**
 * 生成视觉风格描述
 */
function generateVisualStyle(cotStage2: VisualStrategy | undefined): string {
  if (!cotStage2?.overallStyle) {
    return '（暂无视觉风格数据）';
  }

  const parts: string[] = [];

  if (cotStage2.overallStyle.visualTone) {
    parts.push(cotStage2.overallStyle.visualTone);
  }

  // 🔧 修复：overallStyle 没有 mood 字段，使用 colorPalette.mood
  if (cotStage2.overallStyle.colorPalette?.mood) {
    parts.push(`氛围${cotStage2.overallStyle.colorPalette.mood}`);
  }

  if (cotStage2.overallStyle.colorPalette) {
    const palette = cotStage2.overallStyle.colorPalette;
    const colors = [palette.primary, palette.secondary, palette.accent].filter(Boolean).join('、');
    if (colors) {
      parts.push(`色调${colors}`);
    }
  }

  return parts.length > 0 ? parts.join('，') : '（暂无视觉风格数据）';
}

