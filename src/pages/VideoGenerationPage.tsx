import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Shot, CharacterRef, AppStep, VideoGroup } from '../../types';
import { createVideoTask, pollVideoTask, VideoTaskStatus, VideoContentItem } from '../services/aiVideoGeneration';
import { groupShotsBySceneAndDuration, generateVideoGroupPrompt } from '../utils/videoGrouping';
import { uploadToOSS, generateOSSPath } from '../../services/oss';

interface VideoGenerationPageProps {
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  characterRefs: CharacterRef[];
  setCurrentStep: (step: AppStep) => void;
  currentProject: any;
  currentEpisodeNumber: number | null;
  saveEpisode: (projectId: string, episode: any) => Promise<void>;
  setCurrentProject: (project: any) => void;
  script: string;
}

export const VideoGenerationPage: React.FC<VideoGenerationPageProps> = ({
  shots,
  setShots,
  characterRefs,
  setCurrentStep,
  currentProject,
  currentEpisodeNumber,
  saveEpisode,
  script,
}) => {
  const [generatingGroupIds, setGeneratingGroupIds] = useState<Set<string>>(new Set());

  // 只显示有视频提示词的镜头
  const validShots = useMemo(() => shots.filter(s => s.videoPromptCn), [shots]);

  // 分组生成
  const videoGroups = useMemo(() => {
    return groupShotsBySceneAndDuration(validShots, currentProject?.scenes || []);
  }, [validShots, currentProject?.scenes]);

  // 从提示词 + 分组镜头中提取所有相关角色并转换成 API 格式
  const extractContentList = (prompt: string, charRefs: CharacterRef[], group?: VideoGroup): VideoContentItem[] => {
    const content: VideoContentItem[] = [];
    const addedUrls = new Set<string>();

    // 辅助：获取角色图片（优先选中形态）
    const getCharUrl = (char: CharacterRef): string | null => {
      if (group) {
        const formId = group.shots[0]?.shot.selectedCharacterForms?.[char.id];
        if (formId) {
          const form = char.forms?.find(f => f.id === formId);
          if (form?.imageSheetUrl) return form.imageSheetUrl;
        }
      }
      return char.imageSheetUrl || char.referenceImageUrl ||
             (char.imageUrls && char.imageUrls[0]) ||
             (char.forms && char.forms[0]?.imageSheetUrl) ||
             char.data || null;
    };

    // 1. 扫描提示词中的 @角色名 标记
    const atRegex = /@([^\s，。、！@:：(]+)/g;
    let match;
    while ((match = atRegex.exec(prompt)) !== null) {
      const roleName = match[1].trim();
      const char = charRefs.find(c => c.name === roleName);
      if (char) {
        const url = getCharUrl(char);
        if (url && !addedUrls.has(url)) {
          addedUrls.add(url);
          content.push({ type: 'image_url', role: 'reference_image', image_url: { url } });
        }
      }
    }

    // 2. 通过 assignedCharacterIds 补全所有参与本组镜头的角色
    if (group) {
      const seenCharIds = new Set<string>();
      for (const shotRange of group.shots) {
        for (const charId of (shotRange.shot.assignedCharacterIds || [])) {
          if (seenCharIds.has(charId)) continue;
          seenCharIds.add(charId);
          const char = charRefs.find(c => c.id === charId);
          if (!char) continue;
          const url = getCharUrl(char);
          if (url && !addedUrls.has(url)) {
            addedUrls.add(url);
            content.push({ type: 'image_url', role: 'reference_image', image_url: { url } });
          }
        }
      }
    }

    // 文本置于首位
    content.unshift({ type: 'text', text: prompt });
    return content;
  };

  const resumedGroupIds = useRef(new Set<string>());

  useEffect(() => {
    videoGroups.forEach(group => {
      const shot = group.shots[0]?.shot;
      if (shot?.status === 'generating' && shot?.videoGenerationMeta?.taskCode) {
        if (!resumedGroupIds.current.has(group.id) && !generatingGroupIds.has(group.id)) {
          resumedGroupIds.current.add(group.id);
          resumeGroupGeneration(group, shot.videoGenerationMeta.taskCode);
        }
      }
    });
  }, [videoGroups, generatingGroupIds]);

  const resumeGroupGeneration = async (group: VideoGroup, taskId: string) => {
    setGeneratingGroupIds(prev => new Set(prev).add(group.id));
    updateGroupStatus(group, 'generating');

    try {
      const finalResult = await pollVideoTask(taskId);

      if (finalResult.status === VideoTaskStatus.SUCCEEDED && finalResult.content?.video_url) {
        try {
            const videoResp = await fetch(finalResult.content.video_url);
            if (!videoResp.ok) throw new Error('无法下载生成的视频文件');
            const videoBlob = await videoResp.blob();
            
            const shotNumberText = group.shots.map(s => s.shotNumber).join('_');
            const ossPath = generateOSSPath(currentProject?.id || 'unknown', shotNumberText, 'video', 'mp4');
            const ossUrl = await uploadToOSS(videoBlob, ossPath);

            updateGroupComplete(group, ossUrl);
        } catch (uploadErr: any) {
            console.error('OSS上传失败:', uploadErr);
            throw new Error(`视频生成成功但OSS上传失败：${uploadErr.message}`);
        }
      } else {
        throw new Error(finalResult.error?.message || '视频生成失败');
      }
    } catch (err: any) {
        console.error('视频自动拉取或上传异常:', err);
        updateGroupStatus(group, 'error');
        alert(`分组 ${group.groupName} 生成失败：${err.message}`);
    } finally {
        setGeneratingGroupIds(prev => {
           const next = new Set(prev);
           next.delete(group.id);
           return next;
        });
    }
  };

  const handleGenerateGroup = async (group: VideoGroup) => {
    setGeneratingGroupIds(prev => new Set(prev).add(group.id));
    updateGroupStatus(group, 'generating');

    try {
      const model = 'neo-video-2-0';
      const promptData = generateVideoGroupPrompt(group, currentProject?.settings?.visualStyle);
      let finalPromptText = promptData.fullPromptCn;

      // ── 上一段视频参考检测 ──
      const groupIndex = videoGroups.findIndex(g => g.id === group.id);
      if (groupIndex > 0) {
        const prevGroup = videoGroups[groupIndex - 1];
        const prevVideoUrl = prevGroup.shots[0]?.shot.videoUrl;
        if (prevVideoUrl) {
          // 用 assignedCharacterIds 判断是否有角色重叠或同场景
          const prevCharIds = new Set(prevGroup.shots.flatMap(s => s.shot.assignedCharacterIds || []));
          const currCharIds = group.shots.flatMap(s => s.shot.assignedCharacterIds || []);
          const sameScene = !!(group.sceneId && group.sceneId === prevGroup.sceneId);
          const hasOverlapChars = currCharIds.some(id => prevCharIds.has(id));

          if (sameScene || hasOverlapChars) {
            // 在提示词末尾加入参考说明
            finalPromptText += '\n\n【参考上一段视频】参考视频中的场景环境和角色空间位置关系，保持空间连贯性。不要保留上一段视频的背景声音，只参考角色音色并自然融入当前台词。';
          }
        }
      }

      const contentList = extractContentList(finalPromptText, characterRefs, group);

      // ── 注入上一段视频（放在角色图之后）──
      if (groupIndex > 0) {
        const prevGroup = videoGroups[groupIndex - 1];
        const prevVideoUrl = prevGroup.shots[0]?.shot.videoUrl;
        if (prevVideoUrl) {
          const prevCharIds = new Set(prevGroup.shots.flatMap(s => s.shot.assignedCharacterIds || []));
          const currCharIds = group.shots.flatMap(s => s.shot.assignedCharacterIds || []);
          const sameScene = !!(group.sceneId && group.sceneId === prevGroup.sceneId);
          const hasOverlapChars = currCharIds.some(id => prevCharIds.has(id));
          if (sameScene || hasOverlapChars) {
            contentList.push({ type: 'video_url', role: 'reference_video', video_url: { url: prevVideoUrl } } as any);
          }
        }
      }

      // 若分组第一个镜头已有生成图，作为首帧传入
      const firstShot = group.shots[0]?.shot;
      const firstFrameUrl = firstShot?.storyboardGridUrl || firstShot?.promptCn || undefined;
      if (firstFrameUrl && typeof firstFrameUrl === 'string' && firstFrameUrl.startsWith('http')) {
        contentList.push({
          type: 'image_url',
          role: 'first_frame',
          image_url: { url: firstFrameUrl },
        });
      }

      const res = await createVideoTask({
        model,
        content: contentList,
        generate_audio: true,
        ratio: '16:9',
      });

      updateGroupMeta(group, {
        taskCode: res.id,
        taskCreatedAt: new Date().toISOString(),
        model,
        duration: -1,
      });

      // Pass off the remainder of the flow to the background queue resumer
      resumeGroupGeneration(group, res.id);
    } catch (err: any) {
        console.error('视频发包异常:', err);
        updateGroupStatus(group, 'error');
        alert(`分组 ${group.groupName} 发送生成请求失败：${err.message}`);
        setGeneratingGroupIds(prev => {
           const next = new Set(prev);
           next.delete(group.id);
           return next;
        });
    }
  };

  const updateGroupStatus = (group: VideoGroup, status: 'generating' | 'error' | 'completed' | 'pending') => {
    const shotIds = new Set(group.shots.map(s => s.shot.id));
    setShots(shots.map(s => shotIds.has(s.id) ? { ...s, status } : s));
  };

  const updateGroupMeta = (group: VideoGroup, meta: any) => {
    const shotIds = new Set(group.shots.map(s => s.shot.id));
    setShots(shots.map(s => shotIds.has(s.id) ? { ...s, videoGenerationMeta: meta } : s));
  };

  const updateGroupComplete = (group: VideoGroup, videoUrl: string) => {
     const shotIds = new Set(group.shots.map(s => s.shot.id));
     const nextShots = shots.map(s => {
       if (shotIds.has(s.id)) {
         return {
           ...s,
           status: 'completed' as const,
           videoUrl
         };
       }
       return s;
     });
     setShots(nextShots);
     handleSaveEpisodes(nextShots);
  };

  const handleSaveEpisodes = async (updatedShots: Shot[]) => {
    if (currentProject && currentEpisodeNumber !== null) {
      const currentEpisode = currentProject.episodes?.find((ep: any) => ep.episodeNumber === currentEpisodeNumber);
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

  const generateAllNonVideoGroups = () => {
      videoGroups.forEach(group => {
          const hasVideo = group.shots.some(s => s.shot.videoUrl);
          if (!hasVideo && !generatingGroupIds.has(group.id)) {
              handleGenerateGroup(group);
          }
      });
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="glass-card p-4 rounded-xl flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">🎥 批量生成 2.0 视频</h2>
          <p className="text-[var(--color-text-secondary)] text-xs mt-1">
            自动按照场景和15秒限制进行分组打包发送 Seedance 2.0 视频生成任务。
          </p>
        </div>
        <div className="flex gap-3">
            <button
                onClick={() => setCurrentStep(AppStep.EXTRACT_VIDEO_PROMPTS)}
                className="px-3 py-1.5 bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-lg font-medium text-xs hover:bg-[var(--color-surface-hover)] transition-all"
            >
                ← 返回提示词
            </button>
            <button
              onClick={() => setCurrentStep(AppStep.FINAL_STORYBOARD)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700 transition"
            >
              下一步: 最终脚本预览 →
            </button>
        </div>
      </div>

      <div className="glass-card p-4 rounded-xl">
          <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-white">共有 {videoGroups.length} 个视频分组待生成</h3>
              <button 
                  onClick={generateAllNonVideoGroups}
                  disabled={videoGroups.every(g => g.shots.every(s => s.shot.videoUrl) || generatingGroupIds.has(g.id))}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm text-white font-bold disabled:opacity-50"
              >
                  一键生成剩余分组
              </button>
          </div>
          <div className="space-y-4">
              {videoGroups.map(group => {
                  const isGenerating = generatingGroupIds.has(group.id);
                  const promptData = generateVideoGroupPrompt(group, currentProject?.settings?.visualStyle);
                  const contentItems = extractContentList(promptData.fullPromptCn, characterRefs, group);
                  const refImages = contentItems.filter(i => i.type === 'image_url').length;
                  const groupVideoUrl = group.shots[0]?.shot?.videoUrl; // group.shots must have same URL after generation

                  return (
                      <div key={group.id} className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg flex flex-col gap-3">
                          <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                  <span className="text-sm font-bold bg-blue-900/40 text-blue-400 px-3 py-0.5 rounded-full">{group.groupName}</span>
                                  <span className="text-xs text-[var(--color-text-tertiary)]">总时长: {group.totalDuration.toFixed(1)}s</span>
                                  {refImages > 0 && <span className="text-[10px] bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded">含 {refImages} 个角色/参考图</span>}
                                  {group.shots.some(s => s.shot.status === 'error') && <span className="text-[10px] bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">生成失败</span>}
                              </div>
                              <div className="flex gap-4 items-center">
                                  {groupVideoUrl ? (
                                      <video src={groupVideoUrl} autoPlay loop muted className="h-20 w-auto rounded border border-gray-600" />
                                  ) : null}
                                  
                                  <button
                                    onClick={() => handleGenerateGroup(group)}
                                    disabled={isGenerating}
                                    className={`px-4 py-2 rounded text-white font-bold text-sm min-w-[100px] ${groupVideoUrl ? 'bg-gray-700 hover:bg-gray-600' : 'bg-green-600 hover:bg-green-500'}`}
                                  >
                                    {isGenerating ? '生成中...' : (groupVideoUrl ? '全部重生成' : '生成视频组')}
                                  </button>
                              </div>
                          </div>
                          
                          <div className="text-xs text-[var(--color-text-secondary)] bg-black/20 p-2 rounded">
                             <div className="font-bold mb-1 text-gray-400">镜头包含: {group.shots.map(s => s.shotNumber).join(', ')}</div>
                             <div className="whitespace-pre-line">{promptData.fullPromptCn}</div>
                          </div>
                      </div>
                  );
              })}
          </div>
      </div>
    </div>
  );
};
