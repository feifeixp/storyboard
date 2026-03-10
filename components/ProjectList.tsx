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
    <div className="p-4 md:p-8 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* 标题 */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400 mb-3 drop-shadow-sm">
            🎬 NeoAI - 导演助手
          </h1>
          <p className="text-gray-400 text-sm md:text-base">
            AI驱动的专业分镜脚本生成系统 | 支持多集剧本统一管理
          </p>
        </div>

        {/* 项目网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* 新建项目卡片 */}
          <button
            onClick={onCreateProject}
            className="group h-[200px] border-2 border-dashed border-white/10 rounded-2xl
                       flex flex-col items-center justify-center gap-4 bg-[#1a1d2d]/30 backdrop-blur-sm
                       hover:border-purple-500/50 hover:bg-[#1a1d2d]/60 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(139,92,246,0.15)] hover:-translate-y-1"
          >
            <div className="w-16 h-16 rounded-full bg-black/40 border border-white/5 group-hover:bg-purple-500/20 group-hover:border-purple-500/30
                           flex items-center justify-center transition-all duration-300 shadow-inner">
              <span className="text-3xl text-gray-500 group-hover:text-purple-400 transition-colors">➕</span>
            </div>
            <span className="text-gray-400 font-medium group-hover:text-gray-200 transition-colors">
              新建故事板项目
            </span>
          </button>

          {/* 现有项目卡片 */}
          {(projects || []).map((project) => {
            const stats = getEpisodeStats(project);
            return (
              <div
                key={project.id}
                className="group relative rounded-2xl overflow-hidden bg-[#1a1d2d]/80 backdrop-blur-md border border-white/10 hover:border-purple-500/50 shadow-lg hover:shadow-[0_8px_30px_rgba(139,92,246,0.15)] transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col h-[200px]"
                onClick={() => onSelectProject(project)}
              >
                {/* 顶部指示条 */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"></div>

                {/* 删除按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除项目「${project.name}」吗？此操作不可恢复。`)) {
                      onDeleteProject(project.id);
                    }
                  }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md
                            text-gray-400 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/50
                            opacity-0 group-hover:opacity-100 transition-all duration-300
                            flex items-center justify-center text-sm border border-white/10 z-20"
                  title="删除项目"
                >
                  ✕
                </button>

                <div className="p-5 flex flex-col flex-grow relative z-10">
                  {/* 项目图标和名称 */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-800
                                   flex items-center justify-center text-white text-xl shadow-inner border border-white/10 flex-shrink-0">
                      📁
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <h3 className="font-bold text-gray-100 truncate text-lg drop-shadow-sm group-hover:text-white transition-colors">
                        {project.name}
                      </h3>
                      <p className="text-xs text-indigo-300/80 mt-1 truncate">
                        {project.settings?.genre || '未设置类型'}
                      </p>
                    </div>
                  </div>

                  {/* 统计信息 Badges */}
                  <div className="flex flex-wrap gap-2 text-xs mb-auto">
                    <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-1 rounded-md">
                      <span>📺</span> {stats.total} 集
                    </div>
                    <div className="flex items-center gap-1.5 bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-1 rounded-md">
                      <span>👥</span> {project.characters?.length || 0} 角
                    </div>
                    <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-1 rounded-md">
                      <span>🏛️</span> {project.scenes?.length || 0} 景
                    </div>
                  </div>

                  {/* 进度条 & 更新时间 */}
                  <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
                    {stats.total > 0 && (
                      <div>
                        <div className="flex justify-between text-[10px] text-gray-400 mb-1.5 font-medium">
                          <span>生成进度</span>
                          <span className="text-gray-300">{stats.generated}/{stats.total}</span>
                        </div>
                        <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                            style={{ width: `${(stats.generated / stats.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="text-[10px] text-gray-500 text-right mt-1">
                      更新于 {formatDate(project.updatedAt)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 空状态 */}
        {(!projects || projects.length === 0) && (
          <div className="text-center mt-12 text-gray-500 bg-black/20 backdrop-blur-sm border border-white/5 rounded-2xl py-12 max-w-md mx-auto">
            <span className="text-4xl mb-4 block opacity-50">📂</span>
            <p>还没有项目，点击上方「新建故事板项目」开始创作</p>
          </div>
        )}
      </div>
    </div>
  );
}

