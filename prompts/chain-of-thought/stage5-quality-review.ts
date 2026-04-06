/**
 * 阶段5：质量自检与优化
 * 
 * 输入：阶段4的所有镜头设计
 * 输出：质量评估、问题识别、优化建议
 */

import type { ScriptAnalysis, VisualStrategy, ShotPlanning } from './types';

export interface ShotDesignResult {
  shotNumber: string;
  design: {
    composition: any;
    lighting: any;
    camera: any;
    characters: any;
  };
  aiPrompt: {
    visual: string;
    motion: string;
    style: string;
    negative: string;
  };
}

export function buildStage5Prompt(
  stage1: ScriptAnalysis,
  stage2: VisualStrategy,
  allShots: ShotDesignResult[]
): string {
  // 计算镜头数量检查
  const shotCount = allShots.length;
  const minimumShots = 24;
  const isShotCountSufficient = shotCount >= minimumShots;

  return `# 阶段5：质量自检与优化

你是一位资深电影分镜师和质量审核专家，精通《Framed Ink》系列理论。
现在你需要审核所有镜头设计，识别问题并提供优化建议。

---

## 🚨🚨🚨 最重要的检查：镜头数量

**当前镜头数：${shotCount}个**
**最少要求：${minimumShots}个**
**状态：${isShotCountSufficient ? '✅ 合格' : '❌ 不合格！镜头数量严重不足！'}**

${!isShotCountSufficient ? `
### ⚠️⚠️⚠️ 镜头数量不足是最严重的问题！

你必须在 issues 数组的第一条指出这个问题！

建议的解决方案：
1. 为每个动作段落增加「准备→动作→效果」三步分解
2. 增加「环境反应镜头」（如波纹扫过石柱）
3. 增加「角色反应镜头」（如魔教教主惊恐特写）
4. 增加「UI界面特写镜头」（如警告弹窗）
5. 增加「氛围渲染镜头」（如天空裂开）
` : ''}

---

## 审核标准

### 0. 镜头数量（最重要！）
- 总镜头数是否 >= ${minimumShots}个？
- 每个剧本段落是否有 3-5 个镜头？
- 是否有任何段落只有 1-2 个镜头？

### 1. 叙事连贯性
- 镜头之间的视觉过渡是否流畅？
- 情绪弧线是否清晰可见？
- 高潮是否有足够的铺垫？

### 2. 视觉多样性
- 景别分布是否合理？
- 运镜是否丰富？
- 是否避免了过多的平视/固定镜头？

### 2.1 角度分布检查（⚠️⚠️⚠️ 最高优先级！必须执行！）

**🚨🚨🚨 硬性规则（违反=任务失败）：**

⚠️ **你必须逐个统计并检查以下角度分布规则，不能跳过！**

**步骤1：统计正面镜头**
- 遍历所有镜头，统计 cameraDirection 包含 "正面" 或 "Front" 的镜头数量
- 计算占比 = 正面镜头数 / 总镜头数
- **要求：≤7%（30个镜头最多2个）**
- **如果超标（>2个或>7%）**：
  - ✅ 必须在 angleDistributionCheck.frontView 中设置 passed: false
  - ✅ 必须在 issues 数组中添加一条记录（示例格式）：
    { shotNumber: "GLOBAL", category: "angleDistribution", severity: "critical", problem: "正面镜头超标：X个（X%），最多2个（≤7%）", suggestion: "将镜头 #XX, #XX, #XX 的角度从正面改为3/4正面" }

**步骤2：统计平视镜头**
- 遍历所有镜头，统计 cameraAngle 包含 "平视" 或 "Eye Level" 的镜头数量
- 计算占比 = 平视镜头数 / 总镜头数
- **要求：10-15%（30个镜头约3-5个）**
- **如果不符（<10% 或 >15%）**：
  - ✅ 必须在 angleDistributionCheck.eyeLevel 中设置 passed: false
  - ✅ 必须在 issues 数组中添加一条记录（示例格式）：
    { shotNumber: "GLOBAL", category: "angleDistribution", severity: "high", problem: "平视镜头占比不符：X个（X%），要求10-15%", suggestion: "调整部分镜头的角度高度" }

**步骤3：统计极端角度镜头**
- 遍历所有镜头，统计 cameraAngle 包含以下任一关键词的镜头数量：
  - "极端仰拍" 或 "Extreme Low"
  - "极端俯拍" 或 "Extreme High"
  - "鸟瞰" 或 "Bird"
  - "虫视" 或 "Worm"
- 计算占比 = 极端角度镜头数 / 总镜头数
- **要求：≥15%（30个镜头至少5个）**
- **如果不足（<15%）**：
  - ✅ 必须在 angleDistributionCheck.extremeAngles 中设置 passed: false
  - ✅ 必须在 issues 数组中添加一条记录（示例格式）：
    { shotNumber: "GLOBAL", category: "angleDistribution", severity: "high", problem: "极端角度不足：X个（X%），要求≥15%", suggestion: "将部分中度角度改为极端角度，增加视觉冲击力" }

**步骤4：检查连续性违规**
- 检查是否有连续2个以上平视镜头
- 检查是否有连续3个以上3/4正面镜头
- **如果违反**：
  - ✅ 必须在 angleDistributionCheck.consecutiveViolations 中添加记录
  - ✅ 必须在 issues 数组中指出具体位置（示例格式）：
    { shotNumber: "#05-#07", category: "angleContinuity", severity: "medium", problem: "连续3个3/4正面镜头，缺少角度变化", suggestion: "将#06改为正侧面或1/3侧面" }

### 2.2 连续性规则检查（🆕 必须检查！）

**参考文档**：\`.augment/rules/分镜设计连续性三原则.txt\`

你必须检查分镜连续性：

1. **景别连续性**
   - 检查是否有连续3个以上相同景别
   - 如果违反：必须在 issues 数组中指出具体位置，severity 设为 "medium"
   - 建议：按递进或交替方式调整（如 远景→中景→近景）

2. **角度连续性**
   - 检查是否有连续3个以上相同角度（朝向+高度）
   - 如果违反：必须在 issues 数组中指出具体位置，severity 设为 "medium"
   - 建议：保持视觉变化

3. **运镜连续性**
   - 统计固定镜头和运动镜头的比例
   - 要求：固定镜头 ≤30%，运动镜头 ≥70%
   - 检查是否有连续5个以上固定镜头
   - 如果违反：必须在 issues 数组中指出，severity 设为 "high"
   - 建议：动静结合，避免全是固定或全是运动

### 3. 《Framed Ink》原则
- 构图是否引导视线？
- 光影是否服务于情绪？
- 空间层次是否清晰？

### 4. AI生成可行性
- 提示词是否清晰？
- 是否避免了AI难以生成的复杂动作？
- 运镜描述是否明确？

---

## 输入信息

### 情绪弧线
${stage1.emotionArc.map(e => `- ${e.event}：${e.emotion}（强度${e.intensity}）`).join('\n')}

### 视觉策略摘要
- 整体节奏：${stage2.rhythmControl?.overallPace || '待定'}
- 高潮镜头：${stage2.rhythmControl?.climaxBuildup || '待定'}

### 所有镜头（${allShots.length}个）
${allShots.map(s => `
**${s.shotNumber}**
- 构图：${s.design.composition?.framing || '未指定'}
- 光影：${s.design.lighting?.mood || '未指定'}
- 运镜：${s.design.camera?.movement || '未指定'}
- AI提示词：${s.aiPrompt?.visual?.substring(0, 100) || '未生成'}...
`).join('\n')}

---

## 输出格式

\`\`\`json
{
  "shotCountCheck": {
    "current": ${shotCount},
    "minimum": ${minimumShots},
    "passed": ${isShotCountSufficient},
    "shortage": ${isShotCountSufficient ? 0 : minimumShots - shotCount}
  },
  "overallScore": 85,
  "categoryScores": {
    "shotCount": ${isShotCountSufficient ? 100 : Math.max(0, Math.round(shotCount / minimumShots * 100))},
    "narrativeContinuity": 90,
    "visualDiversity": 80,
    "framedInkPrinciples": 85,
    "aiGenerationFeasibility": 85
  },
  "angleDistributionCheck": {
    "frontView": {
      "count": 0,
      "ratio": "0%",
      "passed": true,
      "message": "正面镜头占比符合规则（≤7%）"
    },
    "eyeLevel": {
      "count": 0,
      "ratio": "0%",
      "passed": true,
      "message": "平视镜头占比符合规则（10-15%）"
    },
    "extremeAngles": {
      "count": 0,
      "ratio": "0%",
      "passed": true,
      "message": "极端角度占比符合规则（≥15%）"
    },
    "consecutiveViolations": []
  },
  "continuityCheck": {
    "shotSizeContinuity": {
      "consecutiveViolations": [],
      "passed": true,
      "message": "景别连续性符合规则"
    },
    "angleContinuity": {
      "consecutiveViolations": [],
      "passed": true,
      "message": "角度连续性符合规则"
    },
    "cameraMoveContinuity": {
      "staticRatio": "0%",
      "motionRatio": "0%",
      "consecutiveStaticViolations": [],
      "passed": true,
      "message": "运镜连续性符合规则"
    }
  },
  "issues": [
    ${!isShotCountSufficient ? `{
      "shotNumber": "GLOBAL",
      "category": "shotCount",
      "severity": "critical",
      "problem": "镜头数量严重不足！当前${shotCount}个，最少需要${minimumShots}个",
      "suggestion": "需要增加${minimumShots - shotCount}个镜头。建议：1.为动作段落增加准备/效果镜头 2.增加环境反应镜头 3.增加角色反应特写"
    },` : ''}
    {
      "shotNumber": "#05",
      "category": "visualDiversity",
      "severity": "medium",
      "problem": "连续3个中景，缺少景别变化",
      "suggestion": "将#05改为远景拉镜头，增加空间感"
    }
  ],
  "highlights": [
    {
      "shotNumbers": ["#17", "#18"],
      "reason": "高潮转折处理出色，推镜头到特写完美捕捉情绪爆发"
    }
  ],
  "optimizations": [
    {
      "shotNumber": "#05",
      "field": "aiPrompt.visual",
      "before": "原提示词",
      "after": "优化后的提示词"
    }
  ],
  "summary": "整体质量评估总结"
}
\`\`\`

---

${!isShotCountSufficient ? `
## 🚨 最重要提醒

镜头数量不足是最严重的问题！你的第一条 issue 必须是关于镜头数量不足的！
` : ''}

请进行全面的质量审核，并提供具体的优化建议。
`;
}

