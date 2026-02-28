/**
 * 阶段3: 外貌设计 - 快速模式
 * ⚡ 简化思维链,快速生成
 */

import type { Stage1ScriptAnalysis, Stage2VisualTags, BeautyLevel } from './types';
import { getAppearanceReference } from './getAppearanceReference';
import { getTemperamentGuideForStage3 } from './getTemperamentReference';

/**
 * 🆕 A2: 根据年龄/剧本类型/社会阶层/角色定位 动态推导头身比例
 * （快速模式与优化版保持同一逻辑，避免前后不一致）
 */
function deriveBodyProportions(stage1: Stage1ScriptAnalysis, beautyLevel: BeautyLevel): string {
	const age = stage1.basicInfo.specificAge;
	const ageGroup = stage1.basicInfo.ageGroup;
	const socialClass = stage1.characterPosition.socialClass;
	const scriptCategory = stage1.scriptType.category;
	const role = stage1.characterPosition.role;

	// 1. 按年龄/年龄段给出基础比例（不带美型加成）
	let baseRatio = 7.0; // 默认成年人中间值

	if (age) {
		if (age <= 12) baseRatio = 5.6; // 儿童：5–6 头身
		else if (age <= 17) baseRatio = 6.4; // 青少年：6–7 头身
		else if (age <= 60) baseRatio = 7.2; // 成年人：7–8 头身
		else baseRatio = 6.8; // 老年：6.5–7 头身
	} else {
		if (ageGroup === '儿童') baseRatio = 5.6;
		else if (ageGroup === '少年') baseRatio = 6.4;
		else if (ageGroup === '青年' || ageGroup === '中年') baseRatio = 7.2;
		else if (ageGroup === '老年') baseRatio = 6.8;
	}

	// 2. 根据美型程度做小幅偏移
	if (beautyLevel === 'idealized') {
		baseRatio += 0.3;
	} else if (beautyLevel === 'realistic') {
		baseRatio -= 0.3;
	}

	// 3. 根据社会阶层微调
	if (socialClass === '富裕') {
		baseRatio += 0.1;
	} else if (socialClass === '底层') {
		baseRatio -= 0.1;
	}

	// 4. 剧本类型：女频言情/偶像/甜宠 才有“偶像剧加成”
	const isIdolDrama =
			scriptCategory.includes('言情') ||
			scriptCategory.includes('偶像') ||
			scriptCategory.includes('甜宠') ||
			stage1.scriptType.genre.includes('女频');

	// 5. 角色定位约束
	if (baseRatio >= 6.2) {
		if (role === '主角') {
			const min = 7.0;
			const max = isIdolDrama && beautyLevel === 'idealized' ? 8.0 : 7.6;
			baseRatio = Math.max(min, Math.min(baseRatio, max));
		} else if (role === '反派') {
			const min = 6.6;
			const max = 7.2;
			baseRatio = Math.max(min, Math.min(baseRatio, max));
		} else {
			const min = 6.8;
			const max = 7.4;
			baseRatio = Math.max(min, Math.min(baseRatio, max));
		}
	}

	// 6. 安全夹紧
	baseRatio = Math.max(5.5, Math.min(baseRatio, 8.0));

	// 7. 生成描述
	if (baseRatio >= 7.8) return '8头身黄金比例';
	if (baseRatio >= 7.3) return '7.5头身标准比例';
	if (baseRatio >= 6.8) return '7头身标准比例';
	if (baseRatio >= 6.3) return '6.5头身青少年比例';
	if (baseRatio >= 5.8) return '6头身少年比例';
	return '5.5头身儿童比例';
}

