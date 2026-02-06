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
      <div className={`model-selector ${className}`}>
        <label className="model-selector-label">{label}</label>
        <div className="model-selector-select bg-gray-700 text-gray-400">
          加载中...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`model-selector ${className}`}>
        <label className="model-selector-label">{label}</label>
        <div className="model-selector-select bg-red-900 text-red-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`model-selector ${className}`}>
      <label className="model-selector-label">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="model-selector-select"
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
        <div className="mt-2 text-xs text-gray-400 space-y-1">
          <div>{selectedModel.model_description}</div>
          <div className="flex items-center gap-3">
            <span>💰 {selectedModel.points_cost_per_image} 积分/张</span>
            <span>📐 {selectedModel.supported_aspect_ratios.join(', ')}</span>
            <span>📏 {selectedModel.supported_sizes.join(', ')}</span>
          </div>
          {selectedModel.require_membership && (
            <div className="text-amber-400">
              🔒 需要会员等级: {selectedModel.min_membership_level}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIImageModelSelector;

