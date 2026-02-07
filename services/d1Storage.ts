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
 * 🔧 支持超时控制和自动重试
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 3,
  timeout: number = 30000 // 30秒超时
): Promise<T> {
  const accessToken = getAccessToken();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 创建超时控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'accessToken': accessToken || '',
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const isTimeout = error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'));
      const isNetworkError = error instanceof Error && error.message.includes('Failed to fetch');

      console.warn(`[API请求] ${endpoint} 第${attempt}次尝试失败:`, error);

      // 如果是超时或网络错误，且不是最后一次尝试，则重试
      if ((isTimeout || isNetworkError) && !isLastAttempt) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避，最多5秒
        console.log(`[API请求] ${delay}ms 后重试 (${attempt + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // 最后一次尝试失败，或非网络错误，直接抛出
      throw error;
    }
  }

  throw new Error('请求失败：已达到最大重试次数');
}

// ============================================
// 项目管理
// ============================================

/**
 * 获取所有项目（仅元数据）
 */
export async function getAllProjects(): Promise<Project[]> {
  try {
    const data = await apiRequest<{ projects: any[] }>('/api/projects');

    // 🆕 验证返回数据格式
    if (!data || !Array.isArray(data.projects)) {
      console.error('Invalid projects data format:', data);
      return [];
    }

    return data.projects.map(p => ({
      ...p,
      // 🆕 处理 D1 返回的蛇形命名和数字时间戳
      createdAt: new Date(p.created_at || p.createdAt).toISOString(),
      updatedAt: new Date(p.updated_at || p.updatedAt).toISOString(),
    }));
  } catch (error) {
    console.error('Get all projects error:', error);
    // 🆕 返回空数组而不是抛出错误
    return [];
  }
}

/**
 * 获取单个项目（完整数据）
 */
export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const project = await apiRequest<any>(`/api/projects/${projectId}`);

    // 🔧 确保 episodes 存在且是数组
    const episodes = Array.isArray(project.episodes)
      ? project.episodes.map((ep: any) => ({
          ...ep,
          updatedAt: new Date(ep.updated_at || ep.updatedAt).toISOString(),
        }))
      : [];

    return {
      ...project,
      // 🆕 处理 D1 返回的蛇形命名和数字时间戳
      createdAt: new Date(project.created_at || project.createdAt).toISOString(),
      updatedAt: new Date(project.updated_at || project.updatedAt).toISOString(),
      episodes,
    };
  } catch (error) {
    console.error('Get project error:', error);
    return null;
  }
}

/**
 * 保存项目（UPSERT 模式）
 * 🔧 直接使用 POST（后端已实现 UPSERT），不再先调用 getProject
 *    避免 getProject 超时返回 null 导致重复创建项目
 */
export async function saveProject(project: Project): Promise<void> {
  // 🔧 直接 POST，后端会自动判断是 INSERT 还是 UPDATE
  await apiRequest('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      id: project.id,
      name: project.name,
      settings: project.settings,
      characters: project.characters,
      scenes: project.scenes,
      volumes: project.volumes,
      antagonists: project.antagonists,
      storyOutline: project.storyOutline,
    }),
  });

  console.log(`[D1存储] 项目保存成功: ${project.name}`);

  // 🔧 同时保存所有剧集到 episodes 表
  if (project.episodes && Array.isArray(project.episodes) && project.episodes.length > 0) {
    console.log(`[D1存储] 开始保存 ${project.episodes.length} 个剧集...`);

    // 并行保存所有剧集（提升性能）
    await Promise.all(
      project.episodes.map(episode => saveEpisode(project.id, episode))
    );

    console.log(`[D1存储] ${project.episodes.length} 个剧集保存成功`);
  }
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

