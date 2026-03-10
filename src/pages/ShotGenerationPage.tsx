import React from 'react';
import { Shot, ReviewSuggestion } from '../../types';
import {
  ScriptAnalysis,
  VisualStrategy,
  ShotPlanning,
  ShotDesign,
  QualityCheck,
} from '../../prompts/chain-of-thought/types';
import type { GeneratedEpisodeSummary } from '../../types/project';
import { MODEL_NAMES } from '../../services/openrouter';

interface ShotGenerationPageProps {
  // Tab 状态
  currentTab: 'generate' | 'review' | 'manual';
  handleTabChange: (tab: 'generate' | 'review' | 'manual') => void;

  // 分镜数据
  shots: Shot[];
  isLoading: boolean;
  progressMsg: string;

  // 生成模式
  generationMode: 'traditional' | 'chain-of-thought';

  // 思维链状态
  cotCurrentStage: number | null;
  cotStage1: ScriptAnalysis | null;
  cotStage2: VisualStrategy | null;
  cotStage3: ShotPlanning | null;
  cotStage4: ShotDesign[] | null;
  cotStage5: QualityCheck | null;
  cotRawOutput: string;

  // 自检相关
  suggestions: ReviewSuggestion[];
  selectedSuggestion: ReviewSuggestion | null;
  setSelectedSuggestion: (s: ReviewSuggestion | null) => void;
  startReview: () => void;
  applyOptimizations: () => void;
  oneClickOptimize: () => void;
  getSelectedSuggestionsCount: () => number;
  selectAllSuggestions: () => void;
  deselectAllSuggestions: () => void;
  toggleSuggestionSelection: (shotNumber: number) => void;

  // 精修相关
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  chatInput: string;
  setChatInput: (input: string) => void;
  chatScrollRef: React.RefObject<HTMLDivElement>;
  handleConsultDirector: () => void;
  handleExecuteChanges: () => void;

  // 模型相关 states (for review and manual edit)
  reviewModel: string;
  setReviewModel: (model: string) => void;
  editModel: string;
  setEditModel: (model: string) => void;

  // 导出相关
  exportToJSON: () => void;
  exportToExcel: () => void;
  downloadScript: () => void;
  setCurrentStep: (step: number) => void;

  // 渲染函数
  renderShotTable: (editable: boolean, showActions: boolean) => React.ReactNode;

  // 剧集概述（对象类型）
  episodeSummary: GeneratedEpisodeSummary | null;
}

/**
 * 分镜生成页面
 * 包含三个Tab：生成、自检、精修
 */
