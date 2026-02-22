import React, { useState } from 'react';
import { CharacterRef } from '../../types';
import { Project } from '../../types/project';
import { extractCharactersFromScript } from '../../services/openrouter';

/**
 * 角色管理 Hook
 * 负责角色的添加、编辑、删除、提取等功能
 */
export function useCharacterManagement(
  analysisModel: string,
  currentProject: Project | null
) {
  const [characterRefs, setCharacterRefs] = useState<CharacterRef[]>([]);
  const [newCharName, setNewCharName] = useState('');
  const [newCharAppearance, setNewCharAppearance] = useState('');
  const [newCharGender, setNewCharGender] = useState<'男' | '女' | '未知'>('未知');
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [isExtractingChars, setIsExtractingChars] = useState(false);

  /**
   * 处理角色图片上传
   */
  const handleCharUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && newCharName.trim()) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as string;
        setCharacterRefs(prev => [...prev, {
          id: Date.now().toString(),
          name: newCharName,
          data,
          appearance: newCharAppearance.trim() || undefined,
          gender: newCharGender,
        }]);
        setNewCharName('');
        setNewCharAppearance('');
        setNewCharGender('未知');
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * 添加角色
   */
  const addCharacter = () => {
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
  };

  /**
   * 删除角色
   */
  const removeChar = (id: string) => {
    setCharacterRefs(prev => prev.filter(c => c.id !== id));
  };

  /**
   * 开始编辑角色
   */
  const startEditChar = (char: CharacterRef) => {
    setEditingCharId(char.id);
    setNewCharName(char.name);
    setNewCharAppearance(char.appearance || '');
    setNewCharGender(char.gender || '未知');
  };

  /**
   * 保存编辑的角色
   */
  const saveEditChar = (charId: string) => {
    setCharacterRefs(prev => prev.map(c =>
      c.id === charId
        ? { ...c, name: newCharName, appearance: newCharAppearance, gender: newCharGender }
        : c
    ));
    cancelEditChar();
  };

  /**
   * 取消编辑
   */
  const cancelEditChar = () => {
    setEditingCharId(null);
    setNewCharName('');
    setNewCharAppearance('');
    setNewCharGender('未知');
  };

  /**
   * 从剧本提取角色
   */
  const extractCharactersFromScriptHandler = async (script: string) => {
    if (!script.trim()) {
      alert('请先输入剧本内容');
      return;
    }

    setIsExtractingChars(true);
    
    try {
      // 如果有项目角色库，优先从中筛选当集角色
      if (currentProject && currentProject.characters && currentProject.characters.length > 0) {
        const scriptLower = script.toLowerCase();
        const matchedChars = currentProject.characters.filter(c => {
          const nameInScript = scriptLower.includes(c.name.toLowerCase());
          return nameInScript;
        });

        if (matchedChars.length > 0) {
          setCharacterRefs(matchedChars);
          console.log(`[智能提取] 从项目角色库中匹配到${matchedChars.length}个当集角色:`, matchedChars.map(c => c.name));
          alert(`✅ 从项目角色库匹配到 ${matchedChars.length} 个角色：${matchedChars.map(c => c.name).join('、')}`);
          return;
        } else {
          console.log('[智能提取] 项目角色库中没有匹配到角色，回退到AI提取');
        }
      }

      // 回退：调用AI提取新角色
      const chars = await extractCharactersFromScript(script, analysisModel);
      if (chars.length > 0) {
        const newRefs: CharacterRef[] = chars.map((c, i) => ({
          id: `auto-${Date.now()}-${i}`,
          name: c.name,
          gender: c.gender,
          appearance: c.appearance,
        }));
        setCharacterRefs(prev => [...prev, ...newRefs]);
        alert(`✅ AI提取到 ${chars.length} 个新角色：${chars.map(c => c.name).join('、')}`);
      } else {
        alert('未能从剧本中识别到角色');
      }
    } catch (err) {
      console.error('提取角色失败:', err);
      alert(`提取角色失败: ${err}`);
    } finally {
      setIsExtractingChars(false);
    }
  };

  return {
    // 状态
    characterRefs,
    newCharName,
    newCharAppearance,
    newCharGender,
    editingCharId,
    isExtractingChars,
    
    // 方法
    setCharacterRefs,
    setNewCharName,
    setNewCharAppearance,
    setNewCharGender,
    handleCharUpload,
    addCharacter,
    removeChar,
    startEditChar,
    saveEditChar,
    cancelEditChar,
    extractCharactersFromScriptHandler,
  };
}

