import React from 'react';
import { Shot, CharacterRef } from '../../types';

interface VideoPromptExtractionPageProps {
  // 分镜数据
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  characterRefs: CharacterRef[];

  // 提取状态
  isExtracting: boolean;
  setIsExtracting: (extracting: boolean) => void;
  extractProgress: string;
  setExtractProgress: (progress: string) => void;

  // 操作函数
  extractVideoPromptsStream: (shots: Shot[], model?: string) => AsyncGenerator<string>;

  // 导航
  setCurrentStep: (step: number) => void;

  // 项目信息
  currentProject: any;
  currentEpisodeNumber: number | null;
  script: string;
  saveEpisode: (projectId: string, episode: any) => Promise<void>;
  setCurrentProject: (project: any) => void;
}

/**
 * 提取AI视频提示词页面 (Seedance 2.0)
 * 从分镜脚本提取直接用于生成视频的提示词（包含角色、场景和运镜）
 */
export const VideoPromptExtractionPage: React.FC<VideoPromptExtractionPageProps> = ({
  shots,
  setShots,
  isExtracting,
  setIsExtracting,
  extractProgress,
  setExtractProgress,
  extractVideoPromptsStream,
  setCurrentStep,
  currentProject,
  currentEpisodeNumber,
  script,
  saveEpisode,
  setCurrentProject,
  characterRefs,
}) => {
  // ── 提取当前分镜组涉及的登场角色
  const usedCharacters = React.useMemo(() => {
    const ids = new Set<string>();
    shots.forEach(s => {
      if (s.assignedCharacterIds && s.assignedCharacterIds.length > 0) {
        s.assignedCharacterIds.forEach(id => ids.add(id));
      } else {
        const eventText = typeof s.storyBeat === 'string' ? s.storyBeat : s.storyBeat?.event || '';
        const searchText = `${s.videoPromptCn || ''} ${eventText}`;
        characterRefs.forEach(c => {
          if (searchText.includes(c.name) || (s.videoPromptCn && s.videoPromptCn.includes(`@${c.name}`))) {
            ids.add(c.id);
          }
        });
      }
    });
    return characterRefs.filter(c => ids.has(c.id));
  }, [shots, characterRefs]);

  // ── 提取图片 URL 的辅助函数
  const getCharacterImageUrl = (c: CharacterRef) => {
    if (c.imageSheetUrl) return c.imageSheetUrl;
    if (c.referenceImageUrl) return c.referenceImageUrl;
    if (c.imageUrls && c.imageUrls.length > 0) return c.imageUrls[0];
    if (c.forms && c.forms.length > 0) {
      const formWithImage = c.forms.find(f => f.imageSheetUrl);
      if (formWithImage) return formWithImage.imageSheetUrl;
    }
    return c.data;
  };

  // ── 渲染带 @标签 的提示词组件
  const RenderPromptWithTags = ({ text }: { text: string }) => {
    if (!text) return <span>—</span>;

    // 匹配 @角色名 或 @角色名(状态)
    const regex = /@([^(]+)(?:\(([^)]+)\))?/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
      }

      const roleName = match[1].trim();
      const stateName = match[2]?.trim();
      const character = characterRefs.find(c => c.name === roleName);
      const imageUrl = character ? getCharacterImageUrl(character) : null;

      parts.push(
        <span key={`tag-${match.index}`} className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-purple-900/40 border border-purple-700/50 text-purple-300 rounded text-[11px] align-middle shadow-sm">
          {imageUrl && (
            <img src={imageUrl} alt={roleName} className="w-4 h-4 rounded-sm object-cover border border-purple-600/50" />
          )}
          <span className="font-bold">{roleName}</span>
          {stateName && <span className="text-purple-400 opacity-80 text-[10px]">({stateName})</span>}
        </span>
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }

    return <span className="leading-loose">{parts}</span>;
  };

  /**
   * 安全解析提示词提取结果 JSON
   */
  const safeParsePromptExtractionResult = (raw: string): any[] => {
    if (!raw) return [];
    let text = raw.trim();
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    const start = text.indexOf('[');
    if (start === -1) return [];
    const end = text.lastIndexOf(']');
    if (end !== -1 && end > start) {
      text = text.slice(start, end + 1);
    } else {
      text = text.slice(start);
    }

    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('[VideoPromptExtraction] JSON直接解析失败，尝试截断修复...', (error as Error).message);
    }

    try {
      let depth = 0;
      let inString = false;
      let escapeNext = false;
      let lastCompleteObjEnd = -1;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (char === '\\') { escapeNext = true; continue; }
        if (char === '"') { inString = !inString; continue; }

        if (!inString) {
          if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              const after = text.slice(i + 1).match(/^\s*([,\]\s])/);
              if (after) {
                lastCompleteObjEnd = i;
              }
            }
          }
        }
      }

      if (lastCompleteObjEnd > 0) {
        let repaired = text.slice(0, lastCompleteObjEnd + 1).trimEnd();
        if (repaired.endsWith(',')) repaired = repaired.slice(0, -1);
        repaired += ']';
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (repairError) {
      console.error('[VideoPromptExtraction] 截断修复也失败:', repairError);
    }

    return [];
  };

  const handleExtractVideoPrompts = async () => {
    setIsExtracting(true);
    setExtractProgress('正在生成 Seedance 2.0 视频提示词...');

    try {
      const stream = extractVideoPromptsStream(shots);
      let fullText = '';
      for await (const text of stream) {
        fullText = text;
        setExtractProgress(`生成中... (${Math.min(Math.round(fullText.length / 300), 99)}%)`);
      }

      const extracted = safeParsePromptExtractionResult(fullText);
      if (!Array.isArray(extracted) || extracted.length === 0) {
        throw new Error('视频提示词生成结果解析失败，请稍后重试');
      }

      const updatedShots = shots.map(shot => {
        const match = extracted.find((e: any) => e.shotNumber === shot.shotNumber);
        if (match) {
          const newPrompt = match.videoPromptCn || '';

          // 提取关联角色
          const regex = /@([^(]+)(?:\(([^)]+)\))?/g;
          const assignedCharIds = new Set<string>(shot.assignedCharacterIds || []);
          let m;
          while ((m = regex.exec(newPrompt)) !== null) {
            const roleName = m[1].trim();
            const char = characterRefs.find(c => c.name === roleName);
            if (char) {
              assignedCharIds.add(char.id);
            }
          }

          return {
            ...shot,
            videoPromptCn: newPrompt,
            assignedCharacterIds: Array.from(assignedCharIds),
          };
        }
        return shot;
      });

      setShots(updatedShots);
      setExtractProgress(`✅ 生成完成！已为 ${extracted.length} 个镜头生成了 Seedance 2.0 视频提示词`);

      if (currentProject && currentEpisodeNumber !== null) {
        const currentEpisode = currentProject.episodes?.find(
          (ep: any) => ep.episodeNumber === currentEpisodeNumber
        );
        if (currentEpisode) {
          try {
            const updatedEpisode = {
              ...currentEpisode,
              script: script || '',
              shots: updatedShots,
              updatedAt: new Date().toISOString(),
            };
            await saveEpisode(currentProject.id, updatedEpisode);
            
            // 🆕 核心修复：更新本地 Project 状态，确保返回修改或刷新时数据不丢失
            setCurrentProject({
              ...currentProject,
              episodes: currentProject.episodes.map((ep: any) =>
                ep.episodeNumber === currentEpisodeNumber ? updatedEpisode : ep
              ),
            });
            
            setExtractProgress(`✅ 生成完成！已更新 ${extracted.length} 个镜头提示词（已保存到云端）`);
          } catch (error) {
            console.error('[D1存储] ❌ 保存提示词失败:', error);
          }
        }
      }
    } catch (error) {
      console.error('提取失败:', error);
      setExtractProgress(`❌ 生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      {/* 顶部栏 */}
      <div className="glass-card p-4 rounded-xl">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              🎬 生成 Seedance 2.0 视频提示词
            </h2>
            <p className="text-[var(--color-text-secondary)] text-xs mt-1">
              根据 Seedance 2.0 规范，直接通过镜头剧本生成可用的视频提示词，包含时间轴与动作编排
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(4)} // AppStep.MANUAL_EDIT
              className="px-3 py-1.5 bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-lg font-medium text-xs hover:bg-[var(--color-surface-hover)] transition-all"
            >
              ← 返回精修
            </button>
            <button
              onClick={() => setCurrentStep(7)} // AppStep.FINAL_STORYBOARD
              disabled={!shots.some(s => s.videoPromptCn)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              下一步: 开始视频生成 →
            </button>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="glass-card p-4 rounded-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={handleExtractVideoPrompts}
            disabled={isExtracting || shots.length === 0}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExtracting ? (
              <>
                <span className="animate-spin">⏳</span>
                生成中...
              </>
            ) : (
              <>✨ 一键生成视频提示词</>
            )}
          </button>
          <span className="text-sm text-[var(--color-text-secondary)]">{extractProgress}</span>
        </div>
      </div>

      {/* 登场角色预览面板 */}
      {usedCharacters.length > 0 && (
        <div className="glass-card p-4 rounded-xl mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              🎭 参与生成登场角色 <span className="text-xs font-normal text-gray-400 bg-black/40 border border-white/10 px-2 py-0.5 rounded-full">{usedCharacters.length}</span>
            </h3>
            <span className="text-xs text-gray-400">以下角色的参考组合将作为上下文传给AI生图/视频模型</span>
          </div>

          <div className="flex flex-wrap gap-4">
            {usedCharacters.map((c) => {
              const url = getCharacterImageUrl(c);
              const hasNoImage = !url;
              return (
                <div key={c.id} className="flex flex-col items-center w-16">
                  <div className={`w-14 h-14 rounded-full mb-2 overflow-hidden border-2 shadow-sm ${hasNoImage ? 'border-red-500/50 border-dashed bg-red-900/20' : 'border-white/10 bg-black/50'}`}>
                    {url ? (
                      <img src={url} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-red-400">
                        <svg className="w-6 h-6 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-200 text-center font-medium truncate w-full" title={c.name}>
                    {c.name}
                  </span>
                  {hasNoImage && <span className="text-[10px] text-red-400 mt-0.5 whitespace-nowrap">缺图片</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 提示词表格 */}
      <div className="glass-card p-4 rounded-xl">
        <h3 className="font-bold text-white mb-3">📋 视频生成提示词列表</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-[var(--color-surface)] text-[var(--color-text-primary)]">
              <tr>
                <th className="px-3 py-2 border border-[var(--color-border)] w-16">#</th>
                <th className="px-3 py-2 border border-[var(--color-border)] w-20">类型</th>
                <th className="px-3 py-2 border border-[var(--color-border)]">Seedance 2.0 视频提示词</th>
              </tr>
            </thead>
            <tbody>
              {shots.map((shot) => {
                return (
                  <tr
                    key={shot.id}
                    className="hover:bg-[var(--color-surface-hover)]"
                  >
                    <td className="px-3 py-2 border border-[var(--color-border)] text-center font-bold text-blue-400">
                      {shot.shotNumber}
                    </td>
                    <td className="px-3 py-2 border border-[var(--color-border)] text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${shot.shotType === '运动'
                        ? 'bg-green-900/30 text-green-300'
                        : 'bg-gray-700 text-gray-300'
                        }`}>
                        {shot.shotType || '静态'}
                      </span>
                    </td>
                    <td className="px-3 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)]">
                      <RenderPromptWithTags text={shot.videoPromptCn || ''} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
