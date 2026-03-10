/**
 * 编辑模态框组件
 * 用于编辑角色、场景、剧集概要等分析结果
 */

import React, { useState, useEffect } from 'react';
import { CharacterRef, CharacterForm } from '../types';
import { SceneRef, EpisodeSummary } from '../types/project';

// 编辑类型
type EditType = 'character' | 'scene' | 'episode' | 'form';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: EditType;
  data: CharacterRef | SceneRef | EpisodeSummary | CharacterForm | null;
  onSave: (data: any) => void;
  parentCharacter?: CharacterRef; // 编辑形态时需要父角色信息
}

export const EditModal: React.FC<EditModalProps> = ({
  isOpen,
  onClose,
  type,
  data,
  onSave,
  parentCharacter,
}) => {
  const [formData, setFormData] = useState<any>(null);

  useEffect(() => {
    if (data) {
      setFormData({ ...data });
    }
  }, [data]);

  if (!isOpen || !formData) return null;

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  // 渲染角色编辑表单
  const renderCharacterForm = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">角色名</label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">性别</label>
          <select
            value={formData.gender || '未知'}
            onChange={(e) => handleChange('gender', e.target.value)}
            className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors appearance-none"
          >
            <option value="男" className="bg-gray-900">男</option>
            <option value="女" className="bg-gray-900">女</option>
            <option value="未知" className="bg-gray-900">未知</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">经典台词</label>
        <input
          type="text"
          value={formData.quote || ''}
          onChange={(e) => handleChange('quote', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
          placeholder="角色的标志性台词"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">身份演变</label>
        <input
          type="text"
          value={formData.identityEvolution || ''}
          onChange={(e) => handleChange('identityEvolution', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
          placeholder="如：高中生 ➔ 觉醒者 ➔ 救世主"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">外观描述</label>
        <textarea
          value={formData.appearance || ''}
          onChange={(e) => handleChange('appearance', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm h-24 focus:border-purple-500 outline-none transition-colors resize-none"
          placeholder="【外貌特征】...&#10;【主体人物】...&#10;【服饰造型】..."
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">核心能力（逗号分隔）</label>
        <input
          type="text"
          value={(formData.abilities || []).join(', ')}
          onChange={(e) => handleChange('abilities', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
          placeholder="能力1, 能力2, 能力3"
        />
      </div>
    </div>
  );

  // 渲染形态编辑表单
  const renderFormForm = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">形态名称</label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
            placeholder="如：🎒 高中校服"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">出现集数</label>
          <input
            type="text"
            value={formData.episodeRange || ''}
            onChange={(e) => handleChange('episodeRange', e.target.value)}
            className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
            placeholder="如：Ep 1-20"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">详细描述</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm h-24 focus:border-purple-500 outline-none transition-colors resize-none"
          placeholder="【外貌特征】...&#10;【主体人物】...&#10;【服饰造型】..."
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">备注</label>
        <input
          type="text"
          value={formData.note || ''}
          onChange={(e) => handleChange('note', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
        />
      </div>
    </div>
  );

  // 渲染场景编辑表单
  const renderSceneForm = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">场景名称</label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">场景描述</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm h-24 focus:border-purple-500 outline-none transition-colors resize-none"
          placeholder="【前景】...&#10;【中景】...&#10;【后景】..."
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">氛围</label>
        <input
          type="text"
          value={formData.atmosphere || ''}
          onChange={(e) => handleChange('atmosphere', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
          placeholder="如：冷蓝+金色暖光"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">出现集数（逗号分隔）</label>
        <input
          type="text"
          value={(formData.appearsInEpisodes || []).join(', ')}
          onChange={(e) => handleChange('appearsInEpisodes', e.target.value.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n)))}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
          placeholder="1, 2, 3"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">中文视觉提示词</label>
        <textarea
          value={formData.visualPromptCn || ''}
          onChange={(e) => handleChange('visualPromptCn', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm h-16 focus:border-purple-500 outline-none transition-colors resize-none"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">英文视觉提示词</label>
        <textarea
          value={formData.visualPromptEn || ''}
          onChange={(e) => handleChange('visualPromptEn', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm h-16 focus:border-purple-500 outline-none transition-colors resize-none"
        />
      </div>
    </div>
  );

  // 渲染剧集概要编辑表单
  const renderEpisodeForm = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">集数</label>
          <input
            type="number"
            value={formData.episodeNumber || 1}
            onChange={(e) => handleChange('episodeNumber', parseInt(e.target.value))}
            className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">标题</label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">剧情概要</label>
        <textarea
          value={formData.summary || ''}
          onChange={(e) => handleChange('summary', e.target.value)}
          className="w-full bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm h-24 focus:border-purple-500 outline-none transition-colors resize-none"
          placeholder="50-100字的剧情概要"
        />
      </div>
    </div>
  );

  const getTitle = () => {
    switch (type) {
      case 'character': return `编辑角色: ${(data as CharacterRef)?.name || ''}`;
      case 'form': return `编辑形态: ${(data as CharacterForm)?.name || ''}`;
      case 'scene': return `编辑场景: ${(data as SceneRef)?.name || ''}`;
      case 'episode': return `编辑剧集概要: 第${(data as EpisodeSummary)?.episodeNumber || ''}集`;
      default: return '编辑';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1d2d]/90 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-base font-bold text-white">{getTitle()}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>
        <div className="p-5">
          {type === 'character' && renderCharacterForm()}
          {type === 'form' && renderFormForm()}
          {type === 'scene' && renderSceneForm()}
          {type === 'episode' && renderEpisodeForm()}
        </div>
        <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-black/20">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-lg text-sm hover:bg-white/10 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg text-sm hover:from-blue-500 hover:to-purple-500 shadow-md hover:shadow-lg transition-all"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

