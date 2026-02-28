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
import { supplementSceneDetails } from '../services/sceneSupplement';
import { extractNewScenes } from '../services/sceneExtraction';
import AIImageModelSelector from './AIImageModelSelector';
import { ScenarioType, generateAndUploadImage, pollAndUploadFromTask, getModelsByScenario } from '../services/aiImageGeneration';
import { patchProject, saveProject } from '../services/d1Storage';
import { uploadToOSS, generateOSSPath } from '../services/oss';
import { analyzeCharacterImage, mergeAnalysisToCharacter } from '../services/characterImageAnalysis';
import mammoth from 'mammoth';
import { CharacterPreview } from './CharacterPreview';
// 🆕 风格设置工具
import { hasProjectStyle, getEffectiveCharacterSceneStyle, getStylePromptSuffix } from '../services/styleSettings';
// 🆕 材质词汇映射工具（用于UI展示中文化）
import { replaceEnglishMaterialTerms } from '../utils/materialVocabularyMapper';
import type { FormSummary } from '../services/characterSupplement/types';

// 🆕 根据美型程度生成额外的风格提示（仅影响设定图，不修改全局风格库）
function getBeautyLevelPrompt(
  beautyLevel: 'realistic' | 'balanced' | 'idealized'
): string {
  if (beautyLevel === 'idealized') {
    // 仅对真正的理想美型角色追加轻量级美型提示，其余档位不叠加统一滤镜
    return 'idealized drama character beauty, refined and harmonious facial features, gentle cinematic retouch, highly attractive and memorable face';
  }
  // balanced / realistic：不额外追加美型模板，只使用项目统一的 styleSuffix
  return '';
}

// ============================================================
// 🌏 种族/人种识别工具（代码级确定性检测，不依赖 LLM）
// 通用工具：支持东亚、东南亚、南亚、非洲、欧洲、拉丁、中东、幻想种族
// ============================================================

interface EthnicitySlot {
  /** 正向身份描述，前置于 subjectPrompt / Keep 行 */
  identityEn: string;
  /** 防错人种负向词（可选，目前仅东亚启用） */
  negativeEn?: string;
}

const FANTASY_RACE_MAP: Record<string, string> = {
  魔族: 'demon race', 妖族: 'demon fox race', 精灵: 'elf',
  兽人: 'beastman', 龙裔: 'dragon bloodline', 神族: 'divine race',
  恶魔: 'demon', 半妖: 'half-demon', 天族: 'celestial race',
  冥族: 'netherworld race', 仙族: 'immortal race', 鬼族: 'ghost race',
};

/**
 * 从外观描述文本中检测人种分类（基于中文关键词，不强行推断）
 * 返回 null 表示未识别，调用方应回退到旧行为
 */
function detectEthnicityCategory(text: string): string | null {
  if (!text) return null;
  if (/中国人|华人|汉族|东亚人/.test(text))  return 'east_asian_chinese';
  if (/日本人|日裔/.test(text))              return 'east_asian_japanese';
  if (/韩国人|韩裔|朝鲜人/.test(text))      return 'east_asian_korean';
  if (/东南亚|泰国|越南|菲律宾|马来|印尼|新加坡|缅甸|老挝|柬埔寨/.test(text)) return 'southeast_asian';
  if (/南亚|印度人|巴基斯坦|孟加拉|斯里兰卡|尼泊尔/.test(text)) return 'south_asian';
  if (/非洲人|非裔/.test(text))             return 'african';
  if (/欧洲人|欧美人|白人|西方人/.test(text)) return 'european';
  if (/拉丁|拉美/.test(text))               return 'latino';
  if (/中东|阿拉伯/.test(text))             return 'middle_eastern';
  if (/魔族|妖族|精灵|兽人|龙裔|神族|恶魔|半妖|天族|冥族|仙族|鬼族/.test(text)) return 'fantasy';
  return null;
}

/** 从外观描述文本中简单识别性别（辅助 identity 描述） */
function detectGenderFromText(text: string): 'male' | 'female' | 'unknown' {
  if (!text) return 'unknown';
  if (/，男[，、\s]|，男$/.test(text) || /【主体人物】[^，\n]*，男/.test(text)) return 'male';
  if (/，女[，、\s]|，女$/.test(text) || /【主体人物】[^，\n]*，女/.test(text)) return 'female';
  if (/男性|男主|先生|公子|将军|少爷|郎君/.test(text)) return 'male';
  if (/女性|女主|小姐|姑娘|夫人|娘子/.test(text)) return 'female';
  return 'unknown';
}

/**
 * 主入口：从清理后的外观文本解析 EthnicitySlot
 * 若无法识别人种（文本中无相关描述），返回 null，调用方保持原有行为
 */
