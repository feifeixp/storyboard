/**
 * 阶段4: 服装设计 - 快速模式
 * ⚡ 简化思维链,快速生成
 */

import type { Stage1ScriptAnalysis, Stage2VisualTags, Stage3AppearanceDesign, BeautyLevel } from './types';
import { getCostumeReference } from './getCostumeReference';
import materialVocabulary from './materialVocabulary.json';

export function buildStage4PromptFast(
  stage1: Stage1ScriptAnalysis,
  stage2: Stage2VisualTags,
  stage3: Stage3AppearanceDesign,
  beautyLevel: BeautyLevel = 'balanced'
): string {
  // 🆕 检查剧本中是否有服饰描述
  const scriptAppearance = stage1.scriptAppearanceDescription;
  const hasScriptCostume = scriptAppearance && (
    scriptAppearance.costumeDescription ||
    scriptAppearance.hairDescription ||
    scriptAppearance.makeupDescription ||
    scriptAppearance.otherDescription
  );

  // 🆕 动态加载参考资料（与Stage2/3使用相同的参考资料）
  const costumeReference = getCostumeReference({
    era: stage1.basicInfo.era,
    scene: stage1.sceneInfo?.mainScene,
    style: stage1.aestheticStyle?.style,
    season: stage1.seasonInfo?.season,
    gender: stage1.basicInfo.gender  // 🆕 传入性别信息
  });
  // 🆕 优化后的美型要求（保留核心引导，删除冗余）
  const beautyRequirements = beautyLevel === 'idealized' ? `
⚠️ **美型程度**: 理想美型（偶像剧/女频短剧标准）
- **核心**: 现代拍摄标准，款式符合时代，质感/剪裁使用现代标准
- **服装选择**:
  * 思考：根据角色性格、身份、社会阶层，什么服装最合适？
  * 90年代款式丰富：女装(连衣裙/碎花裙/西装套裙/衬衫等)，男装(西装/夹克/风衣/衬衫等)
  * ⚠️ 必须符合角色身份：
    - 底层/乡村 → 穷但精致：便宜但干净的布料，有记忆点的小细节（颜色/纹理/刺绣/搭配），不以"破旧/脏污/赤脚"作为日常基调
    - 都市/白领 → 时尚精致：款式更现代，剪裁与搭配更讲究
    - ⚠️ "破旧/脏污/赤脚"只用于战损或特殊剧情形态，不作为常规日常造型
  * 思考：是否有更好、更有特色的选择？
- **材质**: 90年代真实材质（纯棉/涤棉/牛仔/针织/雪纺/皮革等），符合角色身份
- **色彩**: ⚠️ 避免纯黑色（丢失细节）
  * 深色系(深灰/深蓝/藏青/墨绿/深棕/酒红)，浅色系(米白/浅粉/浅蓝/杏色/驼色)
  * 选择有色彩倾向的深色（深灰而非纯黑）
- **剪裁与设计感**: 精致合身，凸显身材优势，线条流畅优美，符合现代审美，注重款式设计、色彩搭配、配饰点缀等细节
- **鞋子**: 与整体协调，符合时代和身份
- **配饰**: 精致有品味（耳环/项链/手镯/腰带），⚠️ 不描述包等道具
- **特色**: 通过独特服装风格、配饰增加辨识度
  * 思考：设计是否有独特性？能否让观众一眼记住？
` : beautyLevel === 'balanced' ? `
⚠️ **美型程度**: 平衡美型
- 真实感与美感平衡，适度提升品质感
- 符合时代，略微优化剪裁、材质、色彩
` : `
⚠️ **美型程度**: 真实朴素
- 优先真实感，符合时代和社会阶层
`;

  // 🆕 提取剧本颜色锚点和服装类型锚点
  const colorAnchor = extractColorAnchor(scriptAppearance?.costumeDescription);
  const garmentAnchor = extractGarmentAnchor(scriptAppearance?.costumeDescription);

  // 🆕 优化后的剧本服饰描述部分
  const scriptCostumeSection = hasScriptCostume ? `
🚨 **核心原则：剧本描述优先**

### 剧本中的服饰描述
${scriptAppearance.costumeDescription ? `服饰: ${scriptAppearance.costumeDescription}` : ''}
${scriptAppearance.hairDescription ? `发型: ${scriptAppearance.hairDescription}` : ''}
${scriptAppearance.makeupDescription ? `妆容: ${scriptAppearance.makeupDescription}` : ''}
${scriptAppearance.otherDescription ? `其他: ${scriptAppearance.otherDescription}` : ''}

⚠️ **颜色锚点**（仅约束【外层】主袍/外罩）：
${colorAnchor}

💡 **层次配色原则**（避免全同色系）：
- 颜色锚点**仅约束【外层】主袍/外罩**，其他层必须形成层次
- 【内层】必须使用中性色或对比色，禁止与外层同色系
- 【鞋靴】优先使用中性色（黑/棕/灰/银），形成视觉层次
- 目标：让角色有层次感，避免"全绿套装"、"全紫套装"等单调配色

⚠️ **服装类型锚点**（优先级最高：保持类型一致）：
${garmentAnchor}

⚠️ **关于剧情态的处理**：
- 如果剧本中角色首次出现时处于受伤/狼狈/战损状态，请思考：这些是「剧情态」还是「角色常态」？
- 受伤/战损/疲惫等应视为「后续状态变化」的线索，不应写入基底
- 基底应描述角色的「日常完好状态」，确保可复用于多个场景

---
` : '';

  // 🆕 优化后的文化适配提醒（保留核心引导，压缩冗余）
  const culturalGuidance = `
🚨 **核心原则：服饰必须符合时代背景和文化习俗**

**时代**: ${stage1.basicInfo.era} | **性别**: ${stage1.basicInfo.gender} | **场景**: ${stage1.sceneInfo?.mainScene || '未知'}

⚠️ **关键判断**：

1. **服装类型**：连体（长袍/道袍/连衣裙）还是分体（上衣+裤装/裙装）？
   - 连体服装 → bottom 字段填："无需单独下装（连衣裙/长袍）"
   - 分体服装 → bottom 字段**必须**填写具体下装款式+材质描述（≥50字），禁止留空或填占位符

2. **时代风格**：
   * **玄幻修仙**：
     - 修仙者：法袍/道袍，精致棉麻/丝绸，云纹/仙鹤/祥云，飘逸仙气
     - 平民：对襟短褂/粗布衣，粗布/麻布，朴素平凡
     - ❌ 不混淆"玄幻修仙"和"民国"风格
   * **古代**：襦裙/对襟/马面裙，粗布/麻布/精致棉布，刺绣/暗纹，朴素传统
   * **民国**：旗袍/短褂/长衫，丝绸/棉布/呢料，简洁质感

3. **材质状态**：
   - 思考：角色的日常完好状态应该是什么材质？

4. **颜色选择**（专业判断）：
   - **剧本明确指定颜色时**：
     * 只约束剧本明确指定的服装层（如"碧绿大袍"只约束【外层】主袍）
     * 该层保持色相/色系一致；允许在同一色系内做深浅/饱和度/质感优化
     * **其他层（内层、中层等）可根据角色气质自由选择颜色，不受锚点约束**
   - **剧本未指定颜色时**：根据角色性格、身份、气质综合判断
   - **气质倾向建议**：
     * 魔教/魔头/危险/阴冷/压迫感 → 建议暗色系、低饱和、低明度、厚重材质（如墨绿、暗红、玄色、深灰）
     * 正道/仙气/清雅/温和 → 建议明亮色系、高明度、轻盈材质（如云白、霜蓝、月白）
     * 但不硬编码禁止任何颜色，关键是"如何设计得精致、有品质、符合角色"
   - **多样性原则**：避免所有层都使用同一色系，应有主次对比和层次感

5. **性别适配**：
   - 古代男性：长袍/道袍/宽松长裤/布带/玉带
   - 古代女性：襦裙/长裙/宽松长裤
   - 修仙特色：储物袋/玉简/发冠/玉佩
   - ❌ 避免现代元素：修身长裤/皮革腰带/西装领

⚠️ **关键**：根据时代背景、文化习俗、角色状态合理判断！
`;

  return `# 阶段4: 服装设计 (快速模式)

你是一位资深服装造型师,请基于前三个阶段的分析,快速设计角色的服装搭配。

🚨 **本阶段产出是「常规完好基底」**
- 用于后续所有状态的一致性参考
- 描述角色的「日常完好状态」，确保可复用于多个场景
- 不要包含剧情态（受伤/战损/疲惫等）

${scriptCostumeSection}

${costumeReference}

${culturalGuidance}

---

## 输入信息

### 基本信息
- 时代背景: ${stage1.basicInfo.era}
- 性别: ${stage1.basicInfo.gender}
- 社会阶层: ${stage1.characterPosition.socialClass}
- 性格特质: ${stage1.behaviorAnalysis.personalityTraits.join('、')}

### 外貌特征 (来自阶段3)
${stage3.finalDescription.facialFeatures}
${beautyRequirements}
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

## 任务要求

设计具体的服装搭配:
1. **上装**: 类型、材质结构(≥2)、光泽纹理(≥1)、工艺细节(≥1)、颜色
2. **下装**: 类型、材质结构(≥2)、光泽纹理(≥1)、颜色
3. **配饰**: 配饰类型、材质、颜色(可选)

⚠️ **设计原则**:
${hasScriptCostume ? '- **优先遵循剧本中的服饰描述**,在此基础上优化细节' : ''}
- 符合时代背景和社会阶层
- 符合该时代的文化习俗和性别特征
- 与外貌特征协调
- 体现角色性格特质
- 具有视觉吸引力

⚠️ **描述要求**:
1. ✅ **确定性**: 明确具体,不用"或"
2. ✅ **静态视觉**: 只描述静态特征
3. ✅ **可视化**: 摄影师能直接呈现

---

## 输出格式

⚠️ **重要**: 请先思考,再输出JSON

直接输出JSON:

\`\`\`json
{
	  "thinking": {
	    "uniqueness": "这个服装设计与历史记录的区别: ...(20-30字)",
	    "appropriateness": "服装是否符合角色身份和时代: ...(10-20字)",
	    "layerCheck": "分层检查: 内层[材质+剪裁+色彩+细节+新旧], 中层[...], 外层[...], 鞋靴[...], 挂件[...]; 额外检查: 是否在 bottom 字段以及【中层】/【外层】中清晰描述下装（裤子/裙子/连衣裙之一），如未描述请补充"
	  },
  "top": "上装的具体描述(50-60字, ⚠️ 必须包含: 材质结构≥2 + 光泽纹理≥1 + 工艺细节≥1)",
  "bottom": "下装的具体描述(50-60字, ⚠️ 必须包含: 材质结构≥2 + 光泽纹理≥1)",
  "headwear": "头饰描述(发冠/发簪/头纱等, 10-20字, 可选)",
  "jewelry": "首饰描述(耳环/项链/手镯/玉佩等, 10-20字, 可选)",
  "props": "",
  "finalDescription": "【内层】具体描述(材质纹理+剪裁版型+色彩花纹+工艺细节+新旧程度, 40-60字)；【中层】具体描述(同上维度, 40-60字)；【外层】具体描述(同上维度, 40-60字, 可选)；【鞋靴】具体描述(材质+款式+颜色+细节, 20-30字)；【腰带与挂件】具体描述(材质+款式+装饰, 20-30字, 可选)；【头饰】具体描述(发冠/发簪等, 10-20字, 可选)；【首饰】具体描述(耳环/玉佩等, 10-20字, 可选)"
}
\`\`\`

⚠️ **thinking字段说明**:
- uniqueness: 说明这个服装设计与历史记录中的角色有什么明显区别
- appropriateness: 说明服装是否符合角色的身份、性格和时代背景
- layerCheck: 自我检查每一层的6维度描述是否完整（列出使用的关键词）

⚠️ **bottom 字段强制要求（输出前自检）**：
- 分体服装（上衣+裤/裙）：bottom 字段必须填写具体的下装款式+材质描述，字数 ≥50 字
- 连体服装（长袍/道袍/连衣裙）：bottom 字段填"无需单独下装（连衣裙/长袍）"
- ❌ 禁止：bottom 字段留空、填占位符原文（如"下装的具体描述"）、仅填"无"或一两字

⚠️ **finalDescription 分层结构要求**（与详细模式相同）：
1. **【内层】**（必须）：贴身衣物，6维度描述，40-60字
2. **【中层】**（必须）：主体服装，6维度描述，40-60字
3. **【外层】**（可选）：外罩，6维度描述，40-60字
4. **【鞋靴】**（必须）：材质+款式+颜色+细节，20-30字
5. **【腰带与挂件】**（可选）：材质+款式+装饰，20-30字
6. **【头饰】**（可选）：发冠/发簪/头纱等，10-20字
7. **【首饰】**（可选）：耳环/项链/手镯/玉佩等，10-20字

⚠️ **重要说明**：
- **headwear 字段**：只包含头饰（发冠/发簪/头纱等）
- **jewelry 字段**：只包含首饰（耳环/项链/手镯/玉佩等）
- **props 字段**：必须为空字符串""，随身道具（武器/法宝/包等）将在后续场景/道具阶段提取
- ⚠️ 严禁在 headwear/jewelry 中描述武器、法宝、包等道具

⚠️ **最终输出要求（强制）**:
- **top/bottom/accessories/finalDescription 只能使用中文术语**（词库括号内的中文）
- **不要在最终描述中包含英文材质词**（如 satin weave, medium weight, soft sheen 等）
- **只使用中文**：缎纹、中等厚度、柔光、平绣等

⚠️ **JSON格式要求**:
- 必须是合法的JSON格式
- 最后一个字段后面**不要加逗号**
- 所有字段名和字符串值必须用双引号

⚠️ **内容要求**:
- top/bottom 字段：保持原有要求（材质结构≥2 + 光泽纹理≥1 + 工艺细节≥1）
- **finalDescription 字段**：必须采用分层结构（内/中/外层+鞋靴+挂件+头饰+首饰），总字数180-280字
- **不要描述发型、面容、身材等非服装元素**
- **headwear/jewelry 字段**：只描述头饰和首饰，不描述道具
- **props 字段**：必须为空字符串""（武器/法宝/包等将在后续场景/道具阶段提取）
- **每一层都必须包含6维度描述**（材质纹理 + 剪裁版型 + 色彩花纹 + 工艺细节 + 新旧程度 + 与外貌气质的统一性）

请开始!`;
}

