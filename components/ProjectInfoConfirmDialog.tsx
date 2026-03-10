/**
 * 项目信息确认对话框
 *
 * 功能：
 * 1. 在 projectAnalysis 完成后，展示 AI 猜测的剧本类型和主角列表
 * 2. 允许用户确认或修改这些信息
 * 3. 提供"全部使用 AI 默认值"选项，让用户可以跳过
 *
 * 创建时间：2025-01-XX
 */

import React, { useState, useEffect } from 'react';

export interface ProjectInfoConfirmDialogProps {
  open: boolean;
  onClose: () => void;

  // AI 猜测的剧本类型（可能是多个，用 / 分隔）
  suggestedGenres: string[];

  // 所有角色列表（带 AI 猜测的主角标记）
  characters: Array<{
    name: string;
    isMainCharacter: boolean; // AI 猜测
    appearances: number;      // 出场次数
    reason?: string;          // AI 猜测理由
  }>;

  // 用户确认后的回调
  onConfirm: (data: {
    genres: string[];
    mainCharacters: string[]; // 角色名列表
  }) => void;

  // 用户选择"全部使用 AI 默认值"的回调
  onUseDefaults: () => void;
}

// 预设的剧本类型选项
const GENRE_OPTIONS = [
  { value: '女频言情', label: '女频言情' },
  { value: '重生', label: '重生' },
  { value: '复仇', label: '复仇' },
  { value: '甜宠', label: '甜宠' },
  { value: '虐恋', label: '虐恋' },
  { value: '逆袭', label: '逆袭' },
  { value: '现实主义', label: '现实主义' },
  { value: '农村', label: '农村' },
  { value: '家庭伦理', label: '家庭伦理' },
  { value: '古装权谋', label: '古装权谋' },
  { value: '仙侠玄幻', label: '仙侠玄幻' },
  { value: '悬疑推理', label: '悬疑推理' },
  { value: '校园青春', label: '校园青春' },
  { value: '都市职场', label: '都市职场' },
];

export const ProjectInfoConfirmDialog: React.FC<ProjectInfoConfirmDialogProps> = ({
  open,
  onClose,
  suggestedGenres,
  characters,
  onConfirm,
  onUseDefaults,
}) => {
  // 用户选择的剧本类型
  const [selectedGenres, setSelectedGenres] = useState<string[]>(suggestedGenres);

  // 用户选择的主角
  const [selectedMainCharacters, setSelectedMainCharacters] = useState<string[]>(
    characters.filter(c => c.isMainCharacter).map(c => c.name)
  );

  // 当 props 变化时，更新状态
  useEffect(() => {
    setSelectedGenres(suggestedGenres);
    setSelectedMainCharacters(characters.filter(c => c.isMainCharacter).map(c => c.name));
  }, [suggestedGenres, characters]);

  // 切换剧本类型
  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev =>
      prev.includes(genre)
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  // 切换主角标记
  const toggleMainCharacter = (name: string) => {
    setSelectedMainCharacters(prev =>
      prev.includes(name)
        ? prev.filter(n => n !== name)
        : [...prev, name]
    );
  };

  // 确认并保存
  const handleConfirm = () => {
    onConfirm({
      genres: selectedGenres,
      mainCharacters: selectedMainCharacters,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-50">
      <div className="bg-[#1a1d2d]/90 backdrop-blur-xl text-gray-50 border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        {/* 标题 */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-100">📋 信息确认</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <p className="text-gray-300 mb-6">
          AI 已完成剧本分析，请确认以下关键信息：
        </p>

        {/* 剧本类型 */}
        <div className="mb-6 pb-6 border-b border-white/10">
          <h3 className="text-lg font-semibold text-gray-100 mb-2">🎬 剧本类型（影响整体美学风格）</h3>
          <div className="bg-black/40 rounded p-3 mb-3 border border-white/5">
            <p className="text-sm text-gray-300">
              <span className="font-medium text-blue-400">AI 猜测：</span>
              {suggestedGenres.length > 0 ? suggestedGenres.join(' / ') : '未识别'}
            </p>
          </div>
          <p className="text-sm text-gray-300 mb-3">请确认或修改（可多选）：</p>
          <div className="grid grid-cols-3 gap-2">
            {GENRE_OPTIONS.map(option => (
              <label key={option.value} className="flex items-center space-x-2 cursor-pointer hover:bg-white/5 p-2 rounded transition-colors border border-transparent hover:border-white/10">
                <input
                  type="checkbox"
                  checked={selectedGenres.includes(option.value)}
                  onChange={() => toggleGenre(option.value)}
                  className="rounded bg-black/40 border-gray-600"
                />
                <span className="text-sm text-gray-200">{option.label}</span>
              </label>
            ))}
          </div>
        </div>


        {/* 主角标记 */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-2">👤 主角标记（影响自动补全优先级）</h3>
          <p className="text-sm text-gray-300 mb-3">
            AI 根据出场次数和剧情中心，猜测以下角色可能是主角，请确认：
          </p>
          <div className="space-y-2">
            {characters.map(char => (
              <label
                key={char.name}
                className="flex items-start space-x-3 p-3 rounded-lg bg-black/20 hover:bg-white/5 border border-white/5 hover:border-white/10 cursor-pointer transition-all"
              >
                <input
                  type="checkbox"
                  checked={selectedMainCharacters.includes(char.name)}
                  onChange={() => toggleMainCharacter(char.name)}
                  className="mt-1 rounded bg-black/40 border-gray-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-100">{char.name}</div>
                  <div className="text-sm text-gray-400">
                    出场 {char.appearances} 集
                    {char.reason && ` · ${char.reason}`}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3 bg-blue-900/20 border border-blue-800/30 rounded p-2">
            💡 提示：主角会优先获得详细的外貌和服装设计
          </p>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onUseDefaults}
            className="px-4 py-2 text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors shadow-sm"
          >
            全部使用 AI 默认值
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all shadow-md hover:-translate-y-0.5"
          >
            确认并保存
          </button>
        </div>
      </div>
    </div>
  );
};
