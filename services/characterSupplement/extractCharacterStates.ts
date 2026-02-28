/**
 * 角色状态提取功能
 * 从剧本中识别角色的不同状态（受伤、换装、变身等）
 */

import type { CharacterRef, CharacterForm } from '../../types';
import type { ScriptFile } from '../../types/project';
import type { FormSummary, TimelinePhase } from './types';  // 🆕 Phase 1 轻量形态摘要类型
import { normalizeStateName, isBaselineStateName } from '../utils/stateNameUtils';  // 🆕 导入统一工具

/**
 * 🆕 修改F：修复 JSON 字符串内部的控制字符
 * 使用状态机扫描，只修复引号内的控制字符，不修复 JSON 结构中的控制字符
 */
function repairJSONControlCharacters(jsonStr: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    // 处理转义字符
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    // 检测转义符
    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }

    // 检测字符串边界
    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }

    // 如果在字符串内部，修复控制字符
    if (inString) {
      const charCode = char.charCodeAt(0);

      // 检测控制字符（\x00-\x1F）
      if (charCode >= 0 && charCode <= 31) {
        // 转换为转义序列
        switch (char) {
          case '\n':
            result += '\\n';
            break;
          case '\r':
            result += '\\r';
            break;
          case '\t':
            result += '\\t';
            break;
          case '\b':
            result += '\\b';
            break;
          case '\f':
            result += '\\f';
            break;
          default:
            // 其他控制字符：移除或转换为 Unicode 转义
            result += `\\u${charCode.toString(16).padStart(4, '0')}`;
            break;
        }
        continue;
      }
    }

    // 正常字符：直接添加
    result += char;
  }

  return result;
}

/**
 * 从剧本中提取角色的不同状态
 * @param character 角色信息
 * @param scripts 剧本文件列表
 * @param model LLM模型名称
 * @returns 提取的状态列表（CharacterForm数组）
 */
export async function extractCharacterStates(
  character: CharacterRef,
  scripts: ScriptFile[],
  model: string = 'google/gemini-2.5-flash'
): Promise<CharacterForm[]> {

  console.log(`[状态提取] 开始提取角色"${character.name}"的状态...`);

  // 构建剧本内容
  const scriptContent = scripts
    .map(s => `【第${s.episodeNumber}集】\n${s.content}`)
    .join('\n\n');

  // 构建提示词
  const prompt = buildStateExtractionPrompt(character, scriptContent);

  // 调用LLM
  const apiKey = (import.meta as any).env.VITE_OPENROUTER1_API_KEY;
  if (!apiKey) {
    throw new Error('未设置OpenRouter API密钥 (VITE_OPENROUTER1_API_KEY)');
  }

  // 🔧 变更C：添加 60s 超时，避免网络卡死
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, 60000); // 60秒超时

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        max_tokens: 4000
      }),
      signal: abortController.signal // 🔧 传入中止信号
    });

    clearTimeout(timeoutId); // 清除超时定时器

    if (!response.ok) {
      const errorText = await response.text();
      // 检测是否返回了HTML错误页面
      if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
        throw new Error(`❌ OpenRouter API 返回了 HTML 错误页面（可能是配额耗尽或模型不可用）\n状态码: ${response.status}\n请检查：\n1. API 配额是否充足\n2. 模型 ${model} 是否可用\n3. 是否被限流`);
      }
      throw new Error(`LLM调用失败: ${response.status} ${response.statusText}\n响应内容: ${errorText.substring(0, 500)}`);
    }

    const responseText = await response.text();

    // 检测响应是否为HTML（而非JSON）
    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
      throw new Error(`❌ OpenRouter API 返回了 HTML 错误页面（而非 JSON）\n这通常意味着：\n1. API 配额已耗尽\n2. 模型 ${model} 暂时不可用\n3. 请求被限流\n\n请检查 OpenRouter 控制台或更换模型。`);
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`❌ 无法解析 API 响应为 JSON\n响应内容: ${responseText.substring(0, 500)}\n错误: ${e}`);
    }

    const content = data.choices?.[0]?.message?.content || '';

    // 解析JSON
    const states = parseStatesFromResponse(content);

    console.log(`[状态提取] 提取到 ${states.length} 个状态`);

    return states;

  } catch (error: any) {
    clearTimeout(timeoutId); // 确保清除超时定时器

    // 🔧 处理超时错误
    if (error.name === 'AbortError') {
      throw new Error(`❌ 状态提取请求超时（60秒）\n角色：${character.name}\n模型：${model}\n\n可能原因：\n1. 网络连接不稳定\n2. OpenRouter 服务响应慢\n3. 剧本内容过长\n\n建议：稍后重试或更换模型`);
    }

    // 其他错误直接抛出
    throw error;
  }
}

/**
 * 构建状态提取提示词
 * 🔧 重写：明确过滤情绪状态，确保常规状态存在，添加changeType分类
 */
