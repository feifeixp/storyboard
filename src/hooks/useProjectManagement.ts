import React, { useState, useEffect } from 'react';
import { Project } from '../../types/project';
import { getAllProjects } from '../../services/d1Storage';

/**
 * 项目管理 Hook
 * 负责项目的创建、选择、删除等功能
 */
export function useProjectManagement() {
  // 项目列表
  const [projects, setProjects] = useState<Project[]>([]);
  
  // 当前项目
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  // 当前剧集
  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number | null>(null);

  /**
   * 加载所有项目
   */
  const loadProjects = async () => {
    try {
      const allProjects = await getAllProjects();
      setProjects(allProjects);
    } catch (error) {
      console.error('[项目管理] 加载项目列表失败:', error);
    }
  };

  /**
   * 初始化时加载项目列表
   */
  useEffect(() => {
    loadProjects();
  }, []);

  /**
   * 选择项目
   */
  const selectProject = (project: Project) => {
    setCurrentProject(project);
    setCurrentProjectId(project.id);
  };

  /**
   * 清除当前项目
   */
  const clearCurrentProject = () => {
    setCurrentProject(null);
    setCurrentProjectId(null);
    setCurrentEpisodeNumber(null);
  };

  /**
   * 选择剧集
   */
  const selectEpisode = (episodeNumber: number) => {
    setCurrentEpisodeNumber(episodeNumber);
  };

  /**
   * 清除当前剧集
   */
  const clearCurrentEpisode = () => {
    setCurrentEpisodeNumber(null);
  };

  /**
   * 更新当前项目
   */
  const updateCurrentProject = (updater: (prev: Project) => Project) => {
    setCurrentProject(prev => {
      if (!prev) return prev;
      return updater(prev);
    });
  };

  /**
   * 刷新项目列表
   */
  const refreshProjects = async () => {
    await loadProjects();
  };

  return {
    // 状态
    projects,
    currentProject,
    currentProjectId,
    currentEpisodeNumber,

    // 方法
    setProjects,
    setCurrentProject,
    setCurrentProjectId,
    setCurrentEpisodeNumber,
    loadProjects,
    selectProject,
    clearCurrentProject,
    selectEpisode,
    clearCurrentEpisode,
    updateCurrentProject,
    refreshProjects,
  };
}

