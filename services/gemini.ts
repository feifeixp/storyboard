
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Shot, ReviewSuggestion, CharacterRef } from "../types";
import type { ScriptAnalysis } from "../prompts/chain-of-thought/types";
import { buildStage1Prompt } from "../prompts/chain-of-thought/stage1-script-analysis";
import { extractJSON, mergeThinkingAndResult } from "../prompts/chain-of-thought/utils";

// 支持两种环境：Vite (浏览器) 和 Node.js (测试)
const getApiKey = () => {
  // Vite 环境
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  // Node.js 环境
  return process.env.VITE_GEMINI_API_KEY;
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

// Helper to strip markdown code blocks
const cleanJsonOutput = (text: string): string => {
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

// We keep a minimal "Role Definition" here, but the specific instructions will now come from the User Interface.
const BASE_ROLE_DEFINITION = `Role: AI 漫剧导演 & 提示词专家. You are an expert in Cinematic Storytelling (Framed Ink).`;

export async function* generateShotListStream(script: string, customPrompt: string) {
  // Combine Role + User's Custom Instruction + Script
  const contentInput = `
  ${BASE_ROLE_DEFINITION}
  
  TASK INSTRUCTIONS (FROM USER):
  ${customPrompt}

  ----------------
  SOURCE SCRIPT:
  ${script}
  `;

  const stream = await ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents: contentInput,
    config: {
      // systemInstruction: customPrompt, // We pass it in contents to ensure it's weighted heavily
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            shotNumber: { type: Type.STRING },
            duration: { type: Type.STRING },
            visualDescription: { type: Type.STRING },
            dialogue: { type: Type.STRING },
            theory: { type: Type.STRING },
            refType: { type: Type.STRING },
            aiPromptEn: { type: Type.STRING },
            aiPromptCn: { type: Type.STRING },
            videoPromptEn: { type: Type.STRING },
            videoPromptCn: { type: Type.STRING },
            frameType: { type: Type.STRING, enum: ["单镜头→[单帧生成]", "需动画→[需首尾帧]"] }
          },
          required: ["shotNumber", "duration", "visualDescription", "dialogue", "theory", "aiPromptEn", "aiPromptCn", "frameType"]
        }
      }
    }
  });

  let fullText = "";
  for await (const chunk of stream) {
    fullText += chunk.text;
    yield fullText;
  }
}

export const reviewStoryboard = async (shots: Shot[], customCriteria: string): Promise<ReviewSuggestion[]> => {
  const contentInput = `
  Role: Lead Director / Script Doctor.
  
  YOUR REVIEW CRITERIA:
  ${customCriteria}

  Analyze the following storyboard data JSON and return a list of specific fix suggestions adhering to the criteria above.
  
  STORYBOARD DATA:
  ${JSON.stringify(shots)}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: contentInput,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            shotNumber: { type: Type.STRING },
            suggestion: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ["shotNumber", "suggestion", "reason"]
        }
      }
    }
  });
  const text = cleanJsonOutput(response.text || '[]');
  return JSON.parse(text);
};

export async function* optimizeShotListStream(shots: Shot[], suggestions: ReviewSuggestion[]) {
  const prompt = `Task: Update storyboard JSON based on Director's Review.
  
  Strict Rules:
  - Apply the suggestions to 'visualDescription' and 'aiPromptEn'.
  - If angle changes, update the prompts.
  - Maintain the "Ink Sketch" style. NO realistic tags.
  - Return COMPLETE JSON.`;

  const stream = await ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents: `${prompt}\n\nData: ${JSON.stringify(shots)}\nSuggestions: ${JSON.stringify(suggestions)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            shotNumber: { type: Type.STRING },
            duration: { type: Type.STRING },
            visualDescription: { type: Type.STRING },
            dialogue: { type: Type.STRING },
            theory: { type: Type.STRING },
            refType: { type: Type.STRING },
            aiPromptEn: { type: Type.STRING },
            aiPromptCn: { type: Type.STRING },
            videoPromptEn: { type: Type.STRING },
            videoPromptCn: { type: Type.STRING },
            frameType: { type: Type.STRING, enum: ["单镜头→[单帧生成]", "需动画→[需首尾帧]"] }
          },
          required: ["shotNumber", "duration", "visualDescription", "dialogue", "theory", "aiPromptEn", "aiPromptCn", "frameType"]
        }
      }
    }
  });

  let fullText = "";
  for await (const chunk of stream) {
    fullText += chunk.text;
    yield fullText;
  }
}

