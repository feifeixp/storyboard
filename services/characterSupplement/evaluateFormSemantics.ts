/**
 * 形态语义评估
 *
 * 通过 LLM 判断每个候选形态是否值得保留为长期形态
 * 替代硬编码黑名单，实现通用的形态过滤机制
 *
 * 设计文档：docs/rules/形态语义评估设计.md
 */

import { CharacterForm } from '../../types';

/**
 * 形态语义评估选项
 */
export interface FormEvaluationOptions {
  characterRole?: string;   // 角色定位（主角/配角/反派）
  scriptType?: string;       // 剧本类型（女频言情/科幻/历史等）
  model?: string;            // 使用的模型
}

/**
 * 单个形态的评估结果
 */
interface FormEvaluation {
  originalName: string;           // 原始形态名称
  normalizedName: string | null;  // 规范化后的名称（如果保留）
  category: 'stable_form' | 'transient_event' | 'emotion_only';
  shouldKeepAsForm: boolean;      // 是否保留为形态
  reason: string;                 // 判断理由（50-100字）
  confidence: number;             // 置信度（0-1）
}

/**
 * 形态语义评估输出
 */
interface FormEvaluationOutput {
  evaluations: FormEvaluation[];
}

/**
 * 构建形态语义评估 Prompt
 */
function buildEvaluationPrompt(
  characterName: string,
  candidateForms: CharacterForm[],
  options: FormEvaluationOptions
): string {
  const { characterRole = '未知', scriptType = '未知' } = options;

  return `你是一位专业的影视角色造型师和分镜导演。

现在需要你评估角色"${characterName}"的候选形态列表，判断哪些值得保留为长期形态。

## 角色信息
- 角色名称：${characterName}
- 角色定位：${characterRole}
- 剧本类型：${scriptType}

## 候选形态列表
${candidateForms.map((f, i) => `
${i + 1}. **${f.name}**
   - 描述：${f.description || '无描述'}
   - 出现集数：${f.episodeRange || '未知'}
   - 变化类型：${f.changeType || '未知'}
`).join('\n')}

## 评估标准

作为专业造型师，请从以下角度评估每个形态：

### 1. 视觉稳定性
- 这个状态是否有**明确的、稳定的视觉特征**？
- 还是只是一个**瞬间的动作或情绪**？

### 2. 复用价值
- 这个状态是否可以在**多个场景、多集中反复出现**？
- 还是只在**某一个特定情节**中出现？

### 3. 设定图价值
- 如果要为这个角色画设定图，这个状态是否值得**单独画一版**？
- 还是只需要在分镜中临时表现即可？

## 输出要求

对每个候选形态，输出以下结构化判断：

\`\`\`json
{
  "evaluations": [
    {
      "originalName": "形态原始名称",
      "normalizedName": "规范化后的名称（如果保留）或 null",
      "category": "stable_form | transient_event | emotion_only",
      "shouldKeepAsForm": true/false,
      "reason": "判断理由（50-100字，说明为什么保留或不保留）",
      "confidence": 0.0-1.0
    }
  ]
}
\`\`\`

### 分类说明

- **stable_form**：长期可复用的造型形态（如"日常形态"、"战损形态"、"伪装形态"）
- **transient_event**：一次性剧情事件（如"被打倒在地"、"强吻后惊慌"）
- **emotion_only**：纯情绪状态，没有明显外观变化（如"愤怒"、"惊慌失措"）

### 注意事项

1. **不要过度保守**：如果一个形态确实有稳定的视觉特征且可能复用，应该保留
2. **不要过度宽松**：如果一个形态只是剧情瞬间，不应该保留
3. **规范化名称**：如果保留，给出一个更规范的名称（如"糙汉配合伪装" → "糙汉伪装形态"）

请直接输出 JSON，不要有任何其他文字。`;
}

/**
 * 从 LLM 响应中提取 JSON
 */
function extractJSON(text: string): any {
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 尝试提取 ```json ... ``` 中的内容
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      return JSON.parse(match[1]);
    }
    
    // 尝试提取 { ... } 中的内容
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('无法从响应中提取 JSON');
  }
}

