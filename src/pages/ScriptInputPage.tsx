import React from 'react';
import { CharacterRef, EpisodeSplit } from '../../types';

interface ScriptInputPageProps {
  // 剧本相关
  script: string;
  currentScript: string;  // 🆕 当前处理的剧本（可能是单集）
  setScript: (script: string) => void;
  handleScriptUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  startScriptCleaning: () => void;
  // 🆕 剧集拆分相关
  episodes: EpisodeSplit[];
  currentEpisodeIndex: number | null;
  selectEpisode: (index: number) => void;
  cancelEpisodeSplit: () => void;

  // 角色相关
  characterRefs: CharacterRef[];
  setCharacterRefs: React.Dispatch<React.SetStateAction<CharacterRef[]>>;
  newCharName: string;
  setNewCharName: (name: string) => void;
  newCharAppearance: string;
  setNewCharAppearance: (appearance: string) => void;
  newCharGender: '男' | '女' | '未知';
  setNewCharGender: (gender: '男' | '女' | '未知') => void;
  editingCharId: string | null;
  setEditingCharId: (id: string | null) => void;
  isExtractingChars: boolean;
  handleCharUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeChar: (id: string) => void;
  extractCharactersFromScriptHandler: () => void;
}

/**
 * 剧本导入页面
 * 包含剧本上传和角色设定功能
 */
