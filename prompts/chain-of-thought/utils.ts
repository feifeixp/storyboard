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
export function extractJSON(text: string, preferredFields?: string[]): string {
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

  // 方法1: 提取所有 ```json ... ``` 块
  // 如果指定了优先字段，先在包含该字段的块中取最大块；否则取全局最大块
  const allJsonBlocks = text.match(/```json\s*([\s\S]*?)\s*```/g);
  if (allJsonBlocks && allJsonBlocks.length > 0) {
    if (preferredFields && preferredFields.length > 0) {
      // 找到所有包含任意优先字段的块
      const blocksWithField = allJsonBlocks.filter(block =>
        preferredFields.some(field => block.includes(`"${field}"`))
      );
      if (blocksWithField.length > 0) {
        const largest = blocksWithField.reduce((a, b) => a.length >= b.length ? a : b);
        const content = largest.match(/```json\s*([\s\S]*?)\s*```/);
        if (content) {
          console.log(`[extractJSON] 优先字段匹配成功 [${preferredFields.join(',')}]，选择包含目标字段的最大块`);
          return content[1].trim();
        }
      }
    }
    // 无优先字段命中时，取全局最大块（兜底）
    const largestBlock = allJsonBlocks.reduce((a, b) => a.length >= b.length ? a : b);
    const content = largestBlock.match(/```json\s*([\s\S]*?)\s*```/);
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
  // 如果是对象格式 {"shots": [...]} 或 {"shotList": [...]}（Stage3 使用 shotList）
  const shotsMatch = jsonStr.match(/"shots(?:List)?"\s*:\s*\[/);
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
 * 通用 JSON 语法修复（第三层兜底：层1）
 * 改编自 Stage4 fixCommonJSONErrors，去掉 shots 字段硬编码，适用于任意 JSON 结构。
 * 处理范围：缺逗号、多余逗号、注释、未闭合字符串行。
 */
function fixCommonJSONSyntax(jsonStr: string): string {
  let fixed = jsonStr;

  // 1. 移除注释
  fixed = fixed.replace(/\/\/[^\n]*\n/g, '\n');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  // 2. 修复缺少逗号（属性值后直接换行接新属性）
  fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');
  fixed = fixed.replace(/(\d+)\s*\n\s*"/g, '$1,\n"');
  fixed = fixed.replace(/true\s*\n\s*"/g, 'true,\n"');
  fixed = fixed.replace(/false\s*\n\s*"/g, 'false,\n"');
  // 修复对象属性之间缺少逗号：属性值结束后直接跟新属性名
  fixed = fixed.replace(/("\s*)\n(\s*"[^"]+"\s*:)/g, '$1,\n$2');
  // 修复相邻对象之间缺少逗号
  fixed = fixed.replace(/}\s*\n\s*{/g, '},\n{');

  // 3. 移除多余的逗号
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

  // 3.5. 修复 "Expected ':' after property name"：属性名后紧跟非冒号内容
  // 匹配: "key" 后面有空白但没有冒号，紧跟另一个值或引号
  fixed = fixed.replace(/"([^"]+)"\s+(?=["{[\d])/g, '"$1": ');

  // 4. 修复未闭合的字符串（逐行检查奇数未转义引号）
  const lines = fixed.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const quoteCount = (line.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0 && line.includes(':')) {
      if (!line.trim().endsWith('"') && !line.trim().endsWith(',')) {
        lines[i] = line + '"';
      }
    }
  }
  fixed = lines.join('\n');

  return fixed;
}

/**
 * 通用字符级深度扫描截断（第三层兜底：层2）
 * 改编自 Stage4 truncateToLastCompleteObject，泛化为任意顶层 JSON 对象/数组。
 * 通过维护 depth 计数器（字符串内部不计数），精确找到最后一个完整的顶层结构位置。
 * @returns 截断后合法的 JSON 字符串，无法截断时返回 null
 */
function truncateToLastCompleteJSON(jsonStr: string): string | null {
  const trimmed = jsonStr.trim();
  if (!trimmed) return null;

  const firstChar = trimmed[0];
  if (firstChar !== '{' && firstChar !== '[') return null;

  let depth = 0;
  let lastCompletePos = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

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

    if (!inString) {
      if (char === '{' || char === '[') {
        depth++;
      } else if (char === '}' || char === ']') {
        depth--;
        // depth 从1回到0：找到一个完整的顶层结构
        if (depth === 0) {
          lastCompletePos = i;
          // 继续扫描，记录最后一个完整结构
        }
      }
    }
  }

  if (lastCompletePos > 0) {
    const result = trimmed.slice(0, lastCompletePos + 1).trim();
    console.log(`[JSON通用修复] 字符级扫描截断，保留到位置: ${lastCompletePos}`);
    return result;
  }

  return null;
}

/**
 * 根据错误位置定位并修复 JSON（第三层兜底：层3）
 * 改编自 Stage4 forceFixJSONAtErrorPosition，泛化去掉 shots 字段依赖。
 * 从 SyntaxError.message 中提取 "position N"，定位到错误行并针对性修复，
 * 修复后再调用字符级截断确保结构合法。
 * @param errorMsg - JSON.parse 抛出的 SyntaxError.message
 * @returns 修复后的 JSON 字符串，无法修复时返回 null
 */
function fixJSONAtErrorPosition(jsonStr: string, errorMsg: string): string | null {
  const positionMatch = errorMsg.match(/position (\d+)/);
  if (!positionMatch) return null;

  const errorPosition = parseInt(positionMatch[1], 10);
  console.log(`[JSON通用修复] 错误位置: ${errorPosition}`);

  const lines = jsonStr.split('\n');
  let currentPos = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineStart = currentPos;
    const lineEnd = currentPos + lines[i].length;

    if (errorPosition >= lineStart && errorPosition <= lineEnd) {
      console.log(`[JSON通用修复] 错误在第 ${i + 1} 行: ${lines[i]}`);
      const line = lines[i];

      // 修复奇数引号（未闭合字符串）
      const quoteCount = (line.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        console.log('[JSON通用修复] 检测到未闭合引号，尝试修复');
        lines[i] = line + '"';
      }

      // 修复缺少逗号
      if (i < lines.length - 1) {
        const trimmedLine = lines[i].trim();
        const nextLine = lines[i + 1].trim();
        if (
          (trimmedLine.endsWith('"') || trimmedLine.endsWith('}') || trimmedLine.endsWith(']')) &&
          !trimmedLine.endsWith(',') &&
          !trimmedLine.endsWith('{') &&
          !trimmedLine.endsWith('[') &&
          (nextLine.startsWith('"') || nextLine.startsWith('{'))
        ) {
          console.log('[JSON通用修复] 检测到缺少逗号，尝试修复');
          lines[i] = lines[i] + ',';
        }
      }

      break;
    }

    currentPos = lineEnd + 1; // +1 for newline character
  }

  // 修复后再做字符级截断，确保顶层结构完整
  const fixedText = lines.join('\n');
  return truncateToLastCompleteJSON(fixedText) ?? fixedText;
}

/**
 * 验证JSON是否符合预期的schema
 * 支持宽松解析（处理尾随逗号等）
 */
export function validateJSON<T>(jsonStr: string, requiredFields: string[]): T {
  /**
   * 辅助：检查解析结果是否包含所有必需字段
   */
  function hasRequiredFields(obj: Record<string, unknown>): boolean {
    return requiredFields.every(field => field in obj);
  }

  // ─── 第一层：基础清理（去尾逗号、注释、括号不平衡修复）───
  try {
    const cleanedJson = cleanJSON(jsonStr);
    const obj = JSON.parse(cleanedJson);
    if (!hasRequiredFields(obj)) throw new Error(`缺少必需字段`);
    return obj as T;
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof Error && error.message.startsWith('缺少必需字段'))) {
      throw error;
    }

    const syntaxError = error instanceof SyntaxError ? error : null;

    // ─── 第二层：激进控制字符清理 ───
    try {
      const aggressiveCleaned = cleanJSON(jsonStr).replace(/[\x00-\x1f]/g, (c) => {
        if (c === '\n' || c === '\r' || c === '\t') return c;
        return '';
      });
      const obj = JSON.parse(aggressiveCleaned);
      if (!hasRequiredFields(obj)) throw new Error(`缺少必需字段`);
      return obj as T;
    } catch {
      // 继续到第三层
    }

    if (!syntaxError) {
      throw new Error(`JSON解析失败: ${error.message}`);
    }

    // ─── 第三层：通用多策略修复（层1→层2→层3）───
    console.warn('[JSON通用修复] 前两轮清理失败，启动第三层修复策略...');
    const baseStr = cleanJSON(jsonStr);

    // 层1：通用语法修复（缺逗号、多余逗号、未闭合字符串）
    try {
      const syntaxFixed = fixCommonJSONSyntax(baseStr);
      const obj = JSON.parse(syntaxFixed);
      if (!hasRequiredFields(obj)) throw new Error(`缺少必需字段`);
      console.log('[JSON通用修复] 层1（通用语法修复）成功');
      return obj as T;
    } catch { /* 继续尝试层2 */ }

    // 层2：字符级深度扫描截断（找最后完整顶层结构）
    try {
      const syntaxFixed = fixCommonJSONSyntax(baseStr);
      const truncated = truncateToLastCompleteJSON(syntaxFixed);
      if (truncated) {
        const obj = JSON.parse(truncated);
        if (!hasRequiredFields(obj)) throw new Error(`缺少必需字段`);
        console.log('[JSON通用修复] 层2（字符级扫描截断）成功');
        return obj as T;
      }
    } catch { /* 继续尝试层3 */ }

    // 层3：错误位置定位修复（根据 position N 定位错误行并针对性修复）
    try {
      const posFixed = fixJSONAtErrorPosition(baseStr, syntaxError.message);
      if (posFixed) {
        const obj = JSON.parse(posFixed);
        if (!hasRequiredFields(obj)) throw new Error(`缺少必需字段`);
        console.log('[JSON通用修复] 层3（错误位置定位）成功');
        return obj as T;
      }
    } catch { /* 所有策略均失败 */ }

    throw new Error(`JSON解析失败: ${syntaxError.message}`);
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
  // 将 requiredFields 作为优先字段传给 extractJSON，确保选中包含目标字段的 JSON 块
  const jsonStr = extractJSON(text, requiredFields.length > 0 ? requiredFields : undefined);
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

