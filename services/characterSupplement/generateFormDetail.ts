/**
 * Phase 3：按需展开设计
 * 用户在 Phase 2 形态清单中点击"展开设计"时触发。
 * 基于角色基础外貌（baseline）+ FormSummary 元数据 + 剧本上下文，
 * 调用 LLM 生成完整 CharacterForm（description + visualPromptCn + visualPromptEn）。
 */

import type { CharacterRef, CharacterForm } from '../../types';
import type { ScriptFile } from '../../types/project';
import type { FormSummary } from './types';
import { compilePrompt } from './promptCompiler';

const DEFAULT_MODEL = 'google/gemini-2.5-flash';

// changeType 中文映射（用于 Prompt 描述）
const CHANGE_TYPE_LABEL: Record<string, string> = {
  costume: '换装（服装/造型改变为主，面容基本不变）',
  makeup: '妆容变化（发型/妆容改变为主，服装基本不变）',
  damage: '战损状态（外观损伤：衣物破损、伤口血迹等）',
  transformation: '变身形态（体型/种族/气质整体变化，变化幅度最大）',
};

/**
 * 根据 changeType 返回段落级继承指令。
 * 明确告知 LLM 哪些段落复制 baseline、哪些需要重写。
 * @param summary FormSummary 元数据（含预标注时间线信息）
 */
function buildInheritanceInstruction(summary: FormSummary): string {
  const changeType = summary.changeType;
  switch (changeType) {
    case 'costume':
      return `## 继承规则（换装形态）
本形态属于"换装"，角色的身体特征和面容完全不变，只有服装/造型发生变化。

▶ 【主体人物】：**完整复制**基础外貌中的【主体人物】段落，不做任何修改。
▶ 【外貌特征】：**完整复制**基础外貌中的【外貌特征】段落，不做任何修改。
▶ 【服饰造型】：**根据剧本原文全部重新设计**，完整描述新服装的材质/款式/色彩/细节/新旧程度/配饰，不保留基础外貌中的服装内容。`;

    case 'makeup':
      return `## 继承规则（妆容变化形态）
本形态属于"妆容变化"，角色的身体特征和服装基本不变，主要改变发型和妆容。

▶ 【主体人物】：**完整复制**基础外貌中的【主体人物】段落，不做任何修改。
▶ 【外貌特征】：**在基础外貌原文上局部更新**，仅修改发型和妆容相关描述（如发色、发型、眼妆、唇色等），其余五官/肤色描述保持原文。请在改动处用"→"标注变化。
▶ 【服饰造型】：**基本复制**基础外貌中的【服饰造型】段落，仅在剧本有明确说明时做微调（如因场合变化的配饰）。`;

    case 'damage':
      return `## 继承规则（战损状态形态）

### ⚠️ Step 1（必须先执行）：时间线判断
${summary.timelinePhase
  ? `**本形态的时间线已由系统预判断：「${summary.timelinePhase}」，年龄：${summary.estimatedAge ? summary.estimatedAge + '岁' : '见上方元数据'}。**
直接按"情况A"处理，无需自行判断，跳过下方的推断步骤，直接执行情况A指令。`
  : `综合以下四个维度，判断这个形态属于哪个时间线/人生阶段：

① **形态名称**：是否暗示"过去/前世/变身前/曾经"（如：前世、重生前、幼年、曾经的她、那段岁月）
② **触发事件**：是否描述了另一个人生阶段或状态（如：嫁人后、被逼迫时、觉醒之前、前世临死前）
③ **剧本原文**：描述的年龄/外貌/处境/身份与基础外貌是否有明显落差？（如基础是22岁重生，而此处描述的是前世凄惨状态）
④ **角色人生轨迹**（若上方已提供）：对照轨迹中各阶段的时间标记，判断此场景属于哪一阶段，并推断该阶段的实际年龄与处境。`}

---

### 情况A：判断为"不同时间线/人生阶段"的损伤（如前世、重生前等）

▶ 【主体人物】：${summary.estimatedAge ? `**直接使用预判断年龄 ${summary.estimatedAge}岁**（禁止覆盖此年龄），` : '根据剧本和角色人生轨迹推断该时期的实际年龄（绝对禁止直接套用基础外貌的年龄），'}重写年龄信息，人种/性别保持不变。
▶ 【外貌特征】：根据该时期的年龄和处境**完全重新描述**（不继承基础外貌的发型/肤色等），再叠加损伤细节（血迹、伤口、瘀青、憔悴、凌乱发丝等）。
▶ 【服饰造型】：⛔ **严禁引用上方基础外貌中的任何服装款式**（基础外貌的服装属于另一时间线，与本形态无关）。必须根据推断出的时期、身份和处境**从零重新设计全套服装**（上装/下装/鞋履/配饰均需重新创作），再叠加破损细节（衣物撕裂、血污、泥土等）。

---

### 情况B：判断为"当前时间线的损伤"（同一时间段内受伤）

▶ 【主体人物】：**完整复制**基础外貌中的【主体人物】段落，不做任何修改。
▶ 【外貌特征】：**在基础外貌原文基础上叠加描述**，保留原有发型/五官，追加损伤细节（血迹、伤口、瘀青、憔悴状态、凌乱发丝等）。
▶ 【服饰造型】：**在基础外貌原文基础上叠加破损描述**，保留服装款式/材质/色彩，追加破损细节（衣物撕裂处、血污位置、泥土/灰尘污迹、残破配饰等）。

⚠️ 判断时优先依赖语义理解，而非关键词匹配——如剧本说"前世"、"重生前"、"那段黑暗岁月"等模糊表达，也应判断为不同时间线。`;

    case 'transformation':
    default:
      return `## 继承规则（变身形态）
本形态属于"变身"，变化幅度最大，可能涉及年龄、体型、种族、气质的全面改变。

▶ 【主体人物】：根据剧本依据判断——
  - 若种族/物种发生变化（如人→妖、人→神）：**重写此段**，更新人种/物种描述，并注明变身后的头身比例。
  - 若只是年龄变化（如时光倒流/未来形态）：**更新年龄信息**，其余保持。
  - 若仅气质改变、身体无变化：**完整复制**基础外貌原文。
▶ 【外貌特征】：根据剧本依据**全面重写**，可能包括发色/瞳色/肤色/五官的大幅改变，但必须注明每处变化的剧本依据。
▶ 【服饰造型】：根据剧本依据**全面重写**，通常变身后服装与常态有显著差异（如战甲、法衣、异族服饰等）。

⚠️ 所有与基础外貌的差异必须有剧本原文的明确依据，不可凭空添加。`;
  }
}

