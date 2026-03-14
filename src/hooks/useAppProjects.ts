import { useState, useRef, useEffect } from 'react';
import { AppStep } from '../../types';
import { Project } from '../../types/project';
import { loadFromStorage, STORAGE_KEYS } from '../utils/storage';
import { getAllProjects, getProject, getCurrentProjectId, setCurrentProjectId } from '../../services/d1Storage';

export function useAppProjects(
  loggedIn: boolean, 
  setCurrentStep: (step: AppStep) => void,
  setCharacterRefs: (chars: any[]) => void
) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  
  // projectRef：用于在异步闭包中访问最新的 project 状态（避免闭包旧值）
  const projectRef = useRef<Project | null>(null);
  useEffect(() => {
    projectRef.current = currentProject;
  }, [currentProject]);

  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number | null>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENT_EPISODE_NUMBER, null)
  );

  // Dashboard 快捷导航状态
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'characters' | 'scenes'>('overview');
  const [pendingGenerations, setPendingGenerations] = useState<{ characters: string[], scenes: string[] }>({ characters: [], scenes: [] });

  // 加载项目列表和当前项目（仅在登录后执行）
  useEffect(() => {
    if (!loggedIn) return;

    const loadProjects = async () => {
      const allProjects = await getAllProjects();
      setProjects(allProjects);

      // 加载当前项目
      const id = getCurrentProjectId();
      if (id) {
        const project = await getProject(id);

        // 如果项目不存在（404），清除当前项目ID并返回项目列表
        if (!project) {
          console.warn(`[App] 项目 ${id} 不存在，清除当前项目ID`);
          setCurrentProjectId(null);
          setCurrentProject(null);
          setCurrentStep(AppStep.PROJECT_LIST);
          alert('项目不存在或已被删除，请重新选择项目');
          return;
        }

        setCurrentProject(project);
      }
    };

    loadProjects();
  }, [loggedIn, setCurrentStep]);

  // 监听批量生成完成事件，刷新项目数据以确保图片显示正确
  useEffect(() => {
    if (!loggedIn) return;

    const handleBatchGenerationComplete = async (event: CustomEvent) => {
      const { type } = event.detail || {};
      if (type !== 'character') return;

      try {
        // 重新获取当前项目的数据
        if (currentProject) {
          const updatedProject = await getProject(currentProject.id);
          if (updatedProject) {
            setCurrentProject(updatedProject);
            // 同步角色库
            if (updatedProject.characters) {
              setCharacterRefs(updatedProject.characters);
            }
            console.log('[App] 批量生成完成，已刷新项目数据');
          }
        }
      } catch (error) {
        console.error('[App] 刷新项目数据失败:', error);
      }
    };

    window.addEventListener('neodomain:batch-generation-complete', handleBatchGenerationComplete);
    return () => {
      window.removeEventListener('neodomain:batch-generation-complete', handleBatchGenerationComplete);
    };
  }, [loggedIn, currentProject, setCharacterRefs]);

  return {
    projects, setProjects,
    currentProject, setCurrentProject, projectRef,
    currentEpisodeNumber, setCurrentEpisodeNumber,
    dashboardTab, setDashboardTab,
    pendingGenerations, setPendingGenerations
  };
}
