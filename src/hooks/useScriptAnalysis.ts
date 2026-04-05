import { useState } from 'react';
import { AppStep, Shot } from '../../types';
import { Project } from '../../types/project';
import { 
  ScriptAnalysis, VisualStrategy, ShotPlanning, ShotDesign, QualityCheck 
} from '../../prompts/chain-of-thought/types';
import { ShotListItem } from '../../prompts/chain-of-thought/stage4-shot-design';
import { 
  generateStage1Analysis, generateStage2Analysis, generateStage3Analysis, 
  generateStage4Analysis, generateStage5Review,
  parseStage1Output, parseStage2Output, parseStage3Output, 
  parseStage4Output, parseStage5Output
} from '../../services/openrouter';
import { determineVideoMode } from '../../services/promptValidation';
import { validateAngleDistribution, generateAngleDistributionReport } from '../../services/angleValidation';
import { saveEpisode } from '../../services/d1Storage';
import { generateEpisodeSummary } from '../../services/episodeSummaryGenerator';

export interface UseScriptAnalysisProps {
  script: string;
  currentProject: Project | null;
  currentEpisodeNumber: number | null;
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  setProgressMsg: (msg: string) => void;
  setStreamText: React.Dispatch<React.SetStateAction<string>>;
  setIsLoading: (loading: boolean) => void;
  setCurrentStep: (step: AppStep) => void;
  setEpisodeSummary: (summary: any) => void;
}

