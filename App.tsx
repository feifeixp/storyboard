
import React, { useState, useRef, useEffect } from 'react';
import { AppStep, Shot, ReviewSuggestion, CharacterRef, STORYBOARD_STYLES, StoryboardStyle, createCustomStyle, ScriptCleaningResult, EditTab, AngleDirection, AngleHeight, EpisodeSplit } from './types';
import { StepTracker } from './components/StepTracker';
import Login from './components/Login';
import { isLoggedIn, logout, getUserInfo, getUserPoints, type PointsInfo } from './services/auth';
// 🆕 导入自定义 Hooks
import {
  useScriptManagement,
  useCharacterManagement,
  useShotGeneration,
  useImageGeneration,
  useProjectManagement,
  detectAndSplitEpisodes,  // 🆕 剧集拆分函数
} from './src/hooks';

// 🆕 导入页面组件
import {
  ScriptInputPage,
  ScriptCleaningPage,
  ShotGenerationPage,
  PromptExtractionPage,
  ImageGenerationPage,
} from './src/pages';
// 使用 OpenRouter 统一 API（支持多模型切换）
import {
  generateShotListStream,
  reviewStoryboardOpenRouter as reviewStoryboard,
  optimizeShotListStream,
  chatEditShotListStream,
  chatWithDirectorStream,
  generateMergedStoryboardSheet,
  extractImagePromptsStream,
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
import { Project, Episode, ScriptFile, ProjectAnalysisResult } from './types/project';
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
  deleteProject,
  getCurrentProjectId,
  setCurrentProjectId,
  getProject,
  getEpisode,  // 🔧 获取单个剧集完整数据
} from './services/d1Storage';
import { getGenerationResult, pollGenerationResult, TaskStatus } from './services/aiImageGeneration';
import { analyzeProjectScriptsWithProgress, analyzeProjectScripts } from './services/projectAnalysis';
import { BatchAnalysisProgress } from './types/project';
// 🆕 本集概述生成
import { generateEpisodeSummary } from './services/episodeSummaryGenerator';
import { EpisodeSummaryPanel } from './components/EpisodeSummaryPanel';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 清洗结果规范化工具（与模型无关，统一在数据层处理不稳定输出）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将任意值规范化为字符串
 * 适用于 LLM 返回格式不稳定（对象、数组混入）的 string[] 字段
 */
function _normalizeToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(_normalizeToString).filter(Boolean).join(' / ');
  }
  if (typeof value === 'object') {
    try {
      const vals = Object.values(value as object).filter(v => v != null && v !== '');
      return vals.length > 0 ? (vals as string[]).join(' / ') : JSON.stringify(value);
    } catch {
      return JSON.stringify(value);
    }
  }
  return String(value);
}

/** 将任意值规范化为 string[]，过滤空值 */
function _normalizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return typeof arr === 'string' ? [arr] : [];
  return arr.map(_normalizeToString).filter(Boolean);
}

/**
 * 规范化清洗结果：确保所有 string[] 字段中的每个元素都是字符串
 * 防止不同模型返回对象/嵌套结构导致 React 渲染崩溃
 */
