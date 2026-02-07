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

  // 导出为 PDF（使用 html2canvas + jsPDF）
  const exportPDF = async () => {
    setIsExporting(true);
    try {
      // 动态导入库
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      if (!storyboardRef.current) return;

      const canvas = await html2canvas(storyboardRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`storyboard_ep${episodeNumber || 'unknown'}_${Date.now()}.pdf`);
    } catch (error) {
      console.error('PDF导出失败:', error);
      alert('PDF导出失败，请重试');
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
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundImage: `url(${gridUrl})`,
        backgroundSize: '300% 300%',
        backgroundPosition: `${col * 50}% ${row * 50}%`,
      }}
    />
  );
}