export function useScriptAnalysis({
  script,
  currentProject,
  currentEpisodeNumber,
  shots,
  setShots,
  setProgressMsg,
  setStreamText,
  setIsLoading,
  setCurrentStep,
  setEpisodeSummary
}: UseScriptAnalysisProps) {
  
  const [generationMode, setGenerationMode] = useState<'traditional' | 'chain-of-thought'>('chain-of-thought');
  const [cotCurrentStage, setCotCurrentStage] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [cotStage1, setCotStage1] = useState<ScriptAnalysis | null>(null);
  const [cotStage2, setCotStage2] = useState<VisualStrategy | null>(null);
  const [cotStage3, setCotStage3] = useState<ShotPlanning | null>(null);
  const [cotStage4, setCotStage4] = useState<ShotDesign[] | null>(null);
  const [cotStage5, setCotStage5] = useState<QualityCheck | null>(null);
  const [cotRawOutput, setCotRawOutput] = useState<string>('');

  // Helper limits
  const applyFrontViewLimit = (inputShots: Shot[]): Shot[] => {
    let frontCount = 0;
    return inputShots.map((shot) => {
      if (shot.angleDirection === '正面(Front)') {
        frontCount += 1;
        if (frontCount > 2) {
          return { ...shot, angleDirection: '3/4正面(3/4 Front)' as Shot['angleDirection'] };
        }
      }
      return shot;
    });
  };

  const applyAngleDiversityLimit = (inputShots: Shot[]): Shot[] => {
    const totalShots = inputShots.length;
    const maxThreeQuarterFront = Math.max(3, Math.floor(totalShots * 0.25));
    const maxStaticShots = 2;
    let threeQuarterCount = 0;
    let staticCount = 0;
    
    const alternativeDirections: Shot['angleDirection'][] = [
      '正侧面(Full Side)', '1/3侧面(1/3 Side)', '3/4背面(3/4 Back)', '1/3背面(1/3 Back)'
    ];
    const alternativeMoves: Shot['cameraMove'][] = [
      '推镜(Dolly In)', '拉镜(Dolly Out)', '左摇(Pan Left)', '右摇(Pan Right)'
    ];
    let altDirIdx = 0;
    let altMoveIdx = 0;

    return inputShots.map((shot) => {
      let modifiedShot = { ...shot };
      if (modifiedShot.angleDirection === '3/4正面(3/4 Front)') {
        threeQuarterCount += 1;
        if (threeQuarterCount > maxThreeQuarterFront) {
          modifiedShot = { ...modifiedShot, angleDirection: alternativeDirections[altDirIdx % alternativeDirections.length] };
          altDirIdx += 1;
        }
      }
      if (modifiedShot.cameraMove === '固定(Static)') {
        staticCount += 1;
        if (staticCount > maxStaticShots) {
          const newMove = alternativeMoves[altMoveIdx % alternativeMoves.length];
          modifiedShot = {
            ...modifiedShot,
            cameraMove: newMove,
            cameraMoveDetail: (modifiedShot.cameraMoveDetail || '') + '（轻微缓慢）'
          };
          altMoveIdx += 1;
        }
      }
      return modifiedShot;
    });
  };

  /**
   * 根据台词字数计算该镜头所需的最短时长（秒）
   * 中文语速标准：普通对白约3-3.5字/秒，这里取中间咁4字/秒留余量
   * 若有旁白/旁途标识，语速稍慢，按 2.5 字/秒计算
   */
  const calcMinDurationFromDialogue = (dialogue: string, storyBeat: string): number => {
    if (!dialogue || dialogue.trim() === '' || dialogue === '无' || dialogue === '—') return 0;

    // 检测是否包含旁白/旁途标识
    const isNarration = /［旁白］|［旁途］|内心独白|内心口迹/.test(dialogue + storyBeat);
    const charsPerSec = isNarration ? 2.5 : 3.0; // 旁白慢一点

    // 只压缩中文字数（标点符号、空格、英文不计入语速）
    const chineseOnly = dialogue.replace(/[^一-龥]/g, '');
    const charCount = chineseOnly.length;
    if (charCount === 0) return 0;

    const minSec = Math.ceil(charCount / charsPerSec);
    return minSec;
  };

  const convertDesignToShot = (rawDesign: any, idx: number, shotList: any[]): Shot => {
    const design = rawDesign.design || rawDesign;
    const comp = design.composition || {};
    const lightingData = design.lighting || {};
    const camera = design.camera || {};
    const characters = design.characters || {};
    const aiPrompt = rawDesign.aiPrompt || {};
    const storyBeatData = rawDesign.storyBeat || {};

    const shotSize = comp.shotSize || design.shotSize || rawDesign.shotSize || 'MS';
    const cameraAngle = comp.cameraAngle || design.cameraAngle || rawDesign.cameraAngle || '轻微仰拍(Mild Low)';
    const cameraDirection = comp.cameraDirection || design.cameraDirection || rawDesign.cameraDirection || '3/4正面(3/4 Front)';
    const fg = comp.depthLayers?.foreground || comp.foreground || '';
    const mg = comp.depthLayers?.midground || comp.midground || '';
    const bg = comp.depthLayers?.background || comp.background || '';
    const lightingDesc = lightingData.description || lightingData.mood || (lightingData.keyLight ? `主光:${lightingData.keyLight}` : '');
    const cameraMovement = camera.movement || '固定';
    const cameraSpeed = camera.speed || '';
    const storyEvent = storyBeatData.event || characters.actions || shotList[idx]?.briefDescription || `镜头${idx + 1}`;
    const dialogue = storyBeatData.dialogue || '';
    const isMoving = cameraMovement && cameraMovement !== '固定' && cameraMovement !== 'static' && cameraMovement !== 'Static';
    
    let videoMode: 'I2V' | 'Keyframe' | undefined;
    const llmVideoMode = rawDesign.videoMode?.toLowerCase();
    if (llmVideoMode === 'keyframe') {
      videoMode = 'Keyframe';
    } else if (llmVideoMode === 'i2v' || llmVideoMode === 'static') {
      videoMode = 'I2V';
    } else if (isMoving) {
      const durationNum = parseInt(rawDesign.duration || '5', 10) || 5;
      const hasSignificantChange = camera.startFrame && camera.endFrame && camera.startFrame !== '—' && camera.endFrame !== '—' && camera.startFrame !== camera.endFrame;
      const decision = determineVideoMode(storyEvent, durationNum, !!hasSignificantChange, isMoving ? '运动' : '静态', cameraMovement);
      videoMode = decision.mode === 'Keyframe' ? 'Keyframe' : 'I2V';
    } else {
      videoMode = 'I2V';
    }

    const shotSizeMap: Record<string, string> = {
      'ELS': '大远景(ELS)', 'LS': '远景(LS)', 'MLS': '中全景(MLS)',
      'MS': '中景(MS)', 'MCU': '中近景(MCU)', 'CU': '近景(CU)',
      'ECU': '特写(ECU)', 'Macro': '微距(Macro)'
    };
    const angleDirectionMap: Record<string, string> = {
      'front': '正面(Front)', 'front view': '正面(Front)',
      '3/4 front': '3/4正面(3/4 Front)', '3/4 front view': '3/4正面(3/4 Front)',
      'side': '正侧面(Full Side)', 'side view': '正侧面(Full Side)', 'profile': '正侧面(Full Side)',
      'back': '背面(Back)', 'back view': '背面(Back)',
      '正面': '正面(Front)', '侧面': '正侧面(Full Side)', '背面': '背面(Back)'
    };
    const angleHeightMap: Record<string, string> = {
      'eye level': '平视(Eye Level)', 'eye-level': '平视(Eye Level)',
      'low angle': '仰拍(Low Angle)', 'low': '仰拍(Low Angle)',
      'mild low angle': '轻微仰拍(Mild Low)', 'slight low angle': '轻微仰拍(Mild Low)',
      'high angle': '俯拍(High Angle)', 'high': '俯拍(High Angle)',
      'mild high angle': '轻微俯拍(Mild High)', 'slight high angle': '轻微俯拍(Mild High)',
      'extreme high angle': '鸟瞰(Extreme High)', 'top-down': '鸟瞰(Extreme High)',
      'extreme low angle': '蚁视(Extreme Low)',
      '平视': '平视(Eye Level)', '俯拍': '俯拍(High Angle)', '仰拍': '仰拍(Low Angle)'
    };
    const cameraMoveMap: Record<string, string> = {
      'static': '固定(Static)', '固定': '固定(Static)',
      'push in': '推进(Push In)', 'push': '推进(Push In)',
      'pull out': '拉远(Pull Out)', 'pull': '拉远(Pull Out)',
      'pan': '横摇(Pan)', 'pan left': '横摇(Pan)', 'pan right': '横摇(Pan)',
      'tilt': '竖摇(Tilt)', 'tilt up': '竖摇(Tilt)', 'tilt down': '竖摇(Tilt)',
      'track': '跟随(Track)', 'tracking': '跟随(Track)', 'follow': '跟随(Track)',
      'crane': '升降(Crane)', 'crane up': '升降(Crane)', 'crane down': '升降(Crane)',
      'dolly': '移动(Dolly)', 'dolly in': '移动(Dolly)', 'dolly out': '移动(Dolly)',
      'handheld': '手持(Handheld)', 'shake': '手持(Handheld)',
      'arc': '环绕(Arc)', 'orbit': '环绕(Arc)', '360': '环绕(Arc)',
      'zoom': '变焦(Zoom)'
    };

    // 根据台词字数计算最短时长，防止语速过快
    const rawDuration = rawDesign.duration || `${shotList[idx]?.duration || 4}s`;
    const parsedDuration = parseInt(rawDuration) || 4;
    const minDialogueDuration = calcMinDurationFromDialogue(dialogue, storyEvent);
    const finalDuration = minDialogueDuration > parsedDuration
      ? `${minDialogueDuration}s`  // 台词太长，自动抬升时长
      : rawDuration;

    return {
      id: `shot-cot-${idx}`,
      shotNumber: rawDesign.shotNumber?.replace('#', '') || String(idx + 1).padStart(2, '0'),
      duration: finalDuration,
      shotType: isMoving ? '运动' : '静态',
      sceneId: rawDesign.sceneId || shotList[idx]?.sceneId || '',
      videoMode: videoMode,
      storyBeat: storyEvent,
      dialogue: dialogue,
      shotSize: (shotSizeMap[shotSize] || shotSize) as any,
      angleDirection: (angleDirectionMap[cameraDirection.toLowerCase()] || cameraDirection) as any,
      angleHeight: (angleHeightMap[cameraAngle.toLowerCase()] || cameraAngle) as any,
      dutchAngle: comp.dutchAngle || '',
      foreground: fg,
      midground: mg,
      background: bg,
      lighting: lightingDesc,
      cameraMove: (cameraMoveMap[cameraMovement.toLowerCase()] || cameraMovement) as any,
      cameraMoveDetail: cameraSpeed || camera.description || '',
      motionPath: comp.blocking || characters.positions || '',
      startFrame: camera.startFrame || rawDesign.startFrame || '',
      endFrame: camera.endFrame || rawDesign.endFrame || '',
      videoPromptCn: aiPrompt.videoPromptCn || '',
      videoPrompt: aiPrompt.videoPrompt || '',
      directorNote: rawDesign.directorNote || '',
      technicalNote: rawDesign.technicalNote || '',
      promptCn: '',
      promptEn: '',
      endFramePromptCn: '',
      endFramePromptEn: '',
      theory: rawDesign.theory || '',
      status: 'pending'
    };
  };

  const startChainOfThoughtGeneration = async () => {
    if (!script.trim()) {
      alert("请输入脚本内容");
      return;
    }
    
    setIsLoading(true);
    setCotCurrentStage(1);
    setCotStage1(null); setCotStage2(null); setCotStage3(null); setCotStage4(null); setCotStage5(null);
    setShots([]);
    setCurrentStep(AppStep.GENERATE_LIST);
    
    try {
      // Stage 1
      setProgressMsg("【阶段1/5】剧本深度解析...");
      let stage1Text = '';
      for await (const chunk of generateStage1Analysis(script)) {
        stage1Text += chunk;
        setCotRawOutput(stage1Text);
        setStreamText(`【阶段1】剧本深度解析\n\n${stage1Text}`);
      }
      const stage1Result = parseStage1Output(stage1Text);
      setCotStage1(stage1Result);
      setStreamText(prev => prev + '\n\n✅ 阶段1完成！');

      // Stage 2
      setCotCurrentStage(2);
      setProgressMsg("【阶段2/5】视觉策略规划...");
      let stage2Text = '';
      for await (const chunk of generateStage2Analysis(stage1Result)) {
        stage2Text += chunk;
        setCotRawOutput(stage2Text);
        setStreamText(`【阶段2】视觉策略规划\n\n${stage2Text}`);
      }
      const stage2Result = parseStage2Output(stage2Text);
      setCotStage2(stage2Result);
      setStreamText(prev => prev + '\n\n✅ 阶段2完成！');

      // Stage 3
      setCotCurrentStage(3);
      setProgressMsg("【阶段3/5】镜头分配中...");
      let stage3Text = '';
      for await (const chunk of generateStage3Analysis(script, stage1Result, stage2Result)) {
        stage3Text += chunk;
        setCotRawOutput(stage3Text);
        setStreamText(`【阶段3】镜头分配\n\n${stage3Text}`);
      }
      const stage3Result = parseStage3Output(stage3Text);
      setCotStage3(stage3Result);
      setStreamText(prev => prev + '\n\n✅ 阶段3完成！');

      // Stage 4
      setCotCurrentStage(4);
      const shotList = stage3Result.shotList || [];
      const allDesignedShots: ShotDesign[] = [];
      const batchSize = 6;
      for (let i = 0; i < shotList.length; i += batchSize) {
        const batch = shotList.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        setProgressMsg(`【阶段4/5】逐镜设计 ${batchNum}...`);
        
        let stage4Text = '';
        for await (const chunk of generateStage4Analysis(script, stage1Result, stage2Result, stage3Result, batch)) {
          stage4Text += chunk;
          setCotRawOutput(stage4Text);
          setStreamText(`【阶段4】逐镜设计 (批次 ${batchNum})\n\n${stage4Text}`);
        }
        const stage4Result = parseStage4Output(stage4Text);
        allDesignedShots.push(...(stage4Result.shots || []));
        
        const convertedShots = allDesignedShots.map((design, idx) => convertDesignToShot(design, idx, shotList));
        setShots(applyAngleDiversityLimit(applyFrontViewLimit(convertedShots)));
      }
      setCotStage4(allDesignedShots);
      setStreamText(prev => prev + `\n\n✅ 阶段4完成！共设计 ${allDesignedShots.length} 个镜头`);

      // Stage 5
      setCotCurrentStage(5);
      setProgressMsg("【阶段5/5】质量自检与优化...");
      const shotDesignResults = allDesignedShots.map(design => ({
        shotNumber: design.shotNumber,
        design: {
          composition: design.composition,
          lighting: { description: design.theory || '', direction: design.continuityCheck?.lightDirection || 'unknown' },
          camera: { angle: design.cameraAngle, size: design.shotSize, reason: design.reason },
          characters: { emotion: design.storyBeat.emotion, dialogue: design.storyBeat.dialogue, event: design.storyBeat.event }
        },
        aiPrompt: { visual: design.aiPromptCn, motion: design.videoPromptCn, style: design.theory || '', negative: '' }
      }));

      let stage5Text = '';
      for await (const chunk of generateStage5Review(stage1Result, stage2Result, shotDesignResults)) {
        stage5Text += chunk;
        setCotRawOutput(stage5Text);
        setStreamText(`【阶段5】质量自检与优化\n\n${stage5Text}`);
      }
      const stage5Result = parseStage5Output(stage5Text);
      setCotStage5(stage5Result);

      const finalConverted = allDesignedShots.map((design, idx) => convertDesignToShot(design, idx, shotList));
      let finalShots = applyAngleDiversityLimit(applyFrontViewLimit(finalConverted));

      // Post-process prompts
      finalShots = finalShots.map(shot => ({
        ...shot,
        angleDirection: shot.angleDirection?.replace(/\(\d+°\)/g, '').replace(/\(\d+-\d+°\)/g, '').trim() as any,
        angleHeight: shot.angleHeight?.replace(/\(\d+°\)/g, '').replace(/\(\d+-\d+°\)/g, '').trim() as any,
        imagePromptEn: shot.imagePromptEn?.replace(/\([^)]+:\d+\.\d+\)/g, ''),
        endImagePromptEn: shot.endImagePromptEn?.replace(/\([^)]+:\d+\.\d+\)/g, ''),
        videoGenPrompt: shot.videoGenPrompt?.replace(/\([^)]+:\d+\.\d+\)/g, ''),
      }));
      setShots(finalShots);

      if (currentProject && currentEpisodeNumber !== null) {
        const episodeTitle = currentProject.episodes?.find(ep => ep.episodeNumber === currentEpisodeNumber)?.title || `第${currentEpisodeNumber}集`;
        const summary = generateEpisodeSummary(currentEpisodeNumber, episodeTitle, stage1Result, stage2Result, stage3Result, finalShots);
        setEpisodeSummary(summary);
      }

      setCotCurrentStage(null);
      setProgressMsg(`✅ 思维链生成完成！共 ${finalShots.length} 个镜头`);

      if (currentProject && currentEpisodeNumber !== null) {
        const currentEpisode = currentProject.episodes?.find(ep => ep.episodeNumber === currentEpisodeNumber);
        if (currentEpisode) {
          await saveEpisode(currentProject.id, {
            ...currentEpisode, shots: finalShots, status: 'generated', updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('思维链生成失败:', error);
      alert(`思维链生成失败: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resumeChainOfThoughtGeneration = () => {
    alert("断点续生成正在开发中");
  };

  return {
    generationMode, setGenerationMode,
    cotCurrentStage, setCotCurrentStage,
    cotStage1, setCotStage1,
    cotStage2, setCotStage2,
    cotStage3, setCotStage3,
    cotStage4, setCotStage4,
    cotStage5, setCotStage5,
    cotRawOutput, setCotRawOutput,
    startChainOfThoughtGeneration, resumeChainOfThoughtGeneration,
  };
}
