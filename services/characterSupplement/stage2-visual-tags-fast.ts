/**
 * 阶段2: 视觉标签设计 - 快速模式
 * ⚡ 简化思维链,快速生成
 */

import type { Stage1ScriptAnalysis, BeautyLevel } from './types';
import { getCharacterHistory, formatHistoryForPrompt } from './historyManager';
import { getTemperamentGuideForStage2 } from './getTemperamentReference';

export function buildStage2PromptFast(
  stage1: Stage1ScriptAnalysis,
  beautyLevel: BeautyLevel = 'balanced'
): string {

  // 🆕 获取历史记录
  const history = getCharacterHistory();
  const historyPrompt = formatHistoryForPrompt(history, 3);

  // 🆕 气质模板引导（软匹配，提问式注入）
  const temperamentGuide = getTemperamentGuideForStage2(stage1);

  // 🆕 根据美型程度注入不同的要求 (结构化框架,不硬编码具体内容)
  const beautyRequirements = beautyLevel === 'idealized' ? `

⚠️ **美型程度**: 理想美型 (女频短剧标准)
- 🎯 **核心原则**: 这是**现代拍摄的短剧**(2026年),剧情虽然设定在特定时代,但角色的**妆容、发质、服装质感、剪裁**都使用**现代标准**
- 🎯 **时代背景**: 服装**款式**要符合时代背景的基本合理性,但**质感、剪裁、搭配**使用现代标准,**不限制美型程度和妆容的精致度**
- 🎯 **美型标准**: 参考现代偶像剧、女频短剧的角色美型标准,追求高颜值、高精致度、强镜头感
- **五官**: 注重五官的精致度和立体感,符合现代偶像剧审美
- **妆容**: 精致的现代妆容,注重眼妆和唇妆的设计,提升上镜效果
- **发型**: 考虑多种发型设计方案(如披发、半扎发、编发、盘发等),选择最能体现角色特质的设计,注重层次感、造型感和发质光泽
- **气质**: 优雅迷人,有强烈的视觉吸引力和镜头感,符合偶像剧审美
	- **设计感**: 发型、服饰、配饰等要有独特的设计细节,提升整体造型的精致度和时尚感
	- **特色**: 通过细节设计(如发型层次、配饰点缀、色彩搭配等)增加角色的辨识度和记忆点
	- **⚠️ 服装视觉标签社会阶层约束**（与美型程度同级，不可忽略）：
	  - 当前社会阶层：${stage1.characterPosition.socialClass}
	  - 思考：你为这个角色选择的服装视觉标签，是否既有设计感，又符合他/她当前的经济条件和社会阶层？
	  - 思考：在有限预算下，如何通过颜色搭配、材质细节和小型配饰体现“穷但精致”的感觉，而不是简单堆砌昂贵单品？
	  - 思考：角色现在处于“仍在底层”还是“已经完成逆袭”？请根据角色所处阶段调整服装层次感（底层阶段避免直接使用上层精英的职业套装气场）。
` : beautyLevel === 'balanced' ? `

⚠️ **美型程度**: 平衡美型
- 在真实感和美感之间取得平衡,适度提升角色的视觉吸引力
- 符合时代背景,但略微优化五官、皮肤、发型等细节
- 适度增加设计感,但不过度华丽
` : `

⚠️ **美型程度**: 真实朴素
- 优先考虑真实感,不刻意美化
- 符合时代背景和角色的社会阶层、生活环境
`;

  return `# 阶段2: 视觉标签设计 (快速模式)

你是一位资深角色设计师,请基于阶段1的分析,快速设计5-8个视觉标签。

${historyPrompt}

---

## 输入信息

### 角色基本信息
- 性别: ${stage1.basicInfo.gender}
- 年龄段: ${stage1.basicInfo.ageGroup}
- 时代背景: ${stage1.basicInfo.era}
- 性格特质: ${stage1.behaviorAnalysis.personalityTraits.join('、')}

### 剧本风格
- 剧本类型: ${stage1.scriptType.category}
- 美学方向: ${stage1.scriptType.aestheticDirection}
${beautyRequirements}
${temperamentGuide}
---

## 任务要求

🚨 **覆盖维度硬要求**（必须全部覆盖，避免偏科）：
1. **脸部特征**：眼睛、五官、肤色等（至少1个标签）
2. **发型轮廓**：发型、发色、发质等（至少1个标签）
3. **色彩基调**：整体色彩风格、主色调等（至少1个标签）
4. **材质工艺**：服装材质、工艺细节等（至少1个标签）
5. **辨识度细节**：独特的记忆点、特色细节等（至少1个标签）

快速设计5-8个视觉标签,确保覆盖以上5个维度,每个标签包含:
1. **标签名称**: 简洁有力(如"锐利星眸"、"朴素麻花辫")
2. **具体描述**: 20-30字的视觉描述
3. **设计理由**: 15-20字说明为什么选择

⚠️ **注意**:
- 使用美学词汇(精致、清澈、柔顺等)
- 避免缺陷词汇(杂乱、粗糙、暗沉等)
- 描述静态特征,避免动态状态
- 标签要有层次感(外貌、气质、细节)
- ❌ 不要只关注服装，忽略脸部特征
- ❌ 不要只关注气质，忽略具体视觉元素
- ✅ 必须覆盖以上5个维度，每个维度至少1个标签

---

## 输出格式

直接输出JSON,不需要详细思考过程:

\`\`\`json
{
  "visualTags": [
    {
      "tag": "标签名称",
      "description": "具体的视觉描述(20-30字)",
      "meaning": "为什么选择这个标签(15-20字)"
    }
  ]
}
\`\`\`

请开始!`;
}

