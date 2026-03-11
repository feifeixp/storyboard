# AI 提示词与分析方法全流程提炼 (Visionary Storyboard Studio)

本文档提炼了系统中从原始剧本到最终输出 Seedance 2.0 视频生成提示词的完整 AI 工作流，包含了核心的提示词结构和数据分析方法，并附带了系统中实际使用的提示词模板与核心代码。

---

## 1. 角色设计 (Character Design)
- **系统层定位**: `prompts/extractCharactersPrompt.ts`
- **核心任务**: 从剧本中识别所有角色，并推断生成专属的 AI 绘画外观描述，用于跨镜头维持角色一致性。
- **分析方法与规则**:
  1. **信息提取**: 识别所有有台词或有动作描述的核心角色（忽略群演等无具体设定的个体），并自动推断性别。
  2. **可视化强制翻译**: 将抽象描述转化为**纯可视化的外观设计指令**。长度至少 50 字。
  3. **负面约束**: 绝对禁止掺杂动作/剧情段落，只描述静态立绘所需的硬层视觉信息。

### 实际使用的提示词模板
```typescript
# 任务：从剧本中提取角色，并生成AI生图用的外观描述

## 剧本内容
\`\`\`
${script}
\`\`\`

## 提取要求
1. 识别所有有台词或有动作描述的主要角色（不含群众演员如"高手们"）
2. 根据名字推断性别（名字偏中性则标"未知"）
3. **为每个角色创作详细的视觉外观描述**（用于AI生图保持一致性）

## 外观描述要求（重要！）
外观描述必须是**可视化的设计说明**，包含以下要素：
- **发型发色**：如"浅棕色碎短发、蓬松有层次感"
- **面部特征**：如"深棕色狭长眼眸、五官清爽利落、表情平静带清冷感"
- **身形体态**：如"身形高挑纤瘦、肤色白皙、少年感体态"
- **服饰造型**：如"纯白色圆领宽松T恤、黑色修身长裤、黑白拼色运动鞋"
- **整体气质**：如"日系动漫风格、清瘦修长、简约干净气质"

❌ 错误示例："少年，声音沙哑，双手合十"（这是动作描述，不是外观）
✅ 正确示例："浅棕色碎短发少年，深棕色狭长眼眸，五官清爽利落，身形高挑纤瘦，穿白色圆领T恤和黑色长裤，简约干净气质"

## 输出格式
直接输出JSON数组：
[
  {"name": "晋安", "gender": "男", "appearance": "浅棕色碎短发、蓬松有层次感，深棕色狭长眼眸、五官清爽利落，身形高挑纤瘦、穿纯白色宽松T恤、黑色修身长裤，简约干净气质"},
  {"name": "林溪", "gender": "女", "appearance": "黑色长直发、发丝柔顺，大眼睛、五官精致可爱，身材娇小纤细，穿浅色连衣裙，温柔甜美气质少女"}
]
```

---

## 2. 剧本优化与清洗 (Script Optimization & Cleaning)
- **系统层定位**: `prompts/cleanScriptPrompt.ts`
- **核心任务**: 以电影分镜师的视角，剥离文本中的无效信息，将剧情结构化为视觉与听觉层。
- **分析方法与规则**:
  1. **信息归类与清洗**: 角色动作与场景提取为“纯画面内容”。对白单独提取，字幕/UI提取为 \`uiElements\`。
  2. **情绪降维**: 物理的声音/BGM（如"低沉音乐"），须提炼为**情绪标签**（如“恐惧”）。
  3. **评估剧情权重**: High(3-5镜), Medium(2-3镜), Low(1-2镜)。

### 实际使用的提示词模板
```typescript
# 任务：剧本清洗与预处理

你是一位资深电影分镜师，需要对剧本进行"清洗"，分离画面内容和非画面信息。

