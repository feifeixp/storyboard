import React, { useState, useRef } from 'react';
import { Shot, CharacterRef } from '../types';
import { SceneRef } from '../types/project';

interface FinalStoryboardProps {
  shots: Shot[];
  characterRefs: CharacterRef[];
  scenes: SceneRef[];
  episodeNumber: number | null;
  projectName?: string;
  onBack: () => void;
}

/**
 * 最终故事板预览组件
 * - 将九宫格图片虚拟切割为独立镜头
 * - 美观的卡片布局展示
 * - 支持导出 JSON、CSV、MD、PDF
 */
export function FinalStoryboard({ shots, characterRefs, scenes, episodeNumber, projectName, onBack }: FinalStoryboardProps) {
  const [isExporting, setIsExporting] = useState(false);
  const storyboardRef = useRef<HTMLDivElement>(null);

  // 检查是否有九宫格数据
  const hasStoryboardData = shots.some(shot => shot.storyboardGridUrl);

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

  // 导出为 JSON
  const exportJSON = () => {
    const data = shots.map(shot => ({
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
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard_ep${episodeNumber || 'unknown'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出为 CSV（含图片提示词和视频提示词）
  const exportCSV = () => {
    const headers = [
      '编号', '剧情描述', '对话', '景别', '角度朝向', '角度高度', '运镜', '时长',
      '图片提示词', '尾帧提示词', '视频提示词',
    ];
    const rows = shots.map(shot => [
      shot.shotNumber,
      typeof shot.storyBeat === 'string' ? shot.storyBeat : shot.storyBeat.event,
      shot.dialogue || '',
      shot.shotSize,
      shot.angleDirection,
      shot.angleHeight,
      shot.cameraMove,
      shot.duration,
      shot.imagePromptCn || '',
      shot.endImagePromptCn || '',
      shot.videoGenPrompt || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard_ep${episodeNumber || 'unknown'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出为 Markdown（含角色设定、场景设定、图片提示词和视频提示词）
  const exportMarkdown = () => {
    const title = `# 故事板 - ${projectName || '未命名项目'} - 第${episodeNumber || '?'}集\n\n`;

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

    const content = shots.map((shot, idx) => {
      const storyBeat = typeof shot.storyBeat === 'string' ? shot.storyBeat : shot.storyBeat.event;

      // 构建提示词部分（仅在有内容时输出，只保留中文）
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

      return `## 镜头 ${shot.shotNumber}\n\n` +
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
    }).join('');

    const blob = new Blob([title + characterSection + sceneSection + content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard_ep${episodeNumber || 'unknown'}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * 导出为 PDF（html2canvas + jsPDF）
   * 说明：
   * - 支持多页分页（避免长页面只导出一页/被裁切）
   * - 强依赖图片源 CORS：若九宫格图片域名未正确配置 Access-Control-Allow-Origin，将导致 canvas 被污染，无法导出。
   */
  const exportPDF = async () => {
    setIsExporting(true);
    try {
      // 动态导入库（避免首屏包体积膨胀）
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      if (!storyboardRef.current) {
        throw new Error('未找到故事板容器节点');
      }

      // 让浏览器有机会完成图片加载与布局（降低导出空白概率）
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      const canvas = await html2canvas(storyboardRef.current, {
        // scale 越大越清晰，但也更吃内存；2 在多数机器上可接受
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
      });

      // ⚠️ 若 canvas 被污染（跨域图片无 CORS），此处可能抛错
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // 将整张长图按宽度等比缩放到 PDF 宽度
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      // 分页：通过在不同页用负 y 偏移重复绘制同一张长图
      let remainingHeight = imgHeight;
      let y = 0;
      let pageIndex = 0;

      while (remainingHeight > 0) {
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, y, pdfWidth, imgHeight);
        remainingHeight -= pageHeight;
        y -= pageHeight;
        pageIndex += 1;
        // 避免极端情况死循环
        if (pageIndex > 200) break;
      }

      const filename = `storyboard_ep${episodeNumber || 'unknown'}_${Date.now()}.pdf`;

      // 用 Blob 触发下载，比 pdf.save 在某些环境更稳定
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
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <button
              onClick={onBack}
              className="mb-4 px-4 py-2 bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-all border border-[var(--color-border)]"
            >
              ← 返回
            </button>
            <h1 className="text-4xl font-bold text-[var(--color-text)] mb-2">
              📋 最终故事板预览
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              {projectName || '未命名项目'} - 第{episodeNumber || '?'}集 - 共 {shots.length} 个镜头
            </p>
          </div>

          {/* 导出按钮组 */}
          <div className="flex gap-3">
            <button
              onClick={exportJSON}
              disabled={isExporting}
              className="px-4 py-2 bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)] rounded-lg hover:bg-[var(--color-accent-blue)]/20 transition-all disabled:opacity-50 border border-[var(--color-accent-blue)]/30"
            >
              📄 导出 JSON
            </button>
            <button
              onClick={exportCSV}
              disabled={isExporting}
              className="px-4 py-2 bg-[var(--color-accent-green)]/10 text-[var(--color-accent-green)] rounded-lg hover:bg-[var(--color-accent-green)]/20 transition-all disabled:opacity-50 border border-[var(--color-accent-green)]/30"
            >
              📊 导出 CSV
            </button>
            <button
              onClick={exportMarkdown}
              disabled={isExporting}
              className="px-4 py-2 bg-[var(--color-accent-violet)]/10 text-[var(--color-accent-violet)] rounded-lg hover:bg-[var(--color-accent-violet)]/20 transition-all disabled:opacity-50 border border-[var(--color-accent-violet)]/30"
            >
              📝 导出 MD
            </button>
            <button
              onClick={exportPDF}
              disabled={isExporting}
              className="px-4 py-2 bg-[var(--color-accent-red)]/10 text-[var(--color-accent-red)] rounded-lg hover:bg-[var(--color-accent-red)]/20 transition-all disabled:opacity-50 border border-[var(--color-accent-red)]/30"
            >
              {isExporting ? '⏳ 生成中...' : '📕 导出 PDF'}
            </button>
          </div>
        </div>

        {/* 故事板网格 */}
        <div ref={storyboardRef} className="bg-white p-8 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {shots.map((shot, idx) => (
              <StoryboardCard key={shot.id} shot={shot} index={idx} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 单个故事板卡片组件
 */
function StoryboardCard({ shot, index }: { shot: Shot; index: number; key?: React.Key }) {
  const storyBeat = typeof shot.storyBeat === 'string' ? shot.storyBeat : shot.storyBeat.event;

  return (
    <div className="rounded-lg overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-all bg-[var(--color-surface-solid)]">
      {/* 镜头编号 */}
      <div className="bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] text-white px-4 py-2 font-bold text-lg">
        镜头 {shot.shotNumber}
      </div>

      {/* 图片 - 虚拟切割显示 */}
      <div className="relative bg-black" style={{ paddingTop: '56.25%' }}>
        {shot.storyboardGridUrl && typeof shot.storyboardGridCellIndex === 'number' ? (
          <GridCellImage gridUrl={shot.storyboardGridUrl} cellIndex={shot.storyboardGridCellIndex} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            暂无图片
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-4 space-y-3">
        {/* 剧情描述 */}
        <div>
          <div className="text-xs font-semibold text-[#a1a1aa] mb-1">剧情描述</div>
          <div className="text-sm text-[#fafaf9] leading-relaxed">{storyBeat}</div>
        </div>

        {/* 对话 */}
        {shot.dialogue && (
          <div>
            <div className="text-xs font-semibold text-[#a1a1aa] mb-1">对话</div>
            <div className="text-sm text-[#e8c9a0] italic">"{shot.dialogue}"</div>
          </div>
        )}

        {/* 镜头信息 */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-semibold text-[#71717a]">景别:</span>
            <span className="ml-1 text-[#fafaf9]">{shot.shotSize}</span>
          </div>
          <div>
            <span className="font-semibold text-[#71717a]">时长:</span>
            <span className="ml-1 text-[#fafaf9]">{shot.duration}</span>
          </div>
          <div className="col-span-2">
            <span className="font-semibold text-[#71717a]">角度:</span>
            <span className="ml-1 text-[#fafaf9]">{shot.angleDirection} {shot.angleHeight}</span>
          </div>
          <div className="col-span-2">
            <span className="font-semibold text-[#71717a]">运镜:</span>
            <span className="ml-1 text-[#fafaf9]">{shot.cameraMove}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 九宫格虚拟切割图片组件（用于最终预览）
 * - 放大 3 倍 + 位移裁切实现虚拟切割
 * - 添加 max-w-none / max-h-none 覆盖 Tailwind preflight 的 img { max-width:100% }
 * - CORS 加载失败时自动降级为不带 crossOrigin（保证预览可见，但 PDF 导出可能受限）
 */
function GridCellImage({ gridUrl, cellIndex }: { gridUrl: string; cellIndex: number }) {
  const row = Math.floor(cellIndex / 3);
  const col = cellIndex % 3;
  // CORS 降级：首次用 anonymous，加载失败则去掉 crossOrigin 再试一次
  const [corsMode, setCorsMode] = useState<'anonymous' | 'none'>('anonymous');
  const [loadFailed, setLoadFailed] = useState(false);

  const handleError = () => {
    if (corsMode === 'anonymous') {
      // 第一次失败：去掉 crossOrigin 再试
      setCorsMode('none');
    } else {
      // 彻底失败
      setLoadFailed(true);
    }
  };

  if (loadFailed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-400 text-xs">
        图片加载失败
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/*
        使用 <img> 而非 background-image：
        - html2canvas 对 <img> 的跨域处理更可控（配合 crossOrigin + useCORS）
        - 同时仍可通过放大 3 倍并位移来实现九宫格虚拟裁切
        - max-w-none / max-h-none 覆盖 Tailwind preflight 的 max-width:100%
      */}
      <img
        src={gridUrl}
        crossOrigin={corsMode === 'anonymous' ? 'anonymous' : undefined}
        alt=""
        className="absolute top-0 left-0 select-none max-w-none max-h-none"
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