function getEthnicitySlot(cleanedAppearance: string): EthnicitySlot | null {
  const category = detectEthnicityCategory(cleanedAppearance);
  if (!category) return null;

  const gender = detectGenderFromText(cleanedAppearance);
  const gEn = gender === 'male' ? 'male' : gender === 'female' ? 'female' : 'person';

  switch (category) {
    case 'east_asian_chinese':
      return {
        identityEn: `East Asian, Chinese ${gEn}, East Asian facial features`,
        negativeEn: 'Caucasian, Western features, European facial structure, non-Asian',
      };
    case 'east_asian_japanese':
      return {
        identityEn: `East Asian, Japanese ${gEn}, East Asian facial features`,
        negativeEn: 'Caucasian, Western features, European facial structure, non-Asian',
      };
    case 'east_asian_korean':
      return {
        identityEn: `East Asian, Korean ${gEn}, East Asian facial features`,
        negativeEn: 'Caucasian, Western features, European facial structure, non-Asian',
      };
    case 'southeast_asian':
      return { identityEn: `Southeast Asian ${gEn}, Southeast Asian facial features` };
    case 'south_asian':
      return { identityEn: `South Asian ${gEn}, South Asian facial features` };
    case 'african':
      return { identityEn: `African ${gEn}, African descent, characteristic facial features` };
    case 'european':
      return { identityEn: `European ${gEn}, Caucasian, European facial features` };
    case 'latino':
      return { identityEn: `Latino ${gEn}, Latin American descent` };
    case 'middle_eastern':
      return { identityEn: `Middle Eastern ${gEn}, Middle Eastern facial features` };
    case 'fantasy': {
      const match = cleanedAppearance.match(/魔族|妖族|精灵|兽人|龙裔|神族|恶魔|半妖|天族|冥族|仙族|鬼族/);
      const raceEn = match ? (FANTASY_RACE_MAP[match[0]] ?? match[0]) : 'fantasy race';
      return { identityEn: `fantasy race: ${raceEn}, humanoid form` };
    }
    default:
      return null;
  }
}



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
  const [expandedAppearanceId, setExpandedAppearanceId] = useState<string | null>(null); // 🆕 记录哪个角色的外观描述被展开

  // 🔧 使用 ref 保存最新的 project 状态（避免并发更新时覆盖数据）
  const projectRef = useRef<Project>(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // =============================
  // 🆕 角色/场景设定图生成（模型 + 风格）
  // 说明：仅在用户点击按钮时才会调用生图接口（会消耗积分）。
  // =============================
  const [characterImageModel, setCharacterImageModel] = useState<string>('');
  const [sceneImageModel, setSceneImageModel] = useState<string>('');

  const [openManageMenuId, setOpenManageMenuId] = useState<string | null>(null); // 🆕 管理菜单状态

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

  // 🔧 辅助函数：获取模型显示名称
  const getModelDisplayName = async (modelName: string): Promise<string> => {
    try {
      const models = await getModelsByScenario(ScenarioType.STORYBOARD);
      const model = models.find(m => m.model_name === modelName);
      return model?.model_display_name || modelName;
    } catch (error) {
      console.warn('[getModelDisplayName] 获取模型显示名称失败:', error);
      return modelName; // 降级返回原始名称
    }
  };

  // 🆕 剧集上传相关状态
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingEpisodes, setIsUploadingEpisodes] = useState(false);

  // 🆕 角色图片上传和分析状态
  const [uploadCharacterImageDialogOpen, setUploadCharacterImageDialogOpen] = useState(false);
  const [uploadingCharacterId, setUploadingCharacterId] = useState<string | null>(null);
  const [uploadImageUrl, setUploadImageUrl] = useState('');
  const [uploadImageFile, setUploadImageFile] = useState<File | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);

  // 🆕 智能补充选项
  const [supplementMode, setSupplementMode] = useState<'fast' | 'detailed'>('detailed'); // 🔧 默认详细模式（使用 optimized 版思维链）
  const [beautyLevel, setBeautyLevel] = useState<'realistic' | 'balanced' | 'idealized'>('idealized'); // 默认理想美型
  // 🆕 思维链 LLM 模型选择（独立于生图模型）
  const [supplementModel, setSupplementModel] = useState<string>('google/gemini-2.5-flash'); // 默认 Gemini 2.5 Flash

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

  // 🆕 角色设定图专用负向提示词：排除技术问题、质量问题、建筑/场景元素
  // 说明：风格由用户选择决定，不应该在negativePrompt中硬编码排除
  const CHARACTER_SHEET_NEGATIVE_PROMPT = [
    NEGATIVE_PROMPT,
    'blurry, low quality, distorted, deformed',
    'ugly, bad anatomy, bad proportions, extra limbs, missing limbs',
    'duplicate, cropped, out of frame',
    // 🆕 强制排除建筑/场景元素（确保纯白背景）
    'architecture, building, palace, temple, house, room, interior, outdoor scene',
    'landscape, mountain, sky, cloud, tree, garden, nature background',
    'furniture, chair, table, pillar, column, wall decoration',
    'complex background, detailed background, scenic background',
  ].join(', ');

  // 🔧 修正：只禁止大印花/logo/文字，不禁止刺绣/蕾丝等工艺细节
  const CLOTHING_LARGE_PRINT_NEGATIVE_PROMPT = [
    'large floral print', 'large graphic print', 'printed shirt with large pattern',
    'logo on clothing', 'text on clothing', 'brand name on clothing',
    'large polka dots', 'large stripes', 'large checkered pattern',
    'busy pattern', 'overwhelming pattern',
  ].join(', ');

  // 🆕 泪痣专用负面词：防止生成多个痣/大痣/跑位痣
  const TEAR_MOLE_NEGATIVE_PROMPT = [
    'extra moles', 'multiple moles', 'many moles', 'moles on face',
    'big mole', 'large mole', 'prominent mole',
    'misplaced mole', 'mole on cheek', 'mole on forehead', 'mole on nose',
    'freckles', 'beauty spots', 'skin spots',
  ].join(', ');

  // 🆕 形态图专用负面词：只防止"换人/变形"伪影，不限制妆容/唇色变化（通用约束）
  const FORM_IMAGE_NEGATIVE_PROMPT = [
    'different person', 'face morphing', 'changed bone structure', 'different face structure',
    'deformed facial features', 'distorted face', 'inconsistent face',
    'exaggerated expression', // 防止夸张表情（但允许合理的虚弱/憔悴状态）
  ].join(', ');

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
  const [supplementingCharacterIds, setSupplementingCharacterIds] = useState<Set<string>>(new Set()); // 🔧 改为Set支持多个角色
  const [characterProgressMap, setCharacterProgressMap] = useState<Map<string, string>>(new Map()); // 🔧 每个角色的进度
  const [supplementProgress, setSupplementProgress] = useState<string>(''); // 🆕 补充进度
  const [supplementingSceneId, setSupplementingSceneId] = useState<string | null>(null);

  // 🆕 项目级补全过程标记：只要有任意角色在跑补全思维链，就应禁用所有「AI 角色设计师」入口
  const perCharacterSupplementJobs = project.settings?.backgroundJobs?.supplement?.perCharacter || {};
  const hasBackgroundSupplementJob = Object.values(perCharacterSupplementJobs).some(
    (job: any) => job && (job.status === 'queued' || job.status === 'running')
  );
  const hasAnyRunningSupplementJob = isSupplementing || hasBackgroundSupplementJob;

  // 🆕 批量补充状态
  const [isBatchSupplementing, setIsBatchSupplementing] = useState(false);
  const [batchSupplementProgress, setBatchSupplementProgress] = useState<{ current: number; total: number } | null>(null);



  // 🆕 实时预览状态
  const [previewData, setPreviewData] = useState<{
    characterName: string;
    appearance: string;
    isGenerating: boolean;
    currentStage: string;
  } | null>(null);

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

  // AI 角色设计师 - 补充角色细节
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
    // 🔧 添加到补充中的角色集合
    setSupplementingCharacterIds(prev => new Set(prev).add(characterId));
    setCharacterProgressMap(prev => new Map(prev).set(characterId, '正在准备...'));

    try {
      const updatedCharacter = await supplementCharacterDetails(
        character,
        charCompleteness.missingFields,
        scripts,
        { mode: supplementMode, beautyLevel: beautyLevel }, // 🆕 传入智能补充选项
        supplementModel, // 🆕 使用用户在下拉框中选择的思维链模型
        (stage, step, content) => {
          // 🆕 进度回调 - 支持新的三参数格式
          const progress = content || `${stage} - ${step}`;
          setCharacterProgressMap(prev => new Map(prev).set(characterId, progress));
        },
        undefined, // 🔧 abortSignal：单次补充暂不需要中断控制，显式传 undefined 避免参数错位
        undefined, // 🔧 cacheContext：单次补充暂不使用缓存
        // 🆕 修改2：分段完成回调 - 实时更新 UI（第9个参数，对齐签名）
        (_charId, _charName, _stage, result) => {
          console.log(`[修改2] 角色「${character.name}」完成 ${_stage}，分段更新 UI`);
          const updatedProject = {
            ...(projectRef.current!),
            characters: (projectRef.current?.characters || []).map(c =>
              c.id === characterId ? { ...c, ...result } : c
            ),
          };
          onUpdateProject(updatedProject, { persist: false }); // 只更新前端，不立即保存
        }
      );

      // 🔧 使用 projectRef.current 避免并发覆盖
      const updatedProject = {
        ...projectRef.current,
        characters: (projectRef.current.characters || []).map(c =>
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
      // 🔧 从补充中的角色集合移除
      setSupplementingCharacterIds(prev => {
        const next = new Set(prev);
        next.delete(characterId);
        return next;
      });
      setCharacterProgressMap(prev => {
        const next = new Map(prev);
        next.delete(characterId);
        return next;
      });
    }
  };

  // 🆕 批量补充所有不完整的角色
  const handleBatchSupplementCharacters = async () => {
    // 筛选出需要补充的角色（完整度 < 100%）
    const incompleteCharacters = charactersCompleteness.filter(c => c.completeness < 100);

    if (incompleteCharacters.length === 0) {
      alert('所有角色信息已完整，无需补充！');
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

    const confirmed = confirm(`将批量补充 ${incompleteCharacters.length} 个角色，预计需要 ${Math.ceil(incompleteCharacters.length * 0.5)} 分钟，是否继续？`);
    if (!confirmed) return;

    setIsBatchSupplementing(true);
    setBatchSupplementProgress({ current: 0, total: incompleteCharacters.length });

    let successCount = 0;
    let failCount = 0;
    const updatedCharacters = [...(project.characters || [])];

    // 🆕 并发控制：每次最多处理3个角色
    const MAX_CONCURRENCY = 3;

    for (let i = 0; i < incompleteCharacters.length; i += MAX_CONCURRENCY) {
      const batch = incompleteCharacters.slice(i, Math.min(i + MAX_CONCURRENCY, incompleteCharacters.length));

      console.log(`[批量补充] 处理第${i + 1}-${Math.min(i + MAX_CONCURRENCY, incompleteCharacters.length)}个角色（共${incompleteCharacters.length}个）`);

      // 并行处理当前批次
      const batchResults = await Promise.allSettled(
        batch.map(async (charCompleteness, batchIndex) => {
          const character = charCompleteness.character;
          const globalIndex = i + batchIndex;

          setBatchSupplementProgress({ current: globalIndex + 1, total: incompleteCharacters.length });
          // 🔧 添加到补充中的角色集合
          setSupplementingCharacterIds(prev => new Set(prev).add(character.id));
          setCharacterProgressMap(prev => new Map(prev).set(character.id, `正在补充第 ${globalIndex + 1}/${incompleteCharacters.length} 个角色...`));

          try {
            const updatedCharacter = await supplementCharacterDetails(
              character,
              charCompleteness.missingFields,
              scripts,
              { mode: supplementMode, beautyLevel: beautyLevel },
              supplementModel, // 🆕 使用用户在下拉框中选择的思维链模型
              (stage, step, content) => {
                const progress = content || `${stage} - ${step}`;
                setCharacterProgressMap(prev => new Map(prev).set(character.id, `[${globalIndex + 1}/${incompleteCharacters.length}] ${progress}`));
              },
              undefined, // 🔧 abortSignal：批量补充暂不需要中断控制，显式传 undefined 避免参数错位
              undefined, // 🔧 cacheContext：批量补充暂不使用缓存
              // 🆕 修改2：分段完成回调 - 批量补充时也实时更新 UI（第9个参数，对齐签名）
              (_charId, _charName, _stage, result) => {
                console.log(`[修改2-批量] 角色「${character.name}」完成 ${_stage}，分段更新 UI`);
                // 更新 updatedCharacters 数组
                const index = updatedCharacters.findIndex(c => c.id === character.id);
                if (index !== -1) {
                  updatedCharacters[index] = { ...updatedCharacters[index], ...result };
                }
                // 实时更新前端 UI
                const updatedProject = {
                  ...projectRef.current,
                  characters: updatedCharacters,
                };
                onUpdateProject(updatedProject, { persist: false }); // 只更新前端，不立即保存
              }
            );

            // 更新角色数组
            const index = updatedCharacters.findIndex(c => c.id === character.id);
            if (index !== -1) {
              updatedCharacters[index] = updatedCharacter;
            }

            return { success: true, character };
          } catch (error: any) {
            console.error(`角色"${character.name}"补充失败:`, error);
            return { success: false, character, error };
          } finally {
            // 🔧 从补充中的角色集合移除
            setSupplementingCharacterIds(prev => {
              const next = new Set(prev);
              next.delete(character.id);
              return next;
            });
            setCharacterProgressMap(prev => {
              const next = new Map(prev);
              next.delete(character.id);
              return next;
            });
          }
        })
      );

      // 统计成功和失败数量
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failCount++;
        }
      });
    }

    // 🔧 使用 projectRef.current 避免并发覆盖
    const updatedProject = {
      ...projectRef.current,
      characters: updatedCharacters,
    };

    onUpdateProject(updatedProject);

    setIsBatchSupplementing(false);
    setBatchSupplementProgress(null);

    alert(`✅ 批量补充完成！\n成功: ${successCount} 个\n失败: ${failCount} 个`);
  };

  // =============================
  // 🆕 角色管理功能
  // =============================

  // 删除单个形态
  const handleDeleteForm = (characterId: string, formId: string) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;

    const form = character.forms?.find(f => f.id === formId);
    if (!form) return;

    if (!confirm(`确定要删除形态"${form.name}"吗？\n\n⚠️ 此操作将同时删除该形态的设定图。`)) return;

    const updatedCharacter: CharacterRef = {
      ...character,
      forms: character.forms?.filter(f => f.id !== formId)
    };

    // 更新项目
    const updatedProject = {
      ...project,
      characters: (project.characters || []).map(c =>
        c.id === characterId ? updatedCharacter : c
      ),
    };

    onUpdateProject(updatedProject);
  };

  // 删除所有形态
  const handleDeleteAllForms = (characterId: string) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character || !character.forms?.length) {
      alert('该角色没有形态');
      return;
    }

    const formsList = character.forms.map(f => `• ${f.name} ${f.episodeRange || ''}`).join('\n');
    if (!confirm(`确定要删除所有形态吗？\n\n⚠️ 将删除 ${character.forms.length} 个形态及其设定图：\n${formsList}`)) return;

    const updatedCharacter: CharacterRef = {
      ...character,
      forms: []
    };

    // 更新项目
    const updatedProject = {
      ...project,
      characters: (project.characters || []).map(c =>
        c.id === characterId ? updatedCharacter : c
      ),
    };

    onUpdateProject(updatedProject);
    setOpenManageMenuId(null); // 关闭菜单
  };

  // 🆕 删除单个 FormSummary（Phase 1 形态清单条目）
  const handleDeleteFormSummary = (characterId: string, summaryId: string) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;

    const summary = (character.formSummaries || []).find(s => s.id === summaryId);
    if (!summary) return;

    if (!confirm(`确定要从形态清单中移除"${summary.name}"吗？\n\n此操作只移除扫描记录，不影响已生成的形态设定。`)) return;

    const updatedCharacter: CharacterRef = {
      ...character,
      formSummaries: (character.formSummaries || []).filter(s => s.id !== summaryId)
    };

    onUpdateProject({
      ...project,
      characters: (project.characters || []).map(c =>
        c.id === characterId ? updatedCharacter : c
      ),
    });
  };

  // 🆕 Phase 3：展开设计（为 FormSummary 生成完整 CharacterForm）
  const handleGenerateFormDetail = async (characterId: string, summaryId: string) => {
    if (isSupplementing || hasAnyRunningSupplementJob) {
      alert('AI 正在处理中，请等待当前任务完成后再触发展开设计');
      return;
    }

    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;
    const summary = (character.formSummaries || []).find(s => s.id === summaryId);
    if (!summary) return;

    // 更新 status → 'generating'
    const updatingChars = (project.characters || []).map(c =>
      c.id === characterId
        ? { ...c, formSummaries: (c.formSummaries || []).map(s =>
            s.id === summaryId ? { ...s, status: 'generating' as const } : s) }
        : c
    );
    onUpdateProject({ ...project, characters: updatingChars });
    setIsSupplementing(true);

    try {
      const { generateFormDetail } = await import('../services/characterSupplement/generateFormDetail');
      const form = await generateFormDetail(character, summary, scripts);

      const updatedChars = (project.characters || []).map(c => {
        if (c.id !== characterId) return c;
        return {
          ...c,
          // 🔧 按 form.id 去重覆盖：同一 summaryId 重生成时覆盖旧值，而非追加
          forms: (c.forms || []).some(f => f.id === form.id)
            ? (c.forms || []).map(f => f.id === form.id ? form : f)
            : [...(c.forms || []), form],
          formSummaries: (c.formSummaries || []).map(s =>
            s.id === summaryId ? { ...s, status: 'generated' as const } : s
          ),
        };
      });
      onUpdateProject({ ...project, characters: updatedChars });
    } catch (error: any) {
      const failedChars = (project.characters || []).map(c =>
        c.id === characterId
          ? { ...c, formSummaries: (c.formSummaries || []).map(s =>
              s.id === summaryId ? { ...s, status: 'failed' as const } : s) }
          : c
      );
      onUpdateProject({ ...project, characters: failedChars });
      alert(`❌ 展开设计失败: ${error.message || '未知错误'}`);
    } finally {
      setIsSupplementing(false);
    }
  };

  // 🆕 Phase 3 批量展开设计：最多 2 个并发，按 chunk 分批处理
  const handleBatchGenerateFormDetail = async (characterId: string, summaryIds: string[]) => {
    if (isSupplementing || hasAnyRunningSupplementJob) {
      alert('AI 正在处理中，请等待当前任务完成后再触发批量展开设计');
      return;
    }
    if (summaryIds.length === 0) return;

    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;

    setIsSupplementing(true);

    // 全部标记为 generating
    const markingChars = (project.characters || []).map(c =>
      c.id === characterId
        ? { ...c, formSummaries: (c.formSummaries || []).map(s =>
            summaryIds.includes(s.id) ? { ...s, status: 'generating' as const } : s) }
        : c
    );
    onUpdateProject({ ...project, characters: markingChars });

    const { generateFormDetail } = await import('../services/characterSupplement/generateFormDetail');

    // 按 chunk(2) 分批并发处理
    const chunks: string[][] = [];
    for (let i = 0; i < summaryIds.length; i += 2) {
      chunks.push(summaryIds.slice(i, i + 2));
    }

    // 使用 ref-like 方式追踪当前 project（避免闭包捕获过期快照）
    let latestProject = { ...project, characters: markingChars };

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(async (summaryId) => {
          const currentChar = latestProject.characters.find(c => c.id === characterId);
          const summary = (currentChar?.formSummaries || []).find(s => s.id === summaryId);
          if (!currentChar || !summary) throw new Error(`找不到形态 ${summaryId}`);
          const form = await generateFormDetail(currentChar, summary, scripts);
          return { summaryId, form };
        })
      );

      // 将本批结果合并进 latestProject
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { summaryId, form } = result.value;
          latestProject = {
            ...latestProject,
            characters: latestProject.characters.map(c => {
              if (c.id !== characterId) return c;
              return {
                ...c,
                // 🔧 按 form.id 去重覆盖：同一 summaryId 重生成时覆盖旧值，而非追加
                forms: (c.forms || []).some(f => f.id === form.id)
                  ? (c.forms || []).map(f => f.id === form.id ? form : f)
                  : [...(c.forms || []), form],
                formSummaries: (c.formSummaries || []).map(s =>
                  s.id === summaryId ? { ...s, status: 'generated' as const } : s
                ),
              };
            }),
          };
        } else {
          // 单个失败 → 标记为 failed，不影响其他
          const summaryId = chunk[results.indexOf(result)];
          console.error(`[批量展开设计] 形态 ${summaryId} 失败:`, result.reason);
          latestProject = {
            ...latestProject,
            characters: latestProject.characters.map(c =>
              c.id !== characterId ? c : {
                ...c,
                formSummaries: (c.formSummaries || []).map(s =>
                  s.id === summaryId ? { ...s, status: 'failed' as const } : s
                ),
              }
            ),
          };
        }
      }
      // 每批完成后更新 UI
      onUpdateProject(latestProject);
    }

    setIsSupplementing(false);
  };

  // 🆕 Phase 2：更新形态摘要元数据（名称/类型/集数/触发事件）
  const handleUpdateFormSummary = (characterId: string, summaryId: string, updates: Partial<FormSummary>) => {
    const updatedProject: Project = {
      ...project,
      updatedAt: new Date().toISOString(),
      characters: (project.characters || []).map(c => {
        if (c.id !== characterId) return c;
        return {
          ...c,
          formSummaries: (c.formSummaries || []).map(s =>
            s.id === summaryId ? { ...s, ...updates } : s
          ),
        };
      }),
    };
    onUpdateProject(updatedProject);
  };

  // 🆕 Phase 2：手动新增剧本未提取到的形态（进入 pending 状态）
  const handleAddFormSummary = (characterId: string, summary: FormSummary) => {
    const updatedProject: Project = {
      ...project,
      updatedAt: new Date().toISOString(),
      characters: (project.characters || []).map(c => {
        if (c.id !== characterId) return c;
        return {
          ...c,
          formSummaries: [...(c.formSummaries || []), summary],
        };
      }),
    };
    onUpdateProject(updatedProject);
  };

  // 重置角色
  const handleResetCharacter = (characterId: string) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;

    const confirmMsg = `确定要重置角色"${character.name}"吗？\n\n⚠️ 此操作将清除：\n✓ 所有形态 (${character.forms?.length || 0}个)\n✓ 外观描述\n✓ 经典台词\n✓ 身份演变\n✓ 能力列表\n✓ 所有设定图\n\n保留：\n✓ 角色名称\n✓ 性别`;

    if (!confirm(confirmMsg)) return;

    const resetCharacter: CharacterRef = {
      id: character.id,
      name: character.name,
      gender: character.gender,
      data: character.data, // 保留头像
      // 清除所有智能补充的内容
      appearance: '',
      quote: '',
      identityEvolution: '',
      abilities: [],
      forms: [],
      formSummaries: [], // 🆕 同步清除 Phase 1 形态清单
      imageSheetUrl: undefined,
      imageGenerationMeta: undefined,
    };

    // 更新项目
    const updatedProject = {
      ...project,
      characters: (project.characters || []).map(c =>
        c.id === characterId ? resetCharacter : c
      ),
    };

    onUpdateProject(updatedProject);
    setOpenManageMenuId(null); // 关闭菜单
  };

  // 删除角色
  const handleDeleteCharacter = (characterId: string) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;

    const inputName = prompt(`确定要删除角色"${character.name}"吗？\n\n⚠️ 此操作不可恢复！\n\n请输入角色名称以确认：`);

    if (inputName !== character.name) {
      if (inputName !== null) { // 用户没有点击取消
        alert('角色名称不匹配，取消删除');
      }
      return;
    }

    const updatedProject = {
      ...project,
      characters: (project.characters || []).filter(c => c.id !== characterId)
    };

    onUpdateProject(updatedProject);
    setOpenManageMenuId(null); // 关闭菜单
  };

  // =============================
  // 🆕 生成角色设定图（单张 16:9，1×4 横向四分屏：正/侧/背 + 面部特写）

  /**
   * 使用LLM清理外观描述，移除情绪化/剧情化描述，保留客观视觉特征
   * @param appearance 原始外观描述
   * @returns 清理后的外观描述（适合用于角色设定图生成）
   */
  type SanitizeAppearanceMode = 'baseline' | 'form';
  const sanitizeAppearanceWithLLM = async (
    appearance: string,
    options?: { mode?: SanitizeAppearanceMode }
  ): Promise<string> => {
    if (!appearance || appearance.trim() === '') return appearance;

    const mode: SanitizeAppearanceMode = options?.mode ?? 'baseline';

    // 🚨 baseline 兜底：禁止在“常规完好设定图”里出现血迹等词（用于二次清理触发）
    const BLOOD_KEYWORDS_REGEX = /(血迹|鲜血|血污|血痕|流血)/i;
    const hasBloodKeywords = (text: string) => BLOOD_KEYWORDS_REGEX.test(text);
    const scrubBloodKeywords = (text: string) =>
      text
        .replace(new RegExp(BLOOD_KEYWORDS_REGEX.source, 'gi'), '')
        .replace(/[，。；、]{2,}/g, '，')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const buildPrompt = (input: string, strictBaseline: boolean) => {
      const modeText = mode === 'baseline' ? '常规完好（baseline）' : '特定形态（form）';
      const baselineHardRules = `
### 0. 模式硬约束（必须遵守）
当前模式：${modeText}

- **绝对禁止**：凭空新增任何外伤/血迹/污渍/破损/战损等细节。
- **baseline**：输出必须是“定妆照/常规完好”状态：皮肤干净无伤、无血迹；衣物整洁无破损无血污；不要写“沾染血污/灰尘/污浊/残破”等。
- **form**：如果原文明确描述了受伤/战损/污渍/破损，可保留但需客观克制；若原文未提到，禁止新增。
${strictBaseline ? '- **baseline 严格模式**：你的输出不得包含任何血相关词（如“血迹/血污/鲜血/流血/血痕”）；若原文有这些内容必须删除或改写为完好。\n' : ''}
`;

      return `你是一个专业的影视角色设定师。请将以下角色描述转化为适合生成"角色设定图"的**纯视觉语言 + 影视美学标准**描述。
${baselineHardRules}

## 原始描述
${input}

## 核心原则

### 1. 纯视觉语言（只描述可见特征）
- ✅ 保留：发型、发色、五官、身材、肤色等物理特征
- ❌ 移除（baseline模式）：表情词（"眉头微蹙"、"嘴唇紧抿"、"眼神锐利"、"眼神清澈"、"眼神倔强"）
- ✅ 保留（form模式）：可直接画出的视觉外显（"双目泛红"、"眼白微红"、"目光锐利"、"目光坚定"、"眼神深沉"）
- ❌ 移除：抽象情绪原因（"因情绪激动"、"带着仇恨"），但可改写为视觉结果（"目光冷硬"、"眼神压迫感"）
- ✅ 保留：视觉气质词（"清冷气质"、"温婉大方"、"英气飒爽"）

💡 **模式区别**：
- **baseline（常规完好）**：严格移除所有表情词，保持"定妆照"状态
- **form（特定形态）**：保留可直接体现在面部特写的视觉外显，删除抽象情绪原因

### 2. 【服饰造型】必须完整保留（关键！）
⚠️ **如果原始描述中包含【服饰造型】部分，必须完整保留所有细节，一个字都不能删减！**

**必须保留的内容**：
- ✅ 时代特征：如"90年代常见的"
- ✅ 服装款式+剪裁：如"确良衬衫，立领设计，收腰版型"
- ✅ 色彩搭配：如"米白色略显陈旧"、"深蓝色粗布裤子"
- ✅ 材质+质感：如"确良"、"粗布"、"质地厚实"
- ✅ 设计细节：如"领口有滚边装饰"、"袖口有补丁"、"纽扣是塑料扣"
- ✅ 配饰+搭配：如"解放鞋"、"红绳"、"腰带"、"整体搭配效果"

**禁止操作**：
- ❌ 不要简化服装描述
- ❌ 不要删除任何服装细节
- ❌ 不要改变服装颜色或款式
- ❌ 不要用"简单的衣服"、"普通服装"等笼统描述替代原有细节

### 3. 简洁真实的描述风格（关键！）
⚠️ **不要过度精致化！要保持简洁、真实、有特点的描述风格！**

**禁止使用的堆砌词汇**：
- ❌ "精致的"、"立体"、"深邃"、"清冷出尘"、"亭亭玉立"
- ❌ "五官立体"、"眉宇间带着"、"不易察觉的"
- ❌ 过度修饰的形容词

**推荐的描述方式**：
- ✅ 简洁具体：用"内双"而不是"双眼皮深邃"
- ✅ 真实细节：用"略有雀斑"而不是"皮肤白皙细腻"
- ✅ 客观描述：用"发量适中"而不是"发质柔顺有光泽"
- ✅ 有特点的细节：用"眼尾微微上挑"而不是"眼型狭长"

**如何描述五官**（简洁版）：
- 发型：描述发量、发质、刘海、发尾（如"发量适中，发质略粗但富有光泽，发尾自然内扣"）
- 眼睛：描述眼型、双眼皮类型、眼尾（如"眼睛大而有神，内双，眼尾微微上挑"）
- 鼻子：描述鼻梁、鼻头、鼻翼（如"鼻梁小巧挺直，鼻头圆润，鼻翼精致"）
- 嘴唇：描述唇形、唇色（如"嘴唇饱满，唇形优美，唇色自然"）
- 脸型：描述脸型、面部线条（如"鹅蛋脸，面部线条柔和流畅"）
- 皮肤：描述肤色、特征（如"皮肤白皙，毛孔细腻，略有雀斑，更显真实"）

### 4. 身材比例描述（关键！避免大头娃娃）
**必须添加身材比例描述**：
- 头身比：如"标准七头身"、"修长八头身"、"五头身（Q版）"
- 肩宽比例：如"肩宽适中"、"宽肩窄腰"、"溜肩"
- 四肢比例：如"四肢修长"、"腿长比例优越"、"手臂纤长"
- 整体协调：如"比例匀称"、"身材协调"、"黄金比例"

**示例**：
- ❌ 错误："身材纤细" → AI不知道比例，可能生成大头娃娃
- ✅ 正确："标准七头身，身材纤细匀称，四肢修长，比例协调"

### 5. 个性化创造（不要千篇一律）
**不要所有角色都用"精致的鹅蛋脸"、"五官立体"！**

根据角色特点创造独特描述：
- 清冷美人：可以强调"眼尾微微上扬"、"下颌线流畅"
- 温婉女性：可以强调"眉眼温柔"、"唇角微微上扬"
- 英气女性：可以强调"眉峰利落"、"鼻梁高挺"
- 硬汉男性：可以强调"方正脸型"、"浓眉"、"下颌线硬朗"
- 儒雅男性：可以强调"眉眼清秀"、"鼻梁挺拔"、"唇形优美"

## 输出格式
只输出转化后的描述，不要有其他解释文字。

**输出结构**：
- 如果原始描述包含【主体人物】【外貌特征】【服饰造型】，则保持这个结构
- 如果原始描述只有一段文字，则输出一段文字
- 描述要详细（150-300字），包含美学细节、身材比例、完整的服饰描述

## 示例

**示例1（只有外貌描述 - 简洁真实风格）**：
输入：齐肩发，略显蓬松，大眼睛，眼神锐利而坚定，高鼻梁，薄嘴唇紧抿，尖下巴，皮肤白皙，眉头微蹙，难掩清秀的气质。
输出：齐肩黑发，发量适中，发质略粗但富有光泽，发尾自然内扣，刘海略长，隐约遮盖眉毛。鹅蛋脸，面部线条柔和流畅，颧骨线条不明显。眼睛大而有神，内双，眼尾微微上挑，睫毛纤长浓密。鼻梁小巧挺直，鼻头圆润，鼻翼精致。嘴唇饱满，唇形优美，唇色自然。皮肤白皙细腻，毛孔细腻，肤色均匀。标准七头身，身材纤细匀称，四肢修长，比例协调。

**示例2（包含服饰造型）**：
输入：
【主体人物】中国人，年轻女性，22岁，中国90年代
【外貌特征】齐肩发，大眼睛，眼神倔强，高鼻梁，薄嘴唇，尖下巴，皮肤白皙。
【服饰造型】90年代初常见的确良衬衫，颜色是略微发黄的白色，款式简单。深蓝色粗布裤子，裤腿略微宽松。脚上穿着一双老旧的解放鞋。

输出：
【主体人物】中国人，年轻女性，22岁，中国90年代
【外貌特征】齐肩黑发，发量适中，发质略粗但富有光泽，发尾自然内扣，刘海略长，隐约遮盖眉毛。鹅蛋脸，面部线条柔和流畅，颧骨线条不明显。眼睛大而有神，内双，眼尾微微上挑，睫毛纤长浓密。鼻梁小巧挺直，鼻头圆润，鼻翼精致。嘴唇饱满，唇形优美，唇色自然。皮肤白皙细腻，毛孔细腻，肤色均匀。标准七头身，身材纤细匀称，四肢修长，肩宽适中，比例协调。
【服饰造型】90年代常见的确良衬衫，米白色略显陈旧但洗得干净整洁，立领设计，收腰版型，肩线利落，版型略宽松但剪裁合身，纽扣是朴素的塑料扣。深蓝色粗布裤子，直筒高腰款式，虽然材质朴素但剪裁合身，裤线笔直，裤脚略有磨损但边缘整齐。腰间用一条细布腰带系紧，腰带颜色已经褪色但保养得当。脚穿一双褪色的解放鞋，鞋面虽旧但擦拭干净，鞋带系得整齐。左手腕上系着一条褪色的红绳，已经磨得发白，但依然牢固。整体朴素但不邋遢，每个细节都透出"清贫但自尊"的感觉。
`;
    };

    try {
      const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER1_API_KEY;
      if (!OPENROUTER_API_KEY) {
        console.warn('[提示词清理] 未配置 OpenRouter API Key，跳过清理');
        return appearance;
      }

      const sanitizeOnce = async (prompt: string): Promise<string | null> => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': window.location.origin,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash', // 🆕 升级到 2.5-flash（更高质量，避免截断）
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 8000, // 🆕 增加 token 限制，避免细节截断
          }),
        });

        if (!response.ok) {
          console.warn('[提示词清理] API调用失败:', response.status, response.statusText);
          return null;
        }

        const data = await response.json();
        const cleaned = data.choices?.[0]?.message?.content?.trim();
        return cleaned && cleaned.length > 0 ? cleaned : null;
      };

      // 1) 首次清理
      const first = await sanitizeOnce(buildPrompt(appearance, false));
      let cleanedText = first ?? appearance;

      // 2) baseline：如果清理后仍出现血迹关键词 → 二次严格清理 + 最终字符串兜底
      if (mode === 'baseline' && hasBloodKeywords(cleanedText)) {
        console.warn('[提示词清理] baseline 输出仍包含血相关词，触发二次严格清理');
        const second = await sanitizeOnce(buildPrompt(cleanedText, true));
        cleanedText = second ?? cleanedText;

        if (hasBloodKeywords(cleanedText)) {
          console.warn('[提示词清理] baseline 二次清理后仍包含血相关词，触发最终字符串兜底');
          cleanedText = scrubBloodKeywords(cleanedText);
        }
      }

      if (cleanedText && cleanedText.length > 0) {
        console.log('[提示词清理] 成功清理外观描述');
        console.log('  原始:', appearance.substring(0, 100) + '...');
        console.log('  清理后:', cleanedText.substring(0, 100) + '...');
        return cleanedText;
      }

      console.warn('[提示词清理] 清理结果为空，回退原始描述');
      return appearance;
    } catch (error) {
      console.error('[提示词清理] LLM调用失败:', error);
      return appearance; // 降级：返回原始描述
    }
  };

  /**
   * 提取并翻译关键外貌特征（发型、身体比例、服装类型等）为英文关键词
   * @param appearance 完整外观描述
   * @param mode 'identity' = 只提取不变的骨相特征（脸型/五官形状/体型），'baselineLook' = 提取默认造型（妆容/唇色/发型），'full' = 提取所有特征（含发饰/服装）
   * @returns 英文关键特征（用于提高图片生成准确度）或结构化JSON（baselineLook模式）
   */
  type ExtractMode = 'identity' | 'baselineLook' | 'full';

  interface BaselineLookStructure {
    lipsColor?: string;      // 唇色（如 "light orange lips", "natural pink lips"）
    makeup?: string;         // 妆容（如 "light makeup, soft eyeshadow", "no makeup"）
    hairStyle?: string;      // 发型（如 "hair bun", "long flowing hair"）
    hairColor?: string;      // 发色（如 "dark brown hair", "black hair"）
  }

  const extractKeyAppearanceFeatures = async (appearance: string, mode: ExtractMode = 'full'): Promise<string> => {
    if (!appearance || appearance.trim() === '') return '';

    const identityOnlyPrompt = `你是一个专业的AI图片生成提示词专家。请从以下角色描述中提取**不变的骨相结构特征**（脸型、五官形状、骨骼结构等），并翻译成精确的英文关键词。

⚠️ **核心约束**：只提取骨相/结构类特征，不要提取可变的造型（如妆容、唇色、发型细节、服装）。

## 原始描述
${appearance}

## 提取范围（只提取以下内容）
1. **脸型**：提取脸型特征并翻译（如 oval face, square face, heart-shaped face 等）
2. **五官形状**：眉毛形状、眼睛形状、鼻子形状、嘴唇形状（⚠️ 只提取形状，不提取颜色）
   - 眉毛：arched eyebrows, straight eyebrows, thick eyebrows 等
   - 眼睛：almond eyes, round eyes, narrow eyes 等
   - 鼻子：straight nose, high nose bridge, small nose 等
   - 嘴唇：full lips, thin lips, small lips 等（⚠️ 严禁提取唇色）
3. **骨骼结构**：眉骨、颧骨、下颌线等（如 prominent cheekbones, defined jawline 等）
4. **瞳孔颜色**：提取瞳孔颜色并翻译（如 amber eyes, black eyes, blue eyes 等）
5. **发色**：提取头发颜色并翻译（如 dark brown hair, black hair, blonde hair 等）
   ⚠️ 注意：发色可能变化（染发），但作为默认参考
6. **体型比例**：提取并翻译（如 8-head-body proportion, standard body proportion 等）
7. **性别年龄**：提取性别和年龄（如 male, female, 28 years old 等）
8. **唯一标记**：痣/疤的数量和位置（如 single tiny (2mm) tear mole just below the outer corner of the right eye）
   ⚠️ **如果描述中明确为"一颗极小泪痣"，必须翻译为：single tiny (2mm) tear mole just below the outer corner of the right eye**

## 禁止提取（这些不属于骨骼结构）
❌ 发型（如发髻、马尾、编发等）
❌ 头饰（如发簪、发冠、头巾等）
❌ 服装（如长袍、裙子、鞋子等）
❌ 配饰（如耳环、项链、手镯等）
❌ 表情（如微笑、皱眉等）
❌ 面部污渍/战损（如血迹、泥土、伤疤等）

⚠️ **注意**：唇色、妆容不在禁止列表中，因为它们属于"Baseline Look"层，会在后续步骤中处理。

## 输出格式
只输出英文关键词，用逗号分隔，按优先级排序（最重要的放在最前面）。
不要有其他解释文字。

示例输出：
oval face, arched eyebrows, almond eyes, amber eyes, full lips, dark brown hair, 8-head-body proportion, male, 28 years old, single tiny (2mm) tear mole just below the outer corner of the right eye`;

    const baselineLookPrompt = `你是一个专业的AI图片生成提示词专家。请从以下角色描述中提取**默认造型特征**（妆容、唇色、发型），并输出为结构化JSON格式。

⚠️ **核心约束**：只提取造型类特征，不要提取骨相结构（脸型、五官形状等已在Identity层提取）。

## 原始描述
${appearance}

## 提取范围（只提取以下内容）

### 1. 唇色（lipsColor）
- 提取唇部颜色描述（如 "淡橘唇"、"自然粉唇"、"正红口红"）
- 翻译为英文（如 "light orange lips", "natural pink lips", "red lipstick"）

	#### 唇色语义规则（重要：避免把“自然偏淡”翻成“苍白/失血”）
	⚠️ 必须区分“审美上的偏淡/低饱和”和“状态上的苍白/失血”：
	- 如果中文是“自然偏淡/偏淡/淡/柔和/低饱和/唇色自然偏淡” → 优先输出 "muted natural lips" 或 "soft natural lip tone"（不要用 pale）
	- 如果中文是“苍白/失血/无血色/病态苍白/战损导致唇色苍白” → 才输出 "pale lips" / "bloodless lips"
	- 如果中文是“红润/饱满/气色好” → 可输出 "rosy lips" / "healthy lip tone"
- 如果没有明确提到唇色，输出 "natural lips"

### 2. 妆容（makeup）
- 提取妆容描述（如 "底妆清透无瑕，眼妆轻扫大地色眼影"）
- 翻译为英文（如 "light makeup, soft eyeshadow, natural blush"）
- 如果明确说"素颜/无妆"，输出 "no makeup"
- 如果没有明确提到妆容，输出 "natural makeup"

### 3. 发型（hairStyle）
- 提取发型描述（如 "盘发"、"长发披肩"、"马尾"）
- 翻译为英文（如 "hair bun", "long flowing hair", "ponytail"）
- 如果没有明确提到发型，输出 "natural hairstyle"

### 4. 发色（hairColor）
- 提取发色描述（如 "乌黑"、"深棕色"、"金色"）
- 翻译为英文（如 "black hair", "dark brown hair", "blonde hair"）
- 如果没有明确提到发色，输出 "dark hair"

## 输出格式
必须输出严格的JSON格式，不要有其他解释文字。

示例输出：
\`\`\`json
{
  "lipsColor": "light orange lips",
  "makeup": "light makeup, soft eyeshadow, natural blush",
  "hairStyle": "hair bun with jade hairpin",
  "hairColor": "black hair"
}
\`\`\``;

    const fullPrompt = `你是一个专业的AI图片生成提示词专家。请从以下角色描述中提取最关键的外貌特征，并翻译成精确的英文关键词。

## 原始描述
${appearance}

## 核心要求

### 1. 提取以下关键特征（按优先级排序，⚠️ 必须全部提取）

#### 1.1 头发特征（最高优先级）
1. **发色**：⚠️ **必须提取**，如果描述中提到发色，翻译为英文（如 silver white hair / black hair / dark brown hair / blonde hair / gray hair 等）
   - 特别注意：银白/白色/灰白 → silver white hair 或 white hair
   - 深棕/棕黑 → dark brown hair
   - 乌黑/黑色 → black hair
2. **发型长度**：
   - 如果描述**明确提到**"长发/短发/寸头/光头"等长度词，翻译为 long hair / short hair / buzz cut / bald
   - 如果只提到发型名称（如"盘发/发髻/辫子"）而未明确长度，翻译为发型形态（如 hair bun / braids），**不要强行推断长度**
3. **发质**：如果描述中提到发质（如"柔顺有光泽/蓬松/卷曲"），翻译为英文（如 smooth and glossy hair / fluffy hair / curly hair 等）

#### 1.2 面部特征（高优先级）
4. **脸型**：如果描述中提到脸型，翻译为英文（如 oval face / square face / heart-shaped face / round face 等）
5. **眉毛形状**：如果描述中提到眉毛形状，翻译成英文（如 arched eyebrows / straight eyebrows / thick eyebrows 等）
6. **眼睛形状**：如果描述中提到眼睛形状，翻译成英文（如 almond eyes / round eyes / narrow eyes / elongated eyes 等）
   - 特别注意：眼尾上挑 → upturned eye corners
7. **瞳色**：⚠️ **必须提取**，如果描述中提到瞳孔颜色，翻译为英文（如 amber eyes / black eyes / dark eyes / blue eyes / brown eyes 等）
   - 特别注意：墨色/黑色 → black eyes 或 dark eyes
   - 琥珀色 → amber eyes
8. **鼻子形状**：如果描述中提到鼻子，翻译为英文（如 high nose bridge / straight nose / small nose 等）
9. **嘴唇形状**：如果描述中提到嘴唇形状，翻译为英文（如 full lips / thin lips / small lips 等）

#### 1.3 其他特征
10. **头饰**：如果描述中提到头饰，翻译为通用品类（如 jade crown / ornate headpiece / hairpin / headband 等）
11. **标志性特征**：如果描述中提到痣/疤痕/胎记等，翻译并标注位置（如 mole below right eye / scar on left cheek 等）
12. **身体比例**：如果描述中提到比例，翻译成英文（如 8-head-body proportion / standard body proportion 等）
13. **服装类型**：如果描述中提到服装类型，翻译成通用描述（如 traditional costume / modern clothing / fantasy outfit 等）
14. **时代/风格特征**：如果描述中提到时代或风格，翻译成英文（如 historical setting / modern / fantasy world 等）
15. **性别年龄**：提取性别和年龄（如 male / female, 28 years old 等）

### 2. 翻译原则
- **忠实原文**：只翻译描述中明确提到的内容，不要添加、推断或强化
- **通用品类**：使用通用的英文词汇，避免过于文化特定的表达
- **标注位置**：对于痣、疤痕等特征，必须标注具体位置
- **保持简洁**：每个特征用最精确的英文关键词表达

### 3. 输出格式
只输出英文关键词，用逗号分隔，按优先级排序（最重要的放在最前面）。
不要有其他解释文字。

示例输出：
silver white hair, smooth and glossy hair, hair bun, jade crown, oval face, arched eyebrows, elongated eyes, upturned eye corners, dark eyes, high nose bridge, thin lips, 8-head-body proportion, fantasy outfit, fantasy world, male, 28 years old`;

    const prompt = mode === 'identity' ? identityOnlyPrompt : (mode === 'baselineLook' ? baselineLookPrompt : fullPrompt);

    try {
      const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER1_API_KEY;
      if (!OPENROUTER_API_KEY) {
        console.warn('[关键特征提取] 未配置 OpenRouter API Key，跳过提取');
        return '';
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': window.location.origin,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash', // 🆕 升级到 2.5-flash（更高质量）
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 300, // 🆕 增加 token 限制
        }),
      });

      if (!response.ok) {
        console.warn('[关键特征提取] API调用失败:', response.status, response.statusText);
        return '';
      }

      const data = await response.json();
      const extracted = data.choices?.[0]?.message?.content?.trim();

      if (extracted && extracted.length > 0) {
        console.log(`[关键特征提取] 成功提取关键特征 (mode=${mode})`);
        console.log('  提取结果:', extracted);
        return extracted;
      } else {
        console.warn('[关键特征提取] LLM返回内容为空');
        return '';
      }
    } catch (error) {
      console.error('[关键特征提取] LLM调用失败:', error);
      return '';
    }
  };

  /**
   * 从 LLM 返回的文本中提取 JSON（支持 ```json 包裹或纯 JSON）
   */
  const extractJSON = (text: string): any | null => {
    try {
      // 尝试直接解析
      return JSON.parse(text);
    } catch {
      // 尝试提取 ```json ... ``` 包裹的内容
      const match = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  /**
   * 通用 slot 覆盖合并函数
   * @param identity Identity 层（骨相结构）
   * @param baselineLook Baseline Look 层（默认造型）
   * @param formDelta Form Delta 层（形态变化）
   * @returns 合并后的最终 prompt（优先级：formDelta > baselineLook > identity）
   */
  const mergeSlots = (
    identity: string,
    baselineLook: { lipsColor?: string; makeup?: string; hairStyle?: string; hairColor?: string } | null,
    formDelta: { lipsColor?: string; makeup?: string; hairStyle?: string; clothing?: string; damage?: string; appearance?: string } | null
  ): string => {
    const slots: Record<string, string> = {};

    // 1. Identity 层：骨相结构（最低优先级）
    if (identity) {
      slots['identity'] = identity;
    }

    // 2. Baseline Look 层：默认造型（中优先级）
    if (baselineLook) {
      if (baselineLook.lipsColor) slots['lipsColor'] = baselineLook.lipsColor;
      if (baselineLook.makeup) slots['makeup'] = baselineLook.makeup;
      if (baselineLook.hairStyle) slots['hairStyle'] = baselineLook.hairStyle;
      if (baselineLook.hairColor) slots['hairColor'] = baselineLook.hairColor;
    }

    // 3. Form Delta 层：形态变化（最高优先级，覆盖同名 slot）
    if (formDelta) {
      if (formDelta.lipsColor) slots['lipsColor'] = formDelta.lipsColor;
      if (formDelta.makeup) slots['makeup'] = formDelta.makeup;
      if (formDelta.hairStyle) slots['hairStyle'] = formDelta.hairStyle;
      if (formDelta.clothing) slots['clothing'] = formDelta.clothing;
      if (formDelta.damage) slots['damage'] = formDelta.damage;
      if (formDelta.appearance) slots['appearance'] = formDelta.appearance;
    }

    // 4. 拼接最终 prompt（按优先级排序）
    const parts: string[] = [];
    if (slots['identity']) parts.push(slots['identity']);
    if (slots['lipsColor']) parts.push(slots['lipsColor']);
    if (slots['makeup']) parts.push(slots['makeup']);
    if (slots['hairStyle']) parts.push(slots['hairStyle']);
    if (slots['hairColor']) parts.push(slots['hairColor']);
    if (slots['clothing']) parts.push(slots['clothing']);
    if (slots['damage']) parts.push(slots['damage']);
    if (slots['appearance']) parts.push(slots['appearance']);

    return parts.join(', ');
  };

  /**
   * 将中文服装描述翻译成精确的英文关键词
   * @param appearance 包含服装描述的完整外观描述
   * @param mode 'baseline' = 翻译【服饰造型】部分，'form' = 翻译形态战损/缺失饰品等细节
   * @returns 英文服装关键词（如果没有服装描述则返回空字符串）
   */
  type TranslateMode = 'baseline' | 'form';
  const translateClothingToEnglish = async (appearance: string, mode: TranslateMode = 'baseline'): Promise<string> => {
    if (!appearance || appearance.trim() === '') return '';

    // baseline 模式：检查是否包含【服饰造型】部分
    if (mode === 'baseline') {
      const hasClothingSection = appearance.includes('【服饰造型】');
      if (!hasClothingSection) {
        console.log('[服装翻译] 未找到【服饰造型】部分，跳过翻译');
        return '';
      }
    }

    const baselinePrompt = `你是一个专业的AI图片生成提示词专家。请将以下中文服装描述翻译成精确的英文关键词，用于AI图片生成。

## 原始描述
${appearance}

## 核心要求

### 1. 只提取【服饰造型】部分
- 如果原始描述包含【服饰造型】部分，只翻译这部分
- 如果没有【服饰造型】部分，返回空字符串

### 🆕 1.5. 保留分层语义（强制要求，避免串色/层次弱）
⚠️ **如果中文【服饰造型】包含【内层】【中层】【外层】【鞋靴】【腰带与挂件】等子标签，英文输出必须保留层级前缀！**

**层级前缀规则**（注意：这里不要使用反引号包裹示例文本，避免破坏模板字符串语法）：
- 【内层】 → inner layer: ...
- 【中层】 → middle layer (main garment): ... 或 middle layer: ...
- 【外层】 → outer layer (overcoat): ... 或 outer layer: ...
- 【鞋靴】 → boots: ... 或 footwear: ...
- 【腰带与挂件】 → belt & hanging ornaments: ...
- 【随身道具】 → carried items: ...

**为什么重要**：层级前缀能让AI模型清楚知道"谁压谁"，避免主色（如深墨绿）扩散到所有层，增强视觉层次感。

**示例**：
输入：
【服饰造型】
【内层】月白色对襟内袍，采用缎纹和平纹织造，轻薄且半透明...
【中层】深墨绿色华丽法袍，采用缎纹和提花织造...
【鞋靴】玄色高筒布靴...

输出：
	inner layer: moonlight white inner robe, satin and plain weave, lightweight and semi-transparent, ... middle layer (main garment): deep forest green ornate cultivation robe, satin and jacquard weave, ... boots: black high boots, ...

### 2. 🔥 材质细节强制要求（必须输出）
⚠️ **必须输出以下三类关键词，这是最重要的要求！**

**必须包含**：
- **材质结构关键词**（至少2个）：如 layered silk, sheer gauze, satin, cotton blend, brocade, fine weave
- **光泽/纹理关键词**（至少1个）：如 satin sheen, pearlescent, matte finish, fine weave texture, subtle luster
- **工艺细节关键词**（至少1个）：如 tone-on-tone embroidery, fine stitches, raised threads, delicate lace, subtle pattern

**禁止**：
- 禁止编造具体数值参数（如120支、8姆米、每厘米10针等）
- 禁止编造具体工艺名称（如苏绣、湘绣等，除非中文明确提到）

### 3. 图案判断规则（关键！）
⚠️ **只有中文明确说"无图案/无印花/无刺绣/无蕾丝"时，才输出 "no pattern"**

**判断规则**：
- 如果中文明确说"无图案/无印花/无刺绣/无蕾丝" → 输出 "no pattern, no print"
- 如果是"素色/纯色"但未明确说"无图案" → 只输出 "solid color"（不要加 no pattern）
- 如果有刺绣/暗纹/织物纹理 → 必须准确描述（如 subtle cloud embroidery, tone-on-tone pattern）

### 4. 翻译规则
- 时代特征：如"90年代" → "1990s Chinese style"
- 服装款式：如"确良衬衫" → "terylene shirt"、"法衣" → "cultivation robe"
- 颜色：如"米白色" → "off-white"、"月白色" → "moonlight white"
	  - 墨绿/深墨绿/深绿/松柏绿 → 优先使用 "deep forest green"（避免 emerald 的宝石感）
	  - 只有中文明确是“翡翠绿/祖母绿/宝石绿”时才使用 "emerald green"
- 材质：如"粗布" → "cotton"、"丝绸" → "silk"、"锦缎" → "brocade"
- 剪裁：如"立领" → "mandarin collar"、"修身" → "fitted"
- 细节：如"塑料扣" → "plastic buttons"、"刺绣" → "embroidery"
- 配饰：如"解放鞋" → "Chinese liberation shoes"、"乌木簪" → "ebony hairpin"

### 5. 输出格式
只输出英文关键词，用逗号分隔，不要有其他解释文字。

## 示例

**示例1（有分层标签）**：
输入：
【服饰造型】
【内层】月白色对襟内袍，采用缎纹和平纹织造，轻薄且半透明，表面呈柔光，领口和袖口有精致的平绣暗纹，剪裁修身流畅，新旧程度完好；
【中层】深墨绿色华丽法袍，采用缎纹和提花织造，中等厚度，呈现典雅的缎面光泽，袍身以金线暗纹绣出狂傲的龙纹图案，版型宽松飘逸，新旧程度完好；
【鞋靴】玄色高筒布靴，选用柔软的皮革材质，款式简约大气，鞋面以暗银色铆钉勾勒边缘，新旧程度完好；

输出：
	inner layer: moonlight white inner robe, satin and plain weave, lightweight and semi-transparent, soft sheen, tone-on-tone embroidery at collar and cuffs, fitted cut, pristine condition. middle layer (main garment): deep forest green ornate cultivation robe, satin and jacquard weave, medium weight, elegant satin luster, gold thread dragon pattern embroidery, loose flowing silhouette, pristine condition. boots: black high boots, soft leather, minimalist design, dark silver rivets along edges, pristine condition

**示例2（无分层标签，旧格式兼容）**：
输入：
【服饰造型】上着一件月白色精致法衣，丝绸与纱复合材质，袖口有简洁暗纹云纹刺绣，款式修身；法衣下摆飘逸，直至脚踝。腰间系一根米白色缎面宽腰带，无多余装饰。

输出：
Moonlight white cultivation robe, solid color, layered silk and sheer gauze blend, satin sheen, fine weave texture, fitted style, tone-on-tone cloud embroidery at cuffs, subtle raised threads, flowing hem to ankles. Ivory satin wide belt, smooth glossy finish

**示例2（纯色无图案）**：
输入：
【服饰造型】90年代常见的确良衬衫，米白色，无印花，立领设计，收腰版型，纽扣是朴素的塑料扣。深蓝色粗布裤子，直筒高腰款式。

输出：
1990s Chinese terylene shirt, off-white solid color, no pattern, no print, mandarin collar, fitted waist, simple plastic buttons. Dark blue cotton pants, straight cut, high waist, solid color, no pattern.
`;

    const formPrompt = `你是一个专业的AI图片生成提示词专家。请将以下形态描述中的**视觉变化**提取为结构化JSON格式。

⚠️ **核心要求**：只提取"变化项"（战损/缺失/污渍/变身特征/妆容变化），不要重复不变的身份特征。

## 原始描述
${appearance}

## 🆕 修改6：证据驱动判断（第一步：判断变化类型）

请仔细阅读原始描述，判断以下问题：

### 1. 是否明确提到"换装"？
- ✅ 如果明确提到"换上XX衣服""穿着XX""改穿XX" → \`hasClothingChange = true\`
- ❌ 如果只是"战损/濒死/虚弱/血污"等状态 → \`hasClothingChange = false\`（基于常规服装，只输出破损/血污/缺失）

### 2. 是否明确提到"换妆/卸妆"？
- ✅ 如果明确提到"浓妆""素颜""妆容精致""卸妆" → \`hasMakeupChange = true\`
- ❌ 如果没有提到 → \`hasMakeupChange = false\`（继承常规妆容）

### 3. 是否明确提到"换发型"？
- ✅ 如果明确提到"披散头发""束发""剪短""改变发型" → \`hasHairStyleChange = true\`
- ❌ 如果没有提到 → \`hasHairStyleChange = false\`（继承常规发型）

⚠️ **重要原则**：只有原始描述**明确提到**才算"换"！

## 🚨 战损强制规则（关键词触发）

如果原始描述中出现以下任一关键词：**战损、破损、血迹、脏污、散乱**，即使描述中出现"保持完好"等矛盾表述，也必须输出以下变化：

**必须包含的四要素**：
1. **hairStyle**（发型散乱）：
   - "disheveled hair, messy loose strands, hair slightly disheveled"

2. **clothing**（衣物轻微破损 + 轻微血迹 + 轻微脏污）：
   - "minor tears on clothing, frayed edges, light bloodstains on fabric, light dirt smudges"

3. **damage**（轻微脏污）：
   - "light dust, light dirt on clothing edges"

4. **appearance**（如果提到眼部外显）：
   - 如果提到"双目泛红/眼白微红/目光坚定/眼神深沉" → 必须输出到 appearance 字段

💡 **说明**：战损（轻微）不等于"无变化"，必须体现出与常规完好状态的视觉差异。

## 提取范围（只提取以下内容）

### 1. 唇色变化（lipsColor）
- **只有当形态明确提到唇色变化时才输出**（如"苍白唇"、"失血唇"、"正红口红"）
- 翻译为英文（如 "pale lips", "bloodless lips", "red lipstick"）
- 如果没有明确提到唇色变化，不要输出此字段

### 2. 妆容变化（makeup）
- **只有当形态明确提到妆容变化时才输出**（如"浓妆"、"卸妆"、"烟熏妆"）
- 翻译为英文（如 "heavy makeup", "no makeup", "smoky eye makeup"）
- 如果没有明确提到妆容变化，不要输出此字段

### 3. 发型变化（hairStyle）
- **只有当形态明确提到发型变化时才输出**（如"散发"、"披散"、"凌乱"）
- 翻译为英文（如 "hair untied", "disheveled hair", "messy hair"）
- 如果没有明确提到发型变化，不要输出此字段

### 4. 服装战损（clothing）
- 残破/破洞/裂痕/撕裂等 → "tattered clothing, torn fabric, ripped hem, holes in garment"
- 缺失物品 → "missing helmet, no necklace, broken weapon"
- 如果没有服装战损，不要输出此字段

### 5. 面部污渍/战损（damage）
- 血迹/血污/泥土/灰尘/伤痕等 → "blood stains on face, dirt, mud, dust, scars"
- 虚弱/憔悴/濒死等状态 → "weak expression, exhausted, barely conscious"
- 如果没有面部污渍/战损，不要输出此字段

### 6. 外貌变化（appearance）
- **只有当形态明确描述了外貌变化时才输出**（如变身/染发/换瞳/皮肤变化）
- 发色变化 → "silver hair" / "white hair" / "red hair"
- 瞳色变化 → "blue eyes" / "red eyes" / "golden eyes"
- 皮肤变化 → "pale skin" / "gray skin" / "scaled skin"
- 特殊特征 → "horns" / "wings" / "fangs" / "claws"
- **🆕 眼部视觉外显**（可直接画出的特征）：
  - "双目泛红" → "slightly bloodshot eyes, reddened eyes"
  - "眼神深沉坚定" → "intense, determined gaze"
  - "目光锐利" → "sharp, piercing gaze"
  - "眼白微红" → "slightly reddened whites of eyes"
- 如果没有外貌变化，不要输出此字段

## 禁止提取（除非形态文本明确描述了变化）
❌ 脸型、五官形状（除非形态明确说"脸型变化"）
❌ 基础发色、瞳色（除非形态明确说"发色变为XX/瞳色变为XX"）
❌ 体型比例（除非形态明确说"体型变化"）
❌ 基础服装款式（如"长袍"本身，只提取"残破的长袍"）

## 🆕 修改6：输出格式（必须包含判断标志）

必须输出严格的JSON格式，不要有其他解释文字。
**必须包含 hasClothingChange/hasMakeupChange/hasHairStyleChange 三个布尔值。**
**只输出形态明确提到的变化项，没有变化的字段不要输出。**

\`\`\`json
{
  "hasClothingChange": true/false,
  "hasMakeupChange": true/false,
  "hasHairStyleChange": true/false,
  "lipsColor": "...",  // 可选
  "makeup": "...",     // 可选
  "hairStyle": "...",  // 可选
  "clothing": "...",   // 可选
  "damage": "...",     // 可选
  "appearance": "..."  // 可选
}
\`\`\`

## 示例

**示例1（战损形态，唇色苍白，发型散乱但未换发型）**：
输入：
形态描述：衣物破损严重，沾满血迹和泥污，头发凌乱散落，唇色苍白失血。

输出：
\`\`\`json
{
  "hasClothingChange": false,
  "hasMakeupChange": false,
  "hasHairStyleChange": true,
  "lipsColor": "pale bloodless lips",
  "hairStyle": "disheveled hair, messy loose strands",
  "clothing": "tattered clothing, torn fabric, blood stains, light dirt smudges",
  "damage": "mud, dirt on face"
}
\`\`\`
💡 **说明**：虽然没有"换发型"（如从长发剪成短发），但"凌乱散落"是发型状态变化，需要设置 \`hasHairStyleChange = true\` 并输出 hairStyle 字段。

**示例2（换妆形态）**：
输入：
形态描述：换上正红口红，浓妆艳抹，烟熏眼妆。

输出：
\`\`\`json
{
  "hasClothingChange": false,
  "hasMakeupChange": true,
  "hasHairStyleChange": false,
  "lipsColor": "red lipstick",
  "makeup": "heavy makeup, smoky eye makeup"
}
\`\`\`

**示例3（变身形态，外貌变化）**：
输入：
形态描述：银发蓝瞳，皮肤变灰，额头长出双角，背后生出黑色羽翼。

输出：
\`\`\`json
{
  "hasClothingChange": false,
  "hasMakeupChange": false,
  "hasHairStyleChange": false,
  "appearance": "silver hair, blue eyes, gray skin, horns on forehead, black wings"
}
\`\`\`

**示例4（只有服装战损，无妆容/唇色变化）**：
输入：
形态描述：衣物破损，头盔丢失。

输出：
\`\`\`json
{
  "hasClothingChange": false,
  "hasMakeupChange": false,
  "hasHairStyleChange": false,
  "clothing": "tattered clothing, missing helmet"
}
\`\`\`
`;

    const prompt = mode === 'baseline' ? baselinePrompt : formPrompt;

    try {
      const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER1_API_KEY;
      if (!OPENROUTER_API_KEY) {
        console.warn('[服装翻译] 未配置 OpenRouter API Key，跳过翻译');
        return '';
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'AI Director - Clothing Translation',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash', // 🆕 升级到 2.5-flash（更高质量，避免截断）
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 500, // 🆕 增加 token 限制，避免细节截断
        }),
      });

      if (!response.ok) {
        console.warn('[服装翻译] API调用失败:', response.status, response.statusText);
        return '';
      }

      const data = await response.json();
      const translated = data.choices?.[0]?.message?.content?.trim();

      if (translated && translated.length > 0) {
        console.log('[服装翻译] 成功翻译服装描述');
        console.log('  翻译结果:', translated);
        return translated;
      } else {
        console.warn('[服装翻译] LLM返回内容为空');
        return '';
      }
    } catch (error) {
      console.error('[服装翻译] LLM调用失败:', error);
      return '';
    }
  };

  // =============================
  // skipConfirm: 批量生成时跳过确认对话框
  // 🔧 支持 formId 参数：为指定形态生成设定图
  const handleGenerateCharacterImageSheet = async (characterId: string, skipConfirm = false, formId?: string) => {
    const character = (project.characters || []).find(c => c.id === characterId);
    if (!character) return;
    if (!characterImageModel) { alert('请先选择生图模型'); return; }

    // 🆕 严格校验：检查项目是否已设置渲染风格
    if (!hasProjectStyle(project)) {
      alert('⚠️ 请先设置项目风格\n\n项目风格用于角色、场景和分镜的统一视觉呈现。\n请在下方"项目风格设置"区域选择风格后再生成角色设定图。');
      return;
    }

    // 🔧 生成唯一 ID（角色ID 或 角色ID_形态ID）
    const genKey = characterId + (formId ? `_${formId}` : '');

    // 检查该角色/形态是否已在生成中（允许不同角色并发）
    if (generatingIds.has(genKey)) { alert('该角色/形态正在生成中，请稍后'); return; }

    // 查找目标形态
    const targetForm = formId ? character.forms?.find(f => f.id === formId) : null;
    if (formId && !targetForm) { alert('未找到指定形态'); return; }
    const targetLabel = targetForm ? `角色「${character.name}」的形态「${targetForm.name}」` : `角色「${character.name}」`;

    // 🆕 修改6-A：强制要求形态图必须有常态参考图（allowTransformation 例外）
    if (targetForm && targetForm.consistencyMode !== 'allowTransformation' && !character.imageSheetUrl) {
      alert(
        `⚠️ 必须先生成常态设定图！\n\n` +
        `常态设定图是所有形态的基础（定妆照），用于确保形态图与常态保持同一个人的面部特征。\n\n` +
        `请先点击"生成角色设定图"按钮生成常态图，然后再生成形态图。`
      );
      return;
    }

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
      // 🆕 使用项目统一风格（而非局部 characterStyle）
      const projectStyle = getEffectiveCharacterSceneStyle(project);
      const styleSuffix = getStylePromptSuffix(projectStyle);
      const projectVisualStyle = project.settings?.visualStyle || '';

      // 🆕 智能清理外观描述（移除情绪化描述）
      setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage: '清理提示词', percent: 5 }); return m; });
	      const cleanedAppearance = await sanitizeAppearanceWithLLM(character.appearance || '', { mode: 'baseline' });

      // 🌏 代码级人种识别（确定性检测，不依赖 LLM）
      const ethnicitySlot = getEthnicitySlot(cleanedAppearance);
      if (ethnicitySlot) {
        console.log('[人种识别] 检测到人种slot:', ethnicitySlot.identityEn, ethnicitySlot.negativeEn ? `(negative: ${ethnicitySlot.negativeEn})` : '');
      }

      // 🆕 Identity/Delta 分层：根据是否为形态图，使用不同的提取策略
      let identityFeaturesEn = '';
      let clothingKeywordsEn = '';
      let formDeltaEn = '';
      let cleanedFormDescription = '';  // 🔧 修复：提升到外层作用域

      if (targetForm) {
        // 🆕 形态图：Identity（不变特征）来自常态，Delta（变化项）来自形态
        setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage: '提取身份特征', percent: 8 }); return m; });
        // Identity：只提取不变的身份特征（脸型、五官、发色、体型）
        identityFeaturesEn = await extractKeyAppearanceFeatures(cleanedAppearance, 'identity');

        // 🆕 清理形态的描述和视觉提示词（移除情绪化描述）
        setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage: '清理形态描述', percent: 10 }); return m; });
	        cleanedFormDescription = targetForm.description
	          ? await sanitizeAppearanceWithLLM(targetForm.description, { mode: 'form' })
          : '';
	        const cleanedFormVisualPrompt = targetForm.visualPromptCn
	          ? await sanitizeAppearanceWithLLM(targetForm.visualPromptCn, { mode: 'form' })
          : '';

        // Delta：从形态描述中提取变化项（战损/缺失饰品/污渍/虚弱表情）
        setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage: '翻译形态变化', percent: 12 }); return m; });
        const formText = [cleanedFormDescription, cleanedFormVisualPrompt].filter(Boolean).join('；');
        formDeltaEn = await translateClothingToEnglish(formText, 'form');
      } else {
        // 🆕 常态图：提取完整特征（含发饰/服装）
        setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage: '提取关键特征', percent: 8 }); return m; });
        identityFeaturesEn = await extractKeyAppearanceFeatures(cleanedAppearance, 'full');

        setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage: '翻译服装描述', percent: 10 }); return m; });
        clothingKeywordsEn = await translateClothingToEnglish(cleanedAppearance, 'baseline');
      }

      // 🔧 根据是否指定形态，构建不同的提示词
      let baseInfoCn: string;
      if (targetForm) {
        // 🔧 修复：cleanedFormDescription 已在上面定义，这里直接使用
	        const cleanedFormVisualPrompt = targetForm.visualPromptCn
	          ? await sanitizeAppearanceWithLLM(targetForm.visualPromptCn, { mode: 'form' })
          : '';

        // 🔧 形态设定图：只使用形态的描述，不包含常态外观
        // 原因：形态描述应该是完整的、独立的，包含常态外观会导致AI混淆
        baseInfoCn = [
          `角色设定图 - 特定形态`,
          `角色：${character.name}`,
          `形态：${targetForm.name}`,
          cleanedFormDescription ? `形态描述：${cleanedFormDescription}` : '',
          cleanedFormVisualPrompt ? `视觉特征：${cleanedFormVisualPrompt}` : '',
          // ❌ 移除：cleanedAppearance（常态外观）- 避免与形态描述冲突
          character.gender ? `性别：${character.gender}` : '',
          character.ageGroup ? `年龄段：${character.ageGroup}` : '',
          targetForm.note ? `备注：${targetForm.note}` : '',
          projectVisualStyle ? `项目视觉风格：${projectVisualStyle}` : '',
        ].filter(Boolean).join('；');
      } else {
        // 🆕 主形态设定图：使用角色基础信息 + 强制无表情、标准站立
        baseInfoCn = [
          `角色设定图`, `角色：${character.name}`,
          cleanedAppearance ? `外观：${cleanedAppearance}` : '',
          character.gender ? `性别：${character.gender}` : '',
          character.ageGroup ? `年龄段：${character.ageGroup}` : '',
          projectVisualStyle ? `项目视觉风格：${projectVisualStyle}` : '',
        ].filter(Boolean).join('；');
      }

      // 🆕 项目风格 + 美型程度：在统一风格后追加 beautyLevel 对应的美学提示
      const beautyPrompt = getBeautyLevelPrompt(beautyLevel);
      const stylePrompt = [styleSuffix, beautyPrompt].filter(Boolean).join(', ');

      // 🆕 identitySeed 处理：保持同一角色的脸型一致
      let useSeed: number | undefined = undefined;
      let needSaveSeed = false;
      if (targetForm) {
        // 🔧 形态图：根据一致性策略选择 seed
        if (targetForm.consistencyMode === 'allowTransformation') {
          // 变身形态：使用形态专属 seed（基于 identitySeed + formId 哈希）
          const baseForHash = character.identitySeed || character.id;
          const hashInput = `${baseForHash}_${targetForm.id}`;
          // 简单哈希：将字符串转为数字 seed
          let hash = 0;
          for (let i = 0; i < hashInput.length; i++) {
            hash = ((hash << 5) - hash) + hashInput.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
          }
          useSeed = Math.abs(hash) % 1000000000;
          console.log(`[identitySeed] 变身形态使用专属seed: ${useSeed} (基于 ${hashInput})`);
        } else {
          // 锁定同一人：复用角色的 identitySeed
          if (character.identitySeed) {
            useSeed = character.identitySeed;
            console.log(`[identitySeed] 形态图复用角色seed: ${useSeed}`);
          } else {
            console.warn(`[identitySeed] 警告：角色「${character.name}」没有 identitySeed，形态图可能与常态不一致`);
          }
        }
      } else {
        // 生成常态图：如果已有 identitySeed 则复用，否则生成新的
        if (character.identitySeed) {
          useSeed = character.identitySeed;
          console.log(`[identitySeed] 常态图复用已有seed: ${useSeed}`);
        } else {
          useSeed = Math.floor(Math.random() * 1000000000);
          needSaveSeed = true;
          console.log(`[identitySeed] 常态图生成新seed: ${useSeed}`);
        }
      }

      // 🔍 调试日志：检查风格提示词
      console.log('[风格调试] styleSuffix:', styleSuffix);
      console.log('[风格调试] 最终使用的 stylePrompt:', stylePrompt);

      // 🆕 按照 Nano Banana Pro 官方手册顺序构建提示词
      // 顺序：Subject（主体） → Medium/Style（媒介/风格） → Context/Lighting（场景/光照） → Details（细节）

      // 1️⃣ Subject（主体）：角色关键特征
      // 🆕 三层架构：Identity（骨相） + Baseline Look（默认造型） + Form Delta（形态变化）
      let subjectPrompt: string;
      let formDelta: any = null; // 🆕 修改6-B：提升作用域，供后续 Keep/Apply 模板使用
      let baselineLook: any = null;
      let identityOnly: string = '';

      if (targetForm) {
        // 🔧 形态图：使用三层架构 + LLM 结构化输出 + slot 覆盖合并
        console.log('[三层架构] 开始生成形态图 prompt...');

        // 1. Identity 层：提取骨相结构（不含唇色/妆容）
        identityOnly = await extractKeyAppearanceFeatures(cleanedAppearance, 'identity');
        console.log('[Identity层] 骨相结构:', identityOnly);

        // 2. Baseline Look 层：提取默认造型（唇色/妆容/发型/发色）
        const baselineLookText = await extractKeyAppearanceFeatures(cleanedAppearance, 'baselineLook');
        baselineLook = baselineLookText ? extractJSON(baselineLookText) : null;
        console.log('[Baseline Look层] 默认造型:', baselineLook);

        // 3. Form Delta 层：提取形态变化（唇色/妆容/发型/服装/污渍/外貌变化）
        const formDeltaText = await translateClothingToEnglish(targetForm.description || '', 'form');
        formDelta = formDeltaText ? extractJSON(formDeltaText) : null;
        console.log('[Form Delta层] 形态变化:', formDelta);

        // 🚨 修改C：战损兜底（程序强制注入）
        const damageKeywords = /战损|破损|血迹|脏污|散乱/i;
        const eyeKeywords = /泛红|眼白微红|目光坚定|眼神深沉|目光锐利/i;
        const formNameAndDesc = `${targetForm.name} ${targetForm.description || ''}`;

        if (damageKeywords.test(formNameAndDesc)) {
          console.warn('[战损兜底] 检测到战损关键词，强制注入四要素');

          // 强制注入四要素（如果LLM没有输出）
          if (!formDelta) formDelta = {};

          // 1. 发型散乱
          if (!formDelta.hairStyle) {
            formDelta.hairStyle = 'disheveled hair, messy loose strands, hair slightly disheveled';
            formDelta.hasHairStyleChange = true;
          }

          // 2. 衣物破损 + 血迹 + 脏污
          if (!formDelta.clothing) {
            formDelta.clothing = 'minor tears on clothing, frayed edges, light bloodstains on fabric, light dirt smudges';
          }

          // 3. 轻微脏污
          if (!formDelta.damage) {
            formDelta.damage = 'light dust, light dirt on clothing edges';
          }
        }

        // 眼部外显兜底
        if (eyeKeywords.test(formNameAndDesc)) {
          console.warn('[眼部外显兜底] 检测到眼部外显关键词，强制注入');
          if (!formDelta) formDelta = {};
          if (!formDelta.appearance) {
            const eyeMatches = [];
            if (/泛红|眼白微红/.test(formNameAndDesc)) {
              eyeMatches.push('slightly bloodshot eyes, reddened eyes');
            }
            if (/目光坚定|眼神深沉/.test(formNameAndDesc)) {
              eyeMatches.push('intense, determined gaze');
            }
            if (/目光锐利/.test(formNameAndDesc)) {
              eyeMatches.push('sharp, piercing gaze');
            }
            if (eyeMatches.length > 0) {
              formDelta.appearance = eyeMatches.join(', ');
            }
          }
        }

        console.log('[Form Delta层] 兜底后的形态变化:', formDelta);

        // 4. 合并 slots（优先级：formDelta > baselineLook > identity）
        const mergedSlots = mergeSlots(identityOnly, baselineLook, formDelta);
        // 🌏 人种 slot 前置（形态图-非编辑路径）
        subjectPrompt = ethnicitySlot?.identityEn
          ? [ethnicitySlot.identityEn, mergedSlots].filter(Boolean).join(', ')
          : mergedSlots;
        console.log('[三层架构] 最终 subjectPrompt:', subjectPrompt);
      } else {
        // 常态图：完整特征，人种 slot 前置
        subjectPrompt = ethnicitySlot?.identityEn
          ? [ethnicitySlot.identityEn, identityFeaturesEn].filter(Boolean).join(', ')
          : identityFeaturesEn;
      }

      // 2️⃣ Medium/Style（媒介/风格）：渲染风格
      // 🆕 优化：清理与影棚均匀光冲突的"dramatic lighting"（只影响角色设定图 turnaround）
      let mediumStylePrompt = stylePrompt; // 用户选择的风格（如电影超写实、动漫风格等）
      if (mediumStylePrompt && mediumStylePrompt.includes('dramatic lighting')) {
        // 替换为更中性的棚拍光影描述（保留一点电影感但不冲突）
        mediumStylePrompt = mediumStylePrompt.replace(/dramatic lighting/gi, 'subtle rim light, soft key light');
        console.log('[光照优化] 已将 dramatic lighting 替换为 subtle rim light, soft key light（避免与影棚均匀光冲突）');
      }

      // 3️⃣ Context/Lighting（场景/光照）：白色影棚背景 + 影棚灯光
      const contextLightingPrompt = 'white seamless studio background, pure white backdrop, studio lighting, soft even lighting, professional photography setup, clean white environment';

      // 4️⃣ Details（细节）：服装材质 + 布局 + 表情约束 + 禁止元素
      // 🆕 修改6-D：形态图不使用 clothingDetailsPrompt（避免 JSON 拼接），全部走 Keep/Apply 模板
      let clothingDetailsPrompt = '';
      if (!targetForm) {
        // 常态图：完整服装细节
        clothingDetailsPrompt = clothingKeywordsEn;
      }
      // 形态图：clothingDetailsPrompt 留空，服装信息全部在 Keep/Apply 模板中处理

      const layoutPrompt = '16:9 canvas, 1x4 horizontal grid layout with 4 equal panels, edge-to-edge, consistent character, consistent outfit, consistent face';
      const panelsPrompt = 'Panels from left to right: (1) front full-body standing, (2) side profile full-body, (3) back full-body, (4) face close-up portrait';
      // 🆕 优化：移除 T-pose（会导致衣摆/挂件异常）+ 表情冗余（三连等价）
      const neutralExpressionPrompt = targetForm ? '' : 'neutral expression, relaxed natural standing pose, arms slightly away from torso, reference sheet, character turnaround';
      const noTextPrompt = 'NO text, NO labels, NO numbers, NO watermark, NO logo';

      // 🆕 工具函数：规范化英文句子片段（去掉末尾多余标点，避免拼接时出现 .. 或 .; 等）
      const normalizeSegment = (seg: string): string => {
        if (!seg) return '';
        return seg.trim().replace(/[.;,]+$/, ''); // 去掉末尾的 . ; , 等
      };

      // 🆕 修改6-B：形态图使用 Keep/Apply 编辑模板（所有模型生效）
      let prompt: string;
      if (targetForm && character.imageSheetUrl) {
        // 🔧 形态图 + 有参考图：使用编辑式 prompt
        console.log('[修改6-B] 使用 Keep/Apply 编辑模板');

        // 提取判断标志（默认 false）
        const hasClothingChange = formDelta?.hasClothingChange || false;
        const hasMakeupChange = formDelta?.hasMakeupChange || false;
        const hasHairStyleChange = formDelta?.hasHairStyleChange || false;

        // 构建 Keep UNCHANGED 部分（🌏 人种行最先，确保编辑时不漂移人种）
        const keepUnchangedParts: string[] = [];
        if (ethnicitySlot?.identityEn) {
          keepUnchangedParts.push('- Ethnicity: ' + ethnicitySlot.identityEn);
        }
        keepUnchangedParts.push(
          '- Identity features (face shape, facial structure, bone structure, body proportions): ' + identityOnly,
        );

        // 根据判断标志决定是否保持发型/妆容/服装
        if (!hasHairStyleChange && baselineLook?.hairStyle) {
          keepUnchangedParts.push('- Hairstyle: ' + baselineLook.hairStyle);
        }
        if (!hasMakeupChange && baselineLook?.lipsColor) {
          keepUnchangedParts.push('- Lips color: ' + baselineLook.lipsColor);
        }
        if (!hasClothingChange && clothingKeywordsEn) {
          keepUnchangedParts.push('- Clothing: ' + clothingKeywordsEn);
        }

        // 构建 Apply changes 部分
        const applyChangesParts: string[] = [];
        if (hasHairStyleChange && formDelta?.hairStyle) {
          applyChangesParts.push('- Hairstyle change: ' + formDelta.hairStyle);
        }
        if (hasMakeupChange && formDelta?.makeup) {
          applyChangesParts.push('- Makeup change: ' + formDelta.makeup);
        }
        if (formDelta?.lipsColor) {
          applyChangesParts.push('- Lips color change: ' + formDelta.lipsColor);
        }
        if (hasClothingChange && formDelta?.clothing) {
          applyChangesParts.push('- Clothing change: ' + formDelta.clothing);
        } else if (!hasClothingChange && formDelta?.clothing) {
          // 没有换装，但有战损/污渍 → 在现有服装上添加
          applyChangesParts.push('- Add to existing clothing: ' + formDelta.clothing);
        }
        if (formDelta?.damage) {
          applyChangesParts.push('- Damage/dirt: ' + formDelta.damage);
        }
        if (formDelta?.appearance) {
          applyChangesParts.push('- Appearance changes: ' + formDelta.appearance);
        }

        // 拼接编辑式 prompt
        prompt = [
          'You are editing the provided reference image of the SAME character.',
          '',
          'Keep the following UNCHANGED:',
          ...keepUnchangedParts,
          '',
          'Apply the following changes:',
          ...(applyChangesParts.length > 0 ? applyChangesParts : ['- No changes (keep as reference)']),
          '',
          'Technical requirements:',
          '- ' + mediumStylePrompt,
          '- ' + contextLightingPrompt,
          '- ' + layoutPrompt,
          '- ' + panelsPrompt,
          '- ' + noTextPrompt,
        ].join('\n');

        console.log('[修改6-B] 编辑式 prompt:', prompt);
      } else {
        // 常态图 或 allowTransformation：使用传统描述式 prompt
        prompt = [
          subjectPrompt,              // 1️⃣ Subject（Identity + Delta）
          mediumStylePrompt,          // 2️⃣ Medium/Style
          contextLightingPrompt,      // 3️⃣ Context/Lighting
          clothingDetailsPrompt,      // 4️⃣ Details - 服装材质（仅常态图）
          layoutPrompt,               // 4️⃣ Details - 布局
          panelsPrompt,               // 4️⃣ Details - 分屏说明
          neutralExpressionPrompt,    // 4️⃣ Details - 表情约束（仅常态图）
          noTextPrompt,               // 4️⃣ Details - 禁止元素
        ]
          .filter(Boolean)
          .map(normalizeSegment)      // 🆕 规范化每个片段
          .join('. ');                // 使用句号分隔，更符合英文语法
      }

      // 🔍 调试日志：检查最终提示词（中文信息仅用于日志）
      console.log('[提示词调试] 中文信息（仅日志）:', baseInfoCn);
      console.log('[提示词调试] 最终完整提示词（纯英文）:', prompt);

      const shotNumber = targetForm ? `character_sheet_${characterId}_form_${formId}` : `character_sheet_${characterId}`;

      // 🔧 形态图参考图策略：根据一致性模式决定是否使用常态图
      let referenceImages: string[] = [];
      if (targetForm) {
        if (targetForm.consistencyMode === 'allowTransformation') {
          // 变身形态：不使用参考图，允许彻底变身
          referenceImages = [];
          console.log(`[参考图] 变身形态不使用参考图`);
        } else {
          // 锁定同一人：使用常态图作为参考
          if (character.imageSheetUrl) {
            referenceImages = [character.imageSheetUrl];
            console.log(`[参考图] 形态图使用常态图作为参考: ${character.imageSheetUrl}`);
          } else {
            console.warn(`[参考图] 警告：角色「${character.name}」没有常态图，形态图可能与常态不一致`);
          }
        }
      }

      // 🔧 修正：基于中文【服饰造型】原文判断是否禁止大印花
      // 只在明确"素色/纯色/无印花/无图案"且未提及刺绣/暗纹时，才禁止大印花
      // 🔧 修复：使用完整提取，避免被【内层】截断
      const clothingSection = extractCostumeSection(cleanedAppearance);
      const isSolidColor = /素色|纯色/.test(clothingSection);
      const hasNoPattern = /无印花|无图案|无花纹/.test(clothingSection);
      const hasEmbroidery = /刺绣|暗纹|蕾丝|织物纹理/.test(clothingSection);
      const shouldForbidLargePrint = (isSolidColor || hasNoPattern) && !hasEmbroidery;

      // 🆕 检测是否需要泪痣专用负面词（仅当外观描述中明确提到"泪痣"且为"一颗"时）
      const hasTearMole = /泪痣/.test(cleanedAppearance);
      const isSingleMole = /一颗.*?泪痣|泪痣.*?一颗/.test(cleanedAppearance);
      const shouldAddTearMoleNegative = hasTearMole && isSingleMole;
      if (shouldAddTearMoleNegative) {
        console.log('[泪痣检测] 检测到"一颗泪痣"，已添加泪痣专用负面词');
      }

      // 🆕 构建负面提示词：基础 + 动态大印花禁止 + 泪痣约束 + 形态图专用约束 + 🌏 防错人种
      const negativePrompt = [
        CHARACTER_SHEET_NEGATIVE_PROMPT,
        shouldForbidLargePrint ? CLOTHING_LARGE_PRINT_NEGATIVE_PROMPT : '', // 🔧 只禁止大印花/logo，不禁刺绣
        shouldAddTearMoleNegative ? TEAR_MOLE_NEGATIVE_PROMPT : '', // 🆕 泪痣专用负面词
        targetForm ? FORM_IMAGE_NEGATIVE_PROMPT : '', // 🆕 形态图专用负面词（禁止口红/妆容/夸张表情）
        ethnicitySlot?.negativeEn ?? '', // 🌏 防止人种漂移（目前仅东亚启用，其他族群暂无约束）
        targetForm ? '' : 'smiling, laughing, crying, angry, sad, frowning, action pose, dynamic pose, running, jumping', // 常态图禁止表情和动作
      ].filter(Boolean).join(', ');

      const imageUrls = await generateAndUploadImage(
        {
          prompt,
          negativePrompt,
          modelName: characterImageModel,
          aspectRatio: '16:9',
          numImages: '1',
          outputFormat: 'jpg',
          imageUrls: referenceImages, // 🆕 传入参考图
          seed: useSeed, // 🆕 传入 identitySeed
        },
        project.id,
        shotNumber,
        (stage, percent) => setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage, percent }); return m; }),
        async (taskCode) => {
          // ✅ 任务创建后立即持久化 taskCode（断网/刷新后可恢复）
          createdTaskCode = taskCode;
          createdTaskAt = new Date().toISOString();
          setGenProgressMap(prev => { const m = new Map(prev); m.set(genKey, { stage: '保存任务信息', percent: 15 }); return m; });

          // 🔧 获取模型显示名称和项目生效风格名称
          const modelDisplayName = await getModelDisplayName(characterImageModel);
          const effectiveStyle = getEffectiveCharacterSceneStyle(project);
          const styleDisplayName = effectiveStyle?.id === 'custom'
            ? '自定义风格'
            : (effectiveStyle?.name || '未知风格');

          const metaData = {
            modelName: modelDisplayName,
            styleName: styleDisplayName,
            generatedAt: createdTaskAt, taskCode, taskCreatedAt: createdTaskAt,
          };
          const updatedProject: Project = {
            ...project, updatedAt: new Date().toISOString(),
            characters: (project.characters || []).map(c => {
              if (c.id !== characterId) return c;
              if (targetForm) {
                // 更新形态的 imageGenerationMeta
                return { ...c, forms: (c.forms || []).map(f => f.id === formId ? { ...f, imageGenerationMeta: metaData } : f) };
              }
              // 更新角色主体的 imageGenerationMeta（不清空 imageSheetUrl，保留旧图避免生成失败导致空白）
              return { ...c, imageGenerationMeta: metaData };
            }),
          };
          await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
          try { await patchProject(project.id, { characters: updatedProject.characters }); }
          catch (err) { console.warn('[ProjectDashboard] patchProject(characters) 失败，回退到全量保存:', err); await Promise.resolve(onUpdateProject(updatedProject)); }
        },
        { skipOSSUpload: true }
      );

      const sheetUrl = imageUrls?.[0];
      if (!sheetUrl) throw new Error('未获取到生成图片URL');

      // 🔧 获取模型显示名称和项目生效风格名称
      const modelDisplayName = await getModelDisplayName(characterImageModel);
      const effectiveStyle = getEffectiveCharacterSceneStyle(project);
      const styleDisplayName = effectiveStyle?.id === 'custom'
        ? '自定义风格'
        : (effectiveStyle?.name || '未知风格');

      const finalMeta = {
        modelName: modelDisplayName, styleName: styleDisplayName,
        generatedAt: new Date().toISOString(), taskCode: createdTaskCode || undefined, taskCreatedAt: createdTaskAt || undefined,
      };

      // 🔧 修复：使用 projectRef.current 获取最新的 project 状态（避免并发时覆盖其他形态的数据）
      const latestProject = projectRef.current;
      const updatedProject: Project = {
        ...latestProject, updatedAt: new Date().toISOString(),
        characters: (latestProject.characters || []).map(c => {
          if (c.id !== characterId) return c;
          if (targetForm) {
            // 保存到形态的 imageSheetUrl
            const updatedChar = { ...c, forms: (c.forms || []).map(f => f.id === formId ? { ...f, imageSheetUrl: sheetUrl, imageGenerationMeta: finalMeta } : f) };
            console.log(`[ProjectDashboard] 🔍 更新形态设定图: ${targetLabel}, URL: ${sheetUrl.substring(0, 80)}...`);
            console.log(`[ProjectDashboard] 🔍 更新后的forms:`, updatedChar.forms);
            return updatedChar;
          }
          // 保存到角色主体的 imageSheetUrl + 🆕 保存 identitySeed
          const updatedChar = {
            ...c,
            imageSheetUrl: sheetUrl,
            imageGenerationMeta: { ...finalMeta, taskCode: createdTaskCode || c.imageGenerationMeta?.taskCode, taskCreatedAt: createdTaskAt || c.imageGenerationMeta?.taskCreatedAt }
          };
          // 🆕 如果是首次生成，保存 identitySeed
          if (needSaveSeed && useSeed !== undefined) {
            updatedChar.identitySeed = useSeed;
            console.log(`[identitySeed] 保存到角色「${c.name}」: ${useSeed}`);
          }
          return updatedChar;
        }),
      };

      // 🔧 先持久化到数据库，再更新前端状态
      try {
        await patchProject(project.id, { characters: updatedProject.characters });
        console.log(`[ProjectDashboard] ✅ ${targetForm ? '形态' : '角色'}设定图已保存到数据库: ${targetLabel}`);
      } catch (err) {
        console.warn('[ProjectDashboard] patchProject(characters) 失败，回退到全量保存:', err);
        await saveProject(updatedProject);
      }
      await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
      console.log(`[ProjectDashboard] ✅ ${targetForm ? '形态' : '角色'}设定图已更新到前端状态: ${targetLabel}`);
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

  const handleConfirmUploadCharacterImage = async () => {
    if (!uploadingCharacterId) return;
    if (!uploadImageUrl && !uploadImageFile) {
      alert('请输入图片 URL 或选择本地文件');
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
        character.personality,
        character.visualPromptCn
      ].filter(Boolean).join('\n\n');

      const analysis = await analyzeCharacterImage(
        imageUrl,
        character.name,
        existingDescription
      );

      // 3. 合并分析结果到角色数据
      const updatedCharacter = mergeAnalysisToCharacter(analysis, character);
      updatedCharacter.referenceImageUrl = imageUrl;  // 保存参考图片 URL

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

      alert(`✅ 图片上传成功！\n\nAI 已分析图片并优化了角色描述。\n置信度: ${Math.round(analysis.confidence * 100)}%`);
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
    // 🔧 收集所有需要生成的任务（角色+形态）
    const tasks: { characterId: string; formId?: string; label: string }[] = [];
    for (const char of (project.characters || [])) {
      if (char.forms && char.forms.length > 0) {
        // 有形态的角色：为每个未生成设定图的形态创建任务
        for (const form of char.forms) {
          if (!form.imageSheetUrl) {
            tasks.push({ characterId: char.id, formId: form.id, label: `${char.name} - ${form.name}` });
          }
        }
      } else {
        // 无形态的角色：为角色主体创建任务
        if (!char.imageSheetUrl) {
          tasks.push({ characterId: char.id, label: char.name });
        }
      }
    }

    if (tasks.length === 0) {
      alert('所有角色/形态都已有设定图！');
      return;
    }

    if (!characterImageModel) {
      alert('请先选择生图模型');
      return;
    }

    const confirmGenerate = confirm(
      `将并发生成 ${tasks.length} 个角色/形态的设定图（会消耗积分）。\n\n` +
      `任务列表：\n${tasks.map(t => `• ${t.label}`).join('\n')}\n\n` +
      `是否继续？`
    );
    if (!confirmGenerate) return;

    setIsBatchGeneratingCharacters(true);
    setBatchCharacterProgress({ current: 0, total: tasks.length });

    // 🔧 并发执行所有生成任务
    const results = await Promise.allSettled(
      tasks.map(task => handleGenerateCharacterImageSheet(task.characterId, true, task.formId))
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;
    const failedLabels = tasks.filter((_, i) => results[i].status === 'rejected').map(t => t.label);

    setIsBatchGeneratingCharacters(false);
    setBatchCharacterProgress(null);

    // 显示结果
    let message = `批量生成完成！\n\n`;
    message += `✅ 成功: ${successCount} 个\n`;
    if (failCount > 0) {
      message += `❌ 失败: ${failCount} 个\n\n`;
      message += `失败的角色：\n${failedLabels.map(name => `• ${name}`).join('\n')}`;
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

    // 🆕 严格校验：检查项目是否已设置渲染风格
    if (!hasProjectStyle(project)) {
      alert('⚠️ 请先设置项目风格\n\n项目风格用于角色、场景和分镜的统一视觉呈现。\n请在下方"项目风格设置"区域选择风格后再生成场景设定图。');
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

      // 🆕 使用项目统一风格（而非局部 sceneStyle）
      const projectStyle = getEffectiveCharacterSceneStyle(project);
      const styleSuffix = getStylePromptSuffix(projectStyle);
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
	                  styleName: (() => {
	                    const effectiveStyle = getEffectiveCharacterSceneStyle(project);
	                    return effectiveStyle?.id === 'custom' ? '自定义风格' : (effectiveStyle?.name || '未知风格');
	                  })(),
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
              styleName: (() => {
                const effectiveStyle = getEffectiveCharacterSceneStyle(project);
                return effectiveStyle?.id === 'custom' ? '自定义风格' : (effectiveStyle?.name || '未知风格');
              })(),
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
	                styleName: getEffectiveCharacterSceneStyle(project)?.name || '未知风格',
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
	                styleName: (() => {
	                  const effectiveStyle = getEffectiveCharacterSceneStyle(project);
	                  return effectiveStyle?.id === 'custom' ? '自定义风格' : (effectiveStyle?.name || '未知风格');
	                })(),
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
            aria-hidden="true"
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
        {/* 🆕 项目风格设置 */}
        <div className="glass-card rounded-xl p-5 bg-[var(--color-accent-purple)]/5 border border-[var(--color-accent-purple)]/30">
          <h4 className="text-[14px] font-semibold text-[var(--color-text)] mb-4">🎨 项目风格设置</h4>
          <div className="space-y-4">
            {/* 项目渲染画风选择器 */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">
                项目渲染画风 <span className="text-[var(--color-accent-red)]">*</span>
              </label>
              <select
                aria-label="项目渲染画风"
                value={project.settings?.projectStyleId || ''}
                onChange={async (e) => {
                  const styleId = e.target.value || null;
                  const updatedSettings = {
                    ...project.settings,
                    projectStyleId: styleId,
                    projectStyleCustomPromptCn: styleId === 'custom' ? project.settings?.projectStyleCustomPromptCn || '' : '',
                    projectStyleCustomPromptEn: styleId === 'custom' ? project.settings?.projectStyleCustomPromptEn || '' : '',
                  };
                  const updatedProject = { ...project, settings: updatedSettings, updatedAt: new Date().toISOString() };
                  await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
                  try {
                    await patchProject(project.id, { settings: updatedSettings });
                  } catch (err) {
                    console.warn('[ProjectDashboard] patchProject(settings) 失败:', err);
                    await Promise.resolve(onUpdateProject(updatedProject));
                  }
                }}
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors cursor-pointer"
              >
                <option value="">-- 请选择项目渲染画风 --</option>
                {STORYBOARD_STYLES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value="custom">🎨 自定义风格</option>
              </select>
              <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                {!project.settings?.projectStyleId ? (
                  <span className="text-[var(--color-accent-red)]">⚠️ 必须设置项目风格才能生成角色/场景/分镜</span>
                ) : project.settings.projectStyleId === 'custom' ? (
                  <span className="text-[var(--color-primary)]">✅ 当前使用自定义风格</span>
                ) : (
                  <span className="text-[var(--color-primary)]">✅ 当前使用预设风格</span>
                )}
              </div>
            </div>

            {/* 自定义风格提示词（仅在选择"自定义"时显示） */}
            {project.settings?.projectStyleId === 'custom' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">
                    自定义风格（中文）
                  </label>
                  <input
                    type="text"
                    value={project.settings?.projectStyleCustomPromptCn || ''}
                    onChange={async (e) => {
                      const updatedSettings = { ...project.settings, projectStyleCustomPromptCn: e.target.value };
                      const updatedProject = { ...project, settings: updatedSettings, updatedAt: new Date().toISOString() };
                      await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
                    }}
                    onBlur={async () => {
                      try {
                        await patchProject(project.id, { settings: project.settings });
                      } catch (err) {
                        console.warn('[ProjectDashboard] patchProject(settings) 失败:', err);
                      }
                    }}
                    placeholder="例如：90年代复古港风"
                    className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] placeholder:text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">
                    自定义风格（英文渲染后缀） <span className="text-[var(--color-accent-red)]">*</span>
                  </label>
                  <input
                    type="text"
                    value={project.settings?.projectStyleCustomPromptEn || ''}
                    onChange={async (e) => {
                      const updatedSettings = { ...project.settings, projectStyleCustomPromptEn: e.target.value };
                      const updatedProject = { ...project, settings: updatedSettings, updatedAt: new Date().toISOString() };
                      await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
                    }}
                    onBlur={async () => {
                      try {
                        await patchProject(project.id, { settings: project.settings });
                      } catch (err) {
                        console.warn('[ProjectDashboard] patchProject(settings) 失败:', err);
                      }
                    }}
                    placeholder="例如：Cinematic photography style, photorealistic"
                    className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] placeholder:text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
                  />
                </div>
              </div>
            )}

            {/* 九宫格覆盖风格设置已移除 */}
            {false && <div className="pt-4 border-t border-[var(--color-border)]">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[13px] font-medium text-[var(--color-text-primary)]">
                  九宫格分镜风格覆盖（可选）
                </label>
                <button
                  onClick={async () => {
                    const updatedSettings = {
                      ...project.settings,
                      storyboardStyleOverride: project.settings?.storyboardStyleOverride ? null : { styleId: STORYBOARD_STYLES[0].id },
                    };
                    const updatedProject = { ...project, settings: updatedSettings, updatedAt: new Date().toISOString() };
                    await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
                    try {
                      await patchProject(project.id, { settings: updatedSettings });
                    } catch (err) {
                      console.warn('[ProjectDashboard] patchProject(settings) 失败:', err);
                      await Promise.resolve(onUpdateProject(updatedProject));
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    project.settings?.storyboardStyleOverride
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
                  }`}
                >
                  {project.settings?.storyboardStyleOverride ? '✅ 已启用' : '启用覆盖'}
                </button>
              </div>
              <div className="text-[11px] text-[var(--color-text-tertiary)] mb-3">
                💡 默认情况下，九宫格使用项目风格。如需使用不同风格（如草图、线稿），可启用覆盖。
              </div>

              {/* 覆盖风格选择器（仅在启用时显示） */}
              {project.settings?.storyboardStyleOverride && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">
                      九宫格风格
                    </label>
                    <select
                      aria-label="九宫格风格"
                      value={project.settings.storyboardStyleOverride.styleId}
                      onChange={async (e) => {
                        const styleId = e.target.value;
                        const updatedSettings = {
                          ...project.settings,
                          storyboardStyleOverride: {
                            styleId,
                            customPromptCn: styleId === 'custom' ? project.settings.storyboardStyleOverride?.customPromptCn || '' : undefined,
                            customPromptEn: styleId === 'custom' ? project.settings.storyboardStyleOverride?.customPromptEn || '' : undefined,
                          },
                        };
                        const updatedProject = { ...project, settings: updatedSettings, updatedAt: new Date().toISOString() };
                        await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
                        try {
                          await patchProject(project.id, { settings: updatedSettings });
                        } catch (err) {
                          console.warn('[ProjectDashboard] patchProject(settings) 失败:', err);
                          await Promise.resolve(onUpdateProject(updatedProject));
                        }
                      }}
                      className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors cursor-pointer"
                    >
                      {STORYBOARD_STYLES.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                      <option value="custom">🎨 自定义风格</option>
                    </select>
                  </div>

                  {/* 自定义覆盖风格提示词 */}
                  {project.settings.storyboardStyleOverride.styleId === 'custom' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">
                          自定义风格（中文）
                        </label>
                        <input
                          type="text"
                          value={project.settings.storyboardStyleOverride.customPromptCn || ''}
                          onChange={async (e) => {
                            const updatedSettings = {
                              ...project.settings,
                              storyboardStyleOverride: {
                                ...project.settings.storyboardStyleOverride!,
                                customPromptCn: e.target.value,
                              },
                            };
                            const updatedProject = { ...project, settings: updatedSettings, updatedAt: new Date().toISOString() };
                            await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
                          }}
                          onBlur={async () => {
                            try {
                              await patchProject(project.id, { settings: project.settings });
                            } catch (err) {
                              console.warn('[ProjectDashboard] patchProject(settings) 失败:', err);
                            }
                          }}
                          placeholder="例如：黑白线稿"
                          className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] placeholder:text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">
                          自定义风格（英文渲染后缀）
                        </label>
                        <input
                          type="text"
                          value={project.settings.storyboardStyleOverride.customPromptEn || ''}
                          onChange={async (e) => {
                            const updatedSettings = {
                              ...project.settings,
                              storyboardStyleOverride: {
                                ...project.settings.storyboardStyleOverride!,
                                customPromptEn: e.target.value,
                              },
                            };
                            const updatedProject = { ...project, settings: updatedSettings, updatedAt: new Date().toISOString() };
                            await Promise.resolve(onUpdateProject(updatedProject, { persist: false }));
                          }}
                          onBlur={async () => {
                            try {
                              await patchProject(project.id, { settings: project.settings });
                            } catch (err) {
                              console.warn('[ProjectDashboard] patchProject(settings) 失败:', err);
                            }
                          }}
                          placeholder="例如：Black and white line art sketch"
                          className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] placeholder:text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h3 className="text-[15px] font-semibold text-[var(--color-text)]">👥 角色库 ({project.characters?.length || 0})</h3>
          <button className="btn-primary px-4 py-2 rounded-lg text-[14px]">+ 添加</button>
        </div>

        {/* 🆕 使用说明 - 可折叠 */}
        <div className="glass-card rounded-xl p-4 bg-[var(--color-accent-blue)]/5 border border-[var(--color-accent-blue)]/30">
          <details>
            <summary className="text-[13px] font-medium text-[var(--color-accent-blue)] cursor-pointer select-none">
              💡 角色设定图生成说明（点击展开）
            </summary>
            <div className="mt-3 text-[12px] text-[var(--color-text-secondary)] space-y-3">
              <div>
                <p className="font-medium text-[var(--color-text)]">📝 "编辑角色"：编辑角色基础信息（姓名、性别、外观描述等）</p>
                <ul className="list-disc list-inside ml-2 mt-1.5 space-y-1">
                  <li><strong>外观描述</strong>：用于生成<strong>主形态设定图</strong></li>
                  <li><strong>建议写法</strong>：客观的视觉特征（发型、五官、身材、服饰等）</li>
                  <li><strong>避免写法</strong>：情绪化描述（如"充满血丝和仇恨"会导致生成夸张效果）</li>
                </ul>
              </div>

              <div>
                <p className="font-medium text-[var(--color-text)]">🎭 "编辑形态"：编辑角色的特定形态（如不同服装、变身状态等）</p>
                <ul className="list-disc list-inside ml-2 mt-1.5 space-y-1">
                  <li><strong>visualPromptCn</strong>：用于生成<strong>该形态设定图</strong></li>
                  <li><strong>description</strong>：可以写剧情化描述，但建议同时填写 visualPromptCn</li>
                </ul>
              </div>

              <p className="text-[var(--color-accent-amber)] bg-[var(--color-accent-amber)]/10 px-3 py-2 rounded-lg border border-[var(--color-accent-amber)]/30">
                ⚠️ <strong>重要</strong>：生成设定图时，系统会自动清理情绪化描述，转化为客观视觉特征
              </p>
            </div>
          </details>
        </div>

        {/* 🆕 智能补充选项 */}
        <div className="glass-card rounded-xl p-5 bg-[var(--color-accent-purple)]/5 border border-[var(--color-accent-purple)]/30">
          <h4 className="text-[14px] font-semibold text-[var(--color-text)] mb-4">⚙️ 智能补充选项</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 补充模式选择 */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">补充模式</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSupplementMode('fast')}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                    supplementMode === 'fast'
                      ? 'bg-[var(--color-primary)] text-white shadow-lg'
                      : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]'
                  }`}
                >
                  ⚡ 快速模式
                  <div className="text-[11px] opacity-80 mt-0.5">~30秒</div>
                </button>
                <button
                  onClick={() => setSupplementMode('detailed')}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                    supplementMode === 'detailed'
                      ? 'bg-[var(--color-primary)] text-white shadow-lg'
                      : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]'
                  }`}
                >
                  🎯 详细模式
                  <div className="text-[11px] opacity-80 mt-0.5">~90秒</div>
                </button>
              </div>
              <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                {supplementMode === 'fast' ? '快速生成基础设定，适合快速预览' : '深度思考，生成详细设定，质量更高'}
              </div>
            </div>

            {/* 美型程度选择 */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">美型程度</label>
              <select
                aria-label="美型程度"
                value={beautyLevel}
                onChange={(e) => setBeautyLevel(e.target.value as 'realistic' | 'balanced' | 'idealized')}
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors cursor-pointer"
              >
                <option value="realistic">真实朴素</option>
                <option value="balanced">平衡美型</option>
                <option value="idealized">⭐ 理想美型（推荐）</option>
              </select>
              <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                {beautyLevel === 'realistic' && '适合：纪实、现实题材、农村剧等真实感优先的视频'}
                {beautyLevel === 'balanced' && '适合：都市剧、家庭剧等一般类型的视频'}
                {beautyLevel === 'idealized' && '适合：偶像剧、女频短剧、古装仙侠等对演员颜值要求高的视频（8头身黄金比例）'}
              </div>
            </div>

            {/* 🆕 思维链 LLM 模型选择 */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--color-text-primary)] mb-2">思维链模型</label>
              <select
                aria-label="思维链模型"
                value={supplementModel}
                onChange={(e) => setSupplementModel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[13px] hover:border-[var(--color-border-hover)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors cursor-pointer"
              >
                <option value="google/gemini-2.5-flash">⭐ Gemini 2.5 Flash（默认）</option>
                <option value="openai/gpt-5-mini">GPT-5 Mini</option>
                <option value="google/gemini-3-flash-preview">Gemini 3 Flash Preview</option>
              </select>
              <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                用于角色设计思维链（外貌/服装/形态推理）的 LLM 模型
              </div>
            </div>
          </div>
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

            <div className="flex flex-col gap-2">
              <div className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
                生成内容：单张 16:9 角色设定图（通常为 2×2 四分屏：正/侧/背 + 面部特写）。
              </div>

              {/* 🆕 批量补充按钮 */}
              <button
                onClick={handleBatchSupplementCharacters}
                disabled={isBatchSupplementing || isSupplementing}
                className="btn-secondary w-full px-4 py-2 rounded-lg text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                title="批量补充所有不完整角色的信息"
              >
                {isBatchSupplementing ? (
                  <>⏳ 批量补充中 ({batchSupplementProgress?.current}/{batchSupplementProgress?.total})</>
                ) : (
                  <>✨ 批量补充所有角色信息</>
                )}
              </button>

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
              isSupplementing={supplementingCharacterIds.has(char.id)} // 🔧 检查是否在补充中
              supplementProgress={characterProgressMap.get(char.id) || ''} // 🔧 获取该角色的进度
	              backgroundJobProgress={project.settings?.backgroundJobs?.supplement?.perCharacter?.[char.id]} // 🔧 后台任务进度
	              hasAnyRunningSupplementJob={hasAnyRunningSupplementJob}
              onUploadImage={() => handleUploadCharacterImage(char.id)}
              onGenerateImage={() => handleGenerateCharacterImageSheet(char.id)}
              isGenerating={generatingIds.has(char.id) || [...generatingIds].some((id: string) => id.startsWith(char.id + '_'))}
              generationProgress={genProgressMap.get(char.id) || null}
              onGenerateFormImage={(formId) => handleGenerateCharacterImageSheet(char.id, false, formId)}
              generatingFormIds={[...generatingIds].filter((id: string) => id.startsWith(char.id + '_')).map((id: string) => id.split('_').slice(1).join('_'))}
              formGenProgressMap={Object.fromEntries([...generatingIds].filter((id: string) => id.startsWith(char.id + '_')).map((id: string) => [id.split('_').slice(1).join('_'), genProgressMap.get(id) || { stage: '', percent: 0 }]))}
              openManageMenuId={openManageMenuId}
              setOpenManageMenuId={setOpenManageMenuId}
              handleDeleteForm={handleDeleteForm}
              handleDeleteAllForms={handleDeleteAllForms}
              handleResetCharacter={handleResetCharacter}
              handleDeleteCharacter={handleDeleteCharacter}
              onDeleteFormSummary={handleDeleteFormSummary}
              onGenerateFormDetail={handleGenerateFormDetail}
              onBatchGenerateFormDetail={handleBatchGenerateFormDetail}
              onUpdateFormSummary={handleUpdateFormSummary}
              onAddFormSummary={handleAddFormSummary}
              expandedAppearanceId={expandedAppearanceId}
              setExpandedAppearanceId={setExpandedAppearanceId}
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
                className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
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
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">📤 上传角色图片</h3>

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
                title="上传本地图片"
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

// 🆕 解析外观描述的结构化标记
function parseAppearanceSections(appearance: string | any): { title: string; content: string }[] {
  // 🔧 处理旧数据：如果是对象格式，转换为字符串
  let appearanceStr: string;

  if (typeof appearance === 'object' && appearance !== null) {
    // 旧数据格式：{ mainCharacter, facialFeatures, clothingStyle }
    const parts: string[] = [];
    if (appearance.mainCharacter) {
      parts.push(`【主体人物】\n${appearance.mainCharacter}`);
    }
    if (appearance.facialFeatures) {
      parts.push(`【外貌特征】\n${appearance.facialFeatures}`);
    }
    if (appearance.clothingStyle) {
      parts.push(`【服饰造型】\n${appearance.clothingStyle}`);
    }
    appearanceStr = parts.join('\n\n');
  } else if (typeof appearance === 'string') {
    appearanceStr = appearance;
  } else {
    return [];
  }

  // 🔧 修复：使用"顶层标签"方式提取，避免【服饰造型】被【内层】截断
  // 顶层标签只有3个：主体人物、外貌特征、服饰造型
  const topLevelSections: Record<string, string> = {};
  const topLevelTags = ['主体人物', '外貌特征', '服饰造型'];

  // 为每个顶层标签提取内容（直到下一个顶层标签或EOF）
  for (let i = 0; i < topLevelTags.length; i++) {
    const currentTag = topLevelTags[i];
    const currentPattern = `【${currentTag}】`;
    const startIdx = appearanceStr.indexOf(currentPattern);

    if (startIdx === -1) continue; // 当前标签不存在

    // 找到下一个顶层标签的位置
    let endIdx = appearanceStr.length;
    for (let j = i + 1; j < topLevelTags.length; j++) {
      const nextPattern = `【${topLevelTags[j]}】`;
      const nextIdx = appearanceStr.indexOf(nextPattern, startIdx + currentPattern.length);
      if (nextIdx !== -1) {
        endIdx = nextIdx;
        break;
      }
    }

    // 提取内容（去掉标签本身）
    const content = appearanceStr.slice(startIdx + currentPattern.length, endIdx).trim();
    topLevelSections[currentTag] = content;
  }

  // 如果没有结构化标记，返回原文
  if (Object.keys(topLevelSections).length === 0) {
    return [{ title: '', content: appearanceStr }];
  }

  // 🆕 修改C：强制按固定顺序返回 - 主体人物 → 外貌特征 → 服饰造型
  const orderedSections: { title: string; content: string }[] = [];

  for (const key of topLevelTags) {
    if (topLevelSections[key]) {
      orderedSections.push({
        title: `【${key}】`,
        // 🆕 展示层中文化：替换英文材质词为中文（仅UI展示，不修改数据库）
        // 🔧 修复：【服饰造型】保持为一个整体，包含所有【内层】【中层】【外层】等子标签
        content: replaceEnglishMaterialTerms(topLevelSections[key])
      });
    }
  }

  return orderedSections;
}

// 🆕 新增：提取【服饰造型】完整内容（避免被【内层】截断）
function extractCostumeSection(appearance: string): string {
  const startPattern = '【服饰造型】';
  const startIdx = appearance.indexOf(startPattern);

  if (startIdx === -1) return '';

  // 找到下一个顶层标签（主体人物、外貌特征）或EOF
  const topLevelTags = ['【主体人物】', '【外貌特征】'];
  let endIdx = appearance.length;

  for (const tag of topLevelTags) {
    const nextIdx = appearance.indexOf(tag, startIdx + startPattern.length);
    if (nextIdx !== -1 && nextIdx < endIdx) {
      endIdx = nextIdx;
    }
  }

  return appearance.slice(startIdx + startPattern.length, endIdx).trim();
}

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
	  supplementProgress?: string; // 🔧 该角色的补充进度
	  backgroundJobProgress?: { // 🔧 后台任务进度
	    status: 'queued' | 'running' | 'complete' | 'error';
	    message?: string;
	    stage?: string;
	    progress?: number;
	    errorMessage?: string;
	  };
	  // 项目级补全过程标记：任意角色在跑补全思维链时，用于禁用 AI 角色设计师按钮
	  hasAnyRunningSupplementJob?: boolean;
	  onGenerateImage?: () => void;
  isGenerating?: boolean;
  generationProgress?: { stage: string; percent: number } | null;
  onGenerateFormImage?: (formId: string) => void;
  // 🔧 支持多个形态并发生成
  generatingFormIds?: string[];
  formGenProgressMap?: Record<string, { stage: string; percent: number }>;
  // 🆕 上传角色图片
  onUploadImage?: () => void;
  // 🆕 角色管理功能
  openManageMenuId: string | null;
  setOpenManageMenuId: (id: string | null) => void;
  handleDeleteForm: (characterId: string, formId: string) => void;
  handleDeleteAllForms: (characterId: string) => void;
  handleResetCharacter: (characterId: string) => void;
  handleDeleteCharacter: (characterId: string) => void;
  // 🆕 Phase 1 形态清单操作
  onDeleteFormSummary: (characterId: string, summaryId: string) => void;
  onGenerateFormDetail?: (characterId: string, summaryId: string) => void; // Phase 3 单个展开
  onBatchGenerateFormDetail?: (characterId: string, summaryIds: string[]) => void; // Phase 3 批量展开
  // 🆕 Phase 2 形态元数据编辑 & 手动新增
  onUpdateFormSummary?: (characterId: string, summaryId: string, updates: Partial<FormSummary>) => void;
  onAddFormSummary?: (characterId: string, summary: FormSummary) => void;
  // 🆕 外观描述展开状态
  expandedAppearanceId: string | null;
  setExpandedAppearanceId: (id: string | null) => void;
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
	  supplementProgress, // 🔧 该角色的补充进度
	  backgroundJobProgress, // 🔧 后台任务进度
	  hasAnyRunningSupplementJob,
	  onGenerateImage,
  isGenerating,
  generationProgress,
  onGenerateFormImage,
  generatingFormIds = [],
  formGenProgressMap = {},
  onUploadImage,
  openManageMenuId,
  setOpenManageMenuId,
  handleDeleteForm,
  handleDeleteAllForms,
  handleResetCharacter,
  handleDeleteCharacter,
  onDeleteFormSummary,
  onGenerateFormDetail,
  onBatchGenerateFormDetail,
  onUpdateFormSummary,
  onAddFormSummary,
  expandedAppearanceId,
  setExpandedAppearanceId,
}) => {
  const completenessInfo = completeness !== undefined ? getCompletenessLevel(completeness) : null;

  // 🆕 Phase 3 多选状态（本地）：存储选中的 FormSummary id
  const [selectedSummaryIds, setSelectedSummaryIds] = React.useState<Set<string>>(new Set());

  // 🆕 Phase 2 编辑元数据状态
  const [editingSummaryId, setEditingSummaryId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<Partial<FormSummary>>({});

  // 🆕 Phase 2 手动新增状态
  const [isAddingForm, setIsAddingForm] = React.useState(false);
  const [addDraft, setAddDraft] = React.useState<Partial<FormSummary>>({
    name: '', changeType: 'costume', episodeRange: '', triggerEvent: '', sourceQuote: '',
  });

  const startEditSummary = (summary: FormSummary) => {
    setEditingSummaryId(summary.id);
    setEditDraft({ name: summary.name, changeType: summary.changeType, episodeRange: summary.episodeRange || '', triggerEvent: summary.triggerEvent });
  };

  const saveEditSummary = (summaryId: string) => {
    if (!editDraft.name?.trim()) return;
    onUpdateFormSummary?.(character.id, summaryId, {
      name: editDraft.name.trim(),
      changeType: editDraft.changeType,
      episodeRange: editDraft.episodeRange?.trim() || undefined,
      triggerEvent: editDraft.triggerEvent?.trim() || '',
    });
    setEditingSummaryId(null);
    setEditDraft({});
  };

  const submitAddForm = () => {
    if (!addDraft.name?.trim()) return;
    const newSummary: FormSummary = {
      id: `form-summary-manual-${Date.now()}`,
      name: addDraft.name.trim(),
      changeType: (addDraft.changeType as FormSummary['changeType']) || 'costume',
      episodeRange: addDraft.episodeRange?.trim() || undefined,
      triggerEvent: addDraft.triggerEvent?.trim() || '',
      sourceQuote: addDraft.sourceQuote?.trim() || '',
      status: 'pending',
    };
    onAddFormSummary?.(character.id, newSummary);
    setIsAddingForm(false);
    setAddDraft({ name: '', changeType: 'costume', episodeRange: '', triggerEvent: '', sourceQuote: '' });
  };

  const toggleSummarySelect = (summaryId: string) => {
    setSelectedSummaryIds(prev => {
      const next = new Set(prev);
      next.has(summaryId) ? next.delete(summaryId) : next.add(summaryId);
      return next;
    });
  };

  const selectAllPendingSummaries = () => {
    const pendingIds = (character.formSummaries || [])
      .filter(s => s.status === 'pending' || s.status === 'failed')
      .map(s => s.id);
    setSelectedSummaryIds(new Set(pendingIds));
  };

  const clearSummarySelection = () => setSelectedSummaryIds(new Set());

  // 🆕 normalForm 识别：优先用结构字段，兜底用精确名称匹配
  const normalForm = character.forms?.find(f =>
    (f as any).priority === 100 && (f as any).changeType === 'costume'
  ) || character.forms?.find(f =>
    f.name === '常规状态（完好）'
  );

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* 角色头部信息 */}
      <div className="p-3 cursor-pointer hover:bg-[var(--color-surface-hover)] flex items-center gap-3 transition-colors" onClick={onToggle}>
        {/* 头像 */}
        <div className="w-10 h-10 bg-[var(--color-surface)] rounded-full flex items-center justify-center text-[14px] shrink-0 border-2 border-[var(--color-primary)]/30">
          {character.data ? (
            <img src={character.data} alt={character.name} className="w-full h-full rounded-full object-cover" />
          ) : (character.gender === '女' ? '👩' : '👨')}
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--color-text)] font-medium text-[14px]">{character.name}</span>
            <span className="text-[var(--color-text-tertiary)] text-[12px]">{character.gender}</span>
            {character.forms && character.forms.length > 0 && (
              <span className="text-[var(--color-primary-light)] text-[12px]">({character.forms.length}形态)</span>
            )}
            {/* 完整度指示器 */}
            {completenessInfo && (
              <span className={`text-[12px] ${completenessInfo.color}`} title={`完整度: ${completeness}%`}>
                {completenessInfo.emoji} {completeness}%
              </span>
            )}
          </div>
          {/* 身份演变 */}
          {character.identityEvolution && (
            <p className="text-[var(--color-text-tertiary)] text-[12px] truncate mt-0.5">{character.identityEvolution}</p>
          )}
        </div>

        {/* 能力标签 - 全部显示 */}
        {character.abilities && character.abilities.length > 0 && (
          <div className="flex flex-wrap gap-1 shrink-0 max-w-[200px]">
            {character.abilities.map((a, i) => (
              <span key={i} className="bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] px-2 py-0.5 rounded-md text-[10px] border border-[var(--color-accent-blue)]/30">{a}</span>
            ))}
          </div>
        )}

        {/* 编辑按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-light)] text-[12px] px-1 transition-colors"
          title="编辑角色基础信息（外观描述用于生成主形态设定图）"
        >
          ✏️
        </button>

        {/* 🆕 管理菜单 */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpenManageMenuId(openManageMenuId === character.id ? null : character.id);
            }}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-light)] text-[12px] px-1 transition-colors"
            title="管理角色"
          >
            ⚙️
          </button>

          {openManageMenuId === character.id && (
            <div className="absolute right-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 min-w-[180px]">
              {character.forms && character.forms.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAllForms(character.id);
                  }}
                  className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-colors"
                >
                  🗑️ 删除所有形态 ({character.forms.length}个)
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetCharacter(character.id);
                }}
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-colors"
              >
                🔄 重置角色
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCharacter(character.id);
                }}
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--color-surface-hover)] text-red-400 transition-colors border-t border-[var(--color-border)]"
              >
                ❌ 删除角色
              </button>
            </div>
          )}
        </div>

        {/* 上传角色图片按钮 */}
        {onUploadImage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUploadImage();
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
            title="上传角色图片并AI分析"
          >
            📤 上传图片
          </button>
        )}

        {/* 生成角色设定图 - 始终显示主体生成按钮 */}
        {onGenerateImage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerateImage();
            }}
            disabled={!!isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-[13px] font-medium disabled:cursor-not-allowed transition-colors"
            title={character.imageSheetUrl ? '重新生成角色设定图' : '生成角色设定图'}
          >
            {isGenerating ? '⏳ 生成中...' : (character.imageSheetUrl ? '🔄 重新生成' : '🎨 生成设定图')}
          </button>
        )}


        <span className="text-[var(--color-text-tertiary)] text-[12px]">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {/* 🆕 后台补充进度 */}
      {backgroundJobProgress && (
        <div className={`border-t border-[var(--color-border)] p-3 text-[11px] ${
          backgroundJobProgress.status === 'queued' ? 'bg-yellow-900/20' :
          backgroundJobProgress.status === 'running' ? 'bg-blue-900/20' :
          backgroundJobProgress.status === 'complete' ? 'bg-green-900/20' :
          'bg-red-900/20'
        }`}>
          {/* 排队中 */}
          {backgroundJobProgress.status === 'queued' && (
            <div className="text-yellow-300">⏳ 等待补全...</div>
          )}

          {/* 运行中 */}
          {backgroundJobProgress.status === 'running' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-blue-300">
                  🔄 {backgroundJobProgress.stage || '正在补充'}
                  {backgroundJobProgress.message && ` - ${backgroundJobProgress.message}`}
                </span>
                {backgroundJobProgress.progress !== undefined && (
                  <span className="text-[var(--color-text-tertiary)]">{Math.round(backgroundJobProgress.progress)}%</span>
                )}
              </div>
              {backgroundJobProgress.progress !== undefined && (
                <div className="mt-1.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${Math.max(0, Math.min(100, backgroundJobProgress.progress))}%` }}
                  />
                </div>
              )}
            </>
          )}

          {/* 完成 */}
          {backgroundJobProgress.status === 'complete' && (
            <div className="text-green-300">✅ 补全完成</div>
          )}

          {/* 错误 */}
          {backgroundJobProgress.status === 'error' && (
            <div>
              <div className="text-red-300">❌ 补全失败</div>
              {backgroundJobProgress.errorMessage && (
                <div className="text-[var(--color-text-tertiary)] mt-1">{backgroundJobProgress.errorMessage}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 生成进度 - 始终显示主体生成进度 */}
      {isGenerating && generationProgress && (
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

      {/* 设定图预览 - 始终显示主体设定图 */}
      {character.imageSheetUrl && (
        <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
          <div className="text-[11px] text-[var(--color-text-tertiary)] mb-2">🎨 常规状态设定图</div>
          <img
            src={character.imageSheetUrl}
            alt={`${character.name} 设定图`}
            className="w-full rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] object-contain max-h-[320px]"
            loading="lazy"
          />
          {character.imageGenerationMeta && (
            <div className="mt-1.5 text-[10px] text-[var(--color-text-tertiary)]">
              模型：{character.imageGenerationMeta.modelName} · 风格：{character.imageGenerationMeta.styleName}
            </div>
          )}
        </div>
      )}

      {/* 🆕 外观描述 - 结构化显示（默认展开）*/}
      {(() => {
        // 🆕 修改2：补全中显示骨架屏，而不是完全隐藏
        const isBackgroundJobRunning = backgroundJobProgress &&
          (backgroundJobProgress.status === 'queued' || backgroundJobProgress.status === 'running');

        if (isBackgroundJobRunning || isSupplementing) {
          // 🆕 修改2：显示骨架屏，显示各段落的生成状态
          const appearance = character.appearance || '';
          const hasMainSubject = appearance.includes('【主体人物】');
          const hasAppearanceFeatures = appearance.includes('【外貌特征】');
          const hasCostume = appearance.includes('【服饰造型】');

          return (
            <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
              <div className="text-[11px] text-[var(--color-text-tertiary)] mb-2">📝 外观描述（生成中...）</div>
              <div className="space-y-2 text-[11px]">
                <div className={`p-2 rounded ${hasMainSubject ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-500/10 border border-gray-500/30 animate-pulse'}`}>
                  <div className="text-[var(--color-accent-blue)] font-medium mb-0.5">
                    {hasMainSubject ? '✅ 【主体人物】已完成' : '⏳ 【主体人物】生成中...'}
                  </div>
                  {hasMainSubject && (
                    <p className="text-[var(--color-text-secondary)] leading-relaxed">
                      {appearance.match(/【主体人物】([^【]*)/)?.[1]?.trim() || ''}
                    </p>
                  )}
                </div>
                <div className={`p-2 rounded ${hasAppearanceFeatures ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-500/10 border border-gray-500/30 animate-pulse'}`}>
                  <div className="text-[var(--color-accent-blue)] font-medium mb-0.5">
                    {hasAppearanceFeatures ? '✅ 【外貌特征】已完成' : '⏳ 【外貌特征】等待中...'}
                  </div>
                  {hasAppearanceFeatures && (
                    <p className="text-[var(--color-text-secondary)] leading-relaxed">
                      {appearance.match(/【外貌特征】([^【]*)/)?.[1]?.trim() || ''}
                    </p>
                  )}
                </div>
                <div className={`p-2 rounded ${hasCostume ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-500/10 border border-gray-500/30 animate-pulse'}`}>
                  <div className="text-[var(--color-accent-blue)] font-medium mb-0.5">
                    {hasCostume ? '✅ 【服饰造型】已完成' : '⏳ 【服饰造型】等待中...'}
                  </div>
                  {hasCostume && (
                    <p className="text-[var(--color-text-secondary)] leading-relaxed">
                      {appearance.match(/【服饰造型】([^【]*)/)?.[1]?.trim() || ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        }

        // 🔧 normalForm 已在组件顶部定义，这里直接使用
        // 🆕 修改C：优先级调整 - character.appearance（CoT基底）优先，forms 仅兜底
        const displayAppearance = character.appearance || normalForm?.appearance || normalForm?.description;
        const displayLabel = normalForm ? `📝 外观描述（${normalForm.name}）` : '📝 外观描述（常规完好基底）';

        if (!displayAppearance) return null;

        return (
          <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
            <div className="text-[11px] text-[var(--color-text-tertiary)] mb-2">{displayLabel}</div>
            <div className="space-y-2 text-[11px]">
              {parseAppearanceSections(displayAppearance).map((section, i) => (
                <div key={i}>
                  {section.title && (
                    <div className="text-[var(--color-accent-blue)] font-medium mb-0.5">{section.title}</div>
                  )}
                  <p className="text-[var(--color-text-secondary)] leading-relaxed">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 缺失字段提示和智能补充按钮 */}
      {(() => {
        // 🔧 CoT 进行中时隐藏缺失字段区
        const isBackgroundJobRunning = backgroundJobProgress &&
          (backgroundJobProgress.status === 'queued' || backgroundJobProgress.status === 'running');

        if (isBackgroundJobRunning) {
          return null;
        }

        if (!missingFields || missingFields.length === 0 || completeness === undefined) {
          return null;
        }

        return (
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
	                  disabled={isSupplementing || !!hasAnyRunningSupplementJob}
	                  className="btn-secondary px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 disabled:opacity-50"
	                  title={
	                    hasAnyRunningSupplementJob && !isSupplementing
	                      ? '已有其他角色正在运行 AI 角色设计师，请等待当前任务完成后再触发'
	                      : (completeness < 85
	                          ? '使用AI角色设计师补充角色细节（主角已自动设计，其他角色可手动触发）'
	                          : '继续优化角色信息')
	                  }
                >
                  {isSupplementing
                    ? (supplementProgress || '⏳ 设计中...')
                    : (completeness < 85 ? '🎨 AI 角色设计师' : '🔄 继续设计')}
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
                    className={`px-2 py-0.5 rounded-md text-[10px] ${
                      isFormField
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
        );
      })()}

      {/* 形态列表 - 始终显示（不需要点击展开） */}
      {(() => {
        // 🔧 CoT 进行中时隐藏 forms 区
        const isBackgroundJobRunning = backgroundJobProgress &&
          (backgroundJobProgress.status === 'queued' || backgroundJobProgress.status === 'running');

        if (isBackgroundJobRunning) {
          return null;
        }

        if (!character.forms || character.forms.length === 0) {
          return null;
        }

        return (
          <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
            <div className="grid grid-cols-1 gap-3">
              {character.forms
                .filter(form => form.id !== normalForm?.id) // 🔧 过滤掉常规态（已在外观描述区展示）
                .map((form) => {
                const isFormGenerating = generatingFormIds.includes(form.id);
                const currentFormProgress = formGenProgressMap[form.id] || null;
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
                        {/* 上传形态图片按钮 */}
                        {onUploadImage && (
                          <button
                            onClick={() => {
                              onUploadImage(form.id);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors"
                            title="上传形态图片并AI分析"
                          >
                            📤 上传图片
                          </button>
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
                          title="编辑形态信息（visualPromptCn用于生成该形态设定图）"
                        >
                          ✏️
                        </button>
                        {/* 🆕 删除形态按钮 */}
                        <button
                          onClick={() => handleDeleteForm(character.id, form.id)}
                          className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-red-400 text-[11px] transition-all"
                          title="删除形态"
                        >
                          🗑️
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
                        className="w-full rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] object-contain max-h-[200px]"
                        loading="lazy"
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
        );
      })()}

      {/* 🆕 Phase 1 形态清单 - 待用户审查 */}
      {(() => {
        // CoT 进行中时隐藏
        const isBackgroundJobRunning = backgroundJobProgress &&
          (backgroundJobProgress.status === 'queued' || backgroundJobProgress.status === 'running');
        if (isBackgroundJobRunning) return null;

        const summaries = character.formSummaries;
        if (!summaries || summaries.length === 0) return null;

        // changeType 对应图标
        const changeTypeIcon: Record<string, string> = {
          costume: '👗',
          makeup: '💄',
          damage: '🩹',
          transformation: '✨',
        };

        const pendingCount = summaries.filter(s => s.status === 'pending' || s.status === 'failed').length;
        const hasSelection = selectedSummaryIds.size > 0;

        return (
          <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-[11px] font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5 min-w-0">
                🔍 形态清单
                <span className="shrink-0 bg-[var(--color-accent-violet)]/10 text-[var(--color-accent-violet)] border border-[var(--color-accent-violet)]/30 px-1.5 py-0.5 rounded text-[10px]">
                  Phase 1 · 共 {summaries.length} 个
                </span>
              </span>
              {/* 右侧操作区 */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* 🆕 手动新增按钮 */}
                {onAddFormSummary && (
                  <button
                    onClick={() => { setIsAddingForm(v => !v); setEditingSummaryId(null); }}
                    className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-green)] transition-colors px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-green)]/40"
                    title="手动新增一个形态"
                  >
                    {isAddingForm ? '✕ 取消' : '＋ 新增'}
                  </button>
                )}
                {/* 批量操作区 */}
                {onBatchGenerateFormDetail && pendingCount > 0 && (
                  <>
                    <button
                      onClick={hasSelection ? clearSummarySelection : selectAllPendingSummaries}
                      className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-violet)] transition-colors px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-violet)]/40"
                      title={hasSelection ? '取消全选' : `全选 ${pendingCount} 个待生成形态`}
                    >
                      {hasSelection ? `✕ 取消(${selectedSummaryIds.size})` : `☑ 全选(${pendingCount})`}
                    </button>
                    {hasSelection && (
                      <button
                        onClick={() => {
                          onBatchGenerateFormDetail(character.id, [...selectedSummaryIds]);
                          clearSummarySelection();
                        }}
                        disabled={!!hasAnyRunningSupplementJob}
                        className="text-[10px] bg-[var(--color-accent-violet)]/80 hover:bg-[var(--color-accent-violet)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 py-0.5 rounded font-medium transition-colors"
                        title={hasAnyRunningSupplementJob ? 'AI 正在处理中，请稍后' : `批量展开设计 ${selectedSummaryIds.size} 个形态（最多2个并发）`}
                      >
                        🎨 批量展开({selectedSummaryIds.size})
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {summaries.map((summary) => {
                const icon = changeTypeIcon[summary.changeType] || '🎭';
                const isPending = summary.status === 'pending';
                const isGenerating = summary.status === 'generating';
                const isGenerated = summary.status === 'generated';
                const isFailed = summary.status === 'failed';
                const isSelectable = isPending || isFailed;
                const isSelected = selectedSummaryIds.has(summary.id);
                const isEditing = editingSummaryId === summary.id;

                return (
                  <div
                    key={summary.id}
                    className={`bg-[var(--color-surface-solid)] rounded-lg p-2.5 text-[12px] group relative border transition-colors ${
                      isEditing
                        ? 'border-[var(--color-accent-green)]/60 ring-1 ring-[var(--color-accent-green)]/20'
                        : isSelected
                        ? 'border-[var(--color-accent-violet)]/70 ring-1 ring-[var(--color-accent-violet)]/30'
                        : 'border-[var(--color-accent-violet)]/20 hover:border-[var(--color-accent-violet)]/40'
                    }`}
                  >
                    {isEditing ? (
                      /* ──── 内嵌编辑表单 ──── */
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={editDraft.name || ''}
                            onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                            placeholder="形态名称"
                            className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent-green)]/60"
                          />
                          <select
                            value={editDraft.changeType || 'costume'}
                            onChange={e => setEditDraft(d => ({ ...d, changeType: e.target.value as FormSummary['changeType'] }))}
                            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent-green)]/60"
                          >
                            <option value="costume">👗 换装</option>
                            <option value="makeup">💄 妆容</option>
                            <option value="damage">🩹 战损</option>
                            <option value="transformation">✨ 变身</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          value={editDraft.episodeRange || ''}
                          onChange={e => setEditDraft(d => ({ ...d, episodeRange: e.target.value }))}
                          placeholder="集数范围（选填，如 Ep.12-15）"
                          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent-green)]/60"
                        />
                        <input
                          type="text"
                          value={editDraft.triggerEvent || ''}
                          onChange={e => setEditDraft(d => ({ ...d, triggerEvent: e.target.value }))}
                          placeholder="触发事件（如：首次出征换上战甲）"
                          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent-green)]/60"
                        />
                        <div className="flex gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => saveEditSummary(summary.id)}
                            disabled={!editDraft.name?.trim()}
                            className="px-2.5 py-0.5 rounded text-[10px] bg-[var(--color-accent-green)]/80 hover:bg-[var(--color-accent-green)] disabled:opacity-50 text-white font-medium transition-colors"
                          >
                            ✓ 保存
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingSummaryId(null); setEditDraft({}); }}
                            className="px-2.5 py-0.5 rounded text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ──── 普通显示模式 ──── */
                      <>
                        {/* 第一行：复选框 + 形态名 + 状态徽标 + 集数 + 操作按钮 */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isSelectable && onBatchGenerateFormDetail ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSummarySelect(summary.id)}
                                className="shrink-0 accent-[var(--color-accent-violet)] cursor-pointer"
                                title="选择此形态加入批量展开"
                              />
                            ) : (
                              <span className="shrink-0">{icon}</span>
                            )}
                            {isSelectable && onBatchGenerateFormDetail && (
                              <span className="shrink-0">{icon}</span>
                            )}
                            <span className="text-[var(--color-text)] font-medium truncate">{summary.name}</span>
                            {isPending && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-accent-amber)]/10 text-[var(--color-accent-amber)] border border-[var(--color-accent-amber)]/30">待生成</span>
                            )}
                            {isGenerating && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30">⏳ 生成中</span>
                            )}
                            {isGenerated && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-accent-green)]/10 text-[var(--color-accent-green)] border border-[var(--color-accent-green)]/30">✅ 已完成</span>
                            )}
                            {isFailed && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/30">❌ 失败</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {summary.episodeRange && (
                              <span className="bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] px-1.5 py-0.5 rounded text-[10px] border border-[var(--color-accent-blue)]/30">
                                {summary.episodeRange}
                              </span>
                            )}
                            {/* 编辑按钮 */}
                            {onUpdateFormSummary && !isGenerating && (
                              <button
                                type="button"
                                onClick={() => { startEditSummary(summary); setIsAddingForm(false); }}
                                className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-green)] text-[11px] transition-all"
                                title="编辑此形态的元数据"
                              >
                                ✏️
                              </button>
                            )}
                            {/* Phase 3 展开设计 / 重新生成按钮 */}
                            <button
                              type="button"
                              onClick={() => onGenerateFormDetail?.(character.id, summary.id)}
                              disabled={!onGenerateFormDetail || isGenerating || !!hasAnyRunningSupplementJob}
                              className={`opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded text-[10px] font-medium disabled:cursor-not-allowed transition-all
                                ${isGenerated
                                  ? 'bg-amber-600/80 hover:bg-amber-600 disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-tertiary)] text-white'
                                  : 'bg-[var(--color-accent-violet)]/80 hover:bg-[var(--color-accent-violet)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-tertiary)] text-white'
                                }`}
                              title={isGenerating ? '正在生成形态设定...' : hasAnyRunningSupplementJob ? 'AI 正在处理其他任务，请稍后' : isGenerated ? '重新生成：覆盖当前形态设定（不会产生重复卡片）' : '展开设计：为此形态生成完整外貌与服装设定'}
                            >
                              {isGenerating ? '⏳' : isGenerated ? '🔄 重新生成' : '🎨 展开设计'}
                            </button>
                            {/* 删除按钮 */}
                            <button
                              type="button"
                              onClick={() => onDeleteFormSummary(character.id, summary.id)}
                              className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-red-400 text-[11px] transition-all"
                              title="从清单中移除此形态"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        {summary.triggerEvent && (
                          <p className="text-[var(--color-text-secondary)] text-[11px] leading-relaxed mb-1">🎬 {summary.triggerEvent}</p>
                        )}
                        {summary.sourceQuote && (
                          <p className="text-[var(--color-text-tertiary)] text-[10px] italic leading-relaxed line-clamp-2" title={summary.sourceQuote}>
                            「{summary.sourceQuote}」
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {/* 🆕 手动新增表单（在列表底部展开） */}
              {isAddingForm && onAddFormSummary && (
                <div className="bg-[var(--color-surface-solid)] rounded-lg p-2.5 border border-[var(--color-accent-green)]/50 ring-1 ring-[var(--color-accent-green)]/15 space-y-1.5">
                  <p className="text-[10px] text-[var(--color-accent-green)] font-medium mb-1.5">＋ 手动新增形态</p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={addDraft.name || ''}
                      onChange={e => setAddDraft(d => ({ ...d, name: e.target.value }))}
                      placeholder="形态名称（必填）"
                      className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent-green)]/60"
                    />
                    <select
                      value={addDraft.changeType || 'costume'}
                      onChange={e => setAddDraft(d => ({ ...d, changeType: e.target.value as FormSummary['changeType'] }))}
                      className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent-green)]/60"
                    >
                      <option value="costume">👗 换装</option>
                      <option value="makeup">💄 妆容</option>
                      <option value="damage">🩹 战损</option>
                      <option value="transformation">✨ 变身</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={addDraft.episodeRange || ''}
                    onChange={e => setAddDraft(d => ({ ...d, episodeRange: e.target.value }))}
                    placeholder="集数范围（选填，如 Ep.12-15）"
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent-green)]/60"
                  />
                  <input
                    type="text"
                    value={addDraft.triggerEvent || ''}
                    onChange={e => setAddDraft(d => ({ ...d, triggerEvent: e.target.value }))}
                    placeholder="触发事件（如：首次出征换上战甲）"
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent-green)]/60"
                  />
                  <input
                    type="text"
                    value={addDraft.sourceQuote || ''}
                    onChange={e => setAddDraft(d => ({ ...d, sourceQuote: e.target.value }))}
                    placeholder="剧本原文依据（选填，50字内）"
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent-green)]/60"
                  />
                  <div className="flex gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={submitAddForm}
                      disabled={!addDraft.name?.trim()}
                      className="px-2.5 py-0.5 rounded text-[10px] bg-[var(--color-accent-green)]/80 hover:bg-[var(--color-accent-green)] disabled:opacity-50 text-white font-medium transition-colors"
                    >
                      ✓ 添加
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAddingForm(false); setAddDraft({ name: '', changeType: 'costume', episodeRange: '', triggerEvent: '', sourceQuote: '' }); }}
                      className="px-2.5 py-0.5 rounded text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
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
              className={`glass-card rounded-xl p-4 cursor-pointer transition-all hover:border-[var(--color-border-hover)] group ${
                isExpanded ? 'col-span-1 md:col-span-2 xl:col-span-3 ring-1 ring-[var(--color-primary)]/50' : ''
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