function buildStateExtractionPrompt(character: CharacterRef, scriptContent: string): string {
  return `# 任务：提取角色的视觉参考状态

## 核心目标
你是一个专业的角色设计师。你的任务是从剧本中提取角色"${character.name}"的**所有显著外观变化**，用于后续视频生成的一致性参考图。

⚠️ **重要原则**：
- 只提取"需要单独参考图"的外观形态变化
- **不要提取**纯情绪/表情状态（如"正义凛然"、"警惕骚动"、"愤怒"、"哭泣"等）
- 情绪/表情应该在镜头级提示词中处理，不需要单独的参考图

## 角色信息
- 名称：${character.name}
- 性别：${character.gender || '未知'}
- 基础外观：${character.appearance || '未填写'}

## 剧本内容
${scriptContent.substring(0, 10000)}

## 需要提取的状态类型

⚠️ **重要原则**：
- **不要生成"常规状态（完好）"或任何"常规/完好/默认/日常"状态**
- 角色的常规完好基底由系统从 character.appearance 自动生成
- 你只需要提取"显著变化态"（换装/战损/妆发变化/变身/年龄等）

### 1. 换装状态（changeType: costume）
- 日常装 → 礼服/战斗装/制服/夜行装/伪装等
- 同一套衣服在多集出现，应合并episodeRange
- 示例："门派制服（Ep 11-30）"、"终局礼服（Ep 56-80）"

### 2. 战损状态（changeType: damage）
- 轻度战损：小擦伤、少量血迹（影视化呈现，避免惊悚）
- 重度战损：明显破损、包扎、伤痕
- 濒死极限：如果剧本有且重要
- ⚠️ 不要为每次受伤都创建状态，只保留有代表性的层级

### 3. 妆容/发型变化（changeType: makeup）
- 能改变辨识度的妆容/发型变化
- 示例："盘发+浓妆"、"短发→长发"

### 4. 变身/觉醒（changeType: transformation）
- 外观大幅变化：妖化、机甲化、觉醒形态、年龄跨度变化
- 这类状态对一致性最敏感，必须提取

    ### 5. 其他（changeType: other）
    - 不属于以上分类但需要参考图的状态

    ## 状态命名规范（非常重要）
    - 状态名称必须以**外观/造型变化**为核心，而不是单纯的情绪或剧情事件
    - ❌ 不要使用「剧情事件 + 情绪/动作」来命名状态，例如：
      - "重生惊恐"
      - "重生反击"
      - "强吻伪装"
      - "被踹倒在地"
    - 这些属于**短暂的情绪/动作表现**，应该在镜头级剧本/镜头提示词里体现，不需要单独作为参考图状态
    - ✅ 如果确实存在需要记录的形态，请用造型来命名，例如：
      - "重生后礼服形态"
      - "终局战损礼服形态"

    ## 输出格式

⚠️ **重要：description 必须使用三段式结构化格式（可直接用于生图）**

每个状态的 description 字段必须包含以下三个部分，每部分约 100-150 字：

1. **【主体人物】**：人种、性别、年龄、时代背景、头身比例
2. **【外貌特征】**：发型、眼睛、五官、肤色、体态（100-150字）
3. **【服饰造型】**：服装款式、面料、颜色、设计细节、配饰（100-150字）

⚠️ **核心身份特征一致性约束（最高优先级）**：

**第一步：定义角色的核心身份特征（不可变）**
- 发色：XXX（如：深棕色、黑色、金色等）
- 眼色：XXX（如：深邃的棕黑色、黑色、蓝色等）
- 脸型：XXX（如：瘦削、圆润、方正等）
- 肤色：XXX（如：健康自然、白皙、古铜色等）

**第二步：生成各个状态的描述**
- **所有状态的【外貌特征】部分必须保持核心身份特征一致**
- 只有以下内容可以变化：
  - 发型（凌乱、整齐、盘发等）
  - 战损细节（擦伤、血迹、疲惫等）
  - 【服饰造型】部分（可以完全不同）

**示例**：
- 常规状态：深棕色长发、深邃如墨的棕黑色瞳仁、肤色健康自然
- 战损状态：深棕色长发（凌乱）、深邃如墨的棕黑色瞳仁、肤色健康自然（略显苍白）
- 换装状态：深棕色长发（盘发）、深邃如墨的棕黑色瞳仁、肤色健康自然

❌ **严格禁止**：
- 常规状态是"深棕色长发"，战损状态变成"黑色长发" ← 这是错误的！
- 常规状态是"棕黑色瞳仁"，战损状态变成"黑色眼眸" ← 这是错误的！
- 常规状态是"肤色健康自然"，战损状态变成"肤色苍白" ← 可以略显苍白，但不能完全改变基调

请以JSON格式输出，包含在 json 代码块中：

\`\`\`json
{
  "states": [
    {
      "name": "门派制服",
      "changeType": "costume",
      "episodeRange": "11-30",
      "delta": "换装：青色道袍，绣云纹，腰系玉带",
      "description": "【主体人物】\n中国人，男，28岁，修仙/玄幻/仙侠世界，8头身黄金比例\n\n【外貌特征】\n一头深棕色长发整齐垂落，发丝富有光泽。狭长眼型，眼尾微挑，深邃如墨的棕黑色瞳仁。脸型瘦削，肤色健康自然，无伤痕。唇色自然。\n\n【服饰造型】\n身着青色道袍，袍身绣有云纹图案，腰间系着玉带。脚踏黑色布靴，发间金线缠绕的发冠完整。",
      "isKeyframe": true,
      "priority": 90
    },
    {
      "name": "轻度战损",
      "changeType": "damage",
      "episodeRange": "25, 32, 40",
      "delta": "衣服轻微破损，少量血迹（影视化呈现）",
      "description": "【主体人物】\n中国人，男，28岁，修仙/玄幻/仙侠世界，8头身黄金比例\n\n【外貌特征】\n一头深棕色长发略显凌乱，发丝沾有少许灰尘。狭长眼型，眼尾微挑，深邃如墨的棕黑色瞳仁。脸型瘦削，肤色健康自然，左侧颧骨有浅浅擦痕，额角有一道干涸血痕。唇色自然，嘴角有一丝血迹。\n\n【服饰造型】\n身着碧绿丝缎大袍，袍身有轻微破损，少量血迹（影视化呈现，避免惊悚）。脚踏黑色布靴，腰间系着玉带，发间金线缠绕的发冠略有松动。",
      "isKeyframe": false,
      "priority": 50
    }
  ]
}
\`\`\`

## 字段说明
- **name**: 状态名称（简短，≤15字）
- **changeType**: 变化类型（costume/damage/makeup/transformation/other）
- **episodeRange**: 出现集数范围（如："1-10, 25-30"）
- **delta**: 相对于常规状态的变化要点（简短，≤50字）
- **description**: 该状态的完整外观描述（三段式结构化，每段100-150字）
  - 必须包含：【主体人物】【外貌特征】【服饰造型】
  - 可直接用于生成设定图
- **isKeyframe**: 是否为关键帧（建议优先生成设定图）
  - true: 常规状态、变身、覆盖集数最多的换装
  - false: 其他状态
- **priority**: 优先级（100=最高，用于排序）

## 关键帧判断标准
- 变身/觉醒：priority=95, isKeyframe=true
- 覆盖集数最多的换装：priority=90, isKeyframe=true
- 其他换装：priority=70-80, isKeyframe=false
- 战损状态：priority=50-60, isKeyframe=false

## 去重与合并规则
- 同一套衣服在多集出现，合并episodeRange
- 示例：第5集和第10集都穿"青色道袍" → episodeRange: "5, 10"

## ⚠️ 严格禁止
- ❌ 不要提取纯情绪状态（如"正义凛然"、"警惕骚动"、"愤怒"、"哭泣"）
- ❌ 不要提取短暂的表情变化
- ❌ **不要生成"常规状态（完好）"或任何"常规/完好/默认/日常"状态**
- ❌ description 必须使用三段式结构化格式（【主体人物】【外貌特征】【服饰造型】）

请开始分析：`;
}