## 原始剧本
\`\`\`
${script}
\`\`\`

## 清洗规则

### 1. 信息分类
| 类型 | 处理方式 | 举例 |
|-----|---------|------|
| 角色动作 | ✅ 提取为画面内容 | "晋安双手合十" |
| 场景描述 | ✅ 提取为画面内容 | "波纹扩散" |
| 对白 | ✅ 单独提取 | "抓到你了……" |
| 字幕/UI | ✅ 提取为画内元素 | "[警告：核心温度 300%]" |
| **音效** | ⚠️ 提取为情绪标签 | "音效：滋滋声" → 情绪：紧张 |
| **BGM** | ⚠️ 提取为情绪标签 | "BGM：紧张音" → 情绪：恐惧 |
| **时间码** | ❌ 记录后忽略 | "(8–18s)" |
| **镜头建议** | ⚠️ 记录为参考 | "镜头：中景→特写" |

### 2. 提取设定约束
识别剧本中的规则/设定，这些在后续分镜中必须遵守：
- 如"无物理杀伤力" → 禁止画物体破碎/爆炸
- 如"虚拟空间" → 可以有数字化视觉效果

### 3. 评估剧情权重
分析每个场景的重要性，用于指导镜头分配：
- high: 核心事件/高潮/转折 → 建议3-5个镜头
- medium: 重要情节 → 建议2-3个镜头
- low: 铺垫/过渡 → 建议1-2个镜头

## 输出格式 (严格输出JSON)
{
  "cleanedScenes": [
    {
      "id": "01",
      "originalText": "原始文本...",
      "visualContent": "画面内容：晋安双手合十",
      "dialogues": ["晋安：抓到你了……"],
      "uiElements": ["[警告：核心温度 300%]"],
      "moodTags": ["紧张", "科技恐惧"]
    }
  ],
  "audioEffects": ["滋滋声"],
  "sceneWeights": [
    { "sceneId": "01", "weight": "medium", "suggestedShots": 2, "reason": "开场铺垫" }
  ]
}
```

---

## 3. 提示词提取与分镜设计 (Prompt Extraction & Shot Design)
- **系统层定位**: `prompts/extractImagePromptsPrompt.ts` & `prompts/chain-of-thought/stage4-shot-design.ts`
- **核心任务**: 将分镜指令翻译为大模型（Gemini / SD / Kling 等）完全兼容的生图模板。
- **分析方法与规则**:
  1. **大模型生图公式**: `[主体描述] + [环境/背景] + [动作/状态] + [技术参数(景别/角度/光影)]`
  2. **双重术语转换**: 禁止使用分镜简写（如 CU, LS）和元术语（如"镜头边缘"），必须换算成底层 AI 易懂的摄影名词。
  3. **情绪驱动相机机位**: 机位依附于清洗阶段获得的 Mood Tags。
  4. **三大空间景深定律 (FG / MG / BG)**:
     - 必须明确【前景】、【中景主体】、【背景】。绝对不能提到“边框（frame/edge）”或使用方括号 `[前景: xxx]`。必须用自然语言：“浅景深，画面底部有虚化的残片入画”。

### 实际使用的格式规范与模板
```typescript
## Nano Banana Pro 提示词公式（官方手册）
**[主体描述] + [环境/背景] + [动作/状态] + [技术参数(景别/角度/光影)]**

🚨 中文提示词必须使用摄影术语，不使用分镜术语！
| 分镜术语 | 中文摄影术语 |
|---------|------------|
| 特写(CU) | 特写拍摄 / 近距离拍摄 |
| 大远景(ELS) | 广角镜头拍摄 / 远景拉开 |
| 中景(MS) | 中景拍摄 |

🚨 前景描述规则（重要！避免AI误解）
❌ 禁止写法："[前景: 模糊的破碎衣袖边框]"
✅ 正确写法："浅景深，画面底部有虚化的破碎衣袖边缘入画" 或 "镜头前方近距离有失焦的手掌边缘"

### 静态镜头生图示例（平视，微动呼吸感）
{
  "shotNumber": "05",
  "imagePromptCn": "中景，平视，3/4正面。林溪站在画面中央，单手持剑置于身侧，表情警惕地望向画面右侧。背景是废弃工厂的锈蚀钢梁，前景有模糊的碎片。侧光从左侧打来，形成半明半暗的立体感。",
  "endImagePromptCn": "",
  "videoGenPrompt": "从首帧到尾帧，镜头固定，林溪保持静止站姿仅有轻微呼吸起伏，胸口微微起伏，眼神缓慢从左向右扫视，侧光微妙变化，缓慢节奏，3秒。"
}

### 特写前景虚化示例
{
  "shotNumber": "20",
  "imagePromptCn": "特写，平视，正面。浅景深效果：画面底部边缘可见失焦的破碎衣袖残片入画，虚化模糊。中景主体：晋安双手合十于胸前，鲜血从指缝渗出。后景是深暗的玄青色虚空。强戏剧性高对比光影。",
  ...
}

### stage4-shot-design.ts 中严格的 JSON 约束生成规则
aiPrompt.visual: "A {景别} of {主体}, captured {角度-高度}, {角度-朝向}. Shallow DOF with {前景元素} out of focus in foreground. Midground: {角色/主体描述}. Background: {后景元素}. {光影描述}."
```

