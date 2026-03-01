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
// 注意：GEMINI_2_5_PRO 和 GEMINI_3_PRO_PREVIEW 映射到同一个字符串值，
// 只保留一个键避免 TypeScript "重复属性" 错误。
export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  [MODELS.GEMINI_2_5_FLASH]: 'medium',      // 中等：大多数任务可用（推荐）
  [MODELS.GEMINI_3_FLASH_PREVIEW]: 'medium', // 中等：大多数任务可用
  [MODELS.GEMINI_3_PRO_PREVIEW]: 'strong',  // 强：复杂任务推荐
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

// 获取模型列表（按能力从快速到强大排序）
const getModelList = (type: ModelType): string[] => {
  // UI 可选模型（仅自建 API 支持的 Gemini 模型）
  const uiAvailableModels: string[] = [
    MODELS.GEMINI_2_5_FLASH,        // ⭐ 默认推荐，速度快
    MODELS.GEMINI_3_FLASH_PREVIEW,  // 新版快速
    MODELS.GEMINI_3_PRO_PREVIEW,    // 💎 复杂任务推荐
  ];

  switch (type) {
    case 'thinking':
      return [MODELS.GEMINI_3_PRO_PREVIEW];
    case 'fast':
      return [MODELS.GEMINI_2_5_FLASH, MODELS.GEMINI_3_FLASH_PREVIEW];
    case 'image':
      return MODEL_CATEGORIES.IMAGE as unknown as string[];
    case 'all':
    default:
      return uiAvailableModels;
  }
};

// 模型图标
const getModelIcon = (model: string | undefined): string => {
  if (!model) return '✨';
  if (model.includes('minimax')) return '⚡';
  if (model.includes('kimi')) return '🌙';
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
    <div className={className}>
      {showLabel && (
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg text-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
      >
        {models.map((model) => (
          <option
            key={model}
            value={model}
            className="bg-gray-800 text-white"
          >
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
  GEMINI_PRO_IMAGE: 'gemini-3-pro-image-preview',
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
    <div className={className}>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        生图模型
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg text-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
      >
        {Object.entries(IMAGE_MODEL_NAMES).map(([model, name]) => (
          <option
            key={model}
            value={model}
            className="bg-gray-800 text-white"
          >
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