/**
 * 🆕 解析 episodeRange 字符串为集数数组
 * @param episodeRange 如 "1-10, 25-30" 或 "5, 10, 15"
 * @returns 集数数组 如 [1,2,3,...,10,25,26,...,30]
 */
function parseEpisodeRange(episodeRange: string): number[] {
  if (!episodeRange || episodeRange.trim() === '') return [];

  const episodes = new Set<number>();

  // 分割逗号
  const parts = episodeRange.split(',').map(p => p.trim());

  for (const part of parts) {
    if (part.includes('-')) {
      // 范围：如 "1-10"
      const [start, end] = part.split('-').map(s => parseInt(s.trim(), 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          episodes.add(i);
        }
      }
    } else {
      // 单个集数：如 "5"
      const ep = parseInt(part.trim(), 10);
      if (!isNaN(ep)) {
        episodes.add(ep);
      }
    }
  }

  // 转为数组并排序
  return Array.from(episodes).sort((a, b) => a - b);
}

// 🔧 normalizeStateName 已移至 stateNameUtils.ts，统一使用

// 🚫 明显是剧情事件/情绪类的状态名关键字（仅用于解析时过滤，不限制造型设计本身）
// 🆕 v3：大幅扩展黑名单，覆盖本次测试中出现的垃圾形态
const BLOCKED_STATE_NAME_KEYWORDS = [
  // 原有黑名单
  '重生惊恐',
  '重生反击',
  '强吻伪装',
  '被踹倒在地',

  // 🆕 本次测试中出现的垃圾形态
  '噩梦中',
  '梦中',
  '落荒而逃',
  '惊慌失措',
  '柴房狰狞特写',
  '土屋前拖拽状态',
  '暴雨泥泞山路状态',
  '强吻后刀疤显露状态',
  '腹部受伤警惕状态',
  '重生初期战损与脏污',
] as const;

// 🆕 v2：被动事件词（用于模式匹配）
const PASSIVE_EVENT_KEYWORDS = [
  '被打', '被踹', '被踢', '被推', '被拉', '被扯', '被撕', '被抓', '被掐', '被勒',
  '被烫', '被烧', '被冻', '被淋', '被泼', '被砸', '被刺', '被割', '被咬', '被抓伤',
  '被强吻', '被拥抱', '被拖拽', '被按倒', '被压制',
] as const;

// 🆕 v3：情绪词（用于模式匹配）- 扩展了更多情绪词
const EMOTION_KEYWORDS = [
  '惊恐', '惊慌', '恐惧', '害怕', '惊吓', '惊愕', '惊慌失措',
  '愤怒', '暴怒', '狂怒', '怒火',
  '哭泣', '流泪', '痛哭', '抽泣', '哽咽',
  '绝望', '崩溃', '悲伤', '痛苦', '煎熬',
  '羞愧', '羞耻', '尴尬', '难堪',
  '狂喜', '兴奋', '激动', '欣喜',
  '警惕', '戒备', '紧张', '不安', '焦虑',  // 🆕 增加警惕等词
] as const;

