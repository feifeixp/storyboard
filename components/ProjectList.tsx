/**
 * 项目列表组件
 * 显示所有项目，支持创建、选择、删除项目
 */

import React from 'react';
import { Project } from '../types/project';

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
}

export function ProjectList({
  projects,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: ProjectListProps) {
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getEpisodeStats = (project: Project) => {
    // 🔧 安全检查：确保 episodes 存在且是数组
    if (!project.episodes || !Array.isArray(project.episodes)) {
      return { total: 0, generated: 0 };
    }
    const total = project.episodes.length;
    const generated = project.episodes.filter(e => e.status !== 'draft').length;
    return { total, generated };
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* 标题 */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">
            🎬 Visionary Storyboard Studio
          </h1>
          <p className="text-gray-400">
            AI驱动的专业分镜脚本生成系统 | 支持多集剧本统一管理
          </p>
        </div>

        {/* 项目网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 新建项目卡片 */}
          <button
            onClick={onCreateProject}
            className="group h-48 border-2 border-dashed border-gray-600 rounded-xl
                       flex flex-col items-center justify-center gap-3
                       hover:border-blue-500 hover:bg-blue-900/20 transition-all"
          >
            <div className="w-14 h-14 rounded-full bg-gray-800 group-hover:bg-blue-900/50
                           flex items-center justify-center transition-all">
              <span className="text-3xl">➕</span>
            </div>
            <span className="text-gray-400 font-medium group-hover:text-blue-400">
              新建项目
            </span>
          </button>

          {/* 现有项目卡片 */}
          {(projects || []).map((project) => {
            const stats = getEpisodeStats(project);
            return (
              <div
                key={project.id}
                className="relative bg-gray-800 rounded-xl border border-gray-700
                          hover:border-blue-500 transition-all cursor-pointer group"
                onClick={() => onSelectProject(project)}
              >
                {/* 删除按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除项目「${project.name}」吗？此操作不可恢复。`)) {
                      onDeleteProject(project.id);
                    }
                  }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-gray-700
                            text-gray-400 hover:bg-red-900/50 hover:text-red-400
                            opacity-0 group-hover:opacity-100 transition-all
                            flex items-center justify-center text-sm"
                >
                  ✕
                </button>

                <div className="p-5">
                  {/* 项目图标和名称 */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600
                                   flex items-center justify-center text-white text-xl shadow">
                      📁
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate">
                        {project.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {project.settings?.genre || '未设置类型'}
                      </p>
                    </div>
                  </div>

                  {/* 统计信息 */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">📺</span>
                      <span className="text-gray-300">
                        {stats.total} 集
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">👥</span>
                      <span className="text-gray-300">
                        {project.characters?.length || 0} 角色
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">🏛️</span>
                      <span className="text-gray-300">
                        {project.scenes?.length || 0} 场景
                      </span>
                    </div>
                  </div>

                  {/* 进度条 */}
                  {stats.total > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>生成进度</span>
                        <span>{stats.generated}/{stats.total}</span>
                      </div>
                      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
                          style={{ width: `${(stats.generated / stats.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 更新时间 */}
                  <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500">
                    更新于 {formatDate(project.updatedAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 空状态 */}
        {(!projects || projects.length === 0) && (
          <div className="text-center mt-10 text-gray-500">
            <p>还没有项目，点击上方「新建项目」开始创作</p>
          </div>
        )}
      </div>
    </div>
  );
}

