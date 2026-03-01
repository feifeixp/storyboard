/**
 * 阶段4: 服装设计 - 优化版
 * 🆕 融合快速模式的优秀设计 + 保留思维链核心结构
 */

import type { Stage1ScriptAnalysis, Stage2VisualTags, Stage3AppearanceDesign, BeautyLevel } from './types';
import { getCharacterHistory, formatHistoryForPrompt } from './historyManager';
import { getCostumeReference } from './getCostumeReference';
import materialVocabulary from './materialVocabulary.json';

export function buildStage4Prompt(
  stage1: Stage1ScriptAnalysis,
  stage2: Stage2VisualTags,
  stage3: Stage3AppearanceDesign,
  beautyLevel: BeautyLevel = 'balanced'
): string {

  const history = getCharacterHistory();
  const historyPrompt = formatHistoryForPrompt(history, 3);

  // 🆕 检查剧本中是否有服饰描述（来自快速模式）
  const scriptAppearance = stage1.scriptAppearanceDescription;
  const hasScriptCostume = scriptAppearance && (
    scriptAppearance.costumeDescription ||
    scriptAppearance.hairDescription ||
    scriptAppearance.makeupDescription ||
    scriptAppearance.otherDescription
  );

  // 🆕 动态加载参考资料（来自快速模式）
  const costumeReference = getCostumeReference({
    era: stage1.basicInfo.era,
    scene: stage1.sceneInfo?.mainScene,
    style: stage1.aestheticStyle?.style,
    season: stage1.seasonInfo?.season,
    gender: stage1.basicInfo.gender
  });

  // 🆕 剧本服饰描述部分（来自快速模式）
  const scriptCostumeSection = hasScriptCostume ? `
🚨 **核心原则：剧本描述优先**

### 剧本中的服饰描述
${scriptAppearance.costumeDescription ? `服饰: ${scriptAppearance.costumeDescription}` : ''}
${scriptAppearance.hairDescription ? `发型: ${scriptAppearance.hairDescription}` : ''}
${scriptAppearance.makeupDescription ? `妆容: ${scriptAppearance.makeupDescription}` : ''}
${scriptAppearance.otherDescription ? `其他: ${scriptAppearance.otherDescription}` : ''}

⚠️ **关于剧情态的处理**：
- 如果剧本中角色首次出现时处于受伤/狼狈/战损状态，请思考：这些是「剧情态」还是「角色常态」？
- 受伤/战损/疲惫等应视为「后续状态变化」的线索，不应写入基底
- 基底应描述角色的「日常完好状态」，确保可复用于多个场景

---
` : '';

  // 🆕 文化适配提醒（来自快速模式，压缩版）
  const culturalGuidance = `
🚨 **核心原则：服饰必须符合时代背景和文化习俗**

**时代**: ${stage1.basicInfo.era} | **性别**: ${stage1.basicInfo.gender} | **场景**: ${stage1.sceneInfo?.mainScene || '未知'}

⚠️ **关键判断**：
1. **服装类型**：连体（长袍/道袍/连衣裙）还是分体（上衣+裤装/裙装）？
   - 连体服装 → bottom 字段填："无需单独下装（连衣裙/长袍）"
   - 分体服装 → bottom 字段**必须**填写具体下装款式+材质描述（≥50字），禁止留空或填占位符
2. **时代风格**：
   * 玄幻修仙：法袍/道袍，精致棉麻/丝绸，云纹/仙鹤/祥云
   * 古代：襦裙/对襟/马面裙，粗布/麻布/精致棉布
   * 民国：旗袍/短褂/长衫，丝绸/棉布/呢料
3. **性别适配**：
   * 古代男性：长袍/道袍/宽松长裤/布带/玉带
   * 古代女性：襦裙/长裙/宽松长裤
   * ❌ 避免现代元素：修身长裤/皮革腰带/西装领
`;

  // 🆕 美型程度要求（来自快速模式，优化压缩）
  const beautyRequirements = beautyLevel === 'idealized' ? `
⚠️ **美型程度**: 理想美型（偶像剧/女频短剧标准）
- 核心：现代拍摄标准，款式符合时代，质感/剪裁使用现代标准
- 服装选择：根据角色性格、身份、社会阶层选择（90年代：连衣裙/碎花裙/西装/夹克等）
  * ⚠️ 必须符合角色身份：
    - 底层/乡村 → 穷但精致：便宜但干净的布料，有记忆点的小细节（颜色/纹理/刺绣/搭配），不以"破旧/脏污/赤脚"作为日常基调
    - 都市/白领 → 时尚精致：款式更现代，剪裁与搭配更讲究
    - ⚠️ "破旧/脏污/赤脚"只用于战损或特殊剧情形态，不作为常规日常造型
- 材质：90年代真实材质（纯棉/涤棉/牛仔/针织/雪纺/皮革等），符合角色身份
- 色彩：⚠️ 避免纯黑色（丢失细节），选择有色彩倾向的深色（深灰/深蓝/藏青/墨绿/深棕）
- 剪裁设计：精致合身，凸显身材优势，线条流畅优美
- 鞋子配饰：与整体协调，符合时代和身份，精致有品味
- 独特性：通过独特服装风格、配饰增加辨识度
` : beautyLevel === 'balanced' ? `
⚠️ **美型程度**: 平衡美型 - 真实感与美感平衡，适度提升品质感
` : `
⚠️ **美型程度**: 真实朴素 - 优先真实感，符合时代和社会阶层
`;

  return `# 阶段4: 服装设计

你是专业服装造型师，精通影视剧角色造型设计。

🚨 **本阶段产出是「常规完好基底」**
- 用于后续所有状态的一致性参考
- 描述角色的「日常完好状态」，确保可复用于多个场景
- 不要包含剧情态（受伤/战损/疲惫等）

${historyPrompt}

${scriptCostumeSection}

${costumeReference}

${culturalGuidance}

⚠️ **格式要求**：
1. 必须按【Step 4.X 执行中】格式输出
2. 每步必须有"思考过程"和"输出结果"
3. 不允许跳过任何步骤

---

## 输入信息

**角色基本信息**：${stage1.basicInfo.gender}、${stage1.basicInfo.ageGroup}、${stage1.characterPosition.role}、${stage1.characterPosition.socialClass}
**时代背景**：${stage1.basicInfo.era}
**性格特点**：${stage1.behaviorAnalysis.personalityTraits.join('、')}
**剧本类型**：${stage1.scriptType.category}（${stage1.scriptType.genre}）
**美学方向**：${stage1.scriptType.aestheticDirection}
${beautyRequirements}

**视觉标签**：
${stage2.visualTags.map(t => `- ${t.tag}：${t.description}`).join('\n')}

**外貌设计（必须参考）**：
- 发型：${stage3.appearanceDesign?.hairDesign || '未设计'}
- 眼睛：${stage3.appearanceDesign?.eyesDesign || '未设计'}
- 五官：${stage3.appearanceDesign?.facialDesign || '未设计'}
- 整体气质：${stage3.finalDescription?.facialFeatures || '未设计'}

⚠️ 服装设计必须与上述外貌特征协调统一！

---

## 📚 材质描述词汇参考库

⚠️ **核心要求**: 服装描述必须包含以下三类关键词（从词库中选择）:
1. **材质结构** (≥2个): 描述面料的编织方式、厚度、透明度
2. **光泽纹理** (≥1个): 描述面料的光泽类型和表面质感
3. **工艺细节** (≥1个): 描述刺绣、印花、装饰等工艺

### 1️⃣ 材质结构关键词 (必选≥2)
**编织方式**: ${materialVocabulary.categories.structure.weaveTypes.slice(0, 5).map(w => `${w.en}(${w.zh})`).join(', ')}
**厚度**: ${materialVocabulary.categories.structure.thickness.slice(0, 3).map(t => `${t.en}(${t.zh})`).join(', ')}
**透明度**: ${materialVocabulary.categories.structure.transparency.map(t => `${t.en}(${t.zh})`).join(', ')}

### 2️⃣ 光泽纹理关键词 (必选≥1)
**光泽类型**: ${materialVocabulary.categories.sheen.sheenTypes.slice(0, 5).map(s => `${s.en}(${s.zh})`).join(', ')}
**表面纹理**: ${materialVocabulary.categories.texture.surfaceTexture.slice(0, 5).map(t => `${t.en}(${t.zh})`).join(', ')}

### 3️⃣ 工艺细节关键词 (必选≥1)
**刺绣工艺**: ${materialVocabulary.categories.craftsmanship.embroidery.slice(0, 4).map(e => `${e.en}(${e.zh})`).join(', ')}
**装饰细节**: ${materialVocabulary.categories.craftsmanship.decorativeDetails.slice(0, 5).map(d => `${d.en}(${d.zh})`).join(', ')}

⚠️ **使用规则**:
- 必须从上述词库中选择，不要编造新词
- 优先选择符合时代背景和角色身份的词汇
- 避免使用过于泛化的描述（如"布料很好"）
- 确保材质描述与角色的社会阶层、经济条件相符

---

## 执行步骤

【Step 4.1 执行中】设计思考

思考过程（50-100字）：
- 基于角色性格、时代、历史记录，选择什么样的服装设计？
- 这个设计与历史记录中的角色有什么明显区别？
- 为什么这个设计适合这个角色？与Stage3外貌如何协调？

输出结果（文本格式）：
[你的设计思路，50-100字]

---

【Step 4.2 执行中】独特性检查 + 专业突破

思考过程（50字内）：
1. 独特特征1：[具体说明，为什么独特？]
2. 独特特征2：[具体说明，为什么独特？]
3. 记忆点：如果让观众一眼记住这个角色的造型，你会强调哪个特征？
4. 避免平庸：除了最常见的款式和颜色，是否有更有特色的选择？
5. 与历史记录对比：这个服装设计与历史记录中的角色有什么明显区别？
6. 身份适配：服装是否符合角色的身份、时代和经济条件？

输出结果（文本格式，不要输出JSON代码块）：
- 独特特征1：[具体文字说明]
- 独特特征2：[具体文字说明]
- 记忆点：[具体文字说明]
- 避免平庸：[具体文字说明]
- 与历史记录对比：[具体文字说明]
- 身份适配：[具体文字说明]

---

【Step 4.3 执行中】专业突破与高级设计

思考过程（50字内）：
- 思考：在不违背剧本类型和社会阶层约束的前提下，是否存在更有记忆点、更有设计感的服装方案？
- 思考：当前设计在哪些方面可能过于常见或平庸（版型、色彩、材质细节等），可以做出哪些专业提升？
- 思考：如何让这个造型在同类角色中脱颖而出，但又不过分喧宾夺主、抢走剧情焦点？

输出结果（要点列举）：
1. 专业突破方向：[简要描述 1–2 句]
2. 避免平庸的方法：[简要描述 1–2 句]

---

【Step 4.4 执行中】自我批判与质量复盘

思考过程（50字内）：
- 思考：这个设计是否真正符合角色的身份、时代和社会阶层？是否出现“底层穿出上层精英感”或“过度寒酸”的问题？
- 思考：整体是否精致、有品质？有哪些明显的设计风险或违和感？
- 思考：作为专业造型师，你认为还有哪 1–2 点可以进一步优化？

输出结果（要点列举）：
1. 潜在风险：[简要描述 1–2 句]
2. 优化建议：[简要描述 1–2 句]

---

【最终输出】

⚠️ **输出要求**：
- ✅ 确定性：明确具体，不用"或"
- ✅ 静态视觉：只描述静态特征
- ✅ 可视化：摄影师能直接呈现
- 必须输出具体的服装描述，不能是占位符
- **finalDescription必须采用分层结构（内/中/外层+鞋靴+挂件），总字数180-260字**
- 只包含服装和配饰，不包含发型、五官、身材
- 必须是完整的、可解析的JSON格式

\`\`\`json
{
	  "thinking": {
	    "uniqueness": "这个服装设计与历史记录的区别（20-30字）",
	    "appropriateness": "服装是否符合角色身份和时代（10-20字）",
	    "layerCheck": "分层检查: 内层[材质+剪裁+色彩+细节+新旧], 中层[...], 外层[...], 鞋靴[...], 挂件[...]; 额外检查: 是否在 bottom 字段以及【中层】/【外层】中清晰描述下装（裤子/裙子/连衣裙之一），如未描述请补充"
	  },
  "top": "具体的上装描述(50-60字, ⚠️ 必须包含: 材质结构≥2 + 光泽纹理≥1 + 工艺细节≥1)",
  "bottom": "具体的下装描述(50-60字, ⚠️ 必须包含: 材质结构≥2 + 光泽纹理≥1)",
	  "accessories": "具体的配饰描述(30-40字,可选)",
	  "finalDescription": "【内层】具体描述(材质纹理+剪裁版型+色彩花纹+工艺细节+新旧程度, 40-60字)；【中层】具体描述(同上维度, 40-60字)；【外层】具体描述(同上维度, 40-60字, 可选)；【鞋靴】具体描述(材质+款式+颜色+细节, 20-30字)；【腰带与挂件】具体描述(材质+款式+装饰, 20-30字, 可选)；【头饰】具体描述(如发饰/簪子/发带等, 20-30字, 可选)；【首饰】具体描述(如耳环/项链/手链/戒指等, 20-30字, 可选)",
  "costumeConfig": {
    "inner": {
      "material": "内层材质（如：棉布、亚麻，无内层可省略整个 inner 字段）",
      "cut": "剪裁（如：贴身、宽松）",
      "color": "颜色",
      "wornState": "新旧程度（如：全新、略旧、破损）"
    },
    "middle": {
      "material": "中层主要面料（必填）",
      "cut": "版型剪裁（必填）",
      "color": "颜色（必填）",
      "pattern": "花纹（如有，否则省略）",
      "details": "工艺细节（如刺绣、盘扣，否则省略）",
      "wornState": "新旧程度（必填）"
    },
    "outer": {
      "material": "外层面料（无外套可省略整个 outer 字段）",
      "cut": "剪裁",
      "color": "颜色",
      "wornState": "新旧程度"
    },
    "bottom": {
      "material": "下装面料（必填）",
      "cut": "款式版型（必填，如：宽腿裤、A字裙、连衣裙）",
      "color": "颜色（必填）",
      "pattern": "花纹（如有，否则省略）",
      "wornState": "新旧程度（必填）"
    },
    "shoes": {
      "material": "鞋靴材质（必填）",
      "cut": "款式（必填，如：布鞋、皮靴、草鞋）",
      "color": "颜色（必填）",
      "details": "细节（如有装饰，否则省略）"
    },
	    "accessories": {
	      "jewelry": "首饰描述（如有，否则省略该字段）",
	      "belt": "腰带描述（如有，否则省略该字段）",
	      "props": "随身道具占位字段，本阶段通常留空字符串；武器/法宝/包等统一在后续场景/道具链路中处理"
	    }
  }
}
\`\`\`

⚠️ **bottom 字段强制要求（输出前自检）**：
- 分体服装（上衣+裤/裙）：bottom 字段必须填写具体的下装款式+材质描述，字数 ≥50 字
- 连体服装（长袍/道袍/连衣裙）：bottom 字段填"无需单独下装（连衣裙/长袍）"
- ❌ 禁止：bottom 字段留空、填占位符原文（如"具体的下装描述"）、仅填"无"或一两字

⚠️ **finalDescription 分层结构要求**：
1. **【内层】**（必须）：贴身衣物，如内衬、衬衫、打底等
   - 6维度：材质纹理 + 剪裁版型 + 色彩花纹 + 工艺细节 + 新旧程度 + 与外貌气质的统一性
   - 字数：40-60字
2. **【中层】**（必须）：主体服装，如外衣、裙装、裤装等
   - 6维度：同上
   - 字数：40-60字
3. **【外层】**（可选）：外罩，如披风、外袍、大衣等（根据角色身份和场景判断是否需要）
   - 6维度：同上
   - 字数：40-60字
4. **【鞋靴】**（必须）：鞋子或靴子
   - 描述：材质 + 款式 + 颜色 + 细节
   - 字数：20-30字
5. **【腰带与挂件】**（可选）：腰带、玉佩、香囊等（根据角色身份判断）
   - 描述：材质 + 款式 + 装饰
   - 字数：20-30字
6. **【头饰】**（可选）：发饰、簪子、发带等
   - 描述：材质 + 款式 + 颜色 + 细节
   - 字数：20-30字
7. **【首饰】**（可选）：耳环、项链、手链、戒指等
   - 描述：材质 + 款式 + 颜色 + 细节
   - 字数：20-30字

⚠️ **专业判断原则**（不硬编码规则）：
- 不是所有角色都需要外层/挂件/道具，根据角色身份、社会阶层、剧本类型判断
- 每一层都要思考：为什么选择这个款式？为什么适合这个角色？
- 通过自我批判提升质量：这个设计是否精致、有品质、有独特性？

⚠️ **最终输出要求（强制）**:
- **top/bottom/accessories/finalDescription 只能使用中文术语**（词库括号内的中文）
- **不要在最终描述中包含英文材质词**（如 satin weave, medium weight, soft sheen 等）
- **只使用中文**：缎纹、中等厚度、柔光、平绣等

⚠️ **JSON格式要求**：
- 必须是合法的JSON格式
- 最后一个字段后面**不要加逗号**
- 所有字段名和字符串值必须用双引号

⚠️ **材质细节要求**：
- top/bottom 字段：保持原有要求（材质结构≥2 + 光泽纹理≥1 + 工艺细节≥1）
- **finalDescription 字段**：每一层都必须包含6维度描述（材质纹理 + 剪裁版型 + 色彩花纹 + 工艺细节 + 新旧程度 + 与外貌气质的统一性）
- thinking.layerCheck 必须列出每一层使用的具体关键词

请开始执行！`;
}


