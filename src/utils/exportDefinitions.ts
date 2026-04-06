import { Shot, CharacterRef } from '../../types';

export const exportToJSON = (shots: Shot[]) => {
  const exportData = {
    exportTime: new Date().toISOString(),
    totalShots: shots.length,
    shots: shots.map(shot => ({
      shotNumber: shot.shotNumber,
      duration: shot.duration,
      shotType: shot.shotType,
      storyBeat: shot.storyBeat,
      dialogue: shot.dialogue,
      directorNote: shot.directorNote,
      technicalNote: shot.technicalNote,
      shotSize: shot.shotSize,
      angleDirection: shot.angleDirection,
      angleHeight: shot.angleHeight,
      dutchAngle: shot.dutchAngle,
      foreground: shot.foreground,
      midground: shot.midground,
      background: shot.background,
      lighting: shot.lighting,
      cameraMove: shot.cameraMove,
      cameraMoveDetail: shot.cameraMoveDetail,
      motionPath: shot.motionPath,
      startFrame: shot.startFrame,
      promptCn: shot.promptCn,
      promptEn: shot.promptEn,
      videoPromptCn: shot.videoPromptCn,
      videoPrompt: shot.videoPrompt,
      theory: shot.theory
    }))
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `分镜脚本_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

export const exportToExcel = (shots: Shot[]) => {
  const headers = ['#', '故事', '视觉设计', '画面描述'];

  const escapeCSV = (str: string | undefined) => {
    if (!str) return '';
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = shots.map(shot => {
    const isMotion = shot.shotType === '运动';
    const col1 = `#${shot.shotNumber}·${shot.duration || '—'}·${shot.shotType || '静态'}`;

    const col2Parts = [typeof shot.storyBeat === 'string' ? shot.storyBeat : JSON.stringify(shot.storyBeat) || ''];
    if (shot.dialogue) col2Parts.push(`对白: ${shot.dialogue}`);
    if (shot.directorNote) col2Parts.push(`导演: ${shot.directorNote}`);
    if (shot.technicalNote) col2Parts.push(`备注: ${shot.technicalNote}`);
    const col2 = col2Parts.filter(Boolean).join('\n');

    const angleStr = [shot.angleDirection, shot.angleHeight, shot.dutchAngle].filter(Boolean).join('/');
    const compositionStr = [
      shot.foreground ? `FG:${shot.foreground}` : '',
      shot.midground ? `MG:${shot.midground}` : '',
      shot.background ? `BG:${shot.background}` : '',
    ].filter(Boolean).join(' · ');
    
    const col3Parts = [
      `景:${shot.shotSize || '—'}`,
      `角:${angleStr || '—'}`,
      compositionStr || '',
      `光:${shot.lighting || '—'}`,
      `运:${shot.cameraMove || '—'}${shot.cameraMoveDetail ? `·${shot.cameraMoveDetail}` : ''}`,
      isMotion && shot.motionPath ? `动线:${shot.motionPath}` : '',
    ];
    const col3 = col3Parts.filter(Boolean).join(' | ');
    const col4 = shot.startFrame || '';

    return [
      escapeCSV(col1),
      escapeCSV(col2),
      escapeCSV(col3),
      escapeCSV(col4)
    ];
  });

  const BOM = '\uFEFF';
  const csvContent = BOM + headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `分镜脚本_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

export const exportPromptsChineseCSV = (shots: Shot[]) => {
  const headers = ['#', '类型', '中文提示词', '视频提示词'];
  const escapeCSV = (str: string | undefined) => {
    if (!str) return '';
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = shots.map(shot => [
    escapeCSV(`#${shot.shotNumber}`),
    escapeCSV(shot.shotType),
    escapeCSV(shot.imagePromptCn),
    escapeCSV(shot.videoGenPrompt || shot.videoPromptCn)
  ]);
  const BOM = '\uFEFF';
  const csvContent = BOM + headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `AI提示词_中文版_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

export const exportPromptsEnglishCSV = (shots: Shot[]) => {
  const headers = ['#', 'Type', 'Image Prompt', 'Video Prompt'];
  const escapeCSV = (str: string | undefined) => {
    if (!str) return '';
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = shots.map(shot => [
    escapeCSV(`#${shot.shotNumber}`),
    escapeCSV(shot.shotType === '运动' ? 'Motion' : 'Static'),
    escapeCSV(shot.imagePromptEn),
    escapeCSV(shot.videoGenPrompt || shot.videoPrompt)
  ]);
  const BOM = '\uFEFF';
  const csvContent = BOM + headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `AI_Prompts_English_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

export const exportPromptsToJSON = (shots: Shot[]) => {
  const exportData = {
    exportTime: new Date().toISOString(),
    totalShots: shots.length,
    prompts: shots.map(shot => ({
      shotNumber: shot.shotNumber,
      shotType: shot.shotType,
      imagePromptCn: shot.imagePromptCn || '',
      imagePromptEn: shot.imagePromptEn || '',
      videoGenPrompt: shot.videoGenPrompt || shot.videoPrompt || ''
    }))
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `AI提示词_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

