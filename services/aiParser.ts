/**
 * AI解析服务 - 处理复杂的自然语言输入
 * 
 * 功能：使用LLM解析复杂的画面描述，识别术语
 * 支持：
 * 1. OpenAI API（GPT-4o-mini）- 云端，准确性高
 * 2. Ollama本地模型（可选）- 本地，免费
 * 3. 智能降级逻辑
 * 
 * 创建时间：2024-12-30
 */

import { getAllTerminologyOptions } from './terminologyConstants';
import { getCachedResult, setCachedResult } from './aiCache';
import { hasQuota, useQuota, getRemainingQuota } from './aiQuota';
import { recordCall } from './aiMonitor';

/**
 * AI解析结果
 */
export interface AIParseResult {
  shotSize?: string;
  angleHeight?: string;
  angleDirection?: string;
  perspective?: string;
  lensType?: string;
  lighting?: string;
  description?: string;
  confidence: number;
}

/**
 * 获取OpenAI API Key
 */
function getOpenAIApiKey(): string | undefined {
  // Vite 环境
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_OPENROUTER1_API_KEY;
  }
  // Node.js 环境 - 从 .env.local 读取
  if (typeof process !== 'undefined' && process.env) {
    // 尝试加载 .env.local
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(process.cwd(), '.env.local');

      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/VITE_OPENROUTER1_API_KEY=(.+)/);
        if (match) {
          return match[1].trim();
        }
      }
    } catch (error) {
      console.warn('[AI解析] 无法读取 .env.local:', error);
    }

    return process.env.VITE_OPENROUTER1_API_KEY;
  }

  return undefined;
}

/**
 * 构建System Prompt
 */
function buildSystemPrompt(): string {
  const options = getAllTerminologyOptions();
  
  return `你是一个专业的分镜脚本分析助手，擅长从自然语言描述中识别摄影术语。

你的任务：
1. 分析用户输入的画面描述
2. 识别其中的景别、角度高度、人物朝向、透视类型、镜头类型、光影效果
3. 提取画面描述

输出格式（JSON）：
{
  "shotSize": "中景(MS)",
  "angleHeight": "轻微俯拍(Mild High)",
  "angleDirection": "3/4正面(3/4 Front)",
  "perspective": "两点透视",
  "lensType": "标准镜头",
  "lighting": "侧光",
  "description": "人物站在街道中央，背景是高楼大厦",
  "confidence": 0.95
}

术语映射表：
【景别】：${options.shotSize.join('、')}
【角度高度】：${options.angleHeight.join('、')}
【人物朝向】：${options.angleDirection.join('、')}
【透视类型】：${options.perspective.join('、')}
【镜头类型】：${options.lensType.join('、')}
【光影效果】：${options.lighting.join('、')}

请严格按照术语映射表输出，不要自创术语。
如果无法确定某个参数，请输出null。
置信度（confidence）范围：0-1，表示识别的准确性。`;
}

/**
 * 使用OpenAI API解析
 */
async function parseWithOpenAI(text: string): Promise<AIParseResult> {
  const apiKey = getOpenAIApiKey();
  
  if (!apiKey) {
    throw new Error('未找到 VITE_OPENROUTER1_API_KEY 环境变量');
  }
  
  const systemPrompt = buildSystemPrompt();
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://visionary-storyboard-studio.app',
        'X-Title': 'Visionary Storyboard Studio',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',  // 使用GPT-4o-mini（性价比最高）
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `请分析这段画面描述，并按照JSON格式输出：\n\n${text}`,
          },
        ],
        temperature: 0.3,  // 低温度，更准确
        max_tokens: 500,
        response_format: { type: 'json_object' },  // 强制JSON输出
      }),
    });
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('API返回内容为空');
    }
    
    // 解析JSON
    const result = JSON.parse(content);
    
    return {
      shotSize: result.shotSize || undefined,
      angleHeight: result.angleHeight || undefined,
      angleDirection: result.angleDirection || undefined,
      perspective: result.perspective || undefined,
      lensType: result.lensType || undefined,
      lighting: result.lighting || undefined,
      description: result.description || undefined,
      confidence: result.confidence || 0.8,
    };
  } catch (error) {
    console.error('[AI解析] OpenAI API调用失败:', error);
    throw error;
  }
}

/**
 * 检测Ollama是否可用
 */
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 使用Ollama本地模型解析
 */
async function parseWithOllama(text: string): Promise<AIParseResult> {
  // TODO: 实现Ollama解析逻辑
  throw new Error('Ollama解析功能尚未实现');
}

/**
 * AI解析（智能路由）
 */
export async function parseWithAI(text: string): Promise<AIParseResult> {
  const startTime = Date.now();

  try {
    // 1. 检查缓存
    const cached = getCachedResult(text);
    if (cached) {
      const duration = Date.now() - startTime;
      recordCall(text, true, duration, true);
      console.log('[AI解析] 使用缓存结果');
      return cached;
    }

    // 2. 检查配额
    if (!hasQuota()) {
      const remaining = getRemainingQuota();
      throw new Error(`今日AI解析配额已用完（剩余${remaining}次），请明天再试或使用智能分词功能`);
    }

    // 3. 检测Ollama是否可用
    const ollamaAvailable = await isOllamaAvailable();

    let result: AIParseResult;

    if (ollamaAvailable) {
      // 4. 优先使用本地Ollama（免费）
      try {
        result = await parseWithOllama(text);
      } catch (error) {
        console.warn('[AI解析] Ollama解析失败，降级到OpenAI:', error);
        // 5. 降级到OpenAI（付费但准确）
        result = await parseWithOpenAI(text);
        useQuota(); // 使用配额
      }
    } else {
      // 6. 直接使用OpenAI
      result = await parseWithOpenAI(text);
      useQuota(); // 使用配额
    }

    // 7. 保存缓存
    setCachedResult(text, result);

    // 8. 记录监控
    const duration = Date.now() - startTime;
    recordCall(text, true, duration, false);

    return result;
  } catch (error) {
    // 记录失败
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    recordCall(text, false, duration, false, errorMessage);

    throw error;
  }
}

