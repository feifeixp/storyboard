import React, { useState, useRef, useMemo } from 'react';
import { Shot, CharacterRef, VideoGroup, VideoGroupPrompt } from '../types';
import { SceneRef } from '../types/project';
import {
  groupShotsBySceneAndDuration,
  generateAllVideoGroupPrompts,
  getShotStoryBeat,
} from '../src/utils/videoGrouping';
// 静态导入（避免动态 import chunk 在 Cloudflare Pages 部署时因 MIME 类型错误导致加载失败）
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface FinalStoryboardProps {
  shots: Shot[];
  characterRefs: CharacterRef[];
  scenes: SceneRef[];
  episodeNumber: number | null;
  projectName?: string;
  onBack: () => void;
}

type ViewMode = 'original' | 'grouped';

/**
 * 最终故事板预览组件
 * - 将九宫格图片虚拟切割为独立镜头
 * - 支持分组视图（按场景和时长限制分组）
 * - 美观的卡片布局展示
 * - 支持导出 JSON、CSV、MD、PDF
 */
export function FinalStoryboard({ shots, characterRefs, scenes, episodeNumber, projectName, onBack }: FinalStoryboardProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('original');
  const storyboardRef = useRef<HTMLDivElement>(null);

  // 生成分组数据
  const { videoGroups, videoGroupPrompts } = useMemo(() => {
    const groups = groupShotsBySceneAndDuration(shots, scenes, 15);
    const prompts = generateAllVideoGroupPrompts(groups);
    return { videoGroups: groups, videoGroupPrompts: prompts };
  }, [shots, scenes]);

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

  // ==================== 导出函数 ====================

  // 导出为 JSON
  const exportJSON = () => {
    const data = {
      meta: {
        project: projectName || '未命名项目',
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
    csvContent.push(`项目名称,${projectName || '未命名项目'}`);
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
    const title = `# 故事板 - ${projectName || '未命名项目'} - 第${episodeNumber || '?'}集\n\n`;
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
              {projectName || '未命名项目'} - 第{episodeNumber || '?'}集 - 共 <span className="text-white font-medium">{shots.length}</span> 个镜头 · <span className="text-white font-medium">{videoGroups.length}</span> 个视频分组
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
                🎬 原始镜头
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
            </div>
          </div>
        </div>

        {/* 故事板内容主体 */}
        <div ref={storyboardRef} className="bg-[#12141c] p-6 lg:p-8 rounded-2xl border border-white/5 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
          {viewMode === 'original' ? (
            /* 原始视图 */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
              {shots.map((shot, idx) => (
                <StoryboardCard key={shot.id} shot={shot} index={idx} />
              ))}
            </div>
          ) : (
            /* 分组视图 */
            <div className="space-y-12">
              {videoGroups.map((group, groupIdx) => {
                const prompt = videoGroupPrompts.find(p => p.groupId === group.id);
                return (
                  <VideoGroupCard
                    key={group.id}
                    group={group}
                    prompt={prompt}
                    groupIndex={groupIdx}
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
function StoryboardCard({ shot, index }: { shot: Shot; index: number }) {
  const storyBeat = getShotStoryBeat(shot);

  return (
    <div className="group relative rounded-xl overflow-hidden bg-[#1a1d2d]/80 backdrop-blur-md border border-white/10 hover:border-purple-500/50 shadow-lg hover:shadow-[0_8px_30px_rgba(139,92,246,0.15)] transition-all duration-300 hover:-translate-y-1 flex flex-col h-full">
      {/* 顶部指示条 */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-600 opacity-50 group-hover:opacity-100 transition-opacity z-10"></div>

      {/* 镜头编号 (角标风格) */}
      <div className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-md border border-white/10 text-white px-2 py-1 rounded text-xs font-mono font-bold shadow-lg">
        SHOT {shot.shotNumber.toString().padStart(3, '0')}
      </div>

      {/* 图片 - 虚拟切割显示 */}
      <div className="relative bg-black w-full" style={{ paddingTop: '56.25%' }}>
        {shot.storyboardGridUrl && typeof shot.storyboardGridCellIndex === 'number' ? (
          <div className="absolute inset-0 group-hover:scale-[1.02] transition-transform duration-500">
            <GridCellImage gridUrl={shot.storyboardGridUrl} cellIndex={shot.storyboardGridCellIndex} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1d2d]/90 via-transparent to-black/20 pointer-events-none"></div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 bg-gray-900 border-b border-white/5 text-sm">
            暂无画面
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-5 flex flex-col flex-grow relative z-10 -mt-8 pt-6">
        {/* 剧情与对话 */}
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
}: {
  group: VideoGroup;
  prompt: VideoGroupPrompt | undefined;
  groupIndex: number;
}) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden bg-[#161824] border border-white/5 shadow-xl relative ring-1 ring-purple-500/20">
      {/* 装饰发光 */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>

      {/* 分组标题栏 */}
      <div className="bg-gradient-to-r from-[#1e1b4b] to-[#312e81] p-6 relative overflow-hidden">
        {/* 背景光晕装饰 */}
        <div className="absolute -right-20 -top-40 w-80 h-80 bg-purple-500/20 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white font-bold text-sm backdrop-blur-md border border-white/20">
                {groupIndex + 1}
              </span>
              <h3 className="text-xl md:text-2xl font-bold tracking-tight text-white drop-shadow-md">
                {group.groupName}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-indigo-200/80">
              {group.sceneName && (
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>{group.sceneName}</span>
              )}
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>时长: <strong className="text-white font-medium">{group.totalDuration.toFixed(1)}s</strong></span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>包含 <strong className="text-white font-medium">{group.shots.length}</strong> 个镜头</span>
            </div>
          </div>

          <div className="flex gap-2">
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
      <div className="p-6 md:p-8">
        {/* 视频生成提示词展开区 (Code Editor 质感) */}
        {prompt && showPrompt && (
          <div className="mb-8 mt-[-1rem]">
            <div className="bg-[#0b0d14] border border-white/5 rounded-xl shadow-inner overflow-hidden flex flex-col">
              <div className="bg-white/5 border-b border-white/5 px-4 py-2 flex items-center justify-between">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(prompt.fullPromptCn)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  📋 复制
                </button>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="text-sm font-mono leading-relaxed text-[#c0caf5]">
                  <code dangerouslySetInnerHTML={{ __html: prompt.timelineScript.replace(/\[镜头\s\d+\]/g, match => `<span class="text-purple-400 font-bold">${match}</span>`).replace(/动作:|场景:|描述:|灯光:|运镜:/g, match => `<span class="text-blue-400">${match}</span>`) }}></code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* 分组内小镜头瀑布流布局优化版 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
          {group.shots.map((shotRange, idx) => (
            <GroupedShotCard key={shotRange.shot.id} shotRange={shotRange} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 分组视图中的单个镜头小卡片 (Premium Style)
 */
function GroupedShotCard({ shotRange }: { shotRange: { shot: Shot; startSecond: number; endSecond: number; shotNumber: string } }) {
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

      {/* 强制16:9比例缩略图 */}
      <div className="relative bg-black w-full" style={{ paddingTop: '56.25%' }}>
        {shot.storyboardGridUrl && typeof shot.storyboardGridCellIndex === 'number' ? (
          <div className="absolute inset-0">
            <GridCellImage gridUrl={shot.storyboardGridUrl} cellIndex={shot.storyboardGridCellIndex} />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-700 bg-gray-900 border-b border-white/5 text-xs">
            无画面
          </div>
        )}
      </div>

      {/* 内容信息 (叠在图片下半部分) */}
      <div className="px-3 pb-3 pt-6 -mt-8 relative z-20 flex-grow flex flex-col justify-end">
        <div className="text-xs text-gray-200 line-clamp-2 leading-snug drop-shadow-md font-medium">
          {storyBeat}
        </div>
        {shot.dialogue && (
          <div className="mt-1 text-[10px] text-amber-200/90 italic truncate drop-shadow-md">
            "{shot.dialogue}"
          </div>
        )}
      </div>
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