export const ShotGenerationPage: React.FC<ShotGenerationPageProps> = (props) => {
  const {
    currentTab,
    handleTabChange,
    shots,
    chatHistory,
    suggestions,
    episodeSummary,
    reviewModel,
    setReviewModel,
    editModel,
    setEditModel,
  } = props;

  return (
    <div className="space-y-4">
      {/* 概述板块 - 固定显示 */}
      {episodeSummary && (
        <div className="glass-card p-4 rounded-xl">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            📋 剧集概述
          </h3>
          <div className="text-xs text-gray-300 space-y-2">
            <div>
              <span className="text-gray-400">标题：</span>
              <span className="text-white font-medium">{episodeSummary.episodeTitle}</span>
            </div>
            <div>
              <span className="text-gray-400">时长：</span>
              <span>{episodeSummary.totalDuration}</span>
              <span className="mx-2 text-gray-600">|</span>
              <span className="text-gray-400">镜头数：</span>
              <span>{episodeSummary.totalShots}</span>
            </div>
            <div>
              <span className="text-gray-400">故事梗概：</span>
              <p className="mt-1 text-gray-200 whitespace-pre-wrap">{episodeSummary.storySummary}</p>
            </div>
            {episodeSummary.characters && episodeSummary.characters.length > 0 && (
              <div>
                <span className="text-gray-400">出场角色：</span>
                <span className="ml-2">
                  {episodeSummary.characters.map((c, i) => (
                    <span key={i}>
                      {c.name}
                      {c.role && <span className="text-gray-500">（{c.role}）</span>}
                      {i < episodeSummary.characters.length - 1 && '、'}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {episodeSummary.emotionCurve && (
              <div>
                <span className="text-gray-400">情绪曲线：</span>
                <span className="ml-2">{episodeSummary.emotionCurve}</span>
              </div>
            )}
            {episodeSummary.visualStyle && (
              <div>
                <span className="text-gray-400">视觉风格：</span>
                <span className="ml-2">{episodeSummary.visualStyle}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab切换栏 */}
      <div className="flex gap-2 bg-[#1a1d2d]/80 backdrop-blur-md p-2 rounded-lg border border-white/10 shadow-lg">
        <button
          onClick={() => handleTabChange('generate')}
          className={`relative px-4 py-2 rounded-md font-medium text-sm transition-all duration-300 ${currentTab === 'generate'
            ? 'bg-green-600 text-white shadow-lg scale-105'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:scale-102'
            }`}
        >
          🎬 生成
          {shots.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-800 animate-pulse"></span>
          )}
        </button>
        <button
          onClick={() => handleTabChange('review')}
          className={`relative px-4 py-2 rounded-md font-medium text-sm transition-all duration-300 ${currentTab === 'review'
            ? 'bg-orange-600 text-white shadow-lg scale-105'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:scale-102'
            }`}
        >
          🔍 自检
          {suggestions.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full border-2 border-gray-800 animate-pulse"></span>
          )}
        </button>
        <button
          onClick={() => handleTabChange('manual')}
          className={`relative px-4 py-2 rounded-md font-medium text-sm transition-all duration-300 ${currentTab === 'manual'
            ? 'bg-purple-600 text-white shadow-lg scale-105'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:scale-102'
            }`}
        >
          ✨ 精修
          {chatHistory.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-400 rounded-full border-2 border-gray-800 animate-pulse"></span>
          )}
        </button>
      </div>

      {/* 动态内容区 - 根据Tab切换 */}
      {currentTab === 'generate' && <GenerateTab {...props} />}
      {currentTab === 'review' && <ReviewTab {...props} />}
      {currentTab === 'manual' && <ManualEditTab {...props} />}

      {/* 分镜表格 - 固定显示在所有Tab下方（除了精修Tab） */}
      {currentTab !== 'manual' && props.renderShotTable(false, true)}
    </div>
  );
};

/**
 * 生成Tab组件
 */
const GenerateTab: React.FC<ShotGenerationPageProps> = ({
  shots,
  isLoading,
  generationMode,
  cotCurrentStage,
  cotStage1,
  cotStage2,
  cotStage3,
  cotStage4,
  cotStage5,
  cotRawOutput,
  startReview,
}) => {
  return (
    <div className="bg-[#1a1d2d]/80 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-lg animate-fadeIn flex flex-col gap-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">
            分镜脚本 ({shots.length} 镜)
            {generationMode === 'chain-of-thought' && cotCurrentStage && (
              <span className="ml-2 text-green-400 text-sm">
                🧠 阶段 {cotCurrentStage}/5
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            模型: Gemini 2.5 Flash | 模式: {generationMode === 'chain-of-thought' ? '思维链' : '传统'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={startReview}
            disabled={isLoading}
            className={`px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
              }`}
          >
            专家自检
          </button>
        </div>
      </div>

      {/* 思维链可视化面板 */}
      {generationMode === 'chain-of-thought' && (cotCurrentStage || cotStage1 || cotStage4) && (
        <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
          {/* 进度条 */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-700 font-bold text-sm">🧠 思维链5阶段分析</span>
            {cotCurrentStage && (
              <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded animate-pulse">
                阶段 {cotCurrentStage}/5 进行中...
              </span>
            )}
          </div>
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((stage) => (
              <div
                key={stage}
                className={`flex-1 h-2 rounded-full transition-all ${(cotCurrentStage && stage < cotCurrentStage) || (!cotCurrentStage && cotStage4)
                  ? 'bg-green-500'
                  : stage === cotCurrentStage
                    ? 'bg-green-400 animate-pulse'
                    : 'bg-gray-200'
                  }`}
              />
            ))}
          </div>
          <div className="flex justify-between mb-4 text-xs text-gray-600">
            <span className={cotStage1 ? 'text-green-700 font-medium' : ''}>① 剧本分析</span>
            <span className={cotStage2 ? 'text-green-700 font-medium' : ''}>② 视觉策略</span>
            <span className={cotStage3 ? 'text-green-700 font-medium' : ''}>③ 镜头分配</span>
            <span className={cotStage4 ? 'text-green-700 font-medium' : ''}>④ 逐镜设计</span>
            <span className={cotStage5 ? 'text-green-700 font-medium' : ''}>⑤ 自检</span>
          </div>

          {/* 阶段结果展示 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 阶段1结果：剧本分析 */}
            {cotStage1 && (
              <div className="bg-[#1a1d2d]/80 backdrop-blur-md p-3 rounded-lg border border-green-500/30">
                <h4 className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1">
                  <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">
                    1
                  </span>
                  剧本分析
                </h4>
                <div className="text-xs space-y-1 text-gray-200">
                  <div>
                    <span className="text-gray-500">地点：</span>
                    {cotStage1.basicInfo?.location || '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">角色：</span>
                    {cotStage1.basicInfo?.characters?.slice(0, 3).join(', ') || '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">时间跨度：</span>
                    {cotStage1.basicInfo?.timespan || '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">高潮：</span>
                    <span className="text-orange-400">{cotStage1.climax || '—'}</span>
                  </div>
                  {cotStage1.emotionArc && cotStage1.emotionArc.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <span className="text-gray-500">情绪弧线：</span>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {cotStage1.emotionArc.map((e, i) => (
                          <span
                            key={i}
                            className={`px-1.5 py-0.5 rounded text-xs ${e.intensity >= 8
                              ? 'bg-red-900/50 text-red-300'
                              : e.intensity >= 5
                                ? 'bg-yellow-900/50 text-yellow-300'
                                : 'bg-blue-900/50 text-blue-300'
                              }`}
                          >
                            {e.emotion}({e.intensity})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 阶段2结果：视觉策略 */}
            {cotStage2 && (
              <div className="bg-[#1a1d2d]/80 backdrop-blur-md p-3 rounded-lg border border-green-500/30">
                <h4 className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1">
                  <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">
                    2
                  </span>
                  视觉策略
                </h4>
                <div className="text-xs space-y-1 text-gray-200">
                  <div>
                    <span className="text-gray-500">视觉基调：</span>
                    {cotStage2.overallStyle?.visualTone || '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">光影风格：</span>
                    {cotStage2.overallStyle?.lightingStyle || '—'}
                  </div>
                </div>
              </div>
            )}

            {/* 阶段3结果：镜头分配 */}
            {cotStage3 && (
              <div className="bg-[#1a1d2d]/80 backdrop-blur-md p-3 rounded-lg border border-green-500/30">
                <h4 className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1">
                  <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">
                    3
                  </span>
                  镜头分配
                </h4>
                <div className="text-xs space-y-1 text-gray-200">
                  <div>
                    <span className="text-gray-500">总镜头数：</span>
                    {cotStage3.shotList?.length || cotStage3.shotCount?.targetTotal || '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">节奏曲线：</span>
                    {cotStage3.shotCount?.rhythmCurve || '—'}
                  </div>
                  {cotStage3.shotCount?.emotionBasedAllocation && cotStage3.shotCount.emotionBasedAllocation.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <span className="text-gray-500">场景分配：</span>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {cotStage3.shotCount.emotionBasedAllocation.map((s, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-blue-900/50 text-blue-300">
                            {s.sceneId}: {s.shotCount}镜
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 当前阶段原始输出（可折叠） */}
          {cotRawOutput && cotCurrentStage && (
            <details className="mt-3">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                📜 查看当前阶段原始输出
              </summary>
              <pre className="mt-2 p-2 bg-black/40 text-gray-200 rounded text-xs overflow-auto max-h-48 whitespace-pre-wrap border border-white/10">
                {cotRawOutput.slice(-2000)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 自检Tab组件
 * 依赖上层传入的 reviewModel / setReviewModel 来控制当前使用的自检 LLM 模型。
 * 注意：不要在组件内直接创建本地模型 state，以免与 App.tsx 中的统一模型选择状态不一致。
 */
const ReviewTab: React.FC<ShotGenerationPageProps> = ({
  suggestions,
  isLoading,
  shots,
  selectedSuggestion,
  setSelectedSuggestion,
  applyOptimizations,
  oneClickOptimize,
  getSelectedSuggestionsCount,
  selectAllSuggestions,
  deselectAllSuggestions,
  toggleSuggestionSelection,
  setCurrentStep,
  renderShotTable,
  reviewModel,
  setReviewModel,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      {/* 顶部操作栏 */}
      <div className="flex justify-between items-center bg-[#1a1d2d]/80 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-lg">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-white">自检报告</h2>
          <span className="text-xs text-gray-400">
            {suggestions.length > 0
              ? `发现 ${suggestions.length} 条建议，已选 ${getSelectedSuggestionsCount()} 条`
              : ''}
          </span>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs text-gray-400">自检模型:</span>
            <span className="text-xs text-blue-400 font-medium">Gemini 2.5 Flash</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 一键优化：全选所有建议并立即应用 */}
          <button
            onClick={oneClickOptimize}
            disabled={isLoading || suggestions.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-all disabled:opacity-50"
          >
            {isLoading ? '优化中...' : `⚡ 一键优化 (${suggestions.length})`}
          </button>
          <button
            onClick={applyOptimizations}
            disabled={isLoading || getSelectedSuggestionsCount() === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-all disabled:opacity-50"
          >
            {isLoading ? '优化中...' : `应用所选 (${getSelectedSuggestionsCount()})`}
          </button>
          <button
            onClick={() => {
              setCurrentStep(4); // AppStep.MANUAL_EDIT
            }}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg font-medium text-sm hover:bg-gray-600 transition-all"
          >
            跳过 → 精修
          </button>
        </div>
      </div>

      {/* 建议列表 */}
      {suggestions.length > 0 && (
        <div className="bg-amber-900/20 p-4 rounded-lg border border-amber-700">
          {/* 列表头部：标题 + 全选/取消全选 */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-amber-400">📋 修改建议</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllSuggestions}
                className="px-2.5 py-1 text-xs bg-amber-800/50 text-amber-300 rounded hover:bg-amber-800 transition-all"
              >
                全选
              </button>
              <button
                onClick={deselectAllSuggestions}
                className="px-2.5 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-all"
              >
                取消全选
              </button>
            </div>
          </div>
          <p className="text-xs text-amber-400/80 mb-3">
            💡 点击卡片查看完整内容，勾选后点击「应用所选」生效
          </p>

          {/* 建议卡片网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl border-2 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${s.selected ? 'border-amber-500 bg-amber-900/40' : 'bg-[#1a1d2d]/80 backdrop-blur-md border-white/10 hover:border-amber-500/50'
                  }`}
                onClick={() => setSelectedSuggestion(s)}
              >
                <div className="flex items-start gap-2">
                  {/* 勾选框 */}
                  <input
                    type="checkbox"
                    checked={s.selected ?? true}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSuggestionSelection(s.shotNumber);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 w-4 h-4 rounded border-gray-600 text-amber-500 focus:ring-amber-500 cursor-pointer bg-gray-700"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-amber-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0">
                        #{s.shotNumber}
                      </span>
                      {s.field && (
                        <span className="bg-blue-900/50 text-blue-300 text-[8px] px-1.5 py-0.5 rounded shrink-0">
                          {s.field}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-xs text-gray-100 line-clamp-1">{s.suggestion}</p>
                    <p className="text-gray-400 text-[10px] line-clamp-2 mt-1">{s.reason}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {suggestions.length === 0 && !isLoading && (
        <div className="text-center text-green-400 py-4 text-sm bg-green-900/30 rounded-lg border border-green-700">
          ✅ 无修改建议，脚本质量良好！
        </div>
      )}

      {/* 完整分镜表 */}
      <div className="bg-[#1a1d2d]/80 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-lg">
        <h3 className="text-sm font-bold text-gray-200 mb-2">
          📊 当前分镜表（{shots.length} 个镜头）
        </h3>
        {renderShotTable(false, true)}
      </div>

      {/* 建议详情弹窗 - 这里需要从App.tsx导入SuggestionDetailModal组件 */}
      {selectedSuggestion && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedSuggestion(null)}
        >
          <div
            className="bg-[#1a1d2d]/90 backdrop-blur-xl p-6 rounded-2xl max-w-2xl w-full mx-4 border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-4">建议详情</h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div>
                <span className="font-medium">镜头：</span>#{selectedSuggestion.shotNumber}
              </div>
              <div>
                <span className="font-medium">字段：</span>
                {selectedSuggestion.field}
              </div>
              <div>
                <span className="font-medium">建议：</span>
                {selectedSuggestion.suggestion}
              </div>
              <div>
                <span className="font-medium">原因：</span>
                {selectedSuggestion.reason}
              </div>
            </div>
            <button
              onClick={() => setSelectedSuggestion(null)}
              className="mt-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 精修Tab组件
 * 依赖上层传入的 editModel / setEditModel 来控制当前使用的精修 LLM 模型。
 * 注意：不要在组件内直接创建本地模型 state，以免与 App.tsx 中的统一模型选择状态不一致。
 */
const ManualEditTab: React.FC<ShotGenerationPageProps> = ({
  chatHistory,
  chatInput,
  setChatInput,
  chatScrollRef,
  isLoading,
  progressMsg,
  handleConsultDirector,
  handleExecuteChanges,
  exportToJSON,
  exportToExcel,
  downloadScript,
  setCurrentStep,
  renderShotTable,
  editModel,
  setEditModel,
}) => {
  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      {/* TOP: Chat Agent - 增加高度到280px */}
      <div className="h-[320px] flex flex-col bg-[#1a1d2d]/80 backdrop-blur-md rounded-xl border border-white/10 shadow-lg overflow-hidden shrink-0">
        <div className="py-3 px-5 bg-black/40 text-white flex justify-between items-center border-b border-white/5">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">🤖 AI 导演助理</h2>
            <p className="text-[10px] text-gray-400">讨论剧情/镜头，确认后执行修改</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">精修模型:</span>
              <span className="text-xs text-blue-400 font-medium">Gemini 2.5 Flash</span>
            </div>
            <button
              onClick={handleExecuteChanges}
              disabled={isLoading || chatHistory.length < 2}
              className="py-1.5 px-4 bg-blue-600 text-white rounded-md font-medium text-xs hover:bg-blue-500 transition-all disabled:opacity-50"
            >
              ✨ 执行修改
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-transparent"
            ref={chatScrollRef}
          >
            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-sm ${msg.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                    : 'bg-black/40 backdrop-blur-md border border-white/10 text-gray-200'
                    }`}
                >
                  {/* 优化显示：支持换行和代码块 */}
                  <div className="whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && !progressMsg.includes('修改') && (
              <div className="flex justify-start">
                <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-3 rounded-xl">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 bg-black/40 border-t border-white/5">
          <div className="relative">
            <textarea
              className="w-full p-3 pr-12 bg-black/40 text-white border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none resize-none h-12 placeholder-gray-500"
              placeholder="输入想法，如：把第3镜改成俯视..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleConsultDirector();
                }
              }}
            />
            <button
              onClick={handleConsultDirector}
              disabled={isLoading}
              className="absolute right-1 bottom-1 p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-all disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM: Table - 全宽显示 */}
      <div className="flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={exportToJSON}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-md font-medium text-xs hover:bg-gray-700 transition-all"
            >
              📥 导出JSON
            </button>
            <button
              onClick={exportToExcel}
              className="px-3 py-1.5 bg-gray-800 border border-green-700 text-green-400 rounded-md font-medium text-xs hover:bg-gray-700 transition-all"
            >
              📊 导出Excel
            </button>
            <button
              onClick={downloadScript}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-md font-medium text-xs hover:bg-gray-700 transition-all"
            >
              📄 导出TXT
            </button>
          </div>
          <button
            onClick={() => setCurrentStep(5)} // AppStep.EXTRACT_PROMPTS
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-md font-bold text-sm transition-all"
          >
            下一步: 提取AI提示词 →
          </button>
        </div>
        {/* 分镜表格全页显示，不使用滚动条 */}
        {renderShotTable(true, true)}
      </div>
    </div>
  );
};

