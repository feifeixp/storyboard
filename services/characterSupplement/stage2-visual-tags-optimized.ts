/**
 * 阶段2: 视觉标签设计 - 优化版
 * 🆕 简化提示词,增强强制约束,提高生成质量
 */

import type { Stage1ScriptAnalysis, BeautyLevel } from './types';
import { getCharacterHistory, formatHistoryForPrompt } from './historyManager';
import { getTemperamentGuideForStage2 } from './getTemperamentReference';

export function buildStage2Prompt(
  stage1: Stage1ScriptAnalysis,
  beautyLevel: BeautyLevel = 'balanced'
): string {

  const history = getCharacterHistory();
  const historyPrompt = formatHistoryForPrompt(history, 3);

  // 🆕 气质模板引导（软匹配，提问式注入）
  const temperamentGuide = getTemperamentGuideForStage2(stage1);

  // 根据美型程度生成不同的要求
  const beautyRequirements = beautyLevel === 'idealized' ? `
⚠️ **美型程度**: 理想美型（女频短剧标准）
- 核心原则：现代拍摄标准（2024-2026），妆容、发质、服装质感使用现代标准
- 美型标准：参考现代偶像剧、女频短剧，追求高颜值、高精致度、强镜头感
- 五官：精致立体，符合现代偶像剧审美
- 妆容：精致现代妆容，注重眼妆和唇妆
- 发型：多种方案（披发、半扎发、编发、盘发），注重层次感、造型感、发质光泽
- 气质：优雅迷人，强烈视觉吸引力和镜头感
	- 设计感：发型、服饰、配饰有独特设计细节
	- 特色：通过细节设计增加辨识度和记忆点
	- **⚠️ 服装视觉标签社会阶层约束**（与美型程度同级，不可忽略）：
	  - 当前社会阶层：${stage1.characterPosition.socialClass}
	  - 思考：你为这个角色选择的服装视觉标签，是否既有设计感，又符合他/她当前的经济条件和社会阶层？
	  - 思考：在有限预算下，如何通过颜色搭配、材质细节和小型配饰体现“穷但精致”的感觉，而不是简单堆砌昂贵单品？
	  - 思考：角色现在处于“仍在底层”还是“已经完成逆袭”？请根据角色所处阶段调整服装层次感（底层阶段避免直接使用上层精英的职业套装气场）。
` : beautyLevel === 'balanced' ? `
⚠️ **美型程度**: 平衡美型
- 在真实感和美感之间平衡，适度提升视觉吸引力
- 符合时代背景，略微优化五官、皮肤、发型
- 适度增加设计感，不过度华丽
` : `
⚠️ **美型程度**: 真实朴素
- 优先考虑真实感，不刻意美化
- 符合时代背景和角色的社会阶层、生活环境
`;

  return `# 阶段2: 视觉标签设计

你是专业视觉设计师。**你的核心任务是在最后输出一段完整的 JSON 代码块**——这是本次任务的唯一可交付物，思考步骤只是辅助手段，不可因步骤文字而忘记最终 JSON。

${historyPrompt}

⚠️ **执行要求**：
1. 必须按【Step 2.X 执行中】格式输出
2. 每步文字**极简**（严格控制在字数限制内），把精力留给最终 JSON
3. 必须基于阶段1的分析结果设计
4. 完成 Step 2.3 后，**立即**输出【最终输出】JSON，不允许在 JSON 前后添加额外说明
5. ❌ 只输出步骤文字而没有最终 JSON = 任务失败

---

## 输入信息（来自阶段1）

**角色基本信息**：${stage1.basicInfo.gender}、${stage1.basicInfo.ageGroup}、${stage1.characterPosition.role}、${stage1.characterPosition.socialClass}
**时代背景**：${stage1.basicInfo.era}
**性格特点**：${stage1.behaviorAnalysis.personalityTraits.join('、')}
**剧本类型**：${stage1.scriptType.category}（${stage1.scriptType.genre}）
**美学方向**：${stage1.scriptType.aestheticDirection}
${beautyRequirements}
${temperamentGuide}
---

## 执行步骤

【Step 2.1 执行中】角色理解与视觉定位

思考过程（**20字内**，极简）：
- 角色理解：这个角色应该给观众什么感觉？
- 视觉方向：什么视觉形象能体现其性格？

输出结果（文本，每项10字内）：
- 角色理解：[...]
- 视觉方向：[...]
- 美学策略：[...]

---

【Step 2.2 执行中】视觉标签设计

思考过程（**20字内**，极简）：
设计5-8个视觉标签，具体可视化，体现性格。

输出结果（每条15字内）：
1. [标签]：[描述]
2. [标签]：[描述]
（续列至5-8条）

---

【Step 2.3 执行中】自我批判

思考过程（**15字内**，极简）：
辨识度、性格体现、美感是否达标？

输出结果（文本，每项10字内）：
- 质量检查：[...]
- 改进说明：[...]

---

⚡ **步骤完成。现在立即输出下方 JSON，不要添加任何额外文字。**

【最终输出】

⚠️ **输出要求（必须满足，否则任务失败）**：
- 必须包含所有必需字段（positioning / visualTags / selfCritique / thinking）
- 必须是完整的、可解析的 JSON 格式，用 \`\`\`json 包裹
- ❌ 禁止只输出步骤说明文字而缺少此 JSON

\`\`\`json
{
  "positioning": {
    "roleUnderstanding": "...",
    "visualDirection": "...",
    "aestheticStrategy": "..."
  },
  "visualTags": [
    {
      "tag": "...",
      "description": "...",
      "meaning": "..."
    }
  ],
  "selfCritique": {
    "qualityCheck": "...",
    "improvements": "..."
  },
  "thinking": {
    "step2_1": "Step 2.1的思考过程",
    "step2_2": "Step 2.2的思考过程",
    "step2_3": "Step 2.3的思考过程"
  }
}
\`\`\`

请开始执行！`;
}


