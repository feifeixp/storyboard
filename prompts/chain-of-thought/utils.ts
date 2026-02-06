/**
 * 思维链工具函数
 */

/**
 * 从AI输出中提取JSON
 * 支持多种格式：
 * 1. 【最终输出】后的 ```json {...} ```
 * 2. ```json {...} ```
 * 3. {...}
 * 4. 混合文本中的JSON
 */
export function extractJSON(text: string): string {
  // 方法0: 优先提取【最终输出】后的JSON
  const finalOutputMatch = text.match(/【最终输出】[\s\S]*?```json\s*([\s\S]*?)\s*```/);
  if (finalOutputMatch) {
    return finalOutputMatch[1].trim();
  }

  // 方法0.5: 提取【最终输出】后的最后一个JSON对象
  const finalOutputSection = text.match(/【最终输出】([\s\S]*)$/);
  if (finalOutputSection) {
    const section = finalOutputSection[1];
    const jsonMatch = section.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }
    // 尝试提取裸JSON
    const bareJsonMatch = section.match(/\{[\s\S]*\}/);
    if (bareJsonMatch) {
      return bareJsonMatch[0];
    }
  }

  // 方法1: 提取所有 ```json ... ``` 块，取最后一个
  const allJsonBlocks = text.match(/```json\s*([\s\S]*?)\s*```/g);
  if (allJsonBlocks && allJsonBlocks.length > 0) {
    const lastBlock = allJsonBlocks[allJsonBlocks.length - 1];
    const content = lastBlock.match(/```json\s*([\s\S]*?)\s*```/);
    if (content) {
      return content[1].trim();
    }
  }

  // 方法2: 提取 ``` ... ``` 中的内容（可能没有json标记）
  const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    // 检查是否是JSON
    if (content.startsWith('{') || content.startsWith('[')) {
      return content;
    }
  }

  // 方法3: 查找最后一个完整的JSON对象
  const lastJsonMatch = text.match(/\{[\s\S]*\}/g);
  if (lastJsonMatch && lastJsonMatch.length > 0) {
    return lastJsonMatch[lastJsonMatch.length - 1];
  }

  throw new Error('无法从输出中提取JSON');
}

/**
 * 清理JSON字符串，处理常见问题
 * v2增强：处理截断、不完整的JSON
 */
function cleanJSON(jsonStr: string): string {
  let cleaned = jsonStr;

  // 移除尾随逗号（数组和对象中的）
  cleaned = cleaned.replace(/,(\s*[\]\}])/g, '$1');

  // 移除注释（单行和多行）
  cleaned = cleaned.replace(/\/\/[^\n]*\n/g, '\n');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // 🆕 v2：处理截断的JSON（找到最后一个完整的对象/数组）
  // 检查是否有未闭合的括号
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/\]/g) || []).length;

  // 如果括号不匹配，尝试修复
  if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
    console.warn(`[JSON修复] 检测到不匹配的括号: {${openBraces}/${closeBraces}, [${openBrackets}/${closeBrackets}`);

    // 尝试找到最后一个完整的对象
    cleaned = tryFixIncompleteJSON(cleaned);
  }

  return cleaned;
}

/**
 * 🆕 v2：尝试修复不完整的JSON
 * 策略：找到最后一个完整的数组元素，截断后续内容
 */
function tryFixIncompleteJSON(jsonStr: string): string {
  // 如果是对象格式 {"shots": [...]}
  const shotsMatch = jsonStr.match(/"shots"\s*:\s*\[/);
  if (shotsMatch) {
    const shotsStartIndex = shotsMatch.index! + shotsMatch[0].length;
    const shotsContent = jsonStr.slice(shotsStartIndex);

    // 找到所有完整的对象（以 }, 或 }] 结尾）
    let depth = 0;
    let lastCompleteIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < shotsContent.length; i++) {
      const char = shotsContent[i];

      // 处理字符串内的引号
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }

      // 只在字符串外计算括号
      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          // 当depth回到0时，说明一个完整对象结束
          if (depth === 0) {
            // 检查下一个字符是否是 , 或 ]
            const nextNonSpace = shotsContent.slice(i + 1).match(/^\s*([,\]])/);
            if (nextNonSpace) {
              lastCompleteIndex = i + 1 + nextNonSpace[0].length - 1;
            }
          }
        }
      }
    }

    // 如果找到了完整的对象，截断到那里
    if (lastCompleteIndex > 0) {
      let fixedContent = shotsContent.slice(0, lastCompleteIndex);
      // 确保以 ] 结尾
      if (!fixedContent.trim().endsWith(']')) {
        if (fixedContent.trim().endsWith(',')) {
          fixedContent = fixedContent.trim().slice(0, -1);
        }
        fixedContent += ']';
      }
      const fixedJson = jsonStr.slice(0, shotsStartIndex) + fixedContent + '}';
      console.log(`[JSON修复] 截断到最后一个完整对象，位置: ${lastCompleteIndex}`);
      return fixedJson;
    }
  }

  return jsonStr;
}

