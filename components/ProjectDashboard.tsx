/**
 * 项目主界面 - 紧凑布局版本
 * 一页可以看到更多内容
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Project, Episode, StoryVolume, Antagonist, EpisodeSummary, SceneRef, PROJECT_MEDIA_TYPES, ScriptFile } from '../types/project';
import { CharacterRef, CharacterForm, STORYBOARD_STYLES, type StoryboardStyle } from '../types';
import { EditModal } from './EditModal';
import { calculateAllCharactersCompleteness, getCompletenessLevel } from '../services/characterCompleteness';
import { supplementCharacterDetails } from '../services/characterSupplement';
import { supplementSceneDetails } from '../services/sceneSupplement';
import { extractNewScenes } from '../services/sceneExtraction';
import AIImageModelSelector from './AIImageModelSelector';
import { ScenarioType, generateAndUploadImage, pollAndUploadFromTask } from '../services/aiImageGeneration';
import { patchProject, saveProject } from '../services/d1Storage';
import mammoth from 'mammoth';

interface ProjectDashboardProps {
  project: Project;
  onSelectEpisode: (episode: Episode) => void;
  onUpdateProject: (project: Project, options?: { persist?: boolean }) => void | Promise<void>;
  onBack: () => void;
}

type TabType = 'overview' | 'characters' | 'scenes';  // 🔧 移除 'episodes'，合并到 overview
type EditType = 'character' | 'scene' | 'episode' | 'form';

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  project,
  onSelectEpisode,
  onUpdateProject,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [expandedCharacter, setExpandedCharacter] = useState<string | null>(null);

  // =============================
  // 🆕 角色/场景设定图生成（模型 + 风格）
  // 说明：仅在用户点击按钮时才会调用生图接口（会消耗积分）。
  // =============================
  const [characterImageModel, setCharacterImageModel] = useState<string>('');
  const [sceneImageModel, setSceneImageModel] = useState<string>('');

  const [characterStyleId, setCharacterStyleId] = useState<string>(STORYBOARD_STYLES[0]?.id || '');
  const [sceneStyleId, setSceneStyleId] = useState<string>(STORYBOARD_STYLES[0]?.id || '');

  const characterStyle: StoryboardStyle = useMemo(() => {
    return STORYBOARD_STYLES.find(s => s.id === characterStyleId) || STORYBOARD_STYLES[0];
  }, [characterStyleId]);

  const sceneStyle: StoryboardStyle = useMemo(() => {
    return STORYBOARD_STYLES.find(s => s.id === sceneStyleId) || STORYBOARD_STYLES[0];
  }, [sceneStyleId]);

  const [generatingCharacterId, setGeneratingCharacterId] = useState<string | null>(null);
  const [characterGenProgress, setCharacterGenProgress] = useState<{ stage: string; percent: number } | null>(null);

  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);
  const [sceneGenProgress, setSceneGenProgress] = useState<{ stage: string; percent: number } | null>(null);

  // 🆕 批量生成状态
  const [isBatchGeneratingCharacters, setIsBatchGeneratingCharacters] = useState(false);
  const [batchCharacterProgress, setBatchCharacterProgress] = useState<{ current: number; total: number } | null>(null);

  const [isBatchGeneratingScenes, setIsBatchGeneratingScenes] = useState(false);
  const [batchSceneProgress, setBatchSceneProgress] = useState<{ current: number; total: number } | null>(null);

  // 🆕 剧集上传相关状态
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingEpisodes, setIsUploadingEpisodes] = useState(false);

	// =============================
	// 🆕 生图任务恢复（自动续跑）
	// 说明：用于“任务已创建/可能已完成，但因断网导致结果未写回 D1”的场景。
	// =============================
	// 记录本次页面会话中已尝试自动恢复的 taskCode，避免重复触发
	const autoResumeAttemptedTaskCodesRef = useRef<Set<string>>(new Set());
	// 记录上一次执行自动恢复的项目ID（切换项目时清空尝试记录）
	const autoResumeProjectIdRef = useRef<string | null>(null);

  // UI-only style tokens（仅排版/视觉优化：不改变任何功能逻辑）
  const containerClass = 'max-w-7xl mx-auto px-3 sm:px-4 lg:px-6';
  const cardClass = 'bg-gray-800 rounded-lg border border-gray-700/60';
  const cardPad = 'p-3';
  const primaryBtnClass = 'bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded text-xs font-medium';

  // 统一负向提示词：抑制水印/文字/Logo 等（避免设定图出现标注）
  const NEGATIVE_PROMPT = 'watermark, signature, logo, text, typography, letters, numbers, digits, caption, subtitle, label, annotations, UI overlay';

  // 构建剧本数据
  const scripts: ScriptFile[] = useMemo(() => {
    if (!project.episodes || !Array.isArray(project.episodes)) return [];
    return project.episodes.map(ep => ({
      fileName: `第${ep.episodeNumber}集`,
      content: ep.script,
      episodeNumber: ep.episodeNumber,
    }));
  }, [project.episodes]);

  // 计算角色完整度（传入剧本数据）
  const charactersCompleteness = useMemo(() => {
    return calculateAllCharactersCompleteness(project.characters, scripts);
  }, [project.characters, scripts]);

  // 编辑模态框状态
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editType, setEditType] = useState<EditType>('character');
  const [editData, setEditData] = useState<CharacterRef | SceneRef | EpisodeSummary | CharacterForm | null>(null);
  const [editParentCharacter, setEditParentCharacter] = useState<CharacterRef | undefined>(undefined);

  // 智能补充状态
  const [isSupplementing, setIsSupplementing] = useState(false);
  const [supplementingCharacterId, setSupplementingCharacterId] = useState<string | null>(null);
  const [supplementingSceneId, setSupplementingSceneId] = useState<string | null>(null);

  // 场景提取状态
  const [isExtractingScenes, setIsExtractingScenes] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState({ current: 0, total: 1 });

  // 打开编辑模态框
  const openEditModal = (type: EditType, data: any, parentChar?: CharacterRef) => {
    setEditType(type);
    setEditData(data);
    setEditParentCharacter(parentChar);
    setEditModalOpen(true);
  };

  // 保存编辑
  const handleSaveEdit = (updatedData: any) => {
    let updatedProject = { ...project };

    if (editType === 'character') {
      updatedProject.characters = (project.characters || []).map(c =>
        c.id === updatedData.id ? updatedData : c
      );
    } else if (editType === 'form' && editParentCharacter) {
      updatedProject.characters = (project.characters || []).map(c => {
        if (c.id === editParentCharacter.id) {
          return {
            ...c,
            forms: (c.forms || []).map(f => f.id === updatedData.id ? updatedData : f)
          };
        }
        return c;
      });
    } else if (editType === 'scene') {
      updatedProject.scenes = (project.scenes || []).map(s =>
        s.id === updatedData.id ? updatedData : s
      );
    } else if (editType === 'episode') {
      updatedProject.storyOutline = project.storyOutline.map(e =>
        e.episodeNumber === updatedData.episodeNumber ? updatedData : e
      );
    }

    onUpdateProject(updatedProject);
  };

  // 智能补充角色细节
  const handleSupplementCharacter = async (characterId: string) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;

    const charCompleteness = charactersCompleteness.find(c => c.character.id === characterId);
    if (!charCompleteness || !charCompleteness.missingFields.length) {
      alert('该角色信息已完整，无需补充');
      return;
    }

    // 构建剧本文件数组
    const scripts: ScriptFile[] = (project.episodes || []).map(ep => ({
      fileName: `第${ep.episodeNumber}集`,
      content: ep.script,
      episodeNumber: ep.episodeNumber,
    }));

    if (scripts.length === 0 || scripts.every(s => !s.content)) {
      alert('项目中没有剧本内容，无法进行智能补充');
      return;
    }

    setIsSupplementing(true);
    setSupplementingCharacterId(characterId);

    try {
      const updatedCharacter = await supplementCharacterDetails(
        character,
        charCompleteness.missingFields,
        scripts
      );

      // 更新项目中的角色
      const updatedProject = {
        ...project,
        characters: (project.characters || []).map(c =>
          c.id === characterId ? updatedCharacter : c
        ),
      };

      onUpdateProject(updatedProject);
      alert(`✅ 角色"${character.name}"补充完成！`);
    } catch (error: any) {
      console.error('智能补充失败:', error);
      alert(`❌ 补充失败: ${error.message || '未知错误'}`);
    } finally {
      setIsSupplementing(false);
      setSupplementingCharacterId(null);
    }
  };

  // =============================
  // 🆕 生成角色设定图（单张 16:9，1×4 横向四分屏：正/侧/背 + 面部特写）
  // =============================
  // skipConfirm: 批量生成时跳过确认对话框
  const handleGenerateCharacterImageSheet = async (characterId: string, skipConfirm = false) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;

    if (!characterImageModel) {
      alert('请先选择生图模型');
      return;
    }

    if (generatingCharacterId) {
      alert('正在生成其他角色图片，请稍后');
      return;
    }

    // 🔧 批量生成时跳过确认对话框
    if (!skipConfirm) {
      const confirmGenerate = confirm(
        `将为角色「${character.name}」生成 1 张设定图（会消耗积分）。\n\n是否继续？`
      );
      if (!confirmGenerate) return;
    }

    setGeneratingCharacterId(characterId);
    setCharacterGenProgress({ stage: '准备中', percent: 0 });

    try {
	      let createdTaskCode: string | null = null;
	      let createdTaskAt: string | null = null;

      const styleSuffix = characterStyle?.promptSuffix || '';
      const projectVisualStyle = project.settings?.visualStyle || '';

      const baseInfoCn = [
        `角色设定图`,
        `角色：${character.name}`,
        character.appearance ? `外观：${character.appearance}` : '',
        character.gender ? `性别：${character.gender}` : '',
        character.ageGroup ? `年龄段：${character.ageGroup}` : '',
        projectVisualStyle ? `项目视觉风格：${projectVisualStyle}` : '',
      ].filter(Boolean).join('；');

      const prompt = [
        baseInfoCn,
        '16:9 canvas, 1x4 horizontal grid layout with 4 equal panels, edge-to-edge, clean background, consistent character, consistent outfit, consistent face.',
        'Panels from left to right: (1) front full-body standing, (2) side profile full-body, (3) back full-body, (4) face close-up portrait.',
        'NO text, NO labels, NO numbers, NO watermark, NO logo.',
        styleSuffix,
      ].filter(Boolean).join(' ');

	      const imageUrls = await generateAndUploadImage(
        {
          prompt,
          negativePrompt: NEGATIVE_PROMPT,
          modelName: characterImageModel,
          aspectRatio: '16:9',
          numImages: '1',
          outputFormat: 'jpg',
        },
        project.id,
        `character_sheet_${characterId}`,
	        (stage, percent) => setCharacterGenProgress({ stage, percent }),
	        async (taskCode) => {
	          // ✅ 任务创建后立即持久化 taskCode（断网/刷新后可恢复）
	          createdTaskCode = taskCode;
	          createdTaskAt = new Date().toISOString();
	          setCharacterGenProgress({ stage: '保存任务信息', percent: 15 });

	          const updatedProject: Project = {
	            ...project,
	            updatedAt: new Date().toISOString(),
	            characters: (project.characters || []).map(c => {
	              if (c.id !== characterId) return c;
	              return {
	                ...c,
	                // 注意：不清空 imageSheetUrl（如果此前已有图，生成中仍保留旧图，避免“生成失败导致空白”）
	                imageGenerationMeta: {
	                  modelName: characterImageModel,
	                  styleName: characterStyle?.name || '未知风格',
	                  // generatedAt 历史上用于“生成时间”；此处用任务创建时间占位，最终成功后会再写一次
	                  generatedAt: createdTaskAt,
	                  taskCode,
	                  taskCreatedAt: createdTaskAt,
	                },
	              };
	            }),
	          };

	          // 1) 先更新本地 UI（不触发全量保存）
	          await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
	          // 2) 再做最小化持久化（PATCH 只更新 characters 字段）
	          try {
	            await patchProject(project.id, { characters: updatedProject.characters });
	          } catch (err) {
	            console.warn('[ProjectDashboard] patchProject(characters) 失败，回退到全量保存:', err);
	            await Promise.resolve(onUpdateProject(updatedProject));
	          }
	        },
	        // S3：设定图直接保存 Neodomain 的永久 image_urls，跳过 OSS
	        { skipOSSUpload: true }
	      );

	      const sheetUrl = imageUrls?.[0];
	      if (!sheetUrl) throw new Error('未获取到生成图片URL');

      const updatedProject: Project = {
        ...project,
        updatedAt: new Date().toISOString(),
        characters: (project.characters || []).map(c => {
          if (c.id !== characterId) return c;
          return {
            ...c,
            imageSheetUrl: sheetUrl,
            imageGenerationMeta: {
              modelName: characterImageModel,
              styleName: characterStyle?.name || '未知风格',
              generatedAt: new Date().toISOString(),
	              taskCode: createdTaskCode || c.imageGenerationMeta?.taskCode,
	              taskCreatedAt: createdTaskAt || c.imageGenerationMeta?.taskCreatedAt,
            },
          };
        }),
      };

	      // 🔧 修复：先持久化到数据库，再更新前端状态
	      // 这样即使用户离开页面，数据也已经保存了
	      try {
	        await patchProject(project.id, { characters: updatedProject.characters });
	        console.log(`[ProjectDashboard] ✅ 角色设定图已保存到数据库: ${character.name}`);
	      } catch (err) {
	        console.warn('[ProjectDashboard] patchProject(characters) 失败，回退到全量保存:', err);
	        await saveProject(updatedProject);
	      }

	      // 最后更新前端状态（persist: false 避免重复保存）
	      await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
    } catch (error: any) {
      console.error('生成角色设定图失败:', error);
      alert(`❌ 生成失败: ${error?.message || '未知错误'}\n\n请检查网络连接或稍后重试。`);
    } finally {
      setGeneratingCharacterId(null);
      setCharacterGenProgress(null);
    }
  };

  // =============================
  // 🆕 批量生成所有角色设定图
  // =============================
  const handleBatchGenerateCharacters = async () => {
    const charactersToGenerate = (project.characters || []).filter(c => !c.imageSheetUrl);

    if (charactersToGenerate.length === 0) {
      alert('所有角色都已有设定图！');
      return;
    }

    if (!characterImageModel) {
      alert('请先选择生图模型');
      return;
    }

    const confirmGenerate = confirm(
      `将为 ${charactersToGenerate.length} 个角色批量生成设定图（会消耗积分）。\n\n` +
      `角色列表：\n${charactersToGenerate.map(c => `• ${c.name}`).join('\n')}\n\n` +
      `是否继续？`
    );
    if (!confirmGenerate) return;

    setIsBatchGeneratingCharacters(true);
    setBatchCharacterProgress({ current: 0, total: charactersToGenerate.length });

    let successCount = 0;
    let failCount = 0;
    const failedCharacters: string[] = [];

    for (let i = 0; i < charactersToGenerate.length; i++) {
      const char = charactersToGenerate[i];
      setBatchCharacterProgress({ current: i + 1, total: charactersToGenerate.length });

      try {
        // 🔧 调用单个角色生成函数，skipConfirm = true 跳过确认对话框
        await handleGenerateCharacterImageSheet(char.id, true);
        successCount++;

        // 等待一小段时间，避免请求过快
        if (i < charactersToGenerate.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`生成角色 ${char.name} 失败:`, error);
        failCount++;
        failedCharacters.push(char.name);
      }
    }

    setIsBatchGeneratingCharacters(false);
    setBatchCharacterProgress(null);

    // 显示结果
    let message = `批量生成完成！\n\n`;
    message += `✅ 成功: ${successCount} 个\n`;
    if (failCount > 0) {
      message += `❌ 失败: ${failCount} 个\n\n`;
      message += `失败的角色：\n${failedCharacters.map(name => `• ${name}`).join('\n')}`;
    }
    alert(message);
  };

  // =============================
  // 🆕 生成场景设定图（单张 16:9，通常为 2×2 四分屏：多角度 + 关键特写）
  // =============================
  const handleGenerateSceneImageSheet = async (sceneId: string) => {
    const scene = (project.scenes || []).find(s => s.id === sceneId);
    if (!scene) return;

    if (!sceneImageModel) {
      alert('请先选择生图模型');
      return;
    }

    if (generatingSceneId) {
      alert('正在生成其他场景图片，请稍后');
      return;
    }

    const confirmGenerate = confirm(
      `将为场景「${scene.name}」生成 1 张设定图（会消耗积分）。\n\n是否继续？`
    );
    if (!confirmGenerate) return;

    setGeneratingSceneId(sceneId);
    setSceneGenProgress({ stage: '准备中', percent: 0 });

	    try {
		      let createdTaskCode: string | null = null;
		      let createdTaskAt: string | null = null;

      const styleSuffix = sceneStyle?.promptSuffix || '';
      const projectVisualStyle = project.settings?.visualStyle || '';

      const baseInfoCn = [
        `场景设定图`,
        `场景：${scene.name}`,
        scene.description ? `描述：${scene.description}` : '',
        scene.visualPromptCn ? `中文视觉提示词：${scene.visualPromptCn}` : '',
        scene.atmosphere ? `氛围：${scene.atmosphere}` : '',
        projectVisualStyle ? `项目视觉风格：${projectVisualStyle}` : '',
      ].filter(Boolean).join('；');

      const prompt = [
        baseInfoCn,
        '16:9 canvas, 2x2 grid layout with 4 equal panels, edge-to-edge.',
        'Panels: (1) wide establishing shot, (2) second angle (left 3/4 view), (3) third angle (right 3/4 view), (4) key detail close-up.',
        'NO text, NO labels, NO numbers, NO watermark, NO logo.',
        styleSuffix,
      ].filter(Boolean).join(' ');

		      const imageUrls = await generateAndUploadImage(
        {
          prompt,
          negativePrompt: NEGATIVE_PROMPT,
          modelName: sceneImageModel,
          aspectRatio: '16:9',
          numImages: '1',
          outputFormat: 'jpg',
        },
        project.id,
        `scene_sheet_${sceneId}`,
	        (stage, percent) => setSceneGenProgress({ stage, percent }),
		        async (taskCode) => {
	          createdTaskCode = taskCode;
	          createdTaskAt = new Date().toISOString();
	          setSceneGenProgress({ stage: '保存任务信息', percent: 15 });

	          const updatedProject: Project = {
	            ...project,
	            updatedAt: new Date().toISOString(),
	            scenes: (project.scenes || []).map(s => {
	              if (s.id !== sceneId) return s;
	              return {
	                ...s,
	                imageGenerationMeta: {
	                  modelName: sceneImageModel,
	                  styleName: sceneStyle?.name || '未知风格',
	                  generatedAt: createdTaskAt,
	                  taskCode,
	                  taskCreatedAt: createdTaskAt,
	                },
	              };
	            }),
	          };

		          // 1) 先更新本地 UI（不触发全量保存）
		          await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
		          // 2) 再做最小化持久化（PATCH 只更新 scenes 字段）
		          try {
		            await patchProject(project.id, { scenes: updatedProject.scenes });
		          } catch (err) {
		            console.warn('[ProjectDashboard] patchProject(scenes) 失败，回退到全量保存:', err);
		            await Promise.resolve(onUpdateProject(updatedProject));
		          }
		        },
		        // S3：设定图直接保存 Neodomain 的永久 image_urls，跳过 OSS
		        { skipOSSUpload: true }
	      );

	      const sheetUrl = imageUrls?.[0];
	      if (!sheetUrl) throw new Error('未获取到生成图片URL');

      const updatedProject: Project = {
        ...project,
        updatedAt: new Date().toISOString(),
        scenes: (project.scenes || []).map(s => {
          if (s.id !== sceneId) return s;
          return {
            ...s,
            imageSheetUrl: sheetUrl,
            imageGenerationMeta: {
              modelName: sceneImageModel,
              styleName: sceneStyle?.name || '未知风格',
              generatedAt: new Date().toISOString(),
	              taskCode: createdTaskCode || s.imageGenerationMeta?.taskCode,
	              taskCreatedAt: createdTaskAt || s.imageGenerationMeta?.taskCreatedAt,
            },
          };
        }),
      };

	      // 🔧 修复：先持久化到数据库，再更新前端状态
	      // 这样即使用户离开页面，数据也已经保存了
	      try {
	        await patchProject(project.id, { scenes: updatedProject.scenes });
	        console.log(`[ProjectDashboard] ✅ 场景设定图已保存到数据库: ${scene.name}`);
	      } catch (err) {
	        console.warn('[ProjectDashboard] patchProject(scenes) 失败，回退到全量保存:', err);
	        await saveProject(updatedProject);
	      }

	      // 最后更新前端状态（persist: false 避免重复保存）
	      await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
    } catch (error: any) {
      console.error('生成场景设定图失败:', error);
      alert(`❌ 生成失败: ${error?.message || '未知错误'}\n\n请检查网络连接或稍后重试。`);
    } finally {
      setGeneratingSceneId(null);
      setSceneGenProgress(null);
    }
  };

  // =============================
  // 🆕 批量生成所有场景设定图
  // =============================
  const handleBatchGenerateScenes = async () => {
    const scenesToGenerate = (project.scenes || []).filter((s: SceneRef) => !s.imageSheetUrl);

    if (scenesToGenerate.length === 0) {
      alert('所有场景都已有设定图！');
      return;
    }

    if (!sceneImageModel) {
      alert('请先选择生图模型');
      return;
    }

    const confirmGenerate = confirm(
      `将为 ${scenesToGenerate.length} 个场景批量生成设定图（会消耗积分）。\n\n` +
      `场景列表：\n${scenesToGenerate.map((s: SceneRef) => `• ${s.name}`).join('\n')}\n\n` +
      `是否继续？`
    );
    if (!confirmGenerate) return;

    setIsBatchGeneratingScenes(true);
    setBatchSceneProgress({ current: 0, total: scenesToGenerate.length });

    let successCount = 0;
    let failCount = 0;
    const failedScenes: string[] = [];

    for (let i = 0; i < scenesToGenerate.length; i++) {
      const scene = scenesToGenerate[i];
      setBatchSceneProgress({ current: i + 1, total: scenesToGenerate.length });

      try {
        // 调用单个场景生成函数
        await handleGenerateSceneImageSheet(scene.id);
        successCount++;

        // 等待一小段时间，避免请求过快
        if (i < scenesToGenerate.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`生成场景 ${scene.name} 失败:`, error);
        failCount++;
        failedScenes.push(scene.name);
      }
    }

    setIsBatchGeneratingScenes(false);
    setBatchSceneProgress(null);

    // 显示结果
    let message = `批量生成完成！\n\n`;
    message += `✅ 成功: ${successCount} 个\n`;
    if (failCount > 0) {
      message += `❌ 失败: ${failCount} 个\n\n`;
      message += `失败的场景：\n${failedScenes.map(name => `• ${name}`).join('\n')}`;
    }
    alert(message);
  };

	// =============================
	// 🆕 恢复角色/场景设定图任务（使用已保存的 taskCode 继续轮询并上传）
	// =============================
	const handleResumeCharacterImageSheet = async (
	  characterId: string,
	  options?: { silent?: boolean }
	) => {
	  const silent = !!options?.silent;
	  const character = (project.characters || []).find(c => c.id === characterId);
	  if (!character) return;
	  const taskCode = character.imageGenerationMeta?.taskCode;
	
	  if (!taskCode) {
	    if (!silent) alert('该角色没有可恢复的生成任务（缺少 taskCode）');
	    return;
	  }
	
	  if (generatingCharacterId && generatingCharacterId !== characterId) {
	    if (!silent) alert('正在恢复/生成其他角色图片，请稍后');
	    return;
	  }
	
	  setGeneratingCharacterId(characterId);
	  setCharacterGenProgress({ stage: '恢复任务中', percent: 0 });
	
		  try {
		    const imageUrls = await pollAndUploadFromTask(
	      taskCode,
	      project.id,
	      `character_sheet_${characterId}`,
		      (stage, percent) => setCharacterGenProgress({ stage, percent }),
		      // S3：恢复时同样跳过 OSS，直接拿 Neodomain 永久链接
		      { skipOSSUpload: true }
	    );
	
		    const sheetUrl = imageUrls?.[0];
	    if (!sheetUrl) throw new Error('未获取到生成图片URL');
	
	    const updatedProject: Project = {
	      ...project,
	      updatedAt: new Date().toISOString(),
	      characters: (project.characters || []).map(c => {
	        if (c.id !== characterId) return c;
	        return {
	          ...c,
	          imageSheetUrl: sheetUrl,
	          imageGenerationMeta: c.imageGenerationMeta
	            ? { ...c.imageGenerationMeta, generatedAt: new Date().toISOString() }
	            : {
	                modelName: characterImageModel || '未知模型',
	                styleName: characterStyle?.name || '未知风格',
	                generatedAt: new Date().toISOString(),
	                taskCode,
	                taskCreatedAt: new Date().toISOString(),
	              },
	        };
	      }),
	    };
		
		    // 1) 先更新本地 UI（不触发全量保存）
		    await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
		    // 2) 再做最小化持久化（PATCH 只更新 characters 字段）
		    try {
		      await patchProject(project.id, { characters: updatedProject.characters });
		    } catch (err) {
		      console.warn('[ProjectDashboard] patchProject(characters) 失败，回退到全量保存:', err);
		      await Promise.resolve(onUpdateProject(updatedProject));
		    }
	  } catch (error: any) {
	    console.warn('恢复角色设定图失败:', error);
	    if (!silent) {
	      alert(`❌ 恢复失败: ${error?.message || '未知错误'}\n\n请检查网络连接或稍后重试。`);
	    }
	  } finally {
	    setGeneratingCharacterId(null);
	    setCharacterGenProgress(null);
	  }
	};

	const handleResumeSceneImageSheet = async (
	  sceneId: string,
	  options?: { silent?: boolean }
	) => {
	  const silent = !!options?.silent;
	  const scene = (project.scenes || []).find(s => s.id === sceneId);
	  if (!scene) return;
	  const taskCode = scene.imageGenerationMeta?.taskCode;
	
	  if (!taskCode) {
	    if (!silent) alert('该场景没有可恢复的生成任务（缺少 taskCode）');
	    return;
	  }
	
	  if (generatingSceneId && generatingSceneId !== sceneId) {
	    if (!silent) alert('正在恢复/生成其他场景图片，请稍后');
	    return;
	  }
	
	  setGeneratingSceneId(sceneId);
	  setSceneGenProgress({ stage: '恢复任务中', percent: 0 });
	
		  try {
		    const imageUrls = await pollAndUploadFromTask(
	      taskCode,
	      project.id,
	      `scene_sheet_${sceneId}`,
		      (stage, percent) => setSceneGenProgress({ stage, percent }),
		      // S3：恢复时同样跳过 OSS，直接拿 Neodomain 永久链接
		      { skipOSSUpload: true }
	    );
	
		    const sheetUrl = imageUrls?.[0];
	    if (!sheetUrl) throw new Error('未获取到生成图片URL');
	
	    const updatedProject: Project = {
	      ...project,
	      updatedAt: new Date().toISOString(),
	      scenes: (project.scenes || []).map(s => {
	        if (s.id !== sceneId) return s;
	        return {
	          ...s,
	          imageSheetUrl: sheetUrl,
	          imageGenerationMeta: s.imageGenerationMeta
	            ? { ...s.imageGenerationMeta, generatedAt: new Date().toISOString() }
	            : {
	                modelName: sceneImageModel || '未知模型',
	                styleName: sceneStyle?.name || '未知风格',
	                generatedAt: new Date().toISOString(),
	                taskCode,
	                taskCreatedAt: new Date().toISOString(),
	              },
	        };
	      }),
	    };
		
		    // 1) 先更新本地 UI（不触发全量保存）
		    await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
		    // 2) 再做最小化持久化（PATCH 只更新 scenes 字段）
		    try {
		      await patchProject(project.id, { scenes: updatedProject.scenes });
		    } catch (err) {
		      console.warn('[ProjectDashboard] patchProject(scenes) 失败，回退到全量保存:', err);
		      await Promise.resolve(onUpdateProject(updatedProject));
		    }
	  } catch (error: any) {
	    console.warn('恢复场景设定图失败:', error);
	    if (!silent) {
	      alert(`❌ 恢复失败: ${error?.message || '未知错误'}\n\n请检查网络连接或稍后重试。`);
	    }
	  } finally {
	    setGeneratingSceneId(null);
	    setSceneGenProgress(null);
	  }
	};

	// =============================
	// 🆕 自动续跑：页面加载/项目切换时，自动恢复未完成的生图任务
	// =============================
	useEffect(() => {
	  if (!project?.id) return;

	  // 切换项目时清空尝试记录
	  if (autoResumeProjectIdRef.current !== project.id) {
	    autoResumeProjectIdRef.current = project.id;
	    autoResumeAttemptedTaskCodesRef.current = new Set();
	  }

	  const run = async () => {
	    // 1) 角色任务恢复
	    for (const c of project.characters || []) {
	      const taskCode = c.imageGenerationMeta?.taskCode;
	      if (!taskCode) continue;
	      if (c.imageSheetUrl) continue;
	      if (autoResumeAttemptedTaskCodesRef.current.has(taskCode)) continue;

	      autoResumeAttemptedTaskCodesRef.current.add(taskCode);
	      console.log(`🔄 自动恢复角色设定图任务: ${c.name} (${taskCode})`);
	      await handleResumeCharacterImageSheet(c.id, { silent: true });
	    }

	    // 2) 场景任务恢复
	    for (const s of project.scenes || []) {
	      const taskCode = s.imageGenerationMeta?.taskCode;
	      if (!taskCode) continue;
	      if (s.imageSheetUrl) continue;
	      if (autoResumeAttemptedTaskCodesRef.current.has(taskCode)) continue;

	      autoResumeAttemptedTaskCodesRef.current.add(taskCode);
	      console.log(`🔄 自动恢复场景设定图任务: ${s.name} (${taskCode})`);
	      await handleResumeSceneImageSheet(s.id, { silent: true });
	    }
	  };

	  void run();
	  // 仅在 project.id 变化时触发（避免 project 对象频繁更新导致重复恢复）
	}, [project.id]);

  // 智能补充场景细节
  const handleSupplementScene = async (sceneId: string) => {
    const scene = (project.scenes || []).find(s => s.id === sceneId);
    if (!scene) return;

    // 检查是否已经有完整信息
    if (scene.visualPromptCn && scene.atmosphere) {
      alert('该场景信息已完整，无需补充');
      return;
    }

    // 获取所有剧本
    const scripts: ScriptFile[] = (project.episodes || []).map((ep, index) => ({
      episodeNumber: index + 1,
      content: ep.script || '',
      fileName: `第${index + 1}集`,
    }));

    if (scripts.length === 0 || scripts.every(s => !s.content)) {
      alert('项目中没有剧本内容，无法进行智能补充');
      return;
    }

    setIsSupplementing(true);
    setSupplementingSceneId(sceneId);

    try {
      const updatedScene = await supplementSceneDetails(scene, scripts);

      // 更新项目中的场景
      const updatedProject = {
        ...project,
        scenes: (project.scenes || []).map(s => s.id === sceneId ? updatedScene : s),
      };

      onUpdateProject(updatedProject);
      alert(`✅ 场景"${scene.name}"补充完成！`);
    } catch (error: any) {
      console.error('智能补充场景失败:', error);
      alert(`❌ 补充失败: ${error.message || '未知错误'}`);
    } finally {
      setIsSupplementing(false);
      setSupplementingSceneId(null);
    }
  };

  // 🆕 重新提取场景
  const handleExtractNewScenes = async () => {
    if (!project.episodes || project.episodes.length === 0) {
      alert('项目中没有剧本内容，无法提取场景');
      return;
    }

    const confirmExtract = confirm(
      `即将从${project.episodes.length}集剧本中重新提取场景。\n\n` +
      `现有场景数: ${project.scenes?.length || 0}个\n` +
      `提取过程可能需要1-2分钟，是否继续？`
    );

    if (!confirmExtract) return;

    setIsExtractingScenes(true);
    setExtractionProgress({ current: 0, total: 1 });

    try {
      // 构建剧本数据
      const scripts: ScriptFile[] = (project.episodes || []).map((ep, index) => ({
        episodeNumber: ep.episodeNumber || (index + 1),
        content: ep.script || '',
        fileName: `第${ep.episodeNumber || (index + 1)}集`,
      }));

      // 调用提取服务
      const newScenes = await extractNewScenes(
        scripts,
        project.scenes || [],
        'google/gemini-2.0-flash-001',
        (current, total) => setExtractionProgress({ current, total })
      );

      if (newScenes.length === 0) {
        alert('✅ 未发现新场景\n\n所有场景都已在场景库中。');
        return;
      }

      // 显示预览对话框
      const sceneNames = newScenes.map(s => `• ${s.name}`).join('\n');
      const confirmAdd = confirm(
        `🎉 发现 ${newScenes.length} 个新场景：\n\n${sceneNames}\n\n是否添加到场景库？`
      );

      if (confirmAdd) {
        const updatedProject = {
          ...project,
          scenes: [...(project.scenes || []), ...newScenes],
        };

        onUpdateProject(updatedProject);
        alert(`✅ 成功添加 ${newScenes.length} 个新场景！\n\n提示：新场景的视觉提示词为空，可使用"智能补充"功能补充。`);
      }
    } catch (error: any) {
      console.error('场景提取失败:', error);
      alert(`❌ 提取失败: ${error.message || '未知错误'}\n\n请检查网络连接或稍后重试。`);
    } finally {
      setIsExtractingScenes(false);
      setExtractionProgress({ current: 0, total: 1 });
    }
  };

  // 🆕 从文件名推断集数
  const parseEpisodeNumber = (fileName: string): number | undefined => {
    const patterns = [
      /第(\d+)集/,
      /第(\d+)话/,
      /[Ee][Pp][\s_-]?(\d+)/,
      /[Ee]pisode[\s_-]?(\d+)/i,
      /[\s_-](\d+)\.(?:txt|ini|docx)/i,
      /^(\d+)[_\s-]/,
      /^(\d+)\.(?:txt|ini|docx)$/i,
    ];
    for (const pattern of patterns) {
      const match = fileName.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }
    return undefined;
  };

  // 🆕 读取文件内容（支持 .txt, .ini, .docx）
  const readFileContent = async (file: File): Promise<string> => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } else {
      return await file.text();
    }
  };

  // 🆕 处理剧集文件上传
  const handleEpisodeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingEpisodes(true);

    try {
      const newEpisodes: Episode[] = [];
      const fileArray = Array.from(files) as File[];

      for (const file of fileArray) {
        try {
          const content = await readFileContent(file);
          const episodeNumber = parseEpisodeNumber(file.name) || (project.episodes?.length || 0) + newEpisodes.length + 1;

          newEpisodes.push({
            id: `ep-${Date.now()}-${episodeNumber}`,
            episodeNumber,
            title: `第${episodeNumber}集`,
            script: content,
            shots: [],
            status: 'draft',
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          console.error(`读取文件失败: ${file.name}`, error);
          alert(`读取文件失败: ${file.name}\n请确保文件格式正确`);
        }
      }

      if (newEpisodes.length === 0) {
        alert('没有成功读取任何剧集文件');
        return;
      }

      // 合并新剧集到项目，按集数排序
      const allEpisodes = [...(project.episodes || []), ...newEpisodes].sort(
        (a, b) => a.episodeNumber - b.episodeNumber
      );

      const updatedProject = {
        ...project,
        episodes: allEpisodes,
      };

      onUpdateProject(updatedProject);
      alert(`成功上传 ${newEpisodes.length} 个剧集！`);
    } catch (error: any) {
      console.error('上传剧集失败:', error);
      alert(`上传剧集失败: ${error.message}`);
    } finally {
      setIsUploadingEpisodes(false);
      // 清空文件输入，允许重复上传相同文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'overview', label: '概览 & 剧集', icon: '📋' },  // 🔧 合并概览和剧集
    { id: 'characters', label: '角色', icon: '👥' },
    { id: 'scenes', label: '场景', icon: '🏛️' },
  ];

  // 渲染项目概览 - 全页展开版（无滚动条）+ 剧集列表
  const renderOverview = () => (
    <div className="space-y-4">
      {/* 顶部行：基础信息 + 分卷 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* 基础信息 + 🆕 角色卡/场景卡按钮 */}
        <div className={`${cardClass} ${cardPad}`}>
          <h3 className="text-sm font-bold text-white mb-2">📋 项目信息</h3>
          <div className="space-y-1 text-xs">
            {project.settings?.mediaType && (
              <div><span className="text-gray-500">媒体类型:</span> <span className="text-blue-400">{PROJECT_MEDIA_TYPES[project.settings.mediaType]?.name || project.settings.mediaType}</span></div>
            )}
            <div><span className="text-gray-500">题材类型:</span> <span className="text-white">{project.settings?.genre || '未设置'}</span></div>
            <div><span className="text-gray-500">视觉风格:</span> <span className="text-white">{project.settings?.visualStyle || '未设置'}</span></div>
            <div><span className="text-gray-500">剧集:</span> <span className="text-white">{project.episodes?.length || 0}集</span></div>
            <div><span className="text-gray-500">角色:</span> <span className="text-white">{project.characters?.length || 0}个</span></div>
            <div><span className="text-gray-500">场景:</span> <span className="text-white">{project.scenes?.length || 0}个</span></div>
          </div>

          {/* 🆕 角色卡和场景卡按钮 - 跳转到对应Tab */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setActiveTab('characters')}
              className="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
            >
              👥 角色卡
            </button>
            <button
              onClick={() => setActiveTab('scenes')}
              className="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
            >
              🏛️ 场景卡
            </button>
          </div>
        </div>

        {/* 分卷结构 - 横向展示 */}
        {project.volumes && project.volumes.length > 0 && (
          <div className={`${cardClass} ${cardPad} lg:col-span-3`}>
            <h3 className="text-sm font-bold text-white mb-2">📖 分卷 ({project.volumes.length})</h3>
            <div className="flex flex-wrap gap-2">
              {project.volumes.map((vol) => (
                <div
                  key={vol.id}
                  className="flex items-center gap-2 text-xs border-l-2 pl-2 bg-gray-750 rounded-r pr-2 py-1"
                  style={{ borderColor: vol.color || '#22c55e' }}
                >
                  <span className="text-white font-medium">V{vol.volumeNumber}</span>
                  <span className="text-gray-500">Ep{vol.episodeRange[0]}-{vol.episodeRange[1]}</span>
                  <span className="text-gray-400">{vol.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 世界观 - 全宽展开 */}
      <div className={`${cardClass} ${cardPad}`}>
        <h3 className="text-sm font-bold text-white mb-2">🌍 世界观</h3>
        <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap">
          {project.settings?.worldView || '未设置'}
        </p>
      </div>

      {/* 专有名词 - 全宽展开 */}
      {project.settings?.keyTerms && project.settings.keyTerms.length > 0 && (
        <div className={`${cardClass} ${cardPad}`}>
          <h3 className="text-sm font-bold text-white mb-2">📚 名词 ({project.settings.keyTerms.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {project.settings.keyTerms.map((term, i) => (
              <span key={i} className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs hover:bg-gray-600 cursor-help" title={term.explanation}>
                {term.term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* BOSS档案 - 全宽横向展示 */}
      {project.antagonists && project.antagonists.length > 0 && (
        <div className={`${cardClass} ${cardPad}`}>
          <h3 className="text-sm font-bold text-white mb-2">👹 BOSS ({project.antagonists.length})</h3>
          <div className="flex flex-wrap gap-2">
            {project.antagonists.map((boss) => (
              <div key={boss.id} className="flex items-center gap-2 text-xs bg-gray-750 px-2 py-1 rounded">
                <span className="text-red-400 font-medium">{boss.name}</span>
                <span className="text-gray-500">{boss.volumeOrArc}</span>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* 🆕 剧集列表（合并到概览页） */}
      <div className={`${cardClass} ${cardPad}`}>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-white">📺 剧集列表 ({project.episodes?.length || 0})</h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingEpisodes}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2.5 py-1.5 rounded text-xs font-medium"
          >
            {isUploadingEpisodes ? '⏳ 上传中...' : '📤 上传剧集'}
          </button>
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.ini,.docx"
            multiple
            onChange={handleEpisodeUpload}
            className="hidden"
          />
        </div>

        {/* 书本式卡片：左侧集数色块 + 右侧标题/大纲/状态 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(project.episodes || []).map((ep) => {
            // 从 storyOutline 中找到对应集数的大纲
            const outline = project.storyOutline?.find(o => o.episodeNumber === ep.episodeNumber);
            const summary = outline?.summary || '暂无大纲';

            // 检查是否有故事板数据
            const hasStoryboard = ep.shots && ep.shots.length > 0 && ep.shots.some(s => s.storyboardGridUrl);

            return (
              <div
                key={ep.id}
                className="bg-gray-800 rounded-lg border border-gray-700/60 hover:border-gray-600/60 overflow-hidden transition-all hover:shadow-lg hover:shadow-blue-500/10 group"
              >
                {/* 书本式布局：左侧色块（集数）+ 右侧内容 */}
                <div className="flex items-stretch">
                  {/* 左侧：集数色块（模拟书脊） */}
                  <div className="bg-gradient-to-b from-blue-600 to-blue-700 w-16 shrink-0 flex flex-col items-center justify-center text-white p-2 border-r-2 border-blue-500/30">
                    <span className="text-xs font-medium opacity-80">第</span>
                    <span className="text-2xl font-bold">{ep.episodeNumber}</span>
                    <span className="text-xs font-medium opacity-80">集</span>
                  </div>

                  {/* 右侧：标题 + 大纲 + 状态 */}
                  <div className="flex-1 p-3 min-w-0">
                    {/* 标题 + 状态 */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4
                        className="text-white text-sm font-semibold leading-tight flex-1 min-w-0 group-hover:text-blue-300 transition-colors cursor-pointer"
                        onClick={() => onSelectEpisode(ep)}
                      >
                        {ep.title}
                      </h4>
                      <StatusBadge status={ep.status} />
                    </div>

                    {/* 大纲摘要（最多 3 行） */}
                    <p
                      className="text-gray-400 text-xs leading-relaxed line-clamp-3 mb-2 cursor-pointer"
                      onClick={() => onSelectEpisode(ep)}
                    >
                      {summary}
                    </p>

                    {/* 底部元信息 + 操作按钮 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        <span>{ep.shots?.length || 0} 个分镜</span>
                        <span>·</span>
                        <span>{new Date(ep.updatedAt).toLocaleDateString()}</span>
                      </div>

                      {/* 🆕 查看故事板按钮 */}
                      {hasStoryboard && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEpisode(ep);
                            // 需要在 App.tsx 中添加逻辑，检测到有故事板数据时直接跳转到 FINAL_STORYBOARD
                          }}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-medium transition-all"
                          title="查看最终故事板"
                        >
                          📋 故事板
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // 渲染角色库 - 紧凑版
  const renderCharacters = () => (
    <div className="space-y-2">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <h3 className="text-sm font-bold text-white">👥 角色库 ({project.characters?.length || 0})</h3>
          <button className={primaryBtnClass}>+ 添加</button>
        </div>

        {/* 🆕 顶部控制栏：模型 + 风格 */}
        <div className={`${cardClass} ${cardPad}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <AIImageModelSelector
              value={characterImageModel}
              onChange={setCharacterImageModel}
              scenarioType={ScenarioType.DESIGN}
              label="角色生图模型"
            />

            <div>
              <label className="model-selector-label">角色风格</label>
              <select
                value={characterStyleId}
                onChange={(e) => setCharacterStyleId(e.target.value)}
                className="model-selector-select"
              >
                {STORYBOARD_STYLES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="mt-2 text-[11px] text-gray-400">
                说明：点击角色卡的绿色"🎨 生成设定图"按钮才会生图（消耗积分）。
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[11px] text-gray-400 leading-relaxed">
                生成内容：单张 16:9 角色设定图（通常为 2×2 四分屏：正/侧/背 + 面部特写）。
              </div>

              {/* 🆕 批量生成按钮 */}
              <button
                onClick={handleBatchGenerateCharacters}
                disabled={isBatchGeneratingCharacters || !characterImageModel}
                className={`${primaryBtnClass} w-full disabled:opacity-50 disabled:cursor-not-allowed`}
                title="批量生成所有未生成设定图的角色"
              >
                {isBatchGeneratingCharacters ? (
                  <>⏳ 批量生成中 ({batchCharacterProgress?.current}/{batchCharacterProgress?.total})</>
                ) : (
                  <>🎨 批量生成所有角色设定图</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {(project.characters || []).map((char) => {
          const charCompleteness = charactersCompleteness.find(c => c.character.id === char.id);
          return (
            <CharacterCard
              key={char.id}
              character={char}
              isExpanded={expandedCharacter === char.id}
              onToggle={() => setExpandedCharacter(expandedCharacter === char.id ? null : char.id)}
              onEdit={() => openEditModal('character', char)}
              onEditForm={(form) => openEditModal('form', form, char)}
              completeness={charCompleteness?.completeness}
              missingFields={charCompleteness?.missingFields}
              onSupplement={() => handleSupplementCharacter(char.id)}
              isSupplementing={isSupplementing && supplementingCharacterId === char.id}
              onGenerateImage={() => handleGenerateCharacterImageSheet(char.id)}
              isGenerating={generatingCharacterId === char.id}
              generationProgress={generatingCharacterId === char.id ? characterGenProgress : null}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900">
      {/* 顶部导航 - 紧凑 */}
      <div className="sticky top-0 z-20 bg-gray-800/95 backdrop-blur border-b border-gray-700">
        <div className={`${containerClass} py-2 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="text-gray-400 hover:text-white text-sm shrink-0">← 返回</button>
            <h1 className="text-base font-bold text-white truncate">{project.name}</h1>
            {project.settings?.genre && (
              <span className="text-gray-500 text-xs bg-gray-900/40 border border-gray-700/60 px-2 py-0.5 rounded-full shrink-0">
                {project.settings.genre}
              </span>
            )}
          </div>

          {/* 标签页导航 - 小屏横向滚动（不改变交互，仅排版更稳） */}
          <div className="flex gap-1 overflow-x-auto max-w-[60%] sm:max-w-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors rounded whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 内容区域 - 紧凑padding */}
      <div className={`${containerClass} py-3`}>
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'characters' && renderCharacters()}
        {activeTab === 'scenes' && (
          <ScenesTab
            project={project}
            onEditScene={(scene) => openEditModal('scene', scene)}
            onSupplementScene={handleSupplementScene}
            isSupplementing={isSupplementing}
            supplementingSceneId={supplementingSceneId}
            onExtractNewScenes={handleExtractNewScenes}
            isExtracting={isExtractingScenes}
            extractionProgress={extractionProgress}
            sceneImageModel={sceneImageModel}
            onChangeSceneImageModel={setSceneImageModel}
            sceneStyleId={sceneStyleId}
            onChangeSceneStyleId={setSceneStyleId}
            onGenerateSceneImageSheet={handleGenerateSceneImageSheet}
            generatingSceneId={generatingSceneId}
            generationProgress={sceneGenProgress}
            onBatchGenerateScenes={handleBatchGenerateScenes}
            isBatchGeneratingScenes={isBatchGeneratingScenes}
            batchSceneProgress={batchSceneProgress}
          />
        )}
        {/* 🔧 移除独立的 episodes tab，已合并到 overview */}
      </div>

      {/* 编辑模态框 */}
      <EditModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        type={editType}
        data={editData}
        onSave={handleSaveEdit}
        parentCharacter={editParentCharacter}
      />
    </div>
  );
};

// 角色卡片组件 - 紧凑版
const CharacterCard: React.FC<{
  character: CharacterRef;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onEditForm: (form: CharacterForm) => void;
  completeness?: number;
  missingFields?: { field: string; label: string; weight: number }[];
  onSupplement?: () => void;
  isSupplementing?: boolean;
  onGenerateImage?: () => void;
  isGenerating?: boolean;
  generationProgress?: { stage: string; percent: number } | null;
}> = ({
  character,
  isExpanded,
  onToggle,
  onEdit,
  onEditForm,
  completeness,
  missingFields,
  onSupplement,
  isSupplementing,
  onGenerateImage,
  isGenerating,
  generationProgress,
}) => {
  const completenessInfo = completeness !== undefined ? getCompletenessLevel(completeness) : null;

  return (
    <div className="bg-gray-800 rounded overflow-hidden">
      {/* 角色头部信息 */}
      <div className="p-2 cursor-pointer hover:bg-gray-750 flex items-center gap-2" onClick={onToggle}>
        {/* 头像 */}
        <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-sm shrink-0">
          {character.data ? (
            <img src={character.data} alt={character.name} className="w-full h-full rounded-full object-cover" />
          ) : (character.gender === '女' ? '👩' : '👨')}
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-white font-medium text-sm">{character.name}</span>
            <span className="text-gray-500 text-xs">{character.gender}</span>
            {character.forms && character.forms.length > 0 && (
              <span className="text-blue-400 text-xs">({character.forms.length}形态)</span>
            )}
            {/* 完整度指示器 */}
            {completenessInfo && (
              <span className={`text-xs ${completenessInfo.color}`} title={`完整度: ${completeness}%`}>
                {completenessInfo.emoji} {completeness}%
              </span>
            )}
          </div>
          {character.identityEvolution && (
            <p className="text-gray-500 text-xs truncate">{character.identityEvolution}</p>
          )}
        </div>

        {/* 能力标签 - 全部显示 */}
        {character.abilities && character.abilities.length > 0 && (
          <div className="flex flex-wrap gap-1 shrink-0 max-w-[200px]">
            {character.abilities.map((a, i) => (
              <span key={i} className="bg-blue-900 text-blue-300 px-1 py-0.5 rounded text-[10px]">{a}</span>
            ))}
          </div>
        )}

        {/* 编辑按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="text-gray-500 hover:text-blue-400 text-xs px-1"
          title="编辑角色"
        >
          ✏️
        </button>

        {/* 🆕 生成角色设定图 */}
        {onGenerateImage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerateImage();
            }}
            disabled={!!isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white px-3 py-1.5 rounded text-sm font-medium disabled:cursor-not-allowed transition-colors"
            title={character.imageSheetUrl ? '重新生成角色设定图' : '生成角色设定图'}
          >
            {isGenerating ? '⏳ 生成中...' : (character.imageSheetUrl ? '� 重新生成' : '🎨 生成设定图')}
          </button>
        )}

        <span className="text-gray-500 text-xs">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {/* 🆕 生成进度 */}
      {isGenerating && generationProgress && (
        <div className="border-t border-gray-700 p-2 text-[11px] text-gray-300 bg-gray-850">
          <div className="flex items-center justify-between gap-2">
            <span>⏳ {generationProgress.stage}</span>
            <span className="text-gray-500">{Math.round(generationProgress.percent)}%</span>
          </div>
          <div className="mt-1 h-1.5 bg-gray-700 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.max(0, Math.min(100, generationProgress.percent))}%` }}
            />
          </div>
        </div>
      )}

      {/* 🆕 设定图预览（直接展示整张设定图，不做切割） */}
      {character.imageSheetUrl && (
        <div className="border-t border-gray-700 p-2 bg-gray-850">
          <img
            src={character.imageSheetUrl}
            alt={`${character.name} 设定图`}
            className="w-full rounded bg-gray-900/40 border border-gray-700/60 object-contain max-h-[320px]"
            loading="lazy"
          />
          {character.imageGenerationMeta && (
            <div className="mt-1 text-[10px] text-gray-500">
              模型：{character.imageGenerationMeta.modelName} · 风格：{character.imageGenerationMeta.styleName}
            </div>
          )}
        </div>
      )}

      {/* 缺失字段提示和智能补充按钮 */}
      {missingFields && missingFields.length > 0 && completeness !== undefined && (
        <div className={`border-t border-gray-700 p-2 ${completeness < 85 ? 'bg-yellow-900/20' : 'bg-blue-900/10'}`}>
          <div className="flex items-center justify-between mb-1">
            <div className={`text-xs ${completeness < 85 ? 'text-yellow-400' : 'text-blue-400'}`}>
              {completeness < 85 ? '⚠️ 待补充信息：' : '💡 可继续优化：'}
            </div>
            {onSupplement && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSupplement();
                }}
                disabled={isSupplementing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2 py-1 rounded text-[10px] flex items-center gap-1"
                title={completeness < 85 ? '使用AI智能补充角色细节' : '继续优化角色信息'}
              >
                {isSupplementing ? '⏳ 补充中...' : (completeness < 85 ? '✨ 智能补充' : '🔄 继续补充')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {missingFields.slice(0, 3).map((field, idx) => {
              // 🆕 特殊处理形态字段，显示剧本中发现的形态数量
              const isFormField = field.field === 'forms' && field.label.includes('剧本中发现');
              return (
                <span
                  key={idx}
                  className={`px-2 py-0.5 rounded text-[10px] ${
                    isFormField
                      ? 'bg-purple-900/50 text-purple-300 border border-purple-500'
                      : completeness < 85
                        ? 'bg-yellow-900/50 text-yellow-300'
                        : 'bg-blue-900/50 text-blue-300'
                  }`}
                  title={isFormField ? '点击"智能补充"可自动提取剧本中的形态' : ''}
                >
                  {field.label}
                </span>
              );
            })}
            {missingFields.length > 3 && (
              <span className={`text-[10px] ${completeness < 85 ? 'text-yellow-500' : 'text-blue-500'}`}>
                +{missingFields.length - 3}项
              </span>
            )}
          </div>
        </div>
      )}

      {/* 形态列表 - 始终显示（不需要点击展开） */}
      {character.forms && character.forms.length > 0 && (
        <div className="border-t border-gray-700 p-2 bg-gray-850">
          <div className="grid grid-cols-2 gap-2">
            {character.forms.map((form) => (
              <div key={form.id} className="bg-gray-700 rounded p-2 text-xs group relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium">{form.name}</span>
                  <div className="flex items-center gap-1">
                    {form.episodeRange && (
                      <span className="bg-blue-900 text-blue-300 px-1 py-0.5 rounded text-[10px]">
                        {form.episodeRange}
                      </span>
                    )}
                    <button
                      onClick={() => onEditForm(form)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-400 text-[10px]"
                      title="编辑形态"
                    >
                      ✏️
                    </button>
                  </div>
                </div>
                {/* 🆕 描述完整显示（不截断） */}
                <p className="text-gray-300 text-[10px] leading-relaxed whitespace-pre-wrap">{form.description}</p>
                {form.note && (
                  <p className="text-gray-500 text-[10px] mt-1 italic">💡 {form.note}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// 场景库标签页 - 紧凑版（支持点击展开详情）
const ScenesTab: React.FC<{
  project: Project;
  onEditScene: (scene: SceneRef) => void;
  onSupplementScene?: (sceneId: string) => void;
  isSupplementing?: boolean;
  supplementingSceneId?: string | null;
  onExtractNewScenes?: () => void;
  isExtracting?: boolean;
  extractionProgress?: { current: number; total: number };
  sceneImageModel: string;
  onChangeSceneImageModel: (modelName: string) => void;
  sceneStyleId: string;
  onChangeSceneStyleId: (styleId: string) => void;
  onGenerateSceneImageSheet: (sceneId: string) => void;
  generatingSceneId: string | null;
  generationProgress: { stage: string; percent: number } | null;
  onBatchGenerateScenes?: () => void;
  isBatchGeneratingScenes?: boolean;
  batchSceneProgress?: { current: number; total: number } | null;
}> = ({
  project,
  onEditScene,
  onSupplementScene,
  isSupplementing,
  supplementingSceneId,
  onExtractNewScenes,
  isExtracting,
  extractionProgress,
  sceneImageModel,
  onChangeSceneImageModel,
  sceneStyleId,
  onChangeSceneStyleId,
  onGenerateSceneImageSheet,
  generatingSceneId,
  generationProgress,
  onBatchGenerateScenes,
  isBatchGeneratingScenes,
  batchSceneProgress,
}) => {
  const [expandedScene, setExpandedScene] = React.useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h3 className="text-sm font-bold text-white">🏛️ 场景库 ({project.scenes?.length || 0})</h3>
        <div className="flex gap-2">
          {/* 🆕 重新提取按钮 */}
          {onExtractNewScenes && (
            <button
              onClick={onExtractNewScenes}
              disabled={isExtracting}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2 py-1 rounded text-xs flex items-center gap-1"
              title="从剧本中重新智能提取新场景"
            >
              {isExtracting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>提取中...</span>
                </>
              ) : (
                <>
                  <span>🔍</span>
                  <span>重新提取</span>
                </>
              )}
            </button>
          )}
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded text-xs font-medium">+ 添加</button>
        </div>
      </div>

      {/* 🆕 顶部控制栏：模型 + 风格 */}
      <div className="bg-gray-800 rounded-lg border border-gray-700/60 p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <AIImageModelSelector
            value={sceneImageModel}
            onChange={onChangeSceneImageModel}
            scenarioType={ScenarioType.DESIGN}
            label="场景生图模型"
          />

          <div>
            <label className="model-selector-label">场景风格</label>
            <select
              value={sceneStyleId}
              onChange={(e) => onChangeSceneStyleId(e.target.value)}
              className="model-selector-select"
            >
              {STORYBOARD_STYLES.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="mt-2 text-[11px] text-gray-400">
              说明：点击场景卡的绿色"🎨 生成设定图"按钮才会生图（消耗积分）。
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[11px] text-gray-400 leading-relaxed">
              生成内容：单张 16:9 场景设定图（通常为 2×2 四分屏：多角度 + 关键特写）。
            </div>

            {/* 🆕 批量生成按钮 */}
            {onBatchGenerateScenes && (
              <button
                onClick={onBatchGenerateScenes}
                disabled={isBatchGeneratingScenes || !sceneImageModel}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2.5 py-1.5 rounded text-xs font-medium w-full disabled:opacity-50"
                title="批量生成所有未生成设定图的场景"
              >
                {isBatchGeneratingScenes ? (
                  <>⏳ 批量生成中 ({batchSceneProgress?.current}/{batchSceneProgress?.total})</>
                ) : (
                  <>🎨 批量生成所有场景设定图</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {(project.scenes || []).map((scene) => {
          const isExpanded = expandedScene === scene.id;
          return (
            <div
              key={scene.id}
              className={`bg-gray-800 rounded-lg border border-gray-700/60 p-3 cursor-pointer transition-all hover:bg-gray-750 hover:border-gray-600/60 group ${
                isExpanded ? 'col-span-1 md:col-span-2 xl:col-span-3 ring-1 ring-blue-500/70' : ''
              }`}
              onClick={() => setExpandedScene(isExpanded ? null : scene.id)}
            >
              <div className="flex justify-between items-start">
                <h4 className="text-white font-medium text-sm">{scene.name}</h4>
                <div className="flex items-center gap-1">
                  {/* 🆕 生成场景设定图 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerateSceneImageSheet(scene.id);
                    }}
                    disabled={generatingSceneId === scene.id}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs font-medium disabled:cursor-not-allowed transition-colors"
                    title={scene.imageSheetUrl ? '重新生成场景设定图' : '生成场景设定图'}
                  >
                    {generatingSceneId === scene.id ? '⏳ 生成中...' : (scene.imageSheetUrl ? '� 重新生成' : '🎨 生成设定图')}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditScene(scene); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-400 text-xs"
                    title="编辑场景"
                  >
                    ✏️
                  </button>
                  <span className="text-gray-500 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
                </div>
              </div>
              <p className={`text-gray-400 text-xs mt-0.5 ${isExpanded ? '' : 'line-clamp-2'}`}>
                {scene.description}
              </p>

              {/* 🆕 生成进度（仅当前场景显示） */}
              {generatingSceneId === scene.id && generationProgress && (
                <div className="mt-2 text-[11px] text-gray-300">
                  <div className="flex items-center justify-between gap-2">
                    <span>⏳ {generationProgress.stage}</span>
                    <span className="text-gray-500">{Math.round(generationProgress.percent)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-gray-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${Math.max(0, Math.min(100, generationProgress.percent))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 🆕 设定图预览（直接展示整张设定图，不做切割） */}
              {scene.imageSheetUrl && (
                <div className="mt-2">
                  <img
                    src={scene.imageSheetUrl}
                    alt={`${scene.name} 设定图`}
                    className="w-full rounded bg-gray-900/40 border border-gray-700/60 object-contain max-h-[320px]"
                    loading="lazy"
                  />
                  {scene.imageGenerationMeta && (
                    <div className="mt-1 text-[10px] text-gray-500">
                      模型：{scene.imageGenerationMeta.modelName} · 风格：{scene.imageGenerationMeta.styleName}
                    </div>
                  )}
                </div>
              )}

              {/* 🆕 智能补充按钮 - 始终显示（如果缺少信息） */}
              {onSupplementScene && (!scene.visualPromptCn || !scene.atmosphere) && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSupplementScene(scene.id);
                    }}
                    disabled={isSupplementing && supplementingSceneId === scene.id}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2 py-1 rounded text-[10px] flex items-center gap-1 w-full justify-center"
                    title="使用AI智能补充场景详细信息"
                  >
                    {isSupplementing && supplementingSceneId === scene.id ? '⏳ 补充中...' : '✨ 智能补充'}
                  </button>
                  <p className="text-gray-500 text-[9px] mt-1 text-center">
                    ⚠️ 缺少: {!scene.visualPromptCn && '视觉提示'} {!scene.atmosphere && '氛围'}
                  </p>
                </div>
              )}

              {/* 展开时显示更多信息 */}
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-gray-700 space-y-1">
                  {scene.visualPromptCn && (
                    <div className="text-[10px]">
                      <span className="text-blue-400">中文提示词：</span>
                      <span className="text-gray-300">{scene.visualPromptCn}</span>
                    </div>
                  )}
                  {scene.visualPromptEn && (
                    <div className="text-[10px]">
                      <span className="text-green-400">English Prompt：</span>
                      <span className="text-gray-300">{scene.visualPromptEn}</span>
                    </div>
                  )}
                  {scene.atmosphere && (
                    <div className="text-[10px]">
                      <span className="text-purple-400">氛围：</span>
                      <span className="text-gray-300">{scene.atmosphere}</span>
                    </div>
                  )}
                </div>
              )}
              {/* 🆕 集数全部显示（不需要点击） */}
              {scene.appearsInEpisodes && scene.appearsInEpisodes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {scene.appearsInEpisodes.map((ep) => (
                    <span key={ep} className="bg-gray-700 text-gray-400 px-1 py-0.5 rounded text-[10px]">Ep{ep}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 🔧 EpisodesTab 已移除，剧集列表已合并到 renderOverview() 中

// 状态徽章 - 紧凑版
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-gray-600', text: 'text-gray-300', label: '草稿' },
    cleaned: { bg: 'bg-yellow-600', text: 'text-yellow-100', label: '清洗' },
    generated: { bg: 'bg-blue-600', text: 'text-blue-100', label: '生成' },
    reviewed: { bg: 'bg-green-600', text: 'text-green-100', label: '审核' },
    exported: { bg: 'bg-purple-600', text: 'text-purple-100', label: '导出' },
  };
  const c = config[status] || config.draft;
  return <span className={`${c.bg} ${c.text} px-1 py-0.5 rounded text-[10px]`}>{c.label}</span>;
};

export default ProjectDashboard;