/**
 * 构建 Phase 3 的 LLM Prompt
 * 按 changeType 注入不同的段落级继承指令，避免 LLM 随机继承或全量重生成。
 * @param character 角色（含 baseline appearance）
 * @param summary FormSummary 元数据
 * @param scriptContext 与此形态相关的剧本片段
 */
function buildFormDetailPrompt(
  character: CharacterRef,
  summary: FormSummary,
  scriptContext: string
): string {
  const baselineAppearance = character.appearance || '（暂无基础外貌描述）';
  const changeLabel = CHANGE_TYPE_LABEL[summary.changeType] || summary.changeType;
  // 🆕 传递完整 summary，以便 buildInheritanceInstruction 直接使用预标注的时间线/年龄
  const inheritanceInstruction = buildInheritanceInstruction(summary);

  // 角色人生轨迹（如有），用于辅助跨时间线形态的年龄/处境判断
  const identityEvolutionSection = character.identityEvolution
    ? `\n## 角色人生轨迹（身份演变路线）\n${character.identityEvolution}\n⚠️ 注意：上方"基础外貌"对应当前时间线状态；判断跨时间线形态时，必须结合此轨迹推断该时期的真实年龄与处境。\n`
    : '';

  return `你是专业的影视剧角色造型设计师。请为角色"${character.name}"的「${summary.name}」形态生成完整的视觉设定描述。

## 角色基础外貌（常规完好状态 · Baseline）
${baselineAppearance}
${identityEvolutionSection}
## 当前形态元数据
- 形态名称：${summary.name}
- 变化类型：${changeLabel}
- 出现集数：${summary.episodeRange || '未标注'}
- 触发事件：${summary.triggerEvent}
- 剧本原文依据：「${summary.sourceQuote}」${summary.timelinePhase || summary.estimatedAge ? `
- 所属时间线：${summary.timelinePhase || '当前时间线'}（Stage 1 预判断，直接使用，无需重新推理）
- 对应年龄：${summary.estimatedAge ? `${summary.estimatedAge}岁` : '参考基础外貌'}（Stage 1 预判断，直接使用）
⚠️ 以上时间线和年龄为系统预判断结论，**必须严格遵守**，不得根据场景上下文自行推翻。` : ''}

## 相关剧本上下文
${scriptContext || '（无额外上下文）'}

${inheritanceInstruction}

## 输出格式要求

description 必须包含三个段落，每个段落按照继承规则处理（见上方）：
- 【主体人物】：人种/性别/年龄/时代，头身比例
- 【外貌特征】：发型/五官/肤色/气质
- 【服饰造型】：材质/款式/色彩/细节/新旧程度/配饰

严格以 JSON 格式输出（不要额外说明，不要 markdown 包裹之外的任何内容）：
\`\`\`json
{
  "description": "【主体人物】...【外貌特征】...【服饰造型】...",
  "visualPromptCn": "图像生成用中文提示词（50字以内，突出该形态与常态最显著的视觉差异，不重复通用基础描述）",
  "visualPromptEn": "Image generation English prompt (within 50 words, focus on the most distinctive visual differences from the baseline form)",
  "note": "与常态的核心差异一句话总结（20字以内）"
}
\`\`\``;
}

