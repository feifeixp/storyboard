/**
 * 阶段1: 剧本分析
 * 参考分镜思维链架构
 */

import type { CharacterRef } from '../../types';
import type { ScriptFile } from '../../types/project';
import type { MissingField } from '../characterCompleteness';

export function buildStage1Prompt(
  character: CharacterRef,
  scripts: ScriptFile[],
  missingFields?: MissingField[]
): string {
  // 提取剧本内容
  const scriptContent = scripts
    .map((s, index) => `【第${s.episodeNumber || index + 1}集】\n${s.content}`)
    .join('\n\n');

  // 已有内容提示
  const existingInfo = `
## 角色已有信息（请参考，避免重复）

- 角色名称：${character.name}
- 性别：${character.gender || '未知'}
- 外观描述：${character.appearance ? `已有${character.appearance.length}字` : '❌ 缺失'}
- 已有形态数：${character.forms?.length || 0}个
- 已有能力数：${character.abilities?.length || 0}个
- 经典台词：${character.quote ? '✅ 已有' : '❌ 缺失'}
- 身份演变：${character.identityEvolution ? '✅ 已有' : '❌ 缺失'}

## 本次需要补充的信息

${missingFields?.map(f => `- ${f.label} (权重: ${f.weight}分)`).join('\n') || '全面补充所有缺失信息'}

⚠️ **重要原则**：
1. **只补充缺失的信息**，不要重复已有内容
2. **数组字段**（forms, abilities）：如果已有内容，只添加剧本中明确但未记录的新项
3. **字符串字段**：如果已有内容但不完整，可以扩充但不要完全重写
`;

  return `# 阶段1: 剧本分析

你是一位资深剧本分析师。请按照以下步骤分析角色"${character.name}"。

⚠️ **重要**：必须严格按照【Step X.X 执行中】格式输出，每步都要有"思考过程"和"输出结果"！

${existingInfo}

---

## 剧本内容

${scriptContent}

---

## 执行步骤

【Step 1.1 执行中】时代背景分析

思考过程：
请分析：
1. 剧本发生在什么时代？（如"中国90年代"、"现代都市"、"民国时期"）
2. 角色的性别、年龄段？
3. 角色的职业或身份？
4. 时代特征是什么？

输出结果：
\`\`\`json
{
  "era": "时代背景（如'中国90年代'）",
  "gender": "男/女",
  "ageGroup": "儿童/少年/青年/中年/老年",
  "specificAge": 20,  // 🆕 具体年龄(如18、20、25等),根据剧本推断,用于生图模型
  "occupation": "职业或身份（如'农村女孩'、'大学生'、'商人'）"
}
\`\`\`

---

【Step 1.2 执行中】角色行为分析

思考过程：
请分析：
1. 角色在剧本中的关键行为有哪些？
2. 这些行为体现了什么性格特点？
3. 角色的核心性格是什么？
4. **🆕 重要：这些性格特点应该如何在外貌上体现？**
   - 如果角色是"贪财、自私、油腻"的，外貌应该是"发福、油腻、眼神贪婪"
   - 如果角色是"阴险、恶毒"的，外貌应该是"眼神阴冷、嘴角下垂、面相刻薄"
   - 如果角色是"坚韧、果敢"的，外貌应该是"眉眼坚毅、下颌线紧致、眼神锐利"
   - 如果角色是"懦弱、胆小"的，外貌应该是"眼神闪躲、肩膀微缩、面容怯懦"

输出结果：
\`\`\`json
{
  "keyBehaviors": ["行为1", "行为2", "行为3"],
  "personalityTraits": ["性格特点1（含视觉化描述）", "性格特点2", "性格特点3"]
}
\`\`\`

⚠️ **personalityTraits 要求**：
- 不要只写抽象词（如"精明"、"自私"），而要写**能在外貌上体现的特征**
- 正面性格：坚韧、果敢、温柔、聪慧、清冷、优雅等
- 负面性格：油腻、邋遢、阴险、刻薄、猥琐、凶狠、贪婪、懦弱等
- 每个特征都应该能映射到具体的视觉元素（发型、眼神、五官、体态）

---

【Step 1.3 执行中】角色定位分析

思考过程：
请分析：
1. 角色是主角/配角/反派？
2. 角色的社会阶层是什么？
   - 富裕：有钱、有地位、生活优越
   - 中产：有稳定收入、生活体面
   - 底层：经济困难、生活艰辛

输出结果：
\`\`\`json
{
  "role": "主角/配角/反派",
  "socialClass": "富裕/中产/底层"
}
\`\`\`

---

【Step 1.4 执行中】剧本风格与美学定位

思考过程：
请分析剧本的风格和美学定位：

1. **剧本风格分析**：
   - 这是什么类型的剧本？（题材、类型）
   - 这个剧本的核心卖点是什么？
   - 这个剧本的情感基调是什么？

2. **美学定位判断**：
   - 基于剧本内容，这个角色应该呈现什么样的美学风格？
   - 思考：这个剧本是追求"影视剧美学"（精致、有魅力）还是"纪实美学"（真实、生活化）？
   - 思考：观众期待看到什么样的角色形象？
   - 思考：如何让这个角色既符合剧本风格，又有吸引力？

3. **美学方向确定**：
   - 综合考虑剧本类型、角色定位、观众期待
   - 确定这个角色的美学方向

输出结果：
\`\`\`json
{
  "category": "剧本类型（如'女频言情'、'都市职场'、'历史剧'等）",
  "genre": "具体题材（如'重生/甜宠/逆袭'、'现实主义'等）",
  "aestheticDirection": "美学方向描述（如'追求精致优雅的影视剧美学'、'真实自然的生活美学'、'唯美浪漫的古装美学'等）",
  "reasoning": "为什么这样判断？（基于剧本的哪些内容）"
}
\`\`\`

---

【最终输出】

请将所有步骤的结果合并为一个完整的JSON：

\`\`\`json
{
  "basicInfo": {
    "era": "...",
    "gender": "...",
    "ageGroup": "儿童/少年/青年/中年/老年",
    "specificAge": 20,  // 🆕 具体年龄
    "occupation": "..."
  },
  "behaviorAnalysis": {
    "keyBehaviors": [...],
    "personalityTraits": [...]
  },
  "characterPosition": {
    "role": "...",
    "socialClass": "..."
  },
  "scriptType": {
    "category": "...",
    "genre": "...",
    "aestheticDirection": "...",
    "reasoning": "..."
  },
  "thinking": {
    "step1_1": "你在Step 1.1的思考过程",
    "step1_2": "你在Step 1.2的思考过程",
    "step1_3": "你在Step 1.3的思考过程",
    "step1_4": "你在Step 1.4的思考过程"
  }
}
\`\`\`

请开始执行！`;
}