// 只在解析阶段使用的简单关键字分类器，用于从文本中推断 changeType，尽量纠正 LLM 的误标
const COSTUME_KEYWORDS = ['礼服', '制服', '战斗服', '战甲', '铠甲', '长袍', '斗篷'];
const DAMAGE_KEYWORDS = ['战损', '伤口', '血迹', '淤青', '绷带', '包扎', '破损'];
const MAKEUP_KEYWORDS = ['妆容', '浓妆', '淡妆', '盘发', '散发', '发髻', '发型'];
const TRANSFORMATION_KEYWORDS = ['变身', '觉醒形态', '觉醒', '妖化', '机甲', '灵体', '虚影', '少年', '中年', '老年', '童年'];
const EMOTION_EVENT_KEYWORDS = ['惊恐', '愤怒', '哭泣', '流泪', '跪地', '被踹倒', '被打倒', '强吻'];

/**
 * 🆕 v3：名称黑名单判断（模式匹配 + 硬编码兜底）
 *
 * 过滤规则：
 * 1. 硬编码黑名单（兜底）
 * 2. 模式匹配：被动事件词 + 情绪词（如"被烫伤惊慌"、"被打愤怒"）
 * 3. 🆕 梦境/幻觉过滤（如"噩梦中"、"梦中"）
 * 4. 🆕 场景+动作过滤（如"柴房狰狞特写"、"土屋前拖拽状态"）
 * 5. 🆕 "状态"后缀 + 情绪/动作词过滤（如"落荒而逃状态"、"惊慌失措状态"）
 *
 * 说明：
 * - 这些状态名明显是"剧情事件+情绪"的组合，不是真正的外观形态
 * - 即使它们可能包含外观关键词（如"被烫伤"包含"烫伤"），也应该过滤掉
 * - 因为这类状态的核心是"情绪反应"，而非"外观大变化"
 */
function isBlockedStateName(name: string): boolean {
  const normalized = normalizeStateName(name);

  // 1. 硬编码黑名单（兜底）
  if (BLOCKED_STATE_NAME_KEYWORDS.some(kw => normalized.includes(kw))) {
    return true;
  }

  // 2. 模式匹配：被动事件词 + 情绪词
  const hasPassiveEvent = PASSIVE_EVENT_KEYWORDS.some(kw => normalized.includes(kw));
  const hasEmotion = EMOTION_KEYWORDS.some(kw => normalized.includes(kw));

  if (hasPassiveEvent && hasEmotion) {
    console.log(`[状态过滤] 检测到"被动事件+情绪"组合，过滤状态名: ${name}`);
    return true;
  }

  // 3. 🆕 梦境/幻觉一刀切过滤
  const dreamKeywords = ['噩梦', '梦中', '幻觉', '幻象', '想象中'];
  if (dreamKeywords.some(kw => normalized.includes(kw))) {
    console.log(`[状态过滤] 检测到梦境/幻觉关键词，过滤状态名: ${name}`);
    return true;
  }

  // 4. 🆕 场景+动作过滤（场景词 + 动作词）
  const sceneKeywords = ['柴房', '土屋', '山路', '泥泞', '雨夜', '暴雨', '雨中', '街头', '巷子'];
  const actionKeywords = ['拖拽', '推搡', '落荒而逃', '惊慌', '狰狞', '特写', '追逐', '逃跑'];

  const hasScene = sceneKeywords.some(kw => normalized.includes(kw));
  const hasAction = actionKeywords.some(kw => normalized.includes(kw));

  if (hasScene && hasAction) {
    console.log(`[状态过滤] 检测到"场景+动作"组合，过滤状态名: ${name}`);
    return true;
  }

  // 5. 🆕 "状态"后缀 + 情绪/动作词过滤
  if (normalized.endsWith('状态')) {
    const stateEmotionKeywords = ['落荒而逃', '惊慌失措', '警惕', '戒备', '紧张', '愤怒', '哭泣'];
    if (stateEmotionKeywords.some(kw => normalized.includes(kw))) {
      console.log(`[状态过滤] 检测到"状态后缀+情绪/动作"组合，过滤状态名: ${name}`);
      return true;
    }
  }

  return false;
}

// 根据名称 + delta + 描述推断真正的 changeType，只在原始 changeType 为 other/空 时使用
// ⚠️ 顺序规则：
// 1）优先识别外观相关关键词（服装/战损/妆发/变身），一旦命中，视为有效形态；
// 2）仅在完全未命中任何外观关键词时，再用情绪/事件关键词判断是否为纯事件；
// 3）既包含外观又包含情绪的状态，仍然按外观形态保留，避免“误杀”有价值形态。
function resolveChangeTypeForState(state: CharacterForm): CharacterForm['changeType'] | null {
  // 如果 LLM 已经给出四大外观类型之一，优先信任
  if (
    state.changeType === 'costume' ||
    state.changeType === 'damage' ||
    state.changeType === 'makeup' ||
    state.changeType === 'transformation'
  ) {
    return state.changeType;
  }

  const fullText = `${state.name || ''} ${state.delta || ''} ${state.description || ''}`;
  // 这里主要是中文，toLowerCase 仅用于兼容可能出现的英文关键词
  const text = fullText.toLowerCase();

  // 1️⃣ 先识别外观相关关键词（只要命中，就视为有效形态）
  if (COSTUME_KEYWORDS.some(kw => text.includes(kw))) return 'costume';
  if (DAMAGE_KEYWORDS.some(kw => text.includes(kw))) return 'damage';
  if (MAKEUP_KEYWORDS.some(kw => text.includes(kw))) return 'makeup';
  if (TRANSFORMATION_KEYWORDS.some(kw => text.includes(kw))) return 'transformation';

  // 2️⃣ 没有任何外观信号，再判断是否属于纯情绪/事件
  if (EMOTION_EVENT_KEYWORDS.some(kw => text.includes(kw))) {
    return null;
  }

  // 3️⃣ 既无外观变化也无情绪/事件关键词，视为无形态价值
  return null;
}

