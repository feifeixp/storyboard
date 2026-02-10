/**
 * AI图片生成模型选择器组件
 */

import React, { useEffect, useState } from 'react';
import {
  ImageGenerationModel,
  ScenarioType,
  getModelsByScenario,
} from '../services/aiImageGeneration';

interface AIImageModelSelectorProps {
  value: string;
  onChange: (modelName: string) => void;
  scenarioType?: ScenarioType;
  className?: string;
  label?: string;
}

export const AIImageModelSelector: React.FC<AIImageModelSelectorProps> = ({
  value,
  onChange,
  scenarioType = ScenarioType.STORYBOARD,
  className = '',
  label = '生图模型',
}) => {
  const [models, setModels] = useState<ImageGenerationModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
  }, [scenarioType]);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const modelList = await getModelsByScenario(scenarioType);
      setModels(modelList);

      // 如果当前值为空或不在列表中，选择默认模型
      if (!value || !modelList.find(m => m.model_name === value)) {
        const defaultModel = modelList.find(m => 
          scenarioType === ScenarioType.STORYBOARD 
            ? m.is_default_shot_model 
            : m.is_default_design_model
        ) || modelList[0];
        
        if (defaultModel) {
          onChange(defaultModel.model_name);
        }
      }
    } catch (err) {
      console.error('加载模型列表失败:', err);
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const selectedModel = models.find(m => m.model_name === value);

  if (loading) {
    return (
      <div className={className}>
        <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">{label}</label>
        <div className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-tertiary)] text-[13px]">
          加载中...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">{label}</label>
        <div className="w-full px-4 py-2.5 rounded-lg bg-red-900/20 border border-red-600/50 text-red-300 text-[13px]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors cursor-pointer"
      >
        {models.map((model) => (
          <option key={model.model_id} value={model.model_name}>
            {model.model_display_name}
            {model.require_membership && ` 🔒`}
            {(scenarioType === ScenarioType.STORYBOARD && model.is_default_shot_model) ||
             (scenarioType === ScenarioType.DESIGN && model.is_default_design_model)
              ? ' ⭐'
              : ''}
          </option>
        ))}
      </select>

      {/* 模型信息提示 */}
      {selectedModel && (
        <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)] space-y-1">
          <div>{selectedModel.model_description}</div>
          <div className="flex items-center gap-3 flex-wrap">
            <span>💰 {selectedModel.points_cost_per_image} 积分/张</span>
            <span>📐 {selectedModel.supported_aspect_ratios.join(', ')}</span>
            <span>📏 {selectedModel.supported_sizes.join(', ')}</span>
          </div>
          {selectedModel.require_membership && (
            <div className="text-[var(--color-accent-amber)]">
              🔒 需要会员等级: {selectedModel.min_membership_level}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIImageModelSelector;

