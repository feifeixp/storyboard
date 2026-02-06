/**
 * 项目存储服务
 * 使用 localStorage 持久化项目数据
 * 使用 LZ-String 压缩数据以节省存储空间
 */

import { Project, Episode, createEmptyProject, createEmptyEpisode } from '../types/project';
import LZString from 'lz-string';

const STORAGE_KEY_PROJECTS = 'visionary_projects';
const STORAGE_KEY_CURRENT_PROJECT = 'visionary_current_project_id';

// ============================================
// 压缩/解压缩工具
// ============================================

/**
 * 压缩数据
 */
function compressData(data: any): string {
  const json = JSON.stringify(data);
  return LZString.compressToUTF16(json);
}

/**
 * 解压缩数据
 */
function decompressData(compressed: string): any {
  const json = LZString.decompressFromUTF16(compressed);
  if (!json) return null;
  return JSON.parse(json);
}

/**
 * 检查存储空间
 */
function checkStorageQuota(data: string): { available: boolean; size: number; quota: number } {
  const size = new Blob([data]).size;
  const quota = 5 * 1024 * 1024; // 假设 5MB 限制
  return {
    available: size < quota * 0.9, // 留10%余量
    size,
    quota
  };
}

// ============================================
// 项目列表管理
// ============================================

/**
 * 获取所有项目（仅元数据，不含剧集详情）
 */
export function getAllProjects(): Project[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (!data) return [];

    // 尝试解压缩（新格式）
    try {
      const decompressed = decompressData(data);
      if (decompressed) return decompressed;
    } catch (e) {
      // 如果解压失败，尝试直接解析（旧格式）
      console.log('[存储] 检测到旧格式数据，尝试直接解析...');
    }

    // 兼容旧格式（未压缩的 JSON）
    return JSON.parse(data);
  } catch (error) {
    console.error('读取项目列表失败:', error);
    return [];
  }
}

/**
 * 获取单个项目
 */
export function getProject(projectId: string): Project | null {
  const projects = getAllProjects();
  return projects.find(p => p.id === projectId) || null;
}

/**
 * 保存项目（创建或更新）
 */
export function saveProject(project: Project): void {
  const projects = getAllProjects();
  const index = projects.findIndex(p => p.id === project.id);

  project.updatedAt = new Date().toISOString();

  if (index >= 0) {
    projects[index] = project;
  } else {
    projects.push(project);
  }

  // 压缩数据
  const compressed = compressData(projects);

  // 检查存储空间
  const quota = checkStorageQuota(compressed);
  console.log(`[存储] 压缩后大小: ${(quota.size / 1024).toFixed(2)} KB / ${(quota.quota / 1024).toFixed(2)} KB`);

  if (!quota.available) {
    const originalSize = new Blob([JSON.stringify(projects)]).size;
    const compressionRatio = ((1 - quota.size / originalSize) * 100).toFixed(1);
    throw new Error(
      `存储空间不足！\n` +
      `原始大小: ${(originalSize / 1024).toFixed(2)} KB\n` +
      `压缩后: ${(quota.size / 1024).toFixed(2)} KB (节省 ${compressionRatio}%)\n` +
      `限制: ${(quota.quota / 1024).toFixed(2)} KB\n\n` +
      `建议：\n` +
      `1. 删除不需要的项目\n` +
      `2. 减少单个项目的集数\n` +
      `3. 导出项目到本地文件`
    );
  }

  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS, compressed);
    console.log(`[存储] 项目保存成功，共 ${projects.length} 个项目`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error(
        `浏览器存储空间已满！\n\n` +
        `当前数据大小: ${(quota.size / 1024).toFixed(2)} KB\n` +
        `建议：\n` +
        `1. 删除旧项目释放空间\n` +
        `2. 导出项目到本地文件\n` +
        `3. 清理浏览器缓存`
      );
    }
    throw error;
  }
}

/**
 * 删除项目
 */
export function deleteProject(projectId: string): void {
  const projects = getAllProjects().filter(p => p.id !== projectId);
  const compressed = compressData(projects);
  localStorage.setItem(STORAGE_KEY_PROJECTS, compressed);
  console.log(`[存储] 项目删除成功，剩余 ${projects.length} 个项目`);

  // 如果删除的是当前项目，清除当前项目标记
  if (getCurrentProjectId() === projectId) {
    setCurrentProjectId(null);
  }
}

/**
 * 创建新项目
 */
export function createProject(name: string): Project {
  const project = createEmptyProject(name);
  saveProject(project);
  return project;
}

// ============================================
// 当前项目管理
// ============================================

/**
 * 获取当前项目ID
 */
export function getCurrentProjectId(): string | null {
  return localStorage.getItem(STORAGE_KEY_CURRENT_PROJECT);
}

/**
 * 设置当前项目ID
 */
export function setCurrentProjectId(projectId: string | null): void {
  if (projectId) {
    localStorage.setItem(STORAGE_KEY_CURRENT_PROJECT, projectId);
  } else {
    localStorage.removeItem(STORAGE_KEY_CURRENT_PROJECT);
  }
}

/**
 * 获取当前项目
 */
export function getCurrentProject(): Project | null {
  const projectId = getCurrentProjectId();
  if (!projectId) return null;
  return getProject(projectId);
}

// ============================================
// 剧集管理
// ============================================

/**
 * 添加剧集到项目
 */
export function addEpisodeToProject(
  projectId: string, 
  episodeNumber: number, 
  script: string
): Episode | null {
  const project = getProject(projectId);
  if (!project) return null;
  
  // 检查是否已存在该集
  const existing = project.episodes.find(e => e.episodeNumber === episodeNumber);
  if (existing) {
    existing.script = script;
    existing.updatedAt = new Date().toISOString();
    saveProject(project);
    return existing;
  }
  
  // 创建新剧集
  const episode = createEmptyEpisode(episodeNumber, script);
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  saveProject(project);
  return episode;
}

/**
 * 更新剧集
 */
export function updateEpisode(projectId: string, episode: Episode): void {
  const project = getProject(projectId);
  if (!project) return;
  
  const index = project.episodes.findIndex(e => e.id === episode.id);
  if (index >= 0) {
    episode.updatedAt = new Date().toISOString();
    project.episodes[index] = episode;
    saveProject(project);
  }
}

/**
 * 获取剧集
 */
export function getEpisode(projectId: string, episodeNumber: number): Episode | null {
  const project = getProject(projectId);
  if (!project) return null;
  return project.episodes.find(e => e.episodeNumber === episodeNumber) || null;
}

/**
 * 删除剧集
 */
export function deleteEpisode(projectId: string, episodeId: string): void {
  const project = getProject(projectId);
  if (!project) return;
  
  project.episodes = project.episodes.filter(e => e.id !== episodeId);
  saveProject(project);
}