/**
 * 从LLM响应中解析状态列表
 * 🔧 变更A：状态名归一化 + 全量去重，彻底消灭"完好重复"
 */
function parseStatesFromResponse(content: string): CharacterForm[] {
  try {
    // 提取JSON块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      console.warn('[状态提取] 未找到JSON块');
      return [];
    }

    let jsonStr = jsonMatch[1];

    // 🆕 修改F：状态机修复 JSON 字符串内部的控制字符
    // 只修复引号内的控制字符，不修复 JSON 结构中的控制字符
    jsonStr = repairJSONControlCharacters(jsonStr);

    const data = JSON.parse(jsonStr);

    if (!data.states || !Array.isArray(data.states)) {
      console.warn('[状态提取] JSON格式错误：缺少states数组');
      return [];
    }

    // 转换为CharacterForm格式
    let states: CharacterForm[] = data.states.map((state: any, index: number) => {
      // 🆕 解析 episodeRange 为 appearsInEpisodes 数组
      const appearsInEpisodes = parseEpisodeRange(state.episodeRange || '');

      return {
        id: `state-${Date.now()}-${index}`,
        name: state.name || `状态${index + 1}`,
        episodeRange: state.episodeRange || '',
        appearsInEpisodes, // 🆕 添加集数数组
        description: state.description || '',
        changeType: state.changeType || 'other',
        delta: state.delta || '',
        isKeyframe: state.isKeyframe !== undefined ? state.isKeyframe : false,
        priority: state.priority !== undefined ? state.priority : 50,
        // appearance 字段暂时为空，等待用户手动触发生成
        appearance: undefined,
        // 保留旧字段兼容性
        note: state.changeType ? `类型：${state.changeType}` : undefined
      };
    });

    // 🆕 去重逻辑：按 normalizedName + changeType 去重（不改名）
    const deduplicationMap = new Map<string, CharacterForm>();

    states.forEach(state => {
      const key = `${normalizeStateName(state.name)}_${state.changeType}`;

      const existing = deduplicationMap.get(key);
      if (!existing) {
        // 首次出现，直接保存
        deduplicationMap.set(key, state);
      } else {
        // 已存在，选择保留规则：
        // - 优先保留 priority 更高的
        // - priority 相同时，保留 description 更长（更完整）的
        const shouldReplace =
          (state.priority || 0) > (existing.priority || 0) ||
          ((state.priority || 0) === (existing.priority || 0) &&
           (state.description?.length || 0) > (existing.description?.length || 0));

        if (shouldReplace) {
          console.log(`[状态提取] 🔄 去重：用更完整的"${state.name}"替换旧版本`);
          deduplicationMap.set(key, state);
        } else {
          console.log(`[状态提取] 🔄 去重：跳过重复的"${state.name}"`);
        }
      }
    });

    // 转回数组
    states = Array.from(deduplicationMap.values());

    console.log(`[状态提取] 去重后剩余 ${states.length} 个状态`);

    // 🆕 过滤掉 baseline 状态（常规状态（完好））
    const beforeBaselineFilterCount = states.length;
    states = states.filter(state => !isBaselineStateName(state.name));
    const baselineFilteredCount = beforeBaselineFilterCount - states.length;
    if (baselineFilteredCount > 0) {
      console.log(`[状态提取] 🚫 过滤掉 ${baselineFilteredCount} 个 baseline 状态（常规状态（完好））`);
    }

    // 🆕 过滤 1：名称黑名单（明显是剧情事件/情绪类的状态）
    const beforeNameFilterCount = states.length;
    states = states.filter(state => !isBlockedStateName(state.name));
    const nameFilteredCount = beforeNameFilterCount - states.length;
    if (nameFilteredCount > 0) {
      console.log(`[状态提取] 🚫 根据名称黑名单过滤掉 ${nameFilteredCount} 个明显是剧情事件/情绪的状态`);
    }

    // 🆕 过滤 2：基于语义的 changeType 解析，只保留四大外观变化类型
    const resolvedStates: CharacterForm[] = [];
    let discardedBySemantic = 0;

    for (const state of states) {
      const resolved = resolveChangeTypeForState(state);
      if (!resolved) {
        discardedBySemantic++;
        continue;
      }
      resolvedStates.push({
        ...state,
        changeType: resolved
      });
    }

    states = resolvedStates;
    if (discardedBySemantic > 0) {
      console.log(`[状态提取] 🚫 过滤掉 ${discardedBySemantic} 个非外观大变化状态（changeType=other 或情绪/事件类）`);
    }

    // 可选：统计各 changeType 数量，方便后续调试
    const typeStats = states.reduce<Record<string, number>>((acc, s) => {
      const key = s.changeType || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    console.log('[状态提取] 📊 各类型状态数量分布:', typeStats);

    // 按优先级排序（priority 从高到低）
    states.sort((a, b) => (b.priority || 50) - (a.priority || 50));

    console.log(`[状态提取] ✅ 解析成功，共 ${states.length} 个状态`);
    console.log(`[状态提取] 关键帧数量：${states.filter(s => s.isKeyframe).length}`);

    return states;

  } catch (error) {
    console.error('[状态提取] 解析失败:', error);
    return [];
  }
}

// ============================================================================
// 🆕 中期方案：形态清洗函数
// ============================================================================



/**
 * 检测是否是一次性剧情瞬间
 * 比 isBlockedStateName 更宽松，主要检测时间词+动作词的组合
 */
function isOneTimeEvent(name: string): boolean {
	  const normalized = normalizeStateName(name);
	
	  // 时间词：XX后、XX时、XX中
	  const timeKeywords = ['后', '时', '中', '瞬间', '刹那'];
	  const hasTime = timeKeywords.some(kw => normalized.includes(kw));
	
	  // 动作词：强吻、推搡、拖拽等
	  const actionKeywords = ['强吻', '推搡', '拖拽', '踹倒', '按倒', '压制', '逃跑', '追逐', '落荒而逃', '落荒', '逃亡'];
	  const hasAction = actionKeywords.some(kw => normalized.includes(kw));
	
	  // 情景 1：时间词 + 动作词 组合（原有规则）
	  if (hasTime && hasAction) {
	    return true;
	  }
	
	  // 情景 2：被动 + 动作（如「被推搡」「被踹倒」「被拖拽」）
	  const hasPassive = normalized.includes('被');
	  if (hasPassive && hasAction) {
	    return true;
	  }
	
	  // 情景 3：典型梦境 / 幻觉类，一律视为一次性事件
	  const dreamKeywords = ['噩梦', '梦中', '梦境', '梦里', '幻觉', '幻象', '臆想'];
	  if (dreamKeywords.some(kw => normalized.includes(kw))) {
	    return true;
	  }
	
	  // 情景 4：场景 + 动作 组合（如「柴房/土屋/山路/暴雨」+「落荒而逃/被拖拽」等）
	  const sceneKeywords = ['柴房', '土屋', '山路', '泥泞', '暴雨', '雨中', '街头', '巷口'];
	  const transientKeywords = ['落荒而逃', '落荒', '逃亡', '落跑', '被推搡', '被踹倒', '被拖拽', '被拖走'];
	  const hasScene = sceneKeywords.some(kw => normalized.includes(kw));
	  const hasTransient = transientKeywords.some(kw => normalized.includes(kw));
	  if (hasScene && hasTransient) {
	    return true;
	  }
	
	  // 情景 5：名称以「状态」结尾，且包含明显情绪/事件词汇时，一般是「情绪+事件」型瞬间
	  if (normalized.endsWith('状态')) {
	    const emotionOrEventKeywords = ['惊慌', '惊慌失措', '落荒而逃', '崩溃', '恐惧', '绝望', '暴怒', ...EMOTION_KEYWORDS];
	    if (emotionOrEventKeywords.some(kw => normalized.includes(kw))) {
	      return true;
	    }
	  }
	
	  return false;
	}

/**
 * 解析名称中的括号，判断是否是有效的形态描述
 *
 * @returns
 *   - null: 括号内容无效，应该丢弃整个形态
 *   - string: 括号内容有效，返回清洗后的名称
 */
function parseParenthesesInName(name: string): string | null {
  const match = name.match(/^(.+?)（(.+?)）$/);
  if (!match) {
    return name; // 没有括号，直接返回原名称
  }

  const baseName = match[1].trim();
  const parenthesesContent = match[2].trim();

  // 有效的括号内容（形态描述）
  const validKeywords = ['日常', '战损', '换装', '觉醒', '变身', '受伤', '妆容', '盛装', '便装'];
  const isValid = validKeywords.some(kw => parenthesesContent.includes(kw));

  if (isValid) {
    // 有效：拆解为 "基础名-形态描述"
    return `${baseName}-${parenthesesContent}形态`;
  }

  // 无效的括号内容（剧情事件、情绪等）
  const invalidKeywords = ['被', '后', '时', '中', ...EMOTION_KEYWORDS];
  const isInvalid = invalidKeywords.some(kw => parenthesesContent.includes(kw));

  if (isInvalid) {
    // 无效：丢弃整个形态
    return null;
  }

  // 不确定的情况，保留原名称
  return name;
}

/**
 * 计算两个字符串的相似度（简单版本，基于公共子串）
 * 返回 0-1 之间的值，1 表示完全相同
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  // 简单的公共子串比例
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  let matchCount = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      matchCount++;
    }
  }

  return matchCount / longer.length;
}

/**
 * 去重：移除描述几乎相同的形态
 */
function deduplicateForms(forms: CharacterForm[]): CharacterForm[] {
  const result: CharacterForm[] = [];

  for (const form of forms) {
    // 检查是否与已有形态重复
    const isDuplicate = result.some(existing => {
      const similarity = calculateSimilarity(
        existing.description || '',
        form.description || ''
      );
      return similarity > 0.8; // 相似度 > 80% 认为是重复
    });

    if (!isDuplicate) {
      result.push(form);
    }
  }

  return result;
}

/**
 * 🆕 形态清洗函数
 *
 * 在智能形态补全之后调用，统一清洗形态：
 * 1. 过滤一次性剧情瞬间
 * 2. 解析括号，丢弃无效形态
 * 3. 去重
 * （不限制数量：剧本有多少形态保留多少，由用户在 Phase 2 决定生成哪些）
 *
 * @param characterName 角色名称
 * @param forms 原始形态列表
 * @param role 角色定位（主角/配角/反派，保留参数兼容性，不再用于数量控制）
 * @param useAI 是否使用小模型进行智能判断（预留接口，暂未实现）
 * @returns 清洗后的形态列表
 */
export function refineCharacterForms(
  characterName: string,
  forms: CharacterForm[],
  role?: string,
  useAI: boolean = false
): CharacterForm[] {
  console.log(`[形态清洗] 开始清洗角色"${characterName}"的形态，原始数量: ${forms.length}`);

  let refined = [...forms];

  // 1. 过滤一次性剧情瞬间
  const beforeEventFilter = refined.length;
  refined = refined.filter(form => !isOneTimeEvent(form.name));
  const eventFiltered = beforeEventFilter - refined.length;
  if (eventFiltered > 0) {
    console.log(`[形态清洗] 🚫 过滤掉 ${eventFiltered} 个一次性剧情瞬间`);
  }

  // 2. 解析括号，丢弃无效形态
  const beforeParenthesesFilter = refined.length;
  refined = refined
    .map(form => {
      const parsedName = parseParenthesesInName(form.name);
      if (parsedName === null) {
        return null; // 无效形态，标记为删除
      }
      return {
        ...form,
        name: parsedName, // 更新名称
      };
    })
    .filter((form): form is CharacterForm => form !== null);
  const parenthesesFiltered = beforeParenthesesFilter - refined.length;
  if (parenthesesFiltered > 0) {
    console.log(`[形态清洗] 🚫 过滤掉 ${parenthesesFiltered} 个括号内容无效的形态`);
  }

  // 3. 去重
  const beforeDedup = refined.length;
  refined = deduplicateForms(refined);
  const deduplicated = beforeDedup - refined.length;
  if (deduplicated > 0) {
    console.log(`[形态清洗] 🚫 去重，移除 ${deduplicated} 个重复形态`);
  }

  console.log(`[形态清洗] ✅ 清洗完成，最终数量: ${refined.length}（不设上限，由用户在 Phase 2 决定生成哪些）`);

  // 🔮 预留小模型接口
  if (useAI) {
    console.log(`[形态清洗] 🤖 小模型智能判断功能暂未实现，跳过`);
    // TODO: 调用小模型进行更智能的判断
    // 例如：判断形态是否真的有必要、是否符合角色定位等
  }

  return refined;
}

// ============================================================================
// 🆕 Phase 1 轻量扫描：提取形态清单（只取元数据，不生成完整描述）
// ============================================================================

/**
 * 构建"形态摘要提取"Prompt
 * 要求 LLM 只识别外观发生明显变化的形态，每个形态只输出元数据（不要详细描述）。
 *
 * @param characterName 角色名称
 * @param characterAppearance 角色常态外貌简述（可选，帮助 LLM 区分"变化"与"常态"）
 * @param scriptContent 剧本内容
 * @param timelinePhases 🆕 Stage 1 提取的时间线阶段数据（可选，有则注入以辅助预标注）
 */
function buildFormSummaryExtractionPrompt(
  characterName: string,
  characterAppearance: string,
  scriptContent: string,
  timelinePhases?: TimelinePhase[]
): string {
  const appearanceHint = characterAppearance
    ? `\n角色常态外貌简述：${characterAppearance.slice(0, 200)}`
    : '';

  // 🆕 时间线阶段注入（若有多时间线，提供结构化表格辅助 LLM 预标注）
  const timelineHint = (timelinePhases && timelinePhases.length > 0)
    ? `\n## 角色时间线阶段（请在识别形态时参考此表）\n\n| 阶段标签 | 年龄 | 时代 | 处境 | 识别关键词 |\n|---------|------|------|------|----------|\n${timelinePhases.map(p => `| ${p.label} | ${p.estimatedAge}岁 | ${p.era} | ${p.identityState} | ${p.markers.join('、')} |`).join('\n')}\n\n⚠️ 识别每个形态时，请根据剧本原文和上表关键词判断该形态属于哪个时间线阶段，并估算该阶段的年龄。`
    : '';

  return `你是专业的影视剧形态分析师。请从以下剧本中，识别角色"${characterName}"在全剧中出现的**外观明显变化形态**。${appearanceHint}${timelineHint}

## 识别标准（只保留以下四类）

| 类型 | 关键词 | 示例 |
|------|--------|------|
| costume（换装） | 换衣服、穿上、着装、戎装、正式场合 | 战甲形态、晚礼服形态 |
| makeup（妆容） | 浓妆、淡妆、发型改变、染发、盘发 | 红唇浓妆形态、短发形态 |
| damage（战损） | 受伤、血迹、破损衣物、伤疤 | 战损形态、重伤形态 |
| transformation（变身） | 觉醒、变身、气质大变、体型变化、形象突变 | 黑化觉醒、神魔状态 |

## 排除以下内容（不要识别）
- 纯粹的情绪变化（愤怒、悲伤等，没有外观变化）
- 一次性剧情瞬间（被打一下、哭泣一场等，不属于持续形态）
- 与常态外观无明显区别的日常状态

## 输出格式

请只输出JSON，不要有其他文字：

\`\`\`json
{
  "forms": [
    {
      "name": "形态名称（4-8个字，简洁有力）",
      "changeType": "costume | makeup | damage | transformation 四选一",
      "episodeRange": "出现集数范围，如 Ep.12-15，如不确定填空字符串",
      "triggerEvent": "触发事件一句话描述（20字以内）",
      "sourceQuote": "剧本原文中最有代表性的一句话（50字以内）",
      "timelinePhase": "所属时间线阶段标签（如\"前世\"、\"重生后\"；单时间线填null）",
      "estimatedAge": 32
    }
  ]
}
\`\`\`

## 剧本内容

${scriptContent.slice(0, 60000)}
`;
}

/**
 * 从 LLM 响应中解析形态摘要列表
 * @param content LLM 返回的文本
 */
function parseFormSummariesFromResponse(content: string): FormSummary[] {
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      // 尝试直接解析（部分模型不加代码块）
      const directMatch = content.match(/\{[\s\S]*"forms"[\s\S]*\}/);
      if (!directMatch) {
        console.warn('[形态摘要] 未找到 JSON 块');
        return [];
      }
      return parseFormsArray(directMatch[0]);
    }
    return parseFormsArray(jsonMatch[1]);
  } catch (e) {
    console.error('[形态摘要] 解析失败:', e);
    return [];
  }
}

