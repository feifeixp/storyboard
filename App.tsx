
import React, { useState, useRef, useEffect } from 'react';
import { AppStep, Shot, ReviewSuggestion, CharacterRef, CharacterForm, STORYBOARD_STYLES, StoryboardStyle, createCustomStyle, ScriptCleaningResult, EditTab, AngleDirection, AngleHeight } from './types';
import type { FormSummary } from './services/characterSupplement/types';
import { StepTracker } from './components/StepTracker';
import Login from './components/Login';
import { isLoggedIn, logout, getUserInfo, getUserPoints, type PointsInfo } from './services/auth';
import { isBaselineStateName, normalizeStateName } from './services/utils/stateNameUtils';  // 🆕 导入 baseline 判断工具
// 使用 OpenRouter 统一 API（支持多模型切换）
import {
  generateShotListStream,
  reviewStoryboardOpenRouter as reviewStoryboard,
  optimizeShotListStream,
  chatEditShotListStream,
  chatWithDirectorStream,
  generateMergedStoryboardSheet,
  extractImagePromptsStream,
  cleanScriptStream,
  extractCharactersFromScript,
  detectArtStyleType,  // 🆕 美术风格检测
  MODELS,
  // 思维链API
  generateStage1Analysis,
  generateStage2Analysis,
  generateStage3Analysis,
  generateStage4Analysis,
  generateStage5Review,
  parseStage1Output,
  parseStage2Output,
  parseStage3Output,
  parseStage4Output,
  parseStage5Output
} from './services/openrouter';
// 🆕 提示词校验工具
import {
  validateShotPrompts,
  detectForbiddenTerms,
  validateKeyframeConsistency,
  determineVideoMode,
  generateValidationSummary,
  type ShotPromptValidation,
  type VideoModeDecision
} from './services/promptValidation';
// 🆕 角度分布校验工具
import {
  validateAngleDistribution,
  generateAngleDistributionReport
} from './services/angleValidation';
import { ModelSelector, IMAGE_GENERATION_MODELS, MODEL_CAPABILITIES, getModelCapabilityHint } from './components/ModelSelector';
import { SuggestionDetailModal } from './components/SuggestionDetailModal';
// 思维链类型
import type { ScriptAnalysis, VisualStrategy, ShotPlanning, ShotDesign, QualityCheck } from './prompts/chain-of-thought/types';
import type { ShotListItem } from './prompts/chain-of-thought/stage4-shot-design';

// 🆕 项目管理
import { Project, Episode, ScriptFile, ProjectAnalysisResult, PROJECT_MEDIA_TYPES } from './types/project';
import { ProjectList } from './components/ProjectList';
import { ProjectWizard } from './components/ProjectWizard';
import { ProjectDashboard } from './components/ProjectDashboard';
import { FinalStoryboard } from './components/FinalStoryboard';
// 🆕 剧本模板导出
import { exportScriptTemplate } from './services/scriptTemplateExport';
import {
  getAllProjects,
  saveProject,
  saveEpisode,
  patchEpisode,
  patchProject,  // 🆕 用于后台任务状态更新
  deleteProject,
  getCurrentProjectId,
  setCurrentProjectId,
  getProject,
  getEpisode,  // 🔧 获取单个剧集完整数据
} from './services/d1Storage';
// 🆕 角色补充服务
import { autoSupplementMainCharacters } from './services/characterSupplement/autoSupplement';
import { identifyMainCharacters } from './services/characterSupplement/identifyMainCharacters';
import type { BeautyLevel } from './services/characterSupplement/types';
import { getBeautyLevelByGenre } from './services/characterSupplement/getBeautyLevelByGenre';
import { getGenerationResult, pollGenerationResult, TaskStatus } from './services/aiImageGeneration';
import { analyzeProjectScriptsWithProgress, analyzeProjectScripts } from './services/projectAnalysis';
import { BatchAnalysisProgress } from './types/project';
// 🆕 本集概述生成
import { generateEpisodeSummary } from './services/episodeSummaryGenerator';
import { EpisodeSummaryPanel } from './components/EpisodeSummaryPanel';
// 🆕 风格设置工具
import { hasProjectStyle, getEffectiveStoryboardStyle } from './services/styleSettings';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 🆕 localStorage 持久化 Key
const STORAGE_KEYS = {
  CURRENT_STEP: 'storyboard_current_step',
  CURRENT_EPISODE_NUMBER: 'storyboard_current_episode_number',  // 🔧 新增：当前剧集编号
  SCRIPT: 'storyboard_script',
  SHOTS: 'storyboard_shots',
  CHARACTER_REFS: 'storyboard_character_refs',
  CHAT_HISTORY: 'storyboard_chat_history',
  SELECTED_STYLE: 'storyboard_selected_style',
  CUSTOM_STYLE_PROMPT: 'storyboard_custom_style_prompt',
  HQ_URLS: 'storyboard_hq_urls',
  // 思维链状态
  COT_STAGE1: 'storyboard_cot_stage1',
  COT_STAGE2: 'storyboard_cot_stage2',
  COT_STAGE3: 'storyboard_cot_stage3',
  COT_STAGE4: 'storyboard_cot_stage4',
  COT_STAGE5: 'storyboard_cot_stage5',
  // 🆕 剧本清洗状态
  CLEANING_RESULT: 'storyboard_cleaning_result',
  CLEANING_PROGRESS: 'storyboard_cleaning_progress',
};

// 🆕 从 localStorage 安全读取数据
const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn(`[localStorage] 读取失败: ${key}`, e);
  }
  return defaultValue;
};

// 🆕 保存到 localStorage
const saveToStorage = (key: string, value: any) => {
  try {
    const jsonString = JSON.stringify(value);

    // 🆕 检查数据大小（localStorage 限制通常为 5-10MB）
    const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);

    if (sizeInMB > 5) {
      console.warn(`[localStorage] 数据过大 (${sizeInMB.toFixed(2)}MB)，跳过保存: ${key}`);
      console.warn(`[localStorage] 建议：不要将大量图片数据存储到 localStorage`);
      return;
    }

    localStorage.setItem(key, jsonString);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn(`[localStorage] 存储空间不足，跳过保存: ${key}`);
      console.warn(`[localStorage] 建议：清理旧数据或使用 IndexedDB`);
    } else {
      console.warn(`[localStorage] 保存失败: ${key}`, e);
    }
  }
};

