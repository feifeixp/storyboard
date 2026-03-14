import React, { useState, useEffect } from 'react';
import { StoryboardStyle, STORYBOARD_STYLES, AppStep, Shot, CharacterRef } from '../../types';
import { Project, Episode } from '../../types/project';
import { patchEpisode, saveEpisode } from '../../services/d1Storage';
import { generateMergedStoryboardSheet, generateSingleGrid, detectArtStyleType } from '../../services/openrouter';
import { pollGenerationResult, TaskStatus } from '../../services/aiImageGeneration';
import { uploadToOSS } from '../../services/oss';

export interface UseImageGenerationProps {
  currentProject: Project | null;
  currentEpisodeNumber: number | null;
  shots: Shot[];
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  characterRefs: CharacterRef[];
  imageModel: string;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setProgressMsg: React.Dispatch<React.SetStateAction<string>>;
  setCurrentStep: React.Dispatch<React.SetStateAction<AppStep>>;
}

export function useImageGeneration({
  currentProject, currentEpisodeNumber, shots, setShots,
  characterRefs, imageModel, setIsLoading, setProgressMsg, setCurrentStep
}: UseImageGenerationProps) {
  const [hqUrls, setHqUrls] = useState<string[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StoryboardStyle>(STORYBOARD_STYLES[0]);
  const [customStylePrompt, setCustomStylePrompt] = useState('');
  const [showStyleCards, setShowStyleCards] = useState(false);

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadGridIndex, setUploadGridIndex] = useState<number | null>(null);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [extractProgress, setExtractProgress] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [gridGenerationStartTime, setGridGenerationStartTime] = useState<number | null>(null);
  const [currentGeneratingGrid, setCurrentGeneratingGrid] = useState<number | null>(null);
  const [generationElapsedTime, setGenerationElapsedTime] = useState<number>(0);

  useEffect(() => {
    if (!gridGenerationStartTime || currentGeneratingGrid === null) {
      setGenerationElapsedTime(0);
      return;
    }
    const interval = setInterval(() => {
      setGenerationElapsedTime(Math.floor((Date.now() - gridGenerationStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gridGenerationStartTime, currentGeneratingGrid]);

  const generateHQ = async () => {
    setIsLoading(true);
    setHqUrls([]);
    const totalGrids = Math.ceil(shots.length / 9);
    setProgressMsg(`正在使用「${selectedStyle.name}」风格绘制 ${totalGrids} 张九宫格...`);

    const controller = new AbortController();
    setAbortController(controller);
    setGridGenerationStartTime(Date.now());
    setCurrentGeneratingGrid(0);

    try {
      if (!currentProject || currentEpisodeNumber === null) {
        alert('⚠️ 未选择项目/剧集，无法生成九宫格');
        return;
      }
      const currentEpisode = currentProject.episodes?.find(ep => ep.episodeNumber === currentEpisodeNumber);
      if (!currentEpisode) {
        alert('⚠️ 未找到当前剧集信息，不能生成九宫格');
        return;
      }

      const artStyle = detectArtStyleType(currentProject.settings.genre, currentProject.settings.visualStyle);
      const results = await generateMergedStoryboardSheet(
        shots, characterRefs, 'hq', imageModel, selectedStyle,
        (current, total, info) => {
          setProgressMsg(`正在生成 ${info} (${current}/${total}) - ${selectedStyle.name}`);
          setCurrentGeneratingGrid(current - 1);
          setGridGenerationStartTime(Date.now());
        },
        (gridIndex, imageUrl) => {
          setHqUrls(prev => {
            const newUrls = [...prev];
            newUrls[gridIndex] = imageUrl;
            return newUrls;
          });
          setCurrentGeneratingGrid(null);
        },
        async (taskCode, gridIndex) => {
          const taskCreatedAt = new Date().toISOString();
          const GRID_SIZE = 9;
          const startIdx = gridIndex * GRID_SIZE;
          setShots(prev => {
            if (startIdx < 0 || startIdx >= prev.length) return prev;
            const next = [...prev];
            next[startIdx] = {
              ...next[startIdx],
              storyboardGridGenerationMeta: { taskCode, taskCreatedAt, gridIndex }
            };
            void patchEpisode(currentEpisode.id, { shots: next }).catch(err => console.error(err));
            return next;
          });
        },
        currentEpisodeNumber,
        currentProject.scenes || [],
        artStyle,
        currentProject.id,
        controller.signal,
        (gridIndex, reason) => {
          setProgressMsg(`❌ 第 ${gridIndex + 1} 张生成失败：${reason}`);
        }
      );

      if (controller.signal.aborted) {
        const successCount = results.filter(r => r).length;
        setProgressMsg(`⏸️ 生成已停止：${successCount}/${totalGrids} 成功`);
      } else {
        const successCount = results.filter(r => r).length;
        if (successCount === totalGrids) {
          setProgressMsg(`✅ 生成完成！共 ${totalGrids} 张`);
        } else {
          setProgressMsg(`⚠️ 生成完成：${successCount}/${totalGrids} 成功`);
        }
      }
      setHqUrls(results);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setProgressMsg('⏸️ 生成已被取消');
      } else {
        alert("渲染失败: " + (err.message || String(err)));
      }
    } finally {
      setIsLoading(false);
      setAbortController(null);
      setGridGenerationStartTime(null);
      setCurrentGeneratingGrid(null);
    }
  };

  const stopGeneration = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const regenerateSingleGrid = async (gridIndex: number) => {
    const totalGrids = Math.ceil(shots.length / 9);
    if (gridIndex < 0 || gridIndex >= totalGrids) return alert(`无效索引: ${gridIndex + 1}`);
    if (!currentProject || currentEpisodeNumber === null) return alert('⚠️ 未选择项目/剧集');
    
    const currentEpisode = currentProject.episodes?.find(ep => ep.episodeNumber === currentEpisodeNumber);
    if (!currentEpisode) return alert('⚠️ 找不到剧集');

    setIsLoading(true);
    setProgressMsg(`正在重新生成第 ${gridIndex + 1} 张九宫格...`);

    try {
      const artStyle = detectArtStyleType(currentProject.settings.genre, currentProject.settings.visualStyle);
      const imageUrl = await generateSingleGrid(
        gridIndex, shots, characterRefs, imageModel, selectedStyle,
        currentEpisodeNumber, currentProject.scenes || [], artStyle,
        async (taskCode) => {
          const taskCreatedAt = new Date().toISOString();
          const startIdx = gridIndex * 9;
          setShots(prev => {
            if (startIdx < 0 || startIdx >= prev.length) return prev;
            const next = [...prev];
            next[startIdx] = {
              ...next[startIdx],
              storyboardGridGenerationMeta: { taskCode, taskCreatedAt, gridIndex }
            };
            void patchEpisode(currentEpisode.id, { shots: next }).catch(err => console.error(err));
            return next;
          });
        },
        currentProject.id
      );

      if (imageUrl) {
        setHqUrls(prev => {
          const newUrls = [...prev];
          newUrls[gridIndex] = imageUrl;
          return newUrls;
        });
        setProgressMsg(`✅ 第 ${gridIndex + 1} 张重新生成成功！`);
      } else {
        setProgressMsg(`❌ 第 ${gridIndex + 1} 张生成失败`);
        alert(`第 ${gridIndex + 1} 张生成失败`);
      }
    } catch (err: any) {
      alert("重新生成失败: " + (err.message || String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadGrid = async () => {
    if (uploadGridIndex === null) return;
    try {
      setIsLoading(true);
      let imageUrl = '';
      if (uploadUrl.trim()) {
        imageUrl = uploadUrl.trim();
      } else if (uploadFile) {
        if (!currentProject) return alert('⚠️ 未选择项目');
        setProgressMsg('正在上传图片到云端...');
        imageUrl = await uploadToOSS(uploadFile, `projects/${currentProject.id}/storyboard/grid_${uploadGridIndex + 1}_${Date.now()}.png`);
      } else {
        return alert('请输入URL或选择文件');
      }

      setHqUrls(prev => {
        const newUrls = [...prev];
        newUrls[uploadGridIndex] = imageUrl;
        return newUrls;
      });
      setProgressMsg(`✅ 第 ${uploadGridIndex + 1} 张九宫格上传成功！`);
      setUploadDialogOpen(false);
      setUploadGridIndex(null);
      setUploadUrl('');
      setUploadFile(null);
    } catch (err: any) {
      alert('上传失败: ' + (err.message || String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshGrid = async (gridIndex: number) => {
    const startIdx = gridIndex * 9;
    if (startIdx >= shots.length) return alert('无效索引');
    const meta = shots[startIdx]?.storyboardGridGenerationMeta;
    if (!meta?.taskCode) return alert('无任务信息');

    try {
      setIsLoading(true);
      setProgressMsg(`正在刷新第 ${gridIndex + 1} 张任务...`);
      const result = await pollGenerationResult(meta.taskCode);
      if (result.status === TaskStatus.SUCCESS && result.image_urls?.length) {
        setHqUrls(prev => {
          const newUrls = [...prev];
          newUrls[gridIndex] = result.image_urls![0];
          return newUrls;
        });
        setProgressMsg(`✅ 刷新成功！`);
      } else if (result.status === TaskStatus.FAILED) {
        alert(`失败: ${result.failure_reason}`);
      } else {
        alert('处理中请稍后');
      }
    } catch (err: any) {
      alert('刷新失败: ' + (err.message || String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const applyGridsToShots = async () => {
    if (hqUrls.filter(Boolean).length === 0) return alert('⚠️ 没有可用的九宫格图片。');
    const updatedShots = shots.map((shot, idx) => {
      const gridUrl = hqUrls[Math.floor(idx / 9)];
      if (!gridUrl) return shot;
      return {
        ...shot,
        storyboardGridUrl: gridUrl,
        storyboardGridCellIndex: idx % 9,
        storyboardGridGenerationMeta: undefined,
      };
    });
    setShots(updatedShots);

    if (!currentProject || currentEpisodeNumber === null) return alert('⚠️ 未选择项目，仅本地应用');
    const currentEpisode = currentProject.episodes?.find(ep => ep.episodeNumber === currentEpisodeNumber);
    if (!currentEpisode) return alert('⚠️ 找不到剧集，仅本地应用');

    setIsLoading(true);
    setProgressMsg('保存草图映射到云端...');
    try {
      if (currentEpisode.id) {
        await patchEpisode(currentEpisode.id, { shots: updatedShots });
      } else {
        await saveEpisode(currentProject.id, { ...currentEpisode, shots: updatedShots, updatedAt: new Date().toISOString() });
      }
      setProgressMsg('✅ 保存成功');
      setTimeout(() => setCurrentStep(AppStep.FINAL_STORYBOARD), 500);
    } catch (err: any) {
      alert('❌ 保存到云端失败: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return {
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
  };
}
