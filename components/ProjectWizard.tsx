/**
 * 新建项目向导组件
 * 多步骤引导用户创建项目：基础信息 → 上传剧本 → AI分析 → 确认
 */

import React, { useState, useRef } from 'react';
import {
  Project,
  ProjectWizardStep,
  ScriptFile,
  ProjectAnalysisResult,
  BatchAnalysisProgress,
  ProjectMediaType,
  PROJECT_MEDIA_TYPES,
  createEmptyProject,
  createEmptyEpisode
} from '../types/project';
import { CharacterRef } from '../types';
import { ModelSelector } from './ModelSelector';
import { MODELS, splitEpisodesWithAI } from '../services/openrouter';
import mammoth from 'mammoth';

interface ProjectWizardProps {
  onComplete: (project: Project) => void;
  onCancel: () => void;
  onAnalyze: (
    scripts: ScriptFile[],
    model: string,
    onProgress?: (progress: BatchAnalysisProgress) => void,
    mode?: 'quick' | 'standard' | 'deep'
  ) => Promise<ProjectAnalysisResult>;
}

const GENRE_OPTIONS = [
  '仙侠', '科幻', '现代都市', '奇幻', '悬疑', '历史', '校园', '混合'
];

export function ProjectWizard({ onComplete, onCancel, onAnalyze }: ProjectWizardProps) {
  const [step, setStep] = useState<ProjectWizardStep>('basic-info');
  const [projectName, setProjectName] = useState('');
  const [genre, setGenre] = useState('');
  const [customGenre, setCustomGenre] = useState('');
  const [mediaType, setMediaType] = useState<ProjectMediaType>('ai-2d');
  const [scripts, setScripts] = useState<ScriptFile[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ProjectAnalysisResult | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string>(MODELS.GEMINI_2_5_FLASH);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🆕 提取模式和范围设置
  const [analysisMode, setAnalysisMode] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [includeSupporting, setIncludeSupporting] = useState(true);
  const [includeMinor, setIncludeMinor] = useState(false);

  // 分批分析进度状态
  const [batchProgress, setBatchProgress] = useState<BatchAnalysisProgress | null>(null);

  // 从文件名推断集数（支持多种格式）
  const parseEpisodeNumber = (fileName: string): number | undefined => {
    // 匹配多种格式：第X集、EpX、EP_X、epX、第X话、_X.txt、纯数字.docx等
    const patterns = [
      /第(\d+)集/,
      /第(\d+)话/,
      /[Ee][Pp][\s_-]?(\d+)/,
      /[Ee]pisode[\s_-]?(\d+)/i,
      /[\s_-](\d+)\.(?:txt|ini|docx)/i,
      /^(\d+)[_\s-]/,
      /^(\d+)\.(?:txt|ini|docx)$/i,  // 纯数字文件名：55.docx, 1.txt 等
    ];
    for (const pattern of patterns) {
      const match = fileName.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        console.log(`[parseEpisodeNumber] "${fileName}" -> ${num}`);
        return num;
      }
    }
    console.log(`[parseEpisodeNumber] "${fileName}" -> undefined (无法解析)`);
    return undefined;
  };

  // 读取文件内容（支持 .txt, .ini, .docx）
  const readFileContent = async (file: File): Promise<string> => {
    const ext = file.name.toLowerCase().split('.').pop();

    if (ext === 'docx') {
      // 使用 mammoth 解析 .docx 文件
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } else {
      // 普通文本文件
      return await file.text();
    }
  };

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newScripts: ScriptFile[] = [];
    const fileArray = Array.from(files) as File[];

    console.log(`[ProjectWizard] 开始处理 ${fileArray.length} 个文件`);

    for (const file of fileArray) {
      try {
        console.log(`[ProjectWizard] 正在读取文件: ${file.name}`);
        const content = await readFileContent(file);
        console.log(`[ProjectWizard] 文件读取成功，内容长度: ${content.length} 字符`);

        const epNumber = parseEpisodeNumber(file.name);
        console.log(`[ProjectWizard] 文件集数解析: ${file.name} -> ${epNumber || 'undefined'}`);

        // 如果文件名没有集数信息，尝试用AI拆分
        if (!epNumber) {
          console.log(`[ProjectWizard] 文件名无集数信息: ${file.name}，尝试AI拆分...`);
          try {
            const result = await splitEpisodesWithAI(content, selectedModel);
            console.log(`[ProjectWizard] AI拆分完成，结果集数: ${result.episodes.length}`);
            if (result.episodes.length > 1) {
              console.log(`[ProjectWizard] AI拆分成功，识别到 ${result.episodes.length} 集`);
              // 拆分为多个脚本
              result.episodes.forEach(ep => {
                newScripts.push({
                  fileName: `${file.name} - 第${ep.episodeNumber}集${ep.title ? ` ${ep.title}` : ''}`,
                  content: ep.script,
                  episodeNumber: ep.episodeNumber,
                });
              });
              alert(`文件 "${file.name}" 已自动拆分为 ${result.episodes.length} 集`);
              console.log(`[ProjectWizard] 已拆分为 ${result.episodes.length} 个脚本，跳过普通添加`);
              continue; // 跳过普通添加
            } else {
              console.log(`[ProjectWizard] AI未检测到多集，将作为单集处理`);
            }
          } catch (aiError) {
            console.error('[ProjectWizard] AI拆分失败，将作为单集处理:', aiError);
          }
        }

        // 添加为单集
        console.log(`[ProjectWizard] 添加单集文件: ${file.name}`);
        newScripts.push({
          fileName: file.name,
          content,
          episodeNumber: epNumber,
        });
      } catch (error) {
        console.error(`[ProjectWizard] 读取文件失败: ${file.name}`, error);
        alert(`读取文件失败: ${file.name}\n请确保文件格式正确`);
      }
    }

    console.log(`[ProjectWizard] 处理完成，新增 ${newScripts.length} 个脚本`);

    // 合并现有脚本和新脚本，然后对整个列表按集数排序
    setScripts(prev => {
      const combined = [...prev, ...newScripts];
      console.log(`[ProjectWizard] 合并后共 ${combined.length} 个脚本`);
      // 去重（如果文件名相同则覆盖）
      const fileMap = new Map<string, ScriptFile>();
      for (const script of combined) {
        fileMap.set(script.fileName, script);
      }
      const deduped = Array.from(fileMap.values());
      // 按集数排序
      const sorted = deduped.sort((a, b) => (a.episodeNumber || 999) - (b.episodeNumber || 999));
      console.log(`[ProjectWizard] 最终脚本列表:`, sorted.map(s => ({ name: s.fileName.slice(0, 30), ep: s.episodeNumber })));
      return sorted;
    });
  };

  // 开始AI分析（支持分批进度回调）
  const startAnalysis = async () => {
    if (scripts.length === 0) {
      alert('请至少上传一个剧本文件');
      return;
    }

    setStep('ai-analyzing');
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setBatchProgress(null);

    try {
      // 调试：显示传入分析的脚本集数
      console.log('[ProjectWizard] 开始分析，脚本列表:');
      console.log('[ProjectWizard] 共', scripts.length, '个脚本');
      console.log('[ProjectWizard] 集数分布:', scripts.map(s => s.episodeNumber));
      console.log('[ProjectWizard] 前5个文件名:', scripts.slice(0, 5).map(s => s.fileName));

      // 进度回调处理
      const handleProgress = (progress: BatchAnalysisProgress) => {
        setBatchProgress(progress);
        // 计算总进度百分比
        const baseProgress = ((progress.currentBatch - 1) / progress.totalBatches) * 100;
        const batchProgress = progress.status === 'analyzing' ? 0 :
                              progress.status === 'merging' ? 50 : 100;
        const addProgress = (batchProgress / progress.totalBatches);
        setAnalysisProgress(Math.min(Math.round(baseProgress + addProgress), 99));

        // 实时更新部分结果
        if (progress.partialResult) {
          setAnalysisResult(progress.partialResult);
        }
      };

      // 🆕 传递提取模式参数
      const result = await onAnalyze(scripts, selectedModel, handleProgress, analysisMode);

      setAnalysisProgress(100);
      setAnalysisResult(result);
      setStep('review-confirm');
    } catch (error: any) {
      console.error('AI分析失败:', error);
      const errorMsg = error?.message || 'AI分析失败';
      const skipAnalysis = confirm(`${errorMsg}\n\n是否跳过AI分析，手动填写项目信息？`);

      if (skipAnalysis) {
        // 创建默认分析结果，让用户手动编辑
        setAnalysisResult({
          worldView: '',
          genre: '',
          visualStyle: '',
          keyTerms: [],
          characters: [],
          scenes: [],
          episodeSummaries: scripts.map((s, i) => ({
            episodeNumber: s.episodeNumber || i + 1,
            title: `第${s.episodeNumber || i + 1}集`,
            summary: '待填写',
            characterStates: [],
          })),
        });
        setStep('review-confirm');
      } else {
        setStep('upload-scripts');
      }
    } finally {
      setIsAnalyzing(false);
      setBatchProgress(null);
    }
  };

  // 确认创建项目
  const confirmCreate = () => {
    if (!analysisResult) return;

    // 🆕 优先使用 AI 分析结果中的 genre，其次用户选择的
    let finalGenre = '';
    if (genre === '混合') {
      finalGenre = customGenre;
    } else if (genre) {
      finalGenre = genre;
    } else if (analysisResult.genre) {
      finalGenre = analysisResult.genre;  // 使用 AI 分析的类型
    }

    const project = createEmptyProject(projectName);

    project.settings = {
      mediaType,
      genre: finalGenre,
      worldView: analysisResult.worldView,
      visualStyle: analysisResult.visualStyle || PROJECT_MEDIA_TYPES[mediaType].visualStyle,
      keyTerms: analysisResult.keyTerms,
    };
    project.characters = analysisResult.characters;
    project.scenes = analysisResult.scenes;
    project.storyOutline = analysisResult.episodeSummaries;

    // 创建剧集，确保使用正确的集数
    // 首先按 episodeNumber 排序脚本，然后创建剧集
    const sortedScripts = [...scripts].sort((a, b) =>
      (a.episodeNumber || 999) - (b.episodeNumber || 999)
    );
    project.episodes = sortedScripts.map((s, i) => {
      // 优先使用文件名解析出的集数，否则使用数组索引+1
      const epNum = s.episodeNumber || (i + 1);
      return createEmptyEpisode(epNum, s.content);
    });

    // 确保剧集按集数排序
    project.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

    onComplete(project);
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
        {/* 进度指示器 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['basic-info', 'upload-scripts', 'ai-analyzing', 'review-confirm'] as const).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                ${step === s ? 'bg-blue-600 text-white' :
                  ['basic-info', 'upload-scripts', 'ai-analyzing', 'review-confirm'].indexOf(step) > i
                    ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                {['basic-info', 'upload-scripts', 'ai-analyzing', 'review-confirm'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              {i < 3 && <div className={`w-16 h-0.5 ${
                ['basic-info', 'upload-scripts', 'ai-analyzing', 'review-confirm'].indexOf(step) > i
                  ? 'bg-green-500' : 'bg-gray-700'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* 步骤1：基础信息 */}
        {step === 'basic-info' && (
          <div className="bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6">📁 新建项目</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="例如：某某动漫 / 项目代号"
                  className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* 🆕 媒体类型选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  媒体类型 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(PROJECT_MEDIA_TYPES) as ProjectMediaType[]).map(type => {
                    const config = PROJECT_MEDIA_TYPES[type];
                    return (
                      <button
                        key={type}
                        onClick={() => setMediaType(type)}
                        className={`p-4 rounded-lg text-left transition-all border-2
                          ${mediaType === type
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500'}`}
                      >
                        <div className="font-medium text-sm">{config.name}</div>
                        <div className="text-xs text-gray-400 mt-1">{config.description}</div>
                        <div className="text-xs text-blue-400 mt-1">
                          ⏱️ 每集 {config.avgDuration} | 首集 {config.firstEpDuration}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">类型/题材</label>
                <div className="flex flex-wrap gap-2">
                  {GENRE_OPTIONS.map(g => (
                    <button
                      key={g}
                      onClick={() => setGenre(g)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                        ${genre === g
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {genre === '混合' && (
                  <input
                    type="text"
                    value={customGenre}
                    onChange={(e) => setCustomGenre(e.target.value)}
                    placeholder="请描述混合类型，如：修仙+赛博朋克"
                    className="w-full mt-3 p-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500"
                  />
                )}
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <button
                onClick={onCancel}
                className="px-6 py-2.5 text-gray-400 hover:text-white"
              >
                取消
              </button>
              <button
                onClick={() => setStep('upload-scripts')}
                disabled={!projectName.trim()}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium
                          hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一步 →
              </button>
            </div>
          </div>
        )}

        {/* 步骤2：上传剧本 */}
        {step === 'upload-scripts' && (
          <div className="bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-2">📤 上传剧本</h2>
            <p className="text-gray-400 mb-6">支持批量上传多集剧本，系统会自动识别集数</p>

            {/* 上传区域 */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-600 rounded-xl p-10 text-center
                        hover:border-blue-400 hover:bg-gray-700/50 transition-all cursor-pointer"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.ini,.docx"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="text-4xl mb-3">📄</div>
              <p className="text-gray-300 font-medium">拖拽剧本文件到此处</p>
              <p className="text-gray-500 text-sm mt-1">或 点击选择文件（支持 .txt .ini .docx，可多选）</p>
            </div>

            {/* 已上传文件列表 */}
            {scripts.length > 0 && (
              <div className="mt-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-300">已上传 ({scripts.length})</span>
                  <button
                    onClick={() => setScripts([])}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    清空全部
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-auto">
                  {scripts.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg">
                      <span className="text-green-400">✅</span>
                      <span className="flex-1 text-sm text-gray-200 truncate">{s.fileName}</span>
                      {s.episodeNumber && (
                        <span className="px-2 py-0.5 bg-blue-900 text-blue-300 text-xs rounded">
                          第{s.episodeNumber}集
                        </span>
                      )}
                      <button
                        onClick={() => setScripts(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-gray-500 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 模型选择 */}
            {scripts.length > 0 && (
              <div className="mt-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-300">🤖 分析模型：</span>
                  <div className="flex-1">
                    <ModelSelector
                      value={selectedModel}
                      onChange={setSelectedModel}
                      type="all"
                      showLabel={false}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  💡 选择用于全剧 AI 分析的模型（影响角色/场景提取质量）
                </p>
              </div>
            )}

            {/* 🆕 提取模式选择 */}
            {scripts.length > 0 && (
              <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
                <div className="mb-3">
                  <span className="text-sm font-medium text-gray-300">📊 提取模式：</span>
                </div>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-blue-500 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="analysisMode"
                      value="quick"
                      checked={analysisMode === 'quick'}
                      onChange={(e) => setAnalysisMode(e.target.value as any)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">⚡ 快速模式</span>
                        <span className="text-xs text-gray-500">~5分钟</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        仅提取基础信息（角色名、外观、场景地点）- 适合快速预览
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-blue-500 bg-blue-500/10 cursor-pointer">
                    <input
                      type="radio"
                      name="analysisMode"
                      value="standard"
                      checked={analysisMode === 'standard'}
                      onChange={(e) => setAnalysisMode(e.target.value as any)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">✨ 标准模式</span>
                        <span className="text-xs text-blue-400">推荐</span>
                        <span className="text-xs text-gray-500">~15分钟</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        完整信息（基础 + 多形态 + 经典台词）- 推荐用于正式项目
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-purple-500 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="analysisMode"
                      value="deep"
                      checked={analysisMode === 'deep'}
                      onChange={(e) => setAnalysisMode(e.target.value as any)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">🔬 深度模式</span>
                        <span className="text-xs text-gray-500">~30分钟</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        超详细（标准 + 能力进化 + 关系网络）- 适合复杂长篇项目
                      </p>
                    </div>
                  </label>
                </div>

                {/* 角色提取范围 */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <span className="text-sm font-medium text-gray-300 block mb-2">👥 角色提取范围：</span>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                      <input type="checkbox" checked disabled className="opacity-50" />
                      主角（必选）
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                      <input
                        type="checkbox"
                        checked={includeSupporting}
                        onChange={(e) => setIncludeSupporting(e.target.checked)}
                      />
                      重要配角
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                      <input
                        type="checkbox"
                        checked={includeMinor}
                        onChange={(e) => setIncludeMinor(e.target.checked)}
                      />
                      所有角色（包括路人）
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep('basic-info')}
                className="px-6 py-2.5 text-gray-400 hover:text-white"
              >
                ← 上一步
              </button>
              <button
                onClick={startAnalysis}
                disabled={scripts.length === 0}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium
                          hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                          flex items-center gap-2"
              >
                🔍 AI分析项目 →
              </button>
            </div>
          </div>
        )}

        {/* 步骤3：AI分析中 */}
        {step === 'ai-analyzing' && (
          <div className="bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-700">
            <div className="text-center">
              <div className="text-5xl mb-4 animate-pulse">🤖</div>
              <h2 className="text-2xl font-bold text-white mb-2">AI正在分析项目...</h2>

              {/* 分批进度显示 */}
              {batchProgress && batchProgress.totalBatches > 1 ? (
                <p className="text-gray-400 mb-4">
                  正在分析第 <span className="text-blue-400 font-bold">{batchProgress.currentBatch}</span>/{batchProgress.totalBatches} 批
                  <span className="text-gray-500 ml-2">(第{batchProgress.batchEpisodeRange}集)</span>
                </p>
              ) : (
                <p className="text-gray-400 mb-4">正在提取世界观、角色、场景和剧情大纲</p>
              )}

              {/* 进度条 */}
              <div className="max-w-md mx-auto mb-6">
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400 mt-2">{analysisProgress}%</p>
              </div>
            </div>

            {/* 实时结果预览 */}
            {analysisResult && (analysisResult.characters.length > 0 || analysisResult.scenes.length > 0 || analysisResult.episodeSummaries.length > 0) && (
              <div className="mt-6 space-y-4">
                {/* 统计数据 */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-400">
                      {analysisResult.characters.length}
                    </div>
                    <div className="text-xs text-gray-500">已识别角色</div>
                    {analysisResult.characters.length > 0 && (
                      <div className="mt-2 text-xs text-gray-400 truncate">
                        {analysisResult.characters.slice(0, 3).map(c => c.name).join('、')}
                        {analysisResult.characters.length > 3 && '...'}
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-400">
                      {analysisResult.scenes.length}
                    </div>
                    <div className="text-xs text-gray-500">已识别场景</div>
                    {analysisResult.scenes.length > 0 && (
                      <div className="mt-2 text-xs text-gray-400 truncate">
                        {analysisResult.scenes.slice(0, 3).map(s => s.name).join('、')}
                        {analysisResult.scenes.length > 3 && '...'}
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-400">
                      {analysisResult.episodeSummaries.filter(e => e.summary && e.summary !== '待分析').length}/{scripts.length}
                    </div>
                    <div className="text-xs text-gray-500">已分析集数</div>
                  </div>
                </div>

                {/* 剧情大纲实时预览 */}
                {analysisResult.episodeSummaries.filter(e => e.summary && e.summary !== '待分析').length > 0 && (
                  <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                    <h4 className="text-xs font-bold text-white mb-2">📚 剧情大纲 (实时)</h4>
                    <div className="space-y-1 max-h-48 overflow-auto text-left">
                      {analysisResult.episodeSummaries
                        .filter(ep => ep.summary && ep.summary !== '待分析')
                        .map((ep, i) => (
                        <div key={i} className="text-xs flex items-start gap-2">
                          <span className="text-blue-400 font-bold shrink-0">第{ep.episodeNumber}集</span>
                          <span className="text-gray-500 mx-1">|</span>
                          <span className="text-gray-300">{ep.summary}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 分析状态指示器 */}
            <div className="mt-6 text-left max-w-sm mx-auto space-y-2">
              {[
                { label: '提取世界观设定', done: !!analysisResult?.worldView },
                { label: '识别所有角色', done: (analysisResult?.characters.length || 0) > 0 },
                { label: '分析场景设定', done: (analysisResult?.scenes.length || 0) > 0 },
                { label: '生成剧情大纲', done: (analysisResult?.episodeSummaries.length || 0) >= scripts.length },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span>{item.done ? '✅' : batchProgress?.status === 'analyzing' ? '🔄' : '⬜'}</span>
                  <span className={item.done ? 'text-green-400' : 'text-gray-400'}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 步骤4：审核确认 */}
        {step === 'review-confirm' && analysisResult && (
          <div className="bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-2">✅ AI分析完成</h2>
            <p className="text-gray-400 mb-6">请审核以下信息，确认后创建项目</p>

            <div className="space-y-6">
              {/* 世界观 */}
              <div className="p-4 bg-gray-900 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-white">📖 世界观</h3>
                </div>
                <p className="text-sm text-gray-300">{analysisResult.worldView || '未识别到世界观设定'}</p>
              </div>

              {/* 角色库 */}
              <div className="p-4 bg-gray-900 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-white">👥 角色库 ({analysisResult.characters.length})</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysisResult.characters.map((c, i) => (
                    <span key={i} className="px-3 py-1 bg-gray-700 border border-gray-600 rounded-full text-sm text-gray-200">
                      {c.name} ({c.gender || '未知'})
                    </span>
                  ))}
                </div>
              </div>

              {/* 场景库 */}
              <div className="p-4 bg-gray-900 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-white">🏛️ 场景库 ({analysisResult.scenes.length})</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysisResult.scenes.map((s, i) => (
                    <span key={i} className="px-3 py-1 bg-gray-700 border border-gray-600 rounded-full text-sm text-gray-200">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* 剧情大纲 */}
              <div className="p-4 bg-gray-900 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-white">📚 剧情大纲 ({analysisResult.episodeSummaries.length}集)</h3>
                </div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {analysisResult.episodeSummaries.map((ep, i) => (
                    <div key={i} className="text-sm">
                      <span className="text-blue-400 font-medium">第{ep.episodeNumber}集</span>
                      <span className="text-gray-500 mx-2">|</span>
                      <span className="text-gray-300">{ep.summary || '待分析'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep('upload-scripts')}
                className="px-6 py-2.5 text-gray-400 hover:text-white"
              >
                ← 返回修改
              </button>
              <button
                onClick={confirmCreate}
                className="px-8 py-2.5 bg-green-600 text-white rounded-lg font-bold
                          hover:bg-green-700 flex items-center gap-2"
              >
                ✓ 确认并创建项目
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

