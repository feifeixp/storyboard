import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Shot, CharacterRef, VideoGroup, VideoGroupPrompt } from '../types';
import { SceneRef } from '../types/project';

/**
 * 提取角色的最佳展示图片（包含对多形态的向下兼容）
 */
function getCharacterImageUrl(char: CharacterRef | undefined | null): string | null {
  if (!char) return null;
  return char.imageSheetUrl ||
         char.referenceImageUrl ||
         (char.imageUrls && char.imageUrls[0]) ||
         (char.forms && char.forms.length > 0 && char.forms[0].imageSheetUrl) ||
         char.data ||
         null;
}

/**
 * 纯展示用：提取场景的最佳展示图片
 */
function getSceneImageUrl(scene: SceneRef | undefined | null): string | null {
  if (!scene) return null;
  return scene.imageSheetUrl ||
         (scene.imageUrls && scene.imageUrls[0]) ||
         null;
}

import {
  groupShotsBySceneAndDuration, // Keep original utility functions
  generateAllVideoGroupPrompts, // Keep original utility functions
  getShotStoryBeat,
} from '../src/utils/videoGrouping';
import { createVideoTask, pollVideoTask, VideoTaskStatus, VideoContentItem } from '../src/services/aiVideoGeneration';
import { uploadToOSS, generateOSSPath } from '../services/oss';
import { downloadFile } from '../src/utils/download'; // 🆕 直接下载工具 // 🆕 新增 OSS 上传
import { rewriteSensitivePrompt } from '../services/openrouter'; // 🆕 敏感词拦截后自动重写
// 静态导入（避免动态 import chunk 在 Cloudflare Pages 部署时因 MIME 类型错误导致加载失败）
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface FinalStoryboardProps {
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  characterRefs: CharacterRef[];
  scenes?: SceneRef[]; // 🆕 新增可选项：当前项目中的场景数据
  setCurrentStep: (step: number) => void;
  currentProject: any;
  episodeNumber: number | null;
  projectName?: string;
  episodeTitle?: string;
  script?: string;
  saveEpisode: (projectId: string, episode: any) => Promise<void>;
  onBack: () => void; // Keep onBack as it's used in the component
}

type ViewMode = 'original' | 'grouped';

/**
 * 最终故事板预览组件
 * - 将九宫格图片虚拟切割为独立镜头
 * - 支持分组视图（按场景和时长限制分组）
 * - 美观的卡片布局展示
 * - 支持导出 JSON、CSV、MD、PDF
 */