/**
 * 从 LLM 响应中提取 JSON 并转换为 CharacterForm 字段
 */
function parseFormDetailFromResponse(content: string): {
  description: string;
  visualPromptCn: string;
  visualPromptEn: string;
  note: string;
} | null {
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) {
      console.warn('[展开设计] 未找到 JSON 块，内容片段:', content.slice(0, 200));
      return null;
    }
    const parsed = JSON.parse(jsonStr);
    return {
      description: parsed.description || '',
      visualPromptCn: parsed.visualPromptCn || '',
      visualPromptEn: parsed.visualPromptEn || '',
      note: parsed.note || '',
    };
  } catch (e) {
    console.error('[展开设计] JSON 解析失败:', e);
    return null;
  }
}

/**
 * 从剧本中截取与 sourceQuote 相关的上下文片段。
 *
 * 策略：向上搜索最近的【场景】标题行作为起点，向下搜索下一个【场景】标题行作为终点，
 * 截取整个场景块以确保同场景内的年龄标注、时间线标记均被包含。
 * 若场景块超过 MAX_CONTEXT_CHARS 字符，则截取 quote 前后各一半的范围防止 token 超限。
 */
function extractScriptContext(scripts: ScriptFile[], sourceQuote: string): string {
  if (!sourceQuote) return '';

  const MAX_CONTEXT_CHARS = 1500;
  // 场景标题行的起始标记（如：【场景1-2：...】 或 【场 景...】）
  const SCENE_HEADER_PATTERN = /【场景/g;

  for (const script of scripts) {
    const content = script.content;
    const idx = content.indexOf(sourceQuote);
    if (idx === -1) continue;

    // 向上找最近的【场景】起点
    let sceneStart = 0;
    let match: RegExpExecArray | null;
    SCENE_HEADER_PATTERN.lastIndex = 0;
    while ((match = SCENE_HEADER_PATTERN.exec(content)) !== null) {
      if (match.index > idx) break;
      sceneStart = match.index;
    }

    // 向下找下一个【场景】起点（当前场景的终点）
    SCENE_HEADER_PATTERN.lastIndex = idx + sourceQuote.length;
    const nextScene = SCENE_HEADER_PATTERN.exec(content);
    const sceneEnd = nextScene ? nextScene.index : content.length;

    const sceneBlock = content.slice(sceneStart, sceneEnd);

    // 若场景块在限制范围内，直接返回整个场景块
    if (sceneBlock.length <= MAX_CONTEXT_CHARS) {
      return `【第${script.episodeNumber}集片段】\n${sceneBlock}`;
    }

    // 场景块过长：以 quote 为中心截取前后各一半
    const half = Math.floor(MAX_CONTEXT_CHARS / 2);
    const fallbackStart = Math.max(sceneStart, idx - half);
    const fallbackEnd = Math.min(sceneEnd, idx + sourceQuote.length + half);
    return `【第${script.episodeNumber}集片段】\n${content.slice(fallbackStart, fallbackEnd)}`;
  }
  return '';
}

