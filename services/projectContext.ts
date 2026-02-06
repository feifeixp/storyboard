/**
 * 项目上下文构建服务
 * 为分镜生成提供项目级上下文（世界观、角色状态、上下集剧情等）
 */

import { Project, EpisodeSummary, SceneRef, CharacterState } from '../types/project';
import { CharacterRef } from '../types';

/**
 * 构建剧集上下文（用于分镜生成时注入）
 */
export function buildEpisodeContext(
  project: Project, 
  episodeNumber: number
): string {
  // 找到上下集和当前集概要
  const prevSummary = project.storyOutline.find(e => e.episodeNumber === episodeNumber - 1);
  const currentSummary = project.storyOutline.find(e => e.episodeNumber === episodeNumber);
  const nextSummary = project.storyOutline.find(e => e.episodeNumber === episodeNumber + 1);
  
  // 找到本集涉及的场景
  const relevantScenes = project.scenes.filter(s => 
    s.appearsInEpisodes.includes(episodeNumber)
  );

  let context = `
═══════════════════════════════════════════════════════════════
【项目上下文 - ${project.name}】
═══════════════════════════════════════════════════════════════

`;

  // 世界观
  if (project.settings.worldView) {
    context += `## 世界观
${project.settings.worldView}

`;
  }

  // 专有名词
  if (project.settings.keyTerms.length > 0) {
    context += `## 专有名词
${project.settings.keyTerms.map(t => `• ${t.term}：${t.explanation}`).join('\n')}

`;
  }

  // 剧情上下文
  context += `═══════════════════════════════════════════════════════════════
【剧情上下文】
═══════════════════════════════════════════════════════════════

`;

  if (prevSummary) {
    context += `## 上一集 (第${prevSummary.episodeNumber}集: ${prevSummary.title})
${prevSummary.summary}
${formatCharacterStates(prevSummary.characterStates)}

`;
  }

  if (currentSummary) {
    context += `## 本集 (第${currentSummary.episodeNumber}集: ${currentSummary.title}) ← 当前
${currentSummary.summary}
${formatCharacterStates(currentSummary.characterStates)}

`;
  }

  if (nextSummary) {
    context += `## 下一集预告 (第${nextSummary.episodeNumber}集)
${nextSummary.summary}

`;
  }

  // 场景设定
  if (relevantScenes.length > 0 || project.scenes.length > 0) {
    const scenesToShow = relevantScenes.length > 0 ? relevantScenes : project.scenes.slice(0, 5);
    context += `═══════════════════════════════════════════════════════════════
【场景设定】
═══════════════════════════════════════════════════════════════

${scenesToShow.map(s => `### ${s.name}
${s.description}
${s.visualPromptEn ? `视觉提示词(EN): ${s.visualPromptEn}` : ''}
`).join('\n')}
`;
  }

  // 角色设定
  if (project.characters.length > 0) {
    context += `═══════════════════════════════════════════════════════════════
【角色设定】
═══════════════════════════════════════════════════════════════

${project.characters.map(c => `### ${c.name} (${c.gender || '未知'})
${c.appearance || '外观描述待补充'}
`).join('\n')}
`;
  }

  return context;
}

/**
 * 格式化角色状态列表
 */
function formatCharacterStates(states: CharacterState[]): string {
  if (!states || states.length === 0) return '';
  
  return `角色状态：
${states.map(s => `• ${s.characterName}：${s.stateDescription}${s.location ? `（位置：${s.location}）` : ''}`).join('\n')}`;
}

/**
 * 生成简短的上下文摘要（用于UI显示）
 */
export function getContextSummary(project: Project, episodeNumber: number): string {
  const summary = project.storyOutline.find(e => e.episodeNumber === episodeNumber);
  if (!summary) return '';
  
  const parts: string[] = [];
  if (summary.title) parts.push(summary.title);
  if (summary.summary) parts.push(summary.summary);
  
  return parts.join(' - ');
}

/**
 * 检查项目是否有足够的上下文信息
 */
export function hasProjectContext(project: Project | null): boolean {
  if (!project) return false;
  
  return (
    project.settings.worldView.length > 0 ||
    project.characters.length > 0 ||
    project.scenes.length > 0 ||
    project.storyOutline.length > 0
  );
}

