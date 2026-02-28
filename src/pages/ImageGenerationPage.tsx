import React, { useState, useMemo } from 'react';
import { Shot, StoryboardStyle, STORYBOARD_STYLES, CharacterRef } from '../../types';
import { ImageGenerationModel } from '../../services/aiImageGeneration';
import type { SceneRef } from '../../types/project';

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

  // 场景库（用于生成参考上下文）
  scenes?: SceneRef[];
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
  scenes,
}) => {
  const GRID_SIZE = 9;

  // 记录哪些九宫格面板被展开（显示上下文）
  const [expandedGrids, setExpandedGrids] = useState<Set<number>>(new Set());
  const toggleGrid = (idx: number) =>
    setExpandedGrids(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  // 合并场景来源（prop 优先，否则从 currentProject 取）
  const allScenes: SceneRef[] = useMemo(
    () => scenes ?? (currentProject?.scenes as SceneRef[] | undefined) ?? [],
    [scenes, currentProject]
  );

  // ── 警告判断 ──────────────────────────────────────────
  const hasCharacters = characterRefs.length > 0;
  const hasScenes = allScenes.length > 0;
  const charsWithoutImage = useMemo(
    () => characterRefs.filter(c => !c.imageSheetUrl && !(c.imageUrls && c.imageUrls.length > 0)),
    [characterRefs]
  );
  const scenesWithoutImage = useMemo(
    () => allScenes.filter(s => !s.imageSheetUrl),
    [allScenes]
  );

  // ── 每格上下文（角色 + 场景） ─────────────────────────
  const totalGrids = Math.ceil(shots.length / GRID_SIZE);

  const getGridContext = (gridIdx: number) => {
    const startIdx = gridIdx * GRID_SIZE;
    const gridShots = shots.slice(startIdx, startIdx + GRID_SIZE);

    // 收集该格出现的角色ID
    const charIds = new Set<string>();
    gridShots.forEach(s => s.assignedCharacterIds?.forEach(id => charIds.add(id)));
    const chars = characterRefs.filter(c => charIds.has(c.id));

    // 收集该格涉及的场景ID
    const sceneIds = new Set<string>();
    gridShots.forEach(s => { if (s.sceneId) sceneIds.add(s.sceneId); });
    const usedScenes = allScenes.filter(s => sceneIds.has(s.id));

    return { gridShots, chars, usedScenes };
  };

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

      {/* ── 一致性警告横幅 ────────────────────────────────── */}
      {(!hasCharacters || !hasScenes || charsWithoutImage.length > 0 || scenesWithoutImage.length > 0) && (
        <div className="bg-amber-900/40 border border-amber-600 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
            ⚠️ 视觉一致性提醒
          </div>
          {!hasCharacters && (
            <p className="text-amber-200 text-xs">
              📌 <strong>尚未创建角色</strong>——九宫格将无法保持角色外观一致性。建议先在「角色库」中创建并上传角色设定图。
            </p>
          )}
          {hasCharacters && charsWithoutImage.length > 0 && (
            <p className="text-amber-200 text-xs">
              📌 以下角色<strong>缺少设定图</strong>，生成时无法保持外观一致：
              <span className="ml-1 font-mono">{charsWithoutImage.map(c => c.name).join('、')}</span>
            </p>
          )}
          {!hasScenes && (
            <p className="text-amber-200 text-xs">
              📌 <strong>尚未创建场景</strong>——九宫格将无法保持场景视觉一致性。建议先在「场景库」中创建并上传场景设定图。
            </p>
          )}
          {hasScenes && scenesWithoutImage.length > 0 && (
            <p className="text-amber-200 text-xs">
              📌 以下场景<strong>缺少设定图</strong>，生成时无法保持背景一致：
              <span className="ml-1 font-mono">{scenesWithoutImage.map(s => s.name).join('、')}</span>
            </p>
          )}
        </div>
      )}

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
            {hqUrls.map((url, idx) => {
              const { gridShots, chars, usedScenes } = getGridContext(idx);
              const isExpanded = expandedGrids.has(idx);
              return (
              <div key={idx} className="bg-gray-800 rounded-lg overflow-hidden border border-green-700">
                <div className="flex justify-between items-center px-3 py-2 bg-gray-900 border-b border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-200">第 {idx + 1} 页</span>
                    <button
                      onClick={() => toggleGrid(idx)}
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                      title="查看生成上下文（提示词 + 参考图）"
                    >
                      {isExpanded ? '▲ 收起上下文' : '▼ 查看上下文'}
                    </button>
                  </div>
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

                {/* ── 上下文展开面板 ── */}
                {isExpanded && (
                  <div className="bg-gray-900 border-t border-gray-700 p-3 space-y-3 text-xs">
                    {/* 参考图 */}
                    {(chars.length > 0 || usedScenes.length > 0) && (
                      <div className="space-y-2">
                        {chars.length > 0 && (
                          <div>
                            <p className="text-gray-400 font-semibold mb-1">👤 角色参考图</p>
                            <div className="flex flex-wrap gap-2">
                              {chars.map(c => (
                                <div key={c.id} className="flex flex-col items-center gap-1">
                                  {c.imageSheetUrl ? (
                                    <img src={c.imageSheetUrl} alt={c.name} className="w-16 h-16 object-cover rounded border border-gray-600" />
                                  ) : (
                                    <div className="w-16 h-16 bg-gray-700 rounded border border-amber-600 flex items-center justify-center text-amber-400 text-lg">?</div>
                                  )}
                                  <span className="text-gray-400 text-[10px] max-w-[64px] text-center truncate">{c.name}</span>
                                  {!c.imageSheetUrl && <span className="text-amber-400 text-[9px]">无设定图</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {usedScenes.length > 0 && (
                          <div>
                            <p className="text-gray-400 font-semibold mb-1">🏛️ 场景参考图</p>
                            <div className="flex flex-wrap gap-2">
                              {usedScenes.map(s => (
                                <div key={s.id} className="flex flex-col items-center gap-1">
                                  {s.imageSheetUrl ? (
                                    <img src={s.imageSheetUrl} alt={s.name} className="w-16 h-16 object-cover rounded border border-gray-600" />
                                  ) : (
                                    <div className="w-16 h-16 bg-gray-700 rounded border border-amber-600 flex items-center justify-center text-amber-400 text-lg">?</div>
                                  )}
                                  <span className="text-gray-400 text-[10px] max-w-[64px] text-center truncate">{s.name}</span>
                                  {!s.imageSheetUrl && <span className="text-amber-400 text-[9px]">无设定图</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 镜头提示词列表 */}
                    <div>
                      <p className="text-gray-400 font-semibold mb-1">📝 镜头生图提示词（共 {gridShots.length} 个）</p>
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {gridShots.map((shot, sIdx) => (
                          <div key={shot.id} className="flex gap-2 items-start bg-gray-800 rounded px-2 py-1">
                            <span className="text-gray-500 shrink-0">#{shot.shotNumber || (idx * GRID_SIZE + sIdx + 1)}</span>
                            <span className="text-gray-300 leading-relaxed">
                              {shot.imagePromptCn || <em className="text-gray-500">（未提取生图提示词）</em>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 生成前上下文预览（未生成时显示） ─────────────── */}
      {hqUrls.length === 0 && shots.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-200">📋 生成上下文预览（共 {totalGrids} 张九宫格）</h3>
            <span className="text-xs text-gray-500">点击可展开/折叠各页</span>
          </div>
          <div className="space-y-2">
            {Array.from({ length: totalGrids }).map((_, idx) => {
              const { gridShots, chars, usedScenes } = getGridContext(idx);
              const isExpanded = expandedGrids.has(idx + 1000); // 用 +1000 避免和已生成格子的 key 冲突
              return (
                <div key={idx} className="border border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedGrids(prev => {
                      const next = new Set(prev);
                      next.has(idx + 1000) ? next.delete(idx + 1000) : next.add(idx + 1000);
                      return next;
                    })}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-900 hover:bg-gray-800 transition-all text-left"
                  >
                    <span className="text-sm text-gray-300 font-medium">
                      第 {idx + 1} 页（镜头 {idx * GRID_SIZE + 1}–{Math.min((idx + 1) * GRID_SIZE, shots.length)}）
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {chars.length > 0 && <span>👤 {chars.map(c => c.name).join('、')}</span>}
                      {usedScenes.length > 0 && <span>🏛️ {usedScenes.map(s => s.name).join('、')}</span>}
                      <span>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="bg-gray-900 p-3 text-xs space-y-2">
                      {(chars.length > 0 || usedScenes.length > 0) && (
                        <div className="flex flex-wrap gap-3">
                          {chars.map(c => (
                            <div key={c.id} className="flex items-center gap-1.5">
                              {c.imageSheetUrl
                                ? <img src={c.imageSheetUrl} alt={c.name} className="w-10 h-10 object-cover rounded border border-gray-600" />
                                : <div className="w-10 h-10 bg-gray-700 rounded border border-amber-600 flex items-center justify-center text-amber-400">?</div>
                              }
                              <span className="text-gray-400">{c.name}</span>
                            </div>
                          ))}
                          {usedScenes.map(s => (
                            <div key={s.id} className="flex items-center gap-1.5">
                              {s.imageSheetUrl
                                ? <img src={s.imageSheetUrl} alt={s.name} className="w-10 h-10 object-cover rounded border border-gray-600" />
                                : <div className="w-10 h-10 bg-gray-700 rounded border border-amber-600 flex items-center justify-center text-amber-400">?</div>
                              }
                              <span className="text-gray-400">{s.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {gridShots.map((shot, sIdx) => (
                          <div key={shot.id} className="flex gap-2 items-start">
                            <span className="text-gray-500 shrink-0">#{shot.shotNumber || (idx * GRID_SIZE + sIdx + 1)}</span>
                            <span className="text-gray-400">{shot.imagePromptCn || <em>（未提取）</em>}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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

