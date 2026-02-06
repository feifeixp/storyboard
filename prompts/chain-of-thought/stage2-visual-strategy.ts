/**
 * 阶段2：视觉策略规划
 * 
 * 基于阶段1的剧本分析结果，制定整体视觉策略
 * 包括：镜头语言、色彩方案、构图原则、节奏控制
 */

import type { ScriptAnalysis, VisualStrategy } from './types';

/**
 * 构建阶段2提示词
 */
export function buildStage2Prompt(analysis: ScriptAnalysis): string {
	  // 基于 Stage 1.5 的剧本清洗结果，提炼约束与提示
	  const scriptCleaningSummary = analysis.scriptCleaning
	    ? `\n### 剧本清洗与约束（来自 Stage 1.5）\n\n` +
	      `- 音效 / BGM 提示：${(analysis.scriptCleaning.audioEffects?.length || 0) + (analysis.scriptCleaning.musicCues?.length || 0)} 条（仅作情绪参考，不直接画出来）\n` +
	      `- 已识别时间码：${analysis.scriptCleaning.timeCodes?.length || 0} 条（已在上一阶段被忽略）\n` +
	      `- 原剧本中的镜头建议：${analysis.scriptCleaning.cameraSuggestions?.length || 0} 条（只作参考，不直接照搬）\n` +
	      `- **必须严格遵守的画面约束**：\n` +
	      `${(analysis.scriptCleaning.constraints || []).map(c => `  - 规则：${c.rule} ｜ 含义：${c.implication}`).join('\n') || '  - 暂无特别约束'}\n\n` +
	      `在本阶段的视觉策略和后续镜头设计中，上述约束视为**硬规则**，禁止违反（例如：有“无物理杀伤力”约束时，不得出现爆炸、破碎等画面）。\n`
	    : '';

	  // 基于 Stage 1.6 的连续性与空间设定，为本阶段提供“安全加戏与空间锚点”参考
	  const continuitySummary = analysis.continuityNotes
	    ? `\n### 剧情缺口与空间设定（来自 Stage 1.6）\n\n` +
	      `- 已识别剧情 / 信息缺口：${analysis.continuityNotes.gaps?.length || 0} 处（需要在镜头中用**安全加戏**补足）\n` +
	      `- 已整理空间布局：${analysis.continuityNotes.sceneLayouts?.length || 0} 个场景（只作为分镜与运镜的空间参考，不回写剧本文字）\n\n` +
	      `在本阶段：\n` +
	      `- 规划镜头语言和空间连续性时，要优先利用这些“缺口”和“空间锚点”提出镜头建议；\n` +
	      `- **禁止**通过新增对白或改变剧情结局来填补缺口，只能用环境、表演、镜头语言等视觉手段补足。\n`
	    : '';

	  return `你是一名资深电影分镜师，精通《Framed Ink》系列理论。

## 你的任务

基于以下剧本分析结果，制定整体视觉策略。

## 阶段1分析结果

### 基本信息
- 地点：${analysis.basicInfo.location}
- 角色：${analysis.basicInfo.characters.join('、')}
- 时长：${analysis.basicInfo.timespan}
- 关键事件：${analysis.basicInfo.keyEvents.join(' → ')}

### 情绪弧线
${analysis.emotionArc.map(e => `- ${e.event}：${e.emotion}（强度${e.intensity}）`).join('\n')}

### 高潮
${analysis.climax}

### 核心冲突
- 类型：${analysis.conflict.type}
- 描述：${analysis.conflict.description}

### 场景段落
${(analysis.scenes || []).map(s => `- ${s.id || 'S?'}：${s.description || '未知'}（${s.duration || '待定'}，${s.mood || '待定'}）`).join('\n') || '- 暂无场景信息'}

${scriptCleaningSummary}${continuitySummary}

---

## 推理步骤

请按以下步骤进行深度思考：

### 【Step 2.1】确定整体视觉风格

思考过程：
1. 根据世界观和情绪基调，确定整体视觉风格
2. 考虑色彩倾向（冷色/暖色/对比）
3. 确定光影风格（高对比/柔和/戏剧性）
4. 选择构图倾向（对称/不对称/动态）

输出格式：
\`\`\`json
{
  "overallStyle": {
    "visualTone": "描述整体视觉调性",
    "colorPalette": {
      "primary": "主色调",
      "secondary": "辅助色",
      "accent": "强调色",
      "mood": "色彩情绪"
    },
    "lightingStyle": "光影风格描述",
    "compositionTendency": "构图倾向"
  }
}
\`\`\`

### 【Step 2.2】规划镜头语言策略

⚠️ **重要说明**：
- 剧本中的"分镜XX"只是叙事段落，不是实际镜头数量
- 本项目成片总时长必须控制在 **90-110秒（1分30秒-1分50秒）** 之间，不得少于90秒
- 以约90秒为基准，每集需要设计 **25-30个实际镜头**（每镜头约3-5秒），并在需要时通过节奏和运镜微调，将总时长控制在1:30-1:50区间内
- AI视频生成限制为5秒或10秒/段
- **动态运镜为主**，固定镜头应控制在10%以内

思考过程：
1. 根据情绪弧线，规划镜头景别变化
2. 确定关键时刻的特殊镜头处理
3. **重点规划运镜分布**（推/拉/摇/移/升降/手持/固定）
4. 设计视角变化（平视/仰视/俯视/主观）
5. 统筹**相机朝向分布**（正面 / 3/4正面 / 侧面 / 背面），避免大量“正面直视镜头”

📐 **相机朝向使用建议**（与后续阶段4保持一致）：
- 常规对话/表演镜头：优先使用 **3/4正面(looking slightly to the right)** 或 **侧面(in profile looking right)**
- 情绪爆发/关键对峙：可以少量使用 **正面(looking forward)**，但整部短片内**不超过1-2个核心镜头**
- 孤独 / 被监视 / 离去：考虑使用 **背面(back to camera)**
- 在 cameraStrategy 中，请对“角度/朝向”的总体分布做文字说明，作为阶段3和阶段4选角度时的**硬约束参考**

**运镜类型建议分布**：
- 推镜头（Push/Dolly In）：20% - 强调、紧张、聚焦情绪
- 拉镜头（Pull/Dolly Out）：15% - 揭示环境、孤立感
- 摇镜头（Pan）：15% - 追踪动作、展示空间
- 移镜头（Track/Dolly）：20% - 跟随角色、动态场景
- 升降镜头（Crane/Boom）：10% - 俯仰变化、戏剧性
- 手持镜头（Handheld）：10% - 紧张、混乱、临场感
- 固定镜头（Static）：10% - 仅用于特写、对话反差

输出格式：
\`\`\`json
{
  "cameraStrategy": {
    "shotProgression": "景别变化规律",
    "cameraMoveDistribution": {
      "push": "20%",
      "pull": "15%",
      "pan": "15%",
      "track": "20%",
      "crane": "10%",
      "handheld": "10%",
      "static": "10%"
    },
    "keyMoments": [
      {
        "moment": "关键时刻描述",
        "shotType": "镜头类型",
        "cameraMove": "具体运镜方式",
        "angle": "视角",
        "purpose": "目的"
      }
    ],
    "transitionStyle": "转场风格"
  }
}
\`\`\`

### 【Step 2.3】设计空间连续性方案

思考过程：
1. 确定空间锚点（贯穿始终的视觉元素）
2. 规划180度轴线的使用
3. 设计前景/中景/背景的层次关系
4. 确保场景转换的视觉连贯性

输出格式：
\`\`\`json
{
  "spatialContinuity": {
    "anchors": ["空间锚点1", "空间锚点2"],
    "axisLineStrategy": "轴线策略",
    "depthLayers": {
      "foreground": "前景元素",
      "midground": "中景元素",
      "background": "背景元素"
    },
    "transitionElements": ["过渡元素"]
  }
}
\`\`\`

### 【Step 2.4】制定情绪节奏驱动的镜头分配方案 ⭐核心步骤

⚠️ **重要**：镜头分配不是机械的"段落×3"，而是根据**情绪强度**和**叙事节奏**动态分配！

参考《分镜脚本设计新手手册》第八章：
- **快节奏（0.5-2秒/镜头）**：动作戏、追逐、打斗、情绪爆发
- **中等节奏（3-5秒/镜头）**：对话、日常场景、信息传递
- **慢节奏（6秒以上/镜头）**：抒情、沉思、环境建立

思考过程：
1. 根据Stage 1的情绪弧线，识别每个段落的**情绪强度**（1-10分）
2. 根据情绪强度确定**节奏类型**和**镜头密度**：
   | 情绪强度 | 节奏类型 | 镜头密度 | 平均时长 |
   |---------|---------|---------|---------|
   | 8-10分 (高潮/转折) | 快节奏 | 4-6个/段落 | 2-3秒 |
   | 5-7分 (发展/对抗) | 中节奏 | 3-4个/段落 | 3-4秒 |
   | 1-4分 (铺垫/抒情) | 慢节奏 | 1-2个/段落 | 5-8秒 |
3. 设计高潮前后的节奏变化（渐快→爆发→渐缓）
4. 规划静态与动态镜头的比例

输出格式：
\`\`\`json
{
  "rhythmControl": {
    "overallPace": "整体节奏描述",
    "emotionDrivenAllocation": [
      {
        "sceneId": "S1",
        "emotionIntensity": 8,
        "rhythmType": "快节奏",
        "suggestedShotCount": 5,
        "avgDuration": "2.5s",
        "rationale": "高潮场景，快速剪辑强化紧张感"
      }
    ],
    "climaxBuildup": {
      "preClimaxScenes": ["S3", "S4"],
      "strategy": "镜头时长从4s逐渐缩短到2s"
    },
    "resolution": "收尾节奏",
    "totalSuggestedShots": 28
  }
}
\`\`\`

---

## 最终输出

请将所有分析结果整合为一个完整的JSON：

\`\`\`json
{
  "overallStyle": { ... },
  "cameraStrategy": { ... },
  "spatialContinuity": { ... },
  "rhythmControl": { ... },
  "thinking": {
    "step2_1": "你的思考过程",
    "step2_2": "你的思考过程",
    "step2_3": "你的思考过程",
    "step2_4": "你的思考过程"
  }
}
\`\`\`

请开始你的分析。`;
}

export default buildStage2Prompt;