/**
 * 🆕 提取剧本颜色锚点
 * 如果剧本明确指定颜色（如"碧绿大袍"），返回颜色系约束
 */
function extractColorAnchor(costumeDesc?: string): string {
  if (!costumeDesc) return '无明确颜色锚点，可根据角色气质自由选择';

  const colorMap: Record<string, { family: string; suggestions: string }> = {
    '碧绿': { family: '绿色系', suggestions: '碧绿/墨绿/深绿/暗绿' },
    '翡翠绿': { family: '绿色系', suggestions: '翡翠绿/碧绿/墨绿/深绿' },
    '墨绿': { family: '绿色系', suggestions: '墨绿/深绿/暗绿' },
    '深绿': { family: '绿色系', suggestions: '深绿/墨绿/暗绿' },
    '暗绿': { family: '绿色系', suggestions: '暗绿/墨绿/深绿' },
    '紫色': { family: '紫色系', suggestions: '紫色/淡紫/深紫/紫罗兰' },
    '淡紫': { family: '紫色系', suggestions: '淡紫/浅紫/薰衣草紫' },
    '深紫': { family: '紫色系', suggestions: '深紫/暗紫/紫罗兰' },
    '蓝色': { family: '蓝色系', suggestions: '蓝色/霜蓝/深蓝/藏青' },
    '霜蓝': { family: '蓝色系', suggestions: '霜蓝/浅蓝/天蓝' },
    '深蓝': { family: '蓝色系', suggestions: '深蓝/藏青/靛蓝' },
    '白色': { family: '白色系', suggestions: '白色/月白/云白/米白' },
    '月白': { family: '白色系', suggestions: '月白/云白/米白' },
    '黑色': { family: '黑色系', suggestions: '黑色/玄色/墨色/深灰' },
    '玄色': { family: '黑色系', suggestions: '玄色/墨色/深灰' },
    '墨色': { family: '黑色系', suggestions: '墨色/玄色/深灰' },
    '红色': { family: '红色系', suggestions: '红色/暗红/朱红/绯红' },
    '暗红': { family: '红色系', suggestions: '暗红/深红/酒红' }
  };

  for (const [keyword, { family, suggestions }] of Object.entries(colorMap)) {
    if (costumeDesc.includes(keyword)) {
      return `剧本指定"${keyword}"，**仅约束【外层】主袍/外罩**必须保持${family}（${suggestions}）；允许在同一色系内做深浅/饱和度/质感优化以贴合角色气质（如魔教/魔头偏暗化、去饱和），但不得跨色系改色。

⚠️ **强制要求**：
- 【内层】：必须使用中性色或对比色（如白色/米白/浅灰/淡黄），禁止使用${family}
- 【中层】（如果有）：可使用中性色或与外层形成层次的颜色，避免全同色系
- 【鞋靴】：优先使用中性色（黑色/棕色/深灰/银色），形成视觉层次

💡 **参考配色组合**（避免全同色系）：
- 外层${family} + 内层白色/米白 + 鞋靴黑色
- 外层${family} + 内层浅灰 + 鞋靴深棕
- 外层${family} + 内层淡黄 + 鞋靴银色`;
    }
  }

  return '无明确颜色锚点，可根据角色气质自由选择（建议：魔教/魔头偏暗色系，正道/仙气偏明亮色系）。注意：内层/中层/外层/鞋靴应形成层次，避免全同色系。';
}

/**
 * 🆕 提取剧本服装类型锚点
 * 如果剧本明确指定服装类型（如"大袍"），返回类型约束
 */
function extractGarmentAnchor(costumeDesc?: string): string {
  if (!costumeDesc) return '无明确服装类型锚点，可根据角色身份、时代背景自由选择';

  const garmentKeywords = ['大袍', '长袍', '道袍', '法袍', '短褂', '襦裙', '旗袍', '对襟', '长衫', '马褂', '斗篷'];

  for (const keyword of garmentKeywords) {
    if (costumeDesc.includes(keyword)) {
      return `剧本指定"${keyword}"，主袍层必须保持${keyword}类型；允许优化材质、细节、配色，但不得改变服装类型`;
    }
  }

  return '无明确服装类型锚点，可根据角色身份、时代背景自由选择';
}