export function buildStage3PromptFast(
  stage1: Stage1ScriptAnalysis,
  stage2: Stage2VisualTags,
  beautyLevel: BeautyLevel = 'balanced'
): string {
  // 🆕 检查剧本中是否有外貌描述
  const scriptAppearance = stage1.scriptAppearanceDescription;
  const hasScriptAppearance = scriptAppearance && (
    scriptAppearance.hairDescription ||
    scriptAppearance.makeupDescription ||
    scriptAppearance.otherDescription
  );

  // 🆕 动态加载外貌参考资料（外貌库，按时代/美型等级/性别三层合并）
  const appearanceReference = getAppearanceReference({
    era: stage1.basicInfo.era,
    beautyLevel: beautyLevel,
    gender: stage1.basicInfo.gender
  });

  // 🆕 改进的剧本外貌描述部分（保留思考引导）
  const scriptAppearanceSection = hasScriptAppearance ? `
🚨 **核心原则：剧本描述优先**

### 剧本中的外貌描述
${scriptAppearance.hairDescription ? `**发型**: ${scriptAppearance.hairDescription}` : ''}
${scriptAppearance.makeupDescription ? `**妆容**: ${scriptAppearance.makeupDescription}` : ''}
${scriptAppearance.otherDescription ? `**其他**: ${scriptAppearance.otherDescription}` : ''}

⚠️ **关于剧情态的处理**：
- 如果剧本中角色首次出现时处于受伤/狼狈/战损状态，请思考：这些是「剧情态」还是「角色常态」？
- 受伤/战损/疲惫等应视为「后续状态变化」的线索，不应写入基底
- 基底应描述角色的「日常完好状态」，确保可复用于多个场景

---
` : '';

  // 🆕 改进的影视化美化策略（保留思考引导）
  const cinematicBeautification = beautyLevel === 'realistic' ? `
⚠️ **美化策略**: 真实风格
- 无精致妆容，体现真实外貌状态
` : `
⚠️ **美化策略**: 平衡美感与剧情（影视美学标准）
- ✅ 可有精致妆容（底妆、眼线、睫毛）
- ❌ 避免过度狼狈（眼线模糊导致黑眼圈、青茬等丑化元素）
`;

  // 🆕 气质外貌引导（软匹配，提问式注入）
  const temperamentGuide = getTemperamentGuideForStage3(stage1);

  // 🆕 A2: 动态推导头身比例
  const bodyProportions = deriveBodyProportions(stage1, beautyLevel);

  // 🆕 根据美型程度注入不同的要求 (结构化框架,不硬编码具体内容)
  // 🆕 改进的压缩版本（保留核心引导，删除冗余重复）
  const beautyRequirements = beautyLevel === 'idealized' ? `
⚠️ **美型程度**: 理想美型（偶像剧/女频短剧标准）
- **核心原则**: 现代拍摄标准，款式符合时代，质感/妆容使用现代标准
- **五官**: 精致立体，现代审美，${bodyProportions}
- **妆容**: 精致现代妆容，注重眼妆和唇妆
  * ⚠️ 思考：妆容是否符合角色年龄？
  * 18-22岁：清透淡妆，避免浓妆（夸张眼线、过长假睫毛、艳丽红唇）
  * 25岁以上：可适度增加妆容精致度
- **发型**: 多样设计（披发/半扎发/编发/盘发），注重层次感和发质光泽
  * ⚠️ 自然发色：深棕色/棕黑色（不用"乌黑"、"纯黑"）
  * 剧本明确染发可使用剧本发色
- **气质**: 优雅迷人，强镜头感
- **特色**: 通过独特发型、五官特征等增加辨识度和记忆点
` : beautyLevel === 'balanced' ? `
⚠️ **美型程度**: 平衡美型
- 真实感与美感平衡，适度优化五官、皮肤、发型
- 适度增加发型设计感，但不过度华丽
` : `
⚠️ **美型程度**: 真实朴素
- 优先真实感，符合时代和社会阶层
`;

  return `# 阶段3: 外貌设计 (快速模式)

你是一位资深角色造型师,请基于前两个阶段的分析,快速设计角色的具体外貌。

🚨 **本阶段产出是「常规完好基底」**
- 用于后续所有状态的一致性参考
- 描述角色的「日常完好状态」，确保可复用于多个场景
- 不要包含剧情态（受伤/战损/疲惫等）

${scriptAppearanceSection}

${appearanceReference}

${cinematicBeautification}

---

## 输入信息

### 基本信息
- 性别: ${stage1.basicInfo.gender}
- 年龄段: ${stage1.basicInfo.ageGroup}
- 时代背景: ${stage1.basicInfo.era}

### 视觉标签 (来自阶段2)
${stage2.visualTags.map(tag => `- ${tag.tag}: ${tag.description}`).join('\n')}
${beautyRequirements}
${temperamentGuide}
---

  ## 任务要求

  设计具体的外貌特征：
  1. **发型**: 具体的发型、发色、发质
  2. **眼睛**: 眼型、眼神、瞳孔颜色
  3. **五官**: 鼻子、嘴唇、脸型等
  4. **独特特征**: 增加辨识度的细节（可选）
     ⚠️ **uniqueFeature 禁止事项**：
     - 除非剧本中**明确写出**角色长期拥有某类面部伤疤/胎记，否则禁止在此字段主动设计显眼的脸部刀疤、大面积伤痕；
     - 不要从剧情描述词（如"狰狞刀疤"是剧中其他人对角色的感受）直接套用为长期外貌设计；
     - 脸部粗粝感、饱经风霜的气质，应通过体态、眼神、肤质等方式呈现，而不是靠物理伤疤；
     - 若角色有战损经历，应放在**专门的战损形态**中，而非常态外貌设定。
  5. **性格→视觉要点**：结合性格特质（${stage1.behaviorAnalysis.personalityTraits.join('、')}），为每个核心性格写出 1 句具体的视觉表现方式（落在发型 / 眼神 / 五官 / 体态上），这些要点必须在最终外貌描述中有所体现。
     - **⚠️ 特别注意负面性格的视觉化**：
       - "油腻、邋遢" → 发型凌乱油腻、发际线后移、面部油光、体态发福
       - "阴险、刻薄" → 眼神阴冷、嘴角下垂、眉眼狭长、面相刻薄
       - "凶狠、暴戾" → 眉眼凶恶、眼神狠厉、面部线条硬朗粗犷
       - "懦弱、胆小" → 眼神闪躲、肩膀微缩、面容怯懦、体态畏缩
       - "贪婪、自私" → 眼神贪婪、嘴角微勾、面相精明算计
     - **不要把负面性格美化成"精明沉郁"、"冷峻硬朗"、"利落干练"等正面描述**
  6. **⚠️ 反派精英化自检**（role=${stage1.characterPosition.role}）：
     - 如果 role 为反派，且社会阶层为"底层/农村/普通小市民"，禁止使用"发量浓密、一丝不苟后梳、锋利丹凤眼、下颌线分明、清爽淡妆"等精英化组合；
     - 此类反派应呈现"略油腻或凌乱的发型、略发福或松弛的体态、肤质不完美"以体现生活痕迹与压迫感。

⚠️ **重要要求**:
1. ✅ **确定性**: 必须明确单一,不能用"或"
   - ❌ 错误: "一侧或双侧麻花辫"
   - ✅ 正确: "双侧麻花辫"

2. ✅ **静态视觉**: 只描述静态特征
   - ❌ 错误: "笑时眼睛弯成月牙"
   - ✅ 正确: "眼型细长,眼尾微挑"

3. ✅ **可视化**: 摄影师/画师能直接呈现
   - ❌ 错误: "充满智慧"
   - ✅ 正确: "眉眼间透着沉静"

4. ✅ **具体量化**: 使用具体描述
   - ❌ 错误: "中长发"
   - ✅ 正确: "及肩长发,长度至锁骨"

---

## 输出格式

⚠️ **重要**: 请先思考,再输出JSON

直接输出JSON:

\`\`\`json
{
  "thinking": {
    "uniqueness": "这个设计与历史记录的区别: ...(20-30字)",
    "ageAppropriate": "妆容是否符合角色年龄: ...(10-20字)"
  },
  "hairDesign": "具体的发型描述(30-40字) - 强调卷度、层次感、蓬松感",
  "eyesDesign": "具体的眼睛描述(30-40字) - 包含眼妆描述(眼影、眼线、睫毛)",
  "facialDesign": "具体的五官描述(30-40字) - 包含唇妆、底妆描述",
  "makeupDesign": "妆容描述(30-40字) - 眼妆、唇妆、底妆的整体效果",
  "uniqueFeature": "独特特征(20-30字,可选)——禁止：除非剧本明确提及长期面部伤疤/胎记，否则不要填写刀疤或大面积面部伤痕；推荐通过眼神/体态/痣/发型来增加辨识度",
  "finalDescription": {
    "mainCharacter": "中国人,${stage1.basicInfo.gender},${stage1.basicInfo.specificAge || stage1.basicInfo.ageGroup}${stage1.basicInfo.specificAge ? '岁' : ''},${stage1.basicInfo.era},${bodyProportions}",
    "facialFeatures": "完整的外貌描述(100-150字,必须是具体的视觉描述,不能有占位符) ⚠️ 只描述发型、五官、妆容、面部特征,不要包含服装、配饰等非外貌元素"
  }
}
\`\`\`

⚠️ **thinking字段说明**:
- uniqueness: 说明这个设计与历史记录中的角色有什么明显区别
- ageAppropriate: 说明妆容是否符合角色年龄,是否过于浓重

请开始!`;
}

