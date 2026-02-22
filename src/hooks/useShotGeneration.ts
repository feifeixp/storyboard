import React, { useState } from 'react';
import { Shot } from '../../types';
import type {
  ScriptAnalysis,
  VisualStrategy,
  ShotPlanning,
  ShotDesign,
  QualityCheck,
} from '../../prompts/chain-of-thought/types';
import type { GeneratedEpisodeSummary } from '../../types/project';

/**
 * 分镜生成 Hook
 * 负责分镜的生成、思维链流程等功能
 */
export function useShotGeneration() {
  // 基础状态
  const [shots, setShots] = useState<Shot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [streamText, setStreamText] = useState('');

  // 生成模式
  const [generationMode, setGenerationMode] = useState<'traditional' | 'chain-of-thought'>('chain-of-thought');

  // 思维链状态
  const [cotCurrentStage, setCotCurrentStage] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [cotStage1, setCotStage1] = useState<ScriptAnalysis | null>(null);
  const [cotStage2, setCotStage2] = useState<VisualStrategy | null>(null);
  const [cotStage3, setCotStage3] = useState<ShotPlanning | null>(null);
  const [cotStage4, setCotStage4] = useState<ShotDesign[] | null>(null);
  const [cotStage5, setCotStage5] = useState<QualityCheck | null>(null);
  const [cotRawOutput, setCotRawOutput] = useState<string>('');

  // 本集概述
  const [episodeSummary, setEpisodeSummary] = useState<GeneratedEpisodeSummary | null>(null);

  /**
   * 重置所有生成状态
   */
  const resetGenerationState = () => {
    setShots([]);
    setStreamText('');
    setCotRawOutput('');
    setCotCurrentStage(null);
    setCotStage1(null);
    setCotStage2(null);
    setCotStage3(null);
    setCotStage4(null);
    setCotStage5(null);
    setEpisodeSummary(null);
  };

  /**
   * 重置思维链状态
   */
  const resetChainOfThoughtState = () => {
    setCotRawOutput('');
    setCotCurrentStage(null);
    setCotStage1(null);
    setCotStage2(null);
    setCotStage3(null);
    setCotStage4(null);
    setCotStage5(null);
  };

  /**
   * 设置进度消息
   */
  const updateProgress = (message: string) => {
    setProgressMsg(message);
  };

  /**
   * 开始加载
   */
  const startLoading = () => {
    setIsLoading(true);
  };

  /**
   * 停止加载
   */
  const stopLoading = () => {
    setIsLoading(false);
  };

  return {
    // 状态
    shots,
    isLoading,
    progressMsg,
    streamText,
    generationMode,
    cotCurrentStage,
    cotStage1,
    cotStage2,
    cotStage3,
    cotStage4,
    cotStage5,
    cotRawOutput,
    episodeSummary,

    // 方法
    setShots,
    setIsLoading,
    setProgressMsg,
    setStreamText,
    setGenerationMode,
    setCotCurrentStage,
    setCotStage1,
    setCotStage2,
    setCotStage3,
    setCotStage4,
    setCotStage5,
    setCotRawOutput,
    setEpisodeSummary,
    resetGenerationState,
    resetChainOfThoughtState,
    updateProgress,
    startLoading,
    stopLoading,
  };
}

