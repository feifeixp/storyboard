/**
 * 项目主界面 - 紧凑布局版本
 * 一页可以看到更多内容
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Project, Episode, StoryVolume, Antagonist, EpisodeSummary, SceneRef, PROJECT_MEDIA_TYPES, ScriptFile } from '../types/project';
import { CharacterRef, CharacterForm, STORYBOARD_STYLES, type StoryboardStyle } from '../types';
import { EditModal } from './EditModal';
import { calculateAllCharactersCompleteness, getCompletenessLevel } from '../services/characterCompleteness';
import { supplementCharacterDetails } from '../services/characterSupplement/index';
import { hasProjectStyle, getEffectiveCharacterSceneStyle, getStylePromptSuffix } from '../services/styleSettings';
import type { FormSummary } from '../services/characterSupplement/types';
import { supplementSceneDetails } from '../services/sceneSupplement';
import { extractNewScenes } from '../services/sceneExtraction';
import AIImageModelSelector from './AIImageModelSelector';
import { ScenarioType, generateAndUploadImage, pollAndUploadFromTask } from '../services/aiImageGeneration';
import { patchProject, saveProject } from '../services/d1Storage';
import { uploadToOSS, generateOSSPath } from '../services/oss';
import { analyzeCharacterImage, mergeAnalysisToCharacter } from '../services/characterImageAnalysis';
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

  // 🔧 使用 ref 保存最新的 project 状态（避免并发更新时覆盖数据）
  const projectRef = useRef<Project>(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // 🔧 串行化写入锁：防止并发生成时多个任务互相覆盖 imageSheetUrl
  // 原理：每次写入追加到链末尾，链中的写入在执行时才读取 projectRef.current（最新状态）
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());

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

  // 🔧 支持多个角色/形态同时生成（并发）
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [genProgressMap, setGenProgressMap] = useState<Map<string, { stage: string; percent: number }>>(new Map());

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

  // 🆕 角色图片上传和分析状态
  const [uploadCharacterImageDialogOpen, setUploadCharacterImageDialogOpen] = useState(false);
  const [uploadingCharacterId, setUploadingCharacterId] = useState<string | null>(null);
  const [uploadImageUrl, setUploadImageUrl] = useState('');
  const [uploadImageFile, setUploadImageFile] = useState<File | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);

  // =============================
  // 🆕 生图任务恢复（自动续跑）
  // 说明：用于“任务已创建/可能已完成，但因断网导致结果未写回 D1”的场景。
  // =============================
  // 记录本次页面会话中已尝试自动恢复的 taskCode，避免重复触发
  const autoResumeAttemptedTaskCodesRef = useRef<Set<string>>(new Set());
  // 记录上一次执行自动恢复的项目ID（切换项目时清空尝试记录）
  const autoResumeProjectIdRef = useRef<string | null>(null);

  // UI-only style tokens（仅排版/视觉优化：不改变任何功能逻辑）
  const containerClass = 'max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 relative z-10';
  const cardClass = 'bg-[#1a1d2d]/80 backdrop-blur-md rounded-xl border border-white/10 shadow-lg transition-all hover:border-purple-500/50 hover:shadow-[0_8px_30px_rgba(139,92,246,0.15)]';
  const cardPad = 'p-4 md:p-5';
  const primaryBtnClass = 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5';

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
  // 🔧 支持 formId 参数：为指定形态生成设定图
  // 🔧 支持 referenceImageUrl 参数：使用参考图生成（用于子形象生成，保持发型/面部/身材一致）
  const handleGenerateCharacterImageSheet = async (
    characterId: string,
    skipConfirm = false,
    formId?: string,
    referenceImageUrl?: string
  ) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;
    if (!characterImageModel) { alert('请先选择生图模型'); return; }

    // 🔧 生成唯一 ID（角色ID 或 角色ID_形态ID）
    const genKey = characterId + (formId ? `_${formId}` : '');

    // 检查该角色/形态是否已在生成中（允许不同角色并发）
    if (generatingIds.has(genKey)) { alert('该角色/形态正在生成中，请稍后'); return; }

    // 查找目标形态
    const targetForm = formId ? character.forms?.find(f => f.id === formId) : null;
    if (formId && !targetForm) { alert('未找到指定形态'); return; }
    const targetLabel = targetForm ? `角色「${character.name}」的形态「${targetForm.name}」` : `角色「${character.name}」`;

    // 🔧 批量生成时跳过确认对话框
    if (!skipConfirm) {
      if (!confirm(`将为${targetLabel}生成 1 张设定图（会消耗积分）。\n\n是否继续？`)) return;
    }

    // 🔧 向 Set 中添加（支持并发）
    setGeneratingIds(prev => new Set(prev).add(genKey));
    setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage: '准备中', percent: 0 }); return m; });

    try {
      let createdTaskCode: string | null = null;
      let createdTaskAt: string | null = null;
      const styleSuffix = characterStyle?.promptSuffix || '';
      const projectVisualStyle = project.settings?.visualStyle || '';

      // 🔧 根据是否指定形态，构建不同的提示词
      let baseInfoCn: string;
      if (targetForm) {
        // 形态设定图：使用形态的描述和视觉提示词
        baseInfoCn = [
          `角色设定图 - 特定形态`, `角色：${character.name}`, `形态：${targetForm.name}`,
          targetForm.description ? `形态描述：${targetForm.description}` : '',
          targetForm.visualPromptCn ? `视觉特征：${targetForm.visualPromptCn}` : '',
          character.appearance ? `基础外观：${character.appearance}` : '',
          character.gender ? `性别：${character.gender}` : '',
          character.ageGroup ? `年龄段：${character.ageGroup}` : '',
          targetForm.note ? `备注：${targetForm.note}` : '',
          projectVisualStyle ? `项目视觉风格：${projectVisualStyle}` : '',
        ].filter(Boolean).join('；');
      } else {
        // 主形态设定图：使用角色基础信息
        baseInfoCn = [
          `角色设定图`, `角色：${character.name}`,
          character.appearance ? `外观：${character.appearance}` : '',
          character.gender ? `性别：${character.gender}` : '',
          character.ageGroup ? `年龄段：${character.ageGroup}` : '',
          projectVisualStyle ? `项目视觉风格：${projectVisualStyle}` : '',
        ].filter(Boolean).join('；');
      }

      const prompt = [
        baseInfoCn,
        // 🔧 有主角色参考图时，强调保持面部/发型/身材一致
        referenceImageUrl
          ? 'IMPORTANT: Maintain the EXACT same face, hairstyle, body proportions, and skin tone as the reference character image. Only the outfit/costume/form changes.'
          : '',
        '16:9 canvas, 1x4 horizontal grid layout with 4 equal panels, edge-to-edge, clean background, consistent character, consistent outfit, consistent face.',
        'Panels from left to right: (1) front full-body standing, (2) side profile full-body, (3) back full-body, (4) face close-up portrait.',
        'NO text, NO labels, NO numbers, NO watermark, NO logo.',
        styleSuffix,
      ].filter(Boolean).join(' ');

      const shotNumber = targetForm ? `character_sheet_${characterId}_form_${formId}` : `character_sheet_${characterId}`;

      const imageUrls = await generateAndUploadImage(
        {
          prompt,
          negativePrompt: NEGATIVE_PROMPT,
          modelName: characterImageModel,
          aspectRatio: '16:9',
          numImages: '1',
          outputFormat: 'jpg',
          // 🔧 如果有参考图，传入参考图以保持发型/面部/身材一致
          imageUrls: referenceImageUrl ? [referenceImageUrl] : undefined,
        },
        project.id,
        shotNumber,
        (stage, percent) => setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage, percent }); return m; }),
        async (taskCode) => {
          // ✅ 任务创建后立即持久化 taskCode（断网/刷新后可恢复）
          createdTaskCode = taskCode;
          createdTaskAt = new Date().toISOString();
          setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage: '保存任务信息', percent: 15 }); return m; });
          const metaData = {
            modelName: characterImageModel,
            styleName: characterStyle?.name || '未知风格',
            generatedAt: createdTaskAt, taskCode, taskCreatedAt: createdTaskAt,
          };
          // 🔧 使用 projectRef.current 获取最新状态，避免批量生成时覆盖其他角色的数据
          const pTask = projectRef.current;
          const taskMetaProject: Project = {
            ...pTask, updatedAt: new Date().toISOString(),
            characters: (pTask.characters || []).map(c => {
              if (c.id !== characterId) return c;
              if (targetForm) {
                // 更新形态的 imageGenerationMeta
                return { ...c, forms: (c.forms || []).map(f => f.id === formId ? { ...f, imageGenerationMeta: metaData } : f) };
              }
              // 更新角色主体的 imageGenerationMeta（不清空 imageSheetUrl，保留旧图避免生成失败导致空白）
              return { ...c, imageGenerationMeta: metaData };
            }),
          };
          try { await patchProject(pTask.id, { characters: taskMetaProject.characters }); }
          catch (err) { console.warn('[ProjectDashboard] patchProject(characters/taskCode) 失败，回退到全量保存:', err); await Promise.resolve(onUpdateProject(taskMetaProject)); }
          await Promise.resolve(onUpdateProject(taskMetaProject, { persist: false }));
        },
        { skipOSSUpload: true }
      );

      const sheetUrl = imageUrls?.[0];
      if (!sheetUrl) throw new Error('未获取到生成图片URL');

      const finalMeta = {
        modelName: characterImageModel, styleName: characterStyle?.name || '未知风格',
        generatedAt: new Date().toISOString(), taskCode: createdTaskCode || undefined, taskCreatedAt: createdTaskAt || undefined,
      };

      // 🔧 串行化写入：防止多角色并发生成时互相覆盖对方的 imageSheetUrl
      //    doWrite 在写入链中执行时才读取 projectRef.current，此时前一个任务已写完 ref，
      //    因此拿到的是包含所有已完成角色图片的最新状态。
      const doWrite = async () => {
        // 在写入链内重新读取，确保拿到上一次写入后的最新状态
        const latestProject = projectRef.current;
        const updatedProject: Project = {
          ...latestProject, updatedAt: new Date().toISOString(),
          characters: (latestProject.characters || []).map(c => {
            if (c.id !== characterId) return c;
            if (targetForm) {
              const updatedChar = { ...c, forms: (c.forms || []).map(f => f.id === formId ? { ...f, imageSheetUrl: sheetUrl, imageGenerationMeta: finalMeta } : f) };
              console.log(`[ProjectDashboard] 🔍 更新形态设定图: ${targetLabel}, URL: ${sheetUrl.substring(0, 80)}...`);
              console.log(`[ProjectDashboard] 🔍 更新后的forms:`, updatedChar.forms);
              return updatedChar;
            }
            return { ...c, imageSheetUrl: sheetUrl, imageGenerationMeta: { ...finalMeta, taskCode: createdTaskCode || c.imageGenerationMeta?.taskCode, taskCreatedAt: createdTaskAt || c.imageGenerationMeta?.taskCreatedAt } };
          }),
        };
        // 立即同步更新 ref，使链中下一个写入能立刻看到本次结果（无需等待 React 重渲）
        projectRef.current = updatedProject;
        // 先持久化到数据库，再更新前端状态
        try {
          await patchProject(latestProject.id, { characters: updatedProject.characters });
          console.log(`[ProjectDashboard] ✅ ${targetForm ? '形态' : '角色'}设定图已保存到数据库: ${targetLabel}`);
        } catch (err) {
          console.warn('[ProjectDashboard] patchProject(characters) 失败，回退到全量保存:', err);
          await saveProject(updatedProject);
        }
        await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
        console.log(`[ProjectDashboard] ✅ ${targetForm ? '形态' : '角色'}设定图已更新到前端状态: ${targetLabel}`);
      };
      // 将写入追加到串行链末尾；即使链中某个写入失败，后续写入仍继续执行
      const myWrite = writeChainRef.current.then(doWrite);
      writeChainRef.current = myWrite.catch(() => { });
      await myWrite;
    } catch (error: any) {
      console.error('生成角色设定图失败:', error);
      alert(`❌ 生成失败: ${error?.message || '未知错误'}\n\n请检查网络连接或稍后重试。`);
    } finally {
      // 🔧 从 Set/Map 中移除（支持并发）
      setGeneratingIds(prev => { const s = new Set(prev); s.delete(genKey); return s; });
      setGenProgressMap(prev => { const m = new Map(prev); m.delete(genKey); return m; });
    }
  };

  // =============================
  // 🆕 角色图片上传和 AI 分析
  // =============================
  const handleUploadCharacterImage = async (characterId: string) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;

    setUploadingCharacterId(characterId);
    setUploadCharacterImageDialogOpen(true);
    setUploadImageUrl('');
    setUploadImageFile(null);
  };

  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [avatarGenProgress, setAvatarGenProgress] = useState(0);

  const handleGenerateAvatar = async () => {
    if (!uploadingCharacterId) return;
    if (!characterImageModel) {
      alert('⚠️ 请先在页面上方选择用于生成角色的 AI 模型');
      return;
    }

    const character = (project.characters || []).find(c => c.id === uploadingCharacterId);
    if (!character) return;

    try {
      setIsGeneratingAvatar(true);
      setAvatarGenProgress(10);

      const { generateImage, pollGenerationResult } = await import('../services/aiImageGeneration');

      // 组装肖像提示词，移除可能的高风险词汇，只保留基本描述
      let appearanceInfo = [
        character.appearance,
        character.identityEvolution
      ].filter(Boolean).join('. ');

      // 简单过滤一些可能在描述中触发国内敏感词审核的词汇（血腥、暴力、色情等相关词汇的常见误杀）
      appearanceInfo = appearanceInfo
        .replace(/血|死|杀|暴|裸|胸|臀|性感|诱惑/g, ' ')
        .replace(/blood|kill|death|violence|nude|naked|sexy/gi, ' ');

      const visualStyleStr = project.settings.visualStyle ? ` in ${project.settings.visualStyle} style` : '';
      const styleSuffix = characterStyle?.promptSuffix || '';

      const prompt = `A highly detailed portrait of ${character.name}. ${appearanceInfo}.
      Facing the camera, neutral facial expression, portrait format${visualStyleStr}. ${styleSuffix}`;

      // 使用全局统一的安全负向提示词，避免触发模型敏感词拦截
      const negativePrompt = NEGATIVE_PROMPT + ', blurry, low quality, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, out of focus';

      setAvatarGenProgress(30);

      const request = {
        prompt,
        negativePrompt,
        modelName: characterImageModel,
        numImages: '1',
        aspectRatio: '1:1',
      };

      let task;
      try {
        task = await generateImage(request);
      } catch (err: any) {
        const errorMsg = err?.message || '';
        if (errorMsg.includes('sensitive') || errorMsg.includes('敏感')) {
          console.warn('[AI Avatar Generation] 触发敏感词拦截，使用极简安全提示词重试...');

          setAvatarGenProgress(20);

          // 回退到极简的安全提示词
          const safePrompt = `A high quality professional portrait of ${character.name}, facing the camera, portrait format${visualStyleStr}. ${styleSuffix}`;

          const safeRequest = {
            ...request,
            prompt: safePrompt,
            // 进一步简化负向提示词
            negativePrompt: 'blurry, low quality',
          };

          task = await generateImage(safeRequest);
        } else {
          throw err;
        }
      }

      setAvatarGenProgress(50);

      // 轮询等待结果
      const result = await pollGenerationResult(task.task_code, (status, attempt) => {
        setAvatarGenProgress(Math.min(95, 50 + attempt * 5));
      });

      if (result.image_urls && result.image_urls.length > 0) {
        const generatedImageUrl = result.image_urls[0];

        // 直接更新角色头像
        const latestProject = projectRef.current;
        const updatedProject: Project = {
          ...latestProject,
          updatedAt: new Date().toISOString(),
          characters: (latestProject.characters || []).map(c =>
            c.id === uploadingCharacterId
              ? { ...c, data: generatedImageUrl, referenceImageUrl: generatedImageUrl }
              : c
          ),
        };

        // 保存到数据库
        try {
          await patchProject(project.id, { characters: updatedProject.characters });
        } catch (err) {
          console.warn('[ProjectDashboard] patchProject(characters) 失败，回退到全量保存:', err);
          await saveProject(updatedProject);
        }

        // 更新前端状态
        await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));

        // 关闭对话框并清空状态
        setUploadCharacterImageDialogOpen(false);
        setUploadingCharacterId(null);
        setUploadImageUrl('');
        setUploadImageFile(null);

        alert('🎉 头像生成并保存成功！');
      } else {
        throw new Error('生图任务完成，但未返回图片URL');
      }
    } catch (error: any) {
      console.error('[AI Avatar Generation] Failed:', error);
      alert(`❌ 生成失败: ${error?.message || '未知错误'}`);
    } finally {
      setIsGeneratingAvatar(false);
      setAvatarGenProgress(0);
    }
  };

  const handleConfirmUploadCharacterImage = async () => {
    if (!uploadingCharacterId) return;
    if (!uploadImageUrl && !uploadImageFile) {
      alert('请输入图片 URL、选择本地文件，或使用 AI 生成');
      return;
    }

    const character = (project.characters || []).find(c => c.id === uploadingCharacterId);
    if (!character) return;

    try {
      setIsAnalyzingImage(true);

      // 1. 获取图片 URL
      let imageUrl = uploadImageUrl;
      if (uploadImageFile) {
        // 上传本地文件到 OSS
        const ossPath = generateOSSPath(
          project.id,
          `character_${character.id}_ref`,
          'image',
          uploadImageFile.name.split('.').pop() || 'jpg'
        );
        imageUrl = await uploadToOSS(uploadImageFile, ossPath);
      }

      // 2. 使用 AI 分析图片
      const existingDescription = [
        character.appearance,
        character.identityEvolution
      ].filter(Boolean).join('\n\n');

      let analysis = null;
      try {
        analysis = await analyzeCharacterImage(
          imageUrl,
          character.name,
          existingDescription
        );
      } catch (analyzeErr: any) {
        console.warn('AI 图片分析失败，将仅保存图片:', analyzeErr);
      }

      // 3. 合并分析结果到角色数据
      const updatedCharacter = analysis
        ? mergeAnalysisToCharacter(analysis, character)
        : { ...character };

      updatedCharacter.referenceImageUrl = imageUrl;  // 保存参考图片 URL
      updatedCharacter.data = imageUrl; // 🚀 更新核心展示头像

      // 4. 更新项目数据
      const latestProject = projectRef.current;
      const updatedProject: Project = {
        ...latestProject,
        updatedAt: new Date().toISOString(),
        characters: (latestProject.characters || []).map(c =>
          c.id === uploadingCharacterId ? updatedCharacter : c
        ),
      };

      // 5. 保存到数据库
      try {
        await patchProject(project.id, { characters: updatedProject.characters });
      } catch (err) {
        console.warn('[ProjectDashboard] patchProject(characters) 失败，回退到全量保存:', err);
        await saveProject(updatedProject);
      }

      // 6. 更新前端状态
      await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));

      // 7. 关闭对话框
      setUploadCharacterImageDialogOpen(false);
      setUploadingCharacterId(null);
      setUploadImageUrl('');
      setUploadImageFile(null);

      if (analysis) {
        alert(`✅ 图片保存成功！\n\nAI 已分析图片并优化了角色描述。\n置信度: ${Math.round(analysis.confidence * 100)}%`);
      } else {
        alert(`✅ 图片保存成功！\n\n(提示: 图片上传成功，但由于 AI 模型暂时不可用，跳过了自动解析角色描述的步骤。)`);
      }
    } catch (error: any) {
      console.error('上传和分析角色图片失败:', error);
      alert(`❌ 上传失败: ${error?.message || '未知错误'}\n\n请检查网络连接或稍后重试。`);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // =============================
  // 🆕 批量生成所有角色设定图
  // =============================
  const handleBatchGenerateCharacters = async () => {
    // 🔧 收集所有需要生成的任务，按角色分组，支持主形象到子形象的依赖生成
    type GenerationTask = {
      characterId: string;
      formId?: string;
      label: string;
      characterName: string;
      hasForms: boolean;
    };

    const characterTasks: Record<string, GenerationTask[]> = {};

    for (const char of (project.characters || [])) {
      const tasks: GenerationTask[] = [];

      if (char.forms && char.forms.length > 0) {
        // 有形态的角色：为每个未生成设定图的形态创建任务
        // 首先生成第一个形态（主形象），其他的作为子形象依赖主形象
        const sortedForms = [...char.forms];
        for (const form of sortedForms) {
          if (!form.imageSheetUrl) {
            tasks.push({
              characterId: char.id,
              formId: form.id,
              label: `${char.name} - ${form.name}`,
              characterName: char.name,
              hasForms: true,
            });
          }
        }
      } else {
        // 无形态的角色：为角色主体创建任务
        if (!char.imageSheetUrl) {
          tasks.push({
            characterId: char.id,
            label: char.name,
            characterName: char.name,
            hasForms: false,
          });
        }
      }

      if (tasks.length > 0) {
        characterTasks[char.id] = tasks;
      }
    }

    // 展平所有任务以便统计
    const allTasks = Object.values(characterTasks).flat();

    if (allTasks.length === 0) {
      alert('所有角色/形态都已有设定图！');
      return;
    }

    if (!characterImageModel) {
      alert('请先选择生图模型');
      return;
    }

    const confirmGenerate = confirm(
      `将并发生成 ${allTasks.length} 个角色/形态的设定图（会消耗积分）。\n\n` +
      `说明：\n` +
      `• 最多同时生成 5 个\n` +
      `• 有多个形态的角色：先生成主形象，再用主形象生成子形象（保持一致）\n\n` +
      `是否继续？`
    );
    if (!confirmGenerate) return;

    setIsBatchGeneratingCharacters(true);
    setBatchCharacterProgress({ current: 0, total: allTasks.length });

    let successCount = 0;
    let failCount = 0;

    // 🔧 并发控制：最多同时生成 5 个任务
    const CONCURRENCY_LIMIT = 5;
    let completedTasks = 0;
    const pendingTasks = [...allTasks];
    const runningTasks = new Set<string>();

    // 辅助函数：获取任务唯一标识
    const getTaskKey = (task: GenerationTask): string => {
      return task.formId ? `${task.characterId}_${task.formId}` : task.characterId;
    };

    // 辅助函数：检查任务是否依赖主形象
    const dependsOnMainForm = (task: GenerationTask): boolean => {
      if (!task.hasForms || !task.formId) return false;
      const tasks = characterTasks[task.characterId];
      if (!tasks || tasks.length < 2) return false;
      // 第一个任务是主形象，其他是子形象
      return tasks[0].formId !== task.formId;
    };

    // 辅助函数：获取主形象的图片URL
    const getMainFormImageUrl = (task: GenerationTask): string | undefined => {
      const tasks = characterTasks[task.characterId];
      if (!tasks || tasks.length < 2) return undefined;
      const mainFormId = tasks[0].formId;
      if (!mainFormId) return undefined;

      // 从最新项目状态中获取主形象的图片URL
      const latestProject = projectRef.current;
      const character = latestProject.characters?.find(c => c.id === task.characterId);
      if (!character) return undefined;
      const mainForm = character.forms?.find(f => f.id === mainFormId);
      return mainForm?.imageSheetUrl;
    };

    // 处理单个任务
    const processTask = async (task: GenerationTask): Promise<void> => {
      const taskKey = getTaskKey(task);
      runningTasks.add(taskKey);

      try {
        // 如果是子形象，检查主形象是否已生成
        let referenceImageUrl: string | undefined;
        if (dependsOnMainForm(task)) {
          // 等待主形象完成（最多等待30秒）
          const maxWaitTime = 30000;
          const startTime = Date.now();
          while (Date.now() - startTime < maxWaitTime) {
            const url = getMainFormImageUrl(task);
            if (url) {
              referenceImageUrl = url;
              console.log(`[ProjectDashboard] 子形象「${task.label}」使用主形象作为参考图`);
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        await handleGenerateCharacterImageSheet(task.characterId, true, task.formId, referenceImageUrl);
        successCount++;
      } catch (error) {
        console.error(`[ProjectDashboard] 生成角色「${task.label}」失败:`, error);
        failCount++;
      } finally {
        runningTasks.delete(taskKey);
        completedTasks++;
        setBatchCharacterProgress({ current: completedTasks, total: allTasks.length });
      }
    };

    // 并发处理任务
    while (pendingTasks.length > 0 || runningTasks.size > 0) {
      // 启动新任务直到达到并发限制
      while (pendingTasks.length > 0 && runningTasks.size < CONCURRENCY_LIMIT) {
        const task = pendingTasks.shift()!;
        // 如果是子形象且主形象还未开始，暂时跳过
        if (dependsOnMainForm(task)) {
          const mainTask = characterTasks[task.characterId]?.[0];
          if (mainTask && !runningTasks.has(getTaskKey(mainTask))) {
            // 主形象还没开始，先把子形象放回队列末尾
            pendingTasks.push(task);
            break;
          }
        }
        processTask(task).catch(err => {
          console.error(`[ProjectDashboard] 任务执行异常:`, err);
        });
      }

      // 等待至少一个任务完成
      if (runningTasks.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 🔧 并发生成完成后，触发数据刷新以确保显示正确
    // 延迟一点时间，让数据库写入完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      window.dispatchEvent(new CustomEvent('neodomain:batch-generation-complete', { detail: { type: 'character' } }));
    } catch (err) {
      console.warn('[ProjectDashboard] 触发数据刷新失败:', err);
    }

    setIsBatchGeneratingCharacters(false);
    setBatchCharacterProgress(null);
  };

  // =============================
  // 🆕 生成场景设定图（单张 16:9，通常为 2×2 四分屏：多角度 + 关键特写）
  // =============================
  // skipConfirm: 批量生成时跳过确认对话框
  const handleGenerateSceneImageSheet = async (sceneId: string, skipConfirm = false) => {
    // 🔧 使用 projectRef.current 获取最新状态，避免 stale closure 覆盖已保存数据
    const latestProject = projectRef.current;
    const scene = (latestProject.scenes || []).find(s => s.id === sceneId);
    if (!scene) return;

    if (!sceneImageModel) {
      alert('请先选择生图模型');
      return;
    }

    if (generatingSceneId) {
      alert('正在生成其他场景图片，请稍后');
      return;
    }

    if (!skipConfirm) {
      const confirmGenerate = confirm(
        `将为场景「${scene.name}」生成 1 张设定图（会消耗积分）。\n\n是否继续？`
      );
      if (!confirmGenerate) return;
    }

    setGeneratingSceneId(sceneId);
    setSceneGenProgress({ stage: '准备中', percent: 0 });

    try {
      let createdTaskCode: string | null = null;
      let createdTaskAt: string | null = null;

      const styleSuffix = sceneStyle?.promptSuffix || '';
      const projectVisualStyle = latestProject.settings?.visualStyle || '';

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
        latestProject.id,
        `scene_sheet_${sceneId}`,
        (stage, percent) => setSceneGenProgress({ stage, percent }),
        async (taskCode) => {
          createdTaskCode = taskCode;
          createdTaskAt = new Date().toISOString();
          setSceneGenProgress({ stage: '保存任务信息', percent: 15 });

          // 🔧 使用 projectRef.current 获取最新状态，避免覆盖其他已保存场景的数据
          const p = projectRef.current;
          const taskMetaProject: Project = {
            ...p,
            updatedAt: new Date().toISOString(),
            scenes: (p.scenes || []).map(s => {
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

          // 先持久化 taskCode 到数据库，再更新前端状态
          try {
            await patchProject(p.id, { scenes: taskMetaProject.scenes });
          } catch (err) {
            console.warn('[ProjectDashboard] patchProject(scenes/taskCode) 失败，回退到全量保存:', err);
            await Promise.resolve(onUpdateProject(taskMetaProject));
          }
          await Promise.resolve(onUpdateProject(taskMetaProject, { persist: false }));
        },
        // S3：设定图直接保存 Neodomain 的永久 image_urls，跳过 OSS
        { skipOSSUpload: true }
      );

      const sheetUrl = imageUrls?.[0];
      if (!sheetUrl) throw new Error('未获取到生成图片URL');

      // 🔧 生成完成：再次用 projectRef.current 获取最新状态，避免覆盖已保存的其他场景数据
      const finalProject = projectRef.current;
      const updatedProject: Project = {
        ...finalProject,
        updatedAt: new Date().toISOString(),
        scenes: (finalProject.scenes || []).map(s => {
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

      // 先持久化到数据库，再更新前端状态
      try {
        await patchProject(finalProject.id, { scenes: updatedProject.scenes });
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
        // 调用单个场景生成函数（跳过单次确认框，批量已统一确认）
        await handleGenerateSceneImageSheet(scene.id, true);
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

    // 🔧 检查该角色是否已在生成中
    const resumeKey = characterId;
    if (generatingIds.has(resumeKey)) {
      if (!silent) alert('该角色正在生成中，请稍后');
      return;
    }

    setGeneratingIds(prev => new Set(prev).add(resumeKey));
    setGenProgressMap(prev => { const m = new Map(prev); m.set(resumeKey, { stage: '恢复任务中', percent: 0 }); return m; });

    try {
      const imageUrls = await pollAndUploadFromTask(
        taskCode,
        project.id,
        `character_sheet_${characterId}`,
        (stage, percent) => setGenProgressMap(prev => { const m = new Map(prev); m.set(resumeKey, { stage, percent }); return m; }),
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
      setGeneratingIds(prev => { const s = new Set(prev); s.delete(resumeKey); return s; });
      setGenProgressMap(prev => { const m = new Map(prev); m.delete(resumeKey); return m; });
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
        'gemini-2.5-flash',
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

  // 渲染项目概览 - Neodomain 设计
  const renderOverview = () => (
    <div className="space-y-5">
      {/* 顶部行：基础信息 + 分卷 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 基础信息 + 角色卡/场景卡按钮 */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-[15px] font-semibold text-[var(--color-text)] mb-3">📋 项目信息</h3>
          <div className="space-y-2 text-[13px]">
            {project.settings?.mediaType && (
              <div><span className="text-[var(--color-text-tertiary)]">媒体类型:</span> <span className="text-[var(--color-primary-light)]">{PROJECT_MEDIA_TYPES[project.settings.mediaType]?.name || project.settings.mediaType}</span></div>
            )}
            <div><span className="text-[var(--color-text-tertiary)]">题材类型:</span> <span className="text-[var(--color-text)]">{project.settings?.genre || '未设置'}</span></div>
            <div><span className="text-[var(--color-text-tertiary)]">视觉风格:</span> <span className="text-[var(--color-text)]">{project.settings?.visualStyle || '未设置'}</span></div>
            <div><span className="text-[var(--color-text-tertiary)]">剧集:</span> <span className="text-[var(--color-text)]">{project.episodes?.length || 0}集</span></div>
            <div><span className="text-[var(--color-text-tertiary)]">角色:</span> <span className="text-[var(--color-text)]">{project.characters?.length || 0}个</span></div>
            <div><span className="text-[var(--color-text-tertiary)]">场景:</span> <span className="text-[var(--color-text)]">{project.scenes?.length || 0}个</span></div>
          </div>

          {/* 角色卡和场景卡按钮 */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setActiveTab('characters')}
              className="flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-all btn-secondary"
            >
              👥 角色卡
            </button>
            <button
              onClick={() => setActiveTab('scenes')}
              className="flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-all btn-secondary"
            >
              🏛️ 场景卡
            </button>
          </div>
        </div>

        {/* 分卷结构 - 横向展示 */}
        {project.volumes && project.volumes.length > 0 && (
          <div className="glass-card rounded-xl p-5 lg:col-span-3">
            <h3 className="text-[15px] font-semibold text-[var(--color-text)] mb-3">📖 分卷 ({project.volumes.length})</h3>
            <div className="flex flex-wrap gap-3">
              {project.volumes.map((vol) => (
                <div
                  key={vol.id}
                  className="flex items-center gap-2 text-[13px] border-l-2 pl-3 bg-[var(--color-surface)] rounded-r pr-3 py-2"
                  style={{ borderColor: vol.color || 'var(--color-accent-green)' }}
                >
                  <span className="text-[var(--color-text)] font-medium">V{vol.volumeNumber}</span>
                  <span className="text-[var(--color-text-tertiary)]">Ep{vol.episodeRange[0]}-{vol.episodeRange[1]}</span>
                  <span className="text-[var(--color-text-secondary)]">{vol.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 世界观 - 全宽展开 */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-[15px] font-semibold text-[var(--color-text)] mb-3">🌍 世界观</h3>
        <p className="text-[var(--color-text-secondary)] text-[14px] leading-relaxed whitespace-pre-wrap">
          {project.settings?.worldView || '未设置'}
        </p>
      </div>

      {/* 专有名词 - 全宽展开 */}
      {project.settings?.keyTerms && project.settings.keyTerms.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-[15px] font-semibold text-[var(--color-text)] mb-3">📚 名词 ({project.settings.keyTerms.length})</h3>
          <div className="flex flex-wrap gap-2">
            {project.settings.keyTerms.map((term, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-md bg-[var(--color-surface)] text-[var(--color-text-secondary)] text-[12px] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] cursor-help transition-colors"
                title={term.explanation}
              >
                {term.term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* BOSS档案 - 全宽横向展示 */}
      {project.antagonists && project.antagonists.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-[15px] font-semibold text-[var(--color-text)] mb-3">👹 BOSS ({project.antagonists.length})</h3>
          <div className="flex flex-wrap gap-3">
            {project.antagonists.map((boss) => (
              <div key={boss.id} className="flex items-center gap-2 text-[13px] bg-[var(--color-surface)] px-3 py-2 rounded-lg border border-[var(--color-border)]">
                <span className="text-[var(--color-accent-red)] font-medium">{boss.name}</span>
                <span className="text-[var(--color-text-tertiary)]">{boss.volumeOrArc}</span>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* 剧集列表 - Neodomain 设计 */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h3 className="text-[15px] font-semibold text-[var(--color-text)]">📺 剧集列表 ({project.episodes?.length || 0})</h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingEpisodes}
            className="btn-primary px-4 py-2 rounded-lg text-[14px] disabled:opacity-50"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(project.episodes || []).map((ep) => {
            // 从 storyOutline 中找到对应集数的大纲
            const outline = project.storyOutline?.find(o => o.episodeNumber === ep.episodeNumber);
            const summary = outline?.summary || '暂无大纲';

            // 检查是否有故事板数据
            const hasStoryboard = ep.shots && ep.shots.length > 0 && ep.shots.some(s => s.storyboardGridUrl);

            return (
              <div
                key={ep.id}
                className="glass-card rounded-xl overflow-hidden transition-all hover:border-[var(--color-border-hover)] group cursor-pointer"
                onClick={() => onSelectEpisode(ep)}
              >
                {/* 书本式布局：左侧色块（集数）+ 右侧内容 */}
                <div className="flex items-stretch">
                  {/* 左侧：集数色块（模拟书脊）- 金色渐变 */}
                  <div className="bg-gradient-to-b from-[var(--color-primary-dark)] to-[var(--color-primary)] w-16 shrink-0 flex flex-col items-center justify-center text-[#1a1a1e] p-2 border-r-2 border-[var(--color-primary-light)]/30">
                    <span className="text-[12px] font-medium opacity-80">第</span>
                    <span className="text-[24px] font-bold">{ep.episodeNumber}</span>
                    <span className="text-[12px] font-medium opacity-80">集</span>
                  </div>

                  {/* 右侧：标题 + 大纲 + 状态 */}
                  <div className="flex-1 p-4 min-w-0">
                    {/* 标题 + 状态 */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-[var(--color-text)] text-[14px] font-semibold leading-tight flex-1 min-w-0 group-hover:text-[var(--color-primary-light)] transition-colors">
                        {ep.title}
                      </h4>
                      <StatusBadge status={ep.status} />
                    </div>

                    {/* 大纲摘要（最多 3 行） */}
                    <p className="text-[var(--color-text-secondary)] text-[13px] leading-relaxed line-clamp-3 mb-3">
                      {summary}
                    </p>

                    {/* 底部元信息 + 操作按钮 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                        <span>{ep.shots?.length || 0} 个分镜</span>
                        <span>·</span>
                        <span>{new Date(ep.updatedAt).toLocaleDateString()}</span>
                      </div>

                      {/* 查看故事板按钮 */}
                      {hasStoryboard && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEpisode(ep);
                          }}
                          className="px-2.5 py-1 btn-primary rounded-md text-[11px] font-medium"
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h3 className="text-[15px] font-semibold text-[var(--color-text)]">👥 角色库 ({project.characters?.length || 0})</h3>
          <button className="btn-primary px-4 py-2 rounded-lg text-[14px]">+ 添加</button>
        </div>

        {/* 顶部控制栏：模型 + 风格 - Neodomain 设计 */}
        <div className="glass-card rounded-xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AIImageModelSelector
              value={characterImageModel}
              onChange={setCharacterImageModel}
              scenarioType={ScenarioType.DESIGN}
              label="角色生图模型"
            />

            <div>
              <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">角色风格</label>
              <select
                value={characterStyleId}
                onChange={(e) => setCharacterStyleId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors cursor-pointer"
              >
                {STORYBOARD_STYLES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                说明：点击角色卡的绿色"🎨 生成设定图"按钮才会生图（消耗积分）。
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
                生成内容：单张 16:9 角色设定图（通常为 2×2 四分屏：正/侧/背 + 面部特写）。
              </div>

              {/* 批量生成按钮 */}
              <button
                onClick={handleBatchGenerateCharacters}
                disabled={isBatchGeneratingCharacters || !characterImageModel}
                className="btn-primary w-full px-4 py-2 rounded-lg text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
              onUploadImage={() => handleUploadCharacterImage(char.id)}
              onGenerateImage={() => handleGenerateCharacterImageSheet(char.id)}
              isGenerating={generatingIds.has(char.id) || [...generatingIds].some((id: string) => id.startsWith(char.id + '_'))}
              generationProgress={genProgressMap.get(char.id) || null}
              onGenerateFormImage={(formId) => handleGenerateCharacterImageSheet(char.id, false, formId, char.imageSheetUrl || undefined)}
              generatingFormIds={[...generatingIds].filter((id: string) => id.startsWith(char.id + '_')).map((id: string) => id.split('_').slice(1).join('_'))}
              formGenProgressMap={Object.fromEntries([...generatingIds].filter((id: string) => id.startsWith(char.id + '_')).map((id: string) => [id.split('_').slice(1).join('_'), genProgressMap.get(id) || { stage: '', percent: 0 }]))}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* 顶部导航 - Neodomain 设计 */}
      <div className="sticky top-0 z-20 glass-card border-b border-[var(--color-border)]">
        <div className={`${containerClass} py-4 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={onBack}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary-light)] text-[14px] font-medium shrink-0 transition-colors"
            >
              ← 返回
            </button>
            <h1 className="text-[20px] font-semibold text-[var(--color-text)] truncate">{project.name}</h1>
            {project.settings?.genre && (
              <span className="text-[var(--color-text-tertiary)] text-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] px-2.5 py-1 rounded-md shrink-0">
                {project.settings.genre}
              </span>
            )}
          </div>

          {/* 标签页导航 - Neodomain 设计 */}
          <div className="flex gap-2 overflow-x-auto max-w-[60%] sm:max-w-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap ${activeTab === tab.id
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary-light)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                  }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className={`${containerClass} py-6`}>
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

      {/* 🆕 角色图片上传对话框 */}
      {uploadCharacterImageDialogOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">📤 上传或生成角色图片</h3>

            {/* 新增：一键 AI 生成 */}
            <div className="mb-6 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-xl relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-purple-400 mb-1 flex items-center gap-1.5">
                    ✨ AI 一键生成专属头像
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] pr-4 leading-relaxed">
                    根据角色的外貌描述、身份演变以及项目整体统调，由顶尖大模型自动为您绘制一张 1:1 的高解析度概念设定图。
                  </p>
                </div>
                <button
                  onClick={handleGenerateAvatar}
                  disabled={isGeneratingAvatar || isAnalyzingImage}
                  className="shrink-0 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-bold shadow-lg hover:shadow-purple-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {isGeneratingAvatar ? '绘制中...' : '一键生成'}
                </button>
              </div>

              {/* 进度条 */}
              {isGeneratingAvatar && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-purple-400 mb-1">
                    <span>正在连接画师大模型...</span>
                    <span>{avatarGenProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                      style={{ width: `${avatarGenProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 分隔线 */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-[var(--color-border)]"></div>
              <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest">OR 自定义上传</span>
              <div className="flex-1 h-px bg-[var(--color-border)]"></div>
            </div>

            {/* URL 输入 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">图片 URL</label>
              <input
                type="text"
                value={uploadImageUrl}
                onChange={(e) => setUploadImageUrl(e.target.value)}
                placeholder="https://example.com/character.jpg"
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
              />
            </div>

            {/* 分隔线 */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[var(--color-border)]"></div>
              <span className="text-sm text-[var(--color-text-tertiary)]">或</span>
              <div className="flex-1 h-px bg-[var(--color-border)]"></div>
            </div>

            {/* 本地文件上传 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">本地文件</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadImageFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[var(--color-primary)] file:text-white hover:file:bg-[var(--color-primary-hover)] transition-colors"
              />
              {uploadImageFile && (
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  已选择: {uploadImageFile.name}
                </p>
              )}
            </div>

            {/* 提示信息 */}
            <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-400">
                💡 上传后，AI 将自动分析图片并优化角色描述（外貌、服装、气质等）
              </p>
            </div>

            {/* 按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setUploadCharacterImageDialogOpen(false);
                  setUploadingCharacterId(null);
                  setUploadImageUrl('');
                  setUploadImageFile(null);
                }}
                disabled={isAnalyzingImage}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmUploadCharacterImage}
                disabled={isAnalyzingImage || (!uploadImageUrl && !uploadImageFile)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isAnalyzingImage ? '⏳ 分析中...' : '确认上传'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  onGenerateFormImage?: (formId: string) => void;
  // 🔧 支持多个形态并发生成
  generatingFormIds?: string[];
  formGenProgressMap?: Record<string, { stage: string; percent: number }>;
  // 🆕 上传角色图片
  onUploadImage?: () => void;
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
  onGenerateFormImage,
  generatingFormIds = [],
  formGenProgressMap = {},
  onUploadImage,
}) => {
    const completenessInfo = completeness !== undefined ? getCompletenessLevel(completeness) : null;

    // ── Lightbox 全屏查看（支持缩放 + 拖动）──────────────────────────────────
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [lbZoom, setLbZoom] = useState(1);
    const [lbPos, setLbPos] = useState({ x: 0, y: 0 });
    const [lbDragging, setLbDragging] = useState(false);
    const lbDragRef = useRef<{ active: boolean; startX: number; startY: number; posX: number; posY: number; moved: boolean }>(
      { active: false, startX: 0, startY: 0, posX: 0, posY: 0, moved: false }
    );

    const openLightbox = (url: string) => {
      setLightboxUrl(url);
      setLbZoom(1);
      setLbPos({ x: 0, y: 0 });
      setLbDragging(false);
    };

    const lbZoomBy = (factor: number) =>
      setLbZoom(z => Math.min(8, Math.max(0.25, z * factor)));

    const lbReset = () => { setLbZoom(1); setLbPos({ x: 0, y: 0 }); };

    const handleDownload = async (url: string, filename: string) => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objectUrl);
      } catch {
        // CORS 被拒时降级为新标签页打开
        window.open(url, '_blank');
      }
    };

    return (
      <>
        <div className="glass-card flex flex-col h-full rounded-xl overflow-hidden relative">
          {/* 角色头部信息 */}
          <div className="p-4 cursor-pointer hover:bg-[var(--color-surface-hover)] flex flex-col items-center gap-3 transition-colors relative text-center" onClick={onToggle}>
            {/* 展开箭头 */}
            <div className="absolute top-3 right-3 text-[var(--color-text-tertiary)] text-[12px]">
              {isExpanded ? '▼' : '▶'}
            </div>

            {/* 编辑按钮 */}
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="absolute top-3 left-3 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-light)] text-[14px] p-1 transition-colors"
              title="编辑角色"
            >
              ✏️
            </button>

            {/* 头像 (点击可直达上传/生成面板) */}
            <div
              className="w-28 h-28 bg-[var(--color-surface)] rounded-full flex items-center justify-center text-4xl shrink-0 border-2 border-[var(--color-primary)]/30 relative group cursor-pointer overflow-hidden transition-transform hover:scale-105 mt-2"
              onClick={(e) => {
                if (onUploadImage) {
                  e.stopPropagation();
                  onUploadImage();
                }
              }}
              title="点击更换或生成头像"
            >
              {character.data ? (
                <img src={character.data} alt={character.name} className="w-full h-full object-cover transition-opacity group-hover:opacity-60" />
              ) : (character.gender === '女' ? '👩' : '👨')}

              {/* 悬浮提示层 */}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[12px] text-white font-medium">更换头像</span>
              </div>
            </div>

            {/* 信息 */}
            <div className="w-full flex flex-col items-center min-w-0">
              <div className="flex flex-wrap justify-center items-center gap-1.5 mb-1">
                <span className="text-[var(--color-text)] font-semibold text-[16px] truncate max-w-[120px]" title={character.name}>{character.name}</span>
                <span className="text-[var(--color-text-tertiary)] text-[11px] px-1.5 py-0.5 bg-[var(--color-surface)] rounded-md">{character.gender}</span>
                {character.forms && character.forms.length > 0 && (
                  <span className="text-[var(--color-primary-light)] text-[11px] px-1.5 py-0.5 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-md">
                    {character.forms.length}形态
                  </span>
                )}
              </div>

              {completenessInfo && (
                <div className={`text-[11px] ${completenessInfo.color} mb-1.5`} title={`完整度: ${completeness}%`}>
                  {completenessInfo.emoji} 完整度 {completeness}%
                </div>
              )}

              {character.identityEvolution && (
                <p className="text-[var(--color-text-tertiary)] text-[12px] line-clamp-2 w-full px-2" title={character.identityEvolution}>
                  {character.identityEvolution}
                </p>
              )}
            </div>

            {/* 能力标签 - 最多显示前3个 */}
            {character.abilities && character.abilities.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 w-full px-2">
                {character.abilities.slice(0, 3).map((a, i) => (
                  <span key={i} className="bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] px-2 py-0.5 rounded-md text-[10px] border border-[var(--color-accent-blue)]/30">
                    {a}
                  </span>
                ))}
                {character.abilities.length > 3 && (
                  <span className="text-[10px] text-[var(--color-text-tertiary)] flex items-center px-1">+{character.abilities.length - 3}</span>
                )}
              </div>
            )}

            {/* 操作按钮区 */}
            <div className="flex flex-wrap justify-center gap-2 mt-2 w-full px-2">
              {/* 上传角色图片按钮 */}
              {onUploadImage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUploadImage();
                  }}
                  className="flex-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 px-2 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap"
                  title="上传角色图片并AI分析"
                >
                  📤 上传图片
                </button>
              )}

              {/* 生成角色设定图 - 有形态时隐藏主体按钮，只在形态上显示 */}
              {onGenerateImage && !(character.forms && character.forms.length > 0) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerateImage();
                  }}
                  disabled={!!isGenerating}
                  className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/40 disabled:bg-gray-800 disabled:text-gray-500 disabled:border-gray-700 text-emerald-400 border border-emerald-500/30 px-2 py-1.5 rounded-lg text-[12px] font-medium disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  title={character.imageSheetUrl ? '重新生成角色设定图' : '自动生成'}
                >
                  {isGenerating ? '⏳ 生成中...' : (character.imageSheetUrl ? '🔄 重新生成' : '🎨 自动生成')}
                </button>
              )}
            </div>
          </div>

          {/* 生成进度 - 有形态时主体进度隐藏（进度在形态卡片上显示） */}
          {!(character.forms && character.forms.length > 0) && isGenerating && generationProgress && (
            <div className="border-t border-[var(--color-border)] p-3 text-[11px] text-[var(--color-text-secondary)] bg-[var(--color-surface)]">
              <div className="flex items-center justify-between gap-2">
                <span>⏳ {generationProgress.stage}</span>
                <span className="text-[var(--color-text-tertiary)]">{Math.round(generationProgress.percent)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-[var(--color-bg-subtle)] rounded overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent-green)]"
                  style={{ width: `${Math.max(0, Math.min(100, generationProgress.percent))}%` }}
                />
              </div>
            </div>
          )}

          {/* 设定图预览 - 有形态时主体设定图隐藏（在形态卡片上显示） */}
          {!(character.forms && character.forms.length > 0) && character.imageSheetUrl && (
            <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
              <img
                src={character.imageSheetUrl}
                alt={`${character.name} 设定图`}
                className="w-full rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] object-contain max-h-[320px] cursor-zoom-in hover:opacity-90 transition-opacity"
                loading="lazy"
                title="点击全屏查看"
                onClick={() => openLightbox(character.imageSheetUrl!)}
              />
              {character.imageGenerationMeta && (
                <div className="mt-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                  模型：{character.imageGenerationMeta.modelName} · 风格：{character.imageGenerationMeta.styleName}
                </div>
              )}
            </div>
          )}

          {/* 缺失字段提示和智能补充按钮 */}
          {missingFields && missingFields.length > 0 && completeness !== undefined && (
            <div className={`border-t border-[var(--color-border)] p-3 ${completeness < 85 ? 'bg-[var(--color-accent-amber)]/5' : 'bg-[var(--color-accent-blue)]/5'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`text-[12px] ${completeness < 85 ? 'text-[var(--color-accent-amber)]' : 'text-[var(--color-accent-blue)]'}`}>
                  {completeness < 85 ? '⚠️ 待补充信息：' : '💡 可继续优化：'}
                </div>
                {onSupplement && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSupplement();
                    }}
                    disabled={isSupplementing}
                    className="btn-secondary px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 disabled:opacity-50"
                    title={completeness < 85 ? '使用AI智能补充角色细节' : '继续优化角色信息'}
                  >
                    {isSupplementing ? '⏳ 补充中...' : (completeness < 85 ? '✨ 智能补充' : '🔄 继续补充')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missingFields.slice(0, 3).map((field, idx) => {
                  // 特殊处理形态字段，显示剧本中发现的形态数量
                  const isFormField = field.field === 'forms' && field.label.includes('剧本中发现');
                  return (
                    <span
                      key={idx}
                      className={`px-2 py-0.5 rounded-md text-[10px] ${isFormField
                        ? 'bg-[var(--color-accent-violet)]/10 text-[var(--color-accent-violet)] border border-[var(--color-accent-violet)]/30'
                        : completeness < 85
                          ? 'bg-[var(--color-accent-amber)]/10 text-[var(--color-accent-amber)] border border-[var(--color-accent-amber)]/30'
                          : 'bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] border border-[var(--color-accent-blue)]/30'
                        }`}
                      title={isFormField ? '点击"智能补充"可自动提取剧本中的形态' : ''}
                    >
                      {field.label}
                    </span>
                  );
                })}
                {missingFields.length > 3 && (
                  <span className={`text-[10px] ${completeness < 85 ? 'text-[var(--color-accent-amber)]' : 'text-[var(--color-accent-blue)]'}`}>
                    +{missingFields.length - 3}项
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 形态列表 - 始终显示（不需要点击展开） */}
          {character.forms && character.forms.length > 0 && (
            <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
              <div className="grid grid-cols-1 gap-3">
                {character.forms.map((form) => {
                  const isFormGenerating = generatingFormIds.includes(form.id);
                  const currentFormProgress = formGenProgressMap[form.id] || null;
                  // 🔍 调试日志
                  if (form.imageSheetUrl) {
                    console.log(`[CharacterCard] 🔍 形态 ${form.name} 有设定图: ${form.imageSheetUrl.substring(0, 80)}...`);
                  }
                  return (
                    <div key={form.id} className="bg-[var(--color-surface-solid)] rounded-lg p-3 text-[12px] group relative border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[var(--color-text)] font-medium">{form.name}</span>
                        <div className="flex items-center gap-1.5">
                          {form.episodeRange && (
                            <span className="bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] px-2 py-0.5 rounded-md text-[10px] border border-[var(--color-accent-blue)]/30">
                              {form.episodeRange}
                            </span>
                          )}
                          {/* 形态设定图生成按钮 */}
                          {onGenerateFormImage && (
                            <button
                              onClick={() => onGenerateFormImage(form.id)}
                              disabled={isFormGenerating}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white px-2 py-0.5 rounded-md text-[10px] font-medium disabled:cursor-not-allowed transition-colors"
                              title={form.imageSheetUrl ? '重新生成形态设定图' : '生成形态设定图'}
                            >
                              {isFormGenerating ? '⏳ 生成中...' : (form.imageSheetUrl ? '🔄 重新生成' : '🎨 生成设定图')}
                            </button>
                          )}
                          <button
                            onClick={() => onEditForm(form)}
                            className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-light)] text-[11px] transition-all"
                            title="编辑形态"
                          >
                            ✏️
                          </button>
                        </div>
                      </div>
                      {/* 描述完整显示（不截断） */}
                      <p className="text-[var(--color-text-secondary)] text-[11px] leading-relaxed whitespace-pre-wrap">{form.description}</p>
                      {form.note && (
                        <p className="text-[var(--color-text-tertiary)] text-[10px] mt-1.5 italic">💡 {form.note}</p>
                      )}

                      {/* 形态生成进度 */}
                      {isFormGenerating && currentFormProgress && (
                        <div className="mt-2 text-[10px] text-[var(--color-text-secondary)]">
                          <div className="flex items-center justify-between gap-2">
                            <span>⏳ {currentFormProgress.stage}</span>
                            <span className="text-[var(--color-text-tertiary)]">{Math.round(currentFormProgress.percent)}%</span>
                          </div>
                          <div className="mt-1 h-1 bg-[var(--color-bg-subtle)] rounded overflow-hidden">
                            <div className="h-full bg-[var(--color-accent-green)]" style={{ width: `${Math.max(0, Math.min(100, currentFormProgress.percent))}%` }} />
                          </div>
                        </div>
                      )}

                      {/* 形态设定图预览 */}
                      {form.imageSheetUrl && (
                        <div className="mt-2">
                          <img
                            src={form.imageSheetUrl}
                            alt={`${form.name} 设定图`}
                            className="w-full rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] object-contain max-h-[200px] cursor-zoom-in hover:opacity-90 transition-opacity"
                            loading="lazy"
                            title="点击全屏查看"
                            onClick={() => openLightbox(form.imageSheetUrl!)}
                          />
                          {form.imageGenerationMeta && (
                            <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                              模型：{form.imageGenerationMeta.modelName} · 风格：{form.imageGenerationMeta.styleName}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Lightbox 全屏查看 Modal（支持滚轮缩放 + 鼠标拖动）─────────────────── */}
        {lightboxUrl && (
          <div
            className="fixed inset-0 z-[9999] flex flex-col bg-black/92 backdrop-blur-sm select-none"
            onWheel={(e) => {
              e.preventDefault();
              const factor = e.deltaY < 0 ? 1.15 : 0.87;
              setLbZoom(z => Math.min(8, Math.max(0.25, z * factor)));
            }}
          >
            {/* 顶部工具栏 */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-3 bg-gradient-to-b from-black/70 to-transparent">
              <span className="text-white/70 text-[13px]">{character.name} · 设定图</span>
              <div className="flex items-center gap-2">
                {/* 缩放控制 */}
                <button
                  onClick={() => lbZoomBy(0.77)}
                  className="bg-white/15 hover:bg-white/25 text-white w-8 h-8 rounded-full flex items-center justify-center text-[18px] font-light transition-colors"
                  title="缩小 (滚轮也可缩放)"
                >－</button>
                <span
                  className="text-white/80 text-[13px] min-w-[46px] text-center cursor-pointer"
                  onClick={lbReset}
                  title="点击恢复 100%"
                >{Math.round(lbZoom * 100)}%</span>
                <button
                  onClick={() => lbZoomBy(1.3)}
                  className="bg-white/15 hover:bg-white/25 text-white w-8 h-8 rounded-full flex items-center justify-center text-[18px] font-light transition-colors"
                  title="放大 (滚轮也可缩放)"
                >＋</button>
                <div className="w-px h-5 bg-white/20 mx-1" />
                {/* 下载 */}
                <button
                  onClick={() => handleDownload(lightboxUrl, `${character.name}_设定图.jpg`)}
                  className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg text-[13px] transition-colors"
                  title="下载图片"
                >⬇️ 下载</button>
                {/* 关闭 */}
                <button
                  onClick={() => setLightboxUrl(null)}
                  className="bg-white/15 hover:bg-white/25 text-white w-8 h-8 rounded-full flex items-center justify-center text-[16px] transition-colors"
                  title="关闭 (ESC)"
                >✕</button>
              </div>
            </div>

            {/* 图片拖动区域 */}
            <div
              className="flex-1 overflow-hidden flex items-center justify-center"
              style={{ cursor: lbDragging ? 'grabbing' : lbZoom > 1 ? 'grab' : 'default' }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                lbDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, posX: lbPos.x, posY: lbPos.y, moved: false };
                setLbDragging(true);
                e.preventDefault();
              }}
              onMouseMove={(e) => {
                if (!lbDragRef.current.active) return;
                const dx = e.clientX - lbDragRef.current.startX;
                const dy = e.clientY - lbDragRef.current.startY;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) lbDragRef.current.moved = true;
                setLbPos({ x: lbDragRef.current.posX + dx, y: lbDragRef.current.posY + dy });
              }}
              onMouseUp={() => {
                if (!lbDragRef.current.moved) setLightboxUrl(null); // 点击空白关闭
                lbDragRef.current.active = false;
                setLbDragging(false);
              }}
              onMouseLeave={() => { lbDragRef.current.active = false; setLbDragging(false); }}
            >
              <img
                src={lightboxUrl}
                alt="全屏查看"
                draggable={false}
                style={{
                  transform: `translate(${lbPos.x}px, ${lbPos.y}px) scale(${lbZoom})`,
                  transformOrigin: 'center',
                  transition: lbDragging ? 'none' : 'transform 0.12s ease',
                  maxWidth: '92vw',
                  maxHeight: '88vh',
                  objectFit: 'contain',
                  borderRadius: '12px',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            </div>

            {/* 底部提示 */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
              <span className="text-white/30 text-[11px]">滚轮缩放 · 拖动平移 · 点击空白关闭</span>
            </div>
          </div>
        )}
      </>
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
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h3 className="text-[15px] font-semibold text-[var(--color-text)]">🏛️ 场景库 ({project.scenes?.length || 0})</h3>
          <div className="flex gap-2">
            {/* 重新提取按钮 */}
            {onExtractNewScenes && (
              <button
                onClick={onExtractNewScenes}
                disabled={isExtracting}
                className="px-3 py-2 rounded-lg text-[13px] flex items-center gap-1.5 bg-[var(--color-accent-violet)]/10 text-[var(--color-accent-violet)] border border-[var(--color-accent-violet)]/30 hover:bg-[var(--color-accent-violet)]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            <button className="btn-primary px-4 py-2 rounded-lg text-[14px]">+ 添加</button>
          </div>
        </div>

        {/* 顶部控制栏：模型 + 风格 - Neodomain 设计 */}
        <div className="glass-card rounded-xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AIImageModelSelector
              value={sceneImageModel}
              onChange={onChangeSceneImageModel}
              scenarioType={ScenarioType.DESIGN}
              label="场景生图模型"
            />

            <div>
              <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">场景风格</label>
              <select
                value={sceneStyleId}
                onChange={(e) => onChangeSceneStyleId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors cursor-pointer"
              >
                {STORYBOARD_STYLES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                说明：点击场景卡的绿色"🎨 生成设定图"按钮才会生图（消耗积分）。
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
                生成内容：单张 16:9 场景设定图（通常为 2×2 四分屏：多角度 + 关键特写）。
              </div>

              {/* 批量生成按钮 */}
              {onBatchGenerateScenes && (
                <button
                  onClick={onBatchGenerateScenes}
                  disabled={isBatchGeneratingScenes || !sceneImageModel}
                  className="btn-primary w-full px-4 py-2 rounded-lg text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(project.scenes || []).map((scene) => {
            const isExpanded = expandedScene === scene.id;
            return (
              <div
                key={scene.id}
                className={`glass-card rounded-xl p-4 cursor-pointer transition-all hover:border-[var(--color-border-hover)] group ${isExpanded ? 'col-span-1 md:col-span-2 xl:col-span-3 ring-1 ring-[var(--color-primary)]/50' : ''
                  }`}
                onClick={() => setExpandedScene(isExpanded ? null : scene.id)}
              >
                <div className="flex justify-between items-start">
                  <h4 className="text-[var(--color-text)] font-medium text-[14px]">{scene.name}</h4>
                  <div className="flex items-center gap-1.5">
                    {/* 生成场景设定图 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateSceneImageSheet(scene.id);
                      }}
                      disabled={generatingSceneId === scene.id}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white px-2.5 py-1.5 rounded-lg text-[12px] font-medium disabled:cursor-not-allowed transition-colors"
                      title={scene.imageSheetUrl ? '重新生成场景设定图' : '生成场景设定图'}
                    >
                      {generatingSceneId === scene.id ? '⏳ 生成中...' : (scene.imageSheetUrl ? '🔄 重新生成' : '🎨 生成设定图')}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditScene(scene); }}
                      className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-light)] text-[12px] transition-all"
                      title="编辑场景"
                    >
                      ✏️
                    </button>
                    <span className="text-[var(--color-text-tertiary)] text-[11px]">{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </div>
                <p className={`text-[var(--color-text-secondary)] text-[13px] mt-1.5 ${isExpanded ? '' : 'line-clamp-2'}`}>
                  {scene.description}
                </p>

                {/* 生成进度（仅当前场景显示） */}
                {generatingSceneId === scene.id && generationProgress && (
                  <div className="mt-3 text-[11px] text-[var(--color-text-secondary)]">
                    <div className="flex items-center justify-between gap-2">
                      <span>⏳ {generationProgress.stage}</span>
                      <span className="text-[var(--color-text-tertiary)]">{Math.round(generationProgress.percent)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-[var(--color-surface)] rounded overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-accent-green)]"
                        style={{ width: `${Math.max(0, Math.min(100, generationProgress.percent))}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 设定图预览（直接展示整张设定图，不做切割） */}
                {scene.imageSheetUrl && (
                  <div className="mt-3">
                    <img
                      src={scene.imageSheetUrl}
                      alt={`${scene.name} 设定图`}
                      className="w-full rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] object-contain max-h-[320px]"
                      loading="lazy"
                    />
                    {scene.imageGenerationMeta && (
                      <div className="mt-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                        模型：{scene.imageGenerationMeta.modelName} · 风格：{scene.imageGenerationMeta.styleName}
                      </div>
                    )}
                  </div>
                )}

                {/* 智能补充按钮 - 始终显示（如果缺少信息） */}
                {onSupplementScene && (!scene.visualPromptCn || !scene.atmosphere) && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSupplementScene(scene.id);
                      }}
                      disabled={isSupplementing && supplementingSceneId === scene.id}
                      className="btn-secondary w-full px-3 py-2 rounded-lg text-[11px] flex items-center gap-1.5 justify-center disabled:opacity-50"
                      title="使用AI智能补充场景详细信息"
                    >
                      {isSupplementing && supplementingSceneId === scene.id ? '⏳ 补充中...' : '✨ 智能补充'}
                    </button>
                    <p className="text-[var(--color-text-tertiary)] text-[10px] mt-1.5 text-center">
                      ⚠️ 缺少: {!scene.visualPromptCn && '视觉提示'} {!scene.atmosphere && '氛围'}
                    </p>
                  </div>
                )}

                {/* 展开时显示更多信息 */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2">
                    {scene.visualPromptCn && (
                      <div className="text-[11px]">
                        <span className="text-[var(--color-accent-blue)]">中文提示词：</span>
                        <span className="text-[var(--color-text-secondary)]">{scene.visualPromptCn}</span>
                      </div>
                    )}
                    {scene.visualPromptEn && (
                      <div className="text-[11px]">
                        <span className="text-[var(--color-accent-green)]">English Prompt：</span>
                        <span className="text-[var(--color-text-secondary)]">{scene.visualPromptEn}</span>
                      </div>
                    )}
                    {scene.atmosphere && (
                      <div className="text-[11px]">
                        <span className="text-[var(--color-accent-violet)]">氛围：</span>
                        <span className="text-[var(--color-text-secondary)]">{scene.atmosphere}</span>
                      </div>
                    )}
                  </div>
                )}
                {/* 集数全部显示（不需要点击） */}
                {scene.appearsInEpisodes && scene.appearsInEpisodes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {scene.appearsInEpisodes.map((ep) => (
                      <span key={ep} className="bg-[var(--color-surface)] text-[var(--color-text-tertiary)] px-2 py-0.5 rounded-md text-[10px] border border-[var(--color-border)]">Ep{ep}</span>
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

// 状态徽章 - Neodomain 设计
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-[var(--color-surface)]', text: 'text-[var(--color-text-tertiary)]', label: '草稿' },
    cleaned: { bg: 'bg-[var(--color-accent-amber)]/10', text: 'text-[var(--color-accent-amber)]', label: '清洗' },
    generated: { bg: 'bg-[var(--color-accent-blue)]/10', text: 'text-[var(--color-accent-blue)]', label: '生成' },
    reviewed: { bg: 'bg-[var(--color-accent-green)]/10', text: 'text-[var(--color-accent-green)]', label: '审核' },
    exported: { bg: 'bg-[var(--color-accent-violet)]/10', text: 'text-[var(--color-accent-violet)]', label: '导出' },
  };
  const c = config[status] || config.draft;
  return <span className={`${c.bg} ${c.text} px-2 py-0.5 rounded-md text-[10px] border border-[var(--color-border)]`}>{c.label}</span>;
};

export default ProjectDashboard;

