/**
 * 模型选择器组件
 * 用于在各个页面选择 AI 模型
 */

import React from 'react';
import { MODELS, MODEL_NAMES, MODEL_CATEGORIES, DEFAULT_IMAGE_MODEL } from '../services/openrouter';

// 模型类型
export type ModelType = 'thinking' | 'fast' | 'image' | 'all';

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  type?: ModelType;
  label?: string;
  className?: string;
  showLabel?: boolean;
}

// 模型能力等级（用于复杂任务如批量分析）
export type ModelCapability = 'weak' | 'medium' | 'strong';

// 模型能力评级
export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  [MODELS.DEEPSEEK_CHAT]: 'weak',          // ⚠️ 弱：提取信息可能不完整
  [MODELS.GPT_4O_MINI]: 'weak',            // ⚠️ 弱：提取信息可能不完整
  [MODELS.GEMINI_2_5_FLASH]: 'medium',     // 中等：大多数任务可用
  [MODELS.GEMINI_3_FLASH_PREVIEW]: 'medium', // 中等：大多数任务可用（推荐）
  [MODELS.CLAUDE_HAIKU_4_5]: 'medium',     // 中等
  [MODELS.GEMINI_2_5_PRO]: 'strong',       // 强：复杂任务推荐
  [MODELS.GEMINI_3_PRO_PREVIEW]: 'strong', // 强：复杂任务推荐
  [MODELS.GPT_5_MINI]: 'strong',           // 强
  [MODELS.CLAUDE_SONNET_4_5]: 'strong',    // 强
};

// 获取模型能力等级提示
export const getModelCapabilityHint = (model: string): string => {
  const cap = MODEL_CAPABILITIES[model] || 'medium';
  switch (cap) {
    case 'weak': return '⚠️ 弱模型：适合简单任务，复杂分析可能不完整';
    case 'medium': return '✅ 中等：大多数任务可用';
    case 'strong': return '💎 强模型：复杂任务推荐';
    default: return '';
  }
};

// 获取模型能力标签（简短）
const getCapabilityLabel = (model: string): string => {
  const cap = MODEL_CAPABILITIES[model] || 'medium';
  switch (cap) {
    case 'weak': return '⚠️';
    case 'medium': return '';
    case 'strong': return '💎';
    default: return '';
  }
};

// 获取模型列表（按价格从便宜到贵排序）
const getModelList = (type: ModelType): string[] => {
  // 按价格从便宜到贵排序的完整模型列表（排除图像生成专用模型）
  const sortedByPrice = [
    MODELS.DEEPSEEK_CHAT,           // ¥1/¥2 最便宜
    MODELS.GPT_4O_MINI,             // $0.15/$0.60
    MODELS.GEMINI_2_5_FLASH,        // $0.30/$2.50
    MODELS.GEMINI_3_FLASH_PREVIEW,  // $0.50/$3.00 ⭐默认
    MODELS.CLAUDE_HAIKU_4_5,        // $1.00/$5.00
    MODELS.GEMINI_2_5_PRO,          // $1.25/$10.00
    MODELS.GEMINI_3_PRO_PREVIEW,    // $1.25/$10.00
    MODELS.GPT_5_MINI,              // 价格未知
    MODELS.CLAUDE_SONNET_4_5,       // $3.00/$15.00
  ];

  switch (type) {
    case 'thinking':
      return MODEL_CATEGORIES.THINKING as unknown as string[];
    case 'fast':
      return MODEL_CATEGORIES.FAST as unknown as string[];
    case 'image':
      return MODEL_CATEGORIES.IMAGE as unknown as string[];
    case 'all':
    default:
      return sortedByPrice;
  }
};

// 模型图标
const getModelIcon = (model: string): string => {
  if (model.includes('deepseek')) return '🐋';
  if (model.includes('gemini')) return '🔮';
  if (model.includes('gpt')) return '🤖';
  if (model.includes('claude')) return '🧠';
  if (model.includes('banana')) return '🍌';
  return '✨';
};

// 获取模型显示名称（包含能力标签）
const getModelDisplayName = (model: string): string => {
  const name = MODEL_NAMES[model] || model;
  const capLabel = getCapabilityLabel(model);
  return capLabel ? `${capLabel} ${name}` : name;
};

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  type = 'all' as ModelType,
  label = '选择模型',
  className = '',
  showLabel = true,
}) => {
  const models = getModelList(type as ModelType);

  return (
    <div className={`model-selector ${className}`}>
      {showLabel && (
        <label className="model-selector-label">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="model-selector-select"
      >
        {models.map((model) => (
          <option key={model} value={model}>
            {getModelIcon(model)} {getModelDisplayName(model)}
          </option>
        ))}
      </select>
    </div>
  );
};

// 生图模型选择器
interface ImageModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  className?: string;
}

// 生图模型 - 仅使用 Nano Banana Pro (Gemini 3 Pro Image)
export const IMAGE_GENERATION_MODELS = {
  GEMINI_PRO_IMAGE: 'google/gemini-3-pro-image-preview',
} as const;

export const IMAGE_MODEL_NAMES: Record<string, string> = {
  [IMAGE_GENERATION_MODELS.GEMINI_PRO_IMAGE]: '🍌 Nano Banana Pro',
};

export const ImageModelSelector: React.FC<ImageModelSelectorProps> = ({
  value,
  onChange,
  className = '',
}) => {
  return (
    <div className={`model-selector ${className}`}>
      <label className="model-selector-label">
        生图模型
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="model-selector-select"
      >
        {Object.entries(IMAGE_MODEL_NAMES).map(([model, name]) => (
          <option key={model} value={model}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
};

// 导出默认值
export { DEFAULT_IMAGE_MODEL };

export default ModelSelector;