/**
 * 内部辅助：将原始 JSON 字符串解析为 FormSummary[]
 */
function parseFormsArray(jsonStr: string): FormSummary[] {
  const data = JSON.parse(repairJSONControlCharacters(jsonStr));
  if (!data.forms || !Array.isArray(data.forms)) {
    console.warn('[形态摘要] JSON 格式错误：缺少 forms 数组');
    return [];
  }

  const validChangeTypes = new Set<string>(['costume', 'makeup', 'damage', 'transformation']);

  return data.forms
    .filter((item: any) => {
      if (!item.name || !item.changeType) return false;
      if (!validChangeTypes.has(item.changeType)) {
        console.warn(`[形态摘要] 跳过无效 changeType: ${item.changeType}（形态: ${item.name}）`);
        return false;
      }
      return true;
    })
    .map((item: any, index: number): FormSummary => ({
      id: `form-summary-${Date.now()}-${index}`,
      name: String(item.name).trim(),
      changeType: item.changeType as FormSummary['changeType'],
      episodeRange: item.episodeRange ? String(item.episodeRange).trim() : undefined,
      triggerEvent: String(item.triggerEvent || '').trim(),
      sourceQuote: String(item.sourceQuote || '').trim().slice(0, 100),
      status: 'pending',
      // 🆕 时间线预标注字段（由 Stage 1 timelinePhases 驱动，Phase 3 直接使用）
      timelinePhase: item.timelinePhase && item.timelinePhase !== 'null' ? String(item.timelinePhase).trim() : undefined,
      estimatedAge: typeof item.estimatedAge === 'number' && item.estimatedAge > 0 ? item.estimatedAge : undefined,
    }));
}