---

## 4. 输出最终 Seedance 2.0 视频提示词 (Final Seedance 2.0 Output)
- **系统层定位**: `src/utils/videoGrouping.ts` -> `generateVideoGroupPrompt`
- **核心任务**: 将离散的图文分镜打组（每组 ≤ 15秒），合成最终能直接送到 Seedance 2.0 视频模型的连续性长提示词。
- **分析方法与规则**:
  1. **时间轴轨道铺设 (Timeline Scripting)**: 循环遍历组内的所有镜头，翻译为由时间节点构成的动作序列（0-N秒画面... N-M秒画面...）。
  2. **动态转场推演 (Infer Transitions)**: 引擎通过判断前后两帧的景别和场景差，自动预判并植入平滑转场词句（无缝渐变转场 / 快速推进特写 / 切镜等）。

### 实际使用的工作流代码结构 (videoGrouping.ts)
```typescript
/**
 * 生成符合 Seedance 2.0 规范的视频提示词
 * 公式：[素材@定义] + [整体风格与画质基调] + [0-N秒：镜头+动作+台词] + [转场] + [N-M秒：…]
 */
export function generateVideoGroupPrompt(group: VideoGroup, style?: string): VideoGroupPrompt {
  const sections: string[] = [];

  // 1. 素材@定义
  const firstShot = group.shots[0]?.shot;
  if (firstShot?.storyboardGridUrl) {
    sections.push('以@图片1作为分镜参考，');
  }

  // 2. 整体风格与画质基调
  const styleElements: string[] = [];
  if (style) styleElements.push(style);
  if (firstShot?.lighting) styleElements.push(firstShot.lighting);
  styleElements.push('保持画面风格统一');
  sections.push(styleElements.join('，') + '。');

  // 3. 时间轴分段脚本
  for (let i = 0; i < group.shots.length; i++) {
    const shot = group.shots[i].shot;
    const startSec = Math.floor(group.shots[i].startSecond);
    const endSec = Math.floor(group.shots[i].endSecond);

    let line = \`\\n\${startSec}-\${endSec}秒画面：\`;
    
    // a. 运镜与角度
    if (shot.cameraMove && shot.cameraMove !== '固定(Static)') {
      line += \`\${CAMERA_MOVE_MAP[shot.cameraMove]}，\`;
    }
    // b. 主体动作
    if (shot.storyBeat) line += \`\${shot.storyBeat}。\`;
    // c. 台词（音画同步）
    if (shot.dialogue) line += \`说话"\${shot.dialogue}"。\`;
    // e. 视频提示词
    if (shot.videoPromptCn) line += \`\${shot.videoPromptCn}\`;

    sections.push(line);

    // f. 智能推演转场
    if (i < group.shots.length - 1) {
      const nextShot = group.shots[i + 1].shot;
      const transition = inferTransition(shot, nextShot); //推演: "切镜" / "急速拉远" / "渐变转场"
      sections.push(transition);
    }
  }

  // 4. 运镜总体结语
  const allStatic = group.shots.every(s => s.shot.cameraMove === '固定(Static)');
  sections.push(\`\\n\\n全程\${group.totalDuration.toFixed(0)}秒，\${allStatic ? '多镜头切换' : '保持运动流畅'}\`);
  
  return { ...组装返回结果... };
}
```
