/**
 * 阶段5: 角色事实补充
 * 从剧本中抽取/生成: quote（口头禅）、abilities（能力）、identityEvolution（身份演变）
 *
 * ⚠️ 注意：forms（形态）已移至 Stage5.5 智能形态补全，不再在此阶段处理
 */

import type { Stage1ScriptAnalysis, FormSummary } from './types';
import type { CharacterForm } from '../../types';

export interface Stage5Output {
  quote?: string;
  abilities?: string[];
  identityEvolution?: string;
  /**
   * Stage5.5 旧重量级流程遗留字段，Phase 3 按需生成结果存入此处
   * 注意：forms 的主逻辑在 Stage5.5，此字段仅作为临时载体
   */
  forms?: CharacterForm[];
  /**
   * Stage5.5 Phase 1 轻量扫描输出的形态清单（只含元数据）
   * 由 extractFormSummaries() 生成，存入 character.formSummaries
   */
  formSummaries?: FormSummary[];
}

export function buildStage5Prompt(
  stage1: Stage1ScriptAnalysis,
  characterName: string,
  scriptContent: string,
  missingFields: string[]
): string {
  const needsQuote = missingFields.includes('quote');
  const needsAbilities = missingFields.includes('abilities');
  const needsIdentityEvolution = missingFields.includes('identityEvolution');

  return `# 阶段5: 角色事实补充

你是一位资深剧本分析师，请基于剧本内容，为角色"${characterName}"补充以下信息。

⚠️ **核心原则**：
1. **忠实剧本**：所有信息必须基于剧本内容，不能编造
2. **简洁描述**：直接写出核心内容，不需要附带集数或原文引用
3. **找不到就留空**：如果剧本中没有明确信息，该字段输出 null

---

## 输入信息

### 角色基本信息
- 角色名称：${characterName}
- 性别：${stage1.basicInfo.gender}
- 年龄：${stage1.basicInfo.ageGroup}${stage1.basicInfo.specificAge ? `（${stage1.basicInfo.specificAge}岁）` : ''}
- 角色定位：${stage1.characterPosition.role}
- 社会阶层：${stage1.characterPosition.socialClass}
- 性格特质：${stage1.behaviorAnalysis.personalityTraits.join('、')}

### 剧本内容
\`\`\`
${scriptContent.slice(0, 8000)}${scriptContent.length > 8000 ? '\n...(剧本过长，已截断)' : ''}
\`\`\`

---

## 任务要求

${needsQuote ? `
### 1️⃣ 经典台词/口头禅 (quote)

**优先级**：
1. 优先：从剧本中找到角色的经典台词（重复出现、有特色、能体现性格）
2. 次选：如果没有明确的经典台词，生成一句符合角色性格的口头禅

**输出要求**：
- 如果是剧本原文：必须标注来源（集数+原文）
- 如果是生成的：标注为"生成"，并说明依据

**示例**：
\`\`\`json
{
  "quote": "我命由我不由天！",
  "quoteSource": "Ep 15 原文：'我命由我不由天！天若压我，我便逆天而行！'"
}
\`\`\`

或

\`\`\`json
{
  "quote": "这事儿我说了算。",
  "quoteSource": "生成（基于角色强势、果断的性格特质）"
}
\`\`\`
` : ''}

${needsAbilities ? `
### 2️⃣ 能力/技能 (abilities)

**要求**：
- 必须基于剧本中明确提到的能力/技能/性格特质
- 每条简洁描述，不超过15个字，不需要附带集数或原文引用
- 如果剧本中没有明确提到，输出 null

**示例**：
\`\`\`json
{
  "abilities": [
    "剑术精湛",
    "精通阵法",
    "观察敏锐"
  ]
}
\`\`\`

或

\`\`\`json
{
  "abilities": null
}
\`\`\`
` : ''}

${needsIdentityEvolution ? `
### 3️⃣ 身份演变 (identityEvolution)

**要求**：
- 描述角色在剧本中的身份变化（如果有）
- 必须附带证据（集数+原文片段）
- 如果没有明显的身份演变，输出 null

**示例**：
\`\`\`json
{
  "identityEvolution": "从普通学生成长为魔道魁首（Ep 1：'方源只是一个普通的高中生' → Ep 50：'方源已成为魔道第一人，令正道闻风丧胆'）"
}
\`\`\`

或

\`\`\`json
{
  "identityEvolution": null
}
\`\`\`
` : ''}

---

## 输出格式

⚠️ **重要**：直接输出JSON，不要包含任何其他文字

\`\`\`json
{
${needsQuote ? `  "quote": "经典台词或口头禅（字符串或null）",
  "quoteSource": "来源说明（集数+原文 或 '生成（依据）'）"${needsAbilities || needsIdentityEvolution ? ',' : ''}
` : ''}${needsAbilities ? `  "abilities": ["能力1", "能力2"] 或 null${needsIdentityEvolution ? ',' : ''}
` : ''}${needsIdentityEvolution ? `  "identityEvolution": "身份演变描述（证据）" 或 null
` : ''}}
\`\`\`

⚠️ **JSON格式要求**：
- 必须是合法的JSON格式
- 最后一个字段后面**不要加逗号**
- 所有字段名和字符串值必须用双引号
- 如果某个字段找不到信息，输出 null（不是字符串"null"）

请开始！`;
}

