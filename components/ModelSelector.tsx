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
  // === UI 可选的 6 个主力模型 ===
  [MODELS.GPT_5_MINI]: 'strong',           // 强：OpenAI最新
  [MODELS.GEMINI_2_5_FLASH]: 'medium',     // 中等：大多数任务可用（推荐）
  [MODELS.MINIMAX_M2_5]: 'medium',         // 中等：高性价比
  [MODELS.KIMI_K_2_5]: 'strong',           // 强：长文本思考能力强
  [MODELS.GEMINI_3_FLASH_PREVIEW]: 'medium', // 中等：大多数任务可用
  [MODELS.CLAUDE_HAIKU_4_5]: 'medium',     // 中等：快速响应

  // === 保留模型（内部备用）===
  [MODELS.DEEPSEEK_CHAT]: 'weak',          // ⚠️ 弱：提取信息可能不完整
  [MODELS.GPT_4O_MINI]: 'weak',            // ⚠️ 弱：提取信息可能不完整
  [MODELS.GEMINI_2_5_PRO]: 'strong',       // 强：复杂任务推荐
  [MODELS.GEMINI_3_PRO_PREVIEW]: 'strong', // 强：复杂任务推荐
  [MODELS.CLAUDE_SONNET_4_5]: 'strong',    // 强：最高质量
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
  // ⚠️ UI 可选的 6 个主力模型（按价格从便宜到贵排序）
  // 其他模型保留在 MODELS 常量中供内部使用，但不在 UI 中展示
  const uiAvailableModels = [
    MODELS.GPT_5_MINI,              // $0.25/$2
    MODELS.GEMINI_2_5_FLASH,        // $0.30/$2.50 ⭐默认推荐
    MODELS.MINIMAX_M2_5,            // $0.30/$1.10
    MODELS.KIMI_K_2_5,              // $0.45/$2.20
    MODELS.GEMINI_3_FLASH_PREVIEW,  // $0.50/$3.00
    MODELS.CLAUDE_HAIKU_4_5,        // $1.00/$5.00
  ];

  switch (type) {
    case 'thinking':
      // 从 UI 可选模型中筛选思考型模型
      return uiAvailableModels.filter(m =>
        [MODELS.KIMI_K_2_5, MODELS.CLAUDE_HAIKU_4_5, MODELS.GPT_5_MINI].includes(m)
      );
    case 'fast':
      // 从 UI 可选模型中筛选快速型模型
      return uiAvailableModels.filter(m =>
        [MODELS.GPT_5_MINI, MODELS.GEMINI_2_5_FLASH, MODELS.MINIMAX_M2_5, MODELS.GEMINI_3_FLASH_PREVIEW].includes(m)
      );
    case 'image':
      return MODEL_CATEGORIES.IMAGE as unknown as string[];
    case 'all':
    default:
      return uiAvailableModels;
  }
};

// 模型图标
const getModelIcon = (model: string): string => {
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