export function FinalStoryboard({
  shots,
  setShots,
  characterRefs,
  scenes = [], // 默认空数组
  setCurrentStep, // Added as per instruction
  currentProject,
  episodeNumber,
  episodeTitle, // Added as per instruction
  script = '', // Added as per instruction
  saveEpisode,
  onBack, // Kept onBack
}: FinalStoryboardProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const storyboardRef = useRef<HTMLDivElement>(null);

  // ---------- 开始视频生成状态管理 ----------
  const [generatingGroupIds, setGeneratingGroupIds] = useState<Set<string>>(new Set());
  const [uploadingRefGroupId, setUploadingRefGroupId] = useState<string | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false); // 🆕 智能并行批量模式
  const [videoModel, setVideoModel] = useState<'doubao-seedance-2-0-260128' | 'doubao-seedance-2-0-fast-260128'>('doubao-seedance-2-0-260128'); // 🆕 模型选择

  // 批量生成处理器已经移到下方

  // 🆕 使用 useRef 追踪最新的 shots，防止异步回调中出现 stale closure 导致数据覆盖
  const latestShotsRef = useRef(shots);
  useEffect(() => {
    latestShotsRef.current = shots;
  }, [shots]);

  // 生成分组数据
  const { videoGroups, videoGroupPrompts } = useMemo(() => {
    const groups = groupShotsBySceneAndDuration(shots, scenes, 15);
    const prompts = generateAllVideoGroupPrompts(groups);
    return { videoGroups: groups, videoGroupPrompts: prompts };
  }, [shots, scenes]);

  // 检查某个分组是否可以立刻生成（依赖解析）
  const checkDependency = (groupIndex: number): { status: 'ready' | 'pending'; waitGroupName?: string } => {
    if (groupIndex === 0) return { status: 'ready' };
    const group = videoGroups[groupIndex];
    if (group.shots[0]?.shot?.videoUrl) return { status: 'ready' }; // 已经生成好了

    const prevGroup = videoGroups[groupIndex - 1];
    
    const isSameScene = prevGroup.sceneId && group.sceneId && prevGroup.sceneId === group.sceneId;
    const prevCharIds = new Set(prevGroup.shots.flatMap(s => s.shot.assignedCharacterIds || []));
    const currCharIds = new Set(group.shots.flatMap(s => s.shot.assignedCharacterIds || []));
    const hasCommonChar = [...currCharIds].some(id => prevCharIds.has(id));

    // 如果与上一组有关联，则必须等上一组生成完毕
    if (isSameScene || hasCommonChar) {
      if (!prevGroup.shots[0]?.shot?.videoUrl) {
         return { status: 'pending', waitGroupName: prevGroup.groupName };
      }
    }
    return { status: 'ready' };
  };

  const CONCURRENCY_LIMIT = 3; // 🚀 最大并发数

  // 🤖 智能并行批量调度器
  useEffect(() => {
    if (!isBatchMode) return;

    // 过滤出未生成且当前不在生成池里的任务
    const ungeneratedIndices = videoGroups
      .map((g, idx) => ({ group: g, idx }))
      .filter(({ group }) => !group.shots[0]?.shot?.videoUrl && !generatingGroupIds.has(group.id));

    if (ungeneratedIndices.length === 0 && generatingGroupIds.size === 0) {
      // 队列全部消费完毕！
      setIsBatchMode(false);
      alert('🎉 批量视频生成队列执行完成！');
      return;
    }

    if (ungeneratedIndices.length === 0 && generatingGroupIds.size > 0) {
       // 等待最后几个任务走完
       return;
    }

    // 从未生成的任务中，挑选出满足依赖条件（Ready）的任务
    const readyIndices = ungeneratedIndices.filter(({ idx }) => checkDependency(idx).status === 'ready');

    if (readyIndices.length === 0 && generatingGroupIds.size === 0) {
      // 没有任何生成任务在跑，但剩下的全在 pending... 死锁（或者上一组发生报错弹窗拦截了）
      setIsBatchMode(false);
      console.warn('队列中止：没有可以继续并行的任务（可能是前置任务报错失败拦截，或缺乏参考图导致死锁）');
      return;
    }

    // 开始把 Ready 任务塞满并发池
    const availableSlots = CONCURRENCY_LIMIT - generatingGroupIds.size;
    if (availableSlots > 0 && readyIndices.length > 0) {
      const toStart = readyIndices.slice(0, availableSlots);
      toStart.forEach(({ group }) => {
        const prompt = videoGroupPrompts.find(p => p.groupId === group.id);
        if (prompt) {
          handleGenerateGroup(group, prompt.fullPromptCn).catch(err => {
             console.error(`Group ${group.groupName} failed parsing visual inputs:`, err);
             // handleGenerateGroup 内部抛出错误会触发 alert。我们可以静默吃掉这边的 rejection 让外层 useEffect 下一次能处理死锁
          });
        }
      });
    }

  }, [isBatchMode, generatingGroupIds, videoGroups, videoGroupPrompts]);

  // 从提示词提取引用角色和场景并转换成 API 格式 (多模态参考)
  const extractContentList = (promptText: string, group?: VideoGroup): VideoContentItem[] => {
    const content: VideoContentItem[] = [];
    content.push({ type: 'text', text: promptText });

    const addedImageUrls = new Set<string>();

    // 提取角色
    if (characterRefs && characterRefs.length > 0) {
      // 匹配 @角色名 语法，例如 @林溪
      const matchRegex = /@([^\s，。、！@:：]+)/g;
      const matches = [...promptText.matchAll(matchRegex)].map(m => m[1].trim());
      const activeCharNames = new Set(matches);

      activeCharNames.forEach(charName => {
        const char = characterRefs.find(c => c.name === charName);
        if (char) {
          let url = getCharacterImageUrl(char);
          
          // 🆕 如果在当前组手动指定了形态，则用其覆盖
          if (group && group.shots[0]?.shot.selectedCharacterForms?.[char.id]) {
            const formId = group.shots[0].shot.selectedCharacterForms[char.id];
            const form = char.forms?.find(f => f.id === formId);
            if (form && form.imageSheetUrl) {
              url = form.imageSheetUrl;
            }
          }

          if (url && !addedImageUrls.has(url)) {
            addedImageUrls.add(url);
            content.push({
              type: 'image_url',
              role: 'reference_image',
              image_url: { url }
            });
          }
        }
      });
    }

    // 提取场景
    if (scenes && scenes.length > 0) {
      scenes.forEach(scene => {
        if (promptText.includes(scene.name)) {
          const url = getSceneImageUrl(scene);
          if (url && !addedImageUrls.has(url)) {
            addedImageUrls.add(url);
            content.push({
              type: 'image_url',
              role: 'reference_image',
              image_url: { url }
            });
          }
        }
      });
    }

    return content;
  };

  const updateGroupStatus = (group: VideoGroup, status: 'generating' | 'error' | 'completed' | 'pending', errorMessage?: string) => {
    const shotIds = new Set(group.shots.map(s => s.shot.id));
    setShots(latestShotsRef.current.map(s => shotIds.has(s.id) ? { ...s, status, errorMessage } : s));
  };

  const updateGroupMeta = (group: VideoGroup, meta: any) => {
    const shotIds = new Set(group.shots.map(s => s.shot.id));
    setShots(latestShotsRef.current.map(s => shotIds.has(s.id) ? { ...s, videoGenerationMeta: meta } : s));
  };

  const updateGroupComplete = (group: VideoGroup, videoUrl: string, taskCompletedAt?: string, taskDurationMs?: number) => {
     const shotIds = new Set(group.shots.map(s => s.shot.id));
     const nextShots = latestShotsRef.current.map(s => {
       if (shotIds.has(s.id)) {
         const newMeta = s.videoGenerationMeta 
           ? { ...s.videoGenerationMeta, taskCompletedAt, taskDurationMs } 
           : s.videoGenerationMeta;
         return { ...s, status: 'completed' as const, videoUrl, videoGenerationMeta: newMeta };
       }
       return s;
     });
     setShots(nextShots);
     handleSaveEpisodes(nextShots);
  };

  // 批量生成处理器已经移到下方

  // 🆕 计算分组的依赖状态
  const getGroupDependency = (groupIdx: number) => {
    if (groupIdx === 0) return null;
    const group = videoGroups[groupIdx];
    const prevGroup = videoGroups[groupIdx - 1];
    
    const prevHasSameScene = group.sceneId && prevGroup.sceneId === group.sceneId;
    const prevCharNames = new Set(
      prevGroup.shots.flatMap(s => s.shot.assignedCharacterIds || [])
        .map(id => characterRefs.find(c => c.id === id)?.name)
        .filter(Boolean)
    );
    const currCharNames = new Set(
      group.shots.flatMap(s => s.shot.assignedCharacterIds || [])
        .map(id => characterRefs.find(c => c.id === id)?.name)
        .filter(Boolean)
    );
    const hasOverlappingChars = [...currCharNames].some(name => prevCharNames.has(name));
    
    if (prevHasSameScene || hasOverlappingChars) {
      const isPending = !prevGroup.shots[0].shot.videoUrl;
      return { 
        pending: isPending, 
        groupName: prevGroup.groupName || `分组 ${groupIdx}` 
      };
    }
    return null;
  };

  const handleSaveEpisodes = async (updatedShots: Shot[]) => {
    if (currentProject && episodeNumber !== null) {
      const currentEpisode = currentProject.episodes?.find((ep: any) => ep.episodeNumber === episodeNumber);
      if (currentEpisode) {
          const updatedEpisode = {
              ...currentEpisode,
              script,
              shots: updatedShots,
              updatedAt: new Date().toISOString(),
          };
          await saveEpisode(currentProject.id, updatedEpisode);
      }
    }
  };

  const handleUploadCustomRef = async (groupId: string, file: File) => {
    if (!currentProject) {
      alert('未找到当前项目，无法上传');
      return;
    }
    setUploadingRefGroupId(groupId);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const isVideo = ext.match(/mp4|mov|webm/i);
      const ossPath = generateOSSPath(currentProject.id, `ref_${Date.now()}`, isVideo ? 'video' : 'image', ext);
      const url = await uploadToOSS(file, ossPath);
      
      const group = videoGroups.find(g => g.id === groupId);
      if (!group) return;
      const firstShotId = group.shots[0].shot.id;
      
      const nextShots = latestShotsRef.current.map(s => {
        if (s.id === firstShotId) {
          return {
            ...s,
            customVideoReferences: [...(s.customVideoReferences || []), url]
          };
        }
        return s;
      });
      setShots(nextShots);
      await handleSaveEpisodes(nextShots);
    } catch (e: any) {
      console.error('上传参考文件失败:', e);
      alert('上传参考文件失败: ' + e.message);
    } finally {
      setUploadingRefGroupId(null);
    }
  };

  const handleRemoveCustomRef = async (groupId: string, urlToRemove: string) => {
    const group = videoGroups.find(g => g.id === groupId);
    if (!group) return;
    const firstShotId = group.shots[0].shot.id;
    
    const nextShots = latestShotsRef.current.map(s => {
      if (s.id === firstShotId && s.customVideoReferences) {
        return {
          ...s,
          customVideoReferences: s.customVideoReferences.filter(r => r !== urlToRemove)
        };
      }
      return s;
    });
    setShots(nextShots);
    await handleSaveEpisodes(nextShots);
  };

  const handleSetCharacterForm = async (groupId: string, charId: string, formId?: string) => {
    const group = videoGroups.find(g => g.id === groupId);
    if (!group) return;
    const firstShotId = group.shots[0].shot.id;
    
    const nextShots = latestShotsRef.current.map(s => {
      if (s.id === firstShotId) {
        const nextForms = { ...(s.selectedCharacterForms || {}) };
        if (formId) {
          nextForms[charId] = formId;
        } else {
          delete nextForms[charId];
        }
        return { ...s, selectedCharacterForms: nextForms };
      }
      return s;
    });
    setShots(nextShots);
    await handleSaveEpisodes(nextShots);
  };

  const handleGenerateGroup = async (group: VideoGroup, promptText: string, isAutoRetry = false) => {
    let shouldCleanup = true;
    setGeneratingGroupIds(prev => new Set(prev).add(group.id));
    updateGroupStatus(group, 'generating', isAutoRetry ? '提示词已净化，正在重新生成...' : undefined);

    try {
      const model = videoModel;
      const contentList = extractContentList(promptText, group);

      // 0. 注入分镜草图参考（九宫格）
      const storyboardUrl = group.shots[0]?.shot.storyboardGridUrl;
      if (storyboardUrl) {
          contentList.push({
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: storyboardUrl }
          });
      }

      // 1. 注入上一组生成的视频作为参考（如果紧密衔接）
      const groupIndex = videoGroups.findIndex(g => g.id === group.id);
      if (groupIndex > 0) {
        const prevGroup = videoGroups[groupIndex - 1];
        const prevVideoUrl = prevGroup.shots[0]?.shot.videoUrl;
        
        if (prevVideoUrl) {
          let isConnected = false;
          if (group.sceneId && group.sceneId === prevGroup.sceneId) {
            isConnected = true;
          } else {
            const charRegex = /@([^\s，。、！@:：]+)/g;
            const currentChars = new Set([...promptText.matchAll(charRegex)].map(m => m[1].trim()));
            const prevPrompt = videoGroupPrompts.find(p => p.groupId === prevGroup.id)?.fullPromptCn || '';
            const prevChars = new Set([...prevPrompt.matchAll(charRegex)].map(m => m[1].trim()));
            for (const char of currentChars) {
              if (prevChars.has(char)) {
                isConnected = true; break;
              }
            }
          }
          if (isConnected) {
            contentList.push({
              type: 'video_url',
              role: 'reference_video',
              video_url: { url: prevVideoUrl }
            });
          }
        }
      }

      // 2. 注入手动上传的自定义参考
      const customRefs = new Set<string>();
      group.shots.forEach(s => {
        if (s.shot.customVideoReferences) {
          s.shot.customVideoReferences.forEach(ref => customRefs.add(ref));
        }
      });
      customRefs.forEach(url => {
        const isVideo = url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov') || url.toLowerCase().includes('.webm');
        const mediaType = isVideo ? 'video_url' : 'image_url';
        contentList.push({
          type: mediaType,
          role: isVideo ? 'reference_video' : 'reference_image',
          [mediaType]: { url }
        } as any);
      });

      // 3. 自由生成 (不再强制视觉参考，支持纯文生视频)

      const targetDuration = Math.min(15, Math.max(4, Math.round(group.totalDuration)));
      
      const res = await createVideoTask({
        model,
        content: contentList,
        generate_audio: true,
        ratio: '16:9',
        duration: targetDuration,
      });

      const taskCreatedAt = new Date().toISOString();
      updateGroupMeta(group, {
        taskCode: res.id,
        taskCreatedAt,
        model,
        duration: targetDuration,
        contentList, // 🆕 将生成时所用的完整输入记录下来
      });

      const finalResult = await pollVideoTask(res.id);

      const taskCompletedAt = new Date().toISOString();
      const taskDurationMs = new Date(taskCompletedAt).getTime() - new Date(taskCreatedAt).getTime();

      if (finalResult.status === VideoTaskStatus.SUCCEEDED && finalResult.content?.video_url) {
        updateGroupComplete(group, finalResult.content.video_url, taskCompletedAt, taskDurationMs);
      } else {
        throw new Error(finalResult.error?.message || '视频生成失败');
      }
    } catch (err: any) {
        console.error('视频生成异常:', err);
        const errMsg = err.message || '';
        
        // 🆕 敏感词拦截自动重试逻辑 (只有首次失败且明确是内容敏感时触发)
        if (!isAutoRetry && (errMsg.includes('sensitive') || errMsg.includes('敏感词') || errMsg.includes('审核'))) {
          try {
            console.log(`[敏感词拦截] 尝试自动重写提示词: ${group.groupName}`);
            updateGroupStatus(group, 'generating', `触发敏感词拦截，正在使用AI自动重写净化的提示词...`);
            shouldCleanup = false; // 让递归调用的函数去清理 loading 状态
            
            const sanitizedPrompt = await rewriteSensitivePrompt(promptText);
            
            console.log(`[敏感词净化完毕] 再次下发任务...`);
            handleGenerateGroup(group, sanitizedPrompt, true);
            return;
          } catch (rewriteErr) {
             console.error('提示词净化失败:', rewriteErr);
             shouldCleanup = true;
          }
        }

        updateGroupStatus(group, 'error', errMsg);
    } finally {
        if (shouldCleanup) {
          setGeneratingGroupIds(prev => {
            const next = new Set(prev);
            next.delete(group.id);
            return next;
          });
        }
    }
  };

  // 检查是否有九宫格数据或视频生成提示词
  const hasStoryboardData = shots.some(shot => shot.storyboardGridUrl || shot.videoPromptCn);

  if (!hasStoryboardData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold text-yellow-400 mb-4">⚠️ 暂无故事板数据</h2>
            <p className="text-gray-300 mb-6">请先生成九宫格图片并应用到分镜表</p>
            <button
              onClick={onBack}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all"
            >
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== 导出函数 ====================

  // 导出为 JSON
  const exportJSON = () => {
    const data = {
      meta: {
        project: episodeTitle || '未命名项目', // Changed projectName to episodeTitle
        episode: episodeNumber,
        totalShots: shots.length,
        totalGroups: videoGroups.length,
      },
      shots: shots.map(shot => ({
        shotNumber: shot.shotNumber,
        storyBeat: typeof shot.storyBeat === 'string' ? shot.storyBeat : shot.storyBeat.event,
        dialogue: shot.dialogue,
        shotSize: shot.shotSize,
        angleDirection: shot.angleDirection,
        angleHeight: shot.angleHeight,
        cameraMove: shot.cameraMove,
        duration: shot.duration,
        foreground: shot.foreground,
        midground: shot.midground,
        background: shot.background,
        lighting: shot.lighting,
        sceneId: shot.sceneId,
      })),
      groups: videoGroups.map(group => ({
        groupId: group.id,
        groupName: group.groupName,
        sceneId: group.sceneId,
        sceneName: group.sceneName,
        totalDuration: group.totalDuration,
        shotNumbers: group.shots.map(s => s.shotNumber),
        videoPrompt: videoGroupPrompts.find(p => p.groupId === group.id)?.fullPromptCn || '',
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard_ep${episodeNumber || 'unknown'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出为 CSV（按分组组织）
  const exportCSV = () => {
    // 生成多Sheet的CSV内容（用分隔符区分分组）
    const csvContent: string[] = [];

    // 第一部分：摘要信息
    csvContent.push('===== 故事板摘要 =====');
    csvContent.push(`项目名称,${episodeTitle || '未命名项目'}`); // Changed projectName to episodeTitle
    csvContent.push(`集数,第${episodeNumber || '?'}集`);
    csvContent.push(`镜头总数,${shots.length}`);
    csvContent.push(`分组数量,${videoGroups.length}`);
    csvContent.push('');

    // 第二部分：分组视图（每个分组一张表）
    csvContent.push('===== 视频分组视图（每个视频不超过15秒）=====');
    csvContent.push('');

    for (const group of videoGroups) {
      const prompt = videoGroupPrompts.find(p => p.groupId === group.id);
      csvContent.push(`--- 分组: ${group.groupName} (${group.totalDuration.toFixed(1)}秒) ---`);
      csvContent.push('');

      // 分组信息
      csvContent.push('分组信息');
      csvContent.push(`分组ID,${group.id}`);
      csvContent.push(`场景名称,${group.sceneName || '无'}`);
      csvContent.push(`时长,${group.totalDuration.toFixed(1)}秒`);
      csvContent.push(`镜头数量,${group.shots.length}`);
      csvContent.push('');

      // 视频提示词
      if (prompt) {
        csvContent.push('视频生成提示词（Seedance 2.0规范）');
        csvContent.push(`提示词,"${prompt.timelineScript.replace(/"/g, '""').replace(/\n/g, ' ')}"`);
        csvContent.push('');
      }

      // 该分组的镜头详情
      csvContent.push('镜头详情');
      csvContent.push('编号,起始秒,结束秒,剧情描述,对话,景别,角度朝向,角度高度,运镜,时长,图片提示词,尾帧提示词');
      for (const shotRange of group.shots) {
        const shot = shotRange.shot;
        const storyBeat = getShotStoryBeat(shot);
        csvContent.push([
          shot.shotNumber,
          shotRange.startSecond.toFixed(1),
          shotRange.endSecond.toFixed(1),
          storyBeat,
          shot.dialogue || '',
          shot.shotSize,
          shot.angleDirection,
          shot.angleHeight,
          shot.cameraMove,
          shot.duration,
          shot.imagePromptCn || '',
          shot.endImagePromptCn || '',
        ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
      }
      csvContent.push('');
    }

    // 第三部分：原始镜头列表（完整视图）
    csvContent.push('===== 原始镜头列表（完整视图）=====');
    csvContent.push('');
    csvContent.push('编号,分组ID,剧情描述,对话,景别,角度朝向,角度高度,运镜,时长,图片提示词,尾帧提示词,视频提示词');
    for (const shot of shots) {
      const storyBeat = getShotStoryBeat(shot);
      const group = videoGroups.find(g => g.shots.some(s => s.shot.id === shot.id));
      csvContent.push([
        shot.shotNumber,
        group?.id || '',
        storyBeat,
        shot.dialogue || '',
        shot.shotSize,
        shot.angleDirection,
        shot.angleHeight,
        shot.cameraMove,
        shot.duration,
        shot.imagePromptCn || '',
        shot.endImagePromptCn || '',
        shot.videoGenPrompt || '',
      ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
    }

    const blob = new Blob(['\ufeff' + csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard_grouped_ep${episodeNumber || 'unknown'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出为 Markdown（按分组组织）
  const exportMarkdown = () => {
    const title = `# 故事板 - ${episodeTitle || '未命名项目'} - 第${episodeNumber || '?'}集\n\n`; // Changed projectName to episodeTitle
    const summary = `## 摘要信息\n\n- **镜头总数**: ${shots.length}\n- **分组数量**: ${videoGroups.length}（每个视频不超过15秒）\n\n---\n\n`;

    // 角色设定部分
    let characterSection = '';
    if (characterRefs.length > 0) {
      characterSection = `## 角色设定\n\n`;
      characterSection += characterRefs.map(char => {
        let charInfo = `### ${char.name}`;
        if (char.gender && char.gender !== '未知') charInfo += `（${char.gender}）`;
        charInfo += `\n\n`;
        if (char.appearance) charInfo += `- **外貌**: ${char.appearance}\n`;
        if (char.ageGroup) charInfo += `- **年龄段**: ${char.ageGroup}\n`;
        if (char.quote) charInfo += `- **经典台词**: ${char.quote}\n`;
        if (char.identityEvolution) charInfo += `- **身份演变**: ${char.identityEvolution}\n`;
        if (char.abilities && char.abilities.length > 0) charInfo += `- **核心能力**: ${char.abilities.join('、')}\n`;
        return charInfo;
      }).join('\n');
      characterSection += `\n---\n\n`;
    }

    // 场景设定部分
    let sceneSection = '';
    if (scenes.length > 0) {
      sceneSection = `## 场景设定\n\n`;
      sceneSection += scenes.map(scene => {
        let sceneInfo = `### ${scene.name}\n\n`;
        if (scene.description) sceneInfo += `- **描述**: ${scene.description}\n`;
        if (scene.visualPromptCn) sceneInfo += `- **视觉提示**: ${scene.visualPromptCn}\n`;
        if (scene.atmosphere) sceneInfo += `- **氛围**: ${scene.atmosphere}\n`;
        if (scene.appearsInEpisodes && scene.appearsInEpisodes.length > 0) {
          sceneInfo += `- **出现集数**: 第${scene.appearsInEpisodes.join('、')}集\n`;
        }
        return sceneInfo;
      }).join('\n');
      sceneSection += `\n---\n\n`;
    }

    // 分组视图部分
    let groupedSection = `## 视频分组视图\n\n`;
    groupedSection += `> 分组规则：按场景优先分组，每组时长不超过15秒，遵循 Seedance 2.0 视频生成规范\n\n`;

    for (const group of videoGroups) {
      const prompt = videoGroupPrompts.find(p => p.groupId === group.id);

      groupedSection += `### ${group.groupName}\n\n`;
      groupedSection += `- **分组ID**: ${group.id}\n`;
      groupedSection += `- **场景**: ${group.sceneName || '无'}\n`;
      groupedSection += `- **时长**: ${group.totalDuration.toFixed(1)}秒\n`;
      groupedSection += `- **镜头数量**: ${group.shots.length}（${group.shots.map(s => s.shotNumber).join(', ')}）\n\n`;

      // 视频生成提示词
      if (prompt) {
        groupedSection += `#### 📹 视频生成提示词（Seedance 2.0）\n\n`;
        groupedSection += '```\n' + prompt.timelineScript + '\n```\n\n';
      }

      // 该组镜头详情
      groupedSection += `#### 镜头详情\n\n`;
      for (const shotRange of group.shots) {
        const shot = shotRange.shot;
        const storyBeat = getShotStoryBeat(shot);

        groupedSection += `**镜头 ${shot.shotNumber}** (${shotRange.startSecond.toFixed(0)}-${shotRange.endSecond.toFixed(0)}秒)\n\n`;
        groupedSection += `- **剧情**: ${storyBeat}\n`;
        if (shot.dialogue) groupedSection += `- **对话**: "${shot.dialogue}"\n`;
        groupedSection += `- **景别**: ${shot.shotSize}\n`;
        groupedSection += `- **角度**: ${shot.angleDirection} ${shot.angleHeight}\n`;
        groupedSection += `- **运镜**: ${shot.cameraMove}\n`;
        if (shot.imagePromptCn) groupedSection += `- **图片提示词**: ${shot.imagePromptCn}\n`;
        if (shot.endImagePromptCn) groupedSection += `- **尾帧提示词**: ${shot.endImagePromptCn}\n`;
        groupedSection += '\n';
      }
      groupedSection += `---\n\n`;
    }

    // 原始镜头列表
    let originalSection = `## 原始镜头列表（完整）\n\n`;
    for (const shot of shots) {
      const storyBeat = getShotStoryBeat(shot);
      const group = videoGroups.find(g => g.shots.some(s => s.shot.id === shot.id));

      let promptSection = '';
      if (shot.imagePromptCn) {
        promptSection += `- **图片提示词**: ${shot.imagePromptCn}\n`;
      }
      if (shot.endImagePromptCn) {
        promptSection += `- **尾帧提示词**: ${shot.endImagePromptCn}\n`;
      }
      if (shot.videoGenPrompt) {
        promptSection += `- **视频提示词**: ${shot.videoGenPrompt}\n`;
      }

      originalSection += `### 镜头 ${shot.shotNumber} ${group ? `(归属: ${group.groupName})` : ''}\n\n` +
        `- **剧情**: ${storyBeat}\n` +
        `- **对话**: ${shot.dialogue || '无'}\n` +
        `- **景别**: ${shot.shotSize}\n` +
        `- **角度**: ${shot.angleDirection} ${shot.angleHeight}\n` +
        `- **运镜**: ${shot.cameraMove}\n` +
        `- **时长**: ${shot.duration}\n` +
        `- **构图**:\n` +
        `  - 前景: ${shot.foreground}\n` +
        `  - 中景: ${shot.midground}\n` +
        `  - 后景: ${shot.background}\n` +
        `- **光影**: ${shot.lighting}\n` +
        (promptSection ? `\n### 提示词\n\n${promptSection}` : '') +
        `\n---\n\n`;
    }

    const blob = new Blob([title + summary + characterSection + sceneSection + groupedSection + originalSection], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard_grouped_ep${episodeNumber || 'unknown'}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * 导出为 PDF（html2canvas + jsPDF）
   * 支持按分组导出，每组占一页或连续多页
   */
  const exportPDF = async () => {
    setIsExporting(true);
    try {
      if (!storyboardRef.current) {
        throw new Error('未找到故事板容器节点');
      }

      // 让浏览器有机会完成图片加载与布局
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      const canvas = await html2canvas(storyboardRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let remainingHeight = imgHeight;
      let y = 0;
      let pageIndex = 0;

      while (remainingHeight > 0) {
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, y, pdfWidth, imgHeight);
        remainingHeight -= pageHeight;
        y -= pageHeight;
        pageIndex += 1;
        if (pageIndex > 200) break;
      }

      const filename = `storyboard_grouped_ep${episodeNumber || 'unknown'}_${Date.now()}.pdf`;
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF导出失败:', error);
      const msg = String((error as any)?.message || error);
      const isCorsLike = /tainted|cross-origin|cors|toDataURL/i.test(msg);
      alert(
        isCorsLike
          ? 'PDF导出失败：图片域名可能未开启 CORS，导致浏览器禁止将图片渲染导出。请为图片存储域名配置 Access-Control-Allow-Origin 后重试。'
          : 'PDF导出失败，请重试（如内容过长可尝试减少镜头数量或稍后重试）。'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f111a] p-4 md:p-8">
      {/* 动态背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* 悬浮控制栏 Header */}
        <div className="sticky top-4 z-50 mb-8 p-4 md:p-6 bg-[#1a1b26]/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:bg-[#1a1b26]/80">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={onBack}
                className="px-3 py-1.5 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 hover:text-white transition-all border border-white/5 flex items-center gap-2 group"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span> 返回
              </button>
              <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400">
                📋 最终故事板预览
              </h1>
            </div>
            <p className="text-sm md:text-base text-gray-400 mt-1">
              {episodeTitle || '未命名项目'} - 第{episodeNumber || '?'}集 - 共 <span className="text-white font-medium">{shots.length}</span> 个镜头 · <span className="text-white font-medium">{videoGroups.length}</span> 个视频分组
            </p>
          </div>

          {/* 顶层右侧区：视图切换 + 导出按钮 */}
          <div className="flex flex-col items-end gap-3 w-full md:w-auto">
            {/* 视图模式切换 Pill */}
            <div className="flex items-center bg-black/40 rounded-full p-1 border border-white/5">
              <button
                onClick={() => setViewMode('original')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${viewMode === 'original'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
              >
                🎬 分镜列表
              </button>
              <button
                onClick={() => setViewMode('grouped')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${viewMode === 'grouped'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
              >
                📦 分组视频
              </button>
            </div>

            {/* 导出按钮组 */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportJSON}
                disabled={isExporting}
                className="px-3 py-1.5 text-sm font-medium bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-all disabled:opacity-50 border border-blue-500/20 hover:border-blue-500/40"
              >
                📄 JSON
              </button>
              <button
                onClick={exportCSV}
                disabled={isExporting}
                className="px-3 py-1.5 text-sm font-medium bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-all disabled:opacity-50 border border-green-500/20 hover:border-green-500/40"
              >
                📊 CSV
              </button>
              <button
                onClick={exportMarkdown}
                disabled={isExporting}
                className="px-3 py-1.5 text-sm font-medium bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-all disabled:opacity-50 border border-amber-500/20 hover:border-amber-500/40"
              >
                📝 MD
              </button>
              <button
                onClick={exportPDF}
                disabled={isExporting}
                className="px-3 py-1.5 text-sm font-medium bg-rose-500/10 text-rose-400 rounded-lg hover:bg-rose-500/20 transition-all disabled:opacity-50 border border-rose-500/20 hover:border-rose-500/40 flex items-center gap-1"
              >
                {isExporting ? (
                  <><div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin"></div> 导出中</>
                ) : '📕 PDF'}
              </button>
              {/* 🆕 一键并行批量生成按钮 (仅在分组模式下显示) */}
            {viewMode === 'grouped' && (() => {
               const ungeneratedCount = videoGroups.filter(g => !g.shots[0]?.shot?.videoUrl).length;
               const estimatedMins = Math.ceil(ungeneratedCount / CONCURRENCY_LIMIT) * (videoModel.includes('fast') ? 1.0 : 1.5);
               
               return (
                 <div className="flex items-center gap-2 ml-2">
                   {/* 🆕 模型选择下拉 */}
                   <select
                     value={videoModel}
                     onChange={(e) => setVideoModel(e.target.value as any)}
                     disabled={isBatchMode}
                     className="bg-black/60 border border-white/20 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                     title="选择视频生成模型 (Fast 模型生成更快但质量稍逊)"
                   >
                     <option value="doubao-seedance-2-0-260128">Normal (画质优先)</option>
                     <option value="doubao-seedance-2-0-fast-260128">Fast (速度优先)</option>
                   </select>

                   <button
                     onClick={() => {
                       if (isBatchMode) {
                         setIsBatchMode(false);
                       } else {
                         if (ungeneratedCount === 0) {
                           alert('所有分组均已生成视频！');
                           return;
                         }
                         setIsBatchMode(true);
                       }
                     }}
                     className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 shadow-lg border ${isBatchMode ? 'bg-red-500/20 text-red-500 border-red-500/30 hover:bg-red-500/30' : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-400/30 hover:shadow-orange-500/25 h-[38px]'}`}
                   >
                     {isBatchMode ? (
                       <>⏹ 停止智能批量任务 (剩 {ungeneratedCount} 组)</>
                     ) : (
                       <>🚀 批量智能生成 (约 {estimatedMins.toFixed(1)} 分）</>
                     )}
                   </button>
                 </div>
               );
            })()}
            </div>
          </div>
        </div>

        {/* 故事板内容主体 */}
        <div ref={storyboardRef} className="bg-[#12141c] p-6 lg:p-8 rounded-2xl border border-white/5 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
          {viewMode === 'original' ? (
            /* 原始视图 */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
              {shots.map((shot, idx) => (
                <StoryboardCard key={shot.id} shot={shot} index={idx} characterRefs={characterRefs} scenes={scenes} isExporting={isExporting} />
              ))}
            </div>
          ) : (
            /* 分组视图 */
            <div className="space-y-12">
              {videoGroups.map((group, groupIdx) => {
                const prompt = videoGroupPrompts.find(p => p.groupId === group.id);
                const dependencyInfo = checkDependency(groupIdx);
                
                return (
                  <VideoGroupCard
                    key={`group-${prompt ? prompt.groupId : groupIdx}`}
                    group={group}
                    prompt={prompt}
                    groupIndex={groupIdx}
                    characterRefs={characterRefs}
                    scenes={scenes}
                    isExporting={isExporting}
                    isGenerating={generatingGroupIds.has(group.id)}
                    isUploadingRef={uploadingRefGroupId === group.id}
                    dependencyInfo={dependencyInfo}
                    onGenerateVideo={() => prompt && handleGenerateGroup(group, prompt.fullPromptCn)}
                    onUploadCustomReference={(file) => handleUploadCustomRef(group.id, file)}
                    onRemoveCustomReference={(url) => handleRemoveCustomRef(group.id, url)}
                    onSetCharacterForm={(groupId, charId, formId) => handleSetCharacterForm(groupId, charId, formId)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 单个故事板卡片组件 (Premium Style)
 */
function StoryboardCard({ shot, index, characterRefs, scenes, isExporting }: { shot: Shot; index: number; characterRefs: CharacterRef[]; scenes?: SceneRef[]; isExporting?: boolean; }) {
  const storyBeat = getShotStoryBeat(shot);

  return (
    <div className="group relative rounded-xl overflow-hidden bg-[#1a1d2d]/80 backdrop-blur-md border border-white/10 hover:border-purple-500/50 shadow-lg hover:shadow-[0_8px_30px_rgba(139,92,246,0.15)] transition-all duration-300 hover:-translate-y-1 flex flex-col h-full">
      {/* 顶部指示条 */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-600 opacity-50 group-hover:opacity-100 transition-opacity z-10"></div>

      {/* 镜头编号 (角标风格) */}
      <div className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-md border border-white/10 text-white px-2 py-1 rounded text-xs font-mono font-bold shadow-lg">
        SHOT {shot.shotNumber.toString().padStart(3, '0')}
      </div>

      {/* 图片 - 虚拟切割/文本 显示 */}
      <div className={`relative bg-black w-full ${(!isExporting || shot.storyboardGridUrl) ? 'pt-[56.25%]' : 'min-h-[220px]'}`}>
        {shot.storyboardGridUrl && typeof shot.storyboardGridCellIndex === 'number' ? (
          <div className="absolute inset-0 group-hover:scale-[1.02] transition-transform duration-500">
            <GridCellImage gridUrl={shot.storyboardGridUrl} cellIndex={shot.storyboardGridCellIndex} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1d2d]/90 via-transparent to-black/20 pointer-events-none"></div>
          </div>
        ) : shot.videoPromptCn ? (
          <div className={`bg-gray-900 border-b border-white/5 p-5 flex flex-col justify-start gap-3 ${isExporting ? 'h-full flex-grow' : 'absolute inset-0 overflow-y-auto custom-scrollbar'}`}>
            <div className="flex flex-col gap-2 flex-grow">
              <div className="text-xs text-amber-500/80 font-bold border-b border-amber-500/10 pb-1 inline-block w-max">📖 分镜剧情</div>
              <div className={`text-sm text-gray-200 leading-relaxed font-medium drop-shadow-md whitespace-pre-wrap`}>
                {storyBeat}
              </div>
            </div>
            {shot.dialogue && (
              <div className="flex flex-col gap-1.5 mt-auto">
                <div className="text-xs text-blue-400/80 font-bold border-b border-blue-500/10 pb-1 inline-block w-max">💬 对话</div>
                <div className="text-sm text-blue-100/90 italic drop-shadow-md bg-blue-900/20 p-2.5 rounded">
                  "{shot.dialogue}"
                </div>
              </div>
            )}
            {(shot.assignedCharacterIds && shot.assignedCharacterIds.length > 0) || (shot.sceneId && scenes && scenes.length > 0) ? (
              <div className="mt-2 pt-2 border-t border-white/10 flex flex-col gap-2 shrink-0">
                {shot.assignedCharacterIds && shot.assignedCharacterIds.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] text-gray-400 flex items-center gap-1">
                      <span>🎭</span> 参考角色
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {shot.assignedCharacterIds.map(id => {
                        const char = characterRefs.find(c => c.id === id);
                        if (!char) return null;
                        const imgUrl = getCharacterImageUrl(char);
                        return (
                          <div key={id} className="relative w-8 h-8 rounded-sm overflow-hidden border border-white/10 group/char shadow-sm" title={char.name}>
                            {imgUrl ? (
                              <img src={imgUrl} alt={char.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gray-800 flex items-center justify-center text-[10px] text-gray-400 font-bold">{char.name[0]}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* 🆕 渲染场景略缩图 */}
                {shot.sceneId && scenes && scenes.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] text-gray-400 flex items-center gap-1">
                      <span>🏛️</span> 参考场景
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const scene = scenes.find(s => s.id === shot.sceneId);
                        if (!scene) return null;
                        const sceneImgUrl = getSceneImageUrl(scene);
                        return (
                          <div key={scene.id} className="relative h-8 aspect-video rounded-sm overflow-hidden border border-white/10 group/scene shadow-sm" title={scene.name}>
                            {sceneImgUrl ? (
                              <img src={sceneImgUrl} alt={scene.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gray-800 flex items-center justify-center text-[8px] text-gray-400 px-1 truncate font-bold">{scene.name}</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={`flex items-center justify-center text-gray-600 bg-gray-900 border-b border-white/5 text-sm ${isExporting ? 'h-full min-h-[100px]' : 'absolute inset-0'}`}>
            暂无画面
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-5 flex flex-col flex-grow relative z-10 -mt-8 pt-6">
        {/* 剧情与对话 只有在有图片的情况下才需要在这个位置重复显示剧情，纯文字模式下已经在画面中间展示过了 */}
        {shot.storyboardGridUrl && typeof shot.storyboardGridCellIndex === 'number' && (
          <div className="mb-4 flex-grow">
            <div className="text-sm text-gray-200 leading-relaxed font-medium mb-3 relative z-10">
              {storyBeat}
            </div>
            {shot.dialogue && (
              <div className="text-sm text-amber-200/90 italic bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-700/30">
                "{shot.dialogue}"
              </div>
            )}
          </div>
        )}

        {/* 底部小 Badge 状态栏 */}
        <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-white/5">
          <div className="flex items-center gap-1.5 justify-center bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2.5 py-1 rounded-md text-[11px] font-medium">
            ⏱ {shot.duration}
          </div>
          <div className="flex items-center justify-center bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2.5 py-1 rounded-md text-[11px] font-medium">
            🎥 {shot.shotSize}
          </div>
          <div className="flex items-center justify-center bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-md text-[11px] font-medium">
            📐 {shot.angleDirection} {shot.angleHeight}
          </div>
          {shot.cameraMove !== '固定(Static)' && (
            <div className="flex items-center justify-center bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2.5 py-1 rounded-md text-[11px] font-medium">
              💨 {shot.cameraMove}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 视频分组卡片组件 (Premium Style)
 */
function VideoGroupCard({
  group,
  prompt,
  groupIndex,
  characterRefs,
  scenes,
  isExporting,
  isGenerating = false,
  isUploadingRef = false,
  dependencyInfo,
  onGenerateVideo,
  onUploadCustomReference,
  onRemoveCustomReference,
  onSetCharacterForm,
}: {
  group: VideoGroup;
  prompt: VideoGroupPrompt | undefined;
  groupIndex: number;
  characterRefs: CharacterRef[];
  scenes?: SceneRef[];
  isExporting?: boolean;
  isGenerating?: boolean;
  isUploadingRef?: boolean;
  dependencyInfo?: { status: 'ready' | 'pending'; waitGroupName?: string };
  onGenerateVideo?: () => void;
  onUploadCustomReference?: (file: File) => Promise<void>;
  onRemoveCustomReference?: (url: string) => Promise<void>;
  onSetCharacterForm?: (groupId: string, charId: string, formId?: string) => Promise<void>;
}) {
  const [showPrompt, setShowPrompt] = useState(true);

  return (
    <div className="rounded-2xl overflow-hidden bg-[#161824] border border-white/5 shadow-xl relative ring-1 ring-purple-500/20">
      {/* 装饰发光 */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>

      {/* 分组标题栏 */}
      <div className="bg-gradient-to-r from-[#1e1b4b] to-[#312e81] p-6 relative overflow-hidden">
        {/* 背景光晕装饰 */}
        <div className="absolute -right-20 -top-40 w-80 h-80 bg-purple-500/20 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white font-bold text-sm backdrop-blur-md border border-white/20">
                {groupIndex + 1}
              </span>
              {!group.groupName.startsWith('未分组') && (
                <h3 className="text-xl md:text-2xl font-bold tracking-tight text-white drop-shadow-md">
                  {group.groupName}
                </h3>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-indigo-200/80">
              {group.sceneName && (
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>{group.sceneName}</span>
              )}
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>时长: <strong className="text-white font-medium">{group.totalDuration.toFixed(1)}s</strong></span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>包含 <strong className="text-white font-medium">{group.shots.length}</strong> 个镜头</span>
            </div>

            {/* 🆕 渲染依赖状态 */}
            {dependencyInfo && (
              <div className={`mt-3 inline-flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-lg border ${dependencyInfo.status === 'pending' ? 'bg-amber-900/40 border-amber-500/30 text-amber-300' : 'bg-emerald-900/40 border-emerald-500/30 text-emerald-300'}`}>
                <span className="shrink-0">{dependencyInfo.status === 'pending' ? '⚠️ 依赖等待' : '✅ 依赖就绪'}</span>
                <span>{dependencyInfo.status === 'pending' ? `需要前置镜头组「${dependencyInfo.waitGroupName}」生成完毕以继承画面，保持连贯性。` : '此分组无前置依赖，可独立生成。'}</span>
              </div>
            )}

            {/* 🆕 渲染自定义参考 */}
            {group.shots[0]?.shot?.customVideoReferences && group.shots[0].shot.customVideoReferences.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-indigo-300 flex items-center gap-1 font-medium bg-indigo-900/30 px-2 py-1 rounded border border-indigo-500/20">
                  📎 附加参考:
                </span>
                {group.shots[0].shot.customVideoReferences.map((url, i) => {
                   const isVid = url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov') || url.toLowerCase().includes('.webm');
                   return (
                     <div key={i} className="relative h-10 aspect-video rounded-md overflow-hidden border border-indigo-400/40 group/ref shadow-sm hover:border-indigo-400 transition-colors">
                       {isVid ? (
                         <video src={url} className="w-full h-full object-cover opacity-80" />
                       ) : (
                         <img src={url} className="w-full h-full object-cover" />
                       )}
                       <button
                         onClick={() => onRemoveCustomReference?.(url)}
                         className="absolute top-0 right-0 bg-red-500 hover:bg-red-600 text-white w-5 h-5 text-[12px] flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity rounded-bl-sm"
                         title="移除参考"
                       >×</button>
                     </div>
                   );
                })}
              </div>
            )}
            
            {/* 🆕 依赖锁定提示 */}
            {!group.shots[0]?.shot?.videoUrl && dependencyInfo?.status === 'pending' && (
              <div className="mt-4 flex items-center gap-2 text-sm text-rose-300 bg-rose-900/20 px-3 py-1.5 rounded-lg border border-rose-500/20 w-max shadow-sm">
                <span className="animate-pulse">⏳</span> 依赖卡锁: 正在等待 <strong>{dependencyInfo.waitGroupName}</strong> 出图以继承背景参考...
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
            {/* 🆕 增加参考文件查传入口 */}
            {onUploadCustomReference && (
              <div className="relative">
                <input
                  type="file"
                  accept="image/*,video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  id={`upload-ref-${group.id}`}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      e.target.value = ''; // clear
                      await onUploadCustomReference(file);
                    }
                  }}
                />
                <label
                  htmlFor={isUploadingRef ? undefined : `upload-ref-${group.id}`}
                  className={`px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-lg text-indigo-300 hover:text-indigo-200 transition-all text-sm font-medium flex items-center gap-2 ${isUploadingRef ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} whitespace-nowrap`}
                  title="上传本地图片或视频作为额外的生成参考"
                >
                  {isUploadingRef ? <><div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin"></div> 上传中</> : '📎 附加参考'}
                </label>
              </div>
            )}

            {group.shots.some(s => s.shot.storyboardGridUrl) && (
              <button
                onClick={async () => {
                  try {
                    // Create canvas and merge images
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;

                    const cellWidth = 1280;
                    const cellHeight = 720;
                    const shotsWithImages = group.shots.filter(s => s.shot.storyboardGridUrl && typeof s.shot.storyboardGridCellIndex === 'number');
                    if (shotsWithImages.length === 0) {
                      alert('该分组内没有图片可供合并');
                      return;
                    }

                    const cols = Math.min(2, shotsWithImages.length);
                    const rows = Math.ceil(shotsWithImages.length / cols);

                    canvas.width = cols * cellWidth;
                    canvas.height = rows * cellHeight;

                    ctx.fillStyle = '#0f111a'; // Dark background
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    const loadImage = (src: string): Promise<HTMLImageElement> => {
                      return new Promise((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous'; // try anonymous first
                        img.onload = () => resolve(img);
                        img.onerror = () => {
                          // Fallback to no-cors approach if possible, though canvas might taint
                          const fallbackImg = new Image();
                          fallbackImg.onload = () => resolve(fallbackImg);
                          fallbackImg.onerror = () => reject(new Error('Failed to load image ' + src));
                          fallbackImg.src = src;
                        };
                        img.src = src;
                      });
                    };

                    const imgCache = new Map<string, HTMLImageElement>();
                    let currentIdx = 0;

                    // Show a toast or loading state ideally, but window.alert/console is fine for quick feedback if needed.
                    console.log('Merging images for group:', group.groupName);

                    for (const shotRange of shotsWithImages) {
                      const shot = shotRange.shot;
                      try {
                        let img = imgCache.get(shot.storyboardGridUrl!);
                        if (!img) {
                          img = await loadImage(shot.storyboardGridUrl!);
                          imgCache.set(shot.storyboardGridUrl!, img);
                        }

                        const gridW = img.width / 3;
                        const gridH = img.height / 3;
                        const row = Math.floor(shot.storyboardGridCellIndex! / 3);
                        const col = shot.storyboardGridCellIndex! % 3;

                        const sx = col * gridW;
                        const sy = row * gridH;

                        const dx = (currentIdx % cols) * cellWidth;
                        const dy = Math.floor(currentIdx / cols) * cellHeight;

                        ctx.drawImage(img, sx, sy, gridW, gridH, dx, dy, cellWidth, cellHeight);

                        // Overlay sequence number
                        ctx.fillStyle = 'rgba(0,0,0,0.7)';
                        ctx.beginPath();
                        ctx.roundRect(dx + 20, dy + 20, 100, 100, 16);
                        ctx.fill();

                        ctx.fillStyle = '#34d399'; // Emerald-400
                        ctx.font = 'bold 54px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(String(currentIdx + 1), dx + 70, dy + 74);

                      } catch (err) {
                        console.error('Error drawing cell index:', shot.storyboardGridCellIndex, err);
                      }

                      currentIdx++;
                    }

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = `${group.groupName.replace(/\s+/g, '_')}_合并参考图.jpg`;
                    a.click();
                  } catch (err) {
                    console.error('Failed to merge images:', err);
                    alert('导出合并图失败，可能是图片跨域限制导致。');
                  }
                }}
                className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 rounded-lg text-emerald-400 hover:text-emerald-300 transition-all text-sm font-medium flex items-center gap-2 whitespace-nowrap"
                title="合并分组内的所有分镜图为一张长图或网格图，以便作为一个参考图上传给AI"
              >
                📸 下载合并大图
              </button>
            )}

            {prompt && onGenerateVideo && (
              <button
                onClick={onGenerateVideo}
                disabled={isGenerating || dependencyInfo?.status === 'pending'}
                className={`px-4 py-2 ${group.shots[0]?.shot?.videoUrl ? 'bg-[#1a1b26]/50 hover:bg-[#1a1b26] border border-white/10' : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 border border-emerald-400/30'} ${dependencyInfo?.status === 'pending' ? 'opacity-50 cursor-not-allowed grayscale' : ''} text-white rounded-lg transition-all text-sm font-bold flex items-center gap-2 shadow-lg whitespace-nowrap`}
              >
                {isGenerating ? (
                   <><div className="w-4 h-4 border-2 border-white border-t-transparent flex-shrink-0 rounded-full animate-spin"></div><span className="truncate">{group.shots[0].shot.errorMessage || '生成中...'}</span></>
                ) : (group.shots[0]?.shot?.videoUrl ? '🔄 全部重生成' : '✨ 生成视频')}
              </button>
            )}

            {prompt && (
              <button
                onClick={() => setShowPrompt(!showPrompt)}
                className="px-4 py-2 bg-black/30 hover:bg-black/50 border border-white/10 rounded-lg text-indigo-300 hover:text-white transition-all text-sm font-medium flex items-center gap-2 group whitespace-nowrap"
              >
                📹 Seedance 2.0 提示词
                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] uppercase group-hover:bg-white/20 transition-colors">
                  {showPrompt ? 'HIDE' : 'SHOW'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 分组内容区 */}
      <div className="p-6 md:p-8 flex flex-col xl:flex-row gap-6 md:gap-8 items-start">
        {/* 左侧：分组内小镜头瀑布流布局 (放大尺寸版) */}
        <div className={`flex-1 w-full flex flex-col gap-6`}>
          {group.shots[0]?.shot?.videoUrl && (
            <div className="w-full flex flex-col rounded-2xl overflow-hidden border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] bg-black/50 relative flex-shrink-0 animate-fadeIn">
              <div className="w-full aspect-video relative bg-black group/video">
                <video 
                  src={group.shots[0].shot.videoUrl} 
                  autoPlay 
                  controls 
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <button
                  onClick={() => downloadFile(group.shots[0].shot.videoUrl!, `${group.groupName.replace(/\s+/g, '_')}.mp4`)}
                  className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full opacity-0 group-hover/video:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm border border-white/20 shadow-lg"
                  title="下载该视频"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>
              </div>
              
              {/* 显示失败信息 */}
              {group.shots[0].shot.status === 'error' && group.shots[0].shot.errorMessage && (
                <div className="bg-red-900/30 border-t border-red-900 px-4 py-3 text-red-400 text-xs font-mono break-words whitespace-pre-wrap flex items-start gap-2">
                   <div className="mt-0.5">⚠️</div>
                   <div className="flex-1">
                      <div className="font-semibold mb-1">生成失败或已超时停滞</div>
                      <div>{group.shots[0].shot.errorMessage}</div>
                   </div>
                </div>
              )}

              {/* 🆕 视频生成参数与多模态参考折叠面板 */}
              {group.shots[0].shot.videoGenerationMeta && (
                <details className="group/details bg-[#161824] border-t border-white/5">
                  <summary className="px-4 py-3 text-sm font-medium text-gray-400 cursor-pointer hover:text-white transition-colors flex items-center justify-between select-none">
                     <span>🔍 展开生成参数详情</span>
                     <span className="text-xs text-gray-600 font-mono">Task ID: {group.shots[0].shot.videoGenerationMeta.taskCode}</span>
                  </summary>
                  <div className="p-4 pt-1 border-t border-white/5 bg-[#0b0d14]/50 flex flex-col gap-4 text-xs text-gray-300">
                    <div className="flex flex-wrap gap-4">
                      <span><strong>模型:</strong> {group.shots[0].shot.videoGenerationMeta.model}</span>
                      <span><strong>指定时长:</strong> {group.shots[0].shot.videoGenerationMeta.duration}s</span>
                      <span><strong>提交时间:</strong> {new Date(group.shots[0].shot.videoGenerationMeta.taskCreatedAt).toLocaleString()}</span>
                    </div>
                    {group.shots[0].shot.videoGenerationMeta.taskCompletedAt && (
                      <div className="flex flex-wrap gap-4 text-emerald-300">
                        <span><strong>完成时间:</strong> {new Date(group.shots[0].shot.videoGenerationMeta.taskCompletedAt).toLocaleString()}</span>
                        {group.shots[0].shot.videoGenerationMeta.taskDurationMs && (
                          <span><strong>花费时长:</strong> {Math.round(group.shots[0].shot.videoGenerationMeta.taskDurationMs / 1000)}s</span>
                        )}
                      </div>
                    )}
                    {group.shots[0].shot.videoGenerationMeta.contentList && (
                      <div className="flex flex-col gap-2">
                        <strong className="text-gray-500 uppercase tracking-wider">提交的完整多模态混合提示词:</strong>
                        <div className="flex flex-wrap gap-2 items-start bg-black/40 p-3 rounded-lg border border-white/5">
                          {group.shots[0].shot.videoGenerationMeta.contentList.map((item, i) => {
                             if (item.type === 'text') {
                               return <span key={i} className="text-[11px] text-gray-300 whitespace-pre-wrap flex-1 min-w-[200px] leading-relaxed break-all border-l-2 border-indigo-500/50 pl-2">{item.text}</span>;
                             } else if (item.type === 'image_url') {
                               return (
                                 <img key={i} src={item.image_url?.url} className="h-16 w-16 object-cover rounded-md border border-white/10 bg-black" title="Reference Image" />
                               );
                             } else if (item.type === 'video_url') {
                               return (
                                 <video key={i} src={item.video_url?.url} className="h-16 aspect-video bg-black object-cover rounded-md border border-white/10" title="Reference Video" />
                               );
                             }
                             return null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
          <div className={`grid grid-cols-1 md:grid-cols-2 ${prompt && showPrompt ? '2xl:grid-cols-2' : 'lg:grid-cols-2 xl:grid-cols-3'} gap-6 md:gap-8`}>
            {group.shots.map((shotRange, idx) => (
              <GroupedShotCard key={shotRange.shot.id} shotRange={shotRange} characterRefs={characterRefs} scenes={scenes} isExporting={isExporting} />
            ))}
          </div>
        </div>

        {/* 右侧：视频生成提示词展开区 (Code Editor 质感) */}
        {prompt && showPrompt && (
          <div className="w-full xl:w-[400px] 2xl:w-[480px] flex-shrink-0 xl:sticky xl:top-32 h-fit z-50 flex flex-col gap-4">
            {/* 顶部的参考图图标陈列区 */}
            {(() => {
              // 提取这组脚本里提及的所有角色和场景
              const scriptText = prompt.timelineScript || '';
              const matchedChars = characterRefs.filter(c => c.name && scriptText.includes(`@${c.name}`));
              const matchedScenes = (scenes || []).filter(s => s.name && scriptText.includes(s.name));
              
              if (matchedChars.length === 0 && matchedScenes.length === 0) return null;

              return (
                <div className="flex flex-wrap gap-2 items-center bg-[#0b0d14] p-3 rounded-xl border border-white/5 shadow-inner">
                  <span className="text-[11px] font-medium text-gray-500 mr-1 uppercase tracking-wider">本组参考:</span>
                  {matchedChars.map(c => {
                    const firstShot = group.shots[0]?.shot;
                    const selectedFormId = firstShot?.selectedCharacterForms?.[c.id];
                    let imgUrl = getCharacterImageUrl(c);
                    let displayName = c.name;

                    if (selectedFormId && c.forms) {
                      const form = c.forms.find(f => f.id === selectedFormId);
                      if (form && form.imageSheetUrl) {
                        imgUrl = form.imageSheetUrl;
                        displayName = `${c.name} (${form.name})`;
                      }
                    }

                    return (
                      <div key={`char-${c.id}`} className="group/ref relative flex items-center gap-1.5 bg-emerald-900/20 border border-emerald-500/20 rounded-full pr-2 p-1 hover:bg-emerald-800/40 transition-colors cursor-help">
                        {imgUrl ? (
                          <img src={imgUrl} alt={c.name} className="w-5 h-5 rounded-full object-cover border border-emerald-500/30" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-emerald-800/50 border border-emerald-500/30 flex items-center justify-center text-[8px] text-emerald-200">?</div>
                        )}
                        <span className="text-[11px] text-emerald-300 font-medium">@{displayName}</span>
                        
                        {/* 形态选择下拉浮层 */}
                        {c.forms && c.forms.length > 0 && onSetCharacterForm && (
                          <div className="absolute top-full left-0 pt-2 hidden group-hover/ref:flex flex-col z-[100] min-w-[120px]">
                            <div className="bg-[#1a1b26] border border-white/10 rounded-lg p-1.5 shadow-2xl flex flex-col">
                              <div className="text-[10px] text-gray-500 mb-1 px-2 uppercase tracking-wide">选择参考形态</div>
                              <div 
                                className={`px-3 py-2 text-xs cursor-pointer rounded-md transition-colors ${!selectedFormId ? 'bg-emerald-600/30 text-emerald-300 font-medium' : 'text-gray-300 hover:bg-white/10'}`}
                                onClick={() => {
                                  onSetCharacterForm(group.id, c.id, undefined);
                                }}
                              >
                                默认形态 (主图)
                              </div>
                              {c.forms.map(form => (
                                <div 
                                  key={form.id}
                                  className={`px-3 py-2 text-xs cursor-pointer rounded-md transition-colors ${selectedFormId === form.id ? 'bg-emerald-600/30 text-emerald-300 font-medium' : 'text-gray-300 hover:bg-white/10'}`}
                                  onClick={() => onSetCharacterForm(group.id, c.id, form.id)}
                                >
                                  {form.name}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* 悬浮放大图 */}
                        {imgUrl && (
                          <div className="absolute top-1/2 left-[120%] -translate-y-1/2 ml-2 w-32 h-32 bg-gray-900 border border-white/20 rounded-lg shadow-[0_15px_50px_rgba(0,0,0,0.9)] overflow-hidden scale-95 opacity-0 group-hover/ref:scale-100 group-hover/ref:opacity-100 transform origin-left transition-all duration-200 pointer-events-none z-[110]">
                            <img src={imgUrl} alt={c.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {matchedScenes.map(s => {
                    const imgUrl = getSceneImageUrl(s);
                    return (
                      <div key={`scene-${s.id}`} className="group/ref flex items-center gap-1.5 bg-amber-900/20 border border-amber-500/20 rounded-full pr-2 p-1 hover:bg-amber-800/40 transition-colors cursor-help relative">
                        {imgUrl ? (
                          <img src={imgUrl} alt={s.name} className="w-6 h-5 rounded object-cover border border-amber-500/30" />
                        ) : (
                          <div className="w-6 h-5 rounded bg-amber-800/50 border border-amber-500/30 flex items-center justify-center text-[8px] text-amber-200">?</div>
                        )}
                        <span className="text-[11px] text-amber-300 font-medium">{s.name}</span>
                        
                         {/* 悬浮放大图 */}
                         {imgUrl && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 aspect-video bg-gray-900 border border-white/20 rounded-lg shadow-[0_15px_50px_rgba(0,0,0,0.9)] overflow-hidden scale-95 opacity-0 group-hover/ref:scale-100 group-hover/ref:opacity-100 translate-y-2 group-hover/ref:translate-y-0 transform origin-top transition-all duration-200 pointer-events-none z-[100]">
                            <img src={imgUrl} alt={s.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              );
            })()}

            <div className="bg-[#0b0d14] border border-white/5 rounded-xl shadow-inner flex flex-col h-full max-h-[80vh]">
              <div className="bg-white/5 border-b border-white/5 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
                <div className="flex gap-1.5 items-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
                  <span className="ml-2 text-xs font-semibold text-gray-400 tracking-wider">SEEDANCE SCRIPT</span>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(prompt.fullPromptCn)}
                  className="text-xs text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-1 rounded transition-colors"
                >
                  📋 复制
                </button>
              </div>
              <div className={`p-5 ${isExporting ? 'whitespace-pre-wrap break-words' : 'overflow-y-auto custom-scrollbar flex-1'} relative`}>
                <pre className={`text-[13px] font-mono leading-loose text-indigo-100 ${isExporting ? 'whitespace-pre-wrap break-words' : 'whitespace-pre-wrap'}`}>
                  <InteractivePromptText text={prompt.timelineScript} characterRefs={characterRefs} scenes={scenes} />
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 分组视图中的单个镜头小卡片 (Premium Style)
 */
function GroupedShotCard({ shotRange, characterRefs, scenes, isExporting }: { shotRange: { shot: Shot; startSecond: number; endSecond: number; shotNumber: string }; characterRefs: CharacterRef[]; scenes?: SceneRef[]; isExporting?: boolean; }) {
  const { shot } = shotRange;
  const storyBeat = getShotStoryBeat(shot);

  return (
    <div className="group rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/50 bg-[#1d1f2b] transition-all hover:shadow-[0_4px_20px_rgba(99,102,241,0.15)] hover:-translate-y-1 flex flex-col h-full relative">
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none z-10"></div>

      {/* 头部精简标签 */}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-20">
        <span className="font-mono text-[10px] bg-black/60 backdrop-blur-sm border border-white/10 px-1.5 py-0.5 rounded text-white font-bold drop-shadow-md">
          #{shot.shotNumber}
        </span>
        <span className="text-[10px] bg-indigo-600/80 backdrop-blur-sm border border-white/10 px-1.5 py-0.5 rounded text-white font-medium drop-shadow-md">
          {shotRange.startSecond.toFixed(0)}-{shotRange.endSecond.toFixed(0)}s
        </span>
      </div>

      {/* 强制16:9比例缩略图/文本区 */}
      <div className={`relative bg-black w-full flex flex-col ${(!isExporting || shot.storyboardGridUrl) ? 'pt-[56.25%]' : 'min-h-[140px]'}`}>
        {shot.storyboardGridUrl && typeof shot.storyboardGridCellIndex === 'number' ? (
          <div className="absolute inset-0">
            <GridCellImage gridUrl={shot.storyboardGridUrl} cellIndex={shot.storyboardGridCellIndex} />
          </div>
        ) : shot.videoPromptCn ? (
          <div className={`bg-gray-900 border-b border-white/5 p-4 flex flex-col justify-start gap-2 ${isExporting ? 'h-full flex-grow' : 'absolute inset-0 overflow-y-auto custom-scrollbar'}`}>
            <div className="flex flex-col gap-1.5 flex-grow">
              <div className="text-[10px] text-amber-500/80 font-bold border-b border-amber-500/10 pb-0.5 inline-block w-max">📖 分镜剧情</div>
              <div className={`text-[12px] text-gray-200 leading-snug font-medium drop-shadow-md ${isExporting ? 'whitespace-pre-wrap' : 'line-clamp-4'}`}>
                {storyBeat}
              </div>
            </div>
            {shot.dialogue && (
              <div className="flex flex-col gap-1 mt-auto">
                <div className="text-[10px] text-blue-400/80 font-bold border-b border-blue-500/10 pb-0.5 inline-block w-max">💬 对话</div>
                <div className="text-[11px] text-blue-100/90 italic drop-shadow-md bg-blue-900/20 p-1.5 rounded line-clamp-2">
                  "{shot.dialogue}"
                </div>
              </div>
            )}
            {(shot.assignedCharacterIds && shot.assignedCharacterIds.length > 0) || (shot.sceneId && scenes && scenes.length > 0) ? (
              <div className="mt-2 pt-2 border-t border-white/10 flex flex-col gap-1.5 shrink-0">
                {shot.assignedCharacterIds && shot.assignedCharacterIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                      {shot.assignedCharacterIds.slice(0, 3).map(id => {
                        const char = characterRefs.find(c => c.id === id);
                        if (!char) return null;
                        const imgUrl = getCharacterImageUrl(char);
                        return (
                          <div key={id} className="relative w-5 h-5 rounded-sm overflow-hidden border border-white/10 shadow-sm" title={`角色: ${char.name}`}>
                            {imgUrl ? (
                              <img src={imgUrl} alt={char.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gray-800 flex items-center justify-center text-[8px] text-gray-400 font-bold">{char.name[0]}</div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
                {shot.sceneId && scenes && scenes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const scene = scenes.find(s => s.id === shot.sceneId);
                      if (!scene) return null;
                      const sceneImgUrl = getSceneImageUrl(scene);
                      return (
                        <div key={scene.id} className="relative h-5 aspect-video rounded-sm overflow-hidden border border-white/10 shadow-sm" title={`场景: ${scene.name}`}>
                          {sceneImgUrl ? (
                            <img src={sceneImgUrl} alt={scene.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-800 flex items-center justify-center text-[8px] text-gray-400 px-0.5 truncate font-bold">{scene.name}</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-700 bg-gray-900 border-b border-white/5 text-xs">
            无画面
          </div>
        )}
      </div>

      {/* 内容信息 (叠在图片下半部分) 只有在有图片的情况下才需要在这个位置重复显示剧情，如果是纯文字模式它已经在上面展示过了 */}
      {shot.storyboardGridUrl && typeof shot.storyboardGridCellIndex === 'number' && (
        <div className="px-3 pb-3 pt-6 -mt-8 relative z-20 flex-grow flex flex-col justify-end">
          <div className="text-xs text-gray-200 line-clamp-2 leading-snug drop-shadow-md font-medium">
            {storyBeat}
          </div>
          {shot.dialogue && (
            <div className="mt-1 text-[10px] text-amber-200/90 italic truncate drop-shadow-md pb-1">
              "{shot.dialogue}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 九宫格虚拟切割图片组件保持不变，只修缮下边缘状态
 */
function GridCellImage({ gridUrl, cellIndex }: { gridUrl: string; cellIndex: number }) {
  const row = Math.floor(cellIndex / 3);
  const col = cellIndex % 3;
  const [corsMode, setCorsMode] = useState<'anonymous' | 'none'>('anonymous');
  const [loadFailed, setLoadFailed] = useState(false);

  const handleError = () => {
    if (corsMode === 'anonymous') {
      setCorsMode('none');
    } else {
      setLoadFailed(true);
    }
  };

  if (loadFailed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-rose-500/50 text-xs">
        载入失败
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <img
        src={gridUrl}
        crossOrigin={corsMode === 'anonymous' ? 'anonymous' : undefined}
        alt=""
        className="absolute top-0 left-0 select-none max-w-none max-h-none block"
        style={{
          width: '300%',
          height: '300%',
          left: `-${col * 100}%`,
          top: `-${row * 100}%`,
        }}
        draggable={false}
        onError={handleError}
      />
    </div>
  );
}

/**
 * 带有交互悬浮能力的提示词文本组件
 */
function InteractivePromptText({ text, characterRefs, scenes }: { text: string; characterRefs: CharacterRef[]; scenes?: SceneRef[] }) {
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const charNames = characterRefs.map(c => c.name).filter(Boolean).sort((a, b) => b.length - a.length);
  const sceneNames = scenes?.map(s => s.name).filter(Boolean).sort((a, b) => b.length - a.length) || [];

  const shotRegex = `\\[镜头\\s\\d+\\]`;
  const keywordRegex = `动作:|场景:|描述:|灯光:|运镜:`;
  const charRegex = charNames.length > 0 ? charNames.map(n => `@${escapeRegExp(n)}`).join('|') : '(?!)';
  const sceneRegex = sceneNames.length > 0 ? sceneNames.map(n => escapeRegExp(n)).join('|') : '(?!)';

  // group 1: shot, group 2: keyword, group 3: character, group 4: scene
  const masterRegex = new RegExp(`(${shotRegex})|(${keywordRegex})|(${charRegex})|(${sceneRegex})`, 'g');

  const parts: { type: string; content: string }[] = [];
  let lastIndex = 0;
  let match;

  masterRegex.lastIndex = 0;

  while ((match = masterRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }

    const matchedString = match[0];
    if (match[1]) {
      parts.push({ type: 'shot', content: matchedString });
    } else if (match[2]) {
      parts.push({ type: 'keyword', content: matchedString });
    } else if (match[3]) {
      parts.push({ type: 'character', content: matchedString });
    } else if (match[4]) {
      parts.push({ type: 'scene', content: matchedString });
    }

    lastIndex = masterRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <span key={i}>{part.content}</span>;
        } else if (part.type === 'shot') {
          return <span key={i} className="text-purple-300 font-bold bg-purple-900/40 px-1 rounded-sm shadow-sm">{part.content}</span>;
        } else if (part.type === 'keyword') {
          return <span key={i} className="text-blue-300 font-bold drop-shadow-sm">{part.content}</span>;
        } else if (part.type === 'character') {
          const charName = part.content.substring(1); // remove '@'
          const charInfo = characterRefs.find(c => c.name === charName);
          const imgUrl = getCharacterImageUrl(charInfo);
          
          return (
            <span key={i} className="relative inline-block group/hoverchar cursor-help text-emerald-300 font-bold bg-emerald-900/30 px-1 rounded border border-emerald-500/20 hover:bg-emerald-800/50 hover:border-emerald-400/50 transition-all z-10 hover:z-50 shadow-sm mx-0.5">
              {part.content}
              {imgUrl && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-36 h-36 bg-gray-900 border border-white/20 rounded-lg shadow-[0_15px_50px_rgba(0,0,0,0.9)] overflow-hidden scale-95 opacity-0 group-hover/hoverchar:scale-100 group-hover/hoverchar:opacity-100 group-hover/hoverchar:-translate-y-1 origin-bottom transition-all duration-200 pointer-events-none flex flex-col z-[100]">
                  <img src={imgUrl} alt={charName} className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 backdrop-blur-md px-2 py-1.5 text-center text-[11px] text-white font-bold truncate border-t border-white/10">
                    {charName}
                  </div>
                </div>
              )}
            </span>
          );
        } else if (part.type === 'scene') {
          const sceneInfo = scenes?.find(s => s.name === part.content);
          const imgUrl = getSceneImageUrl(sceneInfo);
          
          return (
             <span key={i} className="relative inline-block group/hoverscene cursor-help text-amber-300 font-bold bg-amber-900/30 px-1 rounded border border-amber-500/20 hover:bg-amber-800/50 hover:border-amber-400/50 transition-all z-10 hover:z-50 shadow-sm mx-0.5">
              {part.content}
              {imgUrl && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 aspect-video bg-gray-900 border border-white/20 rounded-lg shadow-[0_15px_50px_rgba(0,0,0,0.9)] overflow-hidden scale-95 opacity-0 group-hover/hoverscene:scale-100 group-hover/hoverscene:opacity-100 group-hover/hoverscene:-translate-y-1 origin-bottom transition-all duration-200 pointer-events-none flex flex-col z-[100]">
                  <img src={imgUrl} alt={part.content} className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 backdrop-blur-md px-2 py-1.5 text-center text-[11px] text-white font-bold truncate border-t border-white/10">
                    {part.content}
                  </div>
                </div>
              )}
            </span>
          );
        }
        return null;
      })}
    </>
  );
}
