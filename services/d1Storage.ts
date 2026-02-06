/**
 * Cloudflare D1 数据存储服务
 * 替代 localStorage，使用云端数据库
 */

import { Project, Episode } from '../types/project';
import { getAccessToken } from './auth';

// API 基础 URL（根据环境切换）
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.yourdomain.com';

/**
 * 通用 API 请求函数
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = getAccessToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'accessToken': accessToken || '',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================
// 项目管理
// ============================================

/**
 * 获取所有项目（仅元数据）
 */
export async function getAllProjects(): Promise<Project[]> {
  const data = await apiRequest<{ projects: any[] }>('/api/projects');
  return data.projects.map(p => ({
    ...p,
    createdAt: new Date(p.createdAt).toISOString(),
    updatedAt: new Date(p.updatedAt).toISOString(),
  }));
}

/**
 * 获取单个项目（完整数据）
 */
export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const project = await apiRequest<any>(`/api/projects/${projectId}`);
    return {
      ...project,
      createdAt: new Date(project.createdAt).toISOString(),
      updatedAt: new Date(project.updatedAt).toISOString(),
      episodes: project.episodes.map((ep: any) => ({
        ...ep,
        updatedAt: new Date(ep.updatedAt).toISOString(),
      })),
    };
  } catch (error) {
    console.error('Get project error:', error);
    return null;
  }
}

/**
 * 保存项目
 */
export async function saveProject(project: Project): Promise<void> {
  // 检查项目是否已存在
  const existing = await getProject(project.id);

  if (existing) {
    // 更新现有项目
    await apiRequest(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: project.name,
        settings: project.settings,
        characters: project.characters,
        scenes: project.scenes,
        volumes: project.volumes,
        antagonists: project.antagonists,
        storyOutline: project.storyOutline,
      }),
    });
  } else {
    // 创建新项目
    await apiRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: project.name,
        settings: project.settings,
        characters: project.characters,
        scenes: project.scenes,
        volumes: project.volumes,
        antagonists: project.antagonists,
        storyOutline: project.storyOutline,
      }),
    });
  }

  console.log(`[D1存储] 项目保存成功: ${project.name}`);
}

/**
 * 删除项目
 */
export async function deleteProject(projectId: string): Promise<void> {
  await apiRequest(`/api/projects/${projectId}`, {
    method: 'DELETE',
  });

  console.log(`[D1存储] 项目删除成功: ${projectId}`);
}

/**
 * 创建新项目
 */
export async function createProject(name: string): Promise<Project> {
  const project = await apiRequest<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      settings: {
        genre: '',
        worldView: '',
        visualStyle: '',
        keyTerms: [],
      },
      characters: [],
      scenes: [],
      storyOutline: [],
    }),
  });

  return project;
}

// ============================================
// 剧集管理
// ============================================

/**
 * 获取项目的所有剧集
 */
export async function getEpisodes(projectId: string): Promise<Episode[]> {
  const data = await apiRequest<{ episodes: any[] }>(`/api/episodes?projectId=${projectId}`);
  return data.episodes.map(ep => ({
    ...ep,
    updatedAt: new Date(ep.updatedAt).toISOString(),
  }));
}

/**
 * 获取单个剧集
 */
export async function getEpisode(episodeId: string): Promise<Episode | null> {
  try {
    const episode = await apiRequest<any>(`/api/episodes/${episodeId}`);
    return {
      ...episode,
      updatedAt: new Date(episode.updatedAt).toISOString(),
    };
  } catch (error) {
    console.error('Get episode error:', error);
    return null;
  }
}

/**
 * 保存剧集
 */
export async function saveEpisode(projectId: string, episode: Episode): Promise<void> {
  await apiRequest('/api/episodes', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      script: episode.script,
      cleaningResult: episode.cleaningResult,
      shots: episode.shots,
      status: episode.status,
    }),
  });

  console.log(`[D1存储] 剧集保存成功: 第${episode.episodeNumber}集`);
}

/**
 * 更新剧集
 */
export async function updateEpisode(projectId: string, episode: Episode): Promise<void> {
  await saveEpisode(projectId, episode);
}

// ============================================
// 当前项目管理
// ============================================

const CURRENT_PROJECT_KEY = 'visionary_current_project_id';

/**
 * 获取当前项目ID
 */
export function getCurrentProjectId(): string | null {
  return localStorage.getItem(CURRENT_PROJECT_KEY);
}

/**
 * 设置当前项目ID
 */
export function setCurrentProjectId(projectId: string | null): void {
  if (projectId) {
    localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
  } else {
    localStorage.removeItem(CURRENT_PROJECT_KEY);
  }
}

// ============================================
// 数据迁移工具
// ============================================

/**
 * 从 localStorage 迁移数据到 D1
 */
export async function migrateFromLocalStorage(): Promise<{
  success: boolean;
  migratedProjects: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let migratedProjects = 0;

  try {
    // 读取 localStorage 中的项目数据
    const projectsData = localStorage.getItem('visionary_projects');
    if (!projectsData) {
      return { success: true, migratedProjects: 0, errors: [] };
    }

    // 解压缩数据（如果使用了 LZ-String）
    let projects: Project[];
    try {
      const LZString = await import('lz-string');
      const decompressed = LZString.decompressFromUTF16(projectsData);
      projects = decompressed ? JSON.parse(decompressed) : JSON.parse(projectsData);
    } catch {
      projects = JSON.parse(projectsData);
    }

    // 逐个迁移项目
    for (const project of projects) {
      try {
        await saveProject(project);
        migratedProjects++;
      } catch (error) {
        errors.push(`项目 "${project.name}" 迁移失败: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      migratedProjects,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      migratedProjects,
      errors: [`迁移失败: ${error}`],
    };
  }
}

/**
 * 导出项目到本地文件（备份）
 */
export async function exportProjectToFile(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) {
    throw new Error('项目不存在');
  }

  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name}_backup_${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * 从本地文件导入项目
 */
export async function importProjectFromFile(file: File): Promise<Project> {
  const text = await file.text();
  const project: Project = JSON.parse(text);

  // 生成新的ID避免冲突
  project.id = `proj-${Date.now()}`;
  project.episodes.forEach((ep, i) => {
    ep.id = `ep-${Date.now()}-${i}`;
  });

  await saveProject(project);
  return project;
}

