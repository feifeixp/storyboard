import React from 'react';
import { Shot } from '../../types';

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
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[PromptExtraction] JSON解析失败，原始内容片段:', text.slice(0, 200), error);
    return [];
  }
};

interface PromptExtractionPageProps {
  // 分镜数据
  shots: Shot[];
  setShots: (shots: Shot[]) => void;

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
}) => {
  const handleExtractPrompts = async () => {
    setIsExtracting(true);
    setExtractProgress('正在分析分镜脚本，提取AI生图提示词...');

    try {
      const stream = extractImagePromptsStream(shots);
      let fullText = '';
      for await (const text of stream) {
        fullText = text;
        // 32镜头×约500字≈16000字总输出，除以250使进度在完成时约60-80%，最高封顶99%
        setExtractProgress(`提取中... (${Math.min(Math.round(fullText.length / 250), 99)}%)`);
      }

	      // 解析JSON并更新shots（兼容 ```json 代码块等格式）
	      const extracted = safeParsePromptExtractionResult(fullText);
	      if (!Array.isArray(extracted) || extracted.length === 0) {
	        throw new Error('提示词提取结果解析失败，请稍后重试或尝试更换模型');
	      }
      const updatedShots = shots.map(shot => {
        const match = extracted.find((e: any) => e.shotNumber === shot.shotNumber);
        if (match) {
          return {
            ...shot,
            imagePromptCn: match.imagePromptCn || '',
          };
        }
        return shot;
      });

      setShots(updatedShots);
      setExtractProgress(`✅ 提取完成！已更新 ${extracted.length} 个镜头的AI提示词`);

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
            setExtractProgress(prev => (prev.includes('✅') ? `${prev}（已保存到云端）` : prev));
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
                  <div className="bg-gray-800 px-3 py-1.5 font-bold text-blue-300">
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
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        shot.shotType === '运动'
                          ? 'bg-green-900/30 text-green-300'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {shot.shotType || '静态'}
                      </span>
                    </td>
                    <td className={`px-3 py-2 border border-[var(--color-border)] ${wasOptimized ? 'text-emerald-300' : 'text-[var(--color-text-secondary)]'}`}>
                      {shot.imagePromptCn || '—'}
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

