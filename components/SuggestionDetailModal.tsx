/**
 * 建议详情弹窗组件
 * 点击建议卡片时展示完整内容
 */
import React from 'react';
import { ReviewSuggestion } from '../types';

interface SuggestionDetailModalProps {
  suggestion: ReviewSuggestion | null;
  onClose: () => void;
  onToggleSelect: (shotNumber: string) => void;
}

export const SuggestionDetailModal: React.FC<SuggestionDetailModalProps> = ({
  suggestion,
  onClose,
  onToggleSelect,
}) => {
  if (!suggestion) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="bg-amber-600 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-white text-amber-600 text-sm px-2.5 py-1 rounded-md font-bold">
              #{suggestion.shotNumber}
            </span>
            <h3 className="font-bold text-lg">修改建议详情</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-4">
          {/* 建议标题 */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              建议内容
            </label>
            <p className="mt-1 text-gray-100 font-medium leading-relaxed">
              {suggestion.suggestion}
            </p>
          </div>

          {/* 原因说明 */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              修改原因
            </label>
            <p className="mt-1 text-gray-300 leading-relaxed">
              {suggestion.reason}
            </p>
          </div>

          {/* 涉及字段 */}
          {suggestion.field && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                涉及字段
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                {suggestion.field.split(',').map((f, i) => (
                  <span
                    key={i}
                    className="bg-blue-900/50 text-blue-300 text-xs px-2 py-1 rounded-md"
                  >
                    {f.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="bg-gray-900 px-5 py-4 flex items-center justify-between border-t border-gray-700">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={suggestion.selected ?? true}
              onChange={() => onToggleSelect(suggestion.shotNumber)}
              className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-sm text-gray-300">采纳此建议</span>
          </label>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-gray-200 rounded-lg font-medium text-sm hover:bg-gray-600 transition-all"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

