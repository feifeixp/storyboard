/**
 * 角色图片 AI 视觉分析服务
 * 使用 GPT-4o-mini 分析上传的角色图片，生成优化的角色描述
 */

const OPENROUTER_API_KEY = 'sk-or-v1-1e0c4e0e8e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e';

export interface CharacterAnalysisResult {
  appearance: string;        // 外貌描述
  clothing: string;          // 服装描述
  personality: string;       // 气质/性格描述
  visualPromptCn: string;    // 中文视觉提示词
  visualPromptEn: string;    // 英文视觉提示词
  confidence: number;        // 分析置信度 (0-1)
}

/**
 * 使用 AI 视觉模型分析角色图片
 * @param imageUrl 图片 URL（必须是公网可访问的 URL）
 * @param characterName 角色名称
 * @param existingDescription 现有的角色描述（可选，用于参考）
 */
export async function analyzeCharacterImage(
  imageUrl: string,
  characterName: string,
  existingDescription?: string
): Promise<CharacterAnalysisResult> {
  const systemPrompt = `你是一个专业的角色设计分析师。请详细分析图片中的角色外观特征，并生成适合用于AI绘画的提示词。

分析要点：
1. 外貌特征：发型、发色、眼睛颜色、身材、年龄感等
2. 服装风格：服装类型、颜色、风格、配饰等
3. 整体气质：性格特征、氛围感、风格定位等
4. 视觉提示词：适合用于 AI 绘画的关键词（中英文）

请以 JSON 格式返回结果。`;

  const userPrompt = `请分析这个角色"${characterName}"的图片，并生成详细的角色描述。

${existingDescription ? `现有描述（供参考）：\n${existingDescription}\n\n` : ''}请返回以下 JSON 格式：
{
  "appearance": "外貌描述（包括发型、发色、眼睛、身材等）",
  "clothing": "服装描述（包括服装类型、颜色、风格、配饰等）",
  "personality": "气质和性格描述（基于外观推测）",
  "visualPromptCn": "中文视觉提示词（逗号分隔，适合AI绘画）",
  "visualPromptEn": "英文视觉提示词（逗号分隔，适合AI绘画）",
  "confidence": 0.9
}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://visionary-storyboard-studio.app',
        'X-Title': 'Visionary Storyboard Studio',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',  // 支持视觉分析
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        temperature: 0.3,  // 低温度，更准确
        max_tokens: 1000,
        response_format: { type: 'json_object' },  // 强制 JSON 输出
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('API 返回内容为空');
    }

    // 解析 JSON
    const result = JSON.parse(content);

    return {
      appearance: result.appearance || '',
      clothing: result.clothing || '',
      personality: result.personality || '',
      visualPromptCn: result.visualPromptCn || '',
      visualPromptEn: result.visualPromptEn || '',
      confidence: result.confidence || 0.8,
    };
  } catch (error) {
    console.error('[角色图片分析] AI 分析失败:', error);
    throw error;
  }
}

/**
 * 将分析结果合并到角色描述中
 * @param analysis AI 分析结果
 * @param existingCharacter 现有角色数据
 */
export function mergeAnalysisToCharacter(
  analysis: CharacterAnalysisResult,
  existingCharacter: any
): any {
  // 合并外貌和服装描述
  const combinedAppearance = existingCharacter.appearance
    ? `${existingCharacter.appearance}\n\n服装：${analysis.clothing}`
    : `${analysis.appearance}\n\n服装：${analysis.clothing}`;

  return {
    ...existingCharacter,
    appearance: combinedAppearance,
    personality: analysis.personality || existingCharacter.personality,
    visualPromptCn: analysis.visualPromptCn || existingCharacter.visualPromptCn,
    visualPromptEn: analysis.visualPromptEn || existingCharacter.visualPromptEn,
  };
}

