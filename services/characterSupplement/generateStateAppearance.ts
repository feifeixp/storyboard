/**
 * 为角色状态生成完整的外观描述
 * 🔧 重构：基于基底做差异化生成，避免"像换了个人"
 */

import type { CharacterRef, CharacterForm } from '../../types';
import type { ScriptFile } from '../../types/project';
import { getLLMChatCompletionsURL } from '../openrouter';

/**
 * 清理文本中的重复【当前状态】标记
 * 🔧 修复：加 null/undefined 检查，防止 text.replace is not a function 崩溃
 */
function cleanDuplicateStateMarkers(text: any): string {
  // 防御性检查：null/undefined/非string 均安全返回空字符串
  if (!text || typeof text !== 'string') return '';
  // 移除所有【当前状态】标记
  let cleaned = text.replace(/【当前状态】/g, '');
  // 清理多余的空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

/**
 * 为单个状态生成完整的外观描述
 * 🔧 新逻辑：基于常规状态（base）做差异化派生
 *
 * @param baseAppearance 常规完好状态的外观描述（作为基底）
 * @param state 状态信息（包含delta变化要点）
 * @param characterInfo 角色基本信息（性别、年龄等）
 * @param beautyLevel 美型等级
 * @param model LLM模型名称
 * @param onProgress 进度回调
 * @returns 包含完整外观描述的CharacterForm
 */
export async function generateStateAppearance(
  baseAppearance: string,
  state: CharacterForm,
  characterInfo: { name: string; gender?: string; ageGroup?: string },
  beautyLevel: 'realistic' | 'balanced' | 'idealized' = 'balanced',
  model: string = 'gemini-2.5-flash',
  onProgress?: (stage: string, step: string) => void
): Promise<CharacterForm> {

  console.log(`[状态外观生成] 开始为状态"${state.name}"生成外观描述...`);

  // 🔧 清理输入：移除可能存在的【当前状态】标记
  const cleanedBase = cleanDuplicateStateMarkers(baseAppearance);
  const cleanedDelta = cleanDuplicateStateMarkers(state.delta || state.description);

  // 构建提示词
  const prompt = buildStateGenerationPrompt(
    cleanedBase,
    state,
    cleanedDelta,
    characterInfo,
    beautyLevel
  );

  // 调用LLM
  const apiKey = import.meta.env.VITE_OPENROUTER1_API_KEY;
  if (!apiKey) {
    throw new Error('未设置OpenRouter API密钥 (VITE_OPENROUTER1_API_KEY)');
  }

  onProgress?.('状态生成', `生成"${state.name}"外观描述`);

  const response = await fetch(getLLMChatCompletionsURL(), {
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
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`LLM调用失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // 解析生成的外观描述
  const appearance = parseAppearanceFromResponse(content);

  // 🔧 清理输出：确保只有一个【当前状态】标记（在最前面）
  const finalAppearance = `【当前状态】${state.name}\n\n${cleanDuplicateStateMarkers(appearance)}`;

  // 更新state
  const updatedState: CharacterForm = {
    ...state,
    appearance: finalAppearance,
    visualPromptCn: extractVisualPrompt(finalAppearance, 'cn'),
    visualPromptEn: extractVisualPrompt(finalAppearance, 'en')
  };

  console.log(`[状态外观生成] 状态"${state.name}"生成完成`);

  return updatedState;
}

/**
 * 构建状态生成提示词
 * 🔧 基于基底做差异化生成，强约束"同一个人"
 */
function buildStateGenerationPrompt(
  baseAppearance: string,
  state: CharacterForm,
  delta: string,
  characterInfo: { name: string; gender?: string; ageGroup?: string },
  beautyLevel: 'realistic' | 'balanced' | 'idealized'
): string {
  const beautyLevelDesc = {
    realistic: '真实自然（允许小瑕疵）',
    balanced: '自然美化（真实与美之间平衡）',
    idealized: '极致美型（追求完美）'
  }[beautyLevel];

  return `# 任务：为角色状态生成外观描述

## 核心原则
你是一个专业的角色设计师。你的任务是基于角色的**常规完好状态**，生成该角色在**特定状态**下的外观描述。

⚠️ **最重要的约束**：
- 这必须是**同一个人**！
- 只改变状态变化要点（delta）中描述的部分
- 保持身份锚点不变：发型家族、发色、眼睛颜色、脸型、身材比例、标志特征

## 角色基本信息
- 名称：${characterInfo.name}
- 性别：${characterInfo.gender || '未知'}
- 年龄段：${characterInfo.ageGroup || '未知'}
- 美型等级：${beautyLevelDesc}

## 常规完好状态（基底）
${baseAppearance}

## 当前状态信息
- 状态名称：${state.name}
- 变化类型：${state.changeType || 'other'}
- 变化要点：${delta}

## 任务要求

请基于"常规完好状态"，生成"${state.name}"的外观描述。

### 🆕 修改5：证据驱动判断（第一步：判断变化类型）

请仔细阅读"变化要点"，判断以下问题：

#### 1. 是否明确提到"换装"？
- ✅ 如果明确提到"换上XX衣服""穿着XX""改穿XX" → hasClothingChange = true
- ❌ 如果只是"战损/濒死/虚弱/血污"等状态 → hasClothingChange = false（基于常规服装，只输出破损/血污/缺失）

#### 2. 是否明确提到"换妆/卸妆"？
- ✅ 如果明确提到"浓妆""素颜""妆容精致""卸妆" → hasMakeupChange = true
- ❌ 如果没有提到 → hasMakeupChange = false（继承常规妆容）

#### 3. 是否明确提到"换发型"？
- ✅ 如果明确提到"披散头发""束发""剪短""改变发型" → hasHairStyleChange = true
- ❌ 如果没有提到 → hasHairStyleChange = false（继承常规发型）

⚠️ **重要原则**：只有"变化要点"**明确提到**才算"换"！

### 必须保持不变（身份锚点）
- 发型家族（如：短发/长发/中长发，直发/卷发）- 除非 hasHairStyleChange = true
- 发色（除非delta明确说明换发色）
- 眼睛颜色和形状
- 脸型和五官特征
- 身材比例和体态
- 标志性特征（如：疤痕、胎记、特殊气质）
- 妆容 - 除非 hasMakeupChange = true
- 服装款式 - 除非 hasClothingChange = true

### 允许改变（根据delta）
- 如果 hasClothingChange = true：输出全新的服装描述
- 如果 hasClothingChange = false：只输出破损/血污/缺失等变化
- 如果 hasMakeupChange = true：输出新的妆容描述
- 如果 hasHairStyleChange = true：输出新的发型描述
- 精神状态（如：疲惫、憔悴）

### 🆕 修改5：输出格式（结构化 Delta）

请按以下 JSON 格式输出（注意：必须包含 hasClothingChange/hasMakeupChange/hasHairStyleChange 三个布尔值）：

{
  "hasClothingChange": true 或 false,
  "hasMakeupChange": true 或 false,
  "hasHairStyleChange": true 或 false,
  "appearance": {
    "【主体人物】": "人种、性别、年龄、时代背景、头身比例",
    "【外貌特征】": "发型、发色、眼睛、五官、肤色、体态，100-150字",
    "【服饰造型】": {
      "【内层】": "内层服装的材质、版型、颜色、设计细节、新旧程度",
      "【中层】": "中层服装的材质、版型、颜色、设计细节、新旧程度",
      "【外层】": "外层服装的材质、版型、颜色、设计细节、新旧程度（如果有）",
      "【鞋靴】": "鞋靴的材质、款式、颜色、设计细节、新旧程度",
      "【腰带与挂件】": "腰带、挂件的材质、款式、颜色、设计细节、新旧程度（如果有）",
      "【头饰/配饰】": "头饰、配饰的材质、款式、颜色、设计细节、新旧程度（如果有）"
    }
  }
}

💡 **说明**：
- 如果 hasClothingChange = false，【服饰造型】只描述破损/血污/缺失等变化，不改变款式
- 如果 hasMakeupChange = false，【外貌特征】中的妆容部分继承常规状态
- 如果 hasHairStyleChange = false，【外貌特征】中的发型部分继承常规状态
- 如果某层不存在（如只有单层服装），可以省略该标签

### 特别注意
1. 如果是战损状态，血迹/伤口要影视化呈现（避免惊悚血腥）
2. 如果是换装状态，只改变服饰部分，身体特征完全保持
3. 如果是妆容变化，只改变妆容描述，其他保持
	4. 描述要具体、有画面感，便于AI绘图
	5. 除非变化要点中明确提到"脸部刀疤/伤痕/淤青"，不要凭空添加大面积面部伤疤，尤其避免对主角/重要正面角色造成明显的"毁容感"；可以优先通过服装破损、血迹和整体状态来表现受伤

## 🚨 战损状态强制规则（最高优先级）

如果状态名称或变化类型包含"战损"（包括"轻微战损"），**必须**在输出中包含以下四要素：

**必须包含的四要素**：
1. **衣物轻微破损**：袖口磨损、小裂口、下摆抽丝、边缘磨损等
2. **轻微脏污**：尘土、泥点、灰尘（影视化呈现，避免过度脏乱）
3. **轻微血迹**：衣角少量血点、擦痕（影视化呈现，避免惊悚血腥）
4. **发型散乱**：几缕散发、簪子略歪、发髻松散（但仍保持同一人的发型家族）

**允许包含的视觉外显**：
- 眼部外显：双目泛红、眼白微红、目光坚定、眼神深沉等（可直接画出的特征）

**严格禁止**：
- ❌ 不要写"整体服饰保持完好"或类似矛盾表述
- ❌ 不要写"无明显变化"
- ❌ 战损状态必须有视觉差异，不能与常规完好状态相同

💡 **说明**：战损（轻微）不等于"无变化"，必须体现出与常规完好状态的视觉差异。

请开始生成：`;
}

/**
 * 从LLM响应中解析外观描述
 * 🆕 修改5：支持结构化 JSON 输出
 */
function parseAppearanceFromResponse(content: string): string {
  // 🆕 尝试解析 JSON 格式
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[1]);

      // 提取 appearance 对象
      const appearance = jsonData.appearance || {};

      // 构建外观描述
      const parts = [];

      if (appearance['【主体人物】']) {
        parts.push(`【主体人物】${appearance['【主体人物】']}`);
      }

      if (appearance['【外貌特征】']) {
        parts.push(`【外貌特征】${appearance['【外貌特征】']}`);
      }

      if (appearance['【服饰造型】']) {
        const costume = appearance['【服饰造型】'];
        if (typeof costume === 'string') {
          parts.push(`【服饰造型】${costume}`);
        } else {
          // 结构化服装描述
          const costumeParts = [];
          if (costume['【内层】']) costumeParts.push(`【内层】${costume['【内层】']}`);
          if (costume['【中层】']) costumeParts.push(`【中层】${costume['【中层】']}`);
          if (costume['【外层】']) costumeParts.push(`【外层】${costume['【外层】']}`);
          if (costume['【鞋靴】']) costumeParts.push(`【鞋靴】${costume['【鞋靴】']}`);
          if (costume['【腰带与挂件】']) costumeParts.push(`【腰带与挂件】${costume['【腰带与挂件】']}`);
          if (costume['【头饰/配饰】']) costumeParts.push(`【头饰/配饰】${costume['【头饰/配饰】']}`);

          if (costumeParts.length > 0) {
            parts.push(`【服饰造型】\n${costumeParts.join('\n')}`);
          }
        }
      }

      if (parts.length > 0) {
        return parts.join('\n\n');
      }
    }
  } catch (e) {
    console.warn('[parseAppearanceFromResponse] JSON 解析失败，尝试传统格式:', e);
  }

  // 🔧 兜底：使用传统格式解析
  const mainCharMatch = content.match(/【主体人物】\s*([\s\S]*?)(?=【|$)/);
  const facialMatch = content.match(/【外貌特征】\s*([\s\S]*?)(?=【|$)/);
  const costumeMatch = content.match(/【服饰造型】\s*([\s\S]*?)(?=【|$)/);

  const parts = [];
  if (mainCharMatch) parts.push(`【主体人物】${mainCharMatch[1].trim()}`);
  if (facialMatch) parts.push(`【外貌特征】${facialMatch[1].trim()}`);
  if (costumeMatch) parts.push(`【服饰造型】${costumeMatch[1].trim()}`);

  if (parts.length === 0) {
    // 如果没有匹配到标记，返回原始内容
    return content.trim();
  }

  return parts.join('\n\n');
}

/**
 * 批量为多个状态生成外观描述
 * 🔧 新签名：需要传入baseAppearance
 *
 * @param baseAppearance 常规完好状态的外观描述
 * @param states 状态列表
 * @param characterInfo 角色基本信息
 * @param beautyLevel 美型等级
 * @param model LLM模型名称
 * @param onProgress 进度回调
 * @param maxConcurrency 最大并发数（默认3）
 * @returns 包含完整外观描述的CharacterForm数组
 */
export async function generateStatesAppearance(
  baseAppearance: string,
  states: CharacterForm[],
  characterInfo: { name: string; gender?: string; ageGroup?: string },
  beautyLevel: 'realistic' | 'balanced' | 'idealized' = 'balanced',
  model: string = 'gemini-2.5-flash',
  onProgress?: (stateIndex: number, stage: string, step: string) => void,
  maxConcurrency: number = 3
): Promise<CharacterForm[]> {

  console.log(`[批量状态生成] 开始为${states.length}个状态生成外观描述...`);

  const results: CharacterForm[] = [];

  // 🆕 并发控制：每次最多处理maxConcurrency个状态
  for (let i = 0; i < states.length; i += maxConcurrency) {
    const batch = states.slice(i, Math.min(i + maxConcurrency, states.length));

    console.log(`[批量状态生成] 处理第${i + 1}-${Math.min(i + maxConcurrency, states.length)}个状态（共${states.length}个）`);

    const batchResults = await Promise.all(
      batch.map((state, batchIndex) => {
        const stateIndex = i + batchIndex;
        return generateStateAppearance(
          baseAppearance,
          state,
          characterInfo,
          beautyLevel,
          model,
          (stage, step) => {
            onProgress?.(stateIndex, stage, step);
          }
        );
      })
    );

    results.push(...batchResults);
  }

  console.log(`[批量状态生成] 全部完成，共生成${results.length}个状态`);

  return results;
}

/**
 * 从外观描述中提取视觉提示词
 * @param appearance 外观描述
 * @param lang 语言（cn/en）
 * @returns 视觉提示词
 */
function extractVisualPrompt(appearance: string, lang: 'cn' | 'en'): string {
  // 移除【当前状态】标记
  const cleaned = appearance.replace(/【当前状态】[^\n]*\n*/g, '');

  // 提取【主体人物】【外貌特征】【服饰造型】部分
  const mainCharMatch = cleaned.match(/【主体人物】\s*([^【]*)/);
  const facialMatch = cleaned.match(/【外貌特征】\s*([^【]*)/);
  const costumeMatch = cleaned.match(/【服饰造型】\s*([^【]*)/);

  const parts = [
    mainCharMatch?.[1]?.trim(),
    facialMatch?.[1]?.trim(),
    costumeMatch?.[1]?.trim()
  ].filter(Boolean);

  if (lang === 'cn') {
    return parts.join('，');
  } else {
    // 英文版本需要翻译，这里暂时返回空字符串
    // 实际应该调用翻译API或LLM
    return '';
  }
}

