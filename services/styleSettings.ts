/**
 * 风格设置工具函数
 * 用于解析项目风格配置，统一角色/场景/九宫格的风格来源
 * 
 * 核心原则：
 * - projectStyleId 是唯一权威来源（用于角色/场景/九宫格）
 * - storyboardStyleOverride 是九宫格的可选覆盖（如线稿草图）
 * 
 * 创建时间：2025-02-22
 */

import { STORYBOARD_STYLES, StoryboardStyle, createCustomStyle } from '../types';
import { Project } from '../types/project';

/**
 * 解析项目风格配置，返回 StoryboardStyle 对象
 * 
 * @param projectStyleId - 项目风格ID（'anime_2d' | 'custom' | null）
 * @param customPromptCn - 自定义风格中文描述（仅当 projectStyleId='custom' 时使用）
 * @param customPromptEn - 自定义风格英文后缀（仅当 projectStyleId='custom' 时使用）
 * @returns StoryboardStyle 对象，如果未设置则返回 null
 */
export function resolveProjectStyle(
  projectStyleId: string | null | undefined,
  customPromptCn?: string,
  customPromptEn?: string
): StoryboardStyle | null {
  // 未设置项目风格
  if (!projectStyleId) {
    return null;
  }

  // 自定义风格
  if (projectStyleId === 'custom') {
    const promptSuffix = customPromptEn || customPromptCn || '';
    if (!promptSuffix) {
      return null; // 自定义风格但没有提示词，视为未设置
    }
    return createCustomStyle(promptSuffix);
  }

  // 预设风格
  const style = STORYBOARD_STYLES.find(s => s.id === projectStyleId);
  return style || null;
}

/**
 * 解析风格配置对象（通用）
 * 
 * @param styleConfig - 风格配置对象 { styleId, customPromptCn?, customPromptEn? }
 * @returns StoryboardStyle 对象，如果未设置则返回 null
 */
export function resolveStyle(styleConfig: {
  styleId: string;
  customPromptCn?: string;
  customPromptEn?: string;
} | null | undefined): StoryboardStyle | null {
  if (!styleConfig) {
    return null;
  }

  return resolveProjectStyle(
    styleConfig.styleId,
    styleConfig.customPromptCn,
    styleConfig.customPromptEn
  );
}

/**
 * 获取九宫格生效的风格（考虑覆盖）
 * 
 * 优先级：
 * 1. storyboardStyleOverride（如果设置）
 * 2. projectStyleId（默认）
 * 
 * @param project - 项目对象
 * @returns StoryboardStyle 对象，如果未设置则返回 null
 */
export function getEffectiveStoryboardStyle(project: Project): StoryboardStyle | null {
  const settings = project.settings;

  // 优先使用九宫格覆盖风格
  if (settings.storyboardStyleOverride) {
    const overrideStyle = resolveStyle(settings.storyboardStyleOverride);
    if (overrideStyle) {
      return overrideStyle;
    }
  }

  // 回退到项目统一风格
  return resolveProjectStyle(
    settings.projectStyleId,
    settings.projectStyleCustomPromptCn,
    settings.projectStyleCustomPromptEn
  );
}

/**
 * 获取角色/场景生效的风格（始终使用项目风格）
 * 
 * @param project - 项目对象
 * @returns StoryboardStyle 对象，如果未设置则返回 null
 */
export function getEffectiveCharacterSceneStyle(project: Project): StoryboardStyle | null {
  return resolveProjectStyle(
    project.settings.projectStyleId,
    project.settings.projectStyleCustomPromptCn,
    project.settings.projectStyleCustomPromptEn
  );
}

/**
 * 检查项目是否已设置渲染风格
 * 
 * @param project - 项目对象
 * @returns true 表示已设置，false 表示未设置
 */
export function hasProjectStyle(project: Project): boolean {
  return getEffectiveCharacterSceneStyle(project) !== null;
}

/**
 * 获取风格的英文渲染后缀（promptSuffix）
 * 
 * @param style - StoryboardStyle 对象
 * @returns 英文渲染后缀，如果为空则返回空字符串
 */
export function getStylePromptSuffix(style: StoryboardStyle | null): string {
  return style?.promptSuffix || '';
}

/**
 * 获取风格的中文渲染后缀（promptSuffixCn）
 * 
 * @param style - StoryboardStyle 对象
 * @returns 中文渲染后缀，如果为空则返回空字符串
 */
export function getStylePromptSuffixCn(style: StoryboardStyle | null): string {
  return style?.promptSuffixCn || '';
}

