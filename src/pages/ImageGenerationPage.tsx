import React from 'react';
import { Shot, StoryboardStyle, STORYBOARD_STYLES, CharacterRef } from '../../types';
import { ImageGenerationModel } from '../../services/aiImageGeneration';

interface ImageGenerationPageProps {
  // 分镜数据
  shots: Shot[];
  characterRefs: CharacterRef[];

  // 九宫格数据
  hqUrls: string[];
  setHqUrls: (urls: string[]) => void;

  // 风格选择
  selectedStyle: StoryboardStyle;
  setSelectedStyle: (style: StoryboardStyle) => void;
  showStyleCards: boolean;
  setShowStyleCards: (show: boolean) => void;
  customStylePrompt: string;
  setCustomStylePrompt: (prompt: string) => void;

  // 生图模型
  imageModel: string;
  setImageModel: (model: string) => void;
  availableImageModels: ImageGenerationModel[];
  isLoadingModels: boolean;

  // 上传相关
  uploadGridIndex: number | null;
  setUploadGridIndex: (index: number | null) => void;
  uploadDialogOpen: boolean;
  setUploadDialogOpen: (open: boolean) => void;
  uploadUrl: string;
  setUploadUrl: (url: string) => void;
  uploadFile: File | null;
  setUploadFile: (file: File | null) => void;

  // 生成相关
  isLoading: boolean;
  progressMsg: string;
  generateHQ: () => Promise<void>;
  handleRegenerateGrid: (gridIndex: number) => Promise<void>;
  handleUploadGrid: () => Promise<void>;
  handleRefreshGrid: (gridIndex: number, meta: any) => Promise<void>;
  applyGridsToShots: () => Promise<void>;

  // 中止控制
  abortController: AbortController | null;
  setAbortController: (controller: AbortController | null) => void;

  // 导航
  setCurrentStep: (step: number) => void;

  // 项目信息
  currentProject: any;
  currentEpisodeNumber: number | null;
}

/**
 * 图片生成页面
 * 九宫格分镜草图生成和管理
 */
export const ImageGenerationPage: React.FC<ImageGenerationPageProps> = ({
  shots,
  characterRefs,
  hqUrls,
  setHqUrls,
  selectedStyle,
  setSelectedStyle,
  showStyleCards,
  setShowStyleCards,
  customStylePrompt,
  setCustomStylePrompt,
  imageModel,
  setImageModel,
  availableImageModels,
  isLoadingModels,
  uploadGridIndex,
  setUploadGridIndex,
  uploadDialogOpen,
  setUploadDialogOpen,
  uploadUrl,
  setUploadUrl,
  uploadFile,
  setUploadFile,
  isLoading,
  progressMsg,
  generateHQ,
  handleRegenerateGrid,
  handleUploadGrid,
  handleRefreshGrid,
  applyGridsToShots,
  abortController,
  setAbortController,
  setCurrentStep,
  currentProject,
  currentEpisodeNumber,
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

          {/* 生图模型选择 */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-900/30 border border-purple-700 rounded-lg">
            <span className="text-xs text-purple-300 font-medium">生图模型:</span>
            {isLoadingModels ? (
              <span className="text-xs text-purple-400 animate-pulse">加载中...</span>
            ) : availableImageModels.length > 0 ? (
              <select
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
                disabled={isLoadingModels}
                className="text-sm font-bold text-purple-200 bg-transparent border-none outline-none cursor-pointer appearance-none pr-4"
                style={{ backgroundImage: 'none' }}
              >
                {availableImageModels.map((m) => (
                  <option key={m.model_name} value={m.model_name} className="bg-gray-900 text-purple-200">
                    {m.model_display_name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-bold text-purple-200">{imageModel}</span>
            )}
            {!isLoadingModels && availableImageModels.length > 1 && (
              <span className="text-[10px] text-purple-400">▼</span>
            )}
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
        {showStyleCards && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
            {STORYBOARD_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style)}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  selectedStyle.id === style.id
                    ? 'border-blue-500 bg-blue-900/30'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: style.previewColor }}
                  ></div>
                  <span className="font-bold text-sm text-white">{style.name}</span>
                </div>
                <p className="text-xs text-gray-400">{style.description}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 九宫格展示 */}
      <div className="space-y-4">
        {/* 生成控制面板 */}
        <div className="glass-card p-4 rounded-xl">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={generateHQ}
              disabled={isLoading || shots.length === 0}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🎨 生成九宫格
            </button>

            {hqUrls.filter(Boolean).length > 0 && (
              <>
                <button
                  onClick={applyGridsToShots}
                  disabled={isLoading}
                  className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✅ 应用到分镜表
                </button>

                <button
                  onClick={() => setHqUrls([])}
                  className="px-4 py-2 bg-gray-600 text-white font-medium text-xs rounded-md hover:bg-gray-500"
                >
                  🔄 重新生成
                </button>
              </>
            )}

            {abortController && (
              <button
                onClick={() => {
                  abortController.abort();
                  setAbortController(null);
                }}
                className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-all"
              >
                ⏸️ 停止生成
              </button>
            )}
          </div>
        </div>

        {/* 九宫格图片网格 */}
        {hqUrls.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {hqUrls.map((url, idx) => (
              <div key={idx} className="bg-gray-800 rounded-lg overflow-hidden border border-green-700">
                <div className="flex justify-between items-center px-3 py-2 bg-gray-900 border-b border-gray-700">
                  <span className="text-sm font-bold text-gray-200">第 {idx + 1} 页</span>
                  <div className="flex gap-2">
                    {url ? (
                      <>
                        <button
                          onClick={() => handleRegenerateGrid(idx)}
                          disabled={isLoading}
                          className="px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          title="重新生成这张九宫格"
                        >
                          🔄 重新生成
                        </button>
                        <button
                          onClick={() => {
                            setUploadGridIndex(idx);
                            setUploadDialogOpen(true);
                          }}
                          disabled={isLoading}
                          className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          title="上传自定义图片"
                        >
                          📤 上传
                        </button>
                        <a
                          href={url}
                          download={`storyboard_grid_${idx + 1}_${Date.now()}.png`}
                          className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        >
                          📥 下载
                        </a>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-orange-400">生成中...</span>
                        {shots[idx * 9]?.storyboardGridGenerationMeta?.taskCode && (
                          <button
                            onClick={() => handleRefreshGrid(idx, shots[idx * 9]?.storyboardGridGenerationMeta)}
                            disabled={isLoading}
                            className="px-2 py-1 bg-cyan-600 text-white rounded text-xs hover:bg-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed ml-2"
                            title="刷新任务状态，获取生成结果"
                          >
                            🔄 刷新任务
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {url ? (
                  <img src={url} alt={`Storyboard Grid ${idx + 1}`} className="w-full" />
                ) : (
                  <div className="h-64 bg-gray-700 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-gray-400">正在生成第 {idx + 1} 张九宫格...</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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

