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
              {projectName || '未命名项目'} - 第{episodeNumber || '?'}集 - 共 {shots.length} 个镜头 · {videoGroups.length} 个视频分组
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

        {/* 视图模式切换 */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[var(--color-surface)] rounded-lg p-1 border border-[var(--color-border)]">
            <button
              onClick={() => setViewMode('original')}
              className={`px-4 py-2 rounded-md transition-all ${
                viewMode === 'original'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              🎬 原始镜头视图
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-4 py-2 rounded-md transition-all ${
                viewMode === 'grouped'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              📦 分组视频视图
            </button>
          </div>
          <span className="text-sm text-[var(--color-text-secondary)]">
            {viewMode === 'grouped' ? '按场景+15秒限制分组，适合视频生成' : '按原始顺序展示所有镜头'}
          </span>
        </div>

        {/* 故事板内容 */}
        <div ref={storyboardRef} className="bg-white p-8 rounded-lg">
          {viewMode === 'original' ? (
            /* 原始视图 */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {shots.map((shot, idx) => (
                <React.Fragment key={shot.id}>
                  <StoryboardCard shot={shot} index={idx} />
                </React.Fragment>
              ))}
            </div>
          ) : (
            /* 分组视图 */
            <div className="space-y-8">
              {videoGroups.map((group, groupIdx) => {
                const prompt = videoGroupPrompts.find(p => p.groupId === group.id);
                return (
                  <React.Fragment key={group.id}>
                    <VideoGroupCard
                      group={group}
                      prompt={prompt}
                      groupIndex={groupIdx}
                    />
                  </React.Fragment>
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
 * 单个故事板卡片组件
 */
function StoryboardCard({ shot, index }: { shot: Shot; index: number }) {
  const storyBeat = getShotStoryBeat(shot);

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
 * 视频分组卡片组件
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
    <div className="border-2 border-[var(--color-primary)]/30 rounded-lg overflow-hidden bg-gradient-to-br from-gray-50 to-white">
      {/* 分组标题 */}
      <div className="bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] text-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">📦 {group.groupName}</h3>
            <p className="text-sm opacity-80 mt-1">
              {group.sceneName && `场景: ${group.sceneName} · `}
              时长: {group.totalDuration.toFixed(1)}秒 · {group.shots.length} 个镜头
            </p>
          </div>
          <span className="text-4xl opacity-50">{groupIndex + 1}</span>
        </div>
      </div>

      {/* 分组内容 */}
      <div className="p-6">
        {/* 视频生成提示词 */}
        {prompt && (
          <div className="mb-6">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="flex items-center gap-2 text-[var(--color-primary)] font-semibold mb-3 hover:underline"
            >
              📹 视频生成提示词 (Seedance 2.0)
              <span className="text-xs bg-[var(--color-primary)]/10 px-2 py-1 rounded">
                {showPrompt ? '收起' : '展开'}
              </span>
            </button>
            {showPrompt && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <pre className="text-sm text-[var(--color-text)] whitespace-pre-wrap font-mono">
                  {prompt.timelineScript}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(prompt.fullPromptCn);
                  }}
                  className="mt-3 text-xs text-[var(--color-primary)] hover:underline"
                >
                  📋 复制完整提示词
                </button>
              </div>
            )}
          </div>
        )}

        {/* 镜头网格 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {group.shots.map((shotRange, idx) => (
            <React.Fragment key={shotRange.shot.id}>
              <GroupedShotCard shotRange={shotRange} />
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 分组视图中的单个镜头卡片
 */
function GroupedShotCard({ shotRange }: { shotRange: { shot: Shot; startSecond: number; endSecond: number; shotNumber: string } }) {
  const { shot } = shotRange;
  const storyBeat = getShotStoryBeat(shot);

  return (
    <div className="rounded-lg overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all bg-[var(--color-surface-solid)]">
      {/* 镜头编号 + 时间段 */}
      <div className="bg-gradient-to-r from-[var(--color-primary-light)] to-[var(--color-primary)]/80 text-white px-3 py-2 flex justify-between items-center">
        <span className="font-bold text-sm">镜头 {shot.shotNumber}</span>
        <span className="text-xs bg-black/20 px-2 py-1 rounded">
          {shotRange.startSecond.toFixed(0)}-{shotRange.endSecond.toFixed(0)}s
        </span>
      </div>

      {/* 图片 */}
      <div className="relative bg-black" style={{ paddingTop: '56.25%' }}>
        {shot.storyboardGridUrl && typeof shot.storyboardGridCellIndex === 'number' ? (
          <GridCellImage gridUrl={shot.storyboardGridUrl} cellIndex={shot.storyboardGridCellIndex} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
            暂无图片
          </div>
        )}
      </div>

      {/* 信息 */}
      <div className="p-3">
        <div className="text-xs text-[#fafaf9] line-clamp-2 mb-2">{storyBeat}</div>
        {shot.dialogue && (
          <div className="text-xs text-[#e8c9a0] italic truncate">"{shot.dialogue}"</div>
        )}
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
