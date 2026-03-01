/**
 * 阶段3: 外貌描述创作
 * 参考分镜思维链架构
 */

import type { Stage1ScriptAnalysis, Stage2VisualTags } from './types';

export function buildStage3Prompt(
  stage1: Stage1ScriptAnalysis,
  stage2: Stage2VisualTags
): string {
  return `# 阶段3: 外貌描述创作

你是一位资深角色造型师。请像专业造型师一样思考，为这个角色设计外貌。

⚠️ **重要**：必须严格按照【Step X.X 执行中】格式输出，每步都要有"思考过程"和"输出结果"！

---

## 输入信息

### 角色基本信息（来自阶段1）
- 时代背景：${stage1.basicInfo.era}
- 性别：${stage1.basicInfo.gender}
- 年龄段：${stage1.basicInfo.ageGroup}
- 角色定位：${stage1.characterPosition.role}
- 社会阶层：${stage1.characterPosition.socialClass}
- 性格特点：${stage1.behaviorAnalysis.personalityTraits.join('、')}

### 剧本风格（来自阶段1）
- 剧本类型：${stage1.scriptType.category}
- 题材：${stage1.scriptType.genre}
- 美学方向：${stage1.scriptType.aestheticDirection}

### 视觉标签（来自阶段2）
${stage2.visualTags.map(t => `- ${t.tag}：${t.description} - ${t.meaning}`).join('\n')}

---

## 执行步骤

【Step 3.1 执行中】角色理解

思考过程：
请深入理解这个角色：

1. **角色定位**：这个角色是什么样的人？
   - 性格：${stage1.behaviorAnalysis.personalityTraits.join('、')}
   - 身份：${stage1.characterPosition.role}（${stage1.characterPosition.socialClass}）
   - 年龄段：${stage1.basicInfo.ageGroup}

2. **故事线**：这个角色在剧中的作用是什么？
   - 剧本类型：${stage1.scriptType.category}
   - 题材：${stage1.scriptType.genre}
   - 美学方向：${stage1.scriptType.aestheticDirection}

3. **情感基调**：这个角色应该给观众什么感觉？
   - 基于性格和故事线，思考角色应该传达的情感

4. **魅力定位**：作为影视剧角色，应该具有什么样的魅力？
输出结果：
\`\`\`json
{
  "understanding": "你对这个角色的理解（100字以内）",
  "emotionalTone": "这个角色应该传达的情感基调",
  "charmPoint": "这个角色的魅力点是什么"
}
\`\`\`

---

【Step 3.2 执行中】视觉风格定位

思考过程：
基于对角色的理解，确定视觉风格：

1. **美学方向**：这个角色应该参考什么样的美学风格？
   - Stage1分析的美学方向：${stage1.scriptType.aestheticDirection}
   - 思考：基于这个美学方向，如何设计外貌？
   - 思考：这个角色的身份和性格，适合什么样的外貌风格？

2. **真实与美的平衡**：如何在符合时代背景的同时，保持角色的魅力？
   - 时代：${stage1.basicInfo.era}
   - 身份：${stage1.characterPosition.socialClass}
   - 思考：如何让角色既真实又有吸引力？

3. **性格体现**：外貌如何体现角色的性格特质？
   - 性格：${stage1.behaviorAnalysis.personalityTraits.join('、')}
   - 思考：什么样的外貌特征能暗示这种性格？

输出结果：
\`\`\`json
{
  "aestheticDirection": "美学方向（如：清新自然、优雅精致、锐利强势等）",
  "balanceStrategy": "如何平衡真实与美",
  "personalityExpression": "如何通过外貌体现性格"
}
\`\`\`

---

【Step 3.3 执行中】外貌特征设计

思考过程：
设计具体的外貌特征，并解释每个选择：

1. **发型设计**：
   - 选择什么发型？为什么？
   - 思考：这个发型是否符合时代？是否符合性格？是否有美感？

2. **眼睛设计**：
   - 如何设计眼睛来体现性格？
   - 思考：什么样的眼神能体现"${stage1.behaviorAnalysis.personalityTraits.join('、')}"？

3. **五官设计**：
   - 如何设计五官来体现美感和特色？
   - 思考：什么样的五官适合这个角色？

4. **独特特征**（可选）：
   - 是否需要独特特征来增加辨识度？（如小雀斑、小痣、特殊眼神等）
   - 如果需要，为什么？这个特征如何增加角色魅力？

⚠️ **设计原则**：
- 每个选择都要解释"为什么"
- 不要使用缺陷词汇（如：粗糙、暗沉、憔悴等）
- 通过具体特征暗示性格，而非直接写性格词汇
输出结果：
\`\`\`json
{
  "hairDesign": "发型设计及理由",
  "eyesDesign": "眼睛设计及理由",
  "facialDesign": "五官设计及理由",
  "uniqueFeature": "独特特征（如果有）及理由"
}
\`\`\`

---

【Step 3.4 执行中】自我批判

思考过程：
检查你的设计质量：

1. ✅ **魅力检查**：这个设计是否有魅力和吸引力？
   - 思考：作为影视剧角色，这个外貌是否能吸引观众？

2. ✅ **角色定位检查**：是否符合这个角色的定位？
   - 思考：这个外貌是否符合角色的性格、身份、年龄段？

3. ✅ **性格体现检查**：是否体现了角色的性格特质？
   - 思考：观众能否从外貌感受到角色的性格？

4. ✅ **品质检查**：设计是否精致、有品质？
   - 思考：每个细节是否用心设计？

5. ❌ **问题检查**：是否存在以下问题？
   - 过度具体的数字（如"10cm"、"2cm"）
   - 诡异描述（如"可疑银粉"、"病态"）
   - 过度设计（如"珍珠母贝光泽"）
   - 老气、土气、缺乏美感

⚠️ **如果发现任何问题，请立即改进后再输出！**

输出结果：
\`\`\`json
{
  "qualityCheck": "质量检查结果（是否满意？）",
  "improvements": "如果有改进，说明改进了什么"
}
\`\`\`

---

【最终输出】

⚠️ **输出要求**：
- 只包含具体的视觉描述
- 不包含评论性总结（如"体现了XX特质"）
- 不包含设计思路解释
- ❌ 严禁描述服装！

请将所有步骤的结果合并为一个完整的JSON：

\`\`\`json
{
  "roleUnderstanding": {
    "understanding": "...",
    "emotionalTone": "...",
    "charmPoint": "..."
  },
  "visualStyle": {
    "aestheticDirection": "...",
    "balanceStrategy": "...",
    "personalityExpression": "..."
  },
  "appearanceDesign": {
    "hairDesign": "...",
    "eyesDesign": "...",
    "facialDesign": "...",
    "uniqueFeature": "..."
  },
  "selfCritique": {
    "qualityCheck": "...",
    "improvements": "..."
  },
  "finalDescription": {
    "mainCharacter": "中国人，${stage1.basicInfo.gender}，${stage1.basicInfo.ageGroup}，${stage1.basicInfo.era}，8头身标准",
    "facialFeatures": "外貌特征的完整描述（100-150字，只包含具体视觉信息）"
  },
  "thinking": {
    "step3_1": "你在Step 3.1的思考过程",
    "step3_2": "你在Step 3.2的思考过程",
    "step3_3": "你在Step 3.3的思考过程",
    "step3_4": "你在Step 3.4的思考过程"
  }
}
\`\`\`

请开始执行！`;
}

