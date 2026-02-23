import React from 'react';
import { Shot } from '../../types';

interface ImageGenerationPageProps {
  // 分镜数据
  shots: Shot[];

  // 九宫格数据
  hqUrls: string[];
  setHqUrls: (urls: string[]) => void;

  // 风格选择
  selectedStyle: any;
  setSelectedStyle: (style: any) => void;
  showStyleCards: boolean;
  setShowStyleCards: (show: boolean) => void;
  customStylePrompt: string;
  setCustomStylePrompt: (prompt: string) => void;

  // 生图模型
  imageModel: string;

  // 上传相关
  uploadGridIndex: number | null;
  setUploadGridIndex: (index: number | null) => void;
  openUploadDialog: (index: number) => void;
  updateGridUrl: (index: number, url: string) => void;
  updateAllGridUrls: (urls: string[]) => void;

  // 导航
  setCurrentStep: (step: number) => void;

  // 渲染函数
  renderStyleCards: () => React.ReactNode;
  renderGrids: () => React.ReactNode;
}

/**
 * 图片生成页面
 * 九宫格分镜草图生成和管理
 */
export const ImageGenerationPage: React.FC<ImageGenerationPageProps> = ({
  shots,
  hqUrls,
  selectedStyle,
  setSelectedStyle,
  showStyleCards,
  setShowStyleCards,
  customStylePrompt,
  setCustomStylePrompt,
  imageModel,
  setCurrentStep,
  renderStyleCards,
  renderGrids,
}) => {
  return (
    <div className="space-y-4 pb-20">
      {/* 顶部栏 */}
      <div className="flex justify-between items-center bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div>
          <h2 className="text-xl font-bold text-white">🎨 九宫格分镜草图</h2>
          <p className="text-gray-400 text-xs mt-1">
            共 {shots.length} 个镜头 → {Math.ceil(shots.length / 9)} 张九宫格图 | 风格: {selectedStyle.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentStep(5)} // AppStep.EXTRACT_PROMPTS
            className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-md font-medium text-xs hover:bg-gray-600 transition-all"
          >
            ← 返回提示词
          </button>
        </div>
      </div>

      {/* 控制面板 */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        {/* 顶部操作栏 */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* 当前风格显示 */}
          <button
            onClick={() => setShowStyleCards(!showStyleCards)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg transition-all"
          >
            <span className="text-xs text-gray-400 font-medium">风格:</span>
            <span className="text-sm font-bold" style={{ color: selectedStyle.previewColor }}>
              {selectedStyle.name}
            </span>
            <span className="text-xs text-gray-400">{showStyleCards ? '▲' : '▼'}</span>
          </button>

          {/* 生图模型：锁定 nanobanana-pro */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-900/30 border border-purple-700 rounded-lg">
            <span className="text-xs text-purple-300 font-medium">生图模型:</span>
            <span className="text-sm font-bold text-purple-200">{imageModel}</span>
            <span className="text-[10px] text-purple-400">(已锁定)</span>
          </div>

          {/* 自定义风格提示词 */}
          {selectedStyle.id === 'custom' && (
            <div className="flex-1 min-w-[300px]">
              <input
                type="text"
                value={customStylePrompt}
                onChange={(e) => setCustomStylePrompt(e.target.value)}
                placeholder="输入自定义风格提示词，如：watercolor painting, soft colors..."
                className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          )}
        </div>

        {/* 风格卡片 */}
        {showStyleCards && renderStyleCards()}
      </div>

      {/* 九宫格展示 */}
      {renderGrids()}

      {/* 统计信息 */}
      <div className="glass-card p-4 rounded-xl">
        <div className="flex items-center gap-6 text-xs">
          <span className="text-[var(--color-text-secondary)]">
            总镜头: <strong className="text-[var(--color-text-primary)]">{shots.length}</strong>
          </span>
          <span className="text-emerald-400">
            已生成: <strong>{hqUrls.filter(url => url).length}</strong>
          </span>
          <span className="text-amber-400">
            待生成: <strong>{hqUrls.filter(url => !url).length}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};

