import React, { useState, useRef } from 'react';
import { Shot, CharacterRef } from '../types';

interface FinalStoryboardProps {
  shots: Shot[];
  characterRefs: CharacterRef[];
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
export function FinalStoryboard({ shots, characterRefs, episodeNumber, projectName, onBack }: FinalStoryboardProps) {
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

  // 导出为 CSV
  const exportCSV = () => {
    const headers = ['编号', '剧情描述', '对话', '景别', '角度朝向', '角度高度', '运镜', '时长'];
    const rows = shots.map(shot => [
      shot.shotNumber,
      typeof shot.storyBeat === 'string' ? shot.storyBeat : shot.storyBeat.event,
      shot.dialogue || '',
      shot.shotSize,
      shot.angleDirection,
      shot.angleHeight,
      shot.cameraMove,
      shot.duration,
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

  // 导出为 Markdown
  const exportMarkdown = () => {
    const title = `# 故事板 - ${projectName || '未命名项目'} - 第${episodeNumber || '?'}集\n\n`;
    const content = shots.map((shot, idx) => {
      const storyBeat = typeof shot.storyBeat === 'string' ? shot.storyBeat : shot.storyBeat.event;
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
        `- **光影**: ${shot.lighting}\n\n` +
        `---\n\n`;
    }).join('');

    const blob = new Blob([title + content], { type: 'text/markdown;charset=utf-8;' });
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <button
              onClick={onBack}
              className="mb-4 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all"
            >
              ← 返回
            </button>
            <h1 className="text-4xl font-bold text-white mb-2">
              📋 最终故事板预览
            </h1>
            <p className="text-gray-400">
              {projectName || '未命名项目'} - 第{episodeNumber || '?'}集 - 共 {shots.length} 个镜头
            </p>
          </div>

          {/* 导出按钮组 */}
          <div className="flex gap-3">
            <button
              onClick={exportJSON}
              disabled={isExporting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50"
            >
              📄 导出 JSON
            </button>
            <button
              onClick={exportCSV}
              disabled={isExporting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all disabled:opacity-50"
            >
              📊 导出 CSV
            </button>
            <button
              onClick={exportMarkdown}
              disabled={isExporting}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50"
            >
              📝 导出 MD
            </button>
            <button
              onClick={exportPDF}
              disabled={isExporting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all disabled:opacity-50"
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
function StoryboardCard({ shot, index }: { shot: Shot; index: number }) {
  const storyBeat = typeof shot.storyBeat === 'string' ? shot.storyBeat : shot.storyBeat.event;

  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden border-2 border-gray-300 shadow-lg hover:shadow-xl transition-all">
      {/* 镜头编号 */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 font-bold text-lg">
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
          <div className="text-xs font-semibold text-gray-500 mb-1">剧情描述</div>
          <div className="text-sm text-gray-800 leading-relaxed">{storyBeat}</div>
        </div>

        {/* 对话 */}
        {shot.dialogue && (
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">对话</div>
            <div className="text-sm text-gray-800 italic">"{shot.dialogue}"</div>
          </div>
        )}

        {/* 镜头信息 */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-semibold text-gray-600">景别:</span>
            <span className="ml-1 text-gray-800">{shot.shotSize}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-600">时长:</span>
            <span className="ml-1 text-gray-800">{shot.duration}</span>
          </div>
          <div className="col-span-2">
            <span className="font-semibold text-gray-600">角度:</span>
            <span className="ml-1 text-gray-800">{shot.angleDirection} {shot.angleHeight}</span>
          </div>
          <div className="col-span-2">
            <span className="font-semibold text-gray-600">运镜:</span>
            <span className="ml-1 text-gray-800">{shot.cameraMove}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 九宫格虚拟切割图片组件（用于最终预览）
 */
function GridCellImage({ gridUrl, cellIndex }: { gridUrl: string; cellIndex: number }) {
  const row = Math.floor(cellIndex / 3);
  const col = cellIndex % 3;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/*
        使用 <img> 而非 background-image：
        - html2canvas 对 <img> 的跨域处理更可控（配合 crossOrigin + useCORS）
        - 同时仍可通过放大 3 倍并位移来实现九宫格虚拟裁切
      */}
      <img
        src={gridUrl}
        crossOrigin="anonymous"
        alt=""
        className="absolute top-0 left-0 select-none"
        style={{
          width: '300%',
          height: '300%',
          left: `-${col * 100}%`,
          top: `-${row * 100}%`,
        }}
        draggable={false}
      />
    </div>
  );
}

