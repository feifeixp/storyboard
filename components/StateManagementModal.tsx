/**
 * 角色状态管理模态框
 * 用于提取和管理角色的不同状态（受伤、换装、变身等）
 */

import React, { useState } from 'react';
import type { CharacterRef, CharacterForm } from '../types';
import type { ScriptFile } from '../types/project';
// 注意：从子目录导入，避免与同名文件 services/characterSupplement.ts 冲突
import { extractCharacterStates } from '../services/characterSupplement/extractCharacterStates';
import { generateStatesAppearance } from '../services/characterSupplement/generateStateAppearance';
import { normalizeStateName } from '../services/utils/stateNameUtils';  // 🆕 导入统一工具

interface StateManagementModalProps {
  character: CharacterRef;
  scripts: ScriptFile[];
  onClose: () => void;
  onSave: (updatedCharacter: CharacterRef) => void;
}

export const StateManagementModal: React.FC<StateManagementModalProps> = ({
  character,
  scripts,
  onClose,
  onSave
}) => {
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [extractedStates, setExtractedStates] = useState<CharacterForm[]>([]);
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [generationProgress, setGenerationProgress] = useState<Record<number, string>>({});
  
  // 提取状态
  const handleExtractStates = async () => {
    setIsExtracting(true);
    try {
      const states = await extractCharacterStates(character, scripts);
      setExtractedStates(states);
      if (states.length === 0) {
        alert('未检测到明显的状态变化');
      }
    } catch (error: any) {
      console.error('状态提取失败:', error);
      alert(`状态提取失败: ${error.message}`);
    } finally {
      setIsExtracting(false);
    }
  };
  
  // 生成选中状态的外观描述
  const handleGenerateAppearance = async () => {
    const selected = extractedStates.filter((_, index) => selectedStates.has(index.toString()));
    if (selected.length === 0) {
      alert('请先选择要生成外观描述的状态');
      return;
    }

    // 🔧 检查是否有常规状态的外观描述（作为基底）
    // 🆕 基底改为 character.appearance
    if (!character.appearance || character.appearance.trim().length < 100) {
      alert('⚠️ 请先补充角色的外观描述（character.appearance），它将作为所有状态的基底');
      return;
    }

    const baseline = character.appearance;

    setIsGenerating(true);
    setGenerationProgress({});

    try {
      // 🆕 使用 character.appearance 作为基底
      const generatedStates = await generateStatesAppearance(
        baseline, // 🆕 使用 character.appearance 作为基底
        selected,
        {
          name: character.name,
          gender: character.gender,
          ageGroup: character.ageGroup
        },
        'balanced', // 美型等级（可以从项目设置中获取）
        'gemini-2.5-flash',
        (stateIndex, stage, step) => {
          setGenerationProgress(prev => ({
            ...prev,
            [stateIndex]: `${stage} - ${step}`
          }));
        }
      );

      // 更新extractedStates
      const updatedStates = [...extractedStates];
      selected.forEach((state, i) => {
        const originalIndex = extractedStates.findIndex(s => s.id === state.id);
        if (originalIndex !== -1) {
          updatedStates[originalIndex] = generatedStates[i];
        }
      });
      setExtractedStates(updatedStates);

      alert(`✅ 成功生成${generatedStates.length}个状态的外观描述！`);
    } catch (error: any) {
      console.error('外观生成失败:', error);
      alert(`外观生成失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
      setGenerationProgress({});
    }
  };

  // 🆕 批量生成所有状态
  const handleGenerateAllStates = async () => {
    if (extractedStates.length === 0) {
      alert('请先提取状态');
      return;
    }

    // 选中所有状态
    const allIndices = new Set(extractedStates.map((_, i) => i.toString()));
    setSelectedStates(allIndices);

    // 延迟一下，让UI更新
    setTimeout(() => handleGenerateAppearance(), 100);
  };

  // 🆕 批量生成关键帧状态
  const handleGenerateKeyframes = async () => {
    const keyframeIndices = new Set(
      extractedStates
        .map((state, i) => state.isKeyframe ? i.toString() : null)
        .filter(Boolean) as string[]
    );

    if (keyframeIndices.size === 0) {
      alert('没有标记为关键帧的状态');
      return;
    }

    setSelectedStates(keyframeIndices);

    // 延迟一下，让UI更新
    setTimeout(() => handleGenerateAppearance(), 100);
  };
  
  // 🔧 normalizeStateName 已移至 stateNameUtils.ts，统一使用

  // 🆕 去重合并 forms（不改名）
  const deduplicateForms = (forms: CharacterForm[]): CharacterForm[] => {
    // 按 normalizedName + changeType 去重
    const deduplicationMap = new Map<string, CharacterForm>();

    forms.forEach(form => {
      const key = `${normalizeStateName(form.name)}_${form.changeType}`;
      const existing = deduplicationMap.get(key);

      if (!existing) {
        deduplicationMap.set(key, form);
      } else {
        // 保留 priority 更高或 description 更长的
        const shouldReplace =
          (form.priority || 0) > (existing.priority || 0) ||
          ((form.priority || 0) === (existing.priority || 0) &&
           (form.description?.length || 0) > (existing.description?.length || 0));

        if (shouldReplace) {
          deduplicationMap.set(key, form);
        }
      }
    });

    return Array.from(deduplicationMap.values())
      .sort((a, b) => (b.priority || 50) - (a.priority || 50));
  };

  // 保存状态到角色
  const handleSave = () => {
    const selected = extractedStates.filter((_, index) => selectedStates.has(index.toString()));
    if (selected.length === 0) {
      alert('请先选择要保存的状态');
      return;
    }

    // 🔧 变更D：合并并去重
    const allForms = [...(character.forms || []), ...selected];
    const deduplicatedForms = deduplicateForms(allForms);

    console.log(`[状态管理] 保存前: ${allForms.length} 个状态，去重后: ${deduplicatedForms.length} 个状态`);

    const updatedCharacter: CharacterRef = {
      ...character,
      forms: deduplicatedForms
    };

    onSave(updatedCharacter);
    onClose();
  };
  
  // 切换状态选中
  const toggleState = (index: number) => {
    const newSelected = new Set(selectedStates);
    const key = index.toString();
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedStates(newSelected);
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            🎭 状态管理 - {character.name}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 操作按钮 */}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExtractStates}
              disabled={isExtracting || isGenerating}
              className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {isExtracting ? '⏳ 提取中...' : '🔍 提取状态'}
            </button>

            {extractedStates.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleGenerateAppearance}
                  disabled={isGenerating || selectedStates.size === 0}
                  className="btn-secondary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  {isGenerating ? `⏳ 生成中... (${Object.keys(generationProgress).length}/${selectedStates.size})` : `✨ 生成选中状态 (${selectedStates.size})`}
                </button>

                {/* 🆕 批量生成按钮 */}
                <button
                  type="button"
                  onClick={handleGenerateKeyframes}
                  disabled={isGenerating}
                  className="btn-secondary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                  title="生成所有标记为关键帧的状态"
                >
                  ⭐ 生成关键帧
                </button>

                <button
                  type="button"
                  onClick={handleGenerateAllStates}
                  disabled={isGenerating}
                  className="btn-secondary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                  title="生成所有状态的外观描述"
                >
                  🎨 生成全部状态
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isGenerating || selectedStates.size === 0}
                  className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50 ml-auto"
                >
                  💾 保存选中状态 ({selectedStates.size})
                </button>
              </>
            )}
          </div>

          {/* 状态列表 */}
          {extractedStates.length > 0 ? (
            <div className="space-y-2">
              {extractedStates.map((state, index) => (
                <div
                  key={state.id || index}
                  className={`glass-card rounded-lg p-3 cursor-pointer transition-all ${
                    selectedStates.has(index.toString())
                      ? 'border-2 border-[var(--color-primary)]'
                      : 'border border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                  }`}
                  onClick={() => toggleState(index)}
                >
                  <div className="flex items-start gap-3">
                    {/* 选择框 */}
                    <input
                      type="checkbox"
                      checked={selectedStates.has(index.toString())}
                      onChange={() => toggleState(index)}
                      className="mt-1"
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* 状态信息 */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                          {state.name}
                        </h3>

                        {/* 🆕 关键帧标记 */}
                        {state.isKeyframe && (
                          <span className="text-xs bg-yellow-900/30 text-yellow-300 px-2 py-0.5 rounded border border-yellow-700/50">
                            ⭐ 关键帧
                          </span>
                        )}

                        {/* 🆕 变化类型 */}
                        {state.changeType && (
                          <span className="text-xs bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded border border-blue-700/50">
                            {state.changeType === 'costume' && '👔 换装'}
                            {state.changeType === 'damage' && '💥 战损'}
                            {state.changeType === 'makeup' && '💄 妆容'}
                            {state.changeType === 'transformation' && '✨ 变身'}
                            {state.changeType === 'age' && '⏳ 年龄'}
                            {state.changeType === 'other' && '🔄 其他'}
                          </span>
                        )}

                        {state.episodeRange && (
                          <span className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface)] px-2 py-0.5 rounded">
                            📺 {state.episodeRange}
                          </span>
                        )}

                        {/* 🆕 优先级 */}
                        {state.priority !== undefined && (
                          <span className="text-xs text-[var(--color-text-tertiary)]">
                            优先级: {state.priority}
                          </span>
                        )}

                        {/* 🆕 生成状态 */}
                        {state.appearance ? (
                          <span className="text-xs bg-green-900/30 text-green-300 px-2 py-0.5 rounded border border-green-700/50">
                            ✅ 已生成
                          </span>
                        ) : (
                          <span className="text-xs bg-gray-700/30 text-gray-400 px-2 py-0.5 rounded border border-gray-600/50">
                            ⏳ 未生成
                          </span>
                        )}
                      </div>

                      {/* 🆕 变化要点 */}
                      {state.delta && (
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-1 italic">
                          变化要点：{state.delta}
                        </p>
                      )}

                      <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed mt-1">
                        {state.description}
                      </p>

                      {/* 生成进度 */}
                      {generationProgress[index] && (
                        <div className="mt-2 text-xs text-[var(--color-primary)] flex items-center gap-2">
                          <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-pulse"></div>
                          {generationProgress[index]}
                        </div>
                      )}

                      {/* 视觉提示词（如果已生成） */}
                      {state.visualPromptCn && (
                        <div className="mt-2 p-2 bg-[var(--color-surface)]/50 rounded text-xs text-[var(--color-text-tertiary)]">
                          <strong>视觉提示：</strong> {state.visualPromptCn}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-[var(--color-text-tertiary)]">
              <p className="text-sm mb-2">暂无提取的状态</p>
              <p className="text-xs">点击"提取状态"按钮开始分析剧本</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

