import React, { useState } from 'react';
import { ScriptCleaningResult, EpisodeSplit } from '../../types';
import { cleanScriptStream } from '../../services/openrouter';

// ─────────────────────────────────────────────────────────────────────────────
// 剧集拆分工具
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 剧集标记模式列表
 * 用于检测剧本中的剧集标记
 */
const EPISODE_PATTERNS = [
  // 中文格式
  /(?:^|\n)[\s\t]*第([一二三四五六七八九十百千万\d]+)[集话季][\s\t]*(：|:|】)?/gi,
  /(?:^|\n)[\s\t]*第([一二三四五六七八九十百千万\d]+)[集话季]\s*(?:第([一二三四五六七八九十百千万\d]+)[集话季])?/gi,
  /(?:^|\n)[\s\t]*\x301?第([一二三四五六七八九十百千万\d]+)[集话季]\x301?/gi,
  /(?:^|\n)[\s\t]*Episode\s*([一二三四五六七八九十百千万\d]+)/gi,

  // 英文/数字格式
  /(?:^|\n)[\s\t]*EP\s*(\d+)/gi,
  /(?:^|\n)[\s\t]*Episode\s*(\d+)/gi,
  /(?:^|\n)[\s\t]*EPI\s*(\d+)/gi,

  // 其他格式
  /(?:^|\n)[\s\t]*\[(\d+)\]/gi,
  /(?:^|\n)[\s\t]*第\s*(\d+)\s*[部分篇章]/gi,
];

/**
 * 将中文数字转换为阿拉伯数字
 */
function chineseToNumber(chinese: string): number {
  const map: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '壹': 1, '贰': 2, '叁': 3, '肆': 4, '伍': 5,
    '陆': 6, '柒': 7, '捌': 8, '玖': 9, '拾': 10,
  };
  return map[chinese] || parseInt(chinese, 10);
}

/**
 * 解析剧集编号
 */
function parseEpisodeNumber(numStr: string): number {
  numStr = numStr.trim();
  // 优先尝试数字解析
  const parsed = parseInt(numStr, 10);
  if (!isNaN(parsed)) return parsed;
  // 尝试中文数字
  return chineseToNumber(numStr);
}

/**
 * 检测并拆分剧本为多集
 * @param script 原始剧本文本
 * @returns 拆分后的剧集列表
 */
export function detectAndSplitEpisodes(script: string): EpisodeSplit[] {
  const episodes: EpisodeSplit[] = [];
  const lines = script.split('\n');

  // 查找所有剧集标记的位置
  const markers: Array<{
    index: number;
    lineNumber: number;
    number: number;
    text: string;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    for (const pattern of EPISODE_PATTERNS) {
      pattern.lastIndex = 0; // 重置正则表达式
      const match = pattern.exec(trimmedLine);
      if (match) {
        const episodeNumber = parseEpisodeNumber(match[1]);
        if (episodeNumber > 0) {
          markers.push({
            index: i,
            lineNumber: i + 1,
            number: episodeNumber,
            text: match[0],
          });
          break; // 找到一个标记后跳出内层循环
        }
      }
    }
  }

  // 如果没有找到任何标记，返回空数组
  if (markers.length === 0) {
    return [];
  }

  // 按行号排序
  markers.sort((a, b) => a.index - b.index);

  // 构建剧集内容
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const startIndex = marker.index;
    const endIndex = i < markers.length - 1 ? markers[i + 1].index : lines.length;

    // 提取该集的剧本内容
    let episodeLines = lines.slice(startIndex, endIndex);

    // 尝试从标记行提取标题
    const markerLine = episodeLines[0].trim();
    let title: string | undefined;
    const titleMatch = markerLine.match(/(?:【|第[集话季]\s*)[^\d]*(.+?)(?:】|$)/);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
      // 移除冒号等符号
      title = title.replace(/^[：:\s]+/, '');
    }

    // 组合剧本
    const episodeScript = episodeLines.join('\n');

    episodes.push({
      episodeNumber: marker.number,
      title,
      script: episodeScript,
      marker: marker.text,
      startIndex,
      endIndex: endIndex - 1,
    });
  }

  return episodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// 清洗结果规范化工具（与模型无关，统一在数据层处理不稳定输出）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将任意值规范化为字符串
 * 适用于 LLM 返回格式不稳定（对象、数组混入）的 string[] 字段
 */
function normalizeToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(normalizeToString).filter(Boolean).join(' / ');
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
function normalizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return typeof arr === 'string' ? [arr] : [];
  return arr.map(normalizeToString).filter(Boolean);
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
      dialogues: normalizeStringArray(scene.dialogues),
      uiElements: normalizeStringArray(scene.uiElements),
      moodTags: normalizeStringArray(scene.moodTags),
    })),
    audioEffects: normalizeStringArray(result.audioEffects),
    musicCues: normalizeStringArray(result.musicCues),
    timeCodes: normalizeStringArray(result.timeCodes),
    cameraSuggestions: normalizeStringArray(result.cameraSuggestions),
  };
}

/**
 * 剧本管理 Hook
 * 负责剧本的上传、清洗、剧集拆分等功能
 */
export function useScriptManagement(analysisModel: string) {
  const [script, setScript] = useState('');
  const [cleaningResult, setCleaningResult] = useState<ScriptCleaningResult | null>(null);
  const [cleaningProgress, setCleaningProgress] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);

  // 🆕 剧集拆分相关状态
  const [episodes, setEpisodes] = useState<EpisodeSplit[]>([]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState<number | null>(null);
  const [currentScript, setCurrentScript] = useState(''); // 当前处理的剧本内容（可能是单集）

  /**
   * 处理剧本文件上传
   */
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
        } else {
          setEpisodes([]);
          setCurrentEpisodeIndex(null);
          setCurrentScript(text);
        }
      };
      reader.readAsText(file);
    }
  };

  /**
   * 手动切换剧本（用于粘贴文本）
   */
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

  /**
   * 切换当前处理的剧集
   */
  const selectEpisode = (index: number) => {
    if (index >= 0 && index < episodes.length) {
      setCurrentEpisodeIndex(index);
      setCurrentScript(episodes[index].script);
      // 切换剧集后清空之前的清洗结果
      setCleaningResult(null);
      setCleaningProgress('');
    }
  };

  /**
   * 取消剧集拆分，使用完整剧本
   */
  const cancelEpisodeSplit = () => {
    setEpisodes([]);
    setCurrentEpisodeIndex(null);
    setCurrentScript(script);
  };

  /**
   * 开始清洗剧本
   */
  const startScriptCleaning = async () => {
    if (!currentScript.trim()) {
      alert("请输入脚本内容");
      return;
    }

    setCleaningResult(null);
    setCleaningProgress('');
    setIsCleaning(true);

    try {
      const stream = cleanScriptStream(currentScript, analysisModel);
      let lastText = '';
      
      for await (const text of stream) {
        lastText = text;
        setCleaningProgress(text);
      }

      // 解析最终结果
      try {
        const jsonMatch = lastText.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : lastText;
        const result = JSON.parse(jsonStr) as ScriptCleaningResult;

        // 规范化所有 string[] 字段，防止不同模型返回对象/数组嵌套导致渲染崩溃
        setCleaningResult(normalizeCleaningResult(result));
        setCleaningProgress('✅ 清洗完成！');
      } catch (parseError) {
        console.error('[剧本清洗] JSON解析失败:', parseError);
        console.log('[剧本清洗] 原始输出:', lastText);

        // 尝试提取部分结果
        try {
          const partialMatch = lastText.match(/\{[\s\S]*"cleanedScenes"[\s\S]*\}/);
          if (partialMatch) {
            const result = JSON.parse(partialMatch[0]) as ScriptCleaningResult;
            // 规范化所有 string[] 字段
            setCleaningResult(normalizeCleaningResult(result));
            setCleaningProgress('⚠️ 清洗完成（部分结果）');
          } else {
            throw new Error('无法提取有效结果');
          }
        } catch (fallbackError) {
          alert('清洗结果解析失败，请重试');
          setCleaningProgress('❌ 解析失败');
        }
      }
    } catch (error) {
      console.error(error);
      alert("清洗中断，请检查网络");
      setCleaningProgress('❌ 清洗失败');
    } finally {
      setIsCleaning(false);
    }
  };

  /**
   * 重置清洗结果
   */
  const resetCleaning = () => {
    setCleaningResult(null);
    setCleaningProgress('');
  };

  return {
    // 状态
    script,
    currentScript,  // 当前处理的剧本（可能是单集或完整剧本）
    cleaningResult,
    cleaningProgress,
    isCleaning,
    episodes,        // 拆分后的剧集列表
    currentEpisodeIndex,  // 当前选中的剧集索引

    // 方法
    setScript,
    handleScriptUpload,
    handleScriptTextChange,  // 🆕 处理剧本文本变化
    startScriptCleaning,
    resetCleaning,
    selectEpisode,       // 🆕 切换剧集
    cancelEpisodeSplit,  // 🆕 取消剧集拆分
  };
}

