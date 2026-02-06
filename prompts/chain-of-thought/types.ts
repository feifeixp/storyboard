/**
 * 思维链系统的类型定义
 */

// ============================================
// 阶段1：剧本分析
// ============================================

export interface ScriptAnalysis {
	  // Step 1.1: 关键信息提取
	  basicInfo: {
	    location: string;
	    characters: string[];
	    timespan: string;
	    keyEvents: string[];
	  };
	  
	  // Step 1.2: 情绪转折点
	  emotionArc: {
	    event: string;
	    emotion: string;
	    intensity: number; // 1-10
	  }[];
	  climax: string;
	  
	  // Step 1.3: 核心冲突
	  conflict: {
	    type: '角色 vs 角色' | '角色 vs 环境' | '角色 vs 内心' | '角色 vs 社会';
	    description: string;
	    resolution: string;
	  };
	  
	  // Step 1.4: 场景段落
	  scenes: {
	    id: string;
	    description: string;
	    duration: string; // 如 "30s"
	    mood: string;
	  }[];

	  // Step 1.5: 剧本清洗与设定提取（用于后续约束）
	  scriptCleaning?: {
	    audioEffects: string[];      // 音效描述，只作情绪参考
	    musicCues: string[];         // BGM 描述，只作情绪参考
	    timeCodes: string[];         // 时间码（已忽略）
	    cameraSuggestions: string[]; // 原剧本的镜头建议（仅供参考，不直接照搬）
	    constraints: {
	      rule: string;             // 规则文案，如 "无物理杀伤力"
	      implication: string;      // 对画面的约束，如 "禁止画物体破碎/爆炸"
	    }[];
	  };

	  // Step 1.6: 剧情缺口与空间设定（用于安全加戏 & 空间连续性）
	  continuityNotes?: {
	    // 剧情/信息缺口：哪些地方"讲得不够清楚"，需要用镜头补足
	    gaps: {
	      id: string; // 如 "G1"
	      type: 'plotGap' | 'objectUnclear' | 'spaceUnclear';
	      relatedScenes: string[]; // 相关场景ID，如 ["S1", "S2"]
	      description: string;     // 缺口/疑点的自然语言描述
	      safeExpansionIdeas: string[]; // 建议用来补足的安全加戏思路（不改变剧情结果/对白）
	    }[];
	    // 场景空间布局 & 隐形设定：只供分镜使用，不回写到剧本文字
	    sceneLayouts: {
	      sceneId: string;          // 对应 scenes 中的 id
	      spatialSummary: string;   // 空间整体概况（例如：左侧是古树，右侧是石台，远处是悬崖）
	      landmarks: string[];      // 关键地标/物体（树、石头、门、祭坛等）
	      defaultPositions: {       // 角色在该场景的"默认站位"（世界坐标语义）
	        [characterName: string]: string; // 如 "晋安: 古树右侧，面向石台"
	      };
	      hiddenSettings?: string;  // 隐形空间设定，只为分镜服务，例如"树后有一条窄小小径"
	    }[];
	  };
	  
	  // 推理过程（用于调试和展示）
	  thinking?: {
	    step1_1?: string;
	    step1_2?: string;
	    step1_3?: string;
	    step1_4?: string;
	    step1_5?: string;
	    step1_6?: string;
	  };
	}

// ============================================
// 阶段2：视觉策略规划（新版 - 支持动态运镜）
// ============================================

export interface VisualStrategy {
  // Step 2.1: 整体视觉风格
  overallStyle?: {
    visualTone: string;
    colorPalette: {
      primary: string;
      secondary: string;
      accent: string;
      mood: string;
    };
    lightingStyle: string;
    compositionTendency: string;
  };

  // Step 2.2: 镜头语言策略（含运镜分布）
  cameraStrategy?: {
    shotProgression: string;
    cameraMoveDistribution?: {
      push: string;   // 推镜头 20%
      pull: string;   // 拉镜头 15%
      pan: string;    // 摇镜头 15%
      track: string;  // 移镜头 20%
      crane: string;  // 升降 10%
      handheld: string; // 手持 10%
      static: string; // 固定 10%
    };
    keyMoments: {
      moment: string;
      shotType: string;
      cameraMove: string;
      angle: string;
      purpose: string;
    }[];
    transitionStyle: string;
  };

  // Step 2.3: 空间连续性方案
  spatialContinuity?: {
    anchors: string[];
    axisLineStrategy: string;
    depthLayers: {
      foreground: string;
      midground: string;
      background: string;
    };
    transitionElements: string[];
  };

  // Step 2.4: 情绪节奏驱动的镜头分配方案（新版）
  rhythmControl?: {
    overallPace: string;
    // 新版：情绪驱动的镜头分配
    emotionDrivenAllocation?: {
      sceneId: string;
      emotionIntensity: number; // 1-10
      rhythmType: '快节奏' | '中节奏' | '慢节奏';
      suggestedShotCount: number;
      avgDuration: string;
      rationale: string;
    }[];
    climaxBuildup?: {
      preClimaxScenes: string[];
      strategy: string;
    };
    resolution: string;
    totalSuggestedShots?: number;
    // 兼容旧版
    sceneRhythms?: {
      sceneId: string;
      pace: string;
      shotDensity: string;
      staticDynamicRatio: string;
      description: string;
    }[];
  };

  // 旧版字段（兼容）
  visualStyle?: {
    name: string;
    referenceWorks: string[];
    keyFeatures: string[];
  };
  perspectivePlan?: any[];
  overallPerspectiveRatio?: any;
  anglePlan?: any[];
  overallAngleRatio?: any;
  lightingPlan?: any[];

  thinking?: {
    step2_1: string;
    step2_2: string;
    step2_3: string;
    step2_4: string;
  };
}