export const downloadScriptText = (shots: Shot[], characterRefs: CharacterRef[]) => {
  const characterIdsInEpisode = new Set<string>();
  shots.forEach(shot => {
    if (shot.assignedCharacterIds) {
      shot.assignedCharacterIds.forEach(id => characterIdsInEpisode.add(id));
    }
  });

  const episodeCharacters = characterRefs.filter(char =>
    characterIdsInEpisode.has(char.id)
  );

  let characterSection = '';
  if (episodeCharacters.length > 0) {
    const characterTexts = episodeCharacters.map(char => {
      const parts = [`👤 ${char.name}`];
      if (char.gender) parts.push(`   性别: ${char.gender}`);
      if (char.appearance) parts.push(`   外貌: ${char.appearance}`);
      if (char.identityEvolution) parts.push(`   身份: ${char.identityEvolution}`);
      if (char.quote) parts.push(`   台词: ${char.quote}`);
      if (char.abilities && char.abilities.length > 0) {
        parts.push(`   能力: ${char.abilities.join('、')}`);
      }
      return parts.join('\n');
    });

    characterSection = [
      ``,
      `╔═══════════════════════════════════════════════════════════════════╗`,
      `║                       本 集 角 色 信 息                           ║`,
      `╚═══════════════════════════════════════════════════════════════════╝`,
      ``,
      characterTexts.join('\n\n'),
      ``,
      `═══════════════════════════════════════════════════════════════════`,
      ``,
      ``
    ].join('\n');
  }

  const content = shots.map(s => {
    const isMotion = s.shotType === '运动';
    const storyBeatText = typeof s.storyBeat === 'string' ? s.storyBeat : JSON.stringify(s.storyBeat);
    const lines = [
      `═══════════════════════════════════════════════════════════════════`,
      `[#${s.shotNumber}] ${s.duration || '—'} | ${s.shotType || '静态'} | ${s.shotSize || '—'}`,
      `═══════════════════════════════════════════════════════════════════`,
      ``,
      `📖 故事: ${storyBeatText || '—'}`,
      `💬 台词: ${s.dialogue || '—'}`,
      ``,
      `───────────────────────────────────────────────────────────────────`,
      `📐 角度: ${s.angleDirection || '—'} + ${s.angleHeight || '—'}`,
      `🎬 运镜: ${s.cameraMove || '—'} ${s.cameraMoveDetail ? `| ${s.cameraMoveDetail}` : ''}`,
      ``,
      `🖼️ 构图:`,
      `   FG: ${s.foreground || '—'}`,
      `   MG: ${s.midground || '—'}`,
      `   BG: ${s.background || '—'}`,
      ``,
      `💡 光影: ${s.lighting || '—'}`,
    ];

    if (s.assignedCharacterIds && s.assignedCharacterIds.length > 0) {
      const characterNames = s.assignedCharacterIds
        .map(id => {
          const char = characterRefs.find(c => c.id === id);
          return char ? char.name : id;
        })
        .join('、');
      lines.push(`👥 角色: ${characterNames}`);
    }

    if (isMotion) {
      lines.push(
        ``,
        `───────────────────────────────────────────────────────────────────`,
        `🎬 画面: ${s.startFrame || '—'}`,
        `🏃 动线: ${s.motionPath || '—'}`
      );
    }
    return lines.join('\n');
  }).join('\n\n\n');

  const header = [
    `╔═══════════════════════════════════════════════════════════════════╗`,
    `║                       分 镜 脚 本 导 出                           ║`,
    `╠═══════════════════════════════════════════════════════════════════╣`,
    `║  镜头总数: ${shots.length.toString().padEnd(10)}                                       ║`,
    `║  角色数量: ${episodeCharacters.length.toString().padEnd(10)}                                       ║`,
    `║  导出时间: ${new Date().toLocaleString().padEnd(22)}                      ║`,
    `╚═══════════════════════════════════════════════════════════════════╝`,
    ``,
    ``
  ].join('\n');

  const blob = new Blob([header + characterSection + content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = "storyboard_script.txt";
  link.click();
  URL.revokeObjectURL(url);
};
