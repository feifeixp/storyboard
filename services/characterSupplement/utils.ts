/**
 * 工具函数
 */

/**
 * 修复JSON字符串中的控制字符
 * 只在字符串字面量内部（引号之间）替换控制字符，避免破坏JSON结构
 */
function fixControlCharacters(jsonStr: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const charCode = char.charCodeAt(0);

    // 处理转义字符
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }

    // 检测字符串边界
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    // 在字符串内部，替换控制字符
    if (inString && charCode >= 0x00 && charCode <= 0x1F && char !== '\n' && char !== '\r' && char !== '\t') {
      // 将控制字符替换为空格（保守策略）
      result += ' ';
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * 尝试解析JSON，如果失败且是控制字符错误，则修复后重试
 */
function safeJSONParse(jsonStr: string): any {
  try {
    return JSON.parse(jsonStr);
  } catch (e: any) {
    // 检查是否是控制字符错误
    if (e.message && (e.message.includes('control character') || e.message.includes('Bad control character'))) {
      console.warn('[extractJSON] 检测到控制字符错误，尝试修复...');
      try {
        const fixed = fixControlCharacters(jsonStr);
        const result = JSON.parse(fixed);
        console.log('[extractJSON] ✅ 控制字符修复成功');
        return result;
      } catch (e2) {
        console.warn('[extractJSON] ⚠️ 控制字符修复后仍然失败:', e2);
        throw e; // 抛出原始错误
      }
    }
    throw e;
  }
}

/**
 * 从LLM响应中提取JSON
 * 🆕 增强: 添加详细日志,帮助诊断提取失败问题
 * 🔧 修复: 自动检测并修复控制字符错误
 */
export function extractJSON(content: string, sectionName: string = '最终输出'): any {
  console.log(`[extractJSON] 尝试提取 ${sectionName} 的JSON...`);
  console.log(`[extractJSON] 内容总长度: ${content.length} 字符`);

  // 🆕 检查是否包含【最终输出】标记
  const hasFinalMarker = content.includes(`【${sectionName}】`);
  console.log(`[extractJSON] 是否包含【${sectionName}】标记: ${hasFinalMarker}`);

  if (hasFinalMarker) {
    // 提取【最终输出】后的内容
    const finalIndex = content.indexOf(`【${sectionName}】`);
    const afterFinal = content.substring(finalIndex);
    console.log(`[extractJSON] 【${sectionName}】后的内容长度: ${afterFinal.length} 字符`);
    console.log(`[extractJSON] 【${sectionName}】后的内容预览:`, afterFinal.substring(0, 500));
  }

  // 🆕 优先匹配【最终输出】后的JSON块
  const sectionPattern = new RegExp(`【${sectionName}】[\\s\\S]*?\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\``, 'i');
  const sectionMatch = content.match(sectionPattern);

  if (sectionMatch) {
    try {
      const jsonStr = sectionMatch[1];
      const result = safeJSONParse(jsonStr); // 🔧 使用安全解析
      console.log(`[extractJSON] ✅ 成功提取 (使用【${sectionName}】模式)`);
      return result;
    } catch (e) {
      console.warn(`[extractJSON] ⚠️ 【${sectionName}】模式匹配但解析失败:`, e);
    }
  }

  // 🆕 如果【最终输出】模式失败,尝试查找最后一个JSON块
  // 🆕 修改E：降级为 info，因为这是正常的降级策略
  console.log(`[extractJSON] ℹ️ 未找到【${sectionName}】,尝试查找最后一个JSON块...`);

  const allJsonBlocks = content.matchAll(/```json\s*([\s\S]*?)\s*```/g);
  const jsonArray = Array.from(allJsonBlocks);

  if (jsonArray.length > 0) {
    // 从后往前尝试解析
    for (let i = jsonArray.length - 1; i >= 0; i--) {
      try {
        const jsonStr = jsonArray[i][1];
        const result = safeJSONParse(jsonStr); // 🔧 使用安全解析
        console.log(`[extractJSON] ✅ 成功提取 (使用最后一个JSON块,索引${i})`);
        return result;
      } catch (e) {
        console.warn(`[extractJSON] ⚠️ JSON块${i}解析失败:`, e);
        continue;
      }
    }
  }

  // 最后尝试匹配任何JSON对象
  const anyJsonMatch = content.match(/{[\s\S]*}/);
  if (anyJsonMatch) {
    try {
      const result = safeJSONParse(anyJsonMatch[0]); // 🔧 使用安全解析
      console.log(`[extractJSON] ✅ 成功提取 (使用通用JSON模式)`);
      return result;
    } catch (e) {
      console.warn(`[extractJSON] ⚠️ 通用JSON模式解析失败:`, e);
    }
  }

  console.error('[extractJSON] ❌ 所有模式都失败');
  console.error('[extractJSON] 内容预览:', content.substring(0, 500));
  throw new Error(`无法从响应中提取JSON (section: ${sectionName})`);
}

/**
 * 🆕 验证思维链完整性
 * 检查响应中是否包含所有必需的步骤标记
 */
export function validateChainOfThought(
  content: string,
  expectedSteps: string[],
  stageName: string
): { isValid: boolean; missingSteps: string[]; warnings: string[] } {
  const missingSteps: string[] = [];
  const warnings: string[] = [];

  // 检查每个步骤标记
  for (const step of expectedSteps) {
    if (!content.includes(step)) {
      missingSteps.push(step);
    }
  }

  // 检查是否有"思考过程"和"输出结果"
  const thinkingCount = (content.match(/思考过程：/g) || []).length;
  const resultCount = (content.match(/输出结果：/g) || []).length;

  if (thinkingCount < expectedSteps.length - 1) {  // -1 因为最终输出没有"思考过程"
    warnings.push(`思考过程数量不足: 期望${expectedSteps.length - 1}个,实际${thinkingCount}个`);
  }

  if (resultCount < expectedSteps.length - 1) {
    warnings.push(`输出结果数量不足: 期望${expectedSteps.length - 1}个,实际${resultCount}个`);
  }

  const isValid = missingSteps.length === 0;

  if (!isValid || warnings.length > 0) {
    console.warn(`[${stageName}] 思维链验证结果:`, {
      isValid,
      missingSteps,
      warnings,
      contentLength: content.length
    });
  }

  return { isValid, missingSteps, warnings };
}

/**
 * 验证对象是否包含所有必需字段
 */
export function validateRequiredFields(obj: any, requiredFields: string[], stageName: string): void {
  const missingFields = requiredFields.filter(field => {
    const value = field.split('.').reduce((o, k) => o?.[k], obj);
    return value === undefined || value === null;
  });

  if (missingFields.length > 0) {
    throw new Error(`${stageName}输出缺少必需字段: ${missingFields.join(', ')}`);
  }
}

/**
 * 从流式响应中检测步骤标记
 */
export function detectStepMarker(content: string): string | null {
  const stepPatterns = [
    /【Step (\d+\.\d+) 执行中】/,
    /【最终输出】/
  ];

  for (const pattern of stepPatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * 提取思考过程
 */
export function extractThinking(content: string, stepNumber: string): string {
  const pattern = new RegExp(
    `【Step ${stepNumber} 执行中】[\\s\\S]*?思考过程：\\s*([\\s\\S]*?)\\s*输出结果：`,
    'i'
  );
  
  const match = content.match(pattern);
  return match ? match[1].trim() : '';
}

/**
 * 合并多个阶段的结果
 */
export function mergeStageResults(
  stage1: any,
  stage2: any,
  stage3: any,
  stage4: any
): string {
  // 合并为完整的外观描述（使用新的字段结构）
  const mainCharacter = stage3.finalDescription.mainCharacter;
  const facialFeatures = stage3.finalDescription.facialFeatures;
  const costume = stage4.finalDescription;

  return `【主体人物】${mainCharacter}\n【外貌特征】${facialFeatures}\n【服饰造型】${costume}`;
}

/**
 * 格式化进度消息
 */
export function formatProgressMessage(stage: string, step: string, emoji: string, message: string): string {
  return `${emoji} ${message}`;
}

/**
 * 合并形态数组（去重）
 */
export function mergeUniqueForms(
  existing: any[] | undefined,
  newForms: any[] | undefined
): any[] {
  if (!existing || existing.length === 0) return newForms || [];
  if (!newForms || newForms.length === 0) return existing;

  const merged = [...existing];
  const existingNames = new Set(existing.map(f => f.name?.toLowerCase()));

  for (const form of newForms) {
    if (!form.name || !existingNames.has(form.name.toLowerCase())) {
      merged.push(form);
      if (form.name) existingNames.add(form.name.toLowerCase());
    }
  }

  return merged;
}

/**
 * 合并能力数组（去重）
 */
export function mergeUniqueAbilities(
  existing: string[] | undefined,
  newAbilities: string[] | undefined
): string[] {
  if (!existing || existing.length === 0) return newAbilities || [];
  if (!newAbilities || newAbilities.length === 0) return existing;

  const merged = [...existing];
  const existingSet = new Set(existing.map(a => a.toLowerCase().trim()));

  for (const ability of newAbilities) {
    const normalized = ability.toLowerCase().trim();
    if (!existingSet.has(normalized)) {
      merged.push(ability);
      existingSet.add(normalized);
    }
  }

  return merged;
}

