import React from 'react';
import { ScriptCleaningResult, CharacterRef } from '../../types';

interface ScriptCleaningPageProps {
  // 清洗状态
  isCleaning: boolean;
  cleaningProgress: string;
  cleaningResult: ScriptCleaningResult | null;

  // 生成模式
  generationMode: 'traditional' | 'chain-of-thought';
  setGenerationMode: (mode: 'traditional' | 'chain-of-thought') => void;

  // 角色
  characterRefs: CharacterRef[];

  // 操作
  startShotListGeneration: () => void;
}

/**
 * 剧本清洗页面
 * 显示清洗进度、结果和场景列表
 */
export const ScriptCleaningPage: React.FC<ScriptCleaningPageProps> = ({
  isCleaning,
  cleaningProgress,
  cleaningResult,
  generationMode,
  setGenerationMode,
  characterRefs,
  startShotListGeneration,
}) => {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* 左侧：清洗进度 / 原始剧本 */}
      <div className="glass-card p-4 rounded-xl">
        <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
          🧹 剧本清洗
        </h2>

        {isCleaning ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-blue-400">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-medium">正在清洗剧本...</span>
            </div>
            <div className="bg-[var(--color-bg)] p-3 rounded-lg border border-[var(--color-border)] max-h-[60vh] overflow-auto">
              <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap font-mono">{cleaningProgress}</pre>
            </div>
          </div>
        ) : cleaningResult ? (
          <div className="space-y-3">
            {/* 解析错误提示 */}
            {cleaningResult.parseError && (
              <div className="bg-red-900/20 p-3 rounded-lg border border-red-700/50">
                <h3 className="text-sm font-bold text-red-300 mb-1 flex items-center gap-2">
                  ⚠️ JSON解析失败
                </h3>
                <pre className="text-xs text-red-400 whitespace-pre-wrap max-h-32 overflow-auto">
                  {cleaningResult.rawOutput?.substring(0, 1000)}...
                </pre>
              </div>
            )}

            {/* 设定约束 */}
            {cleaningResult.constraints?.length > 0 && (
              <div className="bg-amber-900/20 p-3 rounded-lg border border-amber-700/50">
                <h3 className="text-sm font-bold text-amber-300 mb-2 flex items-center gap-2">
                  ⚠️ 剧本设定约束
                </h3>
                <ul className="space-y-1">
                  {cleaningResult.constraints.map((c: any, i: number) => (
                    <li key={i} className="text-xs text-amber-400">
                      <span className="font-medium">• {c.rule}</span>
                      <span className="text-amber-500"> → {c.implication}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 场景权重 */}
            {cleaningResult.sceneWeights?.length > 0 && (
              <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-700/50">
                <h3 className="text-sm font-bold text-blue-300 mb-2 flex items-center gap-2">
                  📊 场景权重分配
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {cleaningResult.sceneWeights.map((w: any, i: number) => (
                    <div key={i} className={`p-2 rounded-lg text-xs ${
                      w.weight === 'high' ? 'bg-red-900/30 text-red-300 border border-red-700/50' :
                      w.weight === 'medium' ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/50' :
                      'bg-green-900/30 text-green-300 border border-green-700/50'
                    }`}>
                      <div className="font-medium">场景 {w.sceneId}</div>
                      <div>建议 {w.suggestedShots} 镜头</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 非画面信息 */}
            <div className="bg-[var(--color-bg)] p-3 rounded-lg border border-[var(--color-border)]">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
                🔇 非画面信息
              </h3>
              <div className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                {cleaningResult.audioEffects?.length > 0 && (
                  <div><span className="font-medium">音效:</span> {cleaningResult.audioEffects.join(', ')}</div>
                )}
                {cleaningResult.musicCues?.length > 0 && (
                  <div><span className="font-medium">BGM:</span> {cleaningResult.musicCues.join(', ')}</div>
                )}
                {cleaningResult.timeCodes?.length > 0 && (
                  <div><span className="font-medium text-red-400">已忽略时间码:</span> {cleaningResult.timeCodes.join(', ')}</div>
                )}
                {cleaningResult.cameraSuggestions?.length > 0 && (
                  <div><span className="font-medium text-orange-400">镜头建议(仅参考):</span> {cleaningResult.cameraSuggestions.join(', ')}</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[var(--color-text-tertiary)] text-center py-8">等待清洗结果...</div>
        )}
      </div>

      {/* 右侧：清洗后的场景列表 */}
      <CleanedScenesList
        cleaningResult={cleaningResult}
        isCleaning={isCleaning}
        generationMode={generationMode}
        setGenerationMode={setGenerationMode}
        characterRefs={characterRefs}
        startShotListGeneration={startShotListGeneration}
      />
    </div>
  );
};

/**
 * 清洗后的场景列表组件
 */
interface CleanedScenesListProps {
  cleaningResult: ScriptCleaningResult | null;
  isCleaning: boolean;
  generationMode: 'traditional' | 'chain-of-thought';
  setGenerationMode: (mode: 'traditional' | 'chain-of-thought') => void;
  characterRefs: CharacterRef[];
  startShotListGeneration: () => void;
}

const CleanedScenesList: React.FC<CleanedScenesListProps> = ({
  cleaningResult,
  isCleaning,
  generationMode,
  setGenerationMode,
  characterRefs,
  startShotListGeneration,
}) => {
  return (
    <div className="glass-card p-4 rounded-xl">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          📝 清洗后的场景
        </h2>
        {cleaningResult && !isCleaning && (
          <div className="flex items-center gap-2">
            {/* 生成模式选择 */}
            <div className="flex items-center gap-1 bg-[var(--color-bg)] rounded-lg px-2 py-1 border border-[var(--color-border)]">
              <span className="text-xs text-[var(--color-text-tertiary)]">模式:</span>
              <button
                onClick={() => setGenerationMode('traditional')}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  generationMode === 'traditional'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                传统
              </button>
              <button
                onClick={() => setGenerationMode('chain-of-thought')}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  generationMode === 'chain-of-thought'
                    ? 'bg-green-600 text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
                title="5阶段思维链模式：剧本分析→视觉策略→镜头分配→逐镜设计→质量自检"
              >
                🧠 思维链
              </button>
            </div>

            {/* 角色提取警告 */}
            {characterRefs.length === 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                <span className="text-amber-400">⚠️</span>
                <span className="text-xs text-amber-300 font-medium">未提取角色</span>
              </div>
            )}

            <button
              onClick={startShotListGeneration}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-all shadow-lg"
            >
              {generationMode === 'chain-of-thought' ? '🧠 开始5阶段生成' : '生成分镜脚本'} →
            </button>
          </div>
        )}
      </div>

      {cleaningResult?.cleanedScenes ? (
        <div className="space-y-3 max-h-[60vh] overflow-auto">
          {cleaningResult.cleanedScenes.map((scene, i) => (
            <div key={i} className="p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-md font-medium">
                  场景 {scene.id}
                </span>
                {scene.moodTags.map((tag, j) => (
                  <span key={j} className="bg-purple-900/30 text-purple-300 text-xs px-2 py-0.5 rounded-md border border-purple-700/50">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="text-sm text-[var(--color-text-primary)] mb-2">{scene.visualContent}</div>
              {scene.dialogues.length > 0 && (
                <div className="text-xs text-[var(--color-text-secondary)] italic">
                  {scene.dialogues.map((d, k) => <div key={k}>「{d}」</div>)}
                </div>
              )}
              {scene.uiElements.length > 0 && (
                <div className="text-xs text-green-400 mt-1">
                  UI: {scene.uiElements.join(' | ')}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[var(--color-text-tertiary)] text-center py-10">等待清洗结果...</div>
      )}
    </div>
  );
};

