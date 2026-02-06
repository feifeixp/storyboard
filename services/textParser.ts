/**
 * 文本解析服务 - 智能分词
 * 
 * 功能：从用户输入的自然语言中识别术语
 * 支持：
 * 1. 标准术语识别（如"中景"、"轻微俯拍"）
 * 2. 同义词识别（如"俯视拍摄" → "中度俯拍"）
 * 3. 复杂度检测（判断是否需要AI）
 * 
 * 创建时间：2024-12-30
 */

import { getAllTerminologyOptions } from './terminologyConstants';

/**
 * 解析结果
 */
export interface ParseResult {
  shotSize?: string;
  angleHeight?: string;
  angleDirection?: string;
  perspective?: string;
  lensType?: string;
  lighting?: string;
  description?: string;
  confidence: number;  // 置信度（0-1）
  isComplex: boolean;  // 是否复杂（需要AI）
}

/**
 * 同义词映射表
 */
const SYNONYMS = {
  // 景别同义词
  shotSize: {
    '大远景': '特远景(ELS)',
    '特远景': '特远景(ELS)',
    '远景': '远景(LS)',
    '全景': '全景(FS)',
    '中景': '中景(MS)',
    '近景': '近景(MCU)',
    '特写': '特写(CU)',
    '大特写': '大特写(ECU)',
    '局部特写': '局部特写(DS)',
    '过肩镜头': '过肩镜头(OTS)',
    '双人镜头': '双人镜头',
    '群像镜头': '群像镜头',
  },
  
  // 角度高度同义词
  angleHeight: {
    '鸟瞰': '鸟瞰(Bird Eye)',
    '俯瞰': '鸟瞰(Bird Eye)',
    '顶视图': '鸟瞰(Bird Eye)',
    '上帝视角': '鸟瞰(Bird Eye)',
    '极端俯拍': '极端俯拍(Extreme High)',
    '高角度拍摄': '极端俯拍(Extreme High)',
    '中度俯拍': '中度俯拍(Moderate High)',
    '俯视拍摄': '中度俯拍(Moderate High)',
    '俯角拍摄': '中度俯拍(Moderate High)',
    '轻微俯拍': '轻微俯拍(Mild High)',
    '平视': '平视(Eye Level)',
    '轻微仰拍': '轻微仰拍(Mild Low)',
    '中度仰拍': '中度仰拍(Moderate Low)',
    '仰视拍摄': '中度仰拍(Moderate Low)',
    '仰角拍摄': '中度仰拍(Moderate Low)',
    '极端仰拍': '极端仰拍(Extreme Low)',
    '低角度拍摄': '极端仰拍(Extreme Low)',
    '虫视': '虫视(Worm Eye)',
    '荷兰角': '荷兰角(Dutch Angle)',
  },
  
  // 人物朝向同义词
  angleDirection: {
    '正面': '正面(Front)',
    '前视图': '正面(Front)',
    '正视图': '正面(Front)',
    '微侧正面': '微侧正面(Slight Front)',
    '3/4正面': '3/4正面(3/4 Front)',
    '四分之三正面': '3/4正面(3/4 Front)',
    '1/3侧面': '1/3侧面(1/3 Side)',
    '正侧面': '正侧面(Full Side)',
    '侧面': '正侧面(Full Side)',
    '侧视图': '正侧面(Full Side)',
    '1/3背面': '1/3背面(1/3 Back)',
    '3/4背面': '3/4背面(3/4 Back)',
    '四分之三背面': '3/4背面(3/4 Back)',
    '背面': '背面(Back)',
    '后视图': '背面(Back)',
    '背影': '背面(Back)',
    '主观视角': '主观视角(POV)',
    'POV': '主观视角(POV)',
  },
  
  // 透视类型同义词
  perspective: {
    '一点透视': '一点透视',
    '两点透视': '两点透视',
    '三点透视向上': '三点透视向上',
    '三点透视向下': '三点透视向下',
  },
  
  // 镜头类型同义词
  lensType: {
    '鱼眼镜头': '鱼眼镜头',
    '广角镜头': '广角镜头',
    '标准镜头': '标准镜头',
    '长焦镜头': '长焦镜头',
  },
  
  // 光影效果同义词
  lighting: {
    '顶光': '顶光',
    '侧光': '侧光',
    '逆光': '逆光',
    '环境光': '环境光',
    '自然光': '自然光',
  },
};

/**
 * 从文本中解析术语
 */
export function parseText(text: string): ParseResult {
  const result: ParseResult = {
    confidence: 0,
    isComplex: false,
  };
  
  // 预处理：去除多余空格，统一分隔符
  const normalizedText = text
    .replace(/[，、；]/g, ',')  // 统一分隔符
    .replace(/\s+/g, ' ')       // 合并多个空格
    .trim();
  
  // 分词：按逗号分割
  const tokens = normalizedText.split(',').map(t => t.trim());
  
  let matchCount = 0;
  
  // 遍历每个token，尝试匹配术语
  for (const token of tokens) {
    // 尝试匹配景别
    if (!result.shotSize && SYNONYMS.shotSize[token]) {
      result.shotSize = SYNONYMS.shotSize[token];
      matchCount++;
      continue;
    }
    
    // 尝试匹配角度高度
    if (!result.angleHeight && SYNONYMS.angleHeight[token]) {
      result.angleHeight = SYNONYMS.angleHeight[token];
      matchCount++;
      continue;
    }
    
    // 尝试匹配人物朝向
    if (!result.angleDirection && SYNONYMS.angleDirection[token]) {
      result.angleDirection = SYNONYMS.angleDirection[token];
      matchCount++;
      continue;
    }
    
    // 尝试匹配透视类型
    if (!result.perspective && SYNONYMS.perspective[token]) {
      result.perspective = SYNONYMS.perspective[token];
      matchCount++;
      continue;
    }
    
    // 尝试匹配镜头类型
    if (!result.lensType && SYNONYMS.lensType[token]) {
      result.lensType = SYNONYMS.lensType[token];
      matchCount++;
      continue;
    }
    
    // 尝试匹配光影效果
    if (!result.lighting && SYNONYMS.lighting[token]) {
      result.lighting = SYNONYMS.lighting[token];
      matchCount++;
      continue;
    }
    
    // 如果都不匹配，作为描述
    if (!result.description) {
      result.description = token;
    } else {
      result.description += '，' + token;
    }
  }
  
  // 计算置信度
  result.confidence = matchCount / Math.max(tokens.length, 1);
  
  // 判断是否复杂（需要AI）
  result.isComplex = detectComplexity(normalizedText, matchCount, tokens.length);
  
  return result;
}

/**
 * 检测输入复杂度
 */
function detectComplexity(text: string, matchCount: number, tokenCount: number): boolean {
  // 规则1：匹配率低于50% → 复杂
  if (matchCount / tokenCount < 0.5) {
    return true;
  }
  
  // 规则2：包含长句子（>20字） → 复杂
  if (text.length > 20 && matchCount === 0) {
    return true;
  }
  
  // 规则3：包含自然语言描述词 → 复杂
  const naturalLanguageKeywords = ['人物', '镜头', '画面', '场景', '站在', '走向', '看向'];
  const hasNaturalLanguage = naturalLanguageKeywords.some(keyword => text.includes(keyword));
  if (hasNaturalLanguage && matchCount < 2) {
    return true;
  }
  
  return false;
}

