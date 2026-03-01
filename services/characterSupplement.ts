/**
 * 角色补充提取服务
 * 针对完整度不足的角色，智能补充缺失信息
 */

import { CharacterRef, CharacterForm } from '../types';
import { ScriptFile } from '../types/project';
import { MissingField } from './characterCompleteness';
import { getLLMChatCompletionsURL } from './openrouter';

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * 补充角色详细信息
 * @param character 需要补充的角色
 * @param missingFields 缺失的字段列表
 * @param scripts 项目的所有剧本
 * @param model AI模型
 * @returns 补充后的角色信息
 */
export async function supplementCharacterDetails(
  character: CharacterRef,
  missingFields: MissingField[],
  scripts: ScriptFile[],
  model: string = DEFAULT_MODEL
): Promise<CharacterRef> {

  try {
    // 构建提示词
    const prompt = buildSupplementPrompt(character, missingFields, scripts);

    // 调用 LLM
    const response = await fetch(getLLMChatCompletionsURL(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER1_API_KEY}`,
        'HTTP-Referer': window.location.origin,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      })
    });

    if (!response.ok) {
      if (response.status === 402) {
        throw new Error('API余额不足，请检查OpenRouter账户余额');
      }
      if (response.status === 401) {
        throw new Error('API Key无效，请检查VITE_OPENROUTER1_API_KEY配置');
      }
      throw new Error(`API请求失败: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('API 返回内容为空');
    }

    // 解析返回的 JSON
    const supplementData = parseSupplementResponse(content);

    // 合并到原角色数据，保留原ID
    const updatedCharacter: CharacterRef = {
      ...character,
      ...supplementData,
      id: character.id, // 保持原ID不变
    };

    return updatedCharacter;

  } catch (error) {
    console.error('补充角色信息失败:', error);
    throw error;
  }
}

/**
 * 构建补充提示词
 */
function buildSupplementPrompt(
  character: CharacterRef,
  missingFields: MissingField[],
  scripts: ScriptFile[]
): string {
  // 合并所有剧本内容
  const combinedContent = scripts.map(s =>
    `=== 第${s.episodeNumber || '?'}集 ===\n${s.content}`
  ).join('\n\n');

  const missingFieldsList = missingFields.map(f => `- ${f.label} (权重: ${f.weight}分)`).join('\n');

  return `# 任务：补充角色"${character.name}"的详细信息

你是一位资深影视策划，需要从剧本中深度挖掘角色"${character.name}"的详细信息。

## 当前角色信息
- 名称：${character.name}
- 性别：${character.gender || '未知'}
- 外观：${character.appearance || '未填写'}
- 身份演变：${character.identityEvolution || '未填写'}
- 经典台词：${character.quote || '未填写'}
- 已有形态数：${character.forms?.length || 0}
- 已有能力数：${character.abilities?.length || 0}

## 需要补充的信息
${missingFieldsList}

## 补充要求

### 1. 多形态/换装图鉴（如果缺失）
- 仔细阅读剧本，找出"${character.name}"在不同集数/情境中的**所有不同造型/形态**
- 每个形态必须包含：
  - name: 形态名称（带emoji，如 "🎒 高中校服"）
  - episodeRange: 出现集数（如 "Ep 1-20"）
  - description: 详细视觉描述（100-200字，包含外貌特征、服饰造型）
  - note: 备注（如 "日常伪装期"）
  - visualPromptCn: 中文视觉提示词（用于AI生图）
  - visualPromptEn: 英文视觉提示词（用于AI生图）

### 2. 经典台词（如果缺失）
- 提取最能代表"${character.name}"性格/理念的一句话
- 要求：原文引用，不要改编

### 3. 身份演变（如果缺失）
- 用箭头连接身份变化，如："高中生 ➔ 觉醒者 ➔ 救世主"
- 要求：简洁，3-5个阶段

### 4. 能力进化（如果缺失）
- 列出角色的核心能力及其成长轨迹
- 格式：数组，如 ["基础感知", "数据操控", "现实改写"]

### 5. 外观描述（如果不够详细）
- 使用三段式格式：
  - 【外貌特征】发型、眼睛、五官、表情、体态、肤色
  - 【主体人物】风格定位（如"日系动漫风格年轻男性"）
  - 【服饰造型】默认服装描述
- 要求：至少150字

## 剧本内容
${combinedContent.slice(0, 80000)}

## 输出格式
请以JSON格式输出补充后的完整角色信息：

\`\`\`json
{
  "name": "${character.name}",
  "gender": "男/女",
  "appearance": "详细外观描述...",
  "identityEvolution": "身份1 ➔ 身份2 ➔ 身份3",
  "quote": "经典台词原文",
  "abilities": ["能力1", "能力2", "能力3"],
  "forms": [
    {
      "id": "form-${Date.now()}-1",
      "name": "🎒 形态名称",
      "episodeRange": "Ep 1-20",
      "description": "详细描述...",
      "note": "备注",
      "visualPromptCn": "中文提示词",
      "visualPromptEn": "English prompt"
    }
  ]
}
\`\`\`

⚠️ 注意：
1. 只输出JSON，不要有其他解释文字
2. 保留原有信息，只补充缺失部分
3. 如果剧本中确实没有某项信息，保持原值或留空
4. 形态描述要详细，至少100字
5. forms数组中的每个form必须有唯一的id，格式为 "form-时间戳-序号"
`;
}

/**
 * 解析补充响应
 */
function parseSupplementResponse(content: string): Partial<CharacterRef> {
  try {
    // 提取 JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法从响应中提取 JSON');
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // 确保forms数组中的每个form都有id
    if (parsed.forms && Array.isArray(parsed.forms)) {
      parsed.forms = parsed.forms.map((form: any, index: number) => ({
        ...form,
        id: form.id || `form-${Date.now()}-${index}`,
      }));
    }

    return parsed;
  } catch (error) {
    console.error('解析补充响应失败:', error);
    return {};
  }
}