// NEW: Chat with Director (Conversational Text)
export async function* chatWithDirectorStream(history: {role: string, content: string}[], userInstruction: string) {
  const prompt = `You are an expert Storyboard Director (Framed Ink style). 
  The user is consulting you about the storyboard.
  
  Your Goal:
  1. Analyze the user's request.
  2. Provide professional advice based on Cinematic Theory (180 rule, composition, lighting).
  3. If the user asks to "Make it more dramatic", suggest specific Camera Angles (Dutch, Low, Extreme Close-up).
  4. Output natural language (Markdown allowed).
  
  Chat History:
  ${JSON.stringify(history)}
  
  User Input: "${userInstruction}"`;

  const stream = await ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents: prompt,
  });

  for await (const chunk of stream) {
    yield chunk.text;
  }
}

// EXISTING: Update Shot List based on instructions (Execute)
export async function* chatEditShotListStream(shots: Shot[], userInstruction: string) {
  const prompt = `Task: AI Director Co-pilot. Modify storyboard based on user instruction.
  User Instruction: "${userInstruction}"
  
  Rules:
  - If user says "Too many frames" or "Simplify", change "frameType" of dialogue shots to "单镜头→[单帧生成]".
  - Ensure updated prompts DO NOT contain realistic keywords like '8k'.
  - Maintain JSON structure.`;

  const stream = await ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents: `${prompt}\n\nCurrent Storyboard: ${JSON.stringify(shots)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            shotNumber: { type: Type.STRING },
            duration: { type: Type.STRING },
            visualDescription: { type: Type.STRING },
            dialogue: { type: Type.STRING },
            theory: { type: Type.STRING },
            refType: { type: Type.STRING },
            aiPromptEn: { type: Type.STRING },
            aiPromptCn: { type: Type.STRING },
            videoPromptEn: { type: Type.STRING },
            videoPromptCn: { type: Type.STRING },
            frameType: { type: Type.STRING, enum: ["单镜头→[单帧生成]", "需动画→[需首尾帧]"] }
          },
          required: ["shotNumber", "duration", "visualDescription", "dialogue", "theory", "aiPromptEn", "aiPromptCn", "frameType"]
        }
      }
    }
  });

  let fullText = "";
  for await (const chunk of stream) {
    fullText += chunk.text;
    yield fullText;
  }
}

export const generateMergedStoryboardSheet = async (
  shots: Shot[],
  characterRefs: CharacterRef[],
  mode: 'draft' | 'hq'
): Promise<string[]> => {
  
  const charContext = characterRefs.length > 0 
    ? `Character details: ${characterRefs.map(c => c.name).join(', ')}. ` 
    : '';
  
  const isDraft = mode === 'draft';

  // 1. EXPAND shots into render panels
  const renderPanels: any[] = [];
  shots.forEach(s => {
    // Extract Shot Type from promptEn
    const shotTypeMatch = s.promptEn?.match(/^\((.*?)\)/);
    const shotType = shotTypeMatch ? `(${shotTypeMatch[1]})` : '';

    // 🔧 修复：支持 storyBeat 的两种类型
    const storyBeatText = typeof s.storyBeat === 'string'
      ? s.storyBeat
      : (s.storyBeat?.event || '');
    const shortVisual = storyBeatText.replace(/【.*?】/g, '').replace(/\n/g, ' ').substring(0, 8) || '';
    const dialogueClean = s.dialogue ? `\n对: ${s.dialogue.substring(0, 10)}` : '';

    let cleanAiPrompt = s.promptEn || s.imagePromptEn || '';

    // 判断是否需要首尾帧（运动镜头）
    if (s.shotType === '运动' && s.startFrame && s.endFrame) {
      renderPanels.push({
        id: `${s.shotNumber}a`,
        caption: `${s.shotNumber}a (首) ${shortVisual} ${shotType}${dialogueClean}`,
        prompt: `Panel ${s.shotNumber}a (Start): ${cleanAiPrompt}`
      });
      renderPanels.push({
        id: `${s.shotNumber}b`,
        caption: `${s.shotNumber}b (尾) ${shortVisual} ${shotType}${dialogueClean}`,
        prompt: `Panel ${s.shotNumber}b (End): ${cleanAiPrompt}`
      });
    } else {
      renderPanels.push({
        id: s.shotNumber,
        caption: `${s.shotNumber} (单) ${shortVisual} ${shotType}${dialogueClean}`,
        prompt: `Panel ${s.shotNumber}: ${cleanAiPrompt}`
      });
    }
  });

  // 2. SINGLE SHEET LOGIC
  // We want ONE sheet containing ALL panels.
  const totalPanels = renderPanels.length;
  // Fixed 4 columns is standard for vertical cinematic sheets
  const COLUMNS = 4;
  const ROWS = Math.ceil(totalPanels / COLUMNS);
  
  const sequenceDescription = renderPanels.map(p => 
    `${p.prompt}\n[CAPTION]: "${p.caption}"`
  ).join('\n\n');

  const styleInstruction = "Style: Professional Manga Storyboard. Hand-drawn ink sketch. Black and white. High contrast. Rough, loose lines. NO color. NO photorealism.";

  const layoutInstruction = `LAYOUT COMMAND:
      - Draw a SINGLE grid of ${COLUMNS} columns x ${ROWS} rows.
      - Total Panels to draw: ${totalPanels}.
      - Aspect Ratio of entire sheet: Vertical (9:16).
      - IMPORTANT: Below EACH panel, you MUST render the [CAPTION] text cleanly in SIMPLIFIED CHINESE.
      - The text must be legible black ink. 
      - Do NOT split into multiple images. Output one tall image.`;

  const fullPrompt = `${charContext}
  Create the COMPLETE Storyboard Sheet.
  ${styleInstruction}
  ${layoutInstruction}
  
  Panels to populate in the grid:
  ${sequenceDescription}
  
  Output ONE single vertical image containing all these panels.`;
  
  const parts: any[] = [{ text: fullPrompt }];
  characterRefs.forEach(ref => {
    parts.push({
      inlineData: {
        data: ref.data.split(',')[1],
        mimeType: 'image/png'
      }
    });
  });

  try {
    const model = 'gemini-3-pro-image-preview';
    
    const config: any = {
      imageConfig: {
          aspectRatio: "9:16", // Vertical Long for single sheet
          imageSize: isDraft ? "1K" : "2K" 
      }
    };

    const response = await ai.models.generateContent({
      model: model, 
      contents: { parts },
      config: config
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return [`data:image/png;base64,${part.inlineData.data}`]; // Return as array for compatibility
      }
    }
    return [];
  } catch (e) {
    console.error(`Generation failed`, e);
    return [];
  }
}

// ============================================
// 思维链生成函数
// ============================================

/**
 * 阶段1：剧本分析（思维链模式）
 * 使用 Gemini 2.0 Flash Thinking 模型
 */
export async function* generateStage1Analysis(script: string) {
  const prompt = buildStage1Prompt(script);

  try {
    console.log('[DEBUG] 开始调用 Gemini API...');
    console.log('[DEBUG] 提示词长度:', prompt.length, '字符');

    // 使用思维链专用模型（如果不可用，会自动降级到 gemini-2.0-flash-exp）
    const modelName = 'gemini-2.0-flash-thinking-exp-1219';
    console.log('[DEBUG] 使用模型:', modelName);

    const stream = await ai.models.generateContentStream({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 8192,
        // 不使用 JSON schema，让模型自由输出思考过程
        responseMimeType: "text/plain"
      }
    });

    console.log('[DEBUG] API 调用成功，开始接收流式数据...\n');

    let fullText = '';
    for await (const chunk of stream) {
      // chunk.text 可能是方法或属性，根据 Gemini SDK 版本而定
      const text = (chunk as any).text?.() ?? (chunk as any).text ?? '';
      fullText += text;
      yield text; // 流式输出
    }

    console.log('\n[DEBUG] 流式数据接收完成，总长度:', fullText.length, '字符');

    // 返回完整文本用于后续处理
    return fullText;
  } catch (error) {
    console.error('[ERROR] 阶段1生成失败:', error);
    if (error instanceof Error) {
      console.error('[ERROR] 错误信息:', error.message);
      console.error('[ERROR] 错误堆栈:', error.stack);
    }
    throw error;
  }
}

/**
 * 解析阶段1的输出
 */
export function parseStage1Output(fullText: string): ScriptAnalysis {
  try {
    // 使用工具函数提取JSON和思考过程
    const result = mergeThinkingAndResult<ScriptAnalysis>(
      fullText,
      ['basicInfo', 'emotionArc', 'climax', 'conflict', 'scenes']
    );

    return result;
  } catch (error) {
    console.error('解析阶段1输出失败:', error);
    throw new Error(`无法解析剧本分析结果: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