export const ScriptInputPage: React.FC<ScriptInputPageProps> = ({
  script,
  currentScript,  // 🆕
  setScript,
  handleScriptUpload,
  startScriptCleaning,
  // 🆕 剧集拆分相关
  episodes,
  currentEpisodeIndex,
  selectEpisode,
  cancelEpisodeSplit,
  // 角色相关
  characterRefs,
  setCharacterRefs,
  newCharName,
  setNewCharName,
  newCharAppearance,
  setNewCharAppearance,
  newCharGender,
  setNewCharGender,
  editingCharId,
  setEditingCharId,
  isExtractingChars,
  handleCharUpload,
  removeChar,
  extractCharactersFromScriptHandler,
}) => {
  return (
    <div className="flex flex-col gap-3">
      {/* 🆕 剧集拆分提示 */}
      {episodes.length > 0 && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-blue-300 text-sm">📺 检测到 {episodes.length} 个剧集</span>
              <span className="text-xs text-blue-400">已自动拆分</span>
            </div>
            <button
              onClick={cancelEpisodeSplit}
              className="text-xs text-blue-300 hover:text-blue-200 underline"
            >
              使用完整剧本
            </button>
          </div>
          {/* 剧集选择器 */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {episodes.map((ep, idx) => (
              <button
                key={idx}
                onClick={() => selectEpisode(idx)}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium transition-all ${currentEpisodeIndex === idx
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
              >
                <div className="font-bold">第{ep.episodeNumber}集</div>
                {ep.title && (
                  <div className="text-[10px] opacity-80 mt-0.5 truncate max-w-[100px]">
                    {ep.title}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 上半部分：剧本 + 角色 */}
      <div className="grid lg:grid-cols-2 gap-3">
        {/* 左边：剧本导入 */}
        <div className="bg-[#1a1d2d]/80 backdrop-blur-md p-4 rounded-xl border border-white/10 flex flex-col shadow-lg" style={{ minHeight: '50vh' }}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-bold text-white">📝 剧本导入</h2>
            <label className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 px-3 py-1.5 rounded-lg font-medium text-xs transition-all flex items-center gap-1 shadow-sm">
              📂 导入
              <input type="file" accept=".txt,.md,.ini" className="hidden" onChange={handleScriptUpload} />
            </label>
          </div>
          <textarea
            className="w-full flex-1 p-3 rounded-xl bg-black/40 border border-white/10 focus:ring-1 focus:ring-purple-500 outline-none text-gray-200 text-sm font-mono resize-none mb-3 shadow-inner"
            placeholder="粘贴您的剧本..."
            value={episodes.length > 0 ? currentScript : script}
            onChange={(e) => setScript(e.target.value)}
            disabled={episodes.length > 0}  // 有剧集拆分时禁用编辑
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 whitespace-nowrap">🤖 分析模型:</span>
              <span className="text-xs text-blue-400 font-medium">Gemini 2.5 Flash</span>
            </div>
            <button
              onClick={startScriptCleaning}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all text-xs"
            >
              🧹 清洗剧本
            </button>
          </div>
        </div>

        {/* 右边：角色设定 */}
        <div className="bg-[#1a1d2d]/80 backdrop-blur-md p-4 rounded-xl border border-white/10 flex flex-col shadow-lg" style={{ minHeight: '50vh' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">🎭 角色设定</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{characterRefs.length}/10</span>
              <button
                onClick={extractCharactersFromScriptHandler}
                disabled={isExtractingChars || !script.trim()}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${isExtractingChars || !script.trim()
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-500'
                  }`}
              >
                {isExtractingChars ? '🔄 提取中...' : '🔍 从剧本提取'}
              </button>
            </div>
          </div>

          <div className="flex-1 flex gap-2">
            {/* 左侧：添加角色表单 */}
            <div className="w-1/3 space-y-3 bg-black/30 p-3 rounded-xl border border-white/5 shadow-inner">
              <p className="text-xs font-medium text-gray-400 mb-1">➕ 手动添加</p>
              <input
                type="text"
                placeholder="角色名 *"
                className="w-full p-2 rounded-lg bg-black/40 border border-white/10 text-xs text-gray-200 focus:border-purple-500 outline-none"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
              />
              <div className="flex gap-1">
                {(['男', '女', '未知'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setNewCharGender(g)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${newCharGender === g
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                      : 'bg-black/40 border border-white/10 text-gray-400 hover:bg-white/5'
                      }`}
                  >
                    {g === '男' ? '👨' : g === '女' ? '👩' : '❓'}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="外观描述（如：黑发少年，深色风衣...）"
                className="w-full p-2 rounded-lg bg-black/40 border border-white/10 text-xs text-gray-200 resize-none outline-none focus:border-purple-500"
                rows={4}
                value={newCharAppearance}
                onChange={(e) => setNewCharAppearance(e.target.value)}
              />
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    if (!newCharName.trim()) return;
                    setCharacterRefs(prev => [...prev, {
                      id: Date.now().toString(),
                      name: newCharName,
                      appearance: newCharAppearance.trim() || undefined,
                      gender: newCharGender,
                    }]);
                    setNewCharName('');
                    setNewCharAppearance('');
                    setNewCharGender('未知');
                  }}
                  disabled={!newCharName.trim()}
                  className={`flex-1 py-1.5 rounded text-xs font-medium ${newCharName.trim() ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'
                    }`}
                >
                  ✅ 添加
                </button>
                <label className={`flex-1 py-1.5 rounded text-center text-xs font-medium cursor-pointer ${newCharName.trim() ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500'
                  }`}>
                  <input type="file" className="hidden" accept="image/*" onChange={handleCharUpload} disabled={!newCharName.trim()} />
                  📤 +图
                </label>
              </div>
            </div>

            {/* 右侧：已添加角色列表 */}
            <CharacterList
              characterRefs={characterRefs}
              setCharacterRefs={setCharacterRefs}
              editingCharId={editingCharId}
              setEditingCharId={setEditingCharId}
              newCharName={newCharName}
              setNewCharName={setNewCharName}
              newCharAppearance={newCharAppearance}
              setNewCharAppearance={setNewCharAppearance}
              newCharGender={newCharGender}
              setNewCharGender={setNewCharGender}
              removeChar={removeChar}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 角色列表组件
 */
interface CharacterListProps {
  characterRefs: CharacterRef[];
  setCharacterRefs: React.Dispatch<React.SetStateAction<CharacterRef[]>>;
  editingCharId: string | null;
  setEditingCharId: (id: string | null) => void;
  newCharName: string;
  setNewCharName: (name: string) => void;
  newCharAppearance: string;
  setNewCharAppearance: (appearance: string) => void;
  newCharGender: '男' | '女' | '未知';
  setNewCharGender: (gender: '男' | '女' | '未知') => void;
  removeChar: (id: string) => void;
}

const CharacterList: React.FC<CharacterListProps> = ({
  characterRefs,
  setCharacterRefs,
  editingCharId,
  setEditingCharId,
  newCharName,
  setNewCharName,
  newCharAppearance,
  setNewCharAppearance,
  newCharGender,
  setNewCharGender,
  removeChar,
}) => {
  if (characterRefs.length === 0) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center text-center py-8 bg-black/20 rounded-xl border border-dashed border-white/10">
        <span className="text-3xl mb-2 opacity-60">👤</span>
        <p className="text-sm text-gray-400">暂无角色</p>
        <p className="text-xs text-gray-500 mt-1">点击「从剧本提取」或手动添加</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex flex-col">
        <div className="sticky top-0 bg-[#1a1d2d]/90 backdrop-blur-md py-2 z-10 border-b border-white/5 mb-2">
          <p className="text-xs text-gray-500 font-medium">已添加 ({characterRefs.length})：</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 pb-2">
          {characterRefs.map((ref) => (
            <CharacterCard
              key={ref.id}
              ref={ref}
              isEditing={editingCharId === ref.id}
              setCharacterRefs={setCharacterRefs}
              setEditingCharId={setEditingCharId}
              newCharName={newCharName}
              setNewCharName={setNewCharName}
              newCharAppearance={newCharAppearance}
              setNewCharAppearance={setNewCharAppearance}
              newCharGender={newCharGender}
              setNewCharGender={setNewCharGender}
              removeChar={removeChar}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 角色卡片组件
 */
interface CharacterCardProps {
  ref: CharacterRef;
  isEditing: boolean;
  setCharacterRefs: React.Dispatch<React.SetStateAction<CharacterRef[]>>;
  setEditingCharId: (id: string | null) => void;
  newCharName: string;
  setNewCharName: (name: string) => void;
  newCharAppearance: string;
  setNewCharAppearance: (appearance: string) => void;
  newCharGender: '男' | '女' | '未知';
  setNewCharGender: (gender: '男' | '女' | '未知') => void;
  removeChar: (id: string) => void;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  ref,
  isEditing,
  setCharacterRefs,
  setEditingCharId,
  newCharName,
  setNewCharName,
  newCharAppearance,
  setNewCharAppearance,
  newCharGender,
  setNewCharGender,
  removeChar,
}) => {
  if (isEditing) {
    // 编辑模式
    return (
      <div className="col-span-full p-3 rounded-xl border border-white/10 bg-black/40 shadow-inner group">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 p-1.5 rounded bg-gray-800 border border-blue-500 text-sm font-bold text-gray-200"
              value={newCharName}
              onChange={(e) => setNewCharName(e.target.value)}
              placeholder="角色名"
            />
            <div className="flex gap-1">
              {(['男', '女', '未知'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setNewCharGender(g)}
                  className={`px-2 py-1 rounded text-xs ${newCharGender === g ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-400'
                    }`}
                >
                  {g === '男' ? '👨' : g === '女' ? '👩' : '❓'}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="w-full p-2 rounded-lg bg-black/60 border border-purple-500/50 text-xs text-gray-200 resize-none outline-none focus:border-purple-400"
            rows={3}
            value={newCharAppearance}
            onChange={(e) => setNewCharAppearance(e.target.value)}
            placeholder="外观描述（用于AI生图）"
          />
          <div className="flex gap-1">
            <button
              onClick={() => {
                setCharacterRefs(prev => prev.map(c =>
                  c.id === ref.id
                    ? { ...c, name: newCharName, appearance: newCharAppearance, gender: newCharGender }
                    : c
                ));
                setEditingCharId(null);
                setNewCharName('');
                setNewCharAppearance('');
                setNewCharGender('未知');
              }}
              className="flex-1 py-1.5 bg-green-600 text-white rounded text-xs font-medium"
            >
              ✅ 保存
            </button>
            <button
              onClick={() => {
                setEditingCharId(null);
                setNewCharName('');
                setNewCharAppearance('');
                setNewCharGender('未知');
              }}
              className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-xs"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 显示模式
  return (
    <div className="p-2.5 rounded-xl border border-white/10 bg-[#1a1d2d]/60 group hover:border-purple-500/50 transition-all shadow-sm hover:shadow-md relative overflow-hidden flex flex-col min-w-[140px]">
      <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={() => {
            setEditingCharId(ref.id);
            setNewCharName(ref.name);
            setNewCharAppearance(ref.appearance || '');
            setNewCharGender(ref.gender || '未知');
          }}
          className="w-6 h-6 bg-blue-900/80 hover:bg-blue-800 text-blue-300 rounded text-[10px] flex items-center justify-center backdrop-blur-sm transition-colors"
          title="编辑"
        >
          ✏️
        </button>
        <button
          onClick={() => removeChar(ref.id)}
          className="w-6 h-6 bg-red-900/80 hover:bg-red-800 text-red-300 rounded text-[10px] flex items-center justify-center backdrop-blur-sm transition-colors"
          title="删除"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 mb-2 pt-1">
        <div className="w-14 h-14 flex-shrink-0 rounded-full overflow-hidden border-2 border-white/10 bg-black/50 flex items-center justify-center shadow-inner relative group-hover:border-purple-500/30 transition-colors">
          {ref.data ? (
            <img src={ref.data} className="w-full h-full object-cover" alt={ref.name} />
          ) : (
            <span className="text-2xl">{ref.gender === '男' ? '👨' : ref.gender === '女' ? '👩' : '👤'}</span>
          )}
          {!ref.data && (
            <span className="absolute bottom-0 w-full text-center bg-black/60 text-[8px] text-amber-400 py-0.5 backdrop-blur-sm">无设定图</span>
          )}
        </div>

        <div className="flex flex-col items-center min-w-0 w-full px-1 text-center">
          <div className="flex items-center gap-1 w-full justify-center">
            <span className="font-bold text-xs text-gray-100 truncate max-w-[90px]" title={ref.name}>{ref.name}</span>
            {ref.gender && ref.gender !== '未知' && (
              <span className="text-[9px] px-1 py-0.5 rounded-full bg-blue-500/20 text-blue-300 flex-shrink-0 border border-blue-500/20">{ref.gender}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-black/30 rounded-lg p-2 border border-white/5 text-center mt-auto flex flex-col justify-center min-h-[44px]">
        {(() => {
          const appearanceStr = typeof ref.appearance === 'string' ? ref.appearance : '';
          const isPlaceholder = appearanceStr.includes('forms') || appearanceStr.includes('默认形态');
          const firstForm = (ref as any).forms?.[0];
          const displayAppearance = isPlaceholder && firstForm?.description
            ? `📋 ${firstForm.name || '默认形态'}\n${firstForm.description}`
            : appearanceStr;

          return displayAppearance ? (
            <p className="text-[10px] text-gray-400 leading-snug line-clamp-2" title={displayAppearance}>{displayAppearance}</p>
          ) : (
            <p className="text-[10px] text-amber-500/70 inline-flex items-center justify-center gap-1"><i>⚠️</i> 暂无描述</p>
          );
        })()}
      </div>
    </div>
  );
};