/**
 * 【Phase 1 轻量扫描】从剧本中提取角色的形态清单（只含元数据，不含完整描述）
 *
 * 与 extractCharacterStates() 的区别：
 * - extractCharacterStates：生成带完整外貌描述的 CharacterForm[]（重量级，Token 消耗大）
 * - extractFormSummaries：只提取元数据（名称/类型/集数/触发事件/原文），速度快（Phase 1 用）
 *
 * 典型调用时机：Stage1-5 思维链结束后，自动轻量扫描一次；结果交由用户审查（Phase 2），
 * 用户选定后再按需触发 Phase 3 生成完整描述。
 *
 * @param character 角色信息（含 name、appearance 常态外貌）
 * @param scripts 剧本文件列表
 * @param model LLM 模型名称
 * @param timelinePhases 🆕 Stage 1 提取的时间线阶段数据（可选，有则注入以辅助预标注）
 * @returns FormSummary[] 形态摘要列表（status 均为 'pending'）
 */
export async function extractFormSummaries(
  character: CharacterRef,
  scripts: ScriptFile[],
  model: string = 'google/gemini-2.5-flash',
  timelinePhases?: TimelinePhase[]
): Promise<FormSummary[]> {
  console.log(`[形态摘要] 开始轻量扫描角色"${character.name}"的形态清单...`);
  if (timelinePhases && timelinePhases.length > 0) {
    console.log(`[形态摘要] 🆕 注入时间线阶段数据：${timelinePhases.map(p => p.label).join('、')}`);
  }

  const scriptContent = scripts
    .map(s => `【第${s.episodeNumber}集】\n${s.content}`)
    .join('\n\n');

  const prompt = buildFormSummaryExtractionPrompt(
    character.name,
    character.appearance || '',
    scriptContent,
    timelinePhases
  );

  const apiKey = (import.meta as any).env.VITE_OPENROUTER1_API_KEY;
  if (!apiKey) {
    throw new Error('未设置 OpenRouter API 密钥 (VITE_OPENROUTER1_API_KEY)');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

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
        temperature: 0.3,
        max_tokens: 4096,
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
      throw new Error(`无法解析 API 响应为 JSON\n响应内容: ${responseText.substring(0, 500)}\n错误: ${e}`);
    }

    const content = data.choices?.[0]?.message?.content || '';
    const summaries = parseFormSummariesFromResponse(content);

    console.log(`[形态摘要] ✅ 识别到 ${summaries.length} 个外观变化形态`);
    return summaries;

  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error(
        `❌ 形态摘要提取超时（60秒）\n角色：${character.name}\n模型：${model}\n\n建议：稍后重试或更换模型`
      );
    }
    throw error;
  }
}
