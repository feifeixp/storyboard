
import React, { useState, useRef, useEffect } from 'react';
import { AppStep, Shot, ReviewSuggestion, CharacterRef, CharacterForm, STORYBOARD_STYLES, StoryboardStyle, createCustomStyle, ScriptCleaningResult, EditTab, AngleDirection, AngleHeight, EpisodeSplit } from './types';
import { StepTracker } from './components/StepTracker';
import { UploadGridModal } from './src/components/UploadGridModal';
import Login from './components/Login';
import { isLoggedIn, logout, getUserInfo, getUserPoints, type PointsInfo } from './services/auth';

// 🆕 导入工具函数
import { normalizeCleaningResult } from './src/utils/helpers';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from './src/utils/storage';
import { exportToJSON as utilsExportToJSON, exportToExcel as utilsExportToExcel, exportPromptsChineseCSV, exportPromptsEnglishCSV, exportPromptsToJSON, downloadScriptText } from './src/utils/exportDefinitions';

// 🆕 导入自定义 Hooks
import {
  useAuth,
  useAppProjects,
  useScriptManagement,
  useCharacterManagement,
  useShotGeneration,
  useImageGeneration,
  useScriptAnalysis,
  useProjectManagement,
  detectAndSplitEpisodes,  // 🆕 剧集拆分函数
} from './src/hooks';

// 🆕 导入页面组件
import {
  ScriptInputPage,
  ScriptCleaningPage,
  ShotGenerationPage,
  PromptExtractionPage,
  VideoPromptExtractionPage, // 🆕 新增
  VideoGenerationPage,
  ImageGenerationPage,
} from './src/pages';
// 使用 OpenRouter 统一 API（支持多模型切换）
import {
  generateShotListStream,
  reviewStoryboardOpenRouter as reviewStoryboard,
  optimizeShotListStream,
  optimizeSingleShotStream,
  chatEditShotListStream,
  chatWithDirectorStream,
  generateMergedStoryboardSheet,
  extractImagePromptsStream,
  extractVideoPromptsStream, // 🆕 新增
  optimizeImagePromptsStream,
  cleanScriptStream,
  extractCharactersFromScript,
  detectArtStyleType,  // 🆕 美术风格检测
  MODELS,
  MODEL_NAMES,  // 🆕 模型显示名称
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
  detectForbiddenTerms,
  validateImagePrompt,
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
import { getGenerationResult, pollGenerationResult, TaskStatus, getModelsByScenario, ScenarioType, ImageGenerationModel } from './services/aiImageGeneration';
import { analyzeProjectScriptsWithProgress, analyzeProjectScripts } from './services/projectAnalysis';
import { regexPreScanScripts } from './services/projectAnalysis';
import { BatchAnalysisProgress } from './types/project';
// 🆕 本集概述生成
import { generateEpisodeSummary } from './services/episodeSummaryGenerator';
import { EpisodeSummaryPanel } from './components/EpisodeSummaryPanel';
// 🆕 角色外观补充管线
import { hasProjectStyle, getEffectiveStoryboardStyle } from './services/styleSettings';
// 🆕 状态名工具函数
import { isBaselineStateName, normalizeStateName } from './services/utils/stateNameUtils';
// 🆕 角色补充服务
import { autoSupplementMainCharacters } from './services/characterSupplement/autoSupplement';
import { identifyMainCharacters } from './services/characterSupplement/identifyMainCharacters';
import type { BeautyLevel, FormSummary } from './services/characterSupplement/types';
import { getBeautyLevelByGenre } from './services/characterSupplement/getBeautyLevelByGenre';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}


import { useVersionCheck } from './src/hooks/useVersionCheck';

const VersionUpdateToast: React.FC = () => {
  const hasUpdate = useVersionCheck(5 * 60 * 1000); // 5 minutes polling

  if (!hasUpdate) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] bg-indigo-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-bounce-short">
      <span className="text-sm font-medium">✨ 发现新版本更新</span>
      <button 
        onClick={() => {
          // Clear any potentially conflicting local states if necessary, or just reload
          window.location.reload();
        }}
        className="px-4 py-2 bg-white text-indigo-700 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors shadow-sm"
      >
        立即刷新体验
      </button>
    </div>
  );
};

