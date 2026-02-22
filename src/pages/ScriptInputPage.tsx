import React from 'react';
import { CharacterRef } from '../../types';

interface ScriptInputPageProps {
  // 剧本相关
  script: string;
  setScript: (script: string) => void;
  handleScriptUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  startScriptCleaning: () => void;

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
  setScript,
  handleScriptUpload,
  startScriptCleaning,
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
      {/* 上半部分：剧本 + 角色 */}
      <div className="grid lg:grid-cols-2 gap-3">
        {/* 左边：剧本导入 */}
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex flex-col" style={{minHeight: '50vh'}}>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold text-white">📝 剧本导入</h2>
            <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded-md font-medium text-xs transition-all flex items-center gap-1">
              📂 导入
              <input type="file" accept=".txt,.md,.ini" className="hidden" onChange={handleScriptUpload} />
            </label>
          </div>
          <textarea
            className="w-full flex-1 p-2 rounded-md bg-gray-900 border border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none text-gray-200 text-xs font-mono resize-none mb-2"
            placeholder="粘贴您的剧本..."
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-800 rounded px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
              <span className="text-gray-500">🤖 分析模型:</span>
              <span className="text-white">🔮 Gemini 2.5 Flash ($0.30) ⭐推荐</span>
            </div>
            <button
              onClick={startScriptCleaning}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all text-xs"
            >
              🧹 清洗剧本
            </button>
          </div>
        </div>

        {/* 右边：角色设定 */}
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex flex-col" style={{minHeight: '50vh'}}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-white">🎭 角色设定</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{characterRefs.length}/10</span>
              <button
                onClick={extractCharactersFromScriptHandler}
                disabled={isExtractingChars || !script.trim()}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  isExtractingChars || !script.trim()
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
            <div className="w-1/3 space-y-2 bg-gray-900 p-2 rounded border border-gray-700">
              <p className="text-xs font-medium text-gray-400 mb-1">➕ 手动添加</p>
              <input
                type="text"
                placeholder="角色名 *"
                className="w-full p-1.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-200 focus:border-blue-500"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
              />
              <div className="flex gap-1">
                {(['男', '女', '未知'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setNewCharGender(g)}
                    className={`flex-1 py-1 rounded text-xs font-medium ${
                      newCharGender === g
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 border border-gray-700 text-gray-400'
                    }`}
                  >
                    {g === '男' ? '👨' : g === '女' ? '👩' : '❓'}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="外观描述（如：黑发少年，深色风衣...）"
                className="w-full p-1.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-200 resize-none"
                rows={3}
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
                  className={`flex-1 py-1.5 rounded text-xs font-medium ${
                    newCharName.trim() ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  ✅ 添加
                </button>
                <label className={`flex-1 py-1.5 rounded text-center text-xs font-medium cursor-pointer ${
                  newCharName.trim() ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500'
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
      <div className="flex-1 h-full flex flex-col items-center justify-center text-center py-6 bg-gray-900 rounded border border-dashed border-gray-700">
        <span className="text-3xl mb-1">👤</span>
        <p className="text-sm text-gray-400">暂无角色</p>
        <p className="text-xs text-gray-500 mt-1">点击「从剧本提取」或手动添加</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-1">
        <p className="text-xs text-gray-500 font-medium sticky top-0 bg-gray-800 py-1">已添加 ({characterRefs.length})：</p>
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
      <div className="p-2 rounded border border-gray-700 bg-gray-900 group">
        <div className="space-y-2">
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
                  className={`px-2 py-1 rounded text-xs ${
                    newCharGender === g ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-400'
                  }`}
                >
                  {g === '男' ? '👨' : g === '女' ? '👩' : '❓'}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="w-full p-1.5 rounded bg-gray-800 border border-blue-500 text-xs text-gray-200 resize-none"
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
    <div className="p-2 rounded border border-gray-700 bg-gray-900 group">
      <div className="flex gap-2">
        <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden border border-gray-700 bg-gray-800 flex items-center justify-center">
          {ref.data ? (
            <img src={ref.data} className="w-full h-full object-cover" alt={ref.name} />
          ) : (
            <span className="text-lg">{ref.gender === '男' ? '👨' : ref.gender === '女' ? '👩' : '👤'}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="font-bold text-xs text-gray-200">{ref.name}</span>
            {ref.gender && ref.gender !== '未知' && (
              <span className="text-xs px-1 py-0.5 rounded bg-blue-900 text-blue-300">{ref.gender}</span>
            )}
            {!ref.data && (
              <span className="text-xs px-1 py-0.5 rounded bg-amber-900 text-amber-300">无图</span>
            )}
          </div>
          {(() => {
            const appearanceStr = typeof ref.appearance === 'string' ? ref.appearance : '';
            const isPlaceholder = appearanceStr.includes('forms') || appearanceStr.includes('默认形态');
            const firstForm = (ref as any).forms?.[0];
            const displayAppearance = isPlaceholder && firstForm?.description
              ? `📋 ${firstForm.name || '默认形态'}\n${firstForm.description}`
              : appearanceStr;

            return displayAppearance ? (
              <p className="text-xs text-gray-400 leading-snug whitespace-pre-wrap">{displayAppearance}</p>
            ) : (
              <p className="text-xs text-amber-400">⚠️ 无外观描述</p>
            );
          })()}
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              setEditingCharId(ref.id);
              setNewCharName(ref.name);
              setNewCharAppearance(ref.appearance || '');
              setNewCharGender(ref.gender || '未知');
            }}
            className="w-6 h-6 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded text-xs flex items-center justify-center"
            title="编辑"
          >
            ✏️
          </button>
          <button
            onClick={() => removeChar(ref.id)}
            className="w-6 h-6 bg-red-900 hover:bg-red-800 text-red-300 rounded text-xs flex items-center justify-center"
            title="删除"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
};