function normalizeCleaningResult(result: ScriptCleaningResult): ScriptCleaningResult {
  return {
    ...result,
    cleanedScenes: (result.cleanedScenes || []).map(scene => ({
      ...scene,
      dialogues: _normalizeStringArray(scene.dialogues),
      uiElements: _normalizeStringArray(scene.uiElements),
      moodTags: _normalizeStringArray(scene.moodTags),
    })),
    audioEffects: _normalizeStringArray(result.audioEffects),
    musicCues: _normalizeStringArray(result.musicCues),
    timeCodes: _normalizeStringArray(result.timeCodes),
    cameraSuggestions: _normalizeStringArray(result.cameraSuggestions),
  };
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

  // 🆕 获取用户积分信息（登录时初始化）
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

  // ═══════════════════════════════════════════════════════════════
  // 🆕 项目管理状态
  // ═══════════════════════════════════════════════════════════════
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number | null>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENT_EPISODE_NUMBER, null)  // 🔧 从 localStorage 恢复
  );

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

  // 🆕 监听图片生成完成事件，自动刷新左上角积分余额
  // 🆕 监听批量生成完成事件，刷新项目数据以确保图片显示正确
  useEffect(() => {
    if (!loggedIn) return;

    const handleImageGenerated = async () => {
      try {
        const points = await getUserPoints();
        setUserPoints(points);
      } catch (error) {
        console.error('[App] 刷新积分信息失败:', error);
      }
    };

    const handleBatchGenerationComplete = async (event: CustomEvent) => {
      const { type } = event.detail || {};
      if (type !== 'character') return;

      try {
        // 重新获取当前项目的数据
        if (currentProject) {
          const updatedProject = await getProject(currentProject.id);
          if (updatedProject) {
            setCurrentProject(updatedProject);
            // 同步角色库
            if (updatedProject.characters) {
              setCharacterRefs(updatedProject.characters);
            }
            console.log('[App] 批量生成完成，已刷新项目数据');
          }
        }
      } catch (error) {
        console.error('[App] 刷新项目数据失败:', error);
      }
    };

    window.addEventListener('neodomain:image-generated', handleImageGenerated);
    window.addEventListener('neodomain:batch-generation-complete', handleBatchGenerationComplete);
    return () => {
      window.removeEventListener('neodomain:image-generated', handleImageGenerated);
      window.removeEventListener('neodomain:batch-generation-complete', handleBatchGenerationComplete);
    };
  }, [loggedIn, currentProject]);

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
  const [hqUrls, setHqUrls] = useState<string[]>([]);

  // 🆕 九宫格上传对话框状态
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadGridIndex, setUploadGridIndex] = useState<number | null>(null);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

	// ✅ 生图模型：强制锁定 nanobanana-pro（服务层在会员限制时自动降级）
	// 说明：UI 不再允许切换；服务层也会忽略传入模型并锁定到 nanobanana-pro。
	const imageModel = 'nanobanana-pro';

  // 🆕 分镜草图风格选择
  const [selectedStyle, setSelectedStyle] = useState<StoryboardStyle>(STORYBOARD_STYLES[0]);
  const [customStylePrompt, setCustomStylePrompt] = useState('');
  const [showStyleCards, setShowStyleCards] = useState(false);

  // 🆕 提示词提取状态
  const [extractProgress, setExtractProgress] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  // 🆕 提示词自检状态
  const [promptValidationResults, setPromptValidationResults] = useState<ReviewSuggestion[]>([]);
  const [isValidatingPrompts, setIsValidatingPrompts] = useState(false);

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

  // 🆕 思维链模式状态
  const [generationMode, setGenerationMode] = useState<'traditional' | 'chain-of-thought'>('chain-of-thought');
  const [cotCurrentStage, setCotCurrentStage] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [cotStage1, setCotStage1] = useState<ScriptAnalysis | null>(null);
  const [cotStage2, setCotStage2] = useState<VisualStrategy | null>(null);
  const [cotStage3, setCotStage3] = useState<ShotPlanning | null>(null);
  const [cotStage4, setCotStage4] = useState<ShotDesign[] | null>(null);
  const [cotStage5, setCotStage5] = useState<QualityCheck | null>(null);
  const [cotRawOutput, setCotRawOutput] = useState<string>('');

  // 🆕 本集概述状态（从思维链结果生成）
  const [episodeSummary, setEpisodeSummary] = useState<import('./types/project').GeneratedEpisodeSummary | null>(null);

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
      setCurrentProject(fullProject);
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
      setCurrentProjectId(project.id);
      // 加载项目角色（安全检查）
      if (project.characters && project.characters.length > 0) {
        setCharacterRefs(project.characters);
      }
      // 🆕 进入项目主界面
      setCurrentStep(AppStep.PROJECT_DASHBOARD);
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
      const result = await analyzeProjectScriptsWithProgress(scriptFiles, undefined, handleProgress);
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

          // 2. 尝试找到JSON对象的起止位置
          const jsonStart = jsonStr.indexOf('{');
          const jsonEnd = jsonStr.lastIndexOf('}');

          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
          }

          // 3. 尝试修复被截断的JSON（常见问题）
          // 统计括号平衡
          const openBraces = (jsonStr.match(/{/g) || []).length;
          const closeBraces = (jsonStr.match(/}/g) || []).length;
          const openBrackets = (jsonStr.match(/\[/g) || []).length;
          const closeBrackets = (jsonStr.match(/\]/g) || []).length;

          // 如果括号不平衡，尝试补全
          if (openBraces > closeBraces || openBrackets > closeBrackets) {
            console.log('[剧本清洗] JSON可能被截断，尝试修复...');
            console.log(`[剧本清洗] 括号平衡: {${openBraces} vs ${closeBraces}} [${openBrackets} vs ${closeBrackets}]`);

            // 补全缺少的右括号
            const missingBraces = openBraces - closeBraces;
            const missingBrackets = openBrackets - closeBrackets;

            for (let i = 0; i < missingBraces; i++) {
              jsonStr += '}';
            }
            for (let i = 0; i < missingBrackets; i++) {
              jsonStr += ']';
            }
          }

          // 4. 尝试在截断的字段后补全空数组
          // 查找可能的截断点，如 "uiElements": 或 "moodTags":
          const truncatedPatterns = [
            /"uiElements":\s*$/,
            /"moodTags":\s*$/,
            /"dialogues":\s*$/,
            /"audioEffects":\s*$/,
            /"musicCues":\s*$/,
          ];

          for (const pattern of truncatedPatterns) {
            if (pattern.test(jsonStr)) {
              console.log('[剧本清洗] 检测到截断的字段，补全空数组');
              jsonStr = jsonStr.replace(pattern, '$&[]');
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

  // 🆕 思维链5阶段生成
  const startChainOfThoughtGeneration = async () => {
    setShots([]);
    setStreamText('');
    setSuggestions([]);
    setCotRawOutput('');
    setCotCurrentStage(null);
    setCotStage1(null);
    setCotStage2(null);
    setCotStage3(null);
    setCotStage4(null);
    setCotStage5(null);
    setCurrentStep(AppStep.GENERATE_LIST);
    setIsLoading(true);

    try {
      // ========== 阶段1：剧本分析 ==========
      setCotCurrentStage(1);
      setProgressMsg("【阶段1/5】剧本分析中...");
      let stage1Text = '';
      let stage1Result: any = null;

      // 🆕 添加重试机制
      const maxRetries = 3;
      let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          stage1Text = '';
          const stage1Gen = generateStage1Analysis(script);
          for await (const chunk of stage1Gen) {
            stage1Text += chunk;
            setCotRawOutput(stage1Text);
            setStreamText(`【阶段1】剧本分析\n\n${stage1Text}`);
          }

          // 尝试解析结果
          stage1Result = parseStage1Output(stage1Text);
          setCotStage1(stage1Result);
          setStreamText(prev => prev + '\n\n✅ 阶段1完成！');
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

      // ========== 阶段2：视觉策略 ==========
      setCotCurrentStage(2);
      setProgressMsg("【阶段2/5】视觉策略规划中...");
      let stage2Text = '';
      let stage2Result: any = null;

      retryCount = 0;
      while (retryCount < maxRetries) {
        try {
          stage2Text = '';
          const stage2Gen = generateStage2Analysis(stage1Result);
          for await (const chunk of stage2Gen) {
            stage2Text += chunk;
            setCotRawOutput(stage2Text);
            setStreamText(`【阶段2】视觉策略\n\n${stage2Text}`);
          }

          stage2Result = parseStage2Output(stage2Text);
          setCotStage2(stage2Result);
          setStreamText(prev => prev + '\n\n✅ 阶段2完成！');
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

      // ========== 阶段3：镜头分配 ==========
      setCotCurrentStage(3);
      setProgressMsg("【阶段3/5】镜头分配中...");
      let stage3Text = '';
      let stage3Result: any = null;

      retryCount = 0;
      while (retryCount < maxRetries) {
        try {
          stage3Text = '';
          const stage3Gen = generateStage3Analysis(script, stage1Result, stage2Result);
          for await (const chunk of stage3Gen) {
            stage3Text += chunk;
            setCotRawOutput(stage3Text);
            setStreamText(`【阶段3】镜头分配\n\n${stage3Text}`);
          }

          stage3Result = parseStage3Output(stage3Text);
          setCotStage3(stage3Result);
          setStreamText(prev => prev + '\n\n✅ 阶段3完成！');
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

      // ========== 阶段4：逐镜设计 ==========
      setCotCurrentStage(4);
      const shotList = stage3Result.shotList || [];
      const allDesignedShots: ShotDesign[] = [];

      // 🆕 辅助函数：将设计结果转换为Shot格式（用于实时显示）
      const convertDesignToShot = (rawDesign: any, idx: number): Shot => {
        const design = rawDesign.design || rawDesign;
        const comp = design.composition || {};
        const lightingData = design.lighting || {};
        const camera = design.camera || {};
        const characters = design.characters || {};
        const aiPrompt = rawDesign.aiPrompt || {};
        const storyBeatData = rawDesign.storyBeat || {};

        // 🆕 改进：从多个可能的字段路径提取角度信息
        const shotSize = comp.shotSize || design.shotSize || rawDesign.shotSize || 'MS';
        const cameraAngle = comp.cameraAngle || design.cameraAngle || rawDesign.cameraAngle || '轻微仰拍(Mild Low)';
        const cameraDirection = comp.cameraDirection || design.cameraDirection || rawDesign.cameraDirection || '3/4正面(3/4 Front)';

        // 🆕 调试日志：记录 LLM 返回的数据结构
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

        // 🆕 解析videoMode - 如果LLM返回了，直接使用；否则根据规则自动判定
        // 🆕 使用 determineVideoMode 函数进行代码级校验
        let videoMode: 'I2V' | 'Keyframe' | undefined;
        const llmVideoMode = rawDesign.videoMode?.toLowerCase();

        if (llmVideoMode === 'keyframe') {
          videoMode = 'Keyframe';
        } else if (llmVideoMode === 'i2v' || llmVideoMode === 'static') {
          videoMode = 'I2V'; // Static 已废弃，归入 I2V
        } else if (isMoving) {
          // LLM 未指定时，使用 determineVideoMode 进行自动判断
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
          videoMode = 'I2V'; // 静态镜头默认使用 I2V
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
          // 🆕 场景ID（用于关联空间布局）
          sceneId: rawDesign.sceneId || shotList[idx]?.sceneId || '',
          // 🆕 视频生成模式
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
          // 🆕 改进：从多个可能的字段路径提取首帧/尾帧描述
          startFrame: camera.startFrame || rawDesign.startFrame || '',
          endFrame: camera.endFrame || rawDesign.endFrame || '',
          // 🆕 视频提示词（从aiPrompt.videoPrompt/videoPromptCn获取）
          videoPromptCn: aiPrompt.videoPromptCn || '',
          videoPrompt: aiPrompt.videoPrompt || '',
          // 🆕 导演意图与技术备注
          directorNote: rawDesign.directorNote || '',
          technicalNote: rawDesign.technicalNote || '',
          // 思维链阶段不自动写入提示词，由后续专门的提示词生成能力或用户手动填充
          promptCn: '',
          promptEn: '',
          endFramePromptCn: '',
          endFramePromptEn: '',
          // 理论依据
          theory: rawDesign.theory || '',
          status: 'pending'
        };
      };

      // Helper: limit full front-view shots to at most 2 across the whole sequence
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

      // 🆕 Helper: enforce angle diversity, limit static shots, ensure dutch angle usage
      const applyAngleDiversityLimit = (inputShots: Shot[]): Shot[] => {
        const totalShots = inputShots.length;
        const maxThreeQuarterFront = Math.max(3, Math.floor(totalShots * 0.25)); // 最多25%
        const maxStaticShots = 2; // 一集最多1-2个完全固定镜头
        let threeQuarterCount = 0;
        let staticCount = 0;

        // 用于替换过多3/4正面的备选角度
        const alternativeDirections: Shot['angleDirection'][] = [
          '正侧面(Full Side)',
          '1/3侧面(1/3 Side)',
          '3/4背面(3/4 Back)',
          '1/3背面(1/3 Back)'
        ];
        // 用于替换固定镜头的运镜（使用正确的CameraMove类型）
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

          // 1. 限制3/4正面占比
          if (modifiedShot.angleDirection === '3/4正面(3/4 Front)') {
            threeQuarterCount += 1;
            if (threeQuarterCount > maxThreeQuarterFront) {
              const newDirection = alternativeDirections[altDirIdx % alternativeDirections.length];
              altDirIdx += 1;
              console.log(`[角度多样化] 镜头#${modifiedShot.shotNumber}: 3/4正面(${threeQuarterCount}个) → ${newDirection}`);
              modifiedShot = { ...modifiedShot, angleDirection: newDirection };
            }
          }

          // 2. 限制固定镜头数量（固定镜头改为轻微运动）
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
	            const stage4Gen = generateStage4Analysis(script, stage1Result, stage2Result, stage3Result, batch);
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
      setStreamText(prev => prev + `\n\n✅ 阶段4完成！共设计 ${allDesignedShots.length} 个镜头`);

      // ========== 阶段5：质量自检 ==========
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
      for await (const chunk of generateStage5Review(stage1Result, stage2Result, shotDesignResults)) {
        stage5Text += chunk;
        setCotRawOutput(stage5Text);
        setStreamText(`【阶段5】质量自检与优化\n\n${stage5Text}`);
      }

      console.log('[DEBUG] 阶段5流式数据接收完成');

      const stage5Result = parseStage5Output(stage5Text);
      setCotStage5(stage5Result);

      console.log('[解析成功] 阶段5质量检查结果:', stage5Result);
      setStreamText(prev => prev + `\n\n✅ 阶段5完成！质量评分: ${stage5Result.overallScore}/100 (${stage5Result.rating})`);

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

    } catch (error) {
      console.error('思维链生成失败:', error);
      setStreamText(prev => prev + `\n\n❌ 错误: ${error}`);
      alert(`思维链生成失败: ${error}`);
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

      // 解析JSON结果
      const jsonMatch = fullText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('AI 返回格式异常，请重试');
      }
      const optimized: Array<{ shotNumber: number; imagePromptCn: string }> = JSON.parse(jsonMatch[0]);

      // 更新对应镜头的提示词
      const updatedShots = shots.map(shot => {
        const fix = optimized.find(o => Number(o.shotNumber) === Number(shot.shotNumber));
        if (fix) {
          return { ...shot, imagePromptCn: fix.imagePromptCn };
        }
        return shot;
      });

      setShots(updatedShots);
      setPromptValidationResults([]); // 清空问题列表
      setExtractProgress(`✅ 一键优化完成！已修复 ${optimized.length} 个镜头的提示词`);
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
    setChatHistory([{role: 'assistant', content: `我已经根据选中的 ${selectedSuggestionsList.length} 条建议优化了剧本。如果你有其他想法，可以随时告诉我。`}]);

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
   * 一键优化：全选所有建议 → 立即应用
   * 直接使用当前 suggestions（不依赖 setState 异步更新）
   */
  const oneClickOptimize = async () => {
    if (suggestions.length === 0) {
      alert('暂无建议，请先点击"专家自检"');
      return;
    }
    // 全选所有建议（更新UI状态）
    selectAllSuggestions();
    // 直接用全量 suggestions 执行优化，不等待 setState 生效
    const allSuggestions = suggestions.map(s => ({ ...s, selected: true }));

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

    const currentShots = [...shots];
    setCurrentStep(AppStep.MANUAL_EDIT);
    setChatHistory([{role: 'assistant', content: `一键优化：正在应用全部 ${allSuggestions.length} 条建议，请稍候...`}]);
    setStreamText('');
    setIsLoading(true);
    setProgressMsg(`一键优化：正在应用全部 ${allSuggestions.length} 条建议...`);
    try {
      const stream = optimizeShotListStream(currentShots, allSuggestions);
      for await (const text of stream) {
        setStreamText(text);
      }
    } catch (error) {
      console.error(error);
      alert("一键优化失败，请重试");
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

  // 🆕 九宫格生成控制器（用于停止生成）
  const [abortController, setAbortController] = React.useState<AbortController | null>(null);

  // 🆕 九宫格生成时间跟踪
  const [gridGenerationStartTime, setGridGenerationStartTime] = React.useState<number | null>(null);
  const [currentGeneratingGrid, setCurrentGeneratingGrid] = React.useState<number | null>(null);

  const generateHQ = async () => {
    setIsLoading(true);
    setHqUrls([]);
    const totalGrids = Math.ceil(shots.length / 9);
    setProgressMsg(`正在使用「${selectedStyle.name}」风格绘制 ${totalGrids} 张九宫格...`);

    // 🆕 创建 AbortController
    const controller = new AbortController();
    setAbortController(controller);

    // 🆕 重置生成时间跟踪
    setGridGenerationStartTime(Date.now());
    setCurrentGeneratingGrid(0);

    try {
      // 🔧 验证项目和剧集信息
      if (!currentProject) {
        alert('⚠️ 未选择项目，无法生成九宫格');
        setIsLoading(false);
        return;
      }

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
        selectedStyle,
        // 进度回调
        (current, total, info) => {
          setProgressMsg(`正在生成 ${info} (${current}/${total}) - ${selectedStyle.name}`);
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

	  // 导出为CSV（Excel兼容）- 紧凑5列布局（不含提示词）
	  const exportToExcel = () => {
	    // CSV头部
	    const headers = ['#', '故事', '视觉设计', '首帧', '尾帧'];

    // 转义CSV字段
    const escapeCSV = (str: string | undefined) => {
      if (!str) return '';
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

	    // 数据行
	    const rows = shots.map(shot => {
	      const isMotion = shot.shotType === '运动';

      // 列1: # 编号·时长·类型（紧凑）
      const col1 = `#${shot.shotNumber}·${shot.duration || '—'}·${shot.shotType || '静态'}`;

      // 列2: 故事（节拍 + 对白/导演/备注，有内容才追加）
      const col2Parts = [shot.storyBeat || ''];
      if (shot.dialogue) col2Parts.push(`对白: ${shot.dialogue}`);
      if (shot.directorNote) col2Parts.push(`导演: ${shot.directorNote}`);
      if (shot.technicalNote) col2Parts.push(`备注: ${shot.technicalNote}`);
      const col2 = col2Parts.filter(Boolean).join('\n');

      // 列3: 视觉设计（紧凑，构图合并为一行）
      const angleStr = [shot.angleDirection, shot.angleHeight, shot.dutchAngle].filter(Boolean).join('/');
      const compositionStr = [
        shot.foreground ? `FG:${shot.foreground}` : '',
        shot.midground ? `MG:${shot.midground}` : '',
        shot.background ? `BG:${shot.background}` : '',
      ].filter(Boolean).join(' · ');
      const col3Parts = [
        `景:${shot.shotSize || '—'}`,
        `角:${angleStr || '—'}`,
        compositionStr || '',
        `光:${shot.lighting || '—'}`,
        `运:${shot.cameraMove || '—'}${shot.cameraMoveDetail ? `·${shot.cameraMoveDetail}` : ''}`,
        isMotion && shot.motionPath ? `动线:${shot.motionPath}` : '',
      ];
      const col3 = col3Parts.filter(Boolean).join(' | ');

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

  // 如果未登录，显示登录页面（必须在所有 Hook 之后做条件渲染，符合 React Hooks 规则）
  if (!loggedIn) {
    return <Login onLoginSuccess={() => setLoggedIn(true)} />;
  }

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
            exportToJSON={exportToJSON}
            exportToExcel={exportToExcel}
            downloadScript={downloadScript}
            setCurrentStep={setCurrentStep}
            renderShotTable={renderShotTable}
            episodeSummary={episodeSummary}
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
            setCurrentStep={setCurrentStep}
            currentProject={currentProject}
            currentEpisodeNumber={currentEpisodeNumber}
            script={script}
            saveEpisode={saveEpisode}
          />
        )}

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
      </>
      )}
    </div>
  );
};

export default App;