/**
 * 验证JSON是否符合预期的schema
 * 支持宽松解析（处理尾随逗号等）
 */
export function validateJSON<T>(jsonStr: string, requiredFields: string[]): T {
  try {
    // 先尝试清理JSON
    const cleanedJson = cleanJSON(jsonStr);
    const obj = JSON.parse(cleanedJson);

    // 检查必需字段
    for (const field of requiredFields) {
      if (!(field in obj)) {
        throw new Error(`缺少必需字段: ${field}`);
      }
    }

    return obj as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      // 如果清理后仍然失败，尝试更激进的清理
      try {
        // 尝试更激进的修复：移除可能导致问题的控制字符
        const aggressiveCleaned = cleanJSON(jsonStr)
          .replace(/[\x00-\x1f]/g, (c) => {
            if (c === '\n' || c === '\r' || c === '\t') return c;
            return '';
          });
        const obj = JSON.parse(aggressiveCleaned);

        // 检查必需字段
        for (const field of requiredFields) {
          if (!(field in obj)) {
            throw new Error(`缺少必需字段: ${field}`);
          }
        }

        return obj as T;
      } catch {
        throw new Error(`JSON解析失败: ${error.message}`);
      }
    }
    throw error;
  }
}

/**
 * 从思维链输出中提取思考过程
 */
export function extractThinkingProcess(text: string): Record<string, string> {
  const thinking: Record<string, string> = {};
  
  // 匹配 【Step X.X 执行中】 ... 思考过程： ... 输出结果：
  const stepPattern = /【Step (\d+\.\d+) 执行中】[\s\S]*?思考过程：\s*([\s\S]*?)(?=输出结果：|【Step|$)/g;
  
  let match;
  while ((match = stepPattern.exec(text)) !== null) {
    const stepId = match[1].replace('.', '_');
    const thinkingText = match[2].trim();
    thinking[`step${stepId}`] = thinkingText;
  }
  
  return thinking;
}

/**
 * 合并思考过程和JSON结果
 */
export function mergeThinkingAndResult<T>(
  text: string,
  requiredFields: string[]
): T & { thinking?: Record<string, string> } {
  const jsonStr = extractJSON(text);
  const result = validateJSON<T>(jsonStr, requiredFields);
  const thinking = extractThinkingProcess(text);
  
  return {
    ...result,
    thinking: Object.keys(thinking).length > 0 ? thinking : undefined
  };
}

/**
 * 格式化思维链输出用于展示
 */
export function formatChainOfThoughtOutput(text: string): {
  steps: {
    id: string;
    title: string;
    thinking: string;
    result: string;
  }[];
  finalJSON: string;
} {
  const steps: {
    id: string;
    title: string;
    thinking: string;
    result: string;
  }[] = [];
  
  // 匹配每个步骤
  const stepPattern = /【Step (\d+\.\d+) 执行中】([\s\S]*?)(?=【Step|【最终输出】|$)/g;
  
  let match;
  while ((match = stepPattern.exec(text)) !== null) {
    const stepId = match[1];
    const content = match[2];
    
    // 提取思考过程
    const thinkingMatch = content.match(/思考过程：\s*([\s\S]*?)(?=输出结果：|$)/);
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : '';
    
    // 提取输出结果
    const resultMatch = content.match(/输出结果：\s*([\s\S]*?)$/);
    const result = resultMatch ? resultMatch[1].trim() : '';
    
    steps.push({
      id: stepId,
      title: `Step ${stepId}`,
      thinking,
      result
    });
  }
  
  // 提取最终JSON
  const finalJSONMatch = text.match(/【最终输出】[\s\S]*?```json\s*([\s\S]*?)\s*```/);
  const finalJSON = finalJSONMatch ? finalJSONMatch[1].trim() : extractJSON(text);
  
  return { steps, finalJSON };
}

/**
 * 计算思维链执行的统计信息
 */
export function calculateChainStats(text: string): {
  totalSteps: number;
  completedSteps: number;
  thinkingLength: number;
  outputLength: number;
} {
  const steps = text.match(/【Step \d+\.\d+ 执行中】/g) || [];
  const thinking = extractThinkingProcess(text);
  
  const thinkingLength = Object.values(thinking).reduce(
    (sum, t) => sum + t.length,
    0
  );
  
  return {
    totalSteps: steps.length,
    completedSteps: Object.keys(thinking).length,
    thinkingLength,
    outputLength: text.length
  };
}

/**
 * 检查思维链输出是否完整
 */
export function isChainComplete(
  text: string,
  expectedSteps: string[]
): {
  isComplete: boolean;
  missingSteps: string[];
} {
  const thinking = extractThinkingProcess(text);
  const completedSteps = Object.keys(thinking).map(k => k.replace('step', '').replace('_', '.'));
  
  const missingSteps = expectedSteps.filter(
    step => !completedSteps.includes(step)
  );
  
  return {
    isComplete: missingSteps.length === 0,
    missingSteps
  };
}

