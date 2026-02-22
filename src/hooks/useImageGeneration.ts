import React, { useState } from 'react';
import { StoryboardStyle, STORYBOARD_STYLES } from '../../types';

/**
 * 图片生成 Hook
 * 负责九宫格图片生成、风格选择等功能
 */
export function useImageGeneration() {
  // 九宫格图片URL
  const [hqUrls, setHqUrls] = useState<string[]>([]);

  // 风格选择
  const [selectedStyle, setSelectedStyle] = useState<StoryboardStyle>(STORYBOARD_STYLES[0]);
  const [customStylePrompt, setCustomStylePrompt] = useState('');
  const [showStyleCards, setShowStyleCards] = useState(false);

  // 上传状态
  const [uploadGridIndex, setUploadGridIndex] = useState<number | null>(null);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // 提示词提取状态
  const [extractProgress, setExtractProgress] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  /**
   * 重置九宫格
   */
  const resetGrid = () => {
    setHqUrls([]);
  };

  /**
   * 打开上传对话框
   */
  const openUploadDialog = (index: number) => {
    setUploadGridIndex(index);
    setUploadUrl('');
    setUploadFile(null);
  };

  /**
   * 关闭上传对话框
   */
  const closeUploadDialog = () => {
    setUploadGridIndex(null);
    setUploadUrl('');
    setUploadFile(null);
  };

  /**
   * 更新指定位置的图片URL
   */
  const updateGridUrl = (index: number, url: string) => {
    setHqUrls(prev => {
      const newUrls = [...prev];
      newUrls[index] = url;
      return newUrls;
    });
  };

  /**
   * 批量更新九宫格URL
   */
  const updateAllGridUrls = (urls: string[]) => {
    setHqUrls(urls);
  };

  /**
   * 重置提取状态
   */
  const resetExtractState = () => {
    setExtractProgress('');
    setIsExtracting(false);
  };

  /**
   * 开始提取
   */
  const startExtracting = () => {
    setIsExtracting(true);
    setExtractProgress('');
  };

  /**
   * 停止提取
   */
  const stopExtracting = () => {
    setIsExtracting(false);
  };

  return {
    // 状态
    hqUrls,
    selectedStyle,
    customStylePrompt,
    showStyleCards,
    uploadGridIndex,
    uploadUrl,
    uploadFile,
    extractProgress,
    isExtracting,

    // 方法
    setHqUrls,
    setSelectedStyle,
    setCustomStylePrompt,
    setShowStyleCards,
    setUploadGridIndex,
    setUploadUrl,
    setUploadFile,
    setExtractProgress,
    setIsExtracting,
    resetGrid,
    openUploadDialog,
    closeUploadDialog,
    updateGridUrl,
    updateAllGridUrls,
    resetExtractState,
    startExtracting,
    stopExtracting,
  };
}

