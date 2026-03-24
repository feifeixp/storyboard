import React from 'react';
import { Shot, CharacterRef } from '../../types';

/**
 * 安全解析提示词提取结果 JSON，自动处理 ```json 代码块包裹等常见格式问题。
 *
 * 入参：LLM 流式拼接后的完整文本，期望为 JSON 数组或被 ```json/``` 包裹的 JSON 数组。
 * 出参：解析成功时返回数组；解析失败时返回空数组，并在控制台输出错误日志。
 */
const safeParsePromptExtractionResult = (raw: string): any[] => {
  if (!raw) return [];

  let text = raw.trim();

  // 去掉 markdown 代码块包裹（```json / ```）
  text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 截取第一个 [ 到最后一个 ] 之间的内容，尽量锁定数组主体
  const start = text.indexOf('[');
  if (start === -1) return [];
  // 优先找最后一个 ]，但如果解析失败再做截断修复
  const end = text.lastIndexOf(']');
  if (end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  } else {
    text = text.slice(start);
  }

  // 第一次尝试：直接解析（完整输出时走此路径）
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[PromptExtraction] JSON直接解析失败，尝试截断修复...', (error as Error).message);
  }

  // 截断修复：找到最后一个完整的 JSON 对象（以 } 结尾，后跟 , 或 ] 或空白）
  // 这处理 LLM 输出被截断到字符串中间的情况
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
            // 找到一个完整的顶层对象，检查后面跟的是 , ] 或空白
            const after = text.slice(i + 1).match(/^\s*([,\]\s])/);
            if (after) {
              lastCompleteObjEnd = i;
            }
          }
        }
      }
    }

    if (lastCompleteObjEnd > 0) {
      // 截断到最后一个完整对象，闭合数组
      let repaired = text.slice(0, lastCompleteObjEnd + 1).trimEnd();
      // 移除尾随逗号
      if (repaired.endsWith(',')) repaired = repaired.slice(0, -1);
      repaired += ']';
      const parsed = JSON.parse(repaired);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.warn(`[PromptExtraction] 截断修复成功，保留 ${parsed.length} 个完整对象`);
        return parsed;
      }
    }
  } catch (repairError) {
    console.error('[PromptExtraction] 截断修复也失败:', repairError);
  }

  console.error('[PromptExtraction] JSON解析彻底失败，原始内容片段:', text.slice(0, 300));
  return [];
};

interface PromptExtractionPageProps {
  // 分镜数据
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  characterRefs: CharacterRef[];

  // 提取状态
  isExtracting: boolean;
  setIsExtracting: (extracting: boolean) => void;
  extractProgress: string;
  setExtractProgress: (progress: string) => void;

  // 校验状态
  isValidatingPrompts: boolean;
  promptValidationResults: any[];
  setPromptValidationResults: (results: any[]) => void;

  // 操作函数
  extractImagePromptsStream: (shots: Shot[], model?: string) => AsyncGenerator<string>;
  validatePrompts: () => void;
  oneClickOptimizePrompts: () => Promise<void>;

  // 优化前后对比记录
  optimizedChanges: Array<{ shotNumber: number | string; oldPrompt: string; newPrompt: string }>;
  setOptimizedChanges: (changes: Array<{ shotNumber: number | string; oldPrompt: string; newPrompt: string }>) => void;

  // 导航
  setCurrentStep: (step: number) => void;

  // 项目信息
  currentProject: any;
  currentEpisodeNumber: number | null;
  script: string;
  saveEpisode: (projectId: string, episode: any) => Promise<void>;
}

/**
 * 提示词提取页面
 * 从分镜脚本提取AI生图提示词
 */
