/**
 * 场景补充提取服务
 * 为场景补充详细的描述、氛围、视觉提示等信息
 */

import { SceneRef, ScriptFile } from '../types/project';

const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';

/**
 * 补充场景详细信息
 * @param scene 需要补充的场景
 * @param scripts 项目的所有剧本
 * @param model AI模型
 * @returns 补充后的场景信息
 */
export async function supplementSceneDetails(
  scene: SceneRef,
  scripts: ScriptFile[],
  model: string = DEFAULT_MODEL
): Promise<SceneRef> {

  try {
    // 构建提示词
    const prompt = buildSupplementPrompt(scene, scripts);

    // 调用 LLM
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
      throw new Error(`API请求失败: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('API 返回内容为空');
    }

    // 解析返回的 JSON
    const supplementData = parseSupplementResponse(content);

    // 合并到原场景数据，保留原ID
    const updatedScene: SceneRef = {
      ...scene,
      ...supplementData,
      id: scene.id, // 保持原ID不变
      name: scene.name, // 保持原名称不变
    };

    return updatedScene;

  } catch (error) {
    console.error('补充场景信息失败:', error);
    throw error;
  }
}

/**
 * 构建补充提示词
 */
function buildSupplementPrompt(scene: SceneRef, scripts: ScriptFile[]): string {
  // 从剧本中提取与该场景相关的内容
  const relevantContent = extractRelevantContent(scene, scripts);

  return `# 任务：补充场景详细信息

你是一位资深的场景设计师，需要为以下场景补充详细的描述和视觉提示。

## 场景基本信息
- **场景名称**: ${scene.name}
- **场景ID**: ${scene.id}
- **当前描述**: ${scene.description || '（无）'}
- **当前氛围**: ${scene.atmosphere || '（无）'}

## 剧本中的相关内容
${relevantContent}

## 任务要求

请分析剧本内容，为该场景补充以下信息：

1. **详细描述** (description)
   - 场景的空间布局（前景、中景、后景）
   - 主要物体和元素
   - 光线和色调
   - 100-200字

2. **氛围** (atmosphere)
   - 场景的情绪基调
   - 10-20字，如"紧张压抑"、"温馨日常"、"荒废颓废"

3. **中文视觉提示** (visualPromptCn)
   - 适合AI生图的详细描述
   - 包含：空间布局、光线、色调、物体细节
   - 50-100字

4. **英文视觉提示** (visualPromptEn)
   - visualPromptCn的英文翻译
   - 适合Stable Diffusion等模型

## 输出格式

请严格按照以下JSON格式输出（不要包含其他文字）：

\`\`\`json
{
  "description": "场景详细描述...",
  "atmosphere": "氛围",
  "visualPromptCn": "中文视觉提示...",
  "visualPromptEn": "English visual prompt..."
}
\`\`\`

注意：
- 只输出JSON，不要有其他解释文字
- 确保JSON格式正确，可以被解析
- 如果剧本中没有相关信息，请根据场景名称合理推测
`;
}

/**
 * 从剧本中提取与场景相关的内容
 */
function extractRelevantContent(scene: SceneRef, scripts: ScriptFile[]): string {
  const sceneNumber = scene.id.replace('scene-', '');
  const relevantParts: string[] = [];

  for (const script of scripts) {
    // 查找包含该场景标记的内容
    const scenePattern = new RegExp(`Scene\\s+${sceneNumber}\\s*[｜|:]\\s*[^\\n]+([\\s\\S]{0,800})`, 'i');
    const match = script.content.match(scenePattern);

    if (match) {
      relevantParts.push(`\n=== 第${script.episodeNumber}集 ===\n${match[0]}`);
    }
  }

  if (relevantParts.length === 0) {
    return '（剧本中未找到该场景的详细描述）';
  }

  return relevantParts.join('\n\n');
}

/**
 * 解析AI返回的补充数据
 */
function parseSupplementResponse(content: string): Partial<SceneRef> {
  try {
    // 提取JSON部分
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法从返回内容中提取JSON');
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const data = JSON.parse(jsonStr);

    return {
      description: data.description || '',
      atmosphere: data.atmosphere || '',
      visualPromptCn: data.visualPromptCn || '',
      visualPromptEn: data.visualPromptEn || '',
    };

  } catch (error) {
    console.error('解析补充数据失败:', error);
    throw new Error('无法解析AI返回的数据');
  }
}