/**
 * Phase 3 主函数：为指定 FormSummary 生成完整的 CharacterForm
 *
 * @param character 角色（含 baseline appearance）
 * @param summary FormSummary 元数据（Phase 1 产出）
 * @param scripts 剧本文件列表
 * @param model LLM 模型
 * @param onProgress 进度回调（可选）
 * @returns 完整的 CharacterForm（可直接追加到 character.forms[]）
 */
export async function generateFormDetail(
  character: CharacterRef,
  summary: FormSummary,
  scripts: ScriptFile[],
  model: string = DEFAULT_MODEL,
  onProgress?: (stage: string, content?: string) => void
): Promise<CharacterForm> {
  console.log(`[展开设计] 🎨 开始生成"${character.name}"的「${summary.name}」形态详情...`);
  onProgress?.('准备中', `分析剧本上下文...`);

  const scriptContext = extractScriptContext(scripts, summary.sourceQuote);
  const prompt = buildFormDetailPrompt(character, summary, scriptContext);

  const apiKey = (import.meta as any).env.VITE_OPENROUTER1_API_KEY;
  if (!apiKey) {
    throw new Error('未设置 OpenRouter API 密钥 (VITE_OPENROUTER1_API_KEY)');
  }

  onProgress?.('生成中', `正在调用 AI 生成形态设定...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90秒超时

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aidirector.app',
        'X-Title': 'AIdirector',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`无法解析 API 响应\n响应片段: ${responseText.substring(0, 300)}`);
    }

    const content = data.choices?.[0]?.message?.content || '';
    onProgress?.('解析中', '正在解析生成结果...');

    const parsed = parseFormDetailFromResponse(content);
    if (!parsed || !parsed.description) {
      throw new Error(`AI 未返回有效的形态描述\n原始内容片段：${content.slice(0, 200)}`);
    }

    console.log(`[展开设计] ✅ 「${summary.name}」形态设定生成成功`);
    onProgress?.('完成', '形态设定已生成');

    // 构建完整的 CharacterForm
    const changeTypePriority: Record<string, number> = {
      transformation: 90,
      damage: 70,
      costume: 50,
      makeup: 40,
    };

    // 🆕 尝试用 PromptCompiler 编译 visualPromptEn（确定性编译，无需 LLM）
    // 条件：角色必须具有来自 Stage3/Stage4 的结构化配置
    let compiledPromptEn: string | undefined;
    if (character.appearanceConfig && character.costumeConfig) {
      try {
        const compiled = compilePrompt({
          appearanceConfig: character.appearanceConfig,
          costumeConfig: character.costumeConfig,
          gender: character.gender || '女',
          era: (character as any).era || '',
          ageValue: summary.estimatedAge,
        });
        compiledPromptEn = compiled.positivePrompt;
        console.log(`[展开设计] 🆕 PromptCompiler 编译成功（${compiled.styleUsed}），已替换 visualPromptEn`);
      } catch (e) {
        console.warn('[展开设计] ⚠️ PromptCompiler 失败，降级使用 LLM 生成的 visualPromptEn', e);
      }
    }

    const form: CharacterForm = {
      id: `${character.id}-form-${summary.id}`,
      name: summary.name,
      episodeRange: summary.episodeRange || '',
      description: parsed.description,
      note: parsed.note,
      visualPromptCn: parsed.visualPromptCn,
      // 有编译结果则用编译结果，否则保留 LLM 生成的结果（向后兼容）
      visualPromptEn: compiledPromptEn || parsed.visualPromptEn,
      imageSheetUrl: '',
      imageGenerationMeta: {
        modelName: '',
        styleName: '',
        generatedAt: new Date().toISOString(),
      },
      changeType: summary.changeType as any,
      priority: changeTypePriority[summary.changeType] ?? 50 as any,
    };

    return form;

  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(
        `❌ 展开设计超时（90秒）\n角色：${character.name}，形态：${summary.name}\n\n建议：稍后重试`
      );
    }
    throw error;
  }
}