/**
 * 形态语义评估
 * 
 * 通过 LLM 判断每个候选形态是否值得保留为长期形态
 * 
 * @param characterName 角色名称
 * @param candidateForms 候选形态列表
 * @param options 评估选项
 * @returns 过滤后的形态列表（只保留 shouldKeepAsForm = true 的）
 */
export async function evaluateFormSemantics(
  characterName: string,
  candidateForms: CharacterForm[],
  options: FormEvaluationOptions
): Promise<CharacterForm[]> {
  console.log(`[形态语义评估] 开始评估角色"${characterName}"的 ${candidateForms.length} 个候选形态`);

  // 如果没有候选形态，直接返回
  if (candidateForms.length === 0) {
    console.log(`[形态语义评估] 没有候选形态，跳过评估`);
    return [];
  }

  // 🔧 修复：原 fallback 'google/gemini-2.0-flash-exp:free' 已在 OpenRouter 下线（404）
  // 改为与主思维链相同的稳定模型，确保语义评估层不会静默失效
  const model = options.model || 'google/gemini-2.5-flash';

  try {
    // 1. 构建 Prompt
    const prompt = buildEvaluationPrompt(characterName, candidateForms, options);

    // 2. 调用 LLM
    console.log(`[形态语义评估] 调用 LLM 进行评估（模型: ${model}）`);

    const apiKey = (import.meta as any).env.VITE_OPENROUTER1_API_KEY;
    if (!apiKey) {
      throw new Error('未设置OpenRouter API密钥 (VITE_OPENROUTER1_API_KEY)');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AI Director'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,  // 较低温度，确保输出稳定
        max_tokens: 2000,
      })
    });

    if (!response.ok) {
      if (response.status === 402) {
        throw new Error('API余额不足，请检查OpenRouter账户余额');
      }
      if (response.status === 401) {
        throw new Error('API Key无效，请检查VITE_OPENROUTER1_API_KEY配置');
      }
      throw new Error(`LLM调用失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 3. 解析响应
    const result = extractJSON(content) as FormEvaluationOutput;

    if (!result.evaluations || !Array.isArray(result.evaluations)) {
      console.error('[形态语义评估] LLM 响应格式错误:', content);
      // 如果解析失败，保守策略：保留所有形态
      console.warn('[形态语义评估] ⚠️ 解析失败，保留所有候选形态');
      return candidateForms;
    }

    // 4. 过滤形态
    const keptForms: CharacterForm[] = [];
    const filteredForms: string[] = [];

    for (const evaluation of result.evaluations) {
      const originalForm = candidateForms.find(f => f.name === evaluation.originalName);

      if (!originalForm) {
        console.warn(`[形态语义评估] ⚠️ 找不到原始形态: ${evaluation.originalName}`);
        continue;
      }

      if (evaluation.shouldKeepAsForm) {
        // 保留形态，并使用规范化后的名称
        const updatedForm = {
          ...originalForm,
          name: evaluation.normalizedName || originalForm.name,
        };
        keptForms.push(updatedForm);

        console.log(`[形态语义评估] ✅ 保留: ${evaluation.originalName} → ${evaluation.normalizedName || evaluation.originalName}`);
        console.log(`  分类: ${evaluation.category}, 置信度: ${evaluation.confidence}, 理由: ${evaluation.reason}`);
      } else {
        filteredForms.push(evaluation.originalName);

        console.log(`[形态语义评估] 🚫 过滤: ${evaluation.originalName}`);
        console.log(`  分类: ${evaluation.category}, 理由: ${evaluation.reason}`);
      }
    }

    console.log(`[形态语义评估] ✅ 评估完成: 保留 ${keptForms.length} 个，过滤 ${filteredForms.length} 个`);

    return keptForms;

  } catch (error) {
    console.error('[形态语义评估] 评估失败:', error);
    // 如果评估失败，保守策略：保留所有形态
    console.warn('[形态语义评估] ⚠️ 评估失败，保留所有候选形态');
    return candidateForms;
  }
}