const App: React.FC = () => {
  // ═══════════════════════════════════════════════════════════════
  // 🆕 用户认证检查
  // ═══════════════════════════════════════════════════════════════
  const { loggedIn, setLoggedIn, userPoints, setUserPoints } = useAuth();



  // ═══════════════════════════════════════════════════════════════
  // 原有状态
  // ═══════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════
  // 🆕 项目管理状态 (Hook)
  // ═══════════════════════════════════════════════════════════════
  const {
    projects, setProjects,
    currentProject, setCurrentProject, projectRef,
    currentEpisodeNumber, setCurrentEpisodeNumber,
    dashboardTab, setDashboardTab,
    pendingGenerations, setPendingGenerations
  } = useAppProjects(loggedIn, setCurrentStep, setCharacterRefs);

  // 🆕 模型选择相关
  const [reviewModel, setReviewModel] = useState<string>(MODELS.GEMINI_2_5_FLASH);
  const [editModel, setEditModel] = useState<string>(MODELS.GEMINI_2_5_FLASH);

  const [shots, setShots] = useState<Shot[]>(() =>
    loadFromStorage(STORAGE_KEYS.SHOTS, [])
  );
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<ReviewSuggestion | null>(null); // 当前查看的建议详情
  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [newCharName, setNewCharName] = useState('');
  const [newCharAppearance, setNewCharAppearance] = useState(''); // 角色外观描述
  const [newCharGender, setNewCharGender] = useState<'男' | '女' | '未知'>('未知');
  const [editingCharId, setEditingCharId] = useState<string | null>(null); // 正在编辑的角色ID
  const [streamText, setStreamText] = useState('');

  // 🆕 Tab切换状态（用于统一的分镜编辑页面）
  const [currentTab, setCurrentTab] = useState<EditTab>('generate');

  // Chat / Edit State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() =>
    loadFromStorage(STORAGE_KEYS.CHAT_HISTORY, [])
  );
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // 🆕 记录当前选中的 episodeId + 恢复任务 token，避免快速切换剧集时“旧恢复任务”污染新剧集状态
  const selectedEpisodeIdRef = useRef<string | null>(null);
  const nineGridResumeTokenRef = useRef(0);

  // State for Step 4 Images
  // 🆕 不再从 localStorage 加载 hqUrls（图片数据太大）
  // hqUrls 是临时数据，每次生成时重新获取

  // 🆕 九宫格上传对话框状态

  // 🆕 生图模型选择（动态从 Neodomain API 获取）
  const [imageModel, setImageModel] = useState<string>('nanobanana-2');
  const [availableImageModels, setAvailableImageModels] = useState<ImageGenerationModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // 🆕 分镜草图风格选择

  // 🆕 提示词提取状态

  // 🆕 提示词自检状态
  const [promptValidationResults, setPromptValidationResults] = useState<ReviewSuggestion[]>([]);
  const [isValidatingPrompts, setIsValidatingPrompts] = useState(false);
  // 🆕 一键优化变更记录（用于展示前后对比）
  const [optimizedChanges, setOptimizedChanges] = useState<Array<{ shotNumber: number | string; oldPrompt: string; newPrompt: string }>>([]);

  // 🆕 角色提取状态
  const [isExtractingChars, setIsExtractingChars] = useState(false);

  // 🆕 项目重新分析状态
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState<BatchAnalysisProgress | null>(null);
  const [reanalyzeResult, setReanalyzeResult] = useState<ProjectAnalysisResult | null>(null);

  // 🆕 剧本清洗状态（从localStorage恢复）
  const [cleaningResult, setCleaningResult] = useState<ScriptCleaningResult | null>(() =>
    loadFromStorage(STORAGE_KEYS.CLEANING_RESULT, null)
  );
  const [cleaningProgress, setCleaningProgress] = useState(() =>
    loadFromStorage(STORAGE_KEYS.CLEANING_PROGRESS, '')
  );
  const [isCleaning, setIsCleaning] = useState(false);

  // 🆕 剧集拆分相关状态
  const [episodes, setEpisodes] = useState<EpisodeSplit[]>([]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState<number | null>(null);
  const [currentScript, setCurrentScript] = useState(() =>
    loadFromStorage(STORAGE_KEYS.SCRIPT, '')
  );

  // 🆕 本集概述状态（从思维链结果生成）
  const [episodeSummary, setEpisodeSummary] = useState<import('./types/project').GeneratedEpisodeSummary | null>(null);

  // 🆕 图像生成相关状态 (Hook)
  const {
    hqUrls, setHqUrls,
    selectedStyle, setSelectedStyle,
    customStylePrompt, setCustomStylePrompt,
    showStyleCards, setShowStyleCards,
    uploadDialogOpen, setUploadDialogOpen,
    uploadGridIndex, setUploadGridIndex,
    uploadUrl, setUploadUrl,
    uploadFile, setUploadFile,
    extractProgress, setExtractProgress,
    isExtracting, setIsExtracting,
    abortController, setAbortController,
    generateHQ, stopGeneration, regenerateSingleGrid,
    handleUploadGrid, handleRefreshGrid, applyGridsToShots
  } = useImageGeneration({
    currentProject, currentEpisodeNumber,
    shots, setShots, characterRefs, imageModel,
    setIsLoading, setProgressMsg, setCurrentStep
  });

  // 🆕 思维链分析相关状态 (Hook)
  const {
    generationMode, setGenerationMode,
    cotCurrentStage, setCotCurrentStage,
    cotStage1, setCotStage1, cotStage2, setCotStage2, cotStage3, setCotStage3, cotStage4, setCotStage4, cotStage5, setCotStage5,
    cotRawOutput, setCotRawOutput,
    startChainOfThoughtGeneration
  } = useScriptAnalysis({
    script, currentProject, currentEpisodeNumber, shots, setShots, 
    setProgressMsg, setStreamText, setIsLoading, setCurrentStep, setEpisodeSummary
  });

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

  // 🆕 进入图片生成步骤时，从 Neodomain 加载可用生图模型列表
  useEffect(() => {
    if (currentStep !== AppStep.GENERATE_IMAGES || !loggedIn) return;
    if (availableImageModels.length > 0) return; // 已加载，无需重复请求

    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
        const models = await getModelsByScenario(ScenarioType.STORYBOARD);
        setAvailableImageModels(models);
        // 若当前 imageModel 不在列表里，自动切换为 nanobanana-2 或默认分镜模型
        if (models.length > 0 && !models.find(m => m.model_name === imageModel)) {
          const nanobanana2 = models.find(m => m.model_name.toLowerCase().includes('nanobanana') && m.model_name.includes('2'));
          const defaultModel = nanobanana2 || models.find(m => m.is_default_shot_model) || models[0];
          setImageModel(defaultModel.model_name);
        }
        console.log(`[App] 加载到 ${models.length} 个可用生图模型`);
      } catch (err) {
        console.error('[App] 获取生图模型列表失败:', err);
      } finally {
        setIsLoadingModels(false);
      }
    };
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, loggedIn]);

  // Robust Parsing helper for partial JSON streams
  // ⚠️ 此 effect 仅用于「生成分镜」和「精修-执行修改」流程，不处理「一键优化」
  // 「一键优化」在流结束后自行解析，不依赖此 effect，避免中途写入不完整数据
  useEffect(() => {
    if (!streamText || (currentStep !== AppStep.GENERATE_LIST && currentStep !== AppStep.MANUAL_EDIT && !progressMsg.includes('重写'))) return;

    // Only try to parse as JSON if we are NOT in the "chatting" mode (which returns plain text)
    // We differentiate by checking if we are running 'Execute' action
    // ⚠️ 排除「一键优化」场景，避免流式中途覆盖 shots
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

  const handleScriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setScript(text);
        // 自动检测并拆分剧集
        const detectedEpisodes = detectAndSplitEpisodes(text);
        if (detectedEpisodes.length > 0) {
          setEpisodes(detectedEpisodes);
          setCurrentEpisodeIndex(0);
          setCurrentScript(detectedEpisodes[0].script);
          console.log(`[剧集拆分] 检测到 ${detectedEpisodes.length} 集`);
        } else {
          setEpisodes([]);
          setCurrentEpisodeIndex(null);
          setCurrentScript(text);
        }
      };
      reader.readAsText(file);
    }
  };

  // 🆕 处理剧本文本变化（用于粘贴文本时自动检测剧集）
  const handleScriptTextChange = (text: string) => {
    setScript(text);
    // 重新检测剧集
    const detectedEpisodes = detectAndSplitEpisodes(text);
    if (detectedEpisodes.length > 0) {
      setEpisodes(detectedEpisodes);
      setCurrentEpisodeIndex(0);
      setCurrentScript(detectedEpisodes[0].script);
    } else {
      setEpisodes([]);
      setCurrentEpisodeIndex(null);
      setCurrentScript(text);
    }
  };

  // 🆕 切换当前处理的剧集
  const selectEpisode = (index: number) => {
    if (index >= 0 && index < episodes.length) {
      setCurrentEpisodeIndex(index);
      setCurrentScript(episodes[index].script);
      // 切换剧集后清空之前的清洗结果
      setCleaningResult(null);
      setCleaningProgress('');
    }
  };

  // 🆕 取消剧集拆分，使用完整剧本
  const cancelEpisodeSplit = () => {
    setEpisodes([]);
    setCurrentEpisodeIndex(null);
    setCurrentScript(script);
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
      if (!fullProject.settings.projectStyleId && fullProject.settings.visualStyle) {
        console.log('[旧项目迁移] 检测到旧项目，开始自动迁移...');
        // 获取媒体类型对应的英文渲染后缀
        const mediaType = fullProject.settings.mediaType || 'ai-2d';
        const aiPromptHint = PROJECT_MEDIA_TYPES[mediaType].aiPromptHint;
        // 自动迁移：projectStyleId='custom'，使用旧 visualStyle 作为中文描述，aiPromptHint 作为英文后缀
        fullProject.settings.projectStyleId = 'custom';
        fullProject.settings.projectStyleCustomPromptCn = fullProject.settings.visualStyle;
        fullProject.settings.projectStyleCustomPromptEn = aiPromptHint;
        fullProject.settings.storyboardStyleOverride = null;
        console.log('[旧项目迁移] 迁移完成，持久化中...');
        try {
          await patchProject(fullProject.id, { settings: fullProject.settings });
          console.log('[旧项目迁移] 迁移结果已持久化');
        } catch (error) {
          console.error('[旧项目迁移] 持久化失败:', error);
          // 不阻断加载流程，仅记录错误
        }
      }

      setCurrentProject(fullProject);
      projectRef.current = fullProject;
      setCurrentProjectId(fullProject.id);

      // 加载项目的角色库
      if (fullProject.characters && fullProject.characters.length > 0) {
        setCharacterRefs(fullProject.characters);
        console.log(`[handleSelectProject] 加载了 ${fullProject.characters.length} 个角色`);
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
      // ⚠️ 创建项目完成时需要把 episodes 一并落库（episodes 表）
      await saveProject(project, { includeEpisodes: true });
      const allProjects = await getAllProjects();
      setProjects(allProjects);
      setCurrentProject(project);
      projectRef.current = project;
      setCurrentProjectId(project.id);
      // 加载项目角色（安全检查）
      if (project.characters && project.characters.length > 0) {
        setCharacterRefs(project.characters);
      }
      // 🆕 进入项目主界面
      setCurrentStep(AppStep.PROJECT_DASHBOARD);

      // 🆕 启动后台角色补全（不阻塞 UI）
      // 同时检查顶层 status（ProjectWizard 初始化时设置）和 perCharacter（恢复场景）
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

    // 前置校验：确保已登录
    if (!isLoggedIn()) {
      console.error('[后台补全] 未登录，中止后台补全');
      alert('❌ 登录已失效\n\n后台补全需要登录，请重新登录');
      setLoggedIn(false);
      return;
    }

    // 生成本次补全任务的 runId（用于隔离不同任务的进度更新）
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    console.log(`[后台补全] 本次任务 runId: ${runId}`);
    const startedAt = new Date().toISOString();
    let lastProgressUpdate = 0;

    // 写库串行队列（解决 AbortError）
    const writeQueue: Array<() => Promise<void>> = [];
    let isWriting = false;

    const processWriteQueue = async () => {
      if (isWriting || writeQueue.length === 0) return;
      isWriting = true;
      while (writeQueue.length > 0) {
        const task = writeQueue.shift();
        if (task) {
          try { await task(); } catch (err) { console.error('[写库队列] 任务执行失败:', err); }
        }
      }
      isWriting = false;
    };

    const queuedPatchProject = (projectId: string, patch: any): Promise<void> => {
      return new Promise((resolve, reject) => {
        writeQueue.push(async () => {
          try { await patchProject(projectId, patch); resolve(); }
          catch (err) { reject(err); }
        });
        processWriteQueue();
      });
    };

    // 5秒节流写库（非终态合并写，终态立即 flush）
    let pendingPatch: any = null;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const throttledPatchProject = async (projectId: string, patch: any, isTerminal: boolean = false) => {
      if (isTerminal) {
        if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
        if (pendingPatch) { await queuedPatchProject(projectId, pendingPatch); pendingPatch = null; }
        await queuedPatchProject(projectId, patch);
      } else {
        pendingPatch = pendingPatch ? { ...pendingPatch, ...patch } : patch;
        if (!throttleTimer) {
          throttleTimer = setTimeout(async () => {
            if (pendingPatch) { await queuedPatchProject(projectId, pendingPatch); pendingPatch = null; }
            throttleTimer = null;
          }, 5000);
        }
      }
    };

    // 进度更新互斥队列（防止并发覆盖）
    let progressUpdateQueue = Promise.resolve();

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
      progressUpdateQueue = progressUpdateQueue.then(async () => {
        try {
          const now = Date.now();
          const latestProject = projectRef.current || project;
          const currentProgress = (latestProject.settings?.backgroundJobs?.supplement?.perCharacter as any)?.[characterId];

          // runId 隔离：只接受当前 runId 的更新
          if (currentProgress?.runId && currentProgress.runId !== runId) return;

          const statusRank: Record<string, number> = { 'queued': 0, 'running': 1, 'complete': 2, 'error': 2 };
          const stageRank: Record<string, number> = {
            'start': 0, 'stage1': 1, 'stage2': 2, 'stage3': 3, 'stage4': 4,
            'stage5': 5, 'stage5.5': 5.5, 'merge': 6, 'complete': 7, 'error': 7
          };

          if (currentProgress) {
            const currentStatusRank = statusRank[currentProgress.status] || 0;
            const newStatusRank = statusRank[update.status] || 0;
            const currentStage = currentProgress.stage || '';
            const newStage = update.stage || currentStage;
            const currentStageRank = stageRank[currentStage] || 0;
            let newStageRank = stageRank[newStage];
            if (newStageRank === undefined) newStageRank = currentStageRank;

            if (currentStatusRank >= 2 && newStatusRank < 2) return;
            if (currentStageRank > newStageRank) return;
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
                    runId,
                    startTime: (latestProject.settings?.backgroundJobs?.supplement?.perCharacter as any)?.[characterId]?.startTime || now,
                    endTime: update.status === 'complete' || update.status === 'error' ? now : undefined
                  }
                }
              }
            }
          };

          const isTerminal = update.status === 'complete' || update.status === 'error';
          try {
            await throttledPatchProject(project.id, { settings: newSettings }, isTerminal);
          } catch (err) {
            console.warn('[后台补全] DB 更新失败:', err);
            const isAuthError = err instanceof Error &&
              ((err as any).code === 'AUTH_REQUIRED' || err.message.includes('Unauthorized'));
            if (isAuthError) { setLoggedIn(false); throw err; }
          }

          setCurrentProject(prev =>
            prev?.id === project.id ? { ...prev, settings: newSettings } : prev
          );
          if (projectRef.current?.id === project.id) {
            projectRef.current = { ...projectRef.current, settings: newSettings };
          }
        } catch (err) {
          console.error('[后台补全] 进度更新失败:', err);
        }
      }).catch(err => { console.error('[后台补全] 进度更新队列异常:', err); });

      await progressUpdateQueue;
    };

    try {
      // 检查 genre 是否为空
      const genre = project.settings?.genre || '';
      if (!genre) {
        console.error('[后台补全] ❌ 剧本类型为空，无法确定美型等级');
        alert('⚠️ 剧本类型未设置\n\n请先在项目设置中选择题材类型，或运行项目分析自动识别题材。');
        await patchProject(project.id, {
          settings: {
            ...project.settings,
            backgroundJobs: {
              ...(project.settings?.backgroundJobs || {}),
              supplement: { status: 'error', startedAt, completedAt: new Date().toISOString(), error: '剧本类型未设置' }
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

      // 2. 智能选择美型等级
      const beautyLevel = getBeautyLevelByGenre(genre);
      console.log(`[后台补全] 剧本类型: ${genre} → 美型等级: ${beautyLevel}`);

      // 3. 使用用户在向导中勾选的主角
      const mainChars = (project.characters || []).filter(c =>
        c.description?.includes('【主角】') || c.role === '主角'
      );
      const mainIds = new Set(mainChars.map(c => c.id));
      console.log(`[后台补全] 主角列表（${mainChars.length} 个）:`, mainChars.map(c => c.name));

      // 初始化所有主要角色的进度为 queued
      for (const char of mainChars) {
        await updateCharacterProgress(char.id, { status: 'queued', stage: 'start', message: '等待补全...' });
      }

      // 清空主要角色 appearance（内存 + DB），强制走 CoT 生成
      const charactersForSupplement = (project.characters || []).map(c =>
        mainIds.has(c.id) ? { ...c, appearance: '' } : c
      );
      try {
        await patchProject(project.id, { characters: charactersForSupplement });
        console.log(`[后台补全] 🔧 已清空 ${mainIds.size} 个主要角色的 appearance`);
      } catch (err) {
        console.warn('[后台补全] 清空 appearance 写 DB 失败:', err);
      }
      setCurrentProject(prev =>
        prev?.id === project.id ? { ...prev, characters: charactersForSupplement } : prev
      );
      if (currentProject?.id === project.id) {
        setCharacterRefs(charactersForSupplement);
      }

      const updatedCharacters = await autoSupplementMainCharacters(
        charactersForSupplement,
        scripts,
        {
          projectId: project.id,
          maxCharacters: 5,
          minAppearances: 0,
          mode: 'detailed',
          beautyLevel,
          fixedMainCharacterIds: Array.from(mainIds),
          onProgress: async (progress: { current: number; total: number; characterName: string; stage: string; message?: string }) => {
            const isTerminalStatus = ['merge', 'complete', 'error'].includes(progress.stage);
            const now = Date.now();
            if (!isTerminalStatus && now - lastProgressUpdate < 500) return;
            lastProgressUpdate = now;

            const currentChar = mainChars.find(c => c.name === progress.characterName);
            if (currentChar) {
              const status = progress.stage === 'complete' ? 'complete' : 'running';
              const progressPercent = progress.stage === 'complete' ? 100
                : Math.round((progress.current / progress.total) * 100);
              await updateCharacterProgress(currentChar.id, {
                status,
                message: progress.message || progress.stage,
                stage: progress.stage,
                progress: progressPercent
              });
            }
          },
          onStageComplete: async (charId: string, charName: string, stage: string, result: any) => {
            console.log(`[后台补全] 🎯 角色"${charName}"完成 ${stage}`);
            const currentChar = charactersForSupplement.find(c => c.id === charId);
            if (!currentChar) return;

            const updatedChar = { ...currentChar };
            if ((stage === 'stage3' || stage === 'stage4') && result.appearance) {
              updatedChar.appearance = result.appearance;
            } else if (stage === 'stage5.5' && result.formSummaries && result.formSummaries.length > 0) {
              const latestChar = (projectRef.current?.characters || []).find(c => c.id === charId);
              const existingSummaries = (latestChar?.formSummaries || []) as FormSummary[];
              const existingNames = new Set(existingSummaries.map(f => f.name));
              const newUnique = (result.formSummaries as FormSummary[]).filter(f => !existingNames.has(f.name));
              updatedChar.formSummaries = [...existingSummaries, ...newUnique];
            }

            const latestProject = projectRef.current || project;
            const latestChars = (latestProject.characters || []).map(c => c.id === charId ? updatedChar : c);
            try {
              await throttledPatchProject(project.id, { characters: latestChars }, true);
              setCurrentProject(prev =>
                prev?.id === project.id ? { ...prev, characters: latestChars } : prev
              );
              setCharacterRefs(latestChars);
              if (projectRef.current?.id === project.id) {
                projectRef.current = { ...projectRef.current, characters: latestChars };
              }
            } catch (err) {
              console.error(`[后台补全] ❌ 角色"${charName}" ${stage} 写库失败:`, err);
            }
          }
        }
      );

      // Phase 1 轻量形态摘要扫描
      console.log('[后台补全] 🔍 开始 Phase 1 轻量形态摘要扫描...');
      const { extractFormSummaries: extractFormSummariesFn } = await import('./services/characterSupplement/extractCharacterStates');
      const charactersWithStates = await Promise.all(
        updatedCharacters.map(async (character: CharacterRef) => {
          if (!mainIds.has(character.id)) return character;
          try {
            const summaries = await extractFormSummariesFn(character, scripts, 'gemini-2.5-flash');
            if (summaries.length === 0) return character;
            const existingSummaries = (character.formSummaries || []) as FormSummary[];
            const existingNames = new Set(existingSummaries.map(f => f.name));
            const newUnique = summaries.filter(f => !existingNames.has(f.name));
            return { ...character, formSummaries: [...existingSummaries, ...newUnique] };
          } catch (error) {
            console.error(`[后台补全] ❌ 角色"${character.name}"形态摘要扫描失败:`, error);
            return character;
          }
        })
      );
      console.log('[后台补全] 🔍 Phase 1 扫描完成');

      // 强制 upsert「常规状态（完好）」基底
      const charactersWithBaseline = charactersWithStates.map((character: CharacterRef) => {
        if (!mainIds.has(character.id)) return character;
        let recoveredAppearance = character.appearance;
        if (!recoveredAppearance || recoveredAppearance.trim().length === 0) {
          const latestChar = (projectRef.current?.characters || []).find(c => c.id === character.id);
          if (latestChar?.appearance && latestChar.appearance.trim().length > 0) {
            recoveredAppearance = latestChar.appearance;
          }
        }
        if (!recoveredAppearance || recoveredAppearance.trim().length === 0) return character;

        const otherForms = (character.forms || []).filter(f => !isBaselineStateName(f.name));
        const normalForm: CharacterForm = {
          id: `${character.id}-normal-baseline`,
          name: '常规状态（完好）',
          episodeRange: '',
          description: recoveredAppearance,
          note: '',
          visualPromptCn: '',
          visualPromptEn: '',
          imageSheetUrl: '',
          imageGenerationMeta: { modelName: '', styleName: '', generatedAt: new Date().toISOString() },
          changeType: 'costume' as any,
          priority: 100 as any
        };
        return { ...character, appearance: recoveredAppearance, forms: [normalForm, ...otherForms] };
      });

      // 标记所有主要角色为完成
      for (const char of mainChars) {
        await updateCharacterProgress(char.id, { status: 'complete', stage: 'complete', message: '补全完成', progress: 100 });
      }

      // 写回数据库
      await patchProject(project.id, { characters: charactersWithBaseline });
      console.log('[后台补全] ✅ 补充完成');

      setCurrentProject(prev =>
        prev?.id === project.id ? { ...prev, characters: charactersWithBaseline } : prev
      );
      if (currentProject?.id === project.id) {
        setCharacterRefs(charactersWithBaseline);
      }

    } catch (error) {
      console.error('[后台补全] ❌ 补充失败:', error);
      const fallbackMainChars = identifyMainCharacters(
        project.characters || [],
        { minAppearances: 0, maxCount: 5 }
      );
      for (const char of fallbackMainChars) {
        await updateCharacterProgress(char.id, {
          status: 'error',
          stage: 'error',
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
          const reason = quick.failure_reason || '任务已失败（服务端未返回原因）';
          console.warn(`[NineGrid恢复] ❌ grid#${gridIndex + 1} 任务失败：${meta.taskCode}`);
          setProgressMsg(`⚠️ 第 ${gridIndex + 1} 张九宫格生成任务失败：${reason}`);
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
          const reason = result.failure_reason || '任务已失败（服务端未返回原因）';
          console.warn(`[NineGrid恢复] ❌ grid#${gridIndex + 1} 任务失败：${meta.taskCode}`);
          setProgressMsg(`⚠️ 第 ${gridIndex + 1} 张九宫格生成任务失败：${reason}`);
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
  const handleSelectEpisode = async (episode: Episode, targetStepOverride?: AppStep) => {
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
      // 优先级：最终故事板(九宫格已回填到 shots) > 提示词(Seedance已提取) > 精修 > 导入
      const hasShots = Array.isArray(fullEpisode.shots) && fullEpisode.shots.length > 0;
      const hasStoryboard =
        hasShots &&
        fullEpisode.shots!.some(s => typeof s.storyboardGridUrl === 'string' && s.storyboardGridUrl.trim());
      const hasVideoPrompts =
        hasShots &&
        fullEpisode.shots!.some(s => typeof s.videoPromptCn === 'string' && s.videoPromptCn.trim());

      let targetStep = targetStepOverride;
      if (targetStep === undefined) {
        targetStep = !hasShots
          ? AppStep.INPUT_SCRIPT
          : (hasStoryboard || hasVideoPrompts)
            ? AppStep.FINAL_STORYBOARD
            : AppStep.MANUAL_EDIT;
      }

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
      const hasVideoPrompts =
        hasShots &&
        episode.shots!.some(s => typeof s.videoPromptCn === 'string' && s.videoPromptCn.trim());

      const targetStep = !hasShots
        ? AppStep.INPUT_SCRIPT
        : (hasStoryboard || hasVideoPrompts)
          ? AppStep.FINAL_STORYBOARD
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
      const result = await analyzeProjectScriptsWithProgress(
        scriptFiles,
        undefined,  // model: 使用默认模型
        handleProgress,
        'standard'   // mode: 标准模式
      );
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
      const chars = await extractCharactersFromScript(script);
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
    downloadScriptText(shots, characterRefs);
  };

  // 🆕 清洗剧本
  const startScriptCleaning = async () => {
    // 🆕 使用 currentScript（可能是单集或完整剧本）
    const scriptToClean = currentScript || script;
    if (!scriptToClean.trim()) return alert("请输入脚本内容");
    setCleaningResult(null);
    setCleaningProgress('');
    setCurrentStep(AppStep.SCRIPT_CLEANING);
    setIsCleaning(true);

    try {
      const stream = cleanScriptStream(scriptToClean);
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

          // 2. 从原始文本中提取 JSON 内容（去掉 markdown 标记后找第一个 {）
          const jsonStart = jsonStr.indexOf('{');
          if (jsonStart !== -1) {
            jsonStr = jsonStr.substring(jsonStart);
          }

          // 3. 使用栈正确修复被截断的JSON
          // 注意：简单计数括号会被字符串内的括号（如 originalText 中的文字）误导
          // 必须逐字符解析，正确跟踪字符串状态，再用 LIFO 顺序关闭未闭合的括号
          {
            let inStr = false;
            let esc = false;
            const bracketStack: string[] = [];
            for (let i = 0; i < jsonStr.length; i++) {
              const c = jsonStr[i];
              if (esc) { esc = false; continue; }
              if (c === '\\' && inStr) { esc = true; continue; }
              if (c === '"') { inStr = !inStr; continue; }
              if (inStr) continue;
              if (c === '{') bracketStack.push('}');
              else if (c === '[') bracketStack.push(']');
              else if ((c === '}' || c === ']') && bracketStack.length > 0) bracketStack.pop();
            }
            if (bracketStack.length > 0 || inStr) {
              console.log('[剧本清洗] JSON被截断，启动修复 (未闭合层级:', bracketStack.length, ', 在字符串中:', inStr, ')');
              jsonStr = jsonStr.trimEnd();
              if (inStr) jsonStr += '"';           // 关闭未闭合的字符串
              jsonStr = jsonStr.replace(/,\s*$/, ''); // 移除末尾多余逗号
              while (bracketStack.length > 0) jsonStr += bracketStack.pop()!; // LIFO 关闭
            }
          }

          const parsed = JSON.parse(jsonStr);
          // 规范化所有 string[] 字段，防止不同模型返回对象/数组嵌套导致渲染崩溃
          setCleaningResult(normalizeCleaningResult({
            ...parsed,
            originalScript: scriptToClean
          }));
        } catch (parseError) {
          console.error('解析清洗结果失败:', parseError, '\n原始文本:', lastText.substring(0, 500));
          // 即使解析失败，也显示原始结果供用户查看
          setCleaningResult({
            cleanedScenes: [],
            constraints: [],
            sceneWeights: [],
            originalScript: scriptToClean,
            rawOutput: lastText,
            parseError: true,
            audioEffects: [],
            musicCues: [],
            timeCodes: [],
            cameraSuggestions: []
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

    // 根据模式选择生成方式
    if (generationMode === 'chain-of-thought') {
      await startChainOfThoughtGeneration();
      return;
    }

    // 传统模式
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

      const stream = generateShotListStream(script, defaultPrompt, undefined, characterRefs);
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

        // 台词/旁白时长校验：确保时长足够说完台词
        if (shot.dialogue && shot.dialogue.trim() && shot.dialogue !== '无' && shot.dialogue !== '—') {
          const chineseChars = shot.dialogue.replace(/[^\u4e00-\u9fa5]/g, '').length;
          if (chineseChars > 0) {
            const isNarration = /旁白|旁途|内心独白/.test(shot.dialogue);
            const charsPerSec = isNarration ? 2.5 : 3.0;
            const minNeeded = Math.ceil(chineseChars / charsPerSec);
            const shotDurationSec = parseInt(shot.duration || '0') || 0;
            if (shotDurationSec > 0 && shotDurationSec < minNeeded) {
              ruleBasedSuggestions.push({
                shotNumber: shot.shotNumber,
                suggestion: `台词共${chineseChars}字，按正常语速需至少 ${minNeeded}s，当前时长仅 ${shotDurationSec}s，建议调整为 ${minNeeded}s 以上，否则语速过快或台词说不完。`,
                reason: '台词时长不足',
                selected: true
              });
            }
          }
        }


      } // end for (const shot of shots)

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
      const llmRes = await reviewStoryboard(shots, '');

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

  // 提示词自检函数（在生成提示词后调用）
  // ⚠️ 只校验 imagePromptCn（生图提示词），
  //    不校验 startFrame / promptCn（分镜自然语言描述，合法包含"镜头""画面"等词汇）
  const validatePrompts = () => {
    setIsValidatingPrompts(true);
    setOptimizedChanges([]); // 重新自检时清空上次的优化对比记录
    const results: ReviewSuggestion[] = [];

    for (const shot of shots) {
      // 只有已提取生图提示词的镜头才进行校验
      if (!shot.imagePromptCn && !shot.imagePromptEn) continue;

      // 1. 违规词汇检测：仅对 imagePromptCn 执行
      if (shot.imagePromptCn) {
        const terms = detectForbiddenTerms(shot.imagePromptCn);
        for (const t of terms) {
          results.push({
            shotNumber: shot.shotNumber,
            suggestion: `[imagePromptCn] 包含违规词汇"${t.term}"，建议改为：${t.suggestion}`,
            reason: `规则校验：${t.reason}`,
            selected: true
          });
        }
      }

      // 2. 字数校验：仅对 imagePromptCn 执行
      if (shot.imagePromptCn) {
        const lengthResult = validateImagePrompt(shot.imagePromptCn);
        const issues = [...lengthResult.errors, ...lengthResult.warnings];
        if (issues.length > 0) {
          results.push({
            shotNumber: shot.shotNumber,
            suggestion: issues.join('；'),
            reason: '生图提示词字数校验',
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

  /**
   * 一键优化提示词：调用AI修复所有自检发现的问题
   * 使用直连 OpenRouter，避免 Cloudflare Worker 504 超时
   */
  const oneClickOptimizePrompts = async () => {
    if (promptValidationResults.length === 0) {
      alert('暂无问题，请先点击"自检提示词"');
      return;
    }

    setIsExtracting(true);
    setExtractProgress(`⚡ 一键优化中，正在修复 ${promptValidationResults.length} 个提示词问题...`);

    try {
      const stream = optimizeImagePromptsStream(shots, promptValidationResults);
      let fullText = '';
      for await (const text of stream) {
        fullText = text;
        setExtractProgress(`⚡ 优化中... (${Math.min(Math.round(fullText.length / 100), 99)}%)`);
      }

      // 解析JSON结果（兼容 ```json 包裹 / 截断修复）
      let optimized: Array<{ shotNumber: number; imagePromptCn: string }> = [];
      {
        // 去掉 markdown 代码块包裹
        let parseText = fullText.trim()
          .replace(/```json/gi, '').replace(/```/g, '').trim();

        // 找到第一个 [ 作为起点
        const arrStart = parseText.indexOf('[');
        if (arrStart === -1) throw new Error('AI 返回格式异常，请重试');
        parseText = parseText.slice(arrStart);

        // 第一次：直接解析（完整输出时走此路径）
        let parsed: any[] | null = null;
        try {
          const arrEnd = parseText.lastIndexOf(']');
          if (arrEnd !== -1) {
            parsed = JSON.parse(parseText.slice(0, arrEnd + 1));
          }
        } catch { /* 继续截断修复 */ }

        // 截断修复：找到最后一个完整 JSON 对象
        if (!parsed) {
          let depth = 0, inString = false, escapeNext = false, lastEnd = -1;
          for (let i = 0; i < parseText.length; i++) {
            const c = parseText[i];
            if (escapeNext) { escapeNext = false; continue; }
            if (c === '\\') { escapeNext = true; continue; }
            if (c === '"') { inString = !inString; continue; }
            if (!inString) {
              if (c === '{') depth++;
              else if (c === '}') {
                depth--;
                if (depth === 0 && /^\s*[,\]\s]/.test(parseText.slice(i + 1))) {
                  lastEnd = i;
                }
              }
            }
          }
          if (lastEnd > 0) {
            let repaired = parseText.slice(0, lastEnd + 1).trimEnd();
            if (repaired.endsWith(',')) repaired = repaired.slice(0, -1);
            repaired += ']';
            try { parsed = JSON.parse(repaired); } catch { /* 失败则 parsed 仍为 null */ }
          }
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('AI 返回格式异常，请重试');
        }
        optimized = parsed;
      }

      // 计算变更记录（前后对比）
      const changes: Array<{ shotNumber: number | string; oldPrompt: string; newPrompt: string }> = [];

      // 更新对应镜头的提示词
      const updatedShots = shots.map(shot => {
        const fix = optimized.find(o => String(o.shotNumber) === String(shot.shotNumber));
        if (fix && fix.imagePromptCn !== (shot.imagePromptCn || '')) {
          changes.push({
            shotNumber: shot.shotNumber,
            oldPrompt: shot.imagePromptCn || '',
            newPrompt: fix.imagePromptCn,
          });

          // ── 新增：提取并关联角色 ──
          const regex = /@([^(]+)(?:\(([^)]+)\))?/g;
          const assignedCharIds = new Set<string>(shot.assignedCharacterIds || []);
          let m;
          while ((m = regex.exec(fix.imagePromptCn)) !== null) {
            const roleName = m[1].trim();
            const char = characterRefs.find(c => c.name === roleName);
            if (char) {
              assignedCharIds.add(char.id);
            }
          }

          return {
            ...shot,
            imagePromptCn: fix.imagePromptCn,
            assignedCharacterIds: Array.from(assignedCharIds)
          };
        }
        return shot;
      });

      setShots(updatedShots);
      setOptimizedChanges(changes);     // 保存前后对比记录
      setPromptValidationResults([]);   // 清空问题列表
      setExtractProgress(`✅ 一键优化完成！已修复 ${changes.length} 个镜头的提示词`);
    } catch (error) {
      console.error('[一键优化提示词]', error);
      const msg = error instanceof Error ? error.message : '未知错误';
      setExtractProgress(`❌ 优化失败：${msg}`);
      alert(`一键优化失败：${msg}\n请重试`);
    } finally {
      setIsExtracting(false);
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
    setChatHistory([{ role: 'assistant', content: `我已经根据选中的 ${selectedSuggestionsList.length} 条建议优化了剧本。如果你有其他想法，可以随时告诉我。` }]);

    setStreamText('');
    setIsLoading(true);
    setProgressMsg(`正在应用 ${selectedSuggestionsList.length} 条建议...`);

    try {
      // 只传入选中的建议进行优化
      const stream = optimizeShotListStream(currentShots, selectedSuggestionsList);
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

  /**
   * 一键优化：逐镜处理，解决两个核心问题：
   * 1. 不改变镜头数量（只原地更新有建议的镜头，不让 AI 返回全量数组）
   * 2. 避免内容过多失败（每次只发 1 个镜头 + 该镜头的建议）
   */
  const oneClickOptimize = async () => {
    if (suggestions.length === 0) {
      alert('暂无建议，请先点击"专家自检"');
      return;
    }

    // 全选所有建议（更新UI状态）
    selectAllSuggestions();
    const allSuggestions = suggestions.map(s => ({ ...s, selected: true }));

    // 角度分布问题走专用自动修复逻辑
    const hasAngleDistributionIssue = allSuggestions.some(s =>
      s.reason?.includes('角度分布规则违反') || s.reason?.includes('角度分布建议')
    );
    if (hasAngleDistributionIssue) {
      const fixedShots = await autoFixAngleDistribution(shots);
      setShots(fixedShots);
      const angleReport = validateAngleDistribution(fixedShots);
      if (angleReport.overall.isValid) {
        alert('✅ 角度分布问题已自动修复！\n\n' + generateAngleDistributionReport(fixedShots));
      } else {
        alert('⚠️ 部分角度分布问题已修复，但仍有问题：\n\n' + angleReport.overall.errors.join('\n'));
      }
      setSuggestions(prev => prev.filter(s =>
        !s.reason?.includes('角度分布规则违反') && !s.reason?.includes('角度分布建议')
      ));
      return;
    }

    // 过滤掉 GLOBAL 建议（无对应具体镜头），按 shotNumber 分组
    const shotSuggestions = allSuggestions.filter(s => s.shotNumber !== 'GLOBAL');
    const suggestionsByShot = new Map<string, ReviewSuggestion[]>();
    for (const s of shotSuggestions) {
      const key = String(s.shotNumber);
      if (!suggestionsByShot.has(key)) suggestionsByShot.set(key, []);
      suggestionsByShot.get(key)!.push(s);
    }

    if (suggestionsByShot.size === 0) {
      alert('所有建议均为全局建议（GLOBAL），无法自动应用到具体镜头，请手动处理。');
      return;
    }

    // 工作数组：用 spread 拷贝，避免直接 mutate state
    const workingShots = [...shots];
    const shotNumberList = Array.from(suggestionsByShot.keys());
    let successCount = 0;
    let failCount = 0;

    setCurrentStep(AppStep.MANUAL_EDIT);
    setIsLoading(true);
    setChatHistory([{
      role: 'assistant',
      content: `一键优化：共 ${shotNumberList.length} 个镜头需要修改，逐镜处理中，总镜头数 ${workingShots.length} 保持不变...`
    }]);

    for (let i = 0; i < shotNumberList.length; i++) {
      const shotNumber = shotNumberList[i];
      const shotSuggestionList = suggestionsByShot.get(shotNumber)!;
      const shotIndex = workingShots.findIndex(s => String(s.shotNumber) === shotNumber);

      if (shotIndex === -1) {
        // 找不到对应镜头，跳过
        failCount++;
        continue;
      }

      setProgressMsg(`一键优化：正在处理镜头 ${shotNumber}（${i + 1}/${shotNumberList.length}）...`);

      try {
        let fullText = '';
        const stream = optimizeSingleShotStream(workingShots[shotIndex], shotSuggestionList);
        for await (const text of stream) {
          fullText = text;
        }

        // 提取 JSON 对象（{ ... }）
        let parseText = fullText.trim().replace(/```json/gi, '').replace(/```/g, '').trim();
        const objStart = parseText.indexOf('{');
        const objEnd = parseText.lastIndexOf('}');
        if (objStart > -1 && objEnd > -1) {
          parseText = parseText.substring(objStart, objEnd + 1);
        }

        const updatedShotData = JSON.parse(parseText);

        // 合并：保留原始 id / shotNumber / status，仅更新 AI 修改的字段
        workingShots[shotIndex] = {
          ...workingShots[shotIndex],
          ...updatedShotData,
          id: workingShots[shotIndex].id,
          shotNumber: workingShots[shotIndex].shotNumber,
          status: workingShots[shotIndex].status,
        };

        // 实时刷新 UI，让用户看到进度
        setShots([...workingShots]);
        successCount++;
      } catch (err) {
        console.error(`[一键优化] 镜头 ${shotNumber} 失败:`, err);
        failCount++;
      }
    }

    setIsLoading(false);
    setProgressMsg('');
    setSuggestions([]); // 清空建议列表

    const resultMsg = failCount > 0
      ? `✅ 一键优化完成！成功 ${successCount} 个，失败 ${failCount} 个（已跳过）。镜头总数保持 ${workingShots.length} 个不变。`
      : `✅ 一键优化完成！成功更新 ${successCount} 个镜头，镜头总数 ${workingShots.length} 个不变。`;
    setChatHistory(prev => [...prev, { role: 'assistant', content: resultMsg }]);
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
      const stream = chatWithDirectorStream(chatHistory, userMsg);
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
      const stream = chatEditShotListStream(currentShots, lastUserMsg);
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
  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
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
  const exportToJSON = () => utilsExportToJSON(shots);

  // 导出为CSV（Excel兼容）- 紧凑5列布局（不含提示词）
  const exportToExcel = () => utilsExportToExcel(shots);

  // 🆕 导出提示词 - 中文版 CSV
  const exportPromptsChineseCSVHandler = () => exportPromptsChineseCSV(shots);

  // 🆕 导出提示词 - 英文版 CSV
  const exportPromptsEnglishCSVHandler = () => exportPromptsEnglishCSV(shots);

  // 🆕 导出提示词专用 JSON（包含中英文）
  const exportPromptsToJSONHandler = () => exportPromptsToJSON(shots);

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
            )
          })}
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
              <th className="px-2 py-2 border-r border-[var(--color-border)] w-[20%]">故事</th>
              <th className="px-2 py-2 border-r border-[var(--color-border)] w-[35%]">视觉设计</th>
              <th className="px-2 py-2 w-[45%]">画面描述</th>
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
                    {/* 显示视频生成模式（仅 I2V） */}
                    {shot.videoMode && (
                      <span className="mt-1 inline-block px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-cyan-900/30 text-cyan-300 border border-cyan-600/50">
                        图生视频
                      </span>
                    )}
                    {/* 校验警告指示器（只检测生图提示词 imagePromptCn） */}
                    {(() => {
                      if (!shot.imagePromptCn) return null;
                      const hasForbidden = detectForbiddenTerms(shot.imagePromptCn).length > 0;
                      const lengthResult = validateImagePrompt(shot.imagePromptCn);
                      const hasLengthIssue = !lengthResult.valid || lengthResult.warnings.length > 0;
                      const hasIssues = hasForbidden || hasLengthIssue;
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
                          placeholder="故事节拍（人物+地点+事件+冲突）" value={typeof shot.storyBeat === 'string' ? shot.storyBeat : (shot.storyBeat ? JSON.stringify(shot.storyBeat) : '')} onChange={(e) => updateShotField(shot.id, 'storyBeat', e.target.value)} />
                        <textarea className="w-full h-8 p-1 bg-indigo-900/20 border border-indigo-700/50 rounded text-[10px] text-indigo-200 resize-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          placeholder="对白/音效" value={shot.dialogue || ''} onChange={(e) => updateShotField(shot.id, 'dialogue', e.target.value)} />
                        <textarea className="w-full h-8 p-1 bg-purple-900/20 border border-purple-700/50 rounded text-[10px] text-purple-200 resize-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                          placeholder="🎬 导演意图（为什么这么设计、观众应感受...）" value={shot.directorNote || ''} onChange={(e) => updateShotField(shot.id, 'directorNote', e.target.value)} />
                        <textarea className="w-full h-8 p-1 bg-amber-900/20 border border-amber-700/50 rounded text-[10px] text-amber-200 resize-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                          placeholder="🔧 技术备注（慢动作/手持/景深变化...）" value={shot.technicalNote || ''} onChange={(e) => updateShotField(shot.id, 'technicalNote', e.target.value)} />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="text-[var(--color-text-primary)] font-medium text-xs leading-relaxed">{typeof shot.storyBeat === 'string' ? shot.storyBeat : JSON.stringify(shot.storyBeat)}</div>
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




                </tr>
              );
            })}
            {isLoading && progressMsg.includes('修改') && (
              <tr className="bg-blue-900/20">
                <td colSpan={4} className="p-4 text-center text-blue-400 font-medium animate-pulse text-sm">
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

  // 如果未登录，显示登录页面（必须在所有 Hook 之后做条件渲染，符合 React Hooks 规则）
  if (!loggedIn) {
    return <Login onLoginSuccess={() => setLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen p-3 md:p-6 bg-[#0f111a] text-gray-200 font-inter relative overflow-x-hidden">
      <VersionUpdateToast />
      {/* 全局动态背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative z-10">
        <header className="max-w-7xl mx-auto mb-6 p-4 flex justify-between items-center bg-[#1a1b26]/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-lg transition-all hover:bg-[#1a1b26]/80">
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
            {/* 🆕 脚本分析过程中的快捷导航面包屑 */}
            {currentStep > AppStep.PROJECT_DASHBOARD && currentProject && (
              <div className="flex items-center gap-1.5 mr-4 bg-gray-800/50 p-1 rounded-lg border border-gray-700/50">
                <button
                  onClick={() => { setDashboardTab('overview'); setCurrentStep(AppStep.PROJECT_DASHBOARD); }}
                  className="px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors"
                >
                  ← 概览
                </button>
                <button
                  onClick={() => { setDashboardTab('characters'); setCurrentStep(AppStep.PROJECT_DASHBOARD); }}
                  className="px-2.5 py-1 text-xs text-blue-300 hover:bg-gray-700 rounded transition-colors flex items-center gap-1"
                >
                  🎭 角色
                </button>
                <button
                  onClick={() => { setDashboardTab('scenes'); setCurrentStep(AppStep.PROJECT_DASHBOARD); }}
                  className="px-2.5 py-1 text-xs text-emerald-300 hover:bg-gray-700 rounded transition-colors flex items-center gap-1"
                >
                  🏛️ 场景
                </button>
              </div>
            )}
            
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
                className={`px-3 py-1.5 border rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${isReanalyzing
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
            initialTab={dashboardTab}
            pendingGenerations={pendingGenerations}
            clearPendingGenerations={() => setPendingGenerations({ characters: [], scenes: [] })}
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
                          Gemini 2.5 Flash
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
                  <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-300"
                      style={{ width: `${(reanalyzeProgress.currentBatch / reanalyzeProgress.totalBatches) * 100}%` }}
                    />
                  </div>
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
                </div>
              )}
            </div>
          </div>
        )}

        {/* 原有流程 - 只在非项目管理页面显示 */}
        {currentStep !== AppStep.PROJECT_LIST && currentStep !== AppStep.PROJECT_WIZARD && currentStep !== AppStep.PROJECT_DASHBOARD && currentStep !== AppStep.REANALYZE_PROJECT && (
          <>
            <StepTracker 
              currentStep={currentStep} 
              branch={(currentStep === AppStep.EXTRACT_VIDEO_PROMPTS || currentStep === AppStep.GENERATE_VIDEO || (currentStep === AppStep.FINAL_STORYBOARD && !shots.some(s => s.storyboardGridUrl) && shots.some(s => s.videoPromptCn))) ? 'video' : 'image'} 
            />

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
                <ScriptInputPage
                  script={script}
                  currentScript={currentScript}
                  setScript={setScript}
                  handleScriptUpload={handleScriptUpload}
                  startScriptCleaning={startScriptCleaning}
                  // 🆕 剧集拆分相关
                  episodes={episodes}
                  currentEpisodeIndex={currentEpisodeIndex}
                  selectEpisode={selectEpisode}
                  cancelEpisodeSplit={cancelEpisodeSplit}
                  characterRefs={characterRefs}
                  setCharacterRefs={setCharacterRefs}
                  newCharName={newCharName}
                  setNewCharName={setNewCharName}
                  newCharAppearance={newCharAppearance}
                  setNewCharAppearance={setNewCharAppearance}
                  newCharGender={newCharGender}
                  setNewCharGender={setNewCharGender}
                  editingCharId={editingCharId}
                  setEditingCharId={setEditingCharId}
                  isExtractingChars={isExtractingChars}
                  handleCharUpload={handleCharUpload}
                  removeChar={removeChar}
                  extractCharactersFromScriptHandler={extractCharactersFromScriptHandler}
                />
              )}

              {/* 🆕 剧本清洗页面 */}
              {currentStep === AppStep.SCRIPT_CLEANING && (
                <ScriptCleaningPage
                  isCleaning={isCleaning}
                  cleaningProgress={cleaningProgress}
                  cleaningResult={cleaningResult}
                  generationMode={generationMode}
                  setGenerationMode={setGenerationMode}
                  characterRefs={characterRefs}
                  startShotListGeneration={startShotListGeneration}
                />
              )}

              {/* 🆕 统一的分镜编辑页面（Tab布局） */}
              {(currentStep === AppStep.GENERATE_LIST || currentStep === AppStep.REVIEW_OPTIMIZE || currentStep === AppStep.MANUAL_EDIT) && (
                <ShotGenerationPage
                  currentTab={currentTab}
                  handleTabChange={handleTabChange}
                  shots={shots}
                  isLoading={isLoading}
                  progressMsg={progressMsg}
                  generationMode={generationMode}
                  cotCurrentStage={cotCurrentStage}
                  cotStage1={cotStage1}
                  cotStage2={cotStage2}
                  cotStage3={cotStage3}
                  cotStage4={cotStage4}
                  cotStage5={cotStage5}
                  cotRawOutput={cotRawOutput}
                  suggestions={suggestions}
                  selectedSuggestion={selectedSuggestion}
                  setSelectedSuggestion={setSelectedSuggestion}
                  startReview={startReview}
                  applyOptimizations={applyOptimizations}
                  oneClickOptimize={oneClickOptimize}
                  getSelectedSuggestionsCount={getSelectedSuggestionsCount}
                  selectAllSuggestions={selectAllSuggestions}
                  deselectAllSuggestions={deselectAllSuggestions}
                  toggleSuggestionSelection={toggleSuggestionSelection}
                  chatHistory={chatHistory}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  chatScrollRef={chatScrollRef}
                  handleConsultDirector={handleConsultDirector}
                  handleExecuteChanges={handleExecuteChanges}
                  reviewModel={reviewModel}
                  setReviewModel={setReviewModel}
                  editModel={editModel}
                  setEditModel={setEditModel}
                  exportToJSON={exportToJSON}
                  exportToExcel={exportToExcel}
                  downloadScript={downloadScript}
                  setCurrentStep={setCurrentStep}
                  renderShotTable={renderShotTable}
                  episodeSummary={episodeSummary}
                  project={currentProject!}
                  onMissingAssetsConfirm={(missingChars, missingScenes) => {
                    setPendingGenerations({ characters: missingChars, scenes: missingScenes });
                    setDashboardTab(missingChars.length > 0 ? 'characters' : 'scenes');
                    setCurrentStep(AppStep.PROJECT_DASHBOARD);
                  }}
                />
              )}

              {/* 🆕 提取AI提示词页面 */}
              {currentStep === AppStep.EXTRACT_PROMPTS && (
                <PromptExtractionPage
                  shots={shots}
                  setShots={setShots}
                  isExtracting={isExtracting}
                  setIsExtracting={setIsExtracting}
                  extractProgress={extractProgress}
                  setExtractProgress={setExtractProgress}
                  isValidatingPrompts={isValidatingPrompts}
                  promptValidationResults={promptValidationResults}
                  setPromptValidationResults={setPromptValidationResults}
                  extractImagePromptsStream={extractImagePromptsStream}
                  validatePrompts={validatePrompts}
                  oneClickOptimizePrompts={oneClickOptimizePrompts}
                  optimizedChanges={optimizedChanges}
                  setOptimizedChanges={setOptimizedChanges}
                  setCurrentStep={setCurrentStep}
                  currentProject={currentProject}
                  currentEpisodeNumber={currentEpisodeNumber}
                  script={script}
                  saveEpisode={saveEpisode}
                  characterRefs={characterRefs}
                />
              )}

              {/* 🆕 分支2: 直接生成视频提示词 (Seedance 2.0) */}
              {currentStep === AppStep.EXTRACT_VIDEO_PROMPTS && (
                <VideoPromptExtractionPage
                  shots={shots}
                  setShots={setShots}
                  characterRefs={characterRefs}
                  isExtracting={isExtracting}
                  setIsExtracting={setIsExtracting}
                  extractProgress={extractProgress}
                  setExtractProgress={setExtractProgress}
                  extractVideoPromptsStream={extractVideoPromptsStream}
                  setCurrentStep={setCurrentStep}
                  currentProject={currentProject}
                  setCurrentProject={setCurrentProject}
                  currentEpisodeNumber={currentEpisodeNumber}
                  script={script}
                  saveEpisode={saveEpisode}
                />
              )}

              {/* 🆕 分支2: 视频批量生成 (已迁移到 FinalStoryboard 内聚展示，此处不再渲染独立页面) */}
              {currentStep === AppStep.GENERATE_IMAGES && (
                <ImageGenerationPage
                  shots={shots}
                  characterRefs={characterRefs}
                  hqUrls={hqUrls}
                  setHqUrls={setHqUrls}
                  selectedStyle={selectedStyle}
                  setSelectedStyle={setSelectedStyle}
                  showStyleCards={showStyleCards}
                  setShowStyleCards={setShowStyleCards}
                  customStylePrompt={customStylePrompt}
                  setCustomStylePrompt={setCustomStylePrompt}
                  imageModel={imageModel}
                  setImageModel={setImageModel}
                  availableImageModels={availableImageModels}
                  isLoadingModels={isLoadingModels}
                  uploadGridIndex={uploadGridIndex}
                  setUploadGridIndex={setUploadGridIndex}
                  uploadDialogOpen={uploadDialogOpen}
                  setUploadDialogOpen={setUploadDialogOpen}
                  uploadUrl={uploadUrl}
                  setUploadUrl={setUploadUrl}
                  uploadFile={uploadFile}
                  setUploadFile={setUploadFile}
                  isLoading={isLoading}
                  progressMsg={progressMsg}
                  generateHQ={generateHQ}
                  handleRegenerateGrid={regenerateSingleGrid}
                  handleUploadGrid={handleUploadGrid}
                  handleRefreshGrid={handleRefreshGrid}
                  applyGridsToShots={applyGridsToShots}
                  abortController={abortController}
                  setAbortController={setAbortController}
                  setCurrentStep={setCurrentStep}
                  currentProject={currentProject}
                  currentEpisodeNumber={currentEpisodeNumber}
                />
              )}

              {/* 🆕 最终故事板预览 */}
              {currentStep === AppStep.FINAL_STORYBOARD && (
                <FinalStoryboard
                  shots={shots}
                  setShots={setShots}
                  characterRefs={characterRefs}
                  scenes={currentProject?.scenes || []}
                  setCurrentStep={setCurrentStep}
                  currentProject={currentProject}
                  episodeNumber={currentEpisodeNumber}
                  projectName={currentProject?.name}
                  episodeTitle={currentProject?.episodes?.find((ep: any) => ep.episodeNumber === currentEpisodeNumber)?.title}
                  script={script}
                  saveEpisode={saveEpisode}
                  onBack={() => {
                    // 如果有视频提示词且没有九宫格图片，返回视频提取页
                    if (!shots.some(s => s.storyboardGridUrl) && shots.some(s => s.videoPromptCn)) {
                      setCurrentStep(AppStep.EXTRACT_VIDEO_PROMPTS);
                    } else {
                      setCurrentStep(AppStep.GENERATE_IMAGES);
                    }
                  }}
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
            <UploadGridModal
              uploadDialogOpen={uploadDialogOpen}
              setUploadDialogOpen={setUploadDialogOpen}
              uploadGridIndex={uploadGridIndex}
              setUploadGridIndex={setUploadGridIndex}
              uploadUrl={uploadUrl}
              setUploadUrl={setUploadUrl}
              uploadFile={uploadFile}
              setUploadFile={setUploadFile}
              handleUploadGrid={handleUploadGrid}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default App;
