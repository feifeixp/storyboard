/**
 * 阶段3: 外貌描述创作 - 优化版
 * 🆕 融合快速模式的优秀设计 + 保留思维链核心结构
 */

import type { Stage1ScriptAnalysis, Stage2VisualTags, BeautyLevel } from './types';
// Stage2VisualTags 作为 stage2 参数的实际类型别名（函数签名中使用 VisualTags 兼容名）
type VisualTags = Stage2VisualTags;
import { getAppearanceReference } from './getAppearanceReference';
import { getTemperamentGuideForStage3 } from './getTemperamentReference';

/**
 * 🆕 A2: 根据年龄/剧本类型/社会阶层/角色定位 动态推导头身比例
 * 目标：
 * - 遵守《人物比例设计原则》：儿童 5–6 头身，青少年 6–7，成年人 7–8，老年人 6.5–7；
 * - 只有在【理想美型 + 女频/偶像/甜宠类】下的主角，才有机会接近 8 头身；
 * - 反派/普通配角更多落在 6.5–7.3 区间，避免“全员 8 头身”。
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

	// 2. 根据美型程度做小幅偏移（避免一上来就“全员 8 头身”）
	if (beautyLevel === 'idealized') {
		baseRatio += 0.3; // 理想美型稍微拉高
	} else if (beautyLevel === 'realistic') {
		baseRatio -= 0.3; // 真实风格稍微压低
	}

	// 3. 根据社会阶层微调（富裕略高，底层略低，但幅度很小）
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

	// 5. 角色定位约束：
	//   - 主角：在【理想美型 + 偶像/女频】下可以逼近 8 头身，否则最多 ~7.6；
	//   - 反派：更多落在 6.6–7.2 的真实区间；
	//   - 配角：大多在 6.8–7.4 之间。
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
			// 普通配角/未标注角色
			const min = 6.8;
			const max = 7.4;
			baseRatio = Math.max(min, Math.min(baseRatio, max));
		}
	}

	// 6. 安全夹紧：绝对不超出 5.5–8.0 设计边界
	baseRatio = Math.max(5.5, Math.min(baseRatio, 8.0));

	// 7. 映射到文案描述
	if (baseRatio >= 7.8) return '8头身黄金比例';
	if (baseRatio >= 7.3) return '7.5头身标准比例';
	if (baseRatio >= 6.8) return '7头身标准比例';
	if (baseRatio >= 6.3) return '6.5头身青少年比例';
	if (baseRatio >= 5.8) return '6头身少年比例';
	return '5.5头身儿童比例';
}

export function buildStage3Prompt(
  stage1: Stage1ScriptAnalysis,
  stage2: VisualTags,
  beautyLevel: BeautyLevel = 'balanced'
): string {
  // 🆕 检查剧本中是否有外貌描述（来自快速模式）
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

  // 🆕 剧本外貌描述部分（来自快速模式）
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

  // 🆕 影视化美化策略（来自快速模式）
  const cinematicBeautification = beautyLevel === 'realistic' ? `
⚠️ **美化策略**: 真实风格 - 无精致妆容，体现真实外貌状态
` : `
⚠️ **美化策略**: 平衡美感与剧情
- ✅ 可有精致妆容
- ❌ 避免过度狼狈（眼线模糊导致黑眼圈、青茬等丑化元素）
`;

  // 🆕 气质外貌引导（软匹配，提问式注入）
  const temperamentGuide = getTemperamentGuideForStage3(stage1);

  // 🆕 A2: 动态推导头身比例
  const bodyProportions = deriveBodyProportions(stage1, beautyLevel);

  // 🆕 美型程度要求（来自快速模式，优化压缩）
  const beautyRequirements = beautyLevel === 'idealized' ? `
⚠️ **美型程度**: 理想美型（偶像剧/女频短剧标准）
- 核心：现代拍摄标准，款式符合时代，质感/妆容使用现代标准
- 五官：精致立体，${bodyProportions}
- 妆容：精致现代妆容，注重眼妆和唇妆
  * ⚠️ 年龄适配：18-22岁清透淡妆，25岁以上可适度增加精致度
- 发型：多样设计，注重层次感和发质光泽
  * ⚠️ 自然发色：深棕色/棕黑色（不用"乌黑"、"纯黑"）
- 气质：优雅迷人，强镜头感
- 特色：通过独特发型、五官特征增加辨识度
` : beautyLevel === 'balanced' ? `
⚠️ **美型程度**: 平衡美型 - 真实感与美感平衡，适度优化五官、皮肤、发型
` : `
⚠️ **美型程度**: 真实朴素 - 优先真实感，符合时代和社会阶层
`;

  return `# 阶段3: 外貌描述创作

你是专业角色造型师。请严格按照步骤执行，每步必须输出JSON结果。

🚨 **本阶段产出是「常规完好基底」**
- 用于后续所有状态的一致性参考
- 描述角色的「日常完好状态」，确保可复用于多个场景
- 不要包含剧情态（受伤/战损/疲惫等）

${scriptAppearanceSection}

${appearanceReference}

${cinematicBeautification}

⚠️ **格式要求**：
1. 必须按【Step 3.X 执行中】格式输出
2. 每步必须有"思考过程"和"输出结果"
3. 不允许跳过任何步骤

---

## 输入信息

**角色基本信息**：${stage1.basicInfo.gender}、${stage1.basicInfo.ageGroup}、${stage1.characterPosition.role}、${stage1.characterPosition.socialClass}
**时代背景**：${stage1.basicInfo.era}
**性格特点**：${stage1.behaviorAnalysis.personalityTraits.join('、')}
**剧本类型**：${stage1.scriptType.category}（${stage1.scriptType.genre}）
**美学方向**：${stage1.scriptType.aestheticDirection}

**视觉标签**：
${stage2.visualTags.map(t => `- ${t.tag}：${t.description}`).join('\n')}
${beautyRequirements}
${temperamentGuide}
---

## 执行步骤

【Step 3.1 执行中】角色理解

思考过程：
分析角色核心特质（50字内）：
- 性格：${stage1.behaviorAnalysis.personalityTraits.join('、')}
- 身份：${stage1.characterPosition.role}（${stage1.characterPosition.socialClass}）
- 剧本类型：${stage1.scriptType.category}

输出结果：
\`\`\`json
{
  "understanding": "角色核心特质",
  "emotionalTone": "情感基调",
  "charmPoint": "魅力点"
}
\`\`\`

---

【Step 3.2 执行中】视觉风格定位

	思考过程：
	1. 先做一张“小表”，逐条对应：
	   - 对于每个性格特质（${stage1.behaviorAnalysis.personalityTraits.join('、')}），分别写出 1 句“应该如何在【发型/眼神/五官/体态】中体现”的具体视觉要点；
	   - **⚠️ 特别注意负面性格的视觉化**（根据 role 和 personalityTraits 判断）：
	     - "油腻、邋遢" → 发型凌乱油腻、发际线后移、面部油光、体态发福
	     - "阴险、刻薄" → 眼神阴冷、嘴角下垂、眉眼狭长、面相刻薄
	     - "凶狠、暴戾" → 眉眼凶恶、眼神狠厉、面部线条硬朗粗犷
	     - "懦弱、胆小" → 眼神闪躲、肩膀微缩、面容怯懦、体态畏缩
	     - "贪婪、自私" → 眼神贪婪、嘴角刻薄微勾、脸部略浮肿或油光、面相精明而不讨喜
	     - "冷酷无情" → 眼神冷硬无温度、面部线条生硬、嘴角常年下压
	     - "欺软怕硬" → 对弱者时眼神轻蔑、神态傲慢，对强者时眼神闪躲、体态微缩
	     - "流氓地痞" → 发型略显油腻凌乱、胡渣未剃净、姿态吊儿郎当
	     - "唯利是图" → 眼神精明算计、嘴角抿紧、整体给人精打细算但不可信的感觉
	   - 例如："坚韧" → "下颌线略紧绷、眉形偏直、眼神更为坚定"。
	2. 在此基础上，确定外貌设计的整体美学标准（50字内）：
	   - 美学方向：${stage1.scriptType.aestheticDirection}
	   - 如何平衡真实与美？
	   - 如何体现性格（要能覆盖上面的小表，而不是一句空话）？
	   - **⚠️ 如果角色有负面性格且 role 为"反派"，必须在外貌上体现负面特征，不能美化成"精明沉郁"或"冷峻硬朗"的精英形象**

输出结果：
\`\`\`json
{
  "aestheticDirection": "美学方向",
  "balanceStrategy": "平衡策略",
  "personalityExpression": "性格体现"
}
\`\`\`

---

【Step 3.3 执行中】外貌特征设计

思考过程：
设计具体外貌特征（每项30-40字）：
1. **发型**：具体发型、发色、发质（⚠️ 自然发色：深棕色/棕黑色）
2. **眼睛**：眼型、眼神、瞳孔颜色（包含眼妆：眼影、眼线、睫毛）
3. **五官**：鼻子、嘴唇、脸型（包含唇妆、底妆）
4. **🆕 体型**：体型描述（如：纤细、匀称、微胖、强壮、肥胖等，20-30字）
5. **妆容**：整体妆容效果（⚠️ 年龄适配：18-22岁清透淡妆，25岁以上可适度精致）
6. **独特特征**：增加辨识度（可选）
   ⚠️ **uniqueFeature 严禁事项**（面部伤疤是最常见的错误）：
   - ❌ **禁止在常规完好基底中设计面部刀疤/伤痕**，即使剧本某处提到过"狰狞的刀疤"；
   - ❌ **不要从剧情场景词语直接套用**：剧本中战斗/受伤场景提及的伤疤，是"剧情态"（可能是他人眼中的描述或特定时刻），**不等于**该角色常态下的固有外貌特征；
   - ❌ 脸部粗粝感、饱经风霜的气质，应通过**体态、眼神、肤质**等方式呈现，而不是物理伤疤；
   - ✅ uniqueFeature 推荐选择：唇形特征、眼尾弧度、下颌轮廓、痣、发际线等非伤疤类细节；
   - ✅ 若角色确实有战损经历，相关伤疤应放在**专门的战损形态**中，而非常态外貌设定。

⚠️ **输出要求**（来自快速模式）：
- ✅ 确定性：明确具体，不用"或"（❌"一侧或双侧" ✅"双侧"）
- ✅ 静态视觉：只描述静态特征（❌"笑时眑睛弯成月牙" ✅"眼型细长"）
- ✅ 可视化：摄影师能直接呈现（❌"充满智慧" ✅"眉眼间透着沉静"）
- ✅ 具体量化：使用具体描述（❌"中长发" ✅"及肩长发，长度至锁骨"）

⚠️ **缺陷词汇使用规则**（根据角色定位）：
- **主角/正面角色**：❌ 禁止使用"粗糙、暗沉、憔悴、油腻、浮肿、蜡黄"等缺陷词汇（会让观众觉得角色病态或失去魅力）
  - ❌ **面部刀疤属于缺陷词汇**：常规基底中一律不得添加，无论是"浅淡"还是"隐约可见"。需要刀疤的角色请留到专属的战损/受伤形态中处理
- **反派/负面角色**（如：家暴施暴者、农村恶毒长辈、流氓地痞、贪婪商人）：
  - ✅ **允许并推荐**使用"油腻、粗糙、浮肿、蜡黄、发福、油光"等词汇来表现负面气质
  - ✅ 参考 Stage1 的 personalityTraits（${stage1.behaviorAnalysis.personalityTraits.join('、')}）和 role（${stage1.characterPosition.role}）来判断
  - 示例：如果性格包含"自私、贪婪、冷酷无情、欺软怕硬"，且 role 为"反派"，则应该使用负面外貌词汇

输出结果：
\`\`\`json
{
  "hairDesign": "发型设计（30-40字）",
  "eyesDesign": "眼睛设计（30-40字，包含眼妆）",
  "facialDesign": "五官设计（30-40字，包含唇妆、底妆）",
  "bodyType": "🆕 体型描述（20-30字，如：纤细、匀称、微胖、强壮等）",
  "makeupDesign": "妆容描述（30-40字）",
  "uniqueFeature": "独特特征（20-30字，可选）——❌禁止：面部刀疤/伤痕（即使剧本提到过也不能写在常规基底里）；✅推荐：唇形、眼尾弧度、下颌线、痣、发际线等非伤疤特征"
}
\`\`\`

---

【Step 3.4 执行中】自我批判

	思考过程：
	检查设计质量（30字内）：
	1. 是否有魅力和吸引力？
	2. 是否符合角色定位？
	3. 是否**逐条**体现了性格特质（${stage1.behaviorAnalysis.personalityTraits.join('、')}），对应到具体的发型/眼神/五官/体态细节？
	4. **⚠️ 负面性格检查**：
	   - 如果角色有"油腻、邋遢、阴险、凶狠、懦弱、贪婪"等负面性格，外貌是否真实体现了这些特征？
	   - 是否错误地美化成了"精明沉郁"、"冷峻硬朗"、"利落干练"等正面描述？
	   - 如果是，必须在改进说明中指出，并调整为符合负面性格的外貌特征
	5. **⚠️ 反派精英化检查**（重要！）：
	   - 如果 role 显示为"反派"或"配角反派"，且性格中包含"自私/贪婪/流氓地痞/家暴/卖身/盘剥/欺软怕硬"等负面词汇
		   - 请检查当前外貌是否错误地塑造成了"发量浓密、一丝不苟短发、丹凤眼、下颌线分明、清爽淡妆"这类精英化形象
		   - 对于来自农村/底层/普通小市民背景的反派，更推荐使用稍显油腻或凌乱的发型、略微发福或松弛的体态、肤质不完美等特征，来体现压迫感与生活痕迹，而不是干净利落的精英外貌
		   - 如果发现存在上述问题，**必须在改进说明中指出**，并改为更粗糙、油腻或压迫感更强的形象（如：发型略显油腻凌乱、面部浮肿或油光、体态发福等）
	6. 是否存在其他问题？（过度具体数字、诡异描述、老气土气等）
	7. 如果有性格特质在外貌中没有具体落地，请在改进说明中指出，并调整相关细节。

输出结果：
\`\`\`json
{
  "qualityCheck": "质量检查结果",
  "improvements": "改进说明（如无改进写'无'）",
  "thinking": {
    "uniqueness": "这个设计与历史记录的区别（20-30字）",
    "ageAppropriate": "妆容是否符合角色年龄（10-20字）"
  }
}
\`\`\`

---

【最终输出】

⚠️ **输出要求**：
- 只包含具体视觉描述
- 不包含评论性总结
- 不包含设计思路解释
- ❌ 严禁描述服装！

\`\`\`json
{
  "roleUnderstanding": {
    "understanding": "...",
    "emotionalTone": "...",
    "charmPoint": "..."
  },
  "visualStyle": {
    "aestheticDirection": "...",
    "balanceStrategy": "...",
    "personalityExpression": "..."
  },
  "appearanceDesign": {
    "hairDesign": "...",
    "eyesDesign": "...",
    "facialDesign": "...",
    "bodyType": "🆕 体型描述（20-30字）",
    "makeupDesign": "...",
    "uniqueFeature": "独特特征（可选，❌禁止写面部刀疤/伤痕，✅推荐唇形/眼尾/痣/下颌线等）"
  },
  "selfCritique": {
    "qualityCheck": "...",
    "improvements": "...",
    "thinking": {
      "uniqueness": "与历史记录的区别",
      "ageAppropriate": "妆容是否符合年龄"
    }
  },
  "finalDescription": {
    "mainCharacter": "中国人，${stage1.basicInfo.gender}，${stage1.basicInfo.specificAge || stage1.basicInfo.ageGroup}${stage1.basicInfo.specificAge ? '岁' : ''}，${stage1.basicInfo.era}，${bodyProportions}",
    "facialFeatures": "完整的外貌描述（100-150字，必须是具体的视觉描述，包含发型、五官、妆容、🆕体型、面部特征，不包含服装、配饰）"
  },
  "appearanceConfig": {
    "faceShape": "脸型（如：鹅蛋脸、方下颌、圆脸）",
    "eyes": "眼型+大小+神态（如：杏眼、细长、坚毅有神）",
    "brows": "眉型+浓淡（如：一字眉、浓黑）",
    "nose": "鼻子描述（如：鼻梁挺直、小巧精致）",
    "lips": "嘴唇描述（如：薄唇、唇色自然）",
    "skin": "肤色+质感（如：白皙细腻、健康小麦色）",
    "hair": {
      "style": "具体发型（符合时代背景，如：麻花辫、短发利落）",
      "length": "长|中|短|极短",
      "texture": "发质（如：柔顺、粗糙、略显干枯）",
      "accessories": "发饰（如有，否则省略该字段）"
    },
    "body": {
      "proportion": "${bodyProportions}",
      "bodyType": "纤细|匀称|微胖|强壮（结合角色实际）",
      "posture": "体态（如：挺拔端正、微微前倾、略显佝偻）"
    },
    "uniqueMarks": []
  },
  "thinking": {
    "step3_1": "Step 3.1的思考过程",
    "step3_2": "Step 3.2的思考过程",
    "step3_3": "Step 3.3的思考过程",
    "step3_4": "Step 3.4的思考过程"
  }
}
\`\`\`

请开始执行！`;
}