// ============================================
// 阶段3：镜头分配计划（新版 - 支持运镜分布）
// ============================================

export interface ShotPlanning {
  // Step 3.1: 情绪节奏驱动的镜头数量计算（新版）
  shotCount?: {
    totalDuration: string;
    // 新版：情绪驱动的镜头分配
    emotionBasedAllocation?: {
      sceneId: string;
      sceneName: string;
      emotionIntensity: number; // 1-10
      rhythmType: '快节奏' | '中节奏' | '慢节奏';
      shotCount: number;
      avgDuration: string;
      rationale: string;
    }[];
    targetTotal: number;
    rhythmCurve?: string;
    // 兼容旧版
    avgShotDuration?: string;
    sceneAllocation?: {
      sceneId: string;
      duration: string;
      shotCount: number;
      avgDuration: string;
    }[];
  };

  // Step 3.2: 景别和运镜分布
  shotDistribution?: {
    byShotSize: {
      ELS: { count: number; percentage: string };
      LS: { count: number; percentage: string };
      MS: { count: number; percentage: string };
      CU: { count: number; percentage: string };
      ECU: { count: number; percentage: string };
    };
    byCameraMove: {
      push: { count: number; percentage: string };
      pull: { count: number; percentage: string };
      pan: { count: number; percentage: string };
      track: { count: number; percentage: string };
      crane: { count: number; percentage: string };
      handheld: { count: number; percentage: string };
      static: { count: number; percentage: string };
    };
  };

  // Step 3.3: 节奏曲线
  pacingCurve?: {
    scenes: {
      sceneId: string;
      pacing: string;
      shotDurations: number[];
      description: string;
    }[];
    climaxShots: string[];
    rhythmNotes: string;
  };

  // Step 3.4: 镜头列表大纲
  shotList?: {
    shotNumber: string;
    sceneId: string;
    duration: number;
    shotSize: string;
    cameraMove: string;
    briefDescription: string;
  }[];

  // 旧版字段（兼容）
  totalDuration?: string;
  targetShotCount?: number;
  sceneBreakdown?: any[];
  shotSizeDistribution?: any[];
  overallShotSizeRatio?: any;

  thinking?: {
    step3_1: string;
    step3_2: string;
    step3_3: string;
    step3_4?: string;
  };
}

// ============================================
// 阶段4：逐镜详细设计
// ============================================

export interface ShotDesign {
  shotId: string;
  shotNumber: string;
  
  // Step 4.1: 故事节拍
  storyBeat: {
    event: string;
    dialogue: string | null;
    sound: string;
    emotion: string;
  };
  
  // Step 4.2: 景别和角度
  shotSize: 'ELS' | 'LS' | 'MS' | 'CU' | 'ECU';
  cameraAngle: string;
  reason: string;
  
  // Step 4.3: 构图和动线
  composition: {
    perspective: string;
    foreground: string;
    midground: string;
    background: string;
    blocking: string; // 动线描述
    anchor: string;   // 空间锚点
  };
  
  // Step 4.4: 连贯性检查
  continuityCheck?: {
    previousShot: string;
    anchorRelation: string;
    rule180: string;
    lightDirection: string;
  };
  
  // Step 4.5: AI提示词
  aiPromptEn: string;
  aiPromptCn: string;
  videoPromptEn: string;
  videoPromptCn: string;

  // 其他字段
  duration: string;
  frameType: '单镜头→[单帧生成]' | '需动画→[需首尾帧]';
  theory: string; // Framed Ink 理论依据

  // 🆕 导演意图与技术备注
  directorNote?: string;  // 导演意图/情绪说明：为什么这么设计、观众应感受到什么
  technicalNote?: string; // 技术备注/特殊要求：慢动作、手持感、强对比光、景深变化等

  thinking?: string;
}

// ============================================
// 阶段5：质量自检
// ============================================

export interface QualityCheck {
  // Step 5.1: 透视和角度分布检查
  perspectiveCheck: {
    target: Record<string, string>;
    actual: Record<string, string>;
    issues: {
      problem: string;
      affectedShots: string[];
      suggestion: string;
    }[];
  };
  
  angleCheck: {
    target: Record<string, string>;
    actual: Record<string, string>;
    issues: {
      problem: string;
      affectedShots: string[];
      suggestion: string;
    }[];
  };
  
  // Step 5.2: 空间连贯性检查
  continuityCheck: {
    issues: {
      shots: string[];
      problem: string;
      suggestion: string;
    }[];
  };
  
  // Step 5.3: 情绪弧线检查
  emotionCheck: {
    targetArc: string[];
    actualArc: string[];
    issues: {
      shots: string[];
      problem: string;
      suggestion: string;
    }[];
  };
  
  // Step 5.4: 优化建议
  optimizationSuggestions: {
    priority: 1 | 2 | 3;
    shotId: string;
    issue: string;
    suggestion: string;
    expectedImprovement: string;
  }[];
  
  // 总体评分
  overallScore: number; // 0-100
  rating: '专业级' | '良好' | '需改进' | '不合格';
  
  thinking?: {
    step5_1: string;
    step5_2: string;
    step5_3: string;
    step5_4: string;
  };
}

// ============================================
// 完整的思维链状态
// ============================================

export interface ChainOfThoughtState {
  stage1_analysis?: ScriptAnalysis;
  stage2_visual?: VisualStrategy;
  stage3_planning?: ShotPlanning;
  stage4_design?: ShotDesign[];
  stage5_review?: QualityCheck;
  
  // 元数据
  metadata: {
    scriptText: string;
    createdAt: number;
    lastUpdatedAt: number;
    currentStage: 1 | 2 | 3 | 4 | 5;
  };
}

