/**
 * 提示词优化助手 - 核心服务
 * 
 * 功能：将用户输入转换为优化后的提示词
 * 支持三种输入方式：
 * 1. 表单输入（下拉菜单选择术语）
 * 2. 文本输入（智能分词解析）
 * 3. AI解析（复杂场景）
 * 
 * 创建时间：2024-12-30
 */

import { convertToPhotographyTerms } from './terminologyMapper';
import { parseText } from './textParser';
import { parseWithAI } from './aiParser';

/**
 * 提示词优化结果
 */
export interface PromptOptimizationResult {
  /** 优化后的中文提示词 */
  chinesePrompt: string;
  
  /** 优化后的英文提示词 */
  englishPrompt: string;
  
  /** 识别到的术语 */
  terms: {
    shotSize?: string;        // 景别
    angleHeight?: string;     // 角度高度
    angleDirection?: string;  // 人物朝向
    perspective?: string;     // 透视类型
    lensType?: string;        // 镜头类型
    lighting?: string;        // 光影效果
    description?: string;     // 画面描述
  };
  
  /** 置信度（0-1） */
  confidence: number;
  
  /** 处理方式（form/text/ai） */
  method: 'form' | 'text' | 'ai';
}

/**
 * 表单输入数据
 */
export interface FormInput {
  shotSize?: string;
  angleHeight?: string;
  angleDirection?: string;
  perspective?: string;
  lensType?: string;
  lighting?: string;
  description?: string;
}

/**
 * 从表单输入生成提示词（准确性100%）
 */
export function optimizeFromForm(input: FormInput): PromptOptimizationResult {
  // 转换为摄影术语
  const { shotSizeCn, angleHeightCn, angleDirectionCn } = convertToPhotographyTerms(
    input.shotSize,
    input.angleHeight,
    input.angleDirection
  );
  
  // 构建中文提示词
  const parts: string[] = [];
  if (shotSizeCn) parts.push(shotSizeCn);
  if (angleHeightCn) parts.push(angleHeightCn);
  if (angleDirectionCn) parts.push(angleDirectionCn);
  if (input.perspective) parts.push(input.perspective);
  if (input.lensType) parts.push(input.lensType);
  if (input.lighting) parts.push(input.lighting);
  if (input.description) parts.push(input.description);
  
  const chinesePrompt = parts.join('，');
  
  // 构建英文提示词（简化版，后续可扩展）
  const englishPrompt = chinesePrompt; // TODO: 添加英文转换
  
  return {
    chinesePrompt,
    englishPrompt,
    terms: {
      shotSize: input.shotSize,
      angleHeight: input.angleHeight,
      angleDirection: input.angleDirection,
      perspective: input.perspective,
      lensType: input.lensType,
      lighting: input.lighting,
      description: input.description,
    },
    confidence: 1.0, // 表单输入准确性100%
    method: 'form',
  };
}

/**
 * 从文本输入生成提示词（智能分词）
 */
export function optimizeFromText(text: string): PromptOptimizationResult {
  // 使用智能分词解析文本
  const parseResult = parseText(text);

  // 转换为摄影术语
  const { shotSizeCn, angleHeightCn, angleDirectionCn } = convertToPhotographyTerms(
    parseResult.shotSize,
    parseResult.angleHeight,
    parseResult.angleDirection
  );

  // 构建中文提示词
  const parts: string[] = [];
  if (shotSizeCn) parts.push(shotSizeCn);
  if (angleHeightCn) parts.push(angleHeightCn);
  if (angleDirectionCn) parts.push(angleDirectionCn);
  if (parseResult.perspective) parts.push(parseResult.perspective);
  if (parseResult.lensType) parts.push(parseResult.lensType);
  if (parseResult.lighting) parts.push(parseResult.lighting);
  if (parseResult.description) parts.push(parseResult.description);

  const chinesePrompt = parts.join('，');

  // 构建英文提示词（简化版，后续可扩展）
  const englishPrompt = chinesePrompt; // TODO: 添加英文转换

  return {
    chinesePrompt,
    englishPrompt,
    terms: {
      shotSize: parseResult.shotSize,
      angleHeight: parseResult.angleHeight,
      angleDirection: parseResult.angleDirection,
      perspective: parseResult.perspective,
      lensType: parseResult.lensType,
      lighting: parseResult.lighting,
      description: parseResult.description,
    },
    confidence: parseResult.confidence,
    method: 'text',
  };
}

/**
 * 从AI解析生成提示词
 */
export async function optimizeFromAI(text: string): Promise<PromptOptimizationResult> {
  // 使用AI解析文本
  const aiResult = await parseWithAI(text);

  // 转换为摄影术语
  const { shotSizeCn, angleHeightCn, angleDirectionCn } = convertToPhotographyTerms(
    aiResult.shotSize,
    aiResult.angleHeight,
    aiResult.angleDirection
  );

  // 构建中文提示词
  const parts: string[] = [];
  if (shotSizeCn) parts.push(shotSizeCn);
  if (angleHeightCn) parts.push(angleHeightCn);
  if (angleDirectionCn) parts.push(angleDirectionCn);
  if (aiResult.perspective) parts.push(aiResult.perspective);
  if (aiResult.lensType) parts.push(aiResult.lensType);
  if (aiResult.lighting) parts.push(aiResult.lighting);
  if (aiResult.description) parts.push(aiResult.description);

  const chinesePrompt = parts.join('，');

  // 构建英文提示词（简化版，后续可扩展）
  const englishPrompt = chinesePrompt; // TODO: 添加英文转换

  return {
    chinesePrompt,
    englishPrompt,
    terms: {
      shotSize: aiResult.shotSize,
      angleHeight: aiResult.angleHeight,
      angleDirection: aiResult.angleDirection,
      perspective: aiResult.perspective,
      lensType: aiResult.lensType,
      lighting: aiResult.lighting,
      description: aiResult.description,
    },
    confidence: aiResult.confidence,
    method: 'ai',
  };
}

/**
 * 智能路由：根据输入自动选择最佳处理方式
 */
export async function optimizePrompt(
  input: FormInput | string
): Promise<PromptOptimizationResult> {
  // 如果是表单输入
  if (typeof input === 'object') {
    return optimizeFromForm(input);
  }

  // 如果是文本输入
  // 1. 先使用智能分词
  const textResult = optimizeFromText(input);

  // 2. 检测复杂度
  if (textResult.confidence >= 0.7) {
    // 置信度高：直接返回智能分词结果
    return textResult;
  } else {
    // 置信度低：使用AI解析
    return optimizeFromAI(input);
  }
}