export const PromptExtractionPage: React.FC<PromptExtractionPageProps> = ({
  shots,
  setShots,
  isExtracting,
  setIsExtracting,
  extractProgress,
  setExtractProgress,
  isValidatingPrompts,
  promptValidationResults,
  setPromptValidationResults,
  extractImagePromptsStream,
  validatePrompts,
  oneClickOptimizePrompts,
  optimizedChanges,
  setOptimizedChanges,
  setCurrentStep,
  currentProject,
  currentEpisodeNumber,
  script,
  saveEpisode,
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
        const searchText = `${s.imagePromptCn || ''} ${eventText}`;
        characterRefs.forEach(c => {
          if (searchText.includes(c.name) || (s.imagePromptCn && s.imagePromptCn.includes(`@${c.name}`))) {
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
    // 回退：从 forms 中取第一个有设定图的形态
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
      // 拉取匹配项之前的文本
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
      }

      const roleName = match[1].trim();
      const stateName = match[2]?.trim();
      const fullMatch = match[0];

      // 尝试寻找角色及图片
      const character = characterRefs.find(c => c.name === roleName);
      const imageUrl = character ? getCharacterImageUrl(character) : null;

      parts.push(
        <span key={`tag-${match.index}`} className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-blue-900/40 border border-blue-700/50 text-blue-300 rounded text-[11px] align-middle shadow-sm">
          {imageUrl && (
            <img src={imageUrl} alt={roleName} className="w-4 h-4 rounded-sm object-cover border border-blue-600/50" />
          )}
          <span className="font-bold">{roleName}</span>
          {stateName && <span className="text-blue-400 opacity-80 text-[10px]">({stateName})</span>}
        </span>
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }

    return <span className="leading-loose">{parts}</span>;
  };

  const handleExtractPrompts = async () => {
    setIsExtracting(true);
    setExtractProgress('正在分析分镜脚本，准备提取AI生图提示词...');

    try {
      const BATCH_SIZE = 15; // 分批提取，避免大批量引发 Token 截断
      let allExtracted: any[] = [];

      for (let i = 0; i < shots.length; i += BATCH_SIZE) {
        const batchShots = shots.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(shots.length / BATCH_SIZE);
        const baseProgressPercent = (i / shots.length) * 100;
        const progressPerBatch = (batchShots.length / shots.length) * 100;

        setExtractProgress(`正在准备批次 ${batchIndex} / ${totalBatches}...`);

        try {
          const stream = extractImagePromptsStream(batchShots);
          let fullText = '';
          for await (const text of stream) {
            fullText = text;
            // 估算批次内的进度，封顶不超过本批次总上限
            const currentProgress = Math.min(Math.round(baseProgressPercent + (fullText.length / (BATCH_SIZE * 300)) * progressPerBatch), Math.round(baseProgressPercent + progressPerBatch - 1));
            setExtractProgress(`提取中... (批次 ${batchIndex}/${totalBatches}) ${currentProgress}%`);
          }

          const extracted = safeParsePromptExtractionResult(fullText);
          if (Array.isArray(extracted)) {
            allExtracted = allExtracted.concat(extracted);
          }
        } catch (err) {
          console.error(`批次 ${batchIndex} 提取异常:`, err);
        }
      }

      if (allExtracted.length === 0) {
        throw new Error('提示词提取结果解析彻底失败，请稍后重试或检查模型网络状态');
      }

      const updatedShots = shots.map(shot => {
        // 兼容字符串和数字类型的 shotNumber
        const match = allExtracted.find((e: any) => String(e.shotNumber) === String(shot.shotNumber));
        if (match) {
          const newPrompt = match.imagePromptCn || '';

          // ── 提取并关联角色 ──
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
            imagePromptCn: newPrompt,
            assignedCharacterIds: Array.from(assignedCharIds),
          };
        }
        return shot;
      });

      setShots(updatedShots);
      setExtractProgress(`✅ 提取完成！已更新 ${allExtracted.length} 个镜头的AI提示词`);

      // 保存到云端
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
            setExtractProgress(`✅ 提取完成！已更新 ${allExtracted.length} 个镜头的AI提示词（已保存到云端）`);
          } catch (error) {
            console.error('[D1存储] ❌ 保存提示词失败:', error);
          }
        }
      }
    } catch (error) {
      console.error('提取失败:', error);
      setExtractProgress(`❌ 提取失败: ${error instanceof Error ? error.message : '未知错误'}`);
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
              🎯 提取AI生图提示词
            </h2>
            <p className="text-[var(--color-text-secondary)] text-xs mt-1">
              根据 Nano Banana Pro 官方手册，从分镜脚本提取纯画面描述的AI提示词（中英文双版本）
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
              onClick={() => setCurrentStep(6)} // AppStep.GENERATE_IMAGES
              disabled={!shots.some(s => s.imagePromptCn)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              下一步: 绘制草图 →
            </button>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="glass-card p-4 rounded-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={handleExtractPrompts}
            disabled={isExtracting || shots.length === 0}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold text-sm hover:bg-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExtracting ? (
              <>
                <span className="animate-spin">⏳</span>
                提取中...
              </>
            ) : (
              <>🎯 一键提取AI提示词</>
            )}
          </button>

          <button
            onClick={validatePrompts}
            disabled={isValidatingPrompts || !shots.some(s => s.imagePromptCn)}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium text-sm hover:bg-amber-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isValidatingPrompts ? (
              <>
                <span className="animate-spin">⏳</span>
                自检中...
              </>
            ) : (
              <>🔍 自检提示词</>
            )}
          </button>

          <button
            onClick={oneClickOptimizePrompts}
            disabled={isExtracting || promptValidationResults.length === 0}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            ⚡ 一键优化 ({promptValidationResults.length})
          </button>

          <span className="text-sm text-[var(--color-text-secondary)]">{extractProgress}</span>
        </div>

        {/* 校验结果 */}
        {promptValidationResults.length > 0 && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
            <h4 className="font-bold text-red-400">⚠️ 发现 {promptValidationResults.length} 个提示词问题</h4>
          </div>
        )}

        {/* 一键优化前后对比面板 */}
        {optimizedChanges.length > 0 && (
          <div className="mt-4 p-4 bg-emerald-900/20 border border-emerald-700/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-emerald-400">✅ 已优化 {optimizedChanges.length} 个镜头的提示词（点击展开对比）</h4>
              <button
                onClick={() => setOptimizedChanges([])}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-700"
              >
                关闭
              </button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {optimizedChanges.map((change) => (
                <div key={String(change.shotNumber)} className="rounded-lg border border-gray-700 overflow-hidden text-xs">
                  <div className="bg-black/40 px-3 py-2 font-bold text-blue-300 border-b border-white/5">
                    镜头 {change.shotNumber}
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-gray-700">
                    <div className="p-2 bg-red-900/20">
                      <div className="text-red-400 font-semibold mb-1">优化前</div>
                      <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{change.oldPrompt || '（空）'}</p>
                    </div>
                    <div className="p-2 bg-green-900/20">
                      <div className="text-green-400 font-semibold mb-1">优化后</div>
                      <p className="text-gray-100 leading-relaxed whitespace-pre-wrap">{change.newPrompt}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 登场角色预览面板 */}
      {usedCharacters.length > 0 && (
        <div className="glass-card p-4 rounded-xl mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              🎭 参与生成登场角色 <span className="text-xs font-normal text-gray-400 bg-black/40 border border-white/10 px-2 py-0.5 rounded-full">{usedCharacters.length}</span>
            </h3>
            <span className="text-xs text-gray-400">以下角色的参考组合将作为上下文传给AI生图模型</span>
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
        <h3 className="font-bold text-white mb-3">📋 提示词列表</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-[var(--color-surface)] text-[var(--color-text-primary)]">
              <tr>
                <th className="px-3 py-2 border border-[var(--color-border)] w-16">#</th>
                <th className="px-3 py-2 border border-[var(--color-border)] w-20">类型</th>
                <th className="px-3 py-2 border border-[var(--color-border)]">中文提示词</th>
              </tr>
            </thead>
            <tbody>
              {shots.map((shot) => {
                const wasOptimized = optimizedChanges.some(
                  c => String(c.shotNumber) === String(shot.shotNumber)
                );
                return (
                  <tr
                    key={shot.id}
                    className={`hover:bg-[var(--color-surface-hover)] ${wasOptimized ? 'bg-emerald-900/15' : ''}`}
                  >
                    <td className="px-3 py-2 border border-[var(--color-border)] text-center font-bold text-blue-400">
                      {shot.shotNumber}
                      {wasOptimized && (
                        <span className="ml-1 text-emerald-400 text-xs" title="已优化">✨</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border border-[var(--color-border)] text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${shot.shotType === '运动'
                        ? 'bg-green-900/30 text-green-300'
                        : 'bg-gray-700 text-gray-300'
                        }`}>
                        {shot.shotType || '静态'}
                      </span>
                    </td>
                    <td className={`px-3 py-2 border border-[var(--color-border)] ${wasOptimized ? 'text-emerald-300' : 'text-[var(--color-text-secondary)]'}`}>
                      <RenderPromptWithTags text={shot.imagePromptCn || ''} />
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