const App: React.FC = () => {
  // ═══════════════════════════════════════════════════════════════
  // 🆕 用户认证检查
  // ═══════════════════════════════════════════════════════════════
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [userPoints, setUserPoints] = useState<PointsInfo | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // 🆕 项目管理状态（必须在条件返回之前声明所有Hooks）
  // ═══════════════════════════════════════════════════════════════
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const projectRef = useRef<Project | null>(null); // 🔧 用于在闭包中访问最新项目状态
  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number | null>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENT_EPISODE_NUMBER, null)  // 🔧 从 localStorage 恢复
  );

  // 🆕 从 localStorage 恢复状态（项目模式下从项目加载）
  const [currentStep, setCurrentStep] = useState<AppStep>(() => {
    // 检查是否有当前项目
    const id = getCurrentProjectId();
    const savedStep = loadFromStorage(STORAGE_KEYS.CURRENT_STEP, null);

    // 如果有当前项目且有保存的步骤，恢复到那个步骤
    if (id && savedStep && savedStep !== AppStep.PROJECT_LIST && savedStep !== AppStep.PROJECT_WIZARD) {
      return savedStep;
    }

    // 否则默认显示项目列表
    return AppStep.PROJECT_LIST;
  });
  const [script, setScript] = useState(() =>
    loadFromStorage(STORAGE_KEYS.SCRIPT, '')
  );

  // 🆕 默认角色（用于首次加载）
  const DEFAULT_CHARACTERS: CharacterRef[] = [
    {
      id: 'preset-jinan',
      name: '晋安',
      gender: '男',
      appearance: '【外貌特征】浅棕色碎短发、发型蓬松有层次感，深棕色狭长眼眸、五官清爽利落、表情平静（略带清冷感），身形高挑纤瘦、肤色白皙、少年感体态\n【主体人物】日系动漫风格年轻男性（高中生/大学生形象），二次元少年、清瘦修长的身形、简约干净的气质',
    },
    {
      id: 'preset-linxi',
      name: '林溪',
      gender: '女',
      appearance: '【外貌特征】黑色长发（带有棕色渐变）、自然垂落且发丝飘逸，棕色/深褐色杏眼、五官精致柔和、表情略带羞涩/无辜感，身形纤细、腿部线条修长\n【主体人物】日系动漫风格年轻女性（高中生形象），二次元美少女、白皙肌肤、比例修长的少女体态',
    },
  ];

  const [characterRefs, setCharacterRefs] = useState<CharacterRef[]>(() =>
    loadFromStorage(STORAGE_KEYS.CHARACTER_REFS, DEFAULT_CHARACTERS)
  );
  const [shots, setShots] = useState<Shot[]>(() =>
    loadFromStorage(STORAGE_KEYS.SHOTS, [])
  );
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<ReviewSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [newCharName, setNewCharName] = useState('');
  const [newCharAppearance, setNewCharAppearance] = useState('');
  const [newCharGender, setNewCharGender] = useState<'男' | '女' | '未知'>('未知');
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');

  // 🆕 Tab切换状态
  const [currentTab, setCurrentTab] = useState<EditTab>('generate');

  // Chat / Edit State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() =>
    loadFromStorage(STORAGE_KEYS.CHAT_HISTORY, [])
  );

  // State for Step 4 Images
  const [hqUrls, setHqUrls] = useState<string[]>([]);

  // Upload Dialog State
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadGridIndex, setUploadGridIndex] = useState<number | null>(null);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Model Selection State
  const [analysisModel, setAnalysisModel] = useState(MODELS.GEMINI_3_FLASH_PREVIEW);
  const [reviewModel, setReviewModel] = useState(MODELS.GEMINI_3_FLASH_PREVIEW);
  const [editModel, setEditModel] = useState(MODELS.GEMINI_3_FLASH_PREVIEW);
  const imageModel = 'nanobanana-pro'; // Locked image generation model

  // Style Selection State
  const [selectedStyle, setSelectedStyle] = useState<StoryboardStyle>(STORYBOARD_STYLES[0]);
  const [customStylePrompt, setCustomStylePrompt] = useState('');
  const [showStyleCards, setShowStyleCards] = useState(false);

  // Extract Progress State
  const [extractProgress, setExtractProgress] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  // Prompt Validation State
  const [promptValidationResults, setPromptValidationResults] = useState<ReviewSuggestion[]>([]);
  const [isValidatingPrompts, setIsValidatingPrompts] = useState(false);

  // Character Extraction State
  const [isExtractingChars, setIsExtractingChars] = useState(false);

  // Reanalyze State
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState<BatchAnalysisProgress | null>(null);
  const [reanalyzeResult, setReanalyzeResult] = useState<ProjectAnalysisResult | null>(null);

  // Script Cleaning State
  const [cleaningResult, setCleaningResult] = useState<ScriptCleaningResult | null>(() =>
    loadFromStorage(STORAGE_KEYS.CLEANING_RESULT, null)
  );
  const [cleaningProgress, setCleaningProgress] = useState(() =>
    loadFromStorage(STORAGE_KEYS.CLEANING_PROGRESS, '')
  );
  const [isCleaning, setIsCleaning] = useState(false);

  // Chain of Thought State
  const [cotCurrentStage, setCotCurrentStage] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [cotStage1, setCotStage1] = useState<ScriptAnalysis | null>(null);
  const [cotStage2, setCotStage2] = useState<VisualStrategy | null>(null);
  const [cotStage3, setCotStage3] = useState<ShotPlanning | null>(null);
  const [cotStage4, setCotStage4] = useState<ShotDesign[] | null>(null);
  const [cotStage5, setCotStage5] = useState<QualityCheck | null>(null);
  const [cotRawOutput, setCotRawOutput] = useState<string>('');

  // Episode Summary State
  const [episodeSummary, setEpisodeSummary] = useState<import('./types/project').GeneratedEpisodeSummary | null>(null);

  // CoT Progress Modal State
  const [showCotProgressModal, setShowCotProgressModal] = useState(false);
  const [cotProgressMinimized, setCotProgressMinimized] = useState(false);
  const [cotError, setCotError] = useState<string | null>(null);
  const [cotStartTime, setCotStartTime] = useState<number | null>(null);

  // Refs
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const selectedEpisodeIdRef = useRef<string | null>(null);
  const nineGridResumeTokenRef = useRef(0);

  // 🆕 九宫格生成控制器（用于停止生成）
  const [abortController, setAbortController] = React.useState<AbortController | null>(null);

  // 🆕 九宫格生成时间跟踪
  const [gridGenerationStartTime, setGridGenerationStartTime] = React.useState<number | null>(null);
  const [currentGeneratingGrid, setCurrentGeneratingGrid] = React.useState<number | null>(null);

  // 🆕 获取用户积分信息
  useEffect(() => {
    if (!loggedIn) return;

    const fetchPoints = async () => {
      try {
        const points = await getUserPoints();
        setUserPoints(points);
      } catch (error) {
        console.error('[App] 获取积分信息失败:', error);
      }
    };

    fetchPoints();
  }, [loggedIn]);

  // 🆕 加载项目列表和当前项目（仅在登录后执行）
  useEffect(() => {
    if (!loggedIn) return;  // 🆕 只在登录后加载

    const loadProjects = async () => {
      const allProjects = await getAllProjects();
      setProjects(allProjects);

      // 加载当前项目
      const id = getCurrentProjectId();
      if (id) {
        const project = await getProject(id);

        // 🔧 如果项目不存在（404），清除当前项目ID并返回项目列表
        if (!project) {
          console.warn(`[App] 项目 ${id} 不存在，清除当前项目ID`);
          setCurrentProjectId(null);
          setCurrentProject(null);
          setCurrentStep(AppStep.PROJECT_LIST);
          alert('项目不存在或已被删除，请重新选择项目');
          return;
        }

        setCurrentProject(project);
      }
    };

    loadProjects();
  }, [loggedIn]);  // 🆕 依赖 loggedIn 状态

  // 🔧 同步 projectRef（用于在闭包中访问最新项目状态）
  useEffect(() => {
    projectRef.current = currentProject;
  }, [currentProject]);

  // 🆕 Tab切换逻辑：当currentStep改变时，自动更新currentTab
  useEffect(() => {
    if (currentStep === AppStep.GENERATE_LIST) {
      setCurrentTab('generate');
    } else if (currentStep === AppStep.REVIEW_OPTIMIZE) {
      setCurrentTab('review');
    } else if (currentStep === AppStep.MANUAL_EDIT) {
      setCurrentTab('manual');
    }
  }, [currentStep]);

  // Robust Parsing helper for partial JSON streams
  useEffect(() => {
    if (!streamText || (currentStep !== AppStep.GENERATE_LIST && currentStep !== AppStep.MANUAL_EDIT && !progressMsg.includes('重写'))) return;

    // Only try to parse as JSON if we are NOT in the "chatting" mode (which returns plain text)
    // We differentiate by checking if we are running 'Execute' action
    if (progressMsg.includes('正在修改') || progressMsg.includes('构思') || progressMsg.includes('重写')) {
        const parseAndSet = (jsonStr: string) => {
          try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) {
              setShots(parsed.map((s: any, idx: number) => ({
                ...s,
                id: s.id || `shot-stable-${idx}`, 
                status: s.status || 'pending'
              })));
            }
          } catch (e) {
            // Silent fail
          }
        };

        if (streamText.trim().endsWith(']')) {
          parseAndSet(streamText);
        } else {
          const lastCloseBrace = streamText.lastIndexOf('}');
          if (lastCloseBrace > -1) {
            const candidate = streamText.substring(0, lastCloseBrace + 1) + ']';
            parseAndSet(candidate);
          }
        }
    }
  }, [streamText, currentStep, progressMsg]);

  // 🆕 自动保存到 localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CURRENT_STEP, currentStep);
  }, [currentStep]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SCRIPT, script);
  }, [script]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SHOTS, shots);
  }, [shots]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CHARACTER_REFS, characterRefs);
  }, [characterRefs]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CHAT_HISTORY, chatHistory);
  }, [chatHistory]);

  // 🆕 自动保存剧本清洗结果和进度
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CLEANING_RESULT, cleaningResult);
  }, [cleaningResult]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CLEANING_PROGRESS, cleaningProgress);
  }, [cleaningProgress]);

  // 🔧 自动保存当前剧集编号
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CURRENT_EPISODE_NUMBER, currentEpisodeNumber);
  }, [currentEpisodeNumber]);

  // 🆕 不再保存 hqUrls 到 localStorage（图片数据太大，会超出配额）
  // hqUrls 是临时数据，刷新页面后重新生成即可
  // useEffect(() => {
  //   saveToStorage(STORAGE_KEYS.HQ_URLS, hqUrls);
  // }, [hqUrls]);

  // Auto scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, streamText]);

  // 🆕 计算当前九宫格生成耗时
  const [generationElapsedTime, setGenerationElapsedTime] = React.useState<number>(0);

  React.useEffect(() => {
    if (!gridGenerationStartTime || currentGeneratingGrid === null) {
      setGenerationElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - gridGenerationStartTime) / 1000);
      setGenerationElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [gridGenerationStartTime, currentGeneratingGrid]);

  // 如果未登录，显示登录页面（在所有Hooks声明之后）
  if (!loggedIn) {
    return <Login onLoginSuccess={() => setLoggedIn(true)} />;
  }

  // ═══════════════════════════════════════════════════════════════
  // 原有状态（已移至条件返回之前）
  // ═══════════════════════════════════════════════════════════════

  const handleScriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setScript(text);
      };
      reader.readAsText(file);
    }
  };

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

  const removeChar = (id: string) => {
    setCharacterRefs(prev => prev.filter(c => c.id !== id));
  };

  // ═══════════════════════════════════════════════════════════════
  // 🆕 项目管理函数
  // ═══════════════════════════════════════════════════════════════

  // 🔧 核心修复：项目列表只返回元数据（id/name/timestamps），
  //    点击项目时必须异步获取完整数据（含 settings/characters/scenes/episodes）
  const handleSelectProject = async (project: Project) => {
    try {
      // 🔧 先清理所有剧集相关状态，避免项目间数据混乱
      console.log('[handleSelectProject] 清理旧项目状态...');
      setScript('');
      setShots([]);
      setHqUrls([]);
      setChatHistory([]);
      setCotStage1(null);
      setCotStage2(null);
      setCotStage3(null);
      setCotStage4(null);
      setCotStage5(null);
      setCotRawOutput('');
      setStreamText('');
      setProgressMsg('');
      setCurrentEpisodeNumber(null);
      selectedEpisodeIdRef.current = null;
      setCharacterRefs([]); // 🔧 也清理角色库

      const fullProject = await getProject(project.id);
      if (!fullProject) {
        alert('无法加载项目数据，项目可能已被删除');
        return;
      }

      console.log(`[handleSelectProject] 加载项目: ${fullProject.name}`);

      // 🆕 旧项目自动迁移：检测并补齐 projectStyleId
      let needsMigration = false;
      if (!fullProject.settings.projectStyleId && fullProject.settings.visualStyle) {
        console.log('[旧项目迁移] 检测到旧项目，开始自动迁移...');
        needsMigration = true;

        // 获取媒体类型对应的英文渲染后缀
        const mediaType = fullProject.settings.mediaType || 'ai-2d';
        const aiPromptHint = PROJECT_MEDIA_TYPES[mediaType].aiPromptHint;

        // 自动迁移：projectStyleId='custom'，使用旧 visualStyle 作为中文描述，aiPromptHint 作为英文后缀
        fullProject.settings.projectStyleId = 'custom';
        fullProject.settings.projectStyleCustomPromptCn = fullProject.settings.visualStyle;
        fullProject.settings.projectStyleCustomPromptEn = aiPromptHint;
        fullProject.settings.storyboardStyleOverride = null;

        console.log('[旧项目迁移] 迁移完成：');
        console.log('  - projectStyleId: custom');
        console.log('  - projectStyleCustomPromptCn:', fullProject.settings.visualStyle);
        console.log('  - projectStyleCustomPromptEn:', aiPromptHint);

        // 持久化迁移结果
        try {
          await patchProject(fullProject.id, {
            settings: fullProject.settings
          });
          console.log('[旧项目迁移] 迁移结果已持久化');
        } catch (error) {
          console.error('[旧项目迁移] 持久化失败:', error);
          // 不阻断加载流程，仅记录错误
        }
      }

      setCurrentProject(fullProject);
      setCurrentProjectId(fullProject.id);

      // 加载项目的角色库
      if (fullProject.characters && fullProject.characters.length > 0) {
        setCharacterRefs(fullProject.characters);
        console.log(`[handleSelectProject] 加载了 ${fullProject.characters.length} 个角色`);
      }

      // 如果进行了迁移，提示用户
      if (needsMigration) {
        setTimeout(() => {
          alert('✅ 旧项目已自动升级\n\n已为您的项目设置默认渲染风格。\n您可以在"角色设定"页面重新选择项目风格。');
        }, 500);
      }

      // 进入项目主界面
      setCurrentStep(AppStep.PROJECT_DASHBOARD);
    } catch (error) {
      console.error('[handleSelectProject] 加载项目失败:', error);
      alert('加载项目失败，请重试');
    }
  };

  const handleCreateProject = () => {
    setCurrentStep(AppStep.PROJECT_WIZARD);
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
    const allProjects = await getAllProjects();
    setProjects(allProjects);
    if (currentProject?.id === projectId) {
      setCurrentProject(null);
      setCurrentProjectId(null);
    }
  };

  const handleProjectComplete = async (project: Project) => {
    try {
      // 🆕 前置校验：确保已登录（强制登录策略）
      if (!isLoggedIn()) {
        alert('❌ 登录已失效\n\n请重新登录后再保存项目');
        setLoggedIn(false);
        return;
      }

      // ⚠️ 创建项目完成时需要把 episodes 一并落库（episodes 表）
      await saveProject(project, { includeEpisodes: true });
      const allProjects = await getAllProjects();
      setProjects(allProjects);
      setCurrentProject(project);
      setCurrentProjectId(project.id);
      // 加载项目角色（安全检查）
      if (project.characters && project.characters.length > 0) {
        setCharacterRefs(project.characters);
      }
      // 🆕 进入项目主界面
      setCurrentStep(AppStep.PROJECT_DASHBOARD);

      // 🆕 启动后台角色补全（不阻塞 UI）
      // 🔧 修复：同时检查顶层 status（ProjectWizard 初始化时设置）和 perCharacter（恢复场景）
      // - ProjectWizard 完成后：supplement.status === 'queued'，perCharacter 为空
      // - 页面刷新恢复场景：supplement.status 可能已更新，但 perCharacter 中仍有 queued 角色
      const supplement = project.settings?.backgroundJobs?.supplement;
      const hasQueuedSupplements =
        supplement?.status === 'queued' ||
        Object.values(supplement?.perCharacter || {}).some(c => c.status === 'queued');
      if (hasQueuedSupplements) {
        runBackgroundSupplement(project).catch(err => {
          console.error('[后台补全启动失败]', err);
        });
      }
    } catch (error) {
      console.error('[项目保存失败]', error);

      // 🆕 检查是否为认证错误
      const isAuthError = error instanceof Error &&
        ((error as any).code === 'AUTH_REQUIRED' || error.message.includes('Unauthorized'));

      if (isAuthError) {
        alert('❌ 登录已失效\n\n请重新登录后再保存项目');
        setLoggedIn(false);
        return;
      }

      // 显示友好的错误提示
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(
        `❌ 项目保存失败\n\n` +
        `${errorMessage}\n\n` +
        `💡 提示：\n` +
        `• 80集剧本数据量较大，建议分批创建项目\n` +
        `• 可以先创建20-30集的项目进行测试\n` +
        `• 或删除旧项目释放存储空间`
      );
    }
  };

  const handleProjectCancel = () => {
    setCurrentStep(AppStep.PROJECT_LIST);
  };

  /**
   * 🆕 后台角色补全流水线
   * 在项目创建后自动运行，不阻塞 UI
   */
  const runBackgroundSupplement = async (project: Project) => {
    console.log('[后台补全] 🚀 开始后台角色补充...');

    // 🆕 前置校验：确保已登录（强制登录策略）
    if (!isLoggedIn()) {
      console.error('[后台补全] 未登录，中止后台补全');
      alert('❌ 登录已失效\n\n后台补全需要登录，请重新登录');
      setLoggedIn(false);
      return;
    }

    // 🆕 生成本次补全任务的 runId（用于隔离不同任务的进度更新）
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    console.log(`[后台补全] 本次任务 runId: ${runId}`);

    const startedAt = new Date().toISOString();
    let lastProgressUpdate = 0; // 节流：避免频繁更新 UI

    // 🆕 写库串行队列（解决 AbortError）
    const writeQueue: Array<() => Promise<void>> = [];
    let isWriting = false;

    const processWriteQueue = async () => {
      if (isWriting || writeQueue.length === 0) return;
      isWriting = true;

      while (writeQueue.length > 0) {
        const task = writeQueue.shift();
        if (task) {
          try {
            await task();
          } catch (err) {
            console.error('[写库队列] 任务执行失败:', err);
          }
        }
      }

      isWriting = false;
    };

    const queuedPatchProject = (projectId: string, patch: any): Promise<void> => {
      return new Promise((resolve, reject) => {
        writeQueue.push(async () => {
          try {
            await patchProject(projectId, patch);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        processWriteQueue();
      });
    };

    // 🆕 5秒节流写库（非终态合并写，终态立即 flush）
    let pendingPatch: any = null;
    let throttleTimer: NodeJS.Timeout | null = null;

    const throttledPatchProject = async (projectId: string, patch: any, isTerminal: boolean = false) => {
      if (isTerminal) {
        // 终态立即 flush
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
        if (pendingPatch) {
          await queuedPatchProject(projectId, pendingPatch);
          pendingPatch = null;
        }
        await queuedPatchProject(projectId, patch);
        console.log('[写库队列] 🚀 终态立即写入');
      } else {
        // 非终态合并
        pendingPatch = pendingPatch ? { ...pendingPatch, ...patch } : patch;

        if (!throttleTimer) {
          throttleTimer = setTimeout(async () => {
            if (pendingPatch) {
              await queuedPatchProject(projectId, pendingPatch);
              console.log('[写库队列] ⏱️ 5秒节流写入');
              pendingPatch = null;
            }
            throttleTimer = null;
          }, 5000);
        }
      }
    };

    // 🔧 辅助函数：更新单个角色的补全进度
    // 🆕 进度更新互斥队列（防止并发覆盖）
    let progressUpdateQueue = Promise.resolve();

    // 🆕 修改A：添加单调递增/终态优先保护
    // 🆕 修改B：添加 runId 隔离
    // 🔧 修复：添加互斥锁，防止并发更新导致状态覆盖
    const updateCharacterProgress = async (
      characterId: string,
      update: {
        status: 'queued' | 'running' | 'complete' | 'error';
        message?: string;
        stage?: string;
        progress?: number;
        errorMessage?: string;
      }
    ) => {
      // 🔧 修复：将更新操作加入队列，确保串行执行（避免并发覆盖）
      progressUpdateQueue = progressUpdateQueue.then(async () => {
        try {
          const now = Date.now();

          // 🔧 使用 projectRef.current 获取最新项目状态，避免并发覆盖
          const latestProject = projectRef.current || project;

          // 🆕 修改A：获取当前角色的进度状态
          const currentProgress = latestProject.settings?.backgroundJobs?.supplement?.perCharacter?.[characterId];

          // 🆕 修改B：runId 隔离 - 只接受当前 runId 的更新
          if (currentProgress?.runId && currentProgress.runId !== runId) {
            console.log(`[后台补全] ⚠️ 拒绝更新：角色 ${characterId} 当前 runId=${currentProgress.runId}，忽略 runId=${runId} 更新（可能是旧任务）`);
            return;
          }

      // 🆕 修改A：定义 status rank（数值越大优先级越高）
      const statusRank = {
        'queued': 0,
        'running': 1,
        'complete': 2,
        'error': 2
      };

      // 🆕 修改A：定义 stage rank（数值越大优先级越高）
      const stageRank: Record<string, number> = {
        'start': 0,
        'stage1': 1,
        'stage2': 2,
        'stage3': 3,
        'stage4': 4,
        'stage5': 5,     // 🔧 方案B：补全 stage5
        'stage5.5': 5.5, // 🔧 修复：添加 stage5.5（智能形态补全）
        'merge': 6,      // 🔧 方案B：调整 merge rank
        'complete': 7,   // 🔧 方案B：调整 complete rank
        'error': 7       // 🔧 方案B：调整 error rank
      };

      // 🆕 修改A：单调递增保护 - 如果当前状态优先级更高，拒绝更新
      if (currentProgress) {
        const currentStatusRank = statusRank[currentProgress.status] || 0;
        const newStatusRank = statusRank[update.status] || 0;

        // 🔧 方案B：stage 缺失/未知时的兜底策略
        const currentStage = currentProgress.stage || '';
        const newStage = update.stage || currentStage; // 若 update.stage 为空，兜底到当前 stage

        const currentStageRank = stageRank[currentStage] || 0;
        let newStageRank = stageRank[newStage];

        // 若 newStage 不在映射表中（未知 stage），打印警告并视为不推进 stage
        if (newStageRank === undefined) {
          console.warn(`[后台补全] ⚠️ 未知 stage 值: "${newStage}"，视为不推进 stage（使用当前 rank）`);
          newStageRank = currentStageRank; // 使用当前 rank，避免误判为回退
        }

        // 🔧 添加详细日志，追踪状态更新
        console.log(`[后台补全] 🔍 状态更新检查: ${characterId} | 当前: ${currentStage}(rank=${currentStageRank}, status=${currentProgress.status}) → 新: ${newStage}(rank=${newStageRank}, status=${update.status})`);

        // 终态优先：complete/error 不能被 running/queued 覆盖
        if (currentStatusRank >= 2 && newStatusRank < 2) {
          console.log(`[后台补全] ⚠️ 拒绝更新：角色 ${characterId} 已处于终态 ${currentProgress.status}，忽略 ${update.status} 更新`);
          return;
        }

        // Stage 级别保护：高级别 stage 不能被低级别覆盖
        if (currentStageRank > newStageRank) {
          console.log(`[后台补全] ⚠️ 拒绝更新：角色 ${characterId} 当前 stage=${currentStage}(rank=${currentStageRank})，忽略 stage=${newStage}(rank=${newStageRank}) 更新`);
          return;
        }

        // 🔧 添加成功更新日志
        console.log(`[后台补全] ✅ 允许更新：角色 ${characterId} 从 ${currentStage} → ${newStage}`);
      } else {
        // 🔧 添加首次更新日志
        console.log(`[后台补全] 🆕 首次更新：角色 ${characterId} stage=${update.stage}, status=${update.status}`);
      }

      const newSettings = {
        ...latestProject.settings,
        backgroundJobs: {
          ...(latestProject.settings?.backgroundJobs || {}),
          supplement: {
            perCharacter: {
              ...(latestProject.settings?.backgroundJobs?.supplement?.perCharacter || {}),
              [characterId]: {
                ...update,
                runId, // 🆕 记录 runId
                startTime: latestProject.settings?.backgroundJobs?.supplement?.perCharacter?.[characterId]?.startTime || now,
                endTime: update.status === 'complete' || update.status === 'error' ? now : undefined
              }
            }
          }
        }
      };

      // 1. 持久化到 D1（使用节流写库）
      const isTerminal = update.status === 'complete' || update.status === 'error';
      try {
        await throttledPatchProject(project.id, { settings: newSettings }, isTerminal);
      } catch (err) {
        console.warn('[后台补全] DB 更新失败:', err);
        // 🆕 检查是否为认证错误
        const isAuthError = err instanceof Error &&
          ((err as any).code === 'AUTH_REQUIRED' || err.message.includes('Unauthorized'));
        if (isAuthError) {
          console.error('[后台补全] 认证失败，中止后台补全');
          setLoggedIn(false);
          throw err; // 抛出错误，中止后台补全
        }
      }

      // 2. 同步到 React 状态（🔧 使用函数式更新避免闭包旧值）
      setCurrentProject(prev =>
        prev?.id === project.id
          ? { ...prev, settings: newSettings }
          : prev
      );

      // 🔧 修复：立即同步更新 projectRef.current，确保下一次更新读取到最新状态
      if (projectRef.current?.id === project.id) {
        projectRef.current = { ...projectRef.current, settings: newSettings };
      }
        } catch (err) {
          console.error('[后台补全] 进度更新失败:', err);
        }
      }).catch(err => {
        console.error('[后台补全] 进度更新队列异常:', err);
      });

      // 等待队列完成（确保更新已执行）
      await progressUpdateQueue;
    };

    try {
      // 🔧 修复：C1 策略 - 检查 genre 是否为空，为空则阻止后台补全
      const genre = project.settings?.genre || '';
      if (!genre) {
        console.error('[后台补全] ❌ 剧本类型为空，无法确定美型等级，请先在项目设置中选择题材类型或运行项目分析');
        alert('⚠️ 剧本类型未设置\n\n请先在项目设置中选择题材类型（如：女频言情、古装仙侠等），或运行项目分析自动识别题材。\n\n这将影响角色外貌的美学标准选择。');

        // 标记后台任务为 error
        await patchProject(project.id, {
          settings: {
            ...project.settings,
            backgroundJobs: {
              ...(project.settings?.backgroundJobs || {}),
              supplement: {
                status: 'error',
                startedAt: project.settings?.backgroundJobs?.supplement?.startedAt,
                completedAt: new Date().toISOString(),
                error: '剧本类型未设置，无法确定美型等级'
              }
            }
          }
        });
        return;
      }

      // 1. 准备剧本数据
      const scripts: ScriptFile[] = project.episodes.map(ep => ({
        episodeNumber: ep.episodeNumber,
        content: ep.script || '',
        fileName: `第${ep.episodeNumber}集`
      }));

      // 2. 智能选择美型等级（基于剧本类型）
      const beautyLevel = getBeautyLevelByGenre(genre);

      console.log(`[后台补全] 剧本类型: ${genre} → 美型等级: ${beautyLevel}`);

      // 3. 执行补全（🔧 方案A：清空主要角色 appearance 草稿，强制走 CoT）
      // 🆕 使用用户在向导中勾选的主角（通过 description 中的【主角】标记识别）
      // 而不是用 identifyMainCharacters 重新识别
      const mainChars = (project.characters || []).filter(c =>
        c.description?.includes('【主角】') || c.role === '主角'
      );
      const mainIds = new Set(mainChars.map(c => c.id));

      console.log(`[后台补全] 使用用户勾选的主角（${mainChars.length} 个）:`, mainChars.map(c => c.name));

      // 🔧 初始化所有主要角色的进度为 queued
      for (const char of mainChars) {
        await updateCharacterProgress(char.id, {
          status: 'queued',
          stage: 'start', // 🆕 修复：明确指定 stage，避免 undefined
          message: '等待补全...'
        });
      }

      // 🆕 清空主要角色 appearance（内存 + DB），确保 UI 不闪现旧描述
      const charactersForSupplement = (project.characters || []).map(c =>
        mainIds.has(c.id) ? { ...c, appearance: '' } : c
      );

      // 🆕 立即写回 DB（清空主要角色 appearance）
      try {
        await patchProject(project.id, {
          characters: charactersForSupplement
        });
        console.log(`[后台补全] 🔧 已清空 ${mainIds.size} 个主要角色的 appearance（DB + 内存），强制触发 CoT 生成`);
      } catch (err) {
        console.warn('[后台补全] 清空 appearance 写 DB 失败:', err);
      }

      // 🆕 同步到 React 状态（让 UI 立即看到置空效果）
      setCurrentProject(prev =>
        prev?.id === project.id
          ? { ...prev, characters: charactersForSupplement }
          : prev
      );
      if (currentProject?.id === project.id) {
        setCharacterRefs(charactersForSupplement);
      }

      const updatedCharacters = await autoSupplementMainCharacters(
        charactersForSupplement,
        scripts,
        {
          projectId: project.id, // 🆕 传入 projectId 实现缓存强隔离
          maxCharacters: 5,
          minAppearances: 0,
          mode: 'detailed', // 🔧 统一使用 optimized 版思维链（Stage3 深度设计，质量更高）
          beautyLevel,
          fixedMainCharacterIds: Array.from(mainIds),  // 🆕 使用用户勾选的主角
          onProgress: async (progress) => {
            console.log(`[后台补全] 进度: ${progress.current}/${progress.total} - ${progress.characterName} - ${progress.stage}`);

            // 🔧 变更B：终态绕过节流，确保 UI 一定能看到 complete
            const isTerminalStatus = ['merge', 'complete', 'error'].includes(progress.stage);

            // 节流：每 500ms 最多更新一次 UI（终态除外）
            const now = Date.now();
            if (!isTerminalStatus && now - lastProgressUpdate < 500) return;
            lastProgressUpdate = now;

            // 🔧 更新当前角色的进度
            const currentChar = mainChars.find(c => c.name === progress.characterName);
            if (currentChar) {
              // 🔧 如果是 complete 阶段，强制设置 status='complete' 和 progress=100
              const status = progress.stage === 'complete' ? 'complete' : 'running';
              const progressPercent = progress.stage === 'complete'
                ? 100
                : Math.round((progress.current / progress.total) * 100);

              await updateCharacterProgress(currentChar.id, {
                status,
                message: progress.message || progress.stage,
                stage: progress.stage,
                progress: progressPercent
              });
            }
          },
          // 🆕 onStageComplete：分段写回（解决"要等全部角色才显示"）
          onStageComplete: async (charId, charName, stage, result) => {
            console.log(`[后台补全] 🎯 角色"${charName}"完成 ${stage}`);

            // 找到对应角色
            const currentChar = charactersForSupplement.find(c => c.id === charId);
            if (!currentChar) return;

            // 更新内存中的角色数据
            const updatedChar = { ...currentChar };

            if (stage === 'stage3' && result.appearance) {
              updatedChar.appearance = result.appearance;
              console.log(`[后台补全] ✅ 角色"${charName}" Stage3 完成，立即更新 appearance（含【主体人物】【外貌特征】）`);
            } else if (stage === 'stage4' && result.appearance) {
              // 🔧 修复：Stage4 回调传的是 { appearance: mergedAppearance }，不是 { costume }
              // 旧代码判断 result.costume（永远 false），导致 Stage4 分段写回从未生效
              updatedChar.appearance = result.appearance;
              console.log(`[后台补全] ✅ 角色"${charName}" Stage4 完成，立即更新 appearance（含【服饰造型】）`);
            } else if (stage === 'stage5.5' && result.formSummaries && result.formSummaries.length > 0) {
              // 🔄 Phase 1 轻量扫描结果：立即写库（解决"要等全部角色才能看到 formSummaries"的问题）
              // 从 projectRef.current 获取最新 formSummaries，再合并新扫描的（去重基于 name）
              const latestChar = (projectRef.current?.characters || []).find(c => c.id === charId);
              const existingSummaries = (latestChar?.formSummaries || []) as FormSummary[];
              const existingNames = new Set(existingSummaries.map(f => f.name));
              const newUnique = (result.formSummaries as FormSummary[]).filter(f => !existingNames.has(f.name));
              updatedChar.formSummaries = [...existingSummaries, ...newUnique];
              console.log(`[后台补全] ✅ 角色"${charName}" Stage5.5 完成，立即更新 formSummaries（已有${existingSummaries.length}个，新增${newUnique.length}个，共${updatedChar.formSummaries.length}个）`);
            }

            // 立即写库（终态）
            const latestProject = projectRef.current || project;
            const updatedCharacters = (latestProject.characters || []).map(c =>
              c.id === charId ? updatedChar : c
            );

            try {
              await throttledPatchProject(project.id, { characters: updatedCharacters }, true);
              console.log(`[后台补全] 💾 角色"${charName}" ${stage} 结果已写库`);

              // 同步到 React 状态
              setCurrentProject(prev =>
                prev?.id === project.id
                  ? { ...prev, characters: updatedCharacters }
                  : prev
              );
              setCharacterRefs(updatedCharacters);

              // 🔧 修复Bug C：同步 projectRef.current.characters
              // 原因：onStageComplete 只更新 React State，但 projectRef.current 是闭包引用
              // 若不同步，后续 upsert 的 latestProject = projectRef.current 读到的是旧数据
              // 导致最后的"强制 upsert 基底"逻辑用空 appearance 覆盖已生成的结果
              if (projectRef.current?.id === project.id) {
                projectRef.current = { ...projectRef.current, characters: updatedCharacters };
              }
            } catch (err) {
              console.error(`[后台补全] ❌ 角色"${charName}" ${stage} 写库失败:`, err);
            }
          }
        }
      );

      // 5. 🔄 Phase 1 轻量形态摘要扫描（只提取元数据，不生成设定图）
      // 三阶段设计：Phase1=自动轻量扫描（本步骤）→ Phase2=用户审查 → Phase3=按需详细生成
      console.log('[后台补全] 🔍 开始 Phase 1 轻量形态摘要扫描...');

      const { extractFormSummaries: extractFormSummariesFn } = await import('./services/characterSupplement/extractCharacterStates');

      const charactersWithStates = await Promise.all(
        updatedCharacters.map(async (character) => {
          // 只为主要角色扫描形态摘要
          if (!mainIds.has(character.id)) {
            return character;
          }

          try {
            console.log(`[后台补全] 🔍 Phase 1 扫描角色"${character.name}"的形态摘要...`);

            const summaries = await extractFormSummariesFn(
              character,
              scripts,
              'google/gemini-2.5-flash'
            );

            if (summaries.length === 0) {
              console.log(`[后台补全] 角色"${character.name}"未检测到外观变化形态`);
              return character;
            }

            console.log(`[后台补全] ✅ 角色"${character.name}"识别到 ${summaries.length} 个形态摘要`);

            // 合并已有 formSummaries（去重基于 name）
            const existingSummaries = (character.formSummaries || []) as FormSummary[];
            const existingNames = new Set(existingSummaries.map(f => f.name));
            const newUnique = summaries.filter(f => !existingNames.has(f.name));

            return {
              ...character,
              formSummaries: [...existingSummaries, ...newUnique]
            };
          } catch (error) {
            console.error(`[后台补全] ❌ 角色"${character.name}"形态摘要扫描失败:`, error);
            // 失败不影响其他角色，返回原角色
            return character;
          }
        })
      );

      console.log('[后台补全] 🔍 Phase 1 形态摘要扫描完成（Phase 3 详细生成需用户触发）');

      // 🆕 修改D：为每个主要角色强制 upsert「常规状态（完好）」基底（从 character.appearance）
      console.log('[后台补全] 🛡️ 开始强制 upsert 常规完好基底...');
      const charactersWithBaseline = charactersWithStates.map(character => {
        // 只为主要角色生成基底
        if (!mainIds.has(character.id)) {
          return character;
        }

        // 🔧 修复：autoSupplement 失败时（如 Stage5.5 崩溃），character.appearance 可能为空。
        // 此时尝试从 projectRef.current 恢复——onStageComplete 已将 Stage3/Stage4 结果写入 React state，
        // projectRef.current 是最新快照，包含实际已生成的 appearance。
        let recoveredAppearance = character.appearance;
        if (!recoveredAppearance || recoveredAppearance.trim().length === 0) {
          const latestChar = (projectRef.current?.characters || []).find(c => c.id === character.id);
          if (latestChar?.appearance && latestChar.appearance.trim().length > 0) {
            recoveredAppearance = latestChar.appearance;
            console.log(`[后台补全] 🔄 角色"${character.name}"从 projectRef.current 恢复 appearance（长度: ${recoveredAppearance.length}）`);
          }
        }

        // 如果仍然为空，无法生成基底
        if (!recoveredAppearance || recoveredAppearance.trim().length === 0) {
          console.log(`[后台补全] ⚠️ 角色"${character.name}"没有 appearance，无法生成基底`);
          return character;
        }

        console.log(`[后台补全] 🔧 为角色"${character.name}"强制 upsert 常规完好基底（从 appearance，长度: ${recoveredAppearance.length}）`);

        // 🆕 强制 upsert：移除旧的 baseline（使用归一化判断）
        const otherForms = (character.forms || []).filter(f => !isBaselineStateName(f.name));

        const normalForm: CharacterForm = {
          id: `${character.id}-normal-baseline`,
          name: '常规状态（完好）',
          episodeRange: '',
          description: recoveredAppearance, // 🔧 使用 CoT 生成的外观描述（唯一真相来源）
          note: '', // 🆕 去掉来源标记
          visualPromptCn: '',
          visualPromptEn: '',
          imageSheetUrl: '',
          imageGenerationMeta: {
            modelName: '',
            styleName: '',
            generatedAt: new Date().toISOString()
          },
          // 🔧 添加元数据标记
          changeType: 'costume' as any,
          priority: 100 as any
        };

        return {
          ...character,
          appearance: recoveredAppearance, // 🔧 同步更新 character.appearance，确保最终写库时字段正确
          forms: [normalForm, ...otherForms] // 🔧 基底放最前面
        };
      });

      console.log('[后台补全] 🛡️ 常规完好基底强制 upsert 完成');

      // 6. 🔧 标记所有主要角色为完成
      for (const char of mainChars) {
        await updateCharacterProgress(char.id, {
          status: 'complete',
          stage: 'complete', // 🔧 方案B：补充 stage 字段，避免 undefined
          message: '补全完成',
          progress: 100
        });
      }

      // 7. 更新角色到数据库
      await patchProject(project.id, {
        characters: charactersWithBaseline // 🆕 修改D：使用包含基底的角色
      });

      console.log('[后台补全] ✅ 补充完成');

      // 🔧 更新每个角色的进度为 complete（避免UI卡在merge）
      for (const char of mainChars) {
        await updateCharacterProgress(char.id, {
          status: 'complete',
          stage: 'complete',
          progress: 100,
          message: '✅ 补充完成'
        });
      }

      // 8. 刷新当前项目（🔧 修正状态同步 bug：使用 charactersWithBaseline）
      setCurrentProject(prev =>
        prev?.id === project.id
          ? { ...prev, characters: charactersWithBaseline }
          : prev
      );

      // 同步角色库（如果是当前项目）
      if (currentProject?.id === project.id) {
        setCharacterRefs(charactersWithBaseline);
      }

    } catch (error) {
      console.error('[后台补全] ❌ 补充失败:', error);

      // 🔧 标记所有主要角色为错误
      const mainChars = identifyMainCharacters(
        project.characters || [],
        { minAppearances: 0, maxCount: 5 }
      );

      for (const char of mainChars) {
        await updateCharacterProgress(char.id, {
          status: 'error',
          stage: 'error', // 🔧 方案B：补充 stage 字段，避免 undefined
          errorMessage: error instanceof Error ? error.message : '未知错误'
        });
      }
    }
  };

  const handleAnalyzeProject = async (
    scripts: ScriptFile[],
    model: string,
    onProgress?: (progress: BatchAnalysisProgress) => void,
    mode?: 'quick' | 'standard' | 'deep'
  ): Promise<ProjectAnalysisResult> => {
    return await analyzeProjectScriptsWithProgress(scripts, model, onProgress, mode);
  };

	  /**
	   * 🆕 九宫格任务自动恢复
	   * - 触发时机：选择剧集后
	   * - 恢复目标：把 shots.storyboardGridGenerationMeta 里记录的 taskCode 轮询拿回 imageUrl，并写回到 hqUrls
	   * - 重要约束：不写 storyboardGridUrl（避免影响“完成步骤跳转”逻辑），仅恢复“绘制步骤”的临时预览
	   */
	  const resumeNineGridTasksFromShots = async (
	    episodeId: string | undefined,
	    episodeShots: Shot[],
	    token: number
	  ) => {
	    if (!episodeId) return;
	    if (!Array.isArray(episodeShots) || episodeShots.length === 0) return;
	    // 防止用户切换到其它剧集后仍然写入旧剧集状态
	    if (selectedEpisodeIdRef.current !== episodeId) return;
	    if (nineGridResumeTokenRef.current !== token) return;

	    const GRID_SIZE = 9;

	    // 已经“应用到分镜表”的 grid（shots 上存在 storyboardGridUrl）不需要恢复
	    const appliedGrids = new Set<number>();
	    episodeShots.forEach((shot, idx) => {
	      const url = typeof shot.storyboardGridUrl === 'string' ? shot.storyboardGridUrl.trim() : '';
	      if (!url) return;
	      appliedGrids.add(Math.floor(idx / GRID_SIZE));
	    });

	    // 收集待恢复的 grid task（允许同一 grid 多次生成，取最新的 taskCreatedAt）
	    const pendingByGrid = new Map<number, NonNullable<Shot['storyboardGridGenerationMeta']>>();
	    for (let i = 0; i < episodeShots.length; i++) {
	      const meta = episodeShots[i]?.storyboardGridGenerationMeta;
	      if (!meta?.taskCode) continue;
	      const gridIndex = typeof meta.gridIndex === 'number' ? meta.gridIndex : Math.floor(i / GRID_SIZE);
	      if (appliedGrids.has(gridIndex)) continue;

	      const existing = pendingByGrid.get(gridIndex);
	      if (!existing) {
	        pendingByGrid.set(gridIndex, { ...meta, gridIndex });
	        continue;
	      }

	      const a = Date.parse(existing.taskCreatedAt || '');
	      const b = Date.parse(meta.taskCreatedAt || '');
	      const shouldReplace = Number.isNaN(a) ? !Number.isNaN(b) : (!Number.isNaN(b) && b > a);
	      if (shouldReplace) pendingByGrid.set(gridIndex, { ...meta, gridIndex });
	    }

	    if (pendingByGrid.size === 0) return;
	    console.log(`[NineGrid恢复] 发现 ${pendingByGrid.size} 个可恢复任务（episodeId=${episodeId}）`);

	    // 逐个恢复，避免并发过高造成 API 压力/控制台噪声
	    for (const [gridIndex, meta] of pendingByGrid.entries()) {
	      if (selectedEpisodeIdRef.current !== episodeId) return;
	      if (nineGridResumeTokenRef.current !== token) return;

	      try {
	        // 先快速查询一次（命中 SUCCESS 可省掉轮询）
	        const quick = await getGenerationResult(meta.taskCode);
	        if (quick.status === TaskStatus.SUCCESS && Array.isArray(quick.image_urls) && quick.image_urls[0]) {
	          const url = quick.image_urls[0];
	          setHqUrls(prev => {
	            const next = [...prev];
	            next[gridIndex] = url;
	            return next;
	          });
	          console.log(`[NineGrid恢复] ✅ grid#${gridIndex + 1} 已就绪（快速命中 SUCCESS）`);
	          continue;
	        }

	        if (quick.status === TaskStatus.FAILED) {
	          console.warn(`[NineGrid恢复] ❌ grid#${gridIndex + 1} 任务失败：${meta.taskCode}`);
	          continue;
	        }

	        // PENDING：进入轮询（内部指数退避，约 3 分钟超时）
	        const result = await pollGenerationResult(meta.taskCode, (status, attempt) => {
	          console.log(`[NineGrid恢复] grid#${gridIndex + 1} 状态=${status}，第${attempt}次查询`);
	        });

	        if (result.status === TaskStatus.SUCCESS && Array.isArray(result.image_urls) && result.image_urls[0]) {
	          const url = result.image_urls[0];
	          setHqUrls(prev => {
	            const next = [...prev];
	            next[gridIndex] = url;
	            return next;
	          });
	          console.log(`[NineGrid恢复] ✅ grid#${gridIndex + 1} 恢复成功`);
	        } else if (result.status === TaskStatus.FAILED) {
	          console.warn(`[NineGrid恢复] ❌ grid#${gridIndex + 1} 任务失败：${meta.taskCode}`);
	        }
	      } catch (error) {
	        // 不阻断用户；保留 meta，下一次进入剧集时仍可再次恢复
	        console.warn(`[NineGrid恢复] ⚠️ grid#${gridIndex + 1} 恢复失败（稍后可重试）：`, error);
	      }
	    }
	  };

  const goToProjectList = () => {
    // 🔧 清理所有剧集相关状态，避免项目间数据混乱
    setScript('');
    setShots([]);
    setHqUrls([]);
    setChatHistory([]);
    setCotStage1(null);
    setCotStage2(null);
    setCotStage3(null);
    setCotStage4(null);
    setCotStage5(null);
    setCotRawOutput('');
    setStreamText('');
    setProgressMsg('');
    setCurrentEpisodeNumber(null);
    selectedEpisodeIdRef.current = null;

    setCurrentStep(AppStep.PROJECT_LIST);
  };

  // 🔧 从项目主界面选择剧集进入编辑（异步获取完整数据）
  const handleSelectEpisode = async (episode: Episode) => {
    try {
      console.log(`[handleSelectEpisode] 加载第${episode.episodeNumber}集完整数据, id=${episode.id}`);
	      selectedEpisodeIdRef.current = episode.id || null;
	      const resumeToken = ++nineGridResumeTokenRef.current;

      // 🔧 从后端获取完整的 episode 数据（包含 script 和 shots）
      // 列表 API 返回的 episode 可能不包含 script 和 shots
      let fullEpisode = episode;
      if (episode.id) {
        const fetched = await getEpisode(episode.id);
        if (fetched) {
          fullEpisode = fetched;
	          selectedEpisodeIdRef.current = fullEpisode.id || episode.id || null;
          console.log(`[handleSelectEpisode] 获取完整数据成功, script长度=${fullEpisode.script?.length || 0}, shots数量=${fullEpisode.shots?.length || 0}`);
        } else {
          console.warn(`[handleSelectEpisode] 无法获取完整数据，使用列表数据`);
        }
      }

      // 🔧 确保 script 始终是字符串
      const episodeScript = typeof fullEpisode.script === 'string' ? fullEpisode.script : '';
      console.log(`[handleSelectEpisode] 剧本前100字: ${episodeScript.substring(0, 100)}...`);
      setScript(episodeScript);
      setCurrentEpisodeNumber(fullEpisode.episodeNumber);
	      if (fullEpisode.shots && fullEpisode.shots.length > 0) {
	        console.log(`[handleSelectEpisode] 加载 ${fullEpisode.shots.length} 个镜头`);
	        console.log(`[handleSelectEpisode] 第1个镜头剧情: ${typeof fullEpisode.shots[0].storyBeat === 'string' ? fullEpisode.shots[0].storyBeat : fullEpisode.shots[0].storyBeat?.event || '未知'}`);
	        setShots(fullEpisode.shots);

	        // 🆕 从 shots 中恢复九宫格 URLs（用于“绘制”步骤展示与下载）
	        // 注意：storyboardGridCellIndex 仅为 0-8 的格子索引，不能用来推回 gridIndex。
	        // 这里按 shot 在数组中的顺序恢复：每 9 个镜头对应一张九宫格。
	        const gridUrls: string[] = [];
	        fullEpisode.shots.forEach((shot, shotIndex) => {
	          const url = typeof shot.storyboardGridUrl === 'string' ? shot.storyboardGridUrl.trim() : '';
	          if (!url) return;
	          const gridIndex = Math.floor(shotIndex / 9);
	          if (!gridUrls[gridIndex]) gridUrls[gridIndex] = url;
	        });
	        const restored = gridUrls.filter(Boolean);
	        if (restored.length > 0) {
	          setHqUrls(gridUrls);
	          console.log(`[handleSelectEpisode] ✅ 恢复了 ${restored.length} 张九宫格图片`);
	        } else {
	          setHqUrls([]);
	        }

		        // 🆕 自动恢复“未应用到分镜表”的九宫格生图任务（依赖 shots.storyboardGridGenerationMeta）
		        // 说明：不影响步骤跳转逻辑，仅恢复绘制步骤的临时预览 hqUrls。
		        void resumeNineGridTasksFromShots(fullEpisode.id, fullEpisode.shots, resumeToken);
	      } else {
        setShots([]);
        setHqUrls([]);
      }

      // 🔧 加载当集出现的角色（仅在角色库为空时加载，避免覆盖项目角色库）
      // 注意：handleSelectProject 已经加载了项目角色库，这里不应该覆盖
      if (currentProject && characterRefs.length === 0) {
        const episodeSummary = currentProject.storyOutline?.find(
          s => s.episodeNumber === fullEpisode.episodeNumber
        );

        if (episodeSummary && episodeSummary.characterStates?.length > 0) {
          const episodeCharNames = new Set(
            episodeSummary.characterStates.map(cs => cs.characterName)
          );
          const episodeChars = (currentProject.characters || []).filter(
            c => episodeCharNames.has(c.name)
          );
          if (episodeChars.length > 0) {
            setCharacterRefs(episodeChars);
            console.log(`[剧集${fullEpisode.episodeNumber}] 加载${episodeChars.length}个角色:`, episodeChars.map(c => c.name));
          } else {
            if (currentProject.characters) setCharacterRefs(currentProject.characters);
          }
        } else {
          if (currentProject.characters) setCharacterRefs(currentProject.characters);
        }
      } else {
        console.log(`[剧集${fullEpisode.episodeNumber}] 使用已加载的 ${characterRefs.length} 个角色`);
      }


		      // ✅ 根据剧集完成进度，跳转到最远的已完成步骤
		      // 优先级：最终故事板(九宫格已回填到 shots) > 提示词 > 精修 > 导入
	      const hasShots = Array.isArray(fullEpisode.shots) && fullEpisode.shots.length > 0;
		      const hasStoryboard =
		        hasShots &&
		        fullEpisode.shots!.some(s => typeof s.storyboardGridUrl === 'string' && s.storyboardGridUrl.trim());
	      const hasExtractedPrompts =
	        hasShots &&
	        fullEpisode.shots!.some(s =>
	          Boolean(
	            (s.imagePromptCn && s.imagePromptCn.trim()) ||
	              (s.imagePromptEn && s.imagePromptEn.trim()) ||
	              (s.endImagePromptCn && s.endImagePromptCn.trim()) ||
	              (s.endImagePromptEn && s.endImagePromptEn.trim()) ||
	              (s.videoGenPrompt && s.videoGenPrompt.trim())
	          )
	        );

	      const targetStep = !hasShots
	        ? AppStep.INPUT_SCRIPT
		        : hasStoryboard
		          ? AppStep.FINAL_STORYBOARD
		          : hasExtractedPrompts
		            ? AppStep.EXTRACT_PROMPTS
		            : AppStep.MANUAL_EDIT;

	      setCurrentStep(targetStep);
	      console.log(`[handleSelectEpisode] ✅ 跳转到步骤: ${targetStep} (${AppStep[targetStep]})`);
    } catch (error) {
      console.error('[handleSelectEpisode] 加载剧集失败:', error);
      // 降级：使用列表数据（可能不完整但不至于报错）
      // 🔧 确保 script 始终是字符串
      setScript(typeof episode.script === 'string' ? episode.script : '');
      setCurrentEpisodeNumber(episode.episodeNumber);
	      if (episode.shots && Array.isArray(episode.shots) && episode.shots.length > 0) {
        setShots(episode.shots);

	        // 🆕 从 shots 中恢复九宫格 URLs（fallback 逻辑同上）
	        const gridUrls: string[] = [];
	        episode.shots.forEach((shot, shotIndex) => {
	          const url = typeof shot.storyboardGridUrl === 'string' ? shot.storyboardGridUrl.trim() : '';
	          if (!url) return;
	          const gridIndex = Math.floor(shotIndex / 9);
	          if (!gridUrls[gridIndex]) gridUrls[gridIndex] = url;
	        });
	        const restored = gridUrls.filter(Boolean);
	        if (restored.length > 0) {
	          setHqUrls(gridUrls);
	          console.log(`[handleSelectEpisode fallback] ✅ 恢复了 ${restored.length} 张九宫格图片`);
	        } else {
	          setHqUrls([]);
	        }

		        // 🆕 fallback 情况下也尝试自动恢复（若 episode.id 存在）
		        selectedEpisodeIdRef.current = episode.id || null;
		        const resumeToken = ++nineGridResumeTokenRef.current;
		        void resumeNineGridTasksFromShots(episode.id, episode.shots, resumeToken);
      } else {
        setShots([]);
        setHqUrls([]);
      }

		      const hasShots = Array.isArray(episode.shots) && episode.shots.length > 0;
		      const hasStoryboard =
		        hasShots &&
		        episode.shots!.some(s => typeof s.storyboardGridUrl === 'string' && s.storyboardGridUrl.trim());
	      const hasExtractedPrompts =
	        hasShots &&
	        episode.shots!.some(s =>
	          Boolean(
	            (s.imagePromptCn && s.imagePromptCn.trim()) ||
	              (s.imagePromptEn && s.imagePromptEn.trim()) ||
	              (s.endImagePromptCn && s.endImagePromptCn.trim()) ||
	              (s.endImagePromptEn && s.endImagePromptEn.trim()) ||
	              (s.videoGenPrompt && s.videoGenPrompt.trim())
	          )
	        );

	      const targetStep = !hasShots
	        ? AppStep.INPUT_SCRIPT
		        : hasStoryboard
		          ? AppStep.FINAL_STORYBOARD
		          : hasExtractedPrompts
		            ? AppStep.EXTRACT_PROMPTS
		            : AppStep.MANUAL_EDIT;

	      setCurrentStep(targetStep);
	      console.log(`[handleSelectEpisode] ✅ (fallback) 跳转到步骤: ${targetStep} (${AppStep[targetStep]})`);
    }
  };

  // 🆕 更新项目
  // - persist=false：仅更新前端状态（用于局部 PATCH 后避免重复全量保存）
  const handleUpdateProject = async (
    updatedProject: Project,
    options?: { persist?: boolean }
  ) => {
    setCurrentProject(updatedProject);
    // 同步角色库（安全检查）
    if (updatedProject.characters && updatedProject.characters.length > 0) {
      setCharacterRefs(updatedProject.characters);
    }

    if (options?.persist === false) return;

    await saveProject(updatedProject);
    const allProjects = await getAllProjects();
    setProjects(allProjects);
  };

  // 🆕 启动重新分析项目（切换到配置界面）
  const startReanalyzeProject = () => {
    if (!currentProject) {
      alert('没有当前项目');
      return;
    }
    if (!currentProject.episodes || currentProject.episodes.length === 0) {
      alert('项目中没有剧集，无法分析');
      return;
    }

    // 切换到重新分析配置界面（不立即开始分析）
    setReanalyzeProgress(null);
    setReanalyzeResult(null);
    setIsReanalyzing(false);
    setCurrentStep(AppStep.REANALYZE_PROJECT);
  };

  // 🆕 用户确认后开始重新分析
  const confirmAndStartReanalyze = () => {
    const confirm = window.confirm(
      `确定要重新分析项目吗？\n\n这将从 ${currentProject?.episodes?.length || 0} 集剧本中重新提取：\n• 类型/题材\n• 角色信息\n• 场景库\n• 剧情大纲\n\n原有数据将被覆盖。`
    );
    if (!confirm) return;

    performReanalyze();
  };

  // 🆕 执行重新分析
  const performReanalyze = async () => {
    if (!currentProject || !currentProject.episodes || !Array.isArray(currentProject.episodes)) return;

    setIsReanalyzing(true);
    try {
      // 将剧集转换为 ScriptFile 格式
      const scriptFiles: ScriptFile[] = currentProject.episodes.map((ep: Episode) => ({
        episodeNumber: ep.episodeNumber,
        content: ep.script || '',
        fileName: `第${ep.episodeNumber}集`
      }));

      // 进度回调处理
      const handleProgress = (progress: BatchAnalysisProgress) => {
        setReanalyzeProgress(progress);
        // 实时更新部分结果
        if (progress.partialResult) {
          setReanalyzeResult(progress.partialResult);
        }
      };

      // 调用分批分析服务
      const result = await analyzeProjectScriptsWithProgress(scriptFiles, analysisModel, handleProgress);
      console.log('[重新分析] 分析结果:', result);
      setReanalyzeResult(result);

    } catch (error) {
      console.error('重新分析失败:', error);
      alert(`分析失败: ${error}`);
    } finally {
      setIsReanalyzing(false);
    }
  };

  // 🆕 确认重新分析结果，更新项目
  const confirmReanalyzeResult = () => {
    if (!currentProject || !reanalyzeResult) return;

    const result = reanalyzeResult;

    // 更新项目
    const updatedProject: Project = {
      ...currentProject,
      updatedAt: new Date().toISOString(),
      settings: {
        ...currentProject.settings,
        genre: result.genre || currentProject.settings.genre,
        worldView: result.worldView || currentProject.settings.worldView,
        visualStyle: result.visualStyle || currentProject.settings.visualStyle,
        keyTerms: result.keyTerms.length > 0 ? result.keyTerms : currentProject.settings.keyTerms,
      },
      characters: result.characters.length > 0 ? result.characters : currentProject.characters,
      scenes: result.scenes.length > 0 ? result.scenes : currentProject.scenes,
      volumes: result.volumes || currentProject.volumes,
      antagonists: result.antagonists || currentProject.antagonists,
      storyOutline: result.episodeSummaries.length > 0 ? result.episodeSummaries : currentProject.storyOutline,
    };

    handleUpdateProject(updatedProject);

    // 返回项目主界面
    setCurrentStep(AppStep.PROJECT_DASHBOARD);
    setReanalyzeProgress(null);
    setReanalyzeResult(null);
  };

  // 🆕 取消重新分析，返回项目主界面
  const cancelReanalyze = () => {
    setCurrentStep(AppStep.PROJECT_DASHBOARD);
    setReanalyzeProgress(null);
    setReanalyzeResult(null);
    setIsReanalyzing(false);
  };

  // ═══════════════════════════════════════════════════════════════

  // 从剧本自动提取角色（智能模式：优先从项目角色库筛选当集角色）
  const extractCharactersFromScriptHandler = async () => {
    if (!script.trim()) {
      alert('请先输入剧本内容');
      return;
    }
    setIsExtractingChars(true);
    try {
      // 如果有项目角色库，优先从中筛选当集出现的角色
      if (currentProject && currentProject.characters && currentProject.characters.length > 0) {
        const scriptLower = script.toLowerCase();
        const matchedChars = currentProject.characters.filter(c => {
          // 只检查完整角色名是否出现在剧本中（不再使用简称匹配，避免误匹配）
          const nameInScript = scriptLower.includes(c.name.toLowerCase());
          return nameInScript;
        });

        if (matchedChars.length > 0) {
          setCharacterRefs(matchedChars);
          console.log(`[智能提取] 从项目角色库中匹配到${matchedChars.length}个当集角色:`, matchedChars.map(c => c.name));
          // 🆕 添加用户反馈
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
        // 🆕 添加用户反馈
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

  const toggleCharacterInShot = (shotId: string, charId: string) => {
    setShots(prev => prev.map(s => {
      if (s.id === shotId) {
        const currentIds = s.assignedCharacterIds || [];
        const nextIds = currentIds.includes(charId)
          ? currentIds.filter(id => id !== charId)
          : [...currentIds, charId];
        return { ...s, assignedCharacterIds: nextIds };
      }
      return s;
    }));
  };

  const updateShotField = (shotId: string, field: keyof Shot, value: string) => {
    setShots(prev => prev.map(s => s.id === shotId ? { ...s, [field]: value } : s));
  };

  const downloadScript = () => {
    // 🆕 提取本集出现的角色信息
    const characterIdsInEpisode = new Set<string>();
    shots.forEach(shot => {
      if (shot.assignedCharacterIds) {
        shot.assignedCharacterIds.forEach(id => characterIdsInEpisode.add(id));
      }
    });

    // 🆕 修复：从 characterRefs 中筛选本集角色（而不是 currentProject.characters）
    const episodeCharacters = characterRefs.filter(char =>
      characterIdsInEpisode.has(char.id)
    );

    // 生成角色信息部分
    let characterSection = '';
    if (episodeCharacters.length > 0) {
      const characterTexts = episodeCharacters.map(char => {
        const parts = [`👤 ${char.name}`];

        if (char.gender) {
          parts.push(`   性别: ${char.gender}`);
        }

        if (char.appearance) {
          parts.push(`   外貌: ${char.appearance}`);
        }

        if (char.identityEvolution) {
          parts.push(`   身份: ${char.identityEvolution}`);
        }

        if (char.quote) {
          parts.push(`   台词: ${char.quote}`);
        }

        if (char.abilities && char.abilities.length > 0) {
          parts.push(`   能力: ${char.abilities.join('、')}`);
        }

        return parts.join('\n');
      });

      characterSection = [
        ``,
        `╔═══════════════════════════════════════════════════════════════════╗`,
        `║                       本 集 角 色 信 息                           ║`,
        `╚═══════════════════════════════════════════════════════════════════╝`,
        ``,
        characterTexts.join('\n\n'),
        ``,
        `═══════════════════════════════════════════════════════════════════`,
        ``,
        ``
      ].join('\n');
    }

    const content = shots.map(s => {
      const isMotion = s.shotType === '运动';
      const lines = [
        `═══════════════════════════════════════════════════════════════════`,
        `[#${s.shotNumber}] ${s.duration || '—'} | ${s.shotType || '静态'} | ${s.shotSize || '—'}`,
        `═══════════════════════════════════════════════════════════════════`,
        ``,
        `📖 故事: ${s.storyBeat || '—'}`,
        `💬 台词: ${s.dialogue || '—'}`,
        ``,
        `───────────────────────────────────────────────────────────────────`,
        `📐 角度: ${s.angleDirection || '—'} + ${s.angleHeight || '—'}`,
        `🎬 运镜: ${s.cameraMove || '—'} ${s.cameraMoveDetail ? `| ${s.cameraMoveDetail}` : ''}`,
        ``,
        `🖼️ 构图:`,
        `   FG: ${s.foreground || '—'}`,
        `   MG: ${s.midground || '—'}`,
        `   BG: ${s.background || '—'}`,
        ``,
        `💡 光影: ${s.lighting || '—'}`,
      ];

      // 🆕 添加镜头中的角色信息
      if (s.assignedCharacterIds && s.assignedCharacterIds.length > 0) {
        const characterNames = s.assignedCharacterIds
          .map(id => {
            const char = characterRefs.find(c => c.id === id);
            return char ? char.name : id;
          })
          .join('、');
        lines.push(`👥 角色: ${characterNames}`);
      }

      if (isMotion) {
        lines.push(
          ``,
          `───────────────────────────────────────────────────────────────────`,
          `🟢 首帧: ${s.startFrame || '—'}`,
          `🟠 尾帧: ${s.endFrame || '—'}`,
          `🏃 动线: ${s.motionPath || '—'}`
        );
      }

      // 🆕 不再导出 AI 提示词内容

      return lines.join('\n');
    }).join('\n\n\n');

    // 添加头部信息
    const header = [
      `╔═══════════════════════════════════════════════════════════════════╗`,
      `║                       分 镜 脚 本 导 出                           ║`,
      `╠═══════════════════════════════════════════════════════════════════╣`,
      `║  镜头总数: ${shots.length.toString().padEnd(10)}                                       ║`,
      `║  角色数量: ${episodeCharacters.length.toString().padEnd(10)}                                       ║`,
      `║  导出时间: ${new Date().toLocaleString().padEnd(22)}                      ║`,
      `╚═══════════════════════════════════════════════════════════════════╝`,
      ``,
      ``
    ].join('\n');

    const blob = new Blob([header + characterSection + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "storyboard_script.txt";
    link.click();
  };

  // 🆕 清洗剧本
  const startScriptCleaning = async () => {
    if (!script.trim()) return alert("请输入脚本内容");
    setCleaningResult(null);
    setCleaningProgress('');
    setCurrentStep(AppStep.SCRIPT_CLEANING);
    setIsCleaning(true);

    try {
      const stream = cleanScriptStream(script, analysisModel);
      let lastText = '';
      for await (const text of stream) {
        lastText = text;
        setCleaningProgress(text);
      }

      // 解析最终结果
      if (lastText) {
        try {
          // 尝试多种方式提取JSON
          let jsonStr = lastText;

          // 1. 移除markdown代码块
          jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

          // 2. 尝试找到JSON对象的起止位置
          const jsonStart = jsonStr.indexOf('{');
          const jsonEnd = jsonStr.lastIndexOf('}');

          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
          }

          const parsed = JSON.parse(jsonStr);
          setCleaningResult({
            ...parsed,
            originalScript: script
          });
        } catch (parseError) {
          console.error('解析清洗结果失败:', parseError, '\n原始文本:', lastText.substring(0, 500));
          // 即使解析失败，也显示原始结果供用户查看
          setCleaningResult({
            cleanedScenes: [],
            constraints: [],
            sceneWeights: [],
            originalScript: script,
            rawOutput: lastText,
            parseError: true
          });
        }
      }
    } catch (error) {
      console.error(error);
      alert("清洗中断，请检查网络");
    } finally {
      setIsCleaning(false);
    }
  };

  const startShotListGeneration = async () => {
    if (!script.trim()) return alert("请输入脚本内容");

    // 🔧 强制使用思维链模式
    await startChainOfThoughtGeneration();
    return;

    // 🗑️ 已移除传统模式（下方代码保留但不会执行）
    setShots([]);
    setStreamText('');
    setSuggestions([]);
    setCurrentStep(AppStep.GENERATE_LIST);
    setIsLoading(true);
    setProgressMsg("分镜构思中...");

    try {
      const constraintsText = cleaningResult?.constraints?.map(c =>
        `【约束】${c.rule}: ${c.implication}`
      ).join('\n') || '';

      // 旧版流程：使用内置默认提示词（已切换到CoT流程，此处仅作兼容）
      const defaultPrompt = constraintsText
        ? `## 剧本设定约束（必须遵守）\n${constraintsText}`
        : '';

      const stream = generateShotListStream(script, defaultPrompt, analysisModel, characterRefs);
      for await (const text of stream) {
        setStreamText(text);
      }
    } catch (error) {
      console.error(error);
      alert("生成中断，请检查网络");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 🆕 检查是否有已保存的思维链状态（用于断点续传）
   */
  const checkSavedCotProgress = (): { hasProgress: boolean; lastStage: number; data: any } => {
    try {
      const stage1 = localStorage.getItem(STORAGE_KEYS.COT_STAGE1);
      const stage2 = localStorage.getItem(STORAGE_KEYS.COT_STAGE2);
      const stage3 = localStorage.getItem(STORAGE_KEYS.COT_STAGE3);
      const stage4 = localStorage.getItem(STORAGE_KEYS.COT_STAGE4);
      const stage5 = localStorage.getItem(STORAGE_KEYS.COT_STAGE5);

      let lastStage = 0;
      const data: any = {};

      if (stage1) {
        data.stage1 = JSON.parse(stage1);
        lastStage = 1;
      }
      if (stage2) {
        data.stage2 = JSON.parse(stage2);
        lastStage = 2;
      }
      if (stage3) {
        data.stage3 = JSON.parse(stage3);
        lastStage = 3;
      }
      if (stage4) {
        data.stage4 = JSON.parse(stage4);
        lastStage = 4;
      }
      if (stage5) {
        data.stage5 = JSON.parse(stage5);
        lastStage = 5;
      }

      return { hasProgress: lastStage > 0, lastStage, data };
    } catch (error) {
      console.error('检查保存的进度失败:', error);
      return { hasProgress: false, lastStage: 0, data: {} };
    }
  };

  /**
   * 🆕 清除已保存的思维链进度
   */
  const clearSavedCotProgress = () => {
    localStorage.removeItem(STORAGE_KEYS.COT_STAGE1);
    localStorage.removeItem(STORAGE_KEYS.COT_STAGE2);
    localStorage.removeItem(STORAGE_KEYS.COT_STAGE3);
    localStorage.removeItem(STORAGE_KEYS.COT_STAGE4);
    localStorage.removeItem(STORAGE_KEYS.COT_STAGE5);
    localStorage.removeItem('storyboard_cot_stage1_raw');
    localStorage.removeItem('storyboard_cot_stage2_raw');
    localStorage.removeItem('storyboard_cot_stage3_raw');
    localStorage.removeItem('storyboard_cot_stage5_raw');
    console.log('✅ 已清除保存的思维链进度');
  };

  // 🆕 思维链5阶段生成
  const startChainOfThoughtGeneration = async (resumeFromStage?: number) => {
    setShots([]);
    setStreamText('');
    setSuggestions([]);
    setCotRawOutput('');
    setCotCurrentStage(null);
    setCurrentStep(AppStep.GENERATE_LIST);
    setIsLoading(true);

    // 🆕 显示进度对话框
    setShowCotProgressModal(true);
    setCotProgressMinimized(false);
    setCotError(null);
    setCotStartTime(Date.now());

    // 🆕 检查是否从断点恢复
    let stage1Result: any = null;
    let stage2Result: any = null;
    let stage3Result: any = null;
    const allDesignedShots: ShotDesign[] = [];

    const savedProgress = checkSavedCotProgress();
    const startFromStage = resumeFromStage || (savedProgress.hasProgress ? savedProgress.lastStage + 1 : 1);

    if (savedProgress.hasProgress && !resumeFromStage) {
      const confirmResume = confirm(
        `检测到上次生成在阶段${savedProgress.lastStage}中断。\n\n` +
        `是否从阶段${savedProgress.lastStage + 1}继续？\n\n` +
        `点击"确定"继续，点击"取消"重新开始`
      );

      if (!confirmResume) {
        clearSavedCotProgress();
        setCotStage1(null);
        setCotStage2(null);
        setCotStage3(null);
        setCotStage4(null);
        setCotStage5(null);
      } else {
        // 恢复已保存的状态
        if (savedProgress.data.stage1) {
          stage1Result = savedProgress.data.stage1;
          setCotStage1(stage1Result);
          setStreamText('【阶段1】剧本分析\n\n✅ 已从保存的进度恢复\n\n');
        }
        if (savedProgress.data.stage2) {
          stage2Result = savedProgress.data.stage2;
          setCotStage2(stage2Result);
          setStreamText(prev => prev + '【阶段2】视觉策略\n\n✅ 已从保存的进度恢复\n\n');
        }
        if (savedProgress.data.stage3) {
          stage3Result = savedProgress.data.stage3;
          setCotStage3(stage3Result);
          setStreamText(prev => prev + '【阶段3】镜头分配\n\n✅ 已从保存的进度恢复\n\n');
        }
        if (savedProgress.data.stage4) {
          allDesignedShots.push(...savedProgress.data.stage4);
          setCotStage4(savedProgress.data.stage4);
          setStreamText(prev => prev + '【阶段4】逐镜设计\n\n✅ 已从保存的进度恢复\n\n');
        }
        if (savedProgress.data.stage5) {
          setCotStage5(savedProgress.data.stage5);
          setStreamText(prev => prev + '【阶段5】质量自检\n\n✅ 已从保存的进度恢复\n\n');
        }
      }
    }

    // 🔧 辅助函数：将设计结果转换为Shot格式（移到外部作用域，确保所有阶段都可访问）
    const convertDesignToShot = (rawDesign: any, idx: number): Shot => {
      const shotList = stage3Result?.shotList || [];
      const design = rawDesign.design || rawDesign;
      const comp = design.composition || {};
      const lightingData = design.lighting || {};
      const camera = design.camera || {};
      const characters = design.characters || {};
      const aiPrompt = rawDesign.aiPrompt || {};
      const storyBeatData = rawDesign.storyBeat || {};

      const shotSize = comp.shotSize || design.shotSize || rawDesign.shotSize || 'MS';
      const cameraAngle = comp.cameraAngle || design.cameraAngle || rawDesign.cameraAngle || '轻微仰拍(Mild Low)';
      const cameraDirection = comp.cameraDirection || design.cameraDirection || rawDesign.cameraDirection || '3/4正面(3/4 Front)';

      if (idx === 0) {
        console.log('[convertDesignToShot] 第一个镜头的数据结构:', {
          shotNumber: rawDesign.shotNumber,
          shotSize: { comp: comp.shotSize, design: design.shotSize, raw: rawDesign.shotSize, final: shotSize },
          cameraAngle: { comp: comp.cameraAngle, design: design.cameraAngle, raw: rawDesign.cameraAngle, final: cameraAngle },
          cameraDirection: { comp: comp.cameraDirection, design: design.cameraDirection, raw: rawDesign.cameraDirection, final: cameraDirection }
        });
      }

      const depthLayers = comp.depthLayers || {};
      const fg = depthLayers.foreground || comp.foreground || '';
      const mg = depthLayers.midground || comp.midground || '';
      const bg = depthLayers.background || comp.background || '';

      const lightingDesc = lightingData.description || lightingData.mood ||
                          (lightingData.keyLight ? `主光:${lightingData.keyLight}` : '');

      const cameraMovement = camera.movement || '固定';
      const cameraSpeed = camera.speed || '';

      const visualDesignText = [
        `【景别】${shotSize}`,
        `【角度】${cameraAngle} + ${cameraDirection}`,
        `【透视】${comp.perspective || '标准透视'}`,
        `【构图】${comp.framing || ''}`,
        `  FG: ${fg}`,
        `  MG: ${mg}`,
        `  BG: ${bg}`,
        `【光影】${lightingDesc}`,
        cameraMovement && cameraMovement !== '固定' ? `【运镜】${cameraMovement}${cameraSpeed ? ` (${cameraSpeed})` : ''}` : ''
      ].filter(Boolean).join('\n');

      const storyEvent = storyBeatData.event ||
                        characters.actions ||
                        shotList[idx]?.briefDescription ||
                        `镜头${idx + 1}`;

      const dialogue = storyBeatData.dialogue || '';

      const isMoving = cameraMovement && cameraMovement !== '固定' && cameraMovement !== 'static' && cameraMovement !== 'Static';

      let videoMode: 'I2V' | 'Keyframe' | undefined;
      const llmVideoMode = rawDesign.videoMode?.toLowerCase();

      if (llmVideoMode === 'keyframe') {
        videoMode = 'Keyframe';
      } else if (llmVideoMode === 'i2v' || llmVideoMode === 'static') {
        videoMode = 'I2V';
      } else if (isMoving) {
        const durationNum = parseInt(rawDesign.duration || '5', 10) || 5;
        const hasSignificantChange = camera.startFrame && camera.endFrame &&
          camera.startFrame !== '—' && camera.endFrame !== '—' &&
          camera.startFrame !== camera.endFrame;
        const decision = determineVideoMode(
          storyEvent,
          durationNum,
          !!hasSignificantChange,
          isMoving ? '运动' : '静态',
          cameraMovement
        );
        videoMode = decision.mode === 'Keyframe' ? 'Keyframe' : 'I2V';
      } else {
        videoMode = 'I2V';
      }

      const shotSizeMap: Record<string, string> = {
        'ELS': '大远景(ELS)', 'LS': '远景(LS)', 'MLS': '中全景(MLS)',
        'MS': '中景(MS)', 'MCU': '中近景(MCU)', 'CU': '近景(CU)',
        'ECU': '特写(ECU)', 'Macro': '微距(Macro)'
      };
      const normalizedShotSize = shotSizeMap[shotSize] || shotSize;

      const angleDirectionMap: Record<string, string> = {
        'front': '正面(Front)', 'front view': '正面(Front)',
        '3/4 front': '3/4正面(3/4 Front)', '3/4 front view': '3/4正面(3/4 Front)',
        'side': '正侧面(Full Side)', 'side view': '正侧面(Full Side)', 'profile': '正侧面(Full Side)',
        'back': '背面(Back)', 'back view': '背面(Back)',
        '正面': '正面(Front)', '侧面': '正侧面(Full Side)', '背面': '背面(Back)'
      };
      const normalizedAngleDirection = angleDirectionMap[cameraDirection.toLowerCase()] || cameraDirection;

      const angleHeightMap: Record<string, string> = {
        'eye level': '平视(Eye Level)', 'eye-level': '平视(Eye Level)',
        'low angle': '仰拍(Low Angle)', 'low': '仰拍(Low Angle)',
        'mild low angle': '轻微仰拍(Mild Low)', 'slight low angle': '轻微仰拍(Mild Low)',
        'high angle': '俯拍(High Angle)', 'high': '俯拍(High Angle)',
        'mild high angle': '轻微俯拍(Mild High)', 'slight high angle': '轻微俯拍(Mild High)',
        'extreme high angle': '鸟瞰(Extreme High)', 'top-down': '鸟瞰(Extreme High)',
        'extreme low angle': '蚁视(Extreme Low)',
        '平视': '平视(Eye Level)', '俯拍': '俯拍(High Angle)', '仰拍': '仰拍(Low Angle)'
      };
      const normalizedAngleHeight = angleHeightMap[cameraAngle.toLowerCase()] || cameraAngle;

      const cameraMoveMap: Record<string, string> = {
        'static': '固定(Static)', '固定': '固定(Static)',
        'push in': '推进(Push In)', 'push': '推进(Push In)',
        'pull out': '拉远(Pull Out)', 'pull': '拉远(Pull Out)',
        'pan': '横摇(Pan)', 'pan left': '横摇(Pan)', 'pan right': '横摇(Pan)',
        'tilt': '竖摇(Tilt)', 'tilt up': '竖摇(Tilt)', 'tilt down': '竖摇(Tilt)',
        'track': '跟随(Track)', 'tracking': '跟随(Track)', 'follow': '跟随(Track)',
        'crane': '升降(Crane)', 'crane up': '升降(Crane)', 'crane down': '升降(Crane)',
        'dolly': '移动(Dolly)', 'dolly in': '移动(Dolly)', 'dolly out': '移动(Dolly)',
        'handheld': '手持(Handheld)', 'shake': '手持(Handheld)',
        'arc': '环绕(Arc)', 'orbit': '环绕(Arc)', '360': '环绕(Arc)',
        'zoom': '变焦(Zoom)'
      };
      const normalizedCameraMove = cameraMoveMap[cameraMovement.toLowerCase()] || cameraMovement;

      return {
        id: `shot-cot-${idx}`,
        shotNumber: rawDesign.shotNumber?.replace('#', '') || String(idx + 1).padStart(2, '0'),
        duration: rawDesign.duration || `${shotList[idx]?.duration || 4}s`,
        shotType: isMoving ? '运动' : '静态',
        sceneId: rawDesign.sceneId || shotList[idx]?.sceneId || '',
        videoMode: videoMode,
        storyBeat: storyEvent,
        dialogue: dialogue,
        shotSize: normalizedShotSize as any,
        angleDirection: normalizedAngleDirection as any,
        angleHeight: normalizedAngleHeight as any,
        dutchAngle: comp.dutchAngle || '',
        foreground: fg,
        midground: mg,
        background: bg,
        lighting: lightingDesc,
        cameraMove: normalizedCameraMove as any,
        cameraMoveDetail: cameraSpeed || camera.description || '',
        motionPath: comp.blocking || characters.positions || '',
        startFrame: camera.startFrame || rawDesign.startFrame || '',
        endFrame: camera.endFrame || rawDesign.endFrame || '',
        videoPromptCn: aiPrompt.videoPromptCn || '',
        videoPrompt: aiPrompt.videoPrompt || '',
        directorNote: rawDesign.directorNote || '',
        technicalNote: rawDesign.technicalNote || '',
        promptCn: '',
        promptEn: '',
        endFramePromptCn: '',
        endFramePromptEn: '',
        theory: rawDesign.theory || '',
        status: 'pending'
      };
    };

    // 🔧 辅助函数：限制正面视角使用上限
    const applyFrontViewLimit = (inputShots: Shot[]): Shot[] => {
      let frontCount = 0;
      return inputShots.map((shot) => {
        if (shot.angleDirection === '正面(Front)') {
          frontCount += 1;
          if (frontCount > 2) {
            const downgradedDirection = '3/4正面(3/4 Front)' as Shot['angleDirection'];
            return {
              ...shot,
              angleDirection: downgradedDirection,
            };
          }
        }
        return shot;
      });
    };

    // 🔧 辅助函数：强制角度多样化
    const applyAngleDiversityLimit = (inputShots: Shot[]): Shot[] => {
      const totalShots = inputShots.length;
      const maxThreeQuarterFront = Math.max(3, Math.floor(totalShots * 0.25));
      const maxStaticShots = 2;
      let threeQuarterCount = 0;
      let staticCount = 0;

      const alternativeDirections: Shot['angleDirection'][] = [
        '正侧面(Full Side)',
        '1/3侧面(1/3 Side)',
        '3/4背面(3/4 Back)',
        '1/3背面(1/3 Back)'
      ];
      const alternativeMoves: Shot['cameraMove'][] = [
        '推镜(Dolly In)',
        '拉镜(Dolly Out)',
        '左摇(Pan Left)',
        '右摇(Pan Right)'
      ];
      let altDirIdx = 0;
      let altMoveIdx = 0;

      return inputShots.map((shot, idx) => {
        let modifiedShot = { ...shot };

        if (modifiedShot.angleDirection === '3/4正面(3/4 Front)') {
          threeQuarterCount += 1;
          if (threeQuarterCount > maxThreeQuarterFront) {
            const newDirection = alternativeDirections[altDirIdx % alternativeDirections.length];
            altDirIdx += 1;
            console.log(`[角度多样化] 镜头#${modifiedShot.shotNumber}: 3/4正面(${threeQuarterCount}个) → ${newDirection}`);
            modifiedShot = { ...modifiedShot, angleDirection: newDirection };
          }
        }

        if (modifiedShot.cameraMove === '固定(Static)') {
          staticCount += 1;
          if (staticCount > maxStaticShots) {
            const newMove = alternativeMoves[altMoveIdx % alternativeMoves.length];
            altMoveIdx += 1;
            console.log(`[运镜多样化] 镜头#${modifiedShot.shotNumber}: 固定(${staticCount}个) → ${newMove}（轻微缓慢）`);
            modifiedShot = {
              ...modifiedShot,
              cameraMove: newMove,
              cameraMoveDetail: (modifiedShot.cameraMoveDetail || '') + '（轻微缓慢）'
            };
          }
        }

        return modifiedShot;
      });
    };

    try {
      // ========== 阶段1：剧本分析 ==========
      if (startFromStage <= 1) {
        setCotCurrentStage(1);
        setProgressMsg("【阶段1/5】剧本分析中...");
        let stage1Text = '';

        // 🆕 添加重试机制
        const maxRetries = 3;
        let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          stage1Text = '';
          const stage1Gen = generateStage1Analysis(script, analysisModel);
          for await (const chunk of stage1Gen) {
            stage1Text += chunk;
            setCotRawOutput(stage1Text);
            setStreamText(`【阶段1】剧本分析\n\n${stage1Text}`);
          }

          // 尝试解析结果
          stage1Result = parseStage1Output(stage1Text);
          setCotStage1(stage1Result);
          // 🆕 保存阶段1结果到localStorage（断点续传）
          localStorage.setItem(STORAGE_KEYS.COT_STAGE1, JSON.stringify(stage1Result));
          localStorage.setItem('storyboard_cot_stage1_raw', stage1Text);
          setStreamText(prev => prev + '\n\n✅ 阶段1完成！（已保存）');
          break; // 成功则跳出重试循环

        } catch (error: any) {
          retryCount++;
          console.warn(`[WARN] 阶段1失败 (重试 ${retryCount}/${maxRetries}):`, error.message);

          if (retryCount >= maxRetries) {
            // 超过最大重试次数，提供更友好的错误提示
            throw new Error(
              `阶段1剧本分析失败（已重试${maxRetries}次）\n\n` +
              `可能原因：\n` +
              `1. 网络连接不稳定 - 请检查网络连接\n` +
              `2. API服务暂时不可用 - 请稍后重试\n` +
              `3. 剧本内容过长 - 请尝试缩短剧本\n\n` +
              `原始错误：${error.message}`
            );
          }

          // 等待2秒后重试
          setProgressMsg(`【阶段1/5】网络错误，${2}秒后重试 (${retryCount}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      }

      // ========== 阶段2：视觉策略 ==========
      if (startFromStage <= 2) {
        setCotCurrentStage(2);
        setProgressMsg("【阶段2/5】视觉策略规划中...");
        let stage2Text = '';

        const maxRetries = 3;
        let retryCount = 0;
      while (retryCount < maxRetries) {
        try {
          stage2Text = '';
          const stage2Gen = generateStage2Analysis(stage1Result, analysisModel);
          for await (const chunk of stage2Gen) {
            stage2Text += chunk;
            setCotRawOutput(stage2Text);
            setStreamText(`【阶段2】视觉策略\n\n${stage2Text}`);
          }

          stage2Result = parseStage2Output(stage2Text);
          setCotStage2(stage2Result);
          // 🆕 保存阶段2结果到localStorage（断点续传）
          localStorage.setItem(STORAGE_KEYS.COT_STAGE2, JSON.stringify(stage2Result));
          localStorage.setItem('storyboard_cot_stage2_raw', stage2Text);
          setStreamText(prev => prev + '\n\n✅ 阶段2完成！（已保存）');
          break;

        } catch (error: any) {
          retryCount++;
          console.warn(`[WARN] 阶段2失败 (重试 ${retryCount}/${maxRetries}):`, error.message);

          if (retryCount >= maxRetries) {
            throw new Error(`阶段2视觉策略规划失败（已重试${maxRetries}次）\n原始错误：${error.message}`);
          }

          setProgressMsg(`【阶段2/5】网络错误，${2}秒后重试 (${retryCount}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      }

      // ========== 阶段3：镜头分配 ==========
      if (startFromStage <= 3) {
        setCotCurrentStage(3);
        setProgressMsg("【阶段3/5】镜头分配中...");
        let stage3Text = '';

        const maxRetries = 3;
        let retryCount = 0;
      while (retryCount < maxRetries) {
        try {
          stage3Text = '';
          const stage3Gen = generateStage3Analysis(script, stage1Result, stage2Result, analysisModel);
          for await (const chunk of stage3Gen) {
            stage3Text += chunk;
            setCotRawOutput(stage3Text);
            setStreamText(`【阶段3】镜头分配\n\n${stage3Text}`);
          }

          stage3Result = parseStage3Output(stage3Text);
          setCotStage3(stage3Result);
          // 🆕 保存阶段3结果到localStorage（断点续传）
          localStorage.setItem(STORAGE_KEYS.COT_STAGE3, JSON.stringify(stage3Result));
          localStorage.setItem('storyboard_cot_stage3_raw', stage3Text);
          setStreamText(prev => prev + '\n\n✅ 阶段3完成！（已保存）');
          break;

        } catch (error: any) {
          retryCount++;
          console.warn(`[WARN] 阶段3失败 (重试 ${retryCount}/${maxRetries}):`, error.message);

          if (retryCount >= maxRetries) {
            throw new Error(`阶段3镜头分配失败（已重试${maxRetries}次）\n原始错误：${error.message}`);
          }

          setProgressMsg(`【阶段3/5】网络错误，${2}秒后重试 (${retryCount}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      }

      // ========== 阶段4：逐镜设计 ==========
      if (startFromStage <= 4) {
        setCotCurrentStage(4);
        const shotList = stage3Result.shotList || [];

      // 🔧 注意：convertDesignToShot、applyFrontViewLimit、applyAngleDiversityLimit 函数已移到外部作用域（第1406行）

      // 分批处理（每批6个镜头）
      const batchSize = 6;
      const totalBatches = Math.ceil(shotList.length / batchSize);
      let completedShotCount = 0;

      for (let i = 0; i < shotList.length; i += batchSize) {
        const batch = shotList.slice(i, i + batchSize) as ShotListItem[];
        const batchNum = Math.floor(i / batchSize) + 1;

        setProgressMsg(`【阶段4/5】逐镜设计 ${batchNum}/${totalBatches}...`);

        // 🆕 添加重试机制
        let stage4Text = '';
        let retryCount = 0;
        const maxRetries = 3;

	        while (retryCount < maxRetries) {
	          try {
	            stage4Text = '';
	            const stage4Gen = generateStage4Analysis(script, stage1Result, stage2Result, stage3Result, batch, analysisModel);
            for await (const chunk of stage4Gen) {
              stage4Text += chunk;
              setCotRawOutput(stage4Text);
              setStreamText(`【阶段4】逐镜设计 (批次 ${batchNum}/${totalBatches})\n\n${stage4Text}`);
            }
            break; // 成功则跳出重试循环
          } catch (error: any) {
            retryCount++;
            console.warn(`[WARN] 阶段4批次${batchNum}失败 (重试 ${retryCount}/${maxRetries}):`, error.message);
            if (retryCount >= maxRetries) {
              throw error; // 超过最大重试次数则抛出错误
            }
            // 等待2秒后重试
            setProgressMsg(`【阶段4/5】网络错误，${2}秒后重试 (${retryCount}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        const stage4Result = parseStage4Output(stage4Text);
        allDesignedShots.push(...(stage4Result.shots || []));

	      	// 🆕 实时更新分镜表格显示（同时应用正面视角使用上限和角度多样化）
	      	const convertedShots = allDesignedShots.map((design, idx) => convertDesignToShot(design, idx));
	      	const currentShots = applyAngleDiversityLimit(applyFrontViewLimit(convertedShots));
	      	setShots(currentShots);
        completedShotCount = currentShots.length;

        setStreamText(prev => `【阶段4】逐镜设计 (批次 ${batchNum}/${totalBatches})\n\n${stage4Text}\n\n✅ 已完成 ${completedShotCount} 个镜头`);
      }

        setCotStage4(allDesignedShots);
        // 🆕 保存阶段4结果到localStorage（断点续传）
        localStorage.setItem(STORAGE_KEYS.COT_STAGE4, JSON.stringify(allDesignedShots));
        setStreamText(prev => prev + `\n\n✅ 阶段4完成！共设计 ${allDesignedShots.length} 个镜头（已保存）`);
      }

      // ========== 阶段5：质量自检 ==========
      if (startFromStage <= 5) {
        setCotCurrentStage(5);
      setProgressMsg("【阶段5/5】质量自检与优化...");
      setStreamText(prev => prev + `\n\n【阶段5】质量自检与优化\n\n正在审核所有镜头设计...`);

      console.log('[DEBUG] 开始调用阶段5 API...');
      console.log('[DEBUG] 待审核镜头数:', allDesignedShots.length);

      // 🔧 转换 ShotDesign[] 为 ShotDesignResult[]
      const shotDesignResults = allDesignedShots.map(design => ({
        shotNumber: design.shotNumber,
        design: {
          composition: design.composition,
          lighting: {
            // 从 cameraAngle 或其他字段推断光照信息
            description: design.theory || '',
            direction: design.continuityCheck?.lightDirection || 'unknown'
          },
          camera: {
            angle: design.cameraAngle,
            size: design.shotSize,
            reason: design.reason
          },
          characters: {
            // 从 storyBeat 提取角色信息
            emotion: design.storyBeat.emotion,
            dialogue: design.storyBeat.dialogue,
            event: design.storyBeat.event
          }
        },
        aiPrompt: {
          visual: design.aiPromptCn,
          motion: design.videoPromptCn,
          style: design.theory || '',
          negative: ''
        }
      }));

      let stage5Text = '';
      for await (const chunk of generateStage5Review(stage1Result, stage2Result, shotDesignResults, analysisModel)) {
        stage5Text += chunk;
        setCotRawOutput(stage5Text);
        setStreamText(`【阶段5】质量自检与优化\n\n${stage5Text}`);
      }

      console.log('[DEBUG] 阶段5流式数据接收完成');

      const stage5Result = parseStage5Output(stage5Text);
      setCotStage5(stage5Result);
      // 🆕 保存阶段5结果到localStorage（断点续传）
      localStorage.setItem(STORAGE_KEYS.COT_STAGE5, JSON.stringify(stage5Result));
      localStorage.setItem('storyboard_cot_stage5_raw', stage5Text);

      console.log('[解析成功] 阶段5质量检查结果:', stage5Result);
      setStreamText(prev => prev + `\n\n✅ 阶段5完成！质量评分: ${stage5Result.overallScore}/100 (${stage5Result.rating})（已保存）`);

      // 显示质量检查结果
      const allIssues = [
        ...(stage5Result.perspectiveCheck?.issues || []).map(i => ({ type: '透视', ...i })),
        ...(stage5Result.angleCheck?.issues || []).map(i => ({ type: '角度', ...i })),
        ...(stage5Result.continuityCheck?.issues || []).map(i => ({ type: '连续性', ...i })),
        ...(stage5Result.emotionCheck?.issues || []).map(i => ({ type: '情绪', ...i }))
      ];

      if (allIssues.length > 0) {
        console.warn('⚠️ 质量检查发现问题：');
        allIssues.forEach(issue => {
          console.warn(`⚠️ [${issue.type}] ${issue.problem}`);
        });
        setStreamText(prev => prev + `\n\n⚠️ 发现 ${allIssues.length} 个问题，详见控制台`);
      } else {
        setStreamText(prev => prev + `\n\n✅ 质量检查通过，未发现问题`);
      }

      // 确保最终的shots已设置，并应用正面视角上限和角度多样化规则
      const finalConverted = allDesignedShots.map((design, idx) => convertDesignToShot(design, idx));
      let finalShots = applyAngleDiversityLimit(applyFrontViewLimit(finalConverted));

      // 🆕 P0修复：提示词后处理（移除角度值和权重参数）
      console.log('\n[后处理] 开始提示词规范化...');
      finalShots = finalShots.map(shot => {
        // 移除角度值标注（如 (0°), (15-45°)），但保持类型有效性
        const cleanAngleDirection = shot.angleDirection?.replace(/\(\d+°\)/g, '').replace(/\(\d+-\d+°\)/g, '').trim();
        const cleanAngleHeight = shot.angleHeight?.replace(/\(\d+°\)/g, '').replace(/\(\d+-\d+°\)/g, '').trim();

        return {
          ...shot,
          angleDirection: cleanAngleDirection as typeof shot.angleDirection,
          angleHeight: cleanAngleHeight as typeof shot.angleHeight,

          // 移除英文提示词中的权重参数格式（如 (extreme long shot:1.3)）
          imagePromptEn: shot.imagePromptEn?.replace(/\([^)]+:\d+\.\d+\)/g, ''),
          endImagePromptEn: shot.endImagePromptEn?.replace(/\([^)]+:\d+\.\d+\)/g, ''),
          videoGenPrompt: shot.videoGenPrompt?.replace(/\([^)]+:\d+\.\d+\)/g, ''),
        };
      });
      console.log('✅ 提示词规范化完成');

      setShots(finalShots);

      // 🆕 生成本集概述（从思维链结果提取信息）
      if (currentProject && currentEpisodeNumber !== null) {
        const currentEpisode = currentProject.episodes?.find(ep => ep.episodeNumber === currentEpisodeNumber);
        const episodeTitle = currentEpisode?.title || `第${currentEpisodeNumber}集`;

        const summary = generateEpisodeSummary(
          currentEpisodeNumber,
          episodeTitle,
          stage1Result,
          stage2Result,
          stage3Result,
          finalShots
        );

        setEpisodeSummary(summary);
        console.log('✅ 本集概述已生成:', summary);
      }

      // 🆕 步骤7：角度分布校验
      console.log('\n[阶段7] 角度分布校验...');
      setProgressMsg('正在校验角度分布...');

      const angleReport = validateAngleDistribution(finalShots);
      const angleReportText = generateAngleDistributionReport(finalShots);

      console.log('\n' + angleReportText);

      // 如果角度分布不符合规则，提示用户
      if (!angleReport.overall.isValid) {
        const errorMsg = angleReport.overall.errors.join('\n');
        const warningMsg = angleReport.overall.warnings.join('\n');

        console.warn('⚠️ 角度分布存在问题：');
        console.warn(errorMsg);
        if (warningMsg) {
          console.warn(warningMsg);
        }

        // 显示提示（不阻断流程）
        alert(`⚠️ 角度分布校验发现问题：\n\n${errorMsg}\n\n${warningMsg}\n\n建议：\n1. 使用"质量自检"功能查看详细建议\n2. 手动调整不符合规则的镜头\n3. 或重新生成分镜`);
      } else {
        console.log('✅ 角度分布完全符合规则！');
      }

        setCotCurrentStage(null);
        setProgressMsg(`✅ 思维链生成完成！共 ${finalShots.length} 个镜头`);

        // 🔧 核心修复：保存当前剧集的分镜数据到后端
        if (currentProject && currentEpisodeNumber !== null) {
          const currentEpisode = currentProject.episodes?.find(ep => ep.episodeNumber === currentEpisodeNumber);
          if (currentEpisode) {
            // 🔧 验证项目ID和剧集ID是否匹配
            console.log(`[D1存储] 准备保存分镜 - 项目: ${currentProject.name} (${currentProject.id}), 剧集: 第${currentEpisodeNumber}集 (${currentEpisode.id})`);
            console.log(`[D1存储] 分镜数量: ${finalShots.length}, 第1个镜头: ${typeof finalShots[0]?.storyBeat === 'string' ? finalShots[0].storyBeat : finalShots[0]?.storyBeat?.event || '未知'}`);

            const updatedEpisode: Episode = {
              ...currentEpisode,
              shots: finalShots,
              status: 'generated',
              updatedAt: new Date().toISOString(),
            };

            try {
              await saveEpisode(currentProject.id, updatedEpisode);
              console.log(`[D1存储] ✅ 第${currentEpisodeNumber}集分镜保存成功`);
            } catch (error) {
              console.error('[D1存储] ❌ 保存剧集失败:', error);
              // 不阻断用户操作，只记录错误
            }
          } else {
            console.warn(`[D1存储] ⚠️ 未找到第${currentEpisodeNumber}集的元信息，跳过保存`);
          }
        } else {
          console.warn(`[D1存储] ⚠️ 缺少项目或剧集信息，跳过保存 - currentProject: ${!!currentProject}, currentEpisodeNumber: ${currentEpisodeNumber}`);
        }

        // 🆕 成功完成后清除保存的进度
        clearSavedCotProgress();
      }

    } catch (error) {
      console.error('思维链生成失败:', error);
      setStreamText(prev => prev + `\n\n❌ 错误: ${error}`);

      // 🆕 设置错误信息（显示在对话框中）
      setCotError(String(error));

      // 不再使用alert，改用对话框显示错误
      // alert(`思维链生成失败: ${error}`);
    } finally {
      setIsLoading(false);

      // 🆕 如果没有错误，3秒后自动关闭对话框
      if (!cotError) {
        setTimeout(() => {
          setShowCotProgressModal(false);
        }, 3000);
      }
    }
  };

  const startReview = async () => {
    setIsLoading(true);
    setProgressMsg("规则校验中...");

    try {
      // 🆕 步骤1：先进行代码级规则校验（分镜结构检查，不包含提示词检查）
      // 📝 提示词检查已移至"提取AI提示词"页面的"自检提示词"按钮
      const ruleBasedSuggestions: ReviewSuggestion[] = [];

      for (const shot of shots) {
        // 首帧描述缺失校验（所有运动镜头都需要首帧描述）
        const isMotion = shot.cameraMove && !['固定镜头', '静态', 'Static', ''].includes(shot.cameraMove);
        const startFrameMissing = !shot.startFrame || shot.startFrame === '—' || shot.startFrame.trim() === '';
        if (isMotion && startFrameMissing) {
          ruleBasedSuggestions.push({
            shotNumber: shot.shotNumber,
            suggestion: '首帧描述缺失！运动镜头必须包含首帧画面描述（人物位置/姿态/表情/道具/环境），用于AI生成该帧图像。',
            reason: '首帧描述缺失',
            selected: true
          });
        }

        // Keyframe 模式尾帧缺失校验
        if (shot.videoMode === 'Keyframe') {
          const endFrameMissing = !shot.endFrame || shot.endFrame === '—' || shot.endFrame.trim() === '';
          if (endFrameMissing) {
            ruleBasedSuggestions.push({
              shotNumber: shot.shotNumber,
              suggestion: '尾帧描述缺失！Keyframe模式必须包含尾帧画面描述，用于AI生成首尾帧两张图像。',
              reason: '尾帧描述缺失',
              selected: true
            });
          }
        }
      }

      // 🆕 步骤1.5：角度分布验证（P0修复）
      console.log('\n[自检] 开始角度分布验证...');
      const angleReport = validateAngleDistribution(shots);

      if (!angleReport.overall.isValid) {
        console.warn('⚠️ 角度分布存在问题：');
        angleReport.overall.errors.forEach(err => console.error(err));
        angleReport.overall.warnings.forEach(warn => console.warn(warn));

        // 添加角度分布问题到建议列表
        angleReport.overall.errors.forEach(error => {
          ruleBasedSuggestions.push({
            shotNumber: '全局',
            suggestion: error,
            reason: '角度分布规则违反',
            selected: true
          });
        });

        angleReport.overall.warnings.forEach(warning => {
          ruleBasedSuggestions.push({
            shotNumber: '全局',
            suggestion: warning,
            reason: '角度分布建议',
            selected: false  // 警告默认不选中
          });
        });
      } else {
        console.log('✅ 角度分布完全符合规则！');
      }

      // 🆕 步骤2：调用 LLM 进行语义审核
      setProgressMsg(`规则校验完成（${ruleBasedSuggestions.length}条），专家自检中...`);
      const llmRes = await reviewStoryboard(shots, '', reviewModel);

      // 🆕 合并规则校验和 LLM 审核结果
      const allSuggestions = [
        ...ruleBasedSuggestions.map(s => ({ ...s, source: 'rule' as const })),
        ...llmRes.map(s => ({ ...s, selected: true, source: 'llm' as const }))
      ];

      setSuggestions(allSuggestions);
      setCurrentStep(AppStep.REVIEW_OPTIMIZE);
    } catch (error) {
      console.error("Review failed", error);
      alert("自检失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  // 🆕 Tab切换处理函数
  const handleTabChange = (tab: EditTab) => {
    setCurrentTab(tab);
    // 同时更新currentStep，保持兼容性
    if (tab === 'generate') {
      setCurrentStep(AppStep.GENERATE_LIST);
    } else if (tab === 'review') {
      setCurrentStep(AppStep.REVIEW_OPTIMIZE);
    } else if (tab === 'manual') {
      setCurrentStep(AppStep.MANUAL_EDIT);
    }
  };

  // 🆕 提示词自检函数（在生成提示词后调用）
  const validatePrompts = () => {
    setIsValidatingPrompts(true);
    const results: ReviewSuggestion[] = [];

    for (const shot of shots) {
      // 只有已提取提示词的镜头才进行校验
      if (!shot.imagePromptCn && !shot.imagePromptEn) continue;

      // 1. 校验提示词（违规词汇、字数等）
      const validation = validateShotPrompts(shot);

      // 违规词汇检测
      if (validation.forbiddenTerms.length > 0) {
        for (const { field, terms } of validation.forbiddenTerms) {
          for (const t of terms) {
            results.push({
              shotNumber: shot.shotNumber,
              suggestion: `[${field}] 包含违规词汇"${t.term}"，建议改为：${t.suggestion}`,
              reason: `规则校验：${t.reason}`,
              selected: true
            });
          }
        }
      }

      // 2. 如果是 Keyframe 模式，校验首尾帧一致性
      if (shot.videoMode === 'Keyframe' && shot.imagePromptCn && shot.endImagePromptCn) {
        const consistency = validateKeyframeConsistency(shot.imagePromptCn, shot.endImagePromptCn, shot.videoGenPrompt);
        if (!consistency.valid) {
          for (const error of consistency.errors) {
            results.push({
              shotNumber: shot.shotNumber,
              suggestion: error,
              reason: '首尾帧一致性校验失败',
              selected: true
            });
          }
        }
        for (const warning of consistency.warnings) {
          results.push({
            shotNumber: shot.shotNumber,
            suggestion: warning,
            reason: '首尾帧一致性建议',
            selected: true
          });
        }
      }

      // 3. 字数校验
      if (validation.promptCn.warnings.length > 0 || !validation.promptCn.valid) {
        const issues = [...validation.promptCn.errors, ...validation.promptCn.warnings];
        if (issues.length > 0) {
          results.push({
            shotNumber: shot.shotNumber,
            suggestion: issues.join('；'),
            reason: '提示词字数校验',
            selected: true
          });
        }
      }
    }

    setPromptValidationResults(results);
    setIsValidatingPrompts(false);

    if (results.length === 0) {
      alert('✅ 提示词自检通过！没有发现问题。');
    }
  };

  // 🆕 建议勾选控制函数
  const toggleSuggestionSelection = (shotNumber: string) => {
    setSuggestions(prev => prev.map(s =>
      s.shotNumber === shotNumber ? { ...s, selected: !s.selected } : s
    ));
    // 同步更新弹窗中的建议
    setSelectedSuggestion(prev =>
      prev && prev.shotNumber === shotNumber ? { ...prev, selected: !prev.selected } : prev
    );
  };

  const selectAllSuggestions = () => {
    setSuggestions(prev => prev.map(s => ({ ...s, selected: true })));
  };

  const deselectAllSuggestions = () => {
    setSuggestions(prev => prev.map(s => ({ ...s, selected: false })));
  };

  const getSelectedSuggestionsCount = () => {
    return suggestions.filter(s => s.selected).length;
  };

  /**
   * 🆕 P1修复：情绪驱动的自动修复角度分布问题
   */
  const autoFixAngleDistribution = async (currentShots: Shot[]): Promise<Shot[]> => {
    let updatedShots = [...currentShots];

    // 1. 统计当前角度分布
    const frontViewShots = updatedShots.filter(s =>
      s.angleDirection?.includes('正面') || s.angleDirection?.includes('Front')
    );
    const eyeLevelShots = updatedShots.filter(s =>
      s.angleHeight?.includes('平视') || s.angleHeight?.includes('Eye Level')
    );
    const eyeLevelRatio = eyeLevelShots.length / updatedShots.length;

    // 2. 计算需要修复的数量
    const frontViewExcess = Math.max(0, frontViewShots.length - 2);
    const eyeLevelExcess = eyeLevelRatio > 0.15 ? eyeLevelShots.length - Math.floor(updatedShots.length * 0.15) : 0;

    console.log(`[情绪驱动修复] 正面镜头：${frontViewShots.length}个（需修复${frontViewExcess}个），平视镜头：${eyeLevelShots.length}个（需修复${eyeLevelExcess}个）`);

    // 3. 使用情绪驱动算法生成修复方案
    const emotionModule = await import('./services/emotionDrivenAngleSelection');
    const fixes = emotionModule.fixAngleDistributionByEmotion(
      updatedShots.map(s => ({
        shotNumber: s.shotNumber,
        storyBeat: typeof s.storyBeat === 'string' ? s.storyBeat : (s.storyBeat?.event || ''),
        angleDirection: s.angleDirection,
        angleHeight: s.angleHeight
      })),
      { frontViewExcess, eyeLevelExcess }
    );

    // 4. 应用修复
    for (const fix of fixes) {
      const shotIndex = updatedShots.findIndex(s => s.shotNumber === fix.shotNumber);
      if (shotIndex !== -1) {
        const oldDirection = updatedShots[shotIndex].angleDirection;
        const oldHeight = updatedShots[shotIndex].angleHeight;

        if (fix.newDirection) {
          updatedShots[shotIndex] = {
            ...updatedShots[shotIndex],
            angleDirection: fix.newDirection
          };
          console.log(`  - 镜头 ${fix.shotNumber}: ${oldDirection} → ${fix.newDirection}`);
          console.log(`    理由: ${fix.reason}`);
        }

        if (fix.newHeight) {
          updatedShots[shotIndex] = {
            ...updatedShots[shotIndex],
            angleHeight: fix.newHeight
          };
          console.log(`  - 镜头 ${fix.shotNumber}: ${oldHeight} → ${fix.newHeight}`);
          console.log(`    理由: ${fix.reason}`);
        }
      }
    }

    return updatedShots;
  };

  const applyOptimizations = async () => {
    // 只应用选中的建议
    const selectedSuggestionsList = suggestions.filter(s => s.selected);
    if (selectedSuggestionsList.length === 0) {
      alert("请至少选择一条建议");
      return;
    }

    // 🆕 P1修复：检查是否有角度分布问题，如果有则自动修复
    const hasAngleDistributionIssue = selectedSuggestionsList.some(s =>
      s.reason?.includes('角度分布规则违反') || s.reason?.includes('角度分布建议')
    );

    if (hasAngleDistributionIssue) {
      console.log('[应用修复] 检测到角度分布问题，执行自动修复...');
      const fixedShots = await autoFixAngleDistribution(shots);
      setShots(fixedShots);

      // 重新验证
      const angleReport = validateAngleDistribution(fixedShots);
      if (angleReport.overall.isValid) {
        alert('✅ 角度分布问题已自动修复！\n\n' + generateAngleDistributionReport(fixedShots));
      } else {
        alert('⚠️ 部分角度分布问题已修复，但仍有问题：\n\n' + angleReport.overall.errors.join('\n'));
      }

      // 清除已修复的建议
      setSuggestions(prev => prev.filter(s =>
        !s.reason?.includes('角度分布规则违反') && !s.reason?.includes('角度分布建议')
      ));

      return;
    }

    // 保存当前shots副本（避免闭包问题）
    const currentShots = [...shots];

    setCurrentStep(AppStep.MANUAL_EDIT);
    // Initialize Chat
    setChatHistory([{role: 'assistant', content: `我已经根据选中的 ${selectedSuggestionsList.length} 条建议优化了剧本。如果你有其他想法，可以随时告诉我。`}]);

    setStreamText('');
    setIsLoading(true);
    setProgressMsg(`正在应用 ${selectedSuggestionsList.length} 条建议...`);

    try {
      // 只传入选中的建议进行优化
      const stream = optimizeShotListStream(currentShots, selectedSuggestionsList, reviewModel);
      for await (const text of stream) {
        setStreamText(text);
      }
    } catch (error) {
      console.error(error);
      alert("优化失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConsultDirector = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setIsLoading(true);

    // We are chatting, NOT updating JSON yet
    setProgressMsg("导演正在思考...");
    let aiResponse = "";

    try {
        // 使用选中的模型进行对话
        const stream = chatWithDirectorStream(chatHistory, userMsg, editModel);
        for await (const chunk of stream) {
            aiResponse += chunk;
            // Update last message in real-time or just let it build
        }
        setChatHistory(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (e) {
        console.error(e);
        setChatHistory(prev => [...prev, { role: 'assistant', content: "抱歉，我走神了，请再说一遍。" }]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleExecuteChanges = async () => {
    // Take the last user instruction or summary from chat
    // For simplicity, we use the last user message as the core instruction,
    // or we could ask the user to type the command.
    // Here we assume the chat context has led to a decision.
    // Let's prompt user to confirm execution of recent chat.

    const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user')?.content || "Apply changes";

    // 🔧 修复：保存当前 shots，避免清空后无法恢复
    const currentShots = [...shots];

    setStreamText('');
    setIsLoading(true);
    setProgressMsg("正在修改剧本...");

    try {
      // 使用选中的模型修改分镜
      let fullText = '';
      const stream = chatEditShotListStream(currentShots, lastUserMsg, editModel);
      for await (const text of stream) {
        fullText = text;
        setStreamText(text);
      }

      // 🔧 修复：解析返回的 JSON 并更新 shots
      try {
        // 🆕 改进的JSON提取逻辑
        let cleanedText = fullText.trim();

        // 1. 移除markdown代码块
        cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // 2. 尝试提取JSON数组（查找第一个 [ 到最后一个 ]）
        const jsonStart = cleanedText.indexOf('[');
        const jsonEnd = cleanedText.lastIndexOf(']');

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
        }

        // 3. 解析JSON
        const updatedShots = JSON.parse(cleanedText);

        if (Array.isArray(updatedShots) && updatedShots.length > 0) {
          setShots(updatedShots);

          // 🆕 生成更友好的反馈信息
          const changesSummary = `✅ 剧本已更新！\n\n原镜头数：${currentShots.length}\n新镜头数：${updatedShots.length}\n变化：${updatedShots.length - currentShots.length > 0 ? '+' : ''}${updatedShots.length - currentShots.length}`;

          setChatHistory(prev => [...prev, { role: 'assistant', content: changesSummary }]);
          console.log('✅ 镜头更新成功:', updatedShots.length, '个镜头');
        } else {
          throw new Error('返回的数据不是有效的镜头数组');
        }
      } catch (parseError) {
        console.error('解析修改后的镜头失败:', parseError);
        console.error('原始返回文本:', fullText);

        // 🆕 更友好的错误提示
        const errorMsg = `❌ 修改失败：AI返回的内容无法解析为有效的镜头数据\n\n可能原因：\n1. AI返回了说明文字而非纯JSON\n2. JSON格式不正确\n\n建议：\n1. 重新描述你的修改需求\n2. 使用更具体的指令（如"将镜头3的角度改为俯视"）\n\n已恢复原始数据`;

        setChatHistory(prev => [...prev, { role: 'assistant', content: errorMsg }]);

        // 恢复原始 shots
        setShots(currentShots);
      }
    } catch (error) {
      console.error(error);
      // 恢复原始 shots
      setShots(currentShots);
      alert("修改失败");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 🆕 单独重新生成某一张九宫格图片
   * @param gridIndex 九宫格索引（从0开始）
   */
  const regenerateSingleGrid = async (gridIndex: number) => {
    const totalGrids = Math.ceil(shots.length / 9);

    // 验证索引
    if (gridIndex < 0 || gridIndex >= totalGrids) {
      alert(`无效的九宫格索引: ${gridIndex + 1}`);
      return;
    }

    // 🔧 验证项目和剧集信息
    if (!currentProject) {
      alert('⚠️ 未选择项目，无法重新生成九宫格');
      return;
    }

    if (currentEpisodeNumber === null) {
      alert('⚠️ 未选择剧集，无法重新生成九宫格');
      return;
    }

    const currentEpisode = currentProject.episodes?.find(
      ep => ep.episodeNumber === currentEpisodeNumber
    );

    if (!currentEpisode) {
      alert('⚠️ 未找到当前剧集信息，无法重新生成九宫格');
      return;
    }

    const episodeId = currentEpisode.id;
    const projectId = currentProject.id;

    setIsLoading(true);
    setProgressMsg(`正在重新生成第 ${gridIndex + 1} 张九宫格...`);

    // 🔧 记录重新生成信息
    console.log(`[九宫格重绘] 项目: ${currentProject.name} (${projectId}), 剧集: 第${currentEpisodeNumber}集 (${episodeId}), grid#${gridIndex + 1}`);

    try {
      // 🆕 单格重绘：任务创建后立即持久化 taskCode，便于断网/刷新后自动恢复
      // 获取美术风格
      const artStyle = detectArtStyleType(currentProject.settings.genre, currentProject.settings.visualStyle);

      // 调用单独生成函数
      const { generateSingleGrid } = await import('./services/openrouter');
      const imageUrl = await generateSingleGrid(
        gridIndex,
        shots,
        characterRefs,
        imageModel,
        selectedStyle,
        currentEpisodeNumber,
        currentProject.scenes || [],
	        artStyle,
	        // 🆕 taskCode 创建后立即写入 D1（shots.storyboardGridGenerationMeta），便于断网/刷新后恢复
	        async (taskCode) => {
	          console.log(`[九宫格重绘] taskCode创建: grid#${gridIndex + 1}, taskCode=${taskCode}`);
	          const taskCreatedAt = new Date().toISOString();
	          const GRID_SIZE = 9;
	          const startIdx = gridIndex * GRID_SIZE;
	          setShots(prev => {
	            if (startIdx < 0 || startIdx >= prev.length) return prev;
	            // 约定：将 meta 写在该 grid 的第一个 shot 上即可（恢复逻辑按 gridIndex 聚合）
	            const next = prev.map((s, idx) => {
	              if (idx !== startIdx) return s;
	              return {
	                ...s,
	                storyboardGridGenerationMeta: {
	                  taskCode,
	                  taskCreatedAt,
	                  gridIndex,
	                },
	              };
	            });

	            void patchEpisode(episodeId, { shots: next }).catch(err => {
	              console.error('[D1存储] 九宫格 taskCode 持久化失败', err);
	            });
	            return next;
	          });
	        },
        projectId  // 🔧 传入项目 ID（已验证），用于上传到 OSS
      );

      if (imageUrl) {
        // 更新该九宫格的URL
        setHqUrls(prev => {
          const newUrls = [...prev];
          newUrls[gridIndex] = imageUrl;
          return newUrls;
        });
        setProgressMsg(`✅ 第 ${gridIndex + 1} 张九宫格重新生成成功！`);
      } else {
        setProgressMsg(`❌ 第 ${gridIndex + 1} 张九宫格生成失败`);
        alert(`第 ${gridIndex + 1} 张九宫格生成失败，请重试`);
      }
    } catch (err) {
      console.error(err);
      alert("重新生成失败: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 🆕 上传九宫格图片（URL或本地文件）
   */
  const handleUploadGrid = async () => {
    if (uploadGridIndex === null) return;

    try {
      setIsLoading(true);
      let imageUrl = '';

      if (uploadUrl.trim()) {
        // 使用URL
        imageUrl = uploadUrl.trim();
      } else if (uploadFile) {
        // 上传本地文件到OSS
        if (!currentProject) {
          alert('⚠️ 未选择项目，无法上传图片');
          return;
        }

        setProgressMsg('正在上传图片到云端...');
        const { uploadToOSS } = await import('./services/oss');
        const ossUrl = await uploadToOSS(
          uploadFile,
          `projects/${currentProject.id}/storyboard/grid_${uploadGridIndex + 1}_${Date.now()}.png`
        );
        imageUrl = ossUrl;
      } else {
        alert('请输入URL或选择文件');
        return;
      }

      // 更新九宫格URL
      setHqUrls(prev => {
        const newUrls = [...prev];
        newUrls[uploadGridIndex] = imageUrl;
        return newUrls;
      });

      setProgressMsg(`✅ 第 ${uploadGridIndex + 1} 张九宫格上传成功！`);

      // 关闭对话框并重置状态
      setUploadDialogOpen(false);
      setUploadGridIndex(null);
      setUploadUrl('');
      setUploadFile(null);
    } catch (err) {
      console.error(err);
      alert('上传失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 🆕 手动刷新九宫格任务（从已保存的taskCode恢复）
   */
  const handleRefreshGrid = async (gridIndex: number) => {
    const GRID_SIZE = 9;
    const startIdx = gridIndex * GRID_SIZE;

    if (startIdx >= shots.length) {
      alert('无效的九宫格索引');
      return;
    }

    const meta = shots[startIdx]?.storyboardGridGenerationMeta;
    if (!meta?.taskCode) {
      alert('该九宫格没有保存的任务信息，无法刷新');
      return;
    }

    try {
      setIsLoading(true);
      setProgressMsg(`正在刷新第 ${gridIndex + 1} 张九宫格任务...`);

      const { pollGenerationResult, TaskStatus } = await import('./services/aiImageGeneration');
      const result = await pollGenerationResult(meta.taskCode);

      if (result.status === TaskStatus.SUCCESS && result.image_urls && result.image_urls.length > 0) {
        // 更新九宫格URL
        setHqUrls(prev => {
          const newUrls = [...prev];
          newUrls[gridIndex] = result.image_urls![0];
          return newUrls;
        });
        setProgressMsg(`✅ 第 ${gridIndex + 1} 张九宫格刷新成功！`);
      } else if (result.status === TaskStatus.FAILED) {
        alert(`任务失败: ${result.failure_reason || '未知错误'}`);
      } else {
        alert('任务仍在处理中，请稍后再试');
      }
    } catch (err) {
      console.error(err);
      alert('刷新失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const generateHQ = async () => {
    setIsLoading(true);
    setHqUrls([]);

    try {
      // 🔧 验证项目和剧集信息
      if (!currentProject) {
        alert('⚠️ 未选择项目，无法生成九宫格');
        setIsLoading(false);
        return;
      }

      // 🆕 严格校验：检查项目是否已设置渲染风格
      if (!hasProjectStyle(currentProject)) {
        alert('⚠️ 请先设置项目风格\n\n项目风格用于角色、场景和分镜的统一视觉呈现。\n请前往"角色设定"页面设置项目风格后再生成分镜。');
        setIsLoading(false);
        return;
      }

      // 🆕 获取生效的九宫格风格（考虑覆盖）
      const effectiveStyle = getEffectiveStoryboardStyle(currentProject);
      if (!effectiveStyle) {
        alert('⚠️ 无法获取项目风格，请检查项目设置');
        setIsLoading(false);
        return;
      }

      const totalGrids = Math.ceil(shots.length / 9);
      setProgressMsg(`正在使用「${effectiveStyle.name}」风格绘制 ${totalGrids} 张九宫格...`);

      // 🆕 创建 AbortController
      const controller = new AbortController();
      setAbortController(controller);

      // 🆕 重置生成时间跟踪
      setGridGenerationStartTime(Date.now());
      setCurrentGeneratingGrid(0);

      if (currentEpisodeNumber === null) {
        alert('⚠️ 未选择剧集，无法生成九宫格');
        setIsLoading(false);
        return;
      }

      const currentEpisode = currentProject.episodes?.find(
        ep => ep.episodeNumber === currentEpisodeNumber
      );

      if (!currentEpisode) {
        alert('⚠️ 未找到当前剧集信息，无法生成九宫格');
        setIsLoading(false);
        return;
      }

      const episodeId = currentEpisode.id;
      const projectId = currentProject.id;

      // 🔧 记录生成信息
      console.log(`[九宫格生成] 项目: ${currentProject.name} (${projectId}), 剧集: 第${currentEpisodeNumber}集 (${episodeId})`);
      console.log(`[九宫格生成] 镜头数量: ${shots.length}, 第1个镜头: ${typeof shots[0]?.storyBeat === 'string' ? shots[0].storyBeat : shots[0]?.storyBeat?.event || '未知'}`);

      // 使用选中的图像模型和风格生成分镜图
      // 生成一张就显示一张
      // 🆕 传入当前集数、场景库和美术风格，用于匹配角色形态、场景描述和风格约束
      const artStyle = detectArtStyleType(currentProject.settings.genre, currentProject.settings.visualStyle);
      const results = await generateMergedStoryboardSheet(
        shots,
        characterRefs,
        'hq',
        imageModel,
        effectiveStyle, // 🆕 使用项目风格（考虑覆盖）
        // 进度回调
        (current, total, info) => {
          setProgressMsg(`正在生成 ${info} (${current}/${total}) - ${effectiveStyle.name}`);
          // 🆕 更新当前生成的九宫格索引
          setCurrentGeneratingGrid(current - 1);
          setGridGenerationStartTime(Date.now());
        },
        // 单张完成回调 - 生成一张显示一张
        (gridIndex, imageUrl) => {
          console.log(`[九宫格生成] ✅ 第${gridIndex + 1}张完成，URL: ${imageUrl.substring(0, 80)}...`);
          setHqUrls(prev => {
            const newUrls = [...prev];
            newUrls[gridIndex] = imageUrl;
            return newUrls;
          });
          // 🆕 完成后重置当前生成索引
          setCurrentGeneratingGrid(null);
        },
	        // 🆕 taskCode 创建后立即写入 D1（shots.storyboardGridGenerationMeta），便于断网/刷新后恢复
	        async (taskCode, gridIndex) => {
	          console.log(`[九宫格生成] taskCode创建: grid#${gridIndex + 1}, taskCode=${taskCode}`);
	          const taskCreatedAt = new Date().toISOString();
	          const GRID_SIZE = 9;
	          const startIdx = gridIndex * GRID_SIZE;
	          setShots(prev => {
	            if (startIdx < 0 || startIdx >= prev.length) return prev;
	            const next = prev.map((s, idx) => {
	              if (idx !== startIdx) return s;
	              return {
	                ...s,
	                storyboardGridGenerationMeta: {
	                  taskCode,
	                  taskCreatedAt,
	                  gridIndex,
	                },
	              };
	            });
	            void patchEpisode(episodeId, { shots: next }).catch(err => {
	              console.error('[D1存储] 九宫格 taskCode 持久化失败', err);
	            });
	            return next;
	          });
	        },
        currentEpisodeNumber,               // 🆕 传入当前集数
        currentProject.scenes || [],        // 🆕 传入场景库
        artStyle,                           // 🆕 传入美术风格类型
        projectId,                          // 🔧 传入项目 ID（已验证），用于上传到 OSS
        controller.signal                   // 🆕 传入取消信号
      );

      // 🆕 检查是否被用户停止
      if (controller.signal.aborted) {
        const successCount = results.filter(r => r).length;
        setProgressMsg(`⏸️ 生成已停止：${successCount}/${totalGrids} 张已完成`);
        setHqUrls(results);
      } else {
        // 确保最终结果完整（处理失败的情况）
        setHqUrls(results);
        const successCount = results.filter(r => r).length;
        if (successCount === totalGrids) {
          setProgressMsg(`✅ 九宫格生成完成！共 ${totalGrids} 张`);
        } else {
          setProgressMsg(`⚠️ 生成完成：${successCount}/${totalGrids} 张成功`);
        }
      }
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.name === 'AbortError') {
        setProgressMsg('⏸️ 生成已被用户停止');
      } else {
        alert("渲染失败: " + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      setIsLoading(false);
      setAbortController(null);
      setGridGenerationStartTime(null);
      setCurrentGeneratingGrid(null);
    }
  };

  // 🆕 停止九宫格生成
  const stopGeneration = () => {
    if (abortController) {
      abortController.abort();
      console.log('[九宫格] 用户请求停止生成');
    }
  };

	/**
	 * 🎨 B1：将“九宫格图片URL”按序映射到每个镜头（虚拟切割，不生成独立小图文件）
	 * - 映射规则：每 9 个镜头对应一张九宫格；cellIndex = idx % 9
	 * - 显示规则：在分镜表新增“草图”列，通过 CSS 平移实现裁切
	 * - 持久化：将 mapping 写入 shots 并 saveEpisode 落库到 D1，便于下次恢复
	 */
	const applyGridsToShots = async () => {
	  const availableCount = hqUrls.filter(Boolean).length;
	  if (availableCount === 0) {
	    alert('⚠️ 当前没有可用的九宫格图片，请先生成完成后再应用。');
	    return;
	  }

	  const GRID_SIZE = 9;
	  const updatedShots = shots.map((shot, idx) => {
	    const gridIndex = Math.floor(idx / GRID_SIZE);
	    const cellIndex = idx % GRID_SIZE;
	    const gridUrl = hqUrls[gridIndex];

	    if (!gridUrl) return shot;
	    return {
	      ...shot,
	      storyboardGridUrl: gridUrl,
	      storyboardGridCellIndex: cellIndex,
		      // 🧹 清理九宫格生成任务元信息（已应用到 storyboardGridUrl，无需继续保留 taskCode）
		      storyboardGridGenerationMeta: undefined,
	    };
	  });

	  setShots(updatedShots);

	  // 保存到 D1（跨设备/跨成员可恢复）
	  if (!currentProject || currentEpisodeNumber === null) {
	    alert('⚠️ 未选择项目/剧集，已在本地应用草图映射，但无法保存到云端。');
	    return;
	  }

	  const currentEpisode = currentProject.episodes?.find(
	    ep => ep.episodeNumber === currentEpisodeNumber
	  );
	  if (!currentEpisode) {
	    alert('⚠️ 未找到当前剧集元信息，已在本地应用草图映射，但无法保存到云端。');
	    return;
	  }

	  setIsLoading(true);
	  setProgressMsg('正在将九宫格草图应用到分镜表并保存到云端...');
	  try {
		    if (currentEpisode.id) {
		      // 🔧 保存到云端（patchEpisode 内部会自动优化数据）
		      await patchEpisode(currentEpisode.id, {
		        shots: updatedShots,
		      });
		    } else {
		      // fallback：缺少 episodeId 时使用 saveEpisode（兼容旧数据/异常情况）
		      console.warn('[D1存储] 未找到 episodeId，使用 saveEpisode fallback');
		      await saveEpisode(currentProject.id, {
		        ...currentEpisode,
		        script: script || '',
		        shots: updatedShots,
		        updatedAt: new Date().toISOString(),
		      });
		    }
	    setProgressMsg('✅ 九宫格草图已应用到分镜表，并已保存到云端。');

	    // 🆕 成功保存后自动跳转到故事板预览页面
	    setTimeout(() => {
	      setCurrentStep(AppStep.FINAL_STORYBOARD);
	    }, 500); // 延迟500ms，让用户看到成功提示
	  } catch (error) {
	    console.error('[D1存储] 保存九宫格草图映射失败:', error);

	    // 🔧 提供更详细的错误信息
	    let errorMsg = '❌ 已应用到本地分镜表，但保存到云端失败。';
	    if (error instanceof Error) {
	      if (error.message.includes('Load failed') || error.message.includes('Failed to fetch')) {
	        errorMsg += '\n\n可能原因：\n1. 网络连接问题\n2. 数据量过大（已自动优化，如仍失败请减少镜头数量）\n3. API 服务暂时不可用\n\n请查看浏览器控制台了解详细信息。';
	      } else if (error.message.includes('timeout')) {
	        errorMsg += '\n\n原因：请求超时（已延长至60秒），请检查网络连接。';
	      } else {
	        errorMsg += `\n\n错误详情：${error.message}`;
	      }
	    }

	    alert(errorMsg);
	  } finally {
	    setIsLoading(false);
	  }
	};

  /**
   * 下载图片（修复跨域问题）
   * 使用 fetch + Blob 方式下载，避免浏览器直接打开预览
   */
  const downloadImage = async (url: string, filename: string) => {
    try {
      setProgressMsg(`正在下载 ${filename}...`);

      // 使用 fetch 获取图片
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载失败: ${response.statusText}`);
      }

      const blob = await response.blob();

      // 创建临时 URL
      const blobUrl = URL.createObjectURL(blob);

      // 触发下载
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 释放 URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

      setProgressMsg(`✅ ${filename} 下载成功`);
    } catch (error) {
      console.error('下载失败:', error);
      setProgressMsg(`⚠️ 下载失败，尝试在新标签页打开...`);
      // 降级方案：在新标签页打开
      window.open(url, '_blank');
    }
  };

  /**
   * 导出剧本模板
   */
  const handleExportScriptTemplate = () => {
    if (!currentProject || !currentEpisodeNumber) {
      alert('请先选择项目和剧集');
      return;
    }

    if (shots.length === 0) {
      alert('当前没有分镜脚本数据');
      return;
    }

    try {
      setIsLoading(true);

      // 🆕 P3修复：从思维链结果中提取 sceneLayouts
      const sceneLayouts = cotStage1?.continuityNotes?.sceneLayouts || undefined;

      // 调用导出服务
      const templateContent = exportScriptTemplate(
        currentProject,
        currentEpisodeNumber,
        shots,
        sceneLayouts,  // 🆕 传递 sceneLayouts 数据
        episodeSummary,  // 🆕 传递已生成的本集概述
        characterRefs  // 🆕 传递当前加载的角色数据
      );

      // 生成文件名
      const date = new Date().toISOString().split('T')[0];
      const filename = `第${currentEpisodeNumber}集_剧本模板_${date}.txt`;

      // 创建Blob并下载
      const blob = new Blob([templateContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      alert('剧本模板导出成功！');
      setIsLoading(false);
    } catch (error) {
      console.error('导出剧本模板失败:', error);
      alert(`导出失败：${error instanceof Error ? error.message : '未知错误'}`);
      setIsLoading(false);
    }
  };

  // ═══════════ 导出功能 ═══════════

  // 导出为JSON
  const exportToJSON = () => {
    const exportData = {
      exportTime: new Date().toISOString(),
      totalShots: shots.length,
      shots: shots.map(shot => ({
        shotNumber: shot.shotNumber,
        duration: shot.duration,
        shotType: shot.shotType,
        storyBeat: shot.storyBeat,
        dialogue: shot.dialogue,
        // 🆕 导演意图与技术备注
        directorNote: shot.directorNote,
        technicalNote: shot.technicalNote,
        // 视觉设计
        shotSize: shot.shotSize,
        angleDirection: shot.angleDirection,
        angleHeight: shot.angleHeight,
        dutchAngle: shot.dutchAngle,
        foreground: shot.foreground,
        midground: shot.midground,
        background: shot.background,
        lighting: shot.lighting,
        cameraMove: shot.cameraMove,
        cameraMoveDetail: shot.cameraMoveDetail,
        motionPath: shot.motionPath,
        startFrame: shot.startFrame,
        endFrame: shot.endFrame,
        promptCn: shot.promptCn,
        promptEn: shot.promptEn,
        endFramePromptCn: shot.endFramePromptCn,
        endFramePromptEn: shot.endFramePromptEn,
        videoPromptCn: shot.videoPromptCn,
        videoPrompt: shot.videoPrompt,
        theory: shot.theory
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `分镜脚本_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

	  // 导出为CSV（Excel兼容）- 与页面表格一致的5列布局（不含提示词）
	  const exportToExcel = () => {
	    // CSV头部 - 与页面表格一致
	    const headers = [
	      '#（编号/时长/类型）',
	      '故事（节拍/对白）',
	      '视觉设计（景别/角度/构图/光影/运镜）',
	      '首帧',
	      '尾帧'
	    ];

    // 转义CSV字段
    const escapeCSV = (str: string | undefined) => {
      if (!str) return '';
      // 如果包含逗号、换行或引号，需要用引号包裹并转义内部引号
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

	    // 数据行 - 合并显示与页面一致（不导出提示词）
	    const rows = shots.map(shot => {
	      const isMotion = shot.shotType === '运动';

      // 列1: # (编号/时长/类型)
      const col1 = `#${shot.shotNumber} | ${shot.duration || '—'} | ${shot.shotType || '静态'}`;

      // 列2: 故事 (节拍 + 对白 + 导演意图 + 技术备注)
      const col2 = [
        shot.storyBeat || '',
        shot.dialogue ? `【对白】${shot.dialogue}` : '',
        shot.directorNote ? `【导演意图】${shot.directorNote}` : '',
        shot.technicalNote ? `【技术备注】${shot.technicalNote}` : ''
      ].filter(Boolean).join('\n');

      // 列3: 视觉设计 (景别/角度/构图/光影/运镜)
      const col3 = [
        `【景别】${shot.shotSize || '—'}`,
        `【角度】${shot.angleDirection || '—'} + ${shot.angleHeight || '—'}${shot.dutchAngle ? ` (${shot.dutchAngle})` : ''}`,
        `【构图】`,
        `  FG: ${shot.foreground || '—'}`,
        `  MG: ${shot.midground || '—'}`,
        `  BG: ${shot.background || '—'}`,
        `【光影】${shot.lighting || '—'}`,
        `【运镜】${shot.cameraMove || '—'}${shot.cameraMoveDetail ? ` | ${shot.cameraMoveDetail}` : ''}`,
        isMotion && shot.motionPath ? `【动线】${shot.motionPath}` : ''
      ].filter(Boolean).join('\n');

	      // 列4: 首帧
	      const col4 = shot.startFrame || (isMotion ? '—' : '');

	      // 列5: 尾帧
	      const col5 = shot.endFrame || (isMotion ? '—' : '');

	      return [
	        escapeCSV(col1),
	        escapeCSV(col2),
	        escapeCSV(col3),
	        escapeCSV(col4),
	        escapeCSV(col5)
	      ];
    });

    // 组合CSV内容（添加BOM以支持中文）
    const BOM = '\uFEFF';
    const csvContent = BOM + headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `分镜脚本_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 🆕 导出提示词 - 中文版 CSV
  const exportPromptsChineseCSV = () => {
    const headers = ['#', '类型', '首帧中文提示词', '尾帧中文提示词', '视频提示词'];
    const escapeCSV = (str: string | undefined) => {
      if (!str) return '';
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const rows = shots.map(shot => [
      escapeCSV(`#${shot.shotNumber}`),
      escapeCSV(shot.shotType),
      escapeCSV(shot.imagePromptCn),
      escapeCSV(shot.endImagePromptCn),
      escapeCSV(shot.videoGenPrompt)
    ]);
    const BOM = '\uFEFF';
    const csvContent = BOM + headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `AI提示词_中文版_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 🆕 导出提示词 - 英文版 CSV
  const exportPromptsEnglishCSV = () => {
    const headers = ['#', 'Type', 'Start Frame Prompt', 'End Frame Prompt', 'Video Prompt'];
    const escapeCSV = (str: string | undefined) => {
      if (!str) return '';
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const rows = shots.map(shot => [
      escapeCSV(`#${shot.shotNumber}`),
      escapeCSV(shot.shotType === '运动' ? 'Motion' : 'Static'),
      escapeCSV(shot.imagePromptEn),
      escapeCSV(shot.endImagePromptEn),
      escapeCSV(shot.videoGenPrompt)
    ]);
    const BOM = '\uFEFF';
    const csvContent = BOM + headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `AI_Prompts_English_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 🆕 导出提示词专用 JSON（包含中英文）
  const exportPromptsToJSON = () => {
    const exportData = {
      exportTime: new Date().toISOString(),
      totalShots: shots.length,
      prompts: shots.map(shot => ({
        shotNumber: shot.shotNumber,
        shotType: shot.shotType,
        imagePromptCn: shot.imagePromptCn || '',
        imagePromptEn: shot.imagePromptEn || '',
        endImagePromptCn: shot.endImagePromptCn || '',
        endImagePromptEn: shot.endImagePromptEn || '',
        videoGenPrompt: shot.videoGenPrompt || ''
      }))
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `AI提示词_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 🆕 渲染场景空间布局信息（表格顶部单独一行）
  const renderSceneSpaceHeader = () => {
    if (!cotStage1?.continuityNotes?.sceneLayouts?.length) return null;
    const sceneLayouts = cotStage1.continuityNotes.sceneLayouts;

    // 计算每个场景包含的镜头范围
    const getShotRangeForScene = (sceneId: string) => {
      const sceneShots = shots.filter(s => s.sceneId === sceneId || s.sceneId?.includes(sceneId));
      if (sceneShots.length === 0) return null;
      const shotNumbers = sceneShots.map(s => parseInt(s.shotNumber)).filter(n => !isNaN(n));
      if (shotNumbers.length === 0) return null;
      const min = Math.min(...shotNumbers);
      const max = Math.max(...shotNumbers);
      return min === max ? `#${min}` : `#${min}-#${max}`;
    };

    return (
      <div className="mb-4 p-3 bg-gradient-to-r from-emerald-900/40 to-cyan-900/40 rounded-lg border border-emerald-700">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🗺️</span>
          <h4 className="text-sm font-bold text-emerald-300">场景空间布局</h4>
          <span className="text-gray-500 text-xs">（用于保持空间连贯性）</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sceneLayouts.map((layout) => {
            const shotRange = getShotRangeForScene(layout.sceneId);
            return (
            <div key={layout.sceneId} className="bg-gray-800/50 p-2 rounded border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                  {layout.sceneId}
                </span>
                {shotRange && (
                  <span className="bg-blue-800 text-blue-300 px-1.5 py-0.5 rounded text-[10px]">
                    镜头 {shotRange}
                  </span>
                )}
                <span className="text-cyan-400 text-[10px]">📍 {layout.spatialSummary}</span>
              </div>
              {layout.landmarks && layout.landmarks.length > 0 && (
                <div className="text-gray-400 text-[9px] mb-1">🏛️ 地标: {layout.landmarks.join('、')}</div>
              )}
              {layout.defaultPositions && Object.keys(layout.defaultPositions).length > 0 && (
                <div className="text-amber-400 text-[9px]">
                  👤 站位: {Object.entries(layout.defaultPositions).map(([name, pos]) => `${name}→${pos}`).join(' | ')}
                </div>
              )}
            </div>
          )})}
        </div>
      </div>
    );
  };

	// 🆕 九宫格虚拟切割缩略图（B1）：通过 CSS 平移显示 3×3 中的某一格
	const GridCellThumbnail = ({ gridUrl, cellIndex }: { gridUrl: string; cellIndex: number }) => {
	  const safeIndex = Math.min(8, Math.max(0, Math.floor(cellIndex)));
	  const row = Math.floor(safeIndex / 3);
	  const col = safeIndex % 3;

	  return (
	    <div
	      className="w-20 h-20 overflow-hidden rounded border border-gray-700 bg-gray-800"
	      title={`九宫格格子 #${safeIndex + 1}`}
	    >
	      <img
	        src={gridUrl}
	        alt={`grid-cell-${safeIndex}`}
	        loading="lazy"
	        className="block max-w-none max-h-none"
	        style={{
	          width: '300%',
	          height: '300%',
	          transform: `translate(-${col * 33.333}%, -${row * 33.333}%)`,
	          transformOrigin: 'top left',
	        }}
	      />
	    </div>
	  );
	};

	const renderShotTable = (editable: boolean, fullHeight: boolean = false) => (
    <div className={`${fullHeight ? '' : 'max-h-[70vh] overflow-y-auto'}`}>
      {/* 🆕 场景空间布局信息 - 表格顶部单独显示 */}
      {renderSceneSpaceHeader()}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
        <table className="w-full text-xs text-left border-collapse table-fixed">
          <thead className="bg-[var(--color-surface)] text-[var(--color-text-primary)] font-bold text-[10px] sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 border-r border-[var(--color-border)] w-[60px] text-center">#</th>
              <th className="px-2 py-2 border-r border-[var(--color-border)] w-[18%]">故事</th>
              <th className="px-2 py-2 border-r border-[var(--color-border)] w-[32%]">视觉设计</th>
	              <th className="px-2 py-2 border-r border-[var(--color-border)] w-[25%]">首帧</th>
	              <th className="px-2 py-2 w-[25%]">尾帧</th>
            </tr>
          </thead>
          <tbody className="bg-[var(--color-bg)]">
            {shots.map((shot) => {
              const isMotion = shot.shotType === '运动';
            return (
              <tr key={shot.id} className="hover:bg-[var(--color-surface-hover)] border-b border-[var(--color-border)] text-[var(--color-text-primary)] align-top transition-colors">
                {/* # 列：编号+时长+类型+视频模式+场景ID */}
                <td className="px-2 py-2 border-r border-[var(--color-border)] text-center">
                  <div className="font-bold text-blue-400 text-sm">{shot.shotNumber}</div>
                  <div className="text-[var(--color-text-tertiary)] text-[10px]">{shot.duration}</div>
                  {/* 🆕 显示场景ID（关联空间布局） */}
                  {shot.sceneId && (
                    <span className="mt-1 inline-block px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-emerald-900/30 text-emerald-300 border border-emerald-600/50" title="所属场景（查看顶部场景空间布局）">
                      {shot.sceneId}
                    </span>
                  )}
                  <span className={`mt-1 inline-block px-1.5 py-0.5 rounded-md text-[9px] font-bold ${isMotion ? 'bg-amber-900/30 text-amber-300 border border-amber-600/50' : 'bg-[var(--color-surface)] text-[var(--color-text-tertiary)] border border-[var(--color-border)]'}`}>
                    {isMotion ? '运动' : '静态'}
                  </span>
                  {/* 🆕 显示视频生成模式 */}
                  {shot.videoMode && (
                    <span className={`mt-1 inline-block px-1.5 py-0.5 rounded-md text-[8px] font-bold ${
                      shot.videoMode === 'Keyframe'
                        ? 'bg-purple-900/30 text-purple-300 border border-purple-600/50'
                        : 'bg-cyan-900/30 text-cyan-300 border border-cyan-600/50'
                    }`}>
                      {shot.videoMode === 'Keyframe' ? '首尾帧' : '图生视频'}
                    </span>
                  )}
                  {/* 🆕 校验警告指示器 */}
                  {(() => {
                    const validation = validateShotPrompts(shot);
                    const hasIssues = validation.forbiddenTerms.length > 0 ||
                      !validation.promptCn.valid ||
                      (shot.videoMode === 'Keyframe' && shot.promptCn && shot.endFramePromptCn &&
                       !validateKeyframeConsistency(shot.promptCn, shot.endFramePromptCn).valid);
                    return hasIssues ? (
                      <span className="mt-1 inline-block px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-red-900/30 text-red-300 border border-red-600/50" title="存在校验问题">
                        ⚠️
                      </span>
                    ) : null;
                  })()}
                </td>

                {/* 故事列：故事节拍+对白+导演意图+技术备注 */}
                <td className="px-2 py-2 border-r border-[var(--color-border)]">
                  {editable ? (
                    <div className="space-y-1.5">
                      <textarea className="w-full h-12 p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs text-[var(--color-text-primary)] resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        placeholder="故事节拍（人物+地点+事件+冲突）" value={shot.storyBeat || ''} onChange={(e) => updateShotField(shot.id, 'storyBeat', e.target.value)} />
                      <textarea className="w-full h-8 p-1 bg-indigo-900/20 border border-indigo-700/50 rounded text-[10px] text-indigo-200 resize-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="对白/音效" value={shot.dialogue || ''} onChange={(e) => updateShotField(shot.id, 'dialogue', e.target.value)} />
                      <textarea className="w-full h-8 p-1 bg-purple-900/20 border border-purple-700/50 rounded text-[10px] text-purple-200 resize-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                        placeholder="🎬 导演意图（为什么这么设计、观众应感受...）" value={shot.directorNote || ''} onChange={(e) => updateShotField(shot.id, 'directorNote', e.target.value)} />
                      <textarea className="w-full h-8 p-1 bg-amber-900/20 border border-amber-700/50 rounded text-[10px] text-amber-200 resize-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        placeholder="🔧 技术备注（慢动作/手持/景深变化...）" value={shot.technicalNote || ''} onChange={(e) => updateShotField(shot.id, 'technicalNote', e.target.value)} />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="text-[var(--color-text-primary)] font-medium text-xs leading-relaxed">{shot.storyBeat}</div>
                      {shot.dialogue && <div className="text-indigo-300 text-[10px] bg-indigo-900/30 px-1.5 py-1 rounded-md">💬 {shot.dialogue}</div>}
                      {shot.directorNote && (
                        <div className="text-purple-300 text-[9px] bg-purple-900/30 px-1.5 py-1 rounded-md border-l-2 border-purple-500">
                          🎬 {shot.directorNote}
                        </div>
                      )}
                      {shot.technicalNote && (
                        <div className="text-amber-300 text-[9px] bg-amber-900/30 px-1.5 py-1 rounded-md border-l-2 border-amber-500">
                          🔧 {shot.technicalNote}
                        </div>
                      )}
                    </div>
                  )}
                </td>

                {/* 视觉设计列：景别/角度 + FG/MG/BG + 光影 + 运镜/动线 */}
                <td className="px-2 py-2 border-r border-[var(--color-border)] text-[10px]">
                  {/* 景别+角度行 */}
                  <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-[var(--color-border)]">
                    <span className="bg-blue-900/30 text-blue-300 px-1.5 py-0.5 rounded-md font-bold border border-blue-600/50">{shot.shotSize || '—'}</span>
                    <span className="text-[var(--color-text-secondary)]">{shot.angleDirection || '—'}</span>
                    <span className="text-[var(--color-text-tertiary)]">+</span>
                    <span className="text-[var(--color-text-secondary)]">{shot.angleHeight || '—'}</span>
                    {shot.dutchAngle && <span className="text-purple-400 font-medium">荷兰角{shot.dutchAngle}</span>}
                  </div>

                  {/* 三层构图 */}
                  <div className="space-y-0.5 mb-1.5 pb-1.5 border-b border-[var(--color-border)]">
                    <div><span className="text-[var(--color-text-tertiary)] font-medium w-8 inline-block">FG:</span> <span className="text-[var(--color-text-secondary)]">{shot.foreground || '—'}</span></div>
                    <div><span className="text-[var(--color-text-tertiary)] font-medium w-8 inline-block">MG:</span> <span className="text-[var(--color-text-primary)] font-medium">{shot.midground || '—'}</span></div>
                    <div><span className="text-[var(--color-text-tertiary)] font-medium w-8 inline-block">BG:</span> <span className="text-[var(--color-text-secondary)]">{shot.background || '—'}</span></div>
                  </div>

                  {/* 光影 */}
                  <div className="mb-1.5 pb-1.5 border-b border-[var(--color-border)]">
                    <span className="text-yellow-400">💡</span> <span className="text-[var(--color-text-secondary)]">{shot.lighting || '—'}</span>
                  </div>

                  {/* 运镜+动线 */}
                  <div className="flex items-start gap-1">
                    <span className="bg-cyan-900/30 text-cyan-300 px-1.5 py-0.5 rounded-md font-medium shrink-0 border border-cyan-600/50">📹 {shot.cameraMove || '—'}</span>
                    {isMotion && shot.motionPath && (
                      <span className="text-[var(--color-text-tertiary)] text-[9px]">| {shot.motionPath}</span>
                    )}
                  </div>
                </td>

                {/* 首帧列 - 运动镜头显示首帧描述，静态镜头留空 */}
                <td className="px-2 py-2 border-r border-[var(--color-border)]">
                  {isMotion ? (
                    editable ? (
                      <textarea className="w-full h-20 p-1.5 bg-green-900/20 border border-green-700/50 rounded text-[10px] text-green-200 resize-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                        placeholder="【首帧】画面描述..." value={shot.startFrame || ''} onChange={(e) => updateShotField(shot.id, 'startFrame', e.target.value)} />
                    ) : (
                      <div className="bg-green-900/30 p-2 rounded-md border-l-2 border-green-500 text-[10px] text-green-100 leading-relaxed">
                        {shot.startFrame || <span className="text-[var(--color-text-tertiary)] italic">未填写</span>}
                      </div>
                    )
                  ) : (
                    <div className="text-[var(--color-text-tertiary)] text-center py-4 italic text-[10px]">静态镜头</div>
                  )}
                </td>



                {/* 尾帧列 - 运动镜头显示尾帧描述，静态镜头留空 */}
                <td className="px-2 py-2">
                  {isMotion ? (
                    editable ? (
                      <textarea className="w-full h-20 p-1.5 bg-orange-900/20 border border-orange-700/50 rounded text-[10px] text-orange-200 resize-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                        placeholder="【尾帧】画面描述..." value={shot.endFrame || ''} onChange={(e) => updateShotField(shot.id, 'endFrame', e.target.value)} />
                    ) : (
                      <div className="bg-orange-900/30 p-2 rounded-md border-l-2 border-orange-500 text-[10px] text-orange-100 leading-relaxed">
                        {shot.endFrame || <span className="text-[var(--color-text-tertiary)] italic">未填写</span>}
                      </div>
                    )
                  ) : (
                    <div className="text-[var(--color-text-tertiary)] text-center py-4 italic text-[10px]">静态镜头</div>
                  )}
                </td>
              </tr>
            );
          })}
          {isLoading && progressMsg.includes('修改') && (
            <tr className="bg-blue-900/20">
	              <td colSpan={6} className="p-4 text-center text-blue-400 font-medium animate-pulse text-sm">
                正在重写分镜表...
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // 🆕 清除所有缓存数据，重新开始
  const handleResetAll = async () => {
    if (confirm('确定要清除所有数据并重新开始吗？此操作不可撤销。')) {
      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
      // 清除项目相关数据
      setCurrentProjectId(null);
      setCurrentProject(null);
      setCurrentEpisodeNumber(null);
      const allProjects = await getAllProjects();
      setProjects(allProjects);
      // 重置到项目列表
      setCurrentStep(AppStep.PROJECT_LIST);
      setScript('');
      setShots([]);
      setCharacterRefs(DEFAULT_CHARACTERS);
      setChatHistory([]);
      setHqUrls([]);
      setCotStage1(null);
      setCotStage2(null);
      setCotStage3(null);
      setCotStage4(null);
      setCotStage5(null);
      setCotRawOutput('');
      setStreamText('');
      setProgressMsg('');
      setExtractProgress('');
    }
  };

  return (
    <div className="min-h-screen p-3 bg-gray-900 text-gray-100 font-inter">
      <header className="max-w-7xl mx-auto mb-4 flex justify-between items-center">
        {/* 用户信息 */}
        <div className="flex items-center gap-2">
          {(() => {
            const userInfo = getUserInfo();
            return userInfo ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md">
                {userInfo.avatar && (
                  <img src={userInfo.avatar} alt="avatar" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-xs text-gray-300">{userInfo.nickname || userInfo.mobile || userInfo.email}</span>
                {/* 🆕 积分余额显示 */}
                {userPoints && (
                  <span className="text-yellow-400 font-medium text-xs ml-2 flex items-center gap-1">
                    💰 {userPoints.totalAvailablePoints.toLocaleString()}
                  </span>
                )}
              </div>
            ) : null;
          })()}
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">Director Studio</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={goToProjectList}
            className="px-3 py-1.5 bg-gray-800 text-blue-400 border border-gray-700 rounded-md text-xs font-medium hover:bg-gray-700 transition-all flex items-center gap-1.5"
            title="返回项目列表"
          >
            📁 项目
          </button>
          {/* 🆕 重新分析按钮 - 仅在项目主界面显示 */}
          {currentStep === AppStep.PROJECT_DASHBOARD && currentProject && (
            <button
              onClick={startReanalyzeProject}
              disabled={isReanalyzing}
              className={`px-3 py-1.5 border rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                isReanalyzing
                  ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                  : 'bg-gray-800 text-purple-400 border border-gray-700 hover:bg-gray-700'
              }`}
              title="重新分析所有剧集，提取角色、场景、类型等信息"
            >
              {isReanalyzing ? '🔄 分析中...' : '🔍 重新分析'}
            </button>
          )}
          <button
            onClick={logout}
            className="px-3 py-1.5 bg-gray-800 text-yellow-400 border border-gray-700 rounded-md text-xs font-medium hover:bg-gray-700 transition-all flex items-center gap-1.5"
            title="退出登录"
          >
            🚪 退出
          </button>
        </div>
      </header>

      {/* 🆕 项目列表页面 */}
      {currentStep === AppStep.PROJECT_LIST && (
        <div className="max-w-7xl mx-auto">
          {/* 项目列表 */}
          <ProjectList
            projects={projects}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
          />
        </div>
      )}

      {/* 🆕 新建项目向导 */}
      {currentStep === AppStep.PROJECT_WIZARD && (
        <ProjectWizard
          onComplete={handleProjectComplete}
          onCancel={handleProjectCancel}
          onAnalyze={handleAnalyzeProject}
        />
      )}

      {/* 🆕 项目主界面 */}
      {currentStep === AppStep.PROJECT_DASHBOARD && currentProject && (
        <ProjectDashboard
          project={currentProject}
          onSelectEpisode={handleSelectEpisode}
          onUpdateProject={handleUpdateProject}
          onBack={goToProjectList}
        />
      )}

      {/* 🆕 重新分析界面 */}
      {currentStep === AppStep.REANALYZE_PROJECT && currentProject && (
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                🔍 重新分析项目: {currentProject.name}
              </h2>
              <button
                onClick={cancelReanalyze}
                disabled={isReanalyzing}
                className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-md text-sm hover:bg-gray-600 transition-all disabled:opacity-50"
              >
                取消
              </button>
            </div>

            {/* 配置区域 - 只在未开始分析时显示 */}
            {!isReanalyzing && !reanalyzeResult && (
              <div className="space-y-4 mb-6">
                <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                  <h3 className="text-sm font-medium text-gray-300 mb-3">📊 分析配置</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">分析模型</label>
                      <div className="bg-gray-800 rounded px-3 py-2 text-sm text-white flex items-center gap-2">
                        🔮 Gemini 2.5 Flash ($0.30) ⭐推荐
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">剧集数量</label>
                      <div className="bg-gray-800 rounded px-3 py-2 text-sm text-white">
                        {currentProject?.episodes?.length || 0} 集
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    💡 分析将从剧本中提取：类型/题材、角色信息及形态、场景库、剧情大纲
                  </p>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={confirmAndStartReanalyze}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 flex items-center gap-2"
                  >
                    🔍 开始分析
                  </button>
                </div>
              </div>
            )}

            {/* 进度显示 */}
            {isReanalyzing && reanalyzeProgress && (
              <div className="mb-6 bg-blue-900/30 p-4 rounded-lg border border-blue-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <div>
                    <p className="text-sm font-bold text-blue-300">
                      正在分析第 {reanalyzeProgress.currentBatch}/{reanalyzeProgress.totalBatches} 批
                    </p>
                    <p className="text-xs text-blue-400">
                      {reanalyzeProgress.status === 'analyzing' && '分析中...'}
                      {reanalyzeProgress.status === 'merging' && '合并结果...'}
                      {reanalyzeProgress.status === 'complete' && '完成！'}
                    </p>
                  </div>
                </div>
                {/* 进度条：第1批刚开始时给最低 8% 宽度并加呼吸动效，避免用户误以为卡死 */}
                {(() => {
                  const rawPct = (reanalyzeProgress.currentBatch / reanalyzeProgress.totalBatches) * 100;
                  const isIdle = rawPct < 8 && reanalyzeProgress.status === 'analyzing';
                  const effectivePct = isIdle ? 8 : rawPct;
                  return (
                    <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className={`bg-blue-500 h-full transition-all duration-300${isIdle ? ' animate-pulse' : ''}`}
                        style={{ width: `${effectivePct}%` }}
                      />
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 实时结果显示 */}
            {reanalyzeResult && (
              <div className="space-y-4">
                {/* 基础信息 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-900 p-3 rounded">
                    <h4 className="text-xs text-gray-500 mb-1">类型</h4>
                    <p className="text-sm text-white">{reanalyzeResult.genre || '未识别'}</p>
                  </div>
                  <div className="bg-gray-900 p-3 rounded">
                    <h4 className="text-xs text-gray-500 mb-1">统计</h4>
                    <p className="text-sm text-white">
                      {reanalyzeResult.characters.length}角色 / {reanalyzeResult.scenes.length}场景 / {reanalyzeResult.episodeSummaries.length}集
                    </p>
                  </div>
                </div>

                {/* 角色列表 */}
                {reanalyzeResult.characters.length > 0 && (
                  <div className="bg-gray-900 p-3 rounded">
                    <h4 className="text-xs text-gray-500 mb-2">👥 角色 ({reanalyzeResult.characters.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {reanalyzeResult.characters.map((c, i) => (
                        <span key={i} className="px-2 py-1 bg-gray-700 text-gray-200 rounded text-xs">
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 场景列表 */}
                {reanalyzeResult.scenes.length > 0 && (
                  <div className="bg-gray-900 p-3 rounded">
                    <h4 className="text-xs text-gray-500 mb-2">🏛️ 场景 ({reanalyzeResult.scenes.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {reanalyzeResult.scenes.map((s, i) => (
                        <span key={i} className="px-2 py-1 bg-gray-700 text-gray-200 rounded text-xs">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 剧集概要 */}
                {reanalyzeResult.episodeSummaries.length > 0 && (
                  <div className="bg-gray-900 p-3 rounded max-h-64 overflow-y-auto">
                    <h4 className="text-xs text-gray-500 mb-2">📺 剧集概要 ({reanalyzeResult.episodeSummaries.length})</h4>
                    <div className="space-y-1">
                      {reanalyzeResult.episodeSummaries.slice(0, 20).map((ep, i) => (
                        <div key={i} className="text-xs text-gray-300">
                          <span className="text-blue-400 font-mono">Ep{ep.episodeNumber}</span>
                          <span className="text-gray-500 mx-1">|</span>
                          <span>{ep.title}</span>
                          <span className="text-gray-500 ml-2">{ep.summary?.slice(0, 50)}...</span>
                        </div>
                      ))}
                      {reanalyzeResult.episodeSummaries.length > 20 && (
                        <p className="text-xs text-gray-500">... 还有 {reanalyzeResult.episodeSummaries.length - 20} 集</p>
                      )}
                    </div>
                  </div>
                )}

                {/* 确认按钮 */}
                {!isReanalyzing && (
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                    <button
                      onClick={cancelReanalyze}
                      className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md text-sm hover:bg-gray-600"
                    >
                      取消
                    </button>
                    <button
                      onClick={confirmReanalyzeResult}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-500"
                    >
                      ✅ 应用分析结果
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 分析中但还没有结果 */}
            {isReanalyzing && !reanalyzeResult && (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400">正在分析 {currentProject?.episodes?.length || 0} 集剧本...</p>
                <p className="text-sm text-blue-400 mt-2 animate-pulse">AI 正在逐步分析，请稍候…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 原有流程 - 只在非项目管理页面显示 */}
      {currentStep !== AppStep.PROJECT_LIST && currentStep !== AppStep.PROJECT_WIZARD && currentStep !== AppStep.PROJECT_DASHBOARD && currentStep !== AppStep.REANALYZE_PROJECT && (
        <>
          <StepTracker currentStep={currentStep} />

          <main className="max-w-[1600px] mx-auto mt-4">
            {/* 项目信息栏 */}
            {currentProject && (
              <div className="mb-3 glass-card rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📁</span>
                  <div>
                    <span className="font-bold text-[var(--color-text)] text-sm">{currentProject.name}</span>
                    {currentEpisodeNumber && (
                      <span className="ml-2 px-2 py-0.5 bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] text-xs rounded-full border border-[var(--color-accent-blue)]/30">
                        第{currentEpisodeNumber}集
                      </span>
                    )}
                  </div>
                  <span className="text-[var(--color-text-tertiary)] text-xs">
                    {currentProject.settings.genre || '未设置类型'}
                  </span>
                </div>
                <button
                  onClick={goToProjectList}
                  className="px-2 py-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-light)] hover:bg-[var(--color-surface-hover)] rounded transition-all"
                >
                  ← 返回项目
                </button>
              </div>
            )}

            {currentStep === AppStep.INPUT_SCRIPT && (
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

              {/* 右边：角色设定（更大空间） */}
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
                  <div className="flex-1 overflow-auto">
                    {characterRefs.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 font-medium sticky top-0 bg-gray-800 py-1">已添加 ({characterRefs.length})：</p>
                        {characterRefs.map((ref) => (
                          <div key={ref.id} className="p-2 rounded border border-gray-700 bg-gray-900 group">
                            {editingCharId === ref.id ? (
                              // 编辑模式
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
                            ) : (
                              // 显示模式
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
                                  {/* 🆕 外观描述全部显示（不截断） */}
                                  {(() => {
                                    // 🔧 确保 appearance 是字符串后再调用 .includes()
                                    const appearanceStr = typeof ref.appearance === 'string' ? ref.appearance : '';
                                    // 如果appearance是"默认形态见forms数组"之类的描述，且有forms，显示第一个form的描述
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
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center py-6 bg-gray-900 rounded border border-dashed border-gray-700">
                        <span className="text-3xl mb-1">👤</span>
                        <p className="text-sm text-gray-400">暂无角色</p>
                        <p className="text-xs text-gray-500 mt-1">点击「从剧本提取」或手动添加</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 🆕 剧本清洗页面 */}
        {currentStep === AppStep.SCRIPT_CLEANING && (
          <div className="grid lg:grid-cols-2 gap-4">
            {/* 左侧：清洗进度 / 原始剧本 */}
            <div className="glass-card p-4 rounded-xl">
              <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                🧹 剧本清洗
              </h2>

              {isCleaning ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-blue-400">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-medium">正在清洗剧本...</span>
                  </div>
                  <div className="bg-[var(--color-bg)] p-3 rounded-lg border border-[var(--color-border)] max-h-[60vh] overflow-auto">
                    <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap font-mono">{cleaningProgress}</pre>
                  </div>
                </div>
              ) : cleaningResult ? (
                <div className="space-y-3">
                  {/* 解析错误提示 */}
                  {cleaningResult.parseError && (
                    <div className="bg-red-900/20 p-3 rounded-lg border border-red-700/50">
                      <h3 className="text-sm font-bold text-red-300 mb-1 flex items-center gap-2">
                        ⚠️ JSON解析失败
                      </h3>
                      <pre className="text-xs text-red-400 whitespace-pre-wrap max-h-32 overflow-auto">
                        {cleaningResult.rawOutput?.substring(0, 1000)}...
                      </pre>
                    </div>
                  )}

                  {/* 设定约束 */}
                  {cleaningResult.constraints?.length > 0 && (
                    <div className="bg-amber-900/20 p-3 rounded-lg border border-amber-700/50">
                      <h3 className="text-sm font-bold text-amber-300 mb-2 flex items-center gap-2">
                        ⚠️ 剧本设定约束
                      </h3>
                      <ul className="space-y-1">
                        {cleaningResult.constraints.map((c: any, i: number) => (
                          <li key={i} className="text-xs text-amber-400">
                            <span className="font-medium">• {c.rule}</span>
                            <span className="text-amber-500"> → {c.implication}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 场景权重 */}
                  {cleaningResult.sceneWeights?.length > 0 && (
                    <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-700/50">
                      <h3 className="text-sm font-bold text-blue-300 mb-2 flex items-center gap-2">
                        📊 场景权重分配
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {cleaningResult.sceneWeights.map((w: any, i: number) => (
                          <div key={i} className={`p-2 rounded-lg text-xs ${
                            w.weight === 'high' ? 'bg-red-900/30 text-red-300 border border-red-700/50' :
                            w.weight === 'medium' ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/50' :
                            'bg-green-900/30 text-green-300 border border-green-700/50'
                          }`}>
                            <div className="font-medium">场景 {w.sceneId}</div>
                            <div>建议 {w.suggestedShots} 镜头</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 非画面信息 */}
                  <div className="bg-[var(--color-bg)] p-3 rounded-lg border border-[var(--color-border)]">
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
                      🔇 非画面信息
                    </h3>
                    <div className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                      {cleaningResult.audioEffects?.length > 0 && (
                        <div><span className="font-medium">音效:</span> {cleaningResult.audioEffects.join(', ')}</div>
                      )}
                      {cleaningResult.musicCues?.length > 0 && (
                        <div><span className="font-medium">BGM:</span> {cleaningResult.musicCues.join(', ')}</div>
                      )}
                      {cleaningResult.timeCodes?.length > 0 && (
                        <div><span className="font-medium text-red-400">已忽略时间码:</span> {cleaningResult.timeCodes.join(', ')}</div>
                      )}
                      {cleaningResult.cameraSuggestions?.length > 0 && (
                        <div><span className="font-medium text-orange-400">镜头建议(仅参考):</span> {cleaningResult.cameraSuggestions.join(', ')}</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[var(--color-text-tertiary)] text-center py-8">等待清洗结果...</div>
              )}
            </div>

            {/* 右侧：清洗后的场景列表 */}
            <div className="glass-card p-4 rounded-xl">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  📝 清洗后的场景
                </h2>
                {cleaningResult && !isCleaning && (
                  <div className="flex items-center gap-2">
                    {/* 方案B：角色提取警告 */}
                    {characterRefs.length === 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                        <span className="text-amber-400">⚠️</span>
                        <span className="text-xs text-amber-300 font-medium">未提取角色</span>
                      </div>
                    )}

                    <button
                      onClick={startShotListGeneration}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-all shadow-lg"
                    >
                      🧠 开始5阶段生成 →
                    </button>

                    {/* 🆕 从失败处继续按钮 */}
                    {checkSavedCotProgress().hasProgress && (
                      <button
                        onClick={() => startChainOfThoughtGeneration()}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium text-sm hover:bg-amber-700 transition-all shadow-lg flex items-center gap-2"
                        title={`检测到上次在阶段${checkSavedCotProgress().lastStage}中断，点击继续`}
                      >
                        🔄 从阶段{checkSavedCotProgress().lastStage + 1}继续
                      </button>
                    )}

                    {/* 🆕 清除进度按钮 */}
                    {checkSavedCotProgress().hasProgress && (
                      <button
                        onClick={() => {
                          if (confirm('确定要清除保存的进度吗？')) {
                            clearSavedCotProgress();
                            alert('✅ 已清除保存的进度');
                          }
                        }}
                        className="px-3 py-2 bg-gray-600 text-white rounded-lg font-medium text-xs hover:bg-gray-700 transition-all"
                        title="清除保存的思维链进度"
                      >
                        🗑️ 清除进度
                      </button>
                    )}
                  </div>
                )}
              </div>

              {cleaningResult?.cleanedScenes ? (
                <div className="space-y-3 max-h-[60vh] overflow-auto">
                  {cleaningResult.cleanedScenes.map((scene, i) => (
                    <div key={i} className="p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-md font-medium">
                          场景 {scene.id}
                        </span>
                        {scene.moodTags.map((tag, j) => (
                          <span key={j} className="bg-purple-900/30 text-purple-300 text-xs px-2 py-0.5 rounded-md border border-purple-700/50">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="text-sm text-[var(--color-text-primary)] mb-2">{scene.visualContent}</div>
                      {scene.dialogues.length > 0 && (
                        <div className="text-xs text-[var(--color-text-secondary)] italic">
                          {scene.dialogues.map((d, k) => <div key={k}>「{d}」</div>)}
                        </div>
                      )}
                      {scene.uiElements.length > 0 && (
                        <div className="text-xs text-green-400 mt-1">
                          UI: {scene.uiElements.join(' | ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[var(--color-text-tertiary)] text-center py-10">等待清洗结果...</div>
              )}
            </div>
          </div>
        )}

        {/* 🆕 统一的分镜编辑页面（Tab布局） */}
        {(currentStep === AppStep.GENERATE_LIST || currentStep === AppStep.REVIEW_OPTIMIZE || currentStep === AppStep.MANUAL_EDIT) && (
          <div className="space-y-4">
            {/* 概述板块 - 固定显示 */}
            {episodeSummary && (
              <EpisodeSummaryPanel summary={episodeSummary} />
            )}

            {/* Tab切换栏 */}
            <div className="flex gap-2 bg-gray-800 p-2 rounded-lg border border-gray-700">
              <button
                onClick={() => handleTabChange('generate')}
                className={`relative px-4 py-2 rounded-md font-medium text-sm transition-all duration-300 ${
                  currentTab === 'generate'
                    ? 'bg-green-600 text-white shadow-lg scale-105'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:scale-102'
                }`}
              >
                🎬 生成
                {/* 状态指示 */}
                {shots.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-800 animate-pulse"></span>
                )}
              </button>
              <button
                onClick={() => handleTabChange('review')}
                className={`relative px-4 py-2 rounded-md font-medium text-sm transition-all duration-300 ${
                  currentTab === 'review'
                    ? 'bg-orange-600 text-white shadow-lg scale-105'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:scale-102'
                }`}
              >
                🔍 自检
                {/* 状态指示 */}
                {suggestions.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full border-2 border-gray-800 animate-pulse"></span>
                )}
              </button>
              <button
                onClick={() => handleTabChange('manual')}
                className={`relative px-4 py-2 rounded-md font-medium text-sm transition-all duration-300 ${
                  currentTab === 'manual'
                    ? 'bg-purple-600 text-white shadow-lg scale-105'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:scale-102'
                }`}
              >
                ✨ 精修
                {/* 状态指示 */}
                {chatHistory.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-400 rounded-full border-2 border-gray-800 animate-pulse"></span>
                )}
              </button>
            </div>

            {/* 动态内容区 - 根据Tab切换 */}
            {currentTab === 'generate' && (
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                   分镜脚本 ({shots.length} 镜)
                   {cotCurrentStage && (
                     <span className="ml-2 text-green-400 text-sm">
                       🧠 阶段 {cotCurrentStage}/5
                     </span>
                   )}
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  模型: {analysisModel.split('/')[1]} | 模式: 思维链
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* 🆕 重新生成分镜脚本按钮 */}
                <button
                  onClick={() => {
                    if (confirm('确定要重新生成分镜脚本吗？\n\n这将清除当前所有进度，从阶段1重新开始。')) {
                      clearSavedCotProgress();
                      setShots([]);
                      setCotStage1(null);
                      setCotStage2(null);
                      setCotStage3(null);
                      setCotStage4(null);
                      setCotStage5(null);
                      setCotCurrentStage(null);
                      setStreamText('');
                      startChainOfThoughtGeneration(1);
                    }
                  }}
                  disabled={isLoading}
                  className={`px-4 py-2 bg-amber-600 text-white rounded-lg font-medium text-sm transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-700'}`}
                  title="清除所有进度，从头重新生成分镜脚本"
                >
                  🔄 重新生成分镜脚本
                </button>

                <button
                  onClick={startReview}
                  disabled={isLoading}
                  className={`px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
                >
                  专家自检
                </button>
              </div>
            </div>

            {/* 思维链可视化面板 */}
            {(cotCurrentStage || cotStage1 || cotStage4) && (
              <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                {/* 进度条 */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-green-700 font-bold text-sm">🧠 思维链5阶段分析</span>
                  {cotCurrentStage && <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded animate-pulse">阶段 {cotCurrentStage}/5 进行中...</span>}
                </div>
                <div className="flex gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map((stage) => (
                    <div
                      key={stage}
                      className={`flex-1 h-2 rounded-full transition-all ${
                        (cotCurrentStage && stage < cotCurrentStage) || (!cotCurrentStage && cotStage4) ? 'bg-green-500' :
                        stage === cotCurrentStage ? 'bg-green-400 animate-pulse' :
                        'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between mb-4 text-xs text-gray-600">
                  <span className={cotStage1 ? 'text-green-700 font-medium' : ''}>① 剧本分析</span>
                  <span className={cotStage2 ? 'text-green-700 font-medium' : ''}>② 视觉策略</span>
                  <span className={cotStage3 ? 'text-green-700 font-medium' : ''}>③ 镜头分配</span>
                  <span className={cotStage4 ? 'text-green-700 font-medium' : ''}>④ 逐镜设计</span>
                  <span className={cotStage5 ? 'text-green-700 font-medium' : ''}>⑤ 自检</span>
                </div>

                {/* 阶段结果展示 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 阶段1结果：剧本分析 */}
                  {cotStage1 && (
                    <div className="bg-gray-800 p-3 rounded-lg border border-green-700">
                      <h4 className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1">
                        <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">1</span>
                        剧本分析
                      </h4>
                      <div className="text-xs space-y-1 text-gray-200">
                        <div><span className="text-gray-500">地点：</span>{cotStage1.basicInfo?.location || '—'}</div>
                        <div><span className="text-gray-500">角色：</span>{cotStage1.basicInfo?.characters?.slice(0, 3).join(', ') || '—'}</div>
                        <div><span className="text-gray-500">时间跨度：</span>{cotStage1.basicInfo?.timespan || '—'}</div>
                        <div><span className="text-gray-500">高潮：</span><span className="text-orange-400">{cotStage1.climax || '—'}</span></div>
                        {cotStage1.emotionArc && cotStage1.emotionArc.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            <span className="text-gray-500">情绪弧线：</span>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {cotStage1.emotionArc.map((e, i) => (
                                <span key={i} className={`px-1.5 py-0.5 rounded text-xs ${
                                  e.intensity >= 8 ? 'bg-red-900/50 text-red-300' :
                                  e.intensity >= 5 ? 'bg-yellow-900/50 text-yellow-300' :
                                  'bg-blue-900/50 text-blue-300'
                                }`}>
                                  {e.emotion}({e.intensity})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 阶段2结果：视觉策略 */}
                  {cotStage2 && (
                    <div className="bg-gray-800 p-3 rounded-lg border border-green-700">
                      <h4 className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1">
                        <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">2</span>
                        视觉策略
                      </h4>
                      <div className="text-xs space-y-1 text-gray-200">
                        <div><span className="text-gray-500">视觉基调：</span>{cotStage2.overallStyle?.visualTone || '—'}</div>
                        <div><span className="text-gray-500">光影风格：</span>{cotStage2.overallStyle?.lightingStyle || '—'}</div>
                        {cotStage2.overallStyle?.colorPalette && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">色彩：</span>
                            <span className="w-4 h-4 rounded" style={{backgroundColor: cotStage2.overallStyle.colorPalette.primary || '#666'}} title={cotStage2.overallStyle.colorPalette.primary}></span>
                            <span className="w-4 h-4 rounded" style={{backgroundColor: cotStage2.overallStyle.colorPalette.secondary || '#999'}} title={cotStage2.overallStyle.colorPalette.secondary}></span>
                            <span className="w-4 h-4 rounded" style={{backgroundColor: cotStage2.overallStyle.colorPalette.accent || '#f00'}} title={cotStage2.overallStyle.colorPalette.accent}></span>
                          </div>
                        )}
                        {cotStage2.rhythmControl?.emotionDrivenAllocation && (
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            <span className="text-gray-500">镜头分配：</span>
                            <div className="mt-1">
                              {cotStage2.rhythmControl.emotionDrivenAllocation.map((a, i) => (
                                <div key={i} className="text-xs text-gray-400">
                                  {a.sceneId}: {a.rhythmType} ({a.suggestedShotCount}镜)
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 阶段3结果：镜头分配 */}
                  {cotStage3 && (
                    <div className="bg-gray-800 p-3 rounded-lg border border-green-700">
                      <h4 className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1">
                        <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">3</span>
                        镜头分配
                      </h4>
                      <div className="text-xs space-y-1 text-gray-200">
                        <div><span className="text-gray-500">总时长：</span>{cotStage3.shotCount?.totalDuration || '—'}</div>
                        <div><span className="text-gray-500">目标镜头数：</span><span className="font-bold text-green-400">{cotStage3.shotCount?.targetTotal || cotStage3.shotList?.length || '—'}</span></div>
                        {cotStage3.shotDistribution?.byShotSize && (
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            <span className="text-gray-500">景别分布：</span>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {Object.entries(cotStage3.shotDistribution.byShotSize).map(([k, v]: [string, any]) => (
                                <span key={k} className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs">
                                  {k}: {v.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 当前阶段原始输出（可折叠） */}
                {cotRawOutput && cotCurrentStage && (
                  <details className="mt-3">
                    <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                      📜 查看当前阶段原始输出
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-900 text-gray-200 rounded text-xs overflow-auto max-h-48 whitespace-pre-wrap border border-gray-700">
                      {cotRawOutput.slice(-2000)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
            )}

            {/* 自检Tab */}
            {currentTab === 'review' && (
          <div className="space-y-4 animate-fadeIn">

            {/* 顶部操作栏 */}
            <div className="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-white">自检报告</h2>
                <span className="text-xs text-gray-400">
                  {suggestions.length > 0 ? `发现 ${suggestions.length} 条建议，已选 ${getSelectedSuggestionsCount()} 条` : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={applyOptimizations}
                  disabled={isLoading || getSelectedSuggestionsCount() === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                  {isLoading ? '优化中...' : `应用所选 (${getSelectedSuggestionsCount()})`}
                </button>
                <button onClick={() => {
                    setCurrentStep(AppStep.MANUAL_EDIT);
                    setChatHistory([{role: 'assistant', content: "我是您的AI导演助理，有任何想法都可以和我讨论。"}]);
                }} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg font-medium text-sm hover:bg-gray-600 transition-all">
                    跳过 → 精修
                </button>
              </div>
            </div>

            {/* 建议列表 */}
            {suggestions.length > 0 && (
              <div className="bg-amber-900/20 p-4 rounded-lg border border-amber-700">
                {/* 列表头部：标题 + 全选/取消全选 */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-amber-400">📋 修改建议</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAllSuggestions}
                      className="px-2.5 py-1 text-xs bg-amber-800/50 text-amber-300 rounded hover:bg-amber-800 transition-all"
                    >
                      全选
                    </button>
                    <button
                      onClick={deselectAllSuggestions}
                      className="px-2.5 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-all"
                    >
                      取消全选
                    </button>
                  </div>
                </div>
                <p className="text-xs text-amber-400/80 mb-3">💡 点击卡片查看完整内容，勾选后点击「应用所选」生效</p>

                {/* 建议卡片网格 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className={`bg-gray-800 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-gray-750 ${
                        s.selected ? 'border-amber-500 bg-amber-900/30' : 'border-gray-700'
                      }`}
                      onClick={() => setSelectedSuggestion(s)}
                    >
                      <div className="flex items-start gap-2">
                        {/* 勾选框 */}
                        <input
                          type="checkbox"
                          checked={s.selected ?? true}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSuggestionSelection(s.shotNumber);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 w-4 h-4 rounded border-gray-600 text-amber-500 focus:ring-amber-500 cursor-pointer bg-gray-700"
                          aria-label={`选择镜头 #${s.shotNumber}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-amber-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0">
                              #{s.shotNumber}
                            </span>
                            {s.field && (
                              <span className="bg-blue-900/50 text-blue-300 text-[8px] px-1.5 py-0.5 rounded shrink-0">
                                {s.field}
                              </span>
                            )}
                          </div>
                          <p className="font-medium text-xs text-gray-100 line-clamp-1">{s.suggestion}</p>
                          <p className="text-gray-400 text-[10px] line-clamp-2 mt-1">{s.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {suggestions.length === 0 && !isLoading && (
              <div className="text-center text-green-400 py-4 text-sm bg-green-900/30 rounded-lg border border-green-700">
                ✅ 无修改建议，脚本质量良好！
              </div>
            )}

            {/* 完整分镜表 */}
            <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
              <h3 className="text-sm font-bold text-gray-200 mb-2">📊 当前分镜表（{shots.length} 个镜头）</h3>
              {renderShotTable(false, true)}
            </div>

            {/* 建议详情弹窗 */}
            <SuggestionDetailModal
              suggestion={selectedSuggestion}
              onClose={() => setSelectedSuggestion(null)}
              onToggleSelect={toggleSuggestionSelection}
            />
          </div>
            )}

            {/* 精修Tab */}
            {currentTab === 'manual' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
                {/* TOP: Chat Agent - 增加高度到280px */}
                <div className="h-[280px] flex flex-col bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shrink-0">
                    <div className="py-2 px-4 bg-gray-900 text-white flex justify-between items-center">
                        <div>
                            <h2 className="text-sm font-bold flex items-center gap-2">🤖 AI 导演助理</h2>
                            <p className="text-[10px] text-gray-400">讨论剧情/镜头，确认后执行修改</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="py-1 px-2 bg-gray-700 text-white text-xs rounded border border-gray-600">
                              🔮 Gemini 2.5 Flash
                            </div>
                            <button
                                onClick={handleExecuteChanges}
                                disabled={isLoading || chatHistory.length < 2}
                                className="py-1.5 px-4 bg-blue-600 text-white rounded-md font-medium text-xs hover:bg-blue-500 transition-all disabled:opacity-50"
                            >
                                ✨ 执行修改
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-900" ref={chatScrollRef}>
                            {chatHistory.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] px-3 py-2 rounded-lg text-xs ${
                                        msg.role === 'user'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-800 border border-gray-700 text-gray-200'
                                    }`}>
                                        {/* 🆕 优化显示：支持换行和代码块 */}
                                        <div className="whitespace-pre-wrap break-words font-mono leading-relaxed">
                                          {msg.content}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {isLoading && !progressMsg.includes('修改') && (
                                <div className="flex justify-start">
                                    <div className="bg-gray-800 border border-gray-700 px-3 py-2 rounded-lg">
                                        <div className="flex gap-1">
                                            <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></div>
                                            <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-75"></div>
                                            <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-150"></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="px-3 py-2 bg-gray-800 border-t border-gray-700">
                         <div className="relative">
                            <textarea
                                className="w-full p-2 pr-10 bg-gray-700 text-gray-200 rounded-md text-xs focus:ring-1 focus:ring-blue-500 outline-none resize-none h-10"
                                placeholder="输入想法，如：把第3镜改成俯视..."
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleConsultDirector();
                                    }
                                }}
                            />
                            <button
                                onClick={handleConsultDirector}
                                disabled={isLoading}
                                aria-label="发送"
                                className="absolute right-1 bottom-1 p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-all disabled:opacity-50"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* BOTTOM: Table - 全宽显示 */}
                <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <button
                             onClick={exportToJSON}
                             className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-md font-medium text-xs hover:bg-gray-700 transition-all"
                          >
                             📥 导出JSON
                          </button>
                          <button
                             onClick={exportToExcel}
                             className="px-3 py-1.5 bg-gray-800 border border-green-700 text-green-400 rounded-md font-medium text-xs hover:bg-gray-700 transition-all"
                          >
                             📊 导出Excel
                          </button>
                          <button
                             onClick={downloadScript}
                             className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-md font-medium text-xs hover:bg-gray-700 transition-all"
                          >
                             📄 导出TXT
                          </button>
                        </div>
                        <button
                            onClick={() => setCurrentStep(AppStep.EXTRACT_PROMPTS)}
                            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-md font-bold text-sm transition-all"
                        >
                            下一步: 提取AI提示词 →
                        </button>
                    </div>
                    {/* 分镜表格全页显示，不使用滚动条 */}
                    {renderShotTable(true, true)}
                </div>
            </div>
            )}

            {/* 分镜表格 - 固定显示在所有Tab下方 */}
            {currentTab !== 'manual' && renderShotTable(false, true)}
          </div>
        )}

        {/* 🆕 提取AI提示词页面 */}
        {currentStep === AppStep.EXTRACT_PROMPTS && (
          <div className="space-y-4 pb-10">
            {/* 顶部栏 */}
            <div className="glass-card p-4 rounded-xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    🎯 提取AI生图提示词
                  </h2>
                  <p className="text-[var(--color-text-secondary)] text-xs mt-1">
                    根据 Nano Banana Pro 官方手册，从分镜脚本提取纯画面描述的AI提示词（中英文双版本）
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentStep(AppStep.MANUAL_EDIT)}
                    className="px-3 py-1.5 bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-lg font-medium text-xs hover:bg-[var(--color-surface-hover)] transition-all"
                  >
                    ← 返回精修
                  </button>
                  <button
                    onClick={() => setCurrentStep(AppStep.GENERATE_IMAGES)}
                    disabled={!shots.some(s => s.imagePromptEn)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    下一步: 绘制草图 →
                  </button>
                </div>
              </div>
            </div>

            {/* 提示词公式说明 */}
            <div className="glass-card p-4 rounded-xl bg-gradient-to-r from-purple-900/20 to-indigo-900/20 border-purple-700/50">
              <h3 className="font-bold text-purple-300 mb-2 flex items-center gap-2">
                📐 Nano Banana Pro 提示词公式
              </h3>
              <div className="text-sm text-purple-300">
                <code className="bg-[var(--color-bg)] px-3 py-1.5 rounded-lg border border-purple-700/50 inline-block">
                  [主体描述] + [环境/背景] + [动作/状态] + [技术参数(景别/角度/光影)]
                </code>
              </div>
              <ul className="text-xs text-purple-400 mt-3 space-y-1">
                <li>• <strong>主体描述</strong>：角色外貌、服装、在画面中的位置</li>
                <li>• <strong>环境/背景</strong>：场景、天气、时间</li>
                <li>• <strong>动作/状态</strong>：表情、姿态、正在做什么</li>
                <li>• <strong>技术参数</strong>：景别(medium shot)、角度(low angle)、光影(dramatic lighting)</li>
                <li>• <span className="text-red-400 font-medium">⚠️ 不含美术风格</span>：风格在生图时由用户选择后附加</li>
              </ul>
            </div>

            {/* 操作按钮 */}
            <div className="glass-card p-4 rounded-xl">
              <div className="flex items-center gap-4">
                <button
                  onClick={async () => {
                    setIsExtracting(true);
                    setExtractProgress('正在分析分镜脚本，提取AI生图提示词...');

                    try {
                      const stream = extractImagePromptsStream(shots, analysisModel);
                      let fullText = '';
                      for await (const text of stream) {
                        fullText = text;
                        setExtractProgress(`提取中... (${Math.round(fullText.length / 50)}%)`);
                      }

                      // 🆕 健壮的JSON解析
                      const parseRobustJSON = (text: string): any[] => {
                        // 移除markdown代码块标记
                        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

                        // 尝试直接解析
                        try {
                          return JSON.parse(cleaned);
                        } catch (e) {
                          console.log('[DEBUG] 直接解析失败，尝试修复JSON...');
                        }

                        // 修复常见问题
                        // 1. 移除尾随逗号
                        cleaned = cleaned.replace(/,(\s*[\]\}])/g, '$1');

                        // 2. 修复未转义的换行符（在字符串内）
                        cleaned = cleaned.replace(/("(?:[^"\\]|\\.)*")/g, (match) => {
                          return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
                        });

                        // 3. 尝试提取JSON数组
                        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
                        if (arrayMatch) {
                          try {
                            return JSON.parse(arrayMatch[0]);
                          } catch (e) {
                            console.log('[DEBUG] 数组提取失败，尝试逐个对象解析...');
                          }
                        }

                        // 4. 尝试逐个对象解析（最后的手段）
                        const results: any[] = [];
                        const objectPattern = /\{\s*"shotNumber"\s*:\s*"(\d+)"[^}]*\}/g;
                        let match;
                        while ((match = objectPattern.exec(cleaned)) !== null) {
                          try {
                            // 修复单个对象
                            let objStr = match[0]
                              .replace(/,(\s*\})/g, '$1')  // 移除尾随逗号
                              .replace(/\n/g, ' ')         // 替换换行
                              .replace(/\r/g, ' ');
                            const obj = JSON.parse(objStr);
                            results.push(obj);
                          } catch (e) {
                            console.warn(`[WARN] 解析对象失败: ${match[0].substring(0, 50)}...`);
                          }
                        }

                        if (results.length > 0) {
                          console.log(`[DEBUG] 成功从损坏的JSON中恢复 ${results.length} 个对象`);
                          return results;
                        }

                        throw new Error('无法解析AI返回的JSON，请重试');
                      };

                      const extracted = parseRobustJSON(fullText);

                      // 🆕 导入清理函数
                      const { removeChinese } = await import('./services/openrouter');

                      // 合并到shots，并清理英文提示词中的中文
                      const updatedShots = shots.map(shot => {
                        const match = extracted.find((e: any) => e.shotNumber === shot.shotNumber);
                        if (match) {
                          return {
                            ...shot,
                            imagePromptCn: match.imagePromptCn || '',
                            // 🆕 清理英文提示词中的中文字符
                            imagePromptEn: removeChinese(match.imagePromptEn || ''),
                            endImagePromptCn: match.endImagePromptCn || '',
                            // 🆕 清理英文提示词中的中文字符
                            endImagePromptEn: removeChinese(match.endImagePromptEn || ''),
                            videoGenPrompt: match.videoGenPrompt || ''
                          };
                        }
                        return shot;
                      });

                      setShots(updatedShots);
                      setExtractProgress(`✅ 提取完成！已更新 ${extracted.length} 个镜头的AI提示词`);

	                      // 🆕 保存提取的提示词到 D1（跨设备/跨成员可见，便于恢复进度）
	                      if (currentProject && currentEpisodeNumber !== null) {
	                        const currentEpisode = currentProject.episodes?.find(
	                          ep => ep.episodeNumber === currentEpisodeNumber
	                        );
	                        if (currentEpisode) {
	                          try {
	                            // 🔧 验证项目ID和剧集ID是否匹配
	                            console.log(`[D1存储] 准备保存提示词 - 项目: ${currentProject.name} (${currentProject.id}), 剧集: 第${currentEpisodeNumber}集 (${currentEpisode.id})`);
	                            console.log(`[D1存储] 镜头数量: ${updatedShots.length}, 第1个镜头: ${typeof updatedShots[0]?.storyBeat === 'string' ? updatedShots[0].storyBeat : updatedShots[0]?.storyBeat?.event || '未知'}`);

	                            const updatedEpisode: Episode = {
	                              ...currentEpisode,
	                              script: script || '',
	                              shots: updatedShots,
	                              updatedAt: new Date().toISOString(),
	                            };

	                            await saveEpisode(currentProject.id, updatedEpisode);
	                            console.log(`[D1存储] ✅ 第${currentEpisodeNumber}集提示词保存成功`);
	                            setExtractProgress(prev => (prev.includes('✅') ? `${prev}（已保存到云端）` : prev));
	                          } catch (error) {
	                            console.error('[D1存储] ❌ 保存提示词失败:', error);
	                          }
	                        } else {
	                          console.warn('[D1存储] ⚠️ 未找到当前剧集元信息，跳过保存提示词');
	                        }
	                      }

                      // 🆕 自动进行提示词校验（图片+视频）
                      setTimeout(async () => {
                        const {
                          validateVideoPromptSevenElements,
                          validateImagePromptFourElements
                        } = await import('./services/promptValidation');
                        const issues: any[] = [];

                        updatedShots.forEach(shot => {
                          // 1. 校验视频提示词
                          if (shot.videoGenPrompt) {
                            const validation = validateVideoPromptSevenElements(shot.videoGenPrompt);
                            if (!validation.valid) {
                              validation.suggestions.forEach(suggestion => {
                                issues.push({
                                  shotNumber: shot.shotNumber,
                                  suggestion: `[视频] ${suggestion}`,
                                  reason: `七要素: ${validation.score}%`
                                });
                              });
                            }
                          }

                          // 2. 校验中文图片提示词
                          if (shot.imagePromptCn) {
                            const validation = validateImagePromptFourElements(shot.imagePromptCn);
                            if (!validation.valid) {
                              validation.suggestions.forEach(suggestion => {
                                issues.push({
                                  shotNumber: shot.shotNumber,
                                  suggestion: `[图片] ${suggestion}`,
                                  reason: `四要素: ${validation.completenessScore}%`
                                });
                              });
                            }
                          }
                        });

                        if (issues.length > 0) {
                          setPromptValidationResults(issues);
                          setExtractProgress(`⚠️ 提取完成，但发现 ${issues.length} 个提示词问题，请点击"一键优化"修复`);
                        }
                      }, 500);
                    } catch (error) {
                      console.error('提取失败:', error);
                      setExtractProgress(`❌ 提取失败: ${error instanceof Error ? error.message : '未知错误'}。建议：重新点击提取按钮重试。`);
                    } finally {
                      setIsExtracting(false);
                    }
                  }}
                  disabled={isExtracting || shots.length === 0}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold text-sm hover:bg-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isExtracting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      提取中...
                    </>
                  ) : (
                    <>
                      🎯 一键提取AI提示词
                    </>
                  )}
                </button>

                {/* 🆕 自检提示词按钮 */}
                <button
                  onClick={validatePrompts}
                  disabled={isValidatingPrompts || !shots.some(s => s.imagePromptCn || s.imagePromptEn)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium text-sm hover:bg-amber-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isValidatingPrompts ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      自检中...
                    </>
                  ) : (
                    <>
                      🔍 自检提示词
                    </>
                  )}
                </button>

                <span className="text-sm text-[var(--color-text-secondary)]">{extractProgress}</span>
              </div>

              {/* 🆕 提示词自检结果显示 */}
              {promptValidationResults.length > 0 && (
                <div className="mt-4 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-red-400">⚠️ 发现 {promptValidationResults.length} 个提示词问题</h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          // 🆕 一键优化功能（同时优化图片和视频提示词）
                          const {
                            autoFixVideoPrompt,
                            validateVideoPromptSevenElements,
                            autoFixImagePrompt,
                            validateImagePromptFourElements
                          } = await import('./services/promptValidation');

                          let videoFixedCount = 0;
                          let imageFixedCount = 0;

                          const updatedShots = shots.map(shot => {
                            let updated = { ...shot };

                            // 1. 修复视频提示词
                            if (shot.videoGenPrompt) {
                              const videoValidation = validateVideoPromptSevenElements(shot.videoGenPrompt);
                              if (!videoValidation.valid) {
                                updated.videoGenPrompt = autoFixVideoPrompt(
                                  shot.videoGenPrompt,
                                  shot.shotType || '静态',
                                  shot.cameraMove,
                                  shot.startFrame,
                                  shot.endFrame
                                );
                                videoFixedCount++;
                              }
                            }

                            // 2. 修复中文图片提示词
                            if (shot.imagePromptCn) {
                              const imageValidation = validateImagePromptFourElements(shot.imagePromptCn);
                              if (!imageValidation.valid) {
                                updated.imagePromptCn = autoFixImagePrompt(
                                  shot.imagePromptCn,
                                  shot.shotSize,
                                  shot.angleHeight,
                                  shot.angleDirection,
                                  shot.character
                                );
                                imageFixedCount++;
                              }
                            }

                            // 3. 修复英文图片提示词（如果存在）
                            if (shot.imagePromptEn) {
                              const imageValidation = validateImagePromptFourElements(shot.imagePromptEn);
                              if (!imageValidation.valid) {
                                updated.imagePromptEn = autoFixImagePrompt(
                                  shot.imagePromptEn,
                                  shot.shotSize,
                                  shot.angleHeight,
                                  shot.angleDirection,
                                  shot.character
                                );
                              }
                            }

                            return updated;
                          });

                          setShots(updatedShots);
                          setPromptValidationResults([]);

                          const totalFixed = videoFixedCount + imageFixedCount;
                          alert(`✅ 已自动修复：\n- ${imageFixedCount} 个图片提示词\n- ${videoFixedCount} 个视频提示词\n共 ${totalFixed} 项！`);
                        }}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-all"
                      >
                        🔧 一键优化
                      </button>
                      <button
                        onClick={() => setPromptValidationResults([])}
                        className="text-xs text-gray-400 hover:text-gray-200"
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-2 text-xs">
                    {promptValidationResults.map((result, idx) => (
                      <div key={idx} className="p-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
                        <span className="font-bold text-amber-400">#{result.shotNumber}</span>
                        <span className="text-[var(--color-text-primary)] ml-2">{result.suggestion}</span>
                        <span className="text-[var(--color-text-tertiary)] ml-2">({result.reason})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 进度统计 */}
              {shots.length > 0 && (
                <div className="mt-4 flex gap-4 text-xs">
                  <span className="text-[var(--color-text-secondary)]">
                    总镜头: <strong className="text-[var(--color-text-primary)]">{shots.length}</strong>
                  </span>
                  <span className="text-emerald-400">
                    已提取: <strong>{shots.filter(s => s.imagePromptEn).length}</strong>
                  </span>
                  <span className="text-amber-400">
                    待提取: <strong>{shots.filter(s => !s.imagePromptEn).length}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* 提示词预览表格 */}
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="p-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] flex items-center justify-between">
                <h3 className="font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                  📋 提示词预览
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportPromptsToJSON}
                    disabled={!shots.some(s => s.imagePromptEn)}
                    className="px-3 py-1.5 bg-[var(--color-surface)] border border-purple-700/50 text-purple-400 rounded-lg font-medium text-xs hover:bg-[var(--color-surface-hover)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📥 导出JSON
                  </button>
                  <button
                    onClick={exportPromptsChineseCSV}
                    disabled={!shots.some(s => s.imagePromptCn)}
                    className="px-3 py-1.5 bg-[var(--color-surface)] border border-amber-700/50 text-amber-400 rounded-lg font-medium text-xs hover:bg-[var(--color-surface-hover)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🇨🇳 导出中文版
                  </button>
                  <button
                    onClick={exportPromptsEnglishCSV}
                    disabled={!shots.some(s => s.imagePromptEn)}
                    className="px-3 py-1.5 bg-[var(--color-surface)] border border-green-700/50 text-green-400 rounded-lg font-medium text-xs hover:bg-[var(--color-surface-hover)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🇺🇸 导出英文版
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--color-bg)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-tertiary)] w-16">#</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-tertiary)] w-20">类型</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-tertiary)] w-1/3">🇨🇳 中文提示词</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-tertiary)] w-1/3">🇺🇸 英文提示词 (生图用)</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-tertiary)]">🎬 视频提示词</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shots.map((shot, idx) => (
                      <tr key={shot.id} className={idx % 2 === 0 ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-bg)]'}>
                        <td className="px-3 py-2 font-mono font-bold text-gray-200">
                          #{shot.shotNumber}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            shot.shotType === '运动' ? 'bg-orange-900/50 text-orange-300' : 'bg-blue-900/50 text-blue-300'
                          }`}>
                            {shot.shotType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-300">
                          {shot.imagePromptCn ? (
                            <div className="space-y-1">
                              <div className="text-gray-200">{shot.imagePromptCn}</div>
                              {shot.endImagePromptCn && (
                                <div className="text-orange-400 border-t pt-1 mt-1 border-gray-700">
                                  <span className="text-[10px] font-medium">尾帧:</span> {shot.endImagePromptCn}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500 italic">待提取</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-300">
                          {shot.imagePromptEn ? (
                            <div className="space-y-1">
                              <div className="text-emerald-400 font-mono text-[10px]">{shot.imagePromptEn}</div>
                              {shot.endImagePromptEn && (
                                <div className="text-orange-400 border-t pt-1 mt-1 border-gray-700 font-mono text-[10px]">
                                  <span className="font-medium">End:</span> {shot.endImagePromptEn}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500 italic">Pending</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">
                          {shot.videoGenPrompt || <span className="text-gray-600">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {currentStep === AppStep.GENERATE_IMAGES && (
          <div className="space-y-4 pb-20">
            {/* 顶部栏 */}
            <div className="flex justify-between items-center bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-white">🎨 九宫格分镜草图</h2>
                <p className="text-gray-400 text-xs mt-1">
                  共 {shots.length} 个镜头 → {Math.ceil(shots.length / 9)} 张九宫格图 | 风格: {selectedStyle.name}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentStep(AppStep.EXTRACT_PROMPTS)}
                  className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-md font-medium text-xs hover:bg-gray-600 transition-all"
                >
                  ← 返回提示词
                </button>
              </div>
            </div>

            {/* 控制面板 */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              {/* 顶部操作栏 */}
              <div className="flex flex-wrap items-center gap-4 mb-4">
                {/* 当前风格显示 */}
                <button
                  onClick={() => setShowStyleCards(!showStyleCards)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg transition-all"
                >
                  <span className="text-xs text-gray-400 font-medium">风格:</span>
                  <span className="text-sm font-bold" style={{ color: selectedStyle.previewColor }}>{selectedStyle.name}</span>
                  <span className="text-xs text-gray-400">{showStyleCards ? '▲' : '▼'}</span>
                </button>

	              {/* ✅ 生图模型：锁定 nanobanana-pro（不允许在 UI 切换） */}
	              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-900/30 border border-purple-700 rounded-lg">
	                <span className="text-xs text-purple-300 font-medium">生图模型:</span>
	                <span className="text-sm font-bold text-purple-200">{imageModel}</span>
	                <span className="text-[10px] text-purple-400">(已锁定)</span>
	              </div>

                <div className="flex-1" />

                {/* 批量生成按钮 */}
                <button
                  onClick={generateHQ}
                  disabled={isLoading}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-all text-sm flex items-center gap-2 disabled:opacity-50 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      生成中...
                    </>
                  ) : (
                    <>🖼️ 批量生成九宫格</>
                  )}
                </button>

                {/* 🆕 停止生成按钮 */}
                {isLoading && abortController && (
                  <button
                    onClick={stopGeneration}
                    className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all text-sm flex items-center gap-2 shadow-lg"
                    title="停止当前生成任务，保留已完成的九宫格"
                  >
                    ⏸️ 停止生成
                  </button>
                )}

                {/* 应用到分镜表（从结果区移到顶部） */}
                <button
                  onClick={applyGridsToShots}
                  disabled={isLoading || hqUrls.filter(u => u).length === 0}
                  className="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-all text-sm flex items-center gap-2 disabled:opacity-50 shadow-lg"
                  title="将九宫格按序映射为每个镜头的草图（虚拟切割），并保存到云端"
                >
                  🎨 应用到分镜表
                </button>

                {/* 查看最终故事板（从结果区移到顶部） */}
                <button
                  onClick={() => setCurrentStep(AppStep.FINAL_STORYBOARD)}
                  disabled={!shots.some(s => s.storyboardGridUrl)}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all text-sm flex items-center gap-2 disabled:opacity-50 shadow-lg"
                  title="查看最终故事板预览（需要先应用到分镜表）"
                >
                  📋 查看最终故事板
                </button>
              </div>

              {/* 风格卡片选择区域 */}
              {showStyleCards && (
                <div className="border-t border-gray-700 pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                    {STORYBOARD_STYLES.map(style => (
                      <div
                        key={style.id}
                        onClick={() => {
                          setSelectedStyle(style);
                          setShowStyleCards(false);
                        }}
                        className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:shadow-lg ${
                          selectedStyle.id === style.id
                            ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        {/* 预览图区域 */}
                        <div
                          className="h-24 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center"
                          style={{
                            backgroundColor: style.previewColor,
                            backgroundImage: style.previewImage ? `url(${style.previewImage})` : undefined,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                          }}
                        >
                          {!style.previewImage && (
                            <span className="text-3xl opacity-50">🎨</span>
                          )}
                        </div>
                        {/* 文字区域 */}
                        <div className="p-2 bg-gray-800">
                          <div className="text-sm font-bold text-gray-200">{style.name}</div>
                          <div className="text-xs text-gray-400 truncate">{style.description}</div>
                        </div>
                        {/* 选中标记 */}
                        {selectedStyle.id === style.id && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs">✓</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* 自定义风格卡片 */}
                    <div
                      onClick={() => {
                        if (customStylePrompt.trim()) {
                          setSelectedStyle(createCustomStyle(customStylePrompt));
                          setShowStyleCards(false);
                        }
                      }}
                      className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:shadow-lg ${
                        selectedStyle.isCustom
                          ? 'border-purple-500 ring-2 ring-purple-500/30'
                          : 'border-dashed border-gray-600 hover:border-purple-500'
                      }`}
                    >
                      <div className="h-24 bg-gradient-to-br from-purple-900/30 to-purple-800/30 flex items-center justify-center">
                        <span className="text-3xl">✨</span>
                      </div>
                      <div className="p-2 bg-gray-800">
                        <div className="text-sm font-bold text-purple-400">自定义风格</div>
                        <div className="text-xs text-gray-400">输入你的提示词</div>
                      </div>
                    </div>
                  </div>

                  {/* 自定义风格输入框 */}
                  <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-700">
                    <label className="block text-xs font-medium text-purple-400 mb-1.5">
                      ✨ 自定义风格提示词（英文效果更好）
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customStylePrompt}
                        onChange={(e) => setCustomStylePrompt(e.target.value)}
                        placeholder="例如: watercolor painting, soft colors, dreamy atmosphere..."
                        className="flex-1 px-3 py-2 text-sm bg-gray-700 text-gray-200 border border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        onClick={() => {
                          if (customStylePrompt.trim()) {
                            setSelectedStyle(createCustomStyle(customStylePrompt));
                            setShowStyleCards(false);
                          }
                        }}
                        disabled={!customStylePrompt.trim()}
                        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        应用
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 进度显示 */}
              {isLoading && (
                <div className="mt-4 p-4 bg-gradient-to-r from-blue-900/30 to-indigo-900/30 rounded-lg border border-blue-700">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-12 h-12 border-4 border-blue-700 border-t-blue-400 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-400">AI</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-bold text-blue-300">{progressMsg}</p>
                      {/* 🆕 显示当前九宫格生成耗时 */}
                      {currentGeneratingGrid !== null && generationElapsedTime > 0 && (
                        <p className="text-xs text-blue-400 mt-1">
                          当前第 {currentGeneratingGrid + 1} 张已耗时: {Math.floor(generationElapsedTime / 60)}分{generationElapsedTime % 60}秒
                          {generationElapsedTime > 300 && (
                            <span className="text-orange-400 ml-2">
                              ⚠️ 生成时间较长，如需停止请点击"停止生成"按钮
                            </span>
                          )}
                        </p>
                      )}
                      <p className="text-xs text-blue-400 mt-1">
                        🎨 正在调用 AI 模型生成 {shots.length} 个镜头的草图...
                      </p>
                      <p className="text-[10px] text-blue-500 mt-1">
                        🍌 Nano Banana Pro | 风格: {selectedStyle.name}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 bg-blue-900 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-500 h-full animate-pulse" style={{ width: '60%' }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* 生成结果 - 多张九宫格图（实时显示） */}
            {hqUrls.length > 0 && (
              <div className="bg-green-900/30 p-4 rounded-lg border border-green-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-emerald-400 flex items-center gap-2">
                    {isLoading ? '⏳ 正在生成...' : '✅ 九宫格生成完成'} ({hqUrls.filter(u => u).length}/{Math.ceil(shots.length / 9)} 张)
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        hqUrls.filter(u => u).forEach((url, idx) => {
                          downloadImage(url, `storyboard_grid_${idx + 1}_${Date.now()}.png`);
                        });
                      }}
                      disabled={hqUrls.filter(u => u).length === 0}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-md font-medium text-xs hover:bg-emerald-700 transition-all disabled:opacity-50"
                    >
                      📥 下载全部 ({hqUrls.filter(u => u).length}张)
                    </button>

                    <button
                      onClick={() => setHqUrls([])}
                      className="px-4 py-2 bg-gray-600 text-white font-medium text-xs rounded-md hover:bg-gray-500"
                    >
                      🔄 重新生成
                    </button>
                  </div>
                </div>
                {/* 九宫格图片网格 - 实时显示 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {hqUrls.map((url, idx) => (
                    <div key={idx} className="bg-gray-800 rounded-lg overflow-hidden border border-green-700">
                      <div className="flex justify-between items-center px-3 py-2 bg-gray-900 border-b border-gray-700">
                        <span className="text-sm font-bold text-gray-200">第 {idx + 1} 页</span>
                        <div className="flex gap-2">
                          {url ? (
                            <>
                              {/* 🆕 单独重新生成按钮 */}
                              <button
                                onClick={() => regenerateSingleGrid(idx)}
                                disabled={isLoading}
                                className="px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                title="重新生成这张九宫格"
                              >
                                🔄 重新生成
                              </button>
                              {/* 🆕 上传按钮 */}
                              <button
                                onClick={() => {
                                  setUploadGridIndex(idx);
                                  setUploadDialogOpen(true);
                                }}
                                disabled={isLoading}
                                className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                title="上传自定义图片"
                              >
                                📤 上传
                              </button>
                              <button
                                onClick={() => downloadImage(url, `storyboard_grid_${idx + 1}_${Date.now()}.png`)}
                                className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                              >
                                📥 下载
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-orange-400">生成中...</span>
                              {/* 🆕 刷新任务按钮（如果有保存的taskCode） */}
                              {shots[idx * 9]?.storyboardGridGenerationMeta?.taskCode && (
                                <button
                                  onClick={() => handleRefreshGrid(idx)}
                                  disabled={isLoading}
                                  className="px-2 py-1 bg-cyan-600 text-white rounded text-xs hover:bg-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed ml-2"
                                  title="刷新任务状态，获取生成结果"
                                >
                                  🔄 刷新任务
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {url ? (
                        <img src={url} alt={`Storyboard Grid ${idx + 1}`} className="w-full" />
                      ) : (
                        <div className="h-64 bg-gray-700 flex items-center justify-center">
                          <div className="text-center">
                            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-sm text-gray-400">正在生成第 {idx + 1} 张九宫格...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 分镜预览列表 - 按九宫格分组 */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="px-4 py-3 bg-gray-900 border-b border-gray-700">
                <h3 className="text-sm font-bold text-gray-200">📋 分镜列表 ({shots.length} 个镜头 → {Math.ceil(shots.length / 9)} 张九宫格)</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">每张九宫格包含9个镜头，显示镜号、景别、台词、首尾帧信息</p>
              </div>

              {/* 按九宫格分组显示 */}
              {Array.from({ length: Math.ceil(shots.length / 9) }).map((_, gridIdx) => {
                const startIdx = gridIdx * 9;
                const endIdx = Math.min(startIdx + 9, shots.length);
                const gridShots = shots.slice(startIdx, endIdx);

                return (
                  <div key={gridIdx} className="border-b border-gray-700 last:border-b-0">
                    <div className="px-4 py-2 bg-blue-900/30 flex justify-between items-center">
                      <span className="text-xs font-bold text-blue-400">
                        📄 第 {gridIdx + 1} 页 (镜头 #{startIdx + 1} - #{endIdx})
                      </span>
                      <span className="text-[10px] text-blue-500">{gridShots.length} 个镜头</span>
                    </div>
                    <div className="grid grid-cols-3 gap-px bg-gray-700">
                      {gridShots.map((shot) => {
                        const isMotion = shot.shotType === '运动';
                        return (
                          <div key={shot.id} className="bg-gray-800 p-2">
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-sm font-bold text-blue-400">#{shot.shotNumber}</span>
                              <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${isMotion ? 'bg-amber-900/50 text-amber-400' : 'bg-gray-700 text-gray-400'}`}>
                                {shot.shotType || '静态'}
                              </span>
                              <span className="text-[9px] text-cyan-400 font-medium">{shot.shotSize}</span>
                            </div>
                            <p className="text-[10px] text-gray-300 line-clamp-1 mb-0.5">{shot.storyBeat || '—'}</p>
                            {shot.dialogue && (
                              <p className="text-[9px] text-purple-400 line-clamp-1">💬 {shot.dialogue}</p>
                            )}
                            {isMotion && (
                              <div className="mt-1 text-[8px]">
                                <p className="text-green-400 line-clamp-1">首: {shot.startFrame || '—'}</p>
                                <p className="text-orange-400 line-clamp-1">尾: {shot.endFrame || '—'}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* 填充空格子 */}
                      {Array.from({ length: 9 - gridShots.length }).map((_, i) => (
                        <div key={`empty-${i}`} className="bg-gray-700 p-2 flex items-center justify-center">
                          <span className="text-gray-500 text-xs">空</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 说明 */}
            <div className="bg-emerald-900/30 p-4 rounded-lg border border-emerald-700">
              <h4 className="text-sm font-bold text-emerald-400 mb-2">🎨 AI分镜草图说明</h4>
              <ul className="text-xs text-emerald-300 space-y-1">
                <li>• <strong>AI图像生成</strong>：调用 Neodomain API（{imageModel}）为每个镜头生成AI草图</li>
                <li>• <strong>九宫格布局</strong>：每张图包含9个镜头（3×3），标注镜号、景别、台词、首尾帧</li>
                <li>• <strong>风格控制</strong>：选择的风格（{selectedStyle.name}）会作为提示词后缀影响生成效果</li>
                <li>• <strong>批量下载</strong>：点击"下载全部"可一次性下载所有九宫格图</li>
              </ul>
            </div>
          </div>
        )}

        {/* 🆕 最终故事板预览 */}
        {currentStep === AppStep.FINAL_STORYBOARD && (
          <FinalStoryboard
            shots={shots}
            characterRefs={characterRefs}
            scenes={currentProject?.scenes || []}
            episodeNumber={currentEpisodeNumber}
            projectName={currentProject?.name}
            onBack={() => setCurrentStep(AppStep.GENERATE_IMAGES)}
          />
        )}
      </main>

      {isLoading && (
        <div className="fixed bottom-4 right-4 z-[100]">
          <div className="bg-gray-800 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 border border-gray-700">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-gray-200">{progressMsg}</p>
          </div>
        </div>
      )}

      {/* 🆕 上传九宫格对话框 */}
      {uploadDialogOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">
              📤 上传第 {uploadGridIndex !== null ? uploadGridIndex + 1 : ''} 张九宫格
            </h3>

            <div className="space-y-4">
              {/* URL输入 */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  图片URL
                </label>
                <input
                  type="text"
                  value={uploadUrl}
                  onChange={(e) => setUploadUrl(e.target.value)}
                  placeholder="https://example.com/image.png"
                  className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* 分隔线 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[var(--color-border)]"></div>
                <span className="text-xs text-[var(--color-text-tertiary)]">或</span>
                <div className="flex-1 h-px bg-[var(--color-border)]"></div>
              </div>

              {/* 文件上传 */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  上传本地图片
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  title="上传本地图片"
                  className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                />
                {uploadFile && (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    已选择: {uploadFile.name}
                  </p>
                )}
              </div>
            </div>

            {/* 按钮 */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setUploadDialogOpen(false);
                  setUploadGridIndex(null);
                  setUploadUrl('');
                  setUploadFile(null);
                }}
                className="flex-1 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg font-medium hover:bg-[var(--color-surface-hover)] transition-all"
              >
                取消
              </button>
              <button
                onClick={handleUploadGrid}
                disabled={!uploadUrl.trim() && !uploadFile}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认上传
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 思维链进度对话框 */}
      {showCotProgressModal && !cotProgressMinimized && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[300]">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 max-w-lg w-full mx-4 shadow-2xl">
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                🧠 AI思维链生成中...
              </h3>
              <div className="flex items-center gap-2">
                {/* 最小化按钮 */}
                <button
                  onClick={() => setCotProgressMinimized(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-all"
                  title="最小化"
                >
                  −
                </button>
                {/* 关闭按钮（仅在完成或出错时显示） */}
                {(!isLoading || cotError) && (
                  <button
                    onClick={() => setShowCotProgressModal(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-all"
                    title="关闭"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* 错误显示 */}
            {cotError ? (
              <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-red-400 font-medium mb-2">❌ 思维链生成失败</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">{cotError}</p>
                </div>

                {/* 错误操作按钮 */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setCotError(null);
                      startChainOfThoughtGeneration(cotCurrentStage || 1);
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all"
                  >
                    🔄 重试
                  </button>
                  <button
                    onClick={() => {
                      setCotError(null);
                      clearSavedCotProgress();
                      startChainOfThoughtGeneration(1);
                    }}
                    className="flex-1 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg font-medium hover:bg-[var(--color-surface-hover)] transition-all"
                  >
                    🔁 从头开始
                  </button>
                </div>
              </div>
            ) : (
              /* 正常进度显示 */
              <div className="space-y-4">
                {/* 当前阶段 */}
                <div className="text-center">
                  <p className="text-2xl font-bold text-[var(--color-accent-blue)] mb-2">
                    【阶段 {cotCurrentStage || 1}/5】
                    {cotCurrentStage === 1 && '剧本分析'}
                    {cotCurrentStage === 2 && '视觉策略'}
                    {cotCurrentStage === 3 && '镜头分配'}
                    {cotCurrentStage === 4 && '逐镜设计'}
                    {cotCurrentStage === 5 && '质量自检'}
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {progressMsg || '准备中...'}
                  </p>
                </div>

                {/* 进度条 */}
                <div className="relative">
                  <div className="h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
                      style={{ width: `${((cotCurrentStage || 0) / 5) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-center text-sm font-medium text-[var(--color-text-primary)] mt-2">
                    {Math.round(((cotCurrentStage || 0) / 5) * 100)}%
                  </p>
                </div>

                {/* 预计剩余时间 */}
                {cotStartTime && cotCurrentStage && cotCurrentStage < 5 && (
                  <div className="text-center text-sm text-[var(--color-text-tertiary)]">
                    ⏱️ 预计剩余时间：约 {Math.max(10, (5 - cotCurrentStage) * 20)} 秒
                  </div>
                )}

                {/* 提示信息 */}
                <div className="bg-[var(--color-accent-blue)]/10 border border-[var(--color-accent-blue)]/30 rounded-lg p-3">
                  <p className="text-xs text-[var(--color-text-secondary)] text-center">
                    💡 提示：您可以点击"最小化"继续浏览其他内容
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🆕 思维链进度最小化显示（右下角） */}
      {showCotProgressModal && cotProgressMinimized && !cotError && (
        <div className="fixed bottom-4 right-4 z-[300]">
          <button
            onClick={() => setCotProgressMinimized(false)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all flex items-center gap-3"
          >
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-left">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                【阶段 {cotCurrentStage || 1}/5】
                {cotCurrentStage === 1 && '剧本分析中...'}
                {cotCurrentStage === 2 && '视觉策略中...'}
                {cotCurrentStage === 3 && '镜头分配中...'}
                {cotCurrentStage === 4 && '逐镜设计中...'}
                {cotCurrentStage === 5 && '质量自检中...'}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                点击展开详情
              </p>
            </div>
          </button>
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default App;
