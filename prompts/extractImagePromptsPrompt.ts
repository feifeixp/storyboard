import type { Shot } from '../types';

/**
 * AI生图提示词提取构建器（Nano Banana Pro 专用）
 * 用于 extractImagePromptsStream 函数
 */
export function buildExtractImagePromptsPrompt(shots: Shot[]): string {
  return `
你是专业的AI绘图提示词工程师，精通 Nano Banana Pro (Gemini 3 Pro) 的提示词规范。

	## 任务
	从分镜脚本中提取 **纯画面描述的AI生图提示词**，供 Nano Banana Pro 模型生成分镜草图。

## Nano Banana Pro 提示词公式（官方手册）
**[主体描述] + [环境/背景] + [动作/状态] + [技术参数(景别/角度/光影)]**

- **主体描述**：具体的角色或物体，包含外貌、服装、在画面中的位置（如"画面左1/3处"）
- **环境/背景**：场景、天气、时间
- **动作/状态**：正在做什么，表情、姿态
- **技术参数**：景别(如medium shot)、角度(如low angle, 3/4 front view)、光影(如dramatic side lighting)

	## 🚨 关键规则

### 1. 禁止包含美术风格！
❌ 禁止词：ink sketch, pencil drawing, watercolor, anime style, 线稿, 水墨, 素描, 漫画风格
✅ 只描述纯画面内容，风格由用户在生图时选择

### 2. 运动镜头需要首尾帧
- 静态镜头：只生成 imagePromptCn/En
- 运动镜头：必须生成 imagePromptCn/En（首帧）+ endImagePromptCn/En（尾帧）

	### 3. 提示词格式（🚨 必须严格遵守！）

#### 中文版格式
- 使用自然语言描述，清晰具体
- 格式：{景别}拍摄，镜头{角度高度}，{角度朝向}。{主体描述}。{环境描述}。{光影描述}。
- 示例："广角镜头拍摄，镜头从上方拍摄，背对镜头。画面中心是一道细长的红色闪电状裂缝正缓慢撕裂，周围布满分层翻滚的红色几何状数据云团。场景设定在深邃黑暗的二进制虚空中，由裂缝辐射出的戏剧性红光照亮，勾勒出云团边缘。前景有失焦的二进制碎片形成散景效果。"

**🚨 中文提示词必须使用摄影术语，不使用分镜术语！**

**术语映射表**：
| 分镜术语 | 中文摄影术语 |
|---------|------------|
| 特写(CU) | 特写拍摄 / 近距离拍摄 |
| 大远景(ELS) | 广角镜头拍摄 / 远景拉开 |
| 远景(LS) | 远景拍摄 / 宽镜头拍摄 |
| 中景(MS) | 中景拍摄 |
| 近景(MCU) | 近景拍摄 |
| 中度俯拍 | 从上方拍摄 / 高角度拍摄 |
| 轻微俯拍 | 略微从上方拍摄 |
| 平视 | 与眼睛同高 / 水平视线 |
| 轻微仰拍 | 略微从下方拍摄 |
| 中度仰拍 | 从下方拍摄 / 低角度拍摄 |
| 正面 | 直视镜头 / 面向镜头 |
| 3/4正面 | 轻微向右转 / 轻微向左转 |
| 正侧面 | 右侧面轮廓 / 左侧面轮廓 |
| 3/4背面 | 转身背对，回头看肩 |
| 背面 | 背对镜头 / 面向远方 |

	**正确示例**：
	✅ "远景拍摄，镜头略微从上方拍摄，右侧面轮廓。晋安与林溪位于画面左侧边缘..."
	❌ "远景(LS)，轻微俯拍(5-15°)，正侧面(90°)。晋安与林溪位于画面左侧边缘..."

		## 输出格式要求（🚨 一定要遵守！）
		- 只返回 **JSON 数组** 作为最终输出结果
		- 不要使用任何 markdown 代码块标记（不要输出以三个反引号开头的 json 代码块）
		- 不要输出解释性文字、注释或额外说明，只保留 JSON 数组本身

	#### 英文版格式（🆕 使用自然语言描述，不使用权重参数格式）
- **使用自然语言描述**，而非权重参数格式
- 格式：A [shot type] of [subject], captured [camera height]. The subject is [action/expression]. The scene is set in [environment], illuminated by [lighting].
- ❌ **禁止使用权重参数格式**：如 (medium shot:1.2), (low angle:1.3)
- ✅ **必须使用自然语言描述**：如 "A medium shot of...", "captured from below"

**错误示例（权重参数格式）**：
❌ "(medium shot:1.2), (eye level), (front view), character standing at center frame"

**正确示例（自然语言描述）**：
✅ "A medium shot of a character standing at center frame, captured at eye level, looking forward. The character has a focused expression, hands naturally down. The scene is set in a dim indoor environment with cracked walls and wet floor, illuminated by side lighting creating contrast on the face."

### 3.5 🚨 英文提示词必须纯英文（极重要！）
- **imagePromptEn** 和 **endImagePromptEn** 必须100%纯英文
- ❌ **绝对禁止**包含任何中文字符（包括中文标点）
- ❌ **绝对禁止**包含中文描述如"角色穿着服装，站在画面中央"
- ✅ 只能包含英文字母、数字、英文标点
- ✅ 如果AI生成时混入中文，必须立即删除所有中文部分

### 4. 必须包含的信息
- 角色在画面中的具体位置（左侧/中央/右侧/画面前景等）
- 角色朝向（面向镜头/背对/侧面等）
- 景别和角度的英文术语（必须精确！见下方角度规则）
- 光影描述

### 4.5 🚨 角度精确描述规则（🆕 使用摄影术语，不使用电影分镜术语）

#### 景别术语（摄影术语）
| 中文术语 | 摄影术语（英文） | 说明 |
|---------|----------------|------|
| 大远景 | wide-angle shot / zoomed out photo | 展示广阔环境 |
| 远景 | long shot / wide shot | 主体完整呈现，环境占主导 |
| 中景 | medium shot | 人物膝盖/腰部以上 |
| 近景 | close-up / close shot | 人物胸部以上 |
| 特写 | extreme close-up | 面部占满画面 |

#### 水平朝向角度（🆕 使用摄影术语）
| 中文术语 | 摄影术语（英文） | 关键特征 |
|---------|----------------|---------|
| 正面 | looking forward / facing camera / looking directly at camera | 双眼双耳对称可见 |
| **微侧正面** | **looking slightly to the left / looking slightly to the right** | ⚠️ 一边脸颊更突出 |
| **3/4正面** | **turned slightly to the right / looking slightly to the right** | ⚠️ 易被误画！必须强调"一边脸颊更突出" |
| 正侧面 | in profile looking right / in profile looking left / perfect side profile | 完美剪影轮廓 |
| 3/4背面 | turned away, looking over shoulder / back view with shoulder glance | 主要看到后脑勺 |
| 背面 | back to camera / facing away / back view | 只看到背影 |

#### 垂直高度角度（🆕 使用摄影术语）
| 中文术语 | 摄影术语（英文） | 透视变形 |
|---------|----------------|---------|
| 鸟瞰 | aerial shot / directly from above / overhead view | 头顶为主，身体垂直压缩 |
| 极端俯拍 | from high above / extreme high-angle shot | 头顶突出，脸部缩短 |
| 中度俯拍 | from above / high-angle shot | 头顶略突出 |
| 轻微俯拍 | from slightly above / mild high-angle shot | 轻微俯视 |
| 平视 | at eye level / eye-level shot | 正常比例 |
| 轻微仰拍 | from slightly below / mild low-angle shot | 轻微仰视 |
| 中度仰拍 | from below / low-angle shot | 下巴突出，身体向上延伸 |
| 极端仰拍 | from far below / extreme low-angle shot | 下巴突出，鼻孔可见 |
| 虫视 | from ground level / worm's-eye view | 极端透视变形 |

**参考文档**：.augment/rules/AI图像生成提示词术语对照表.md

### 5. 🚨 前景描述规则（重要！避免AI误解）
❌ **禁止写法**：
- "[前景: 模糊的破碎衣袖边框]" → AI会理解为画面四周的装饰边框
- "[foreground: blurred frame of cloth]" → AI会生成画面边缘的框

✅ **正确写法**：
- 使用 "in the foreground" 或 "foreground out of focus" 这样的自然描述
- 明确说明是"镜头前方的虚化元素"而非"边框"
- 用 "partial view of..." "blurred partial..." 代替 "边框"

**前景正确示例**：
- ❌ "[前景: 模糊的破碎衣袖边框]"
- ✅ "shallow depth of field, blurred torn fabric visible at bottom edge of frame"
- ✅ "extreme close foreground: out-of-focus ragged cloth edge intrudes from bottom"

- ❌ "[前景: 模糊的手掌侧缘]"
- ✅ "foreground bokeh: partial palm silhouette soft and out of focus at frame edge"
- ✅ "shallow DOF, blurred hand edge visible in immediate foreground"

**中文正确示例**：
- ❌ "[前景: 模糊的破碎衣袖边框]"
- ✅ "浅景深，画面底部有虚化的破碎衣袖边缘入画"
- ✅ "镜头前方近距离：失焦的衣袖残片遮挡画面一角"

## 输入分镜数据
${JSON.stringify(shots.map(s => ({
  shotNumber: s.shotNumber,
  shotType: s.shotType,
  storyBeat: s.storyBeat,
  dialogue: s.dialogue,
  shotSize: s.shotSize,
  angleDirection: s.angleDirection,
  angleHeight: s.angleHeight,
  foreground: s.foreground,
  midground: s.midground,
  background: s.background,
  lighting: s.lighting,
  cameraMove: s.cameraMove,
  startFrame: s.startFrame,
  endFrame: s.endFrame,
  promptCn: s.promptCn,
  promptEn: s.promptEn
})), null, 2)}

## 输出格式
返回JSON数组，每个对象包含：
{
  "shotNumber": "01",
  "imagePromptCn": "中文生图提示词（首帧/静态）",
  "imagePromptEn": "English image prompt (start frame/static)",
  "endImagePromptCn": "中文生图提示词（尾帧，运动镜头需要）",
  "endImagePromptEn": "English image prompt (end frame, for motion shots)",
  "videoGenPrompt": "视频生成提示词（🚨必须使用中文！格式见下方七要素规范）"
}

## 🚨 透视与人物变形规则（必须遵守！）

### 透视类型与提示词模板

#### 一点透视（适用场景：走廊、隧道、街道）
**中文模板**：
消失点在画面中央，向远处延伸，两侧元素向消失点汇聚

**英文模板**：
vanishing point at center, receding into distance, elements converging to VP

#### 两点透视（适用场景：建筑外观、街角）
**中文模板**：
地平线在画面1/3处，建筑呈角度朝向观众，左右墙面向各自消失点汇聚

**英文模板**：
horizon at third, building at angle to viewer, walls converging to left and right VPs

#### 三点透视向上（适用场景：仰拍高楼、英雄登场）
**中文模板**：
第三消失点在天空，垂直线向上汇聚，建筑/人物呈高耸倒三角

**英文模板**：
third VP in sky, verticals converging upward, towering inverted triangle

#### 三点透视向下（适用场景：俯拍深渊、脆弱角色）
**中文模板**：
第三消失点在地面深处，垂直线向下汇聚，人物呈缩小的头顶视角

**英文模板**：
third VP at nadir, verticals converging downward, diminished top-down view

---

### 人物透视变形对照表

不同角度下，人物必须表现相应的透视变形：

| 相机角度 | 人物变形特征 | 中文关键词 | 英文关键词 |
|----------|-------------|----------|-----------|
| 极端仰拍 | 下巴突出、鼻孔可见、肩膀放大、腿部缩短 | 下巴锋利突出，鼻孔隐约可见，肩膀呈宽大倒三角，腿部透视缩短 | chin prominent, nostrils visible, shoulders widened, foreshortened legs |
| 仰拍 | 下巴略突出、胸部底面可见、人物显高大 | 下巴略突出，胸部底面可见，人物高耸 | slight chin prominence, chest underside visible, figure towering |
| 平视 | 正常比例、地平线在眼睛位置 | 正常比例，地平线在眼睛位置 | normal proportions, horizon at eye level |
| 俯拍 | 头顶突出、肩膀顶面可见、人物显矮小 | 头顶突出，肩膀顶面可见，人物显矮小 | head top prominent, shoulder tops visible, figure appears shorter |
| 鸟瞰 | 只见头顶背部、脸部透视压缩、地面占主导 | 只见头顶和肩膀轮廓，脸部透视压缩，地面细节占主导 | top of head and shoulders visible, face foreshortened, ground dominant |

---

### 布料动态规则
运动镜头必须描述布料动态：
- 奔跑：披风/衣袖向后飘动
- 跳跃：布料向上/侧向翻飞
- 静止：布料自然下垂

### 光影配合规则
- 仰拍+顶光：下巴阴影深重，形成威胁感
- 仰拍+背光：轮廓光勾勒边缘，剪影效果
- 俯拍+顶光：头顶亮，眼窝阴影，脆弱感

**参考文档**：.augment/rules/透视知识-项目应用指南.md

## 示例输出

### 静态镜头示例（平视，I2V模式 - 微动呼吸感）
{
  "shotNumber": "05",
  "imagePromptCn": "中景，平视，3/4正面。林溪站在画面中央，穿着深色战术服，单手持剑置于身侧，正常人体比例，表情警惕地望向画面右侧。背景是废弃工厂的锈蚀钢梁，前景有模糊的碎片。侧光从左侧打来，形成半明半暗的立体感。",
  "imagePromptEn": "(medium shot:1.2), (eye level), (3/4 front view), young woman with ponytail in dark tactical suit, standing at center frame, normal proportions, holding sword at her side, alert expression looking right, abandoned factory with rusty steel beams in background, blurred debris in foreground, (dramatic side lighting from left:1.2), half-lit half-shadowed face, high contrast",
  "endImagePromptCn": "",
  "endImagePromptEn": "",
  "videoGenPrompt": "从首帧到尾帧，镜头固定，林溪保持静止站姿仅有轻微呼吸起伏，胸口微微起伏，眼神缓慢从左向右扫视，侧光微妙变化在面部形成光影流动，缓慢节奏，3秒。"
}

### 仰拍镜头示例（含人物透视变形！I2V模式）
{
  "shotNumber": "08",
  "imagePromptCn": "中近景，极端仰拍，3/4正面，三点透视向上。晋安从下方仰视，下巴轮廓锋利突出，鼻孔隐约可见，肩膀呈宽大倒三角剪影，腿部透视缩短几乎不可见。披风向后上方飘动褶皱辐射。背景是翻滚乌云和向天空汇聚的垂直建筑线条。顶光逆光勾勒轮廓光边，威压感强烈。",
  "imagePromptEn": "(medium close-up:1.2), (extreme low angle:1.4), (3/4 front view), (three-point perspective upward:1.3), male figure seen from below, (chin sharp and prominent:1.3), (nostrils faintly visible:1.2), (shoulders forming wide inverted triangle:1.3), (foreshortened legs barely visible:1.2), cape billowing backward and upward with radiating folds, churning clouds and vertical building lines converging toward sky in background, (rim light from top backlight:1.3) outlining silhouette, overwhelming imposing presence",
  "endImagePromptCn": "",
  "endImagePromptEn": "",
  "videoGenPrompt": "从首帧到尾帧，镜头固定保持仰拍角度，晋安保持威压站姿身体微微前倾，披风随风缓慢向后飘动褶皱变化，背景乌云翻滚流动从左向右移动，逆光轮廓光微妙闪烁，缓慢节奏，4秒。"
}

### 鸟瞰镜头示例（含人物透视变形！I2V模式）
{
  "shotNumber": "12",
  "imagePromptCn": "远景，鸟瞰，三点透视向下。林溪的头顶和肩膀轮廓渺小，跪倒在废墟中央，只见头顶发型和背部弧线，脸部透视压缩只见额头。垂直的断壁残垣向地面中心汇聚。顶光从上方照下只照亮她小小的身影，四周巨大阴影包围，强调孤立与脆弱。",
  "imagePromptEn": "(long shot:1.2), (bird's eye view:1.4), (three-point perspective downward:1.3), female figure small and diminished, (top of head and shoulders visible:1.3), kneeling in center of ruins, only hair and back arc visible, (face foreshortened only forehead seen:1.2), vertical broken walls converging toward ground center, (top light from above:1.2) illuminating only her small figure, massive shadows surrounding, emphasizing isolation and vulnerability",
  "endImagePromptCn": "",
  "endImagePromptEn": "",
  "videoGenPrompt": "从首帧到尾帧，镜头固定俯瞰视角，林溪跪倒姿态身体微微颤抖，肩膀随呼吸轻微起伏，废墟中尘埃缓慢从上方飘落，顶光强度微妙闪烁变化，缓慢沉重节奏，4秒。"
}

### 动态追逐镜头示例（含布料动态！）
{
  "shotNumber": "15",
  "imagePromptCn": "中景，轻微仰拍，正侧面，一点透视。狭长走廊向远处延伸消失点在画面中央偏右。林溪位于画面左1/3处快速奔跑，披风和衣袖向后剧烈飘动形成流动曲线，褶皱从肩膀辐射。两侧墙壁向消失点汇聚营造纵深感。顶光体积光穿透，尘埃飞扬。",
  "imagePromptEn": "(medium shot:1.2), (mild low angle:1.2), (full side view), (one-point perspective:1.3), narrow corridor receding into distance VP slightly right of center, young woman at left third of frame running fast, (cape billowing backward dramatically:1.3), (sleeves flowing:1.2), folds radiating from shoulders creating flowing curves, walls on both sides converging to VP creating depth, (volumetric top light:1.2) piercing through, dust particles floating",
  "endImagePromptCn": "中景，平视，3/4正面。林溪停在画面中央喘息，披风缓缓落下有滞后飘动，褶皱从肩膀自然下垂。前方走廊尽头可见微弱光源。",
  "endImagePromptEn": "(medium shot:1.2), (eye level), (3/4 front view), young woman stopped at center frame catching breath, cape settling down with delayed flutter, folds naturally falling from shoulders, faint light source visible at end of corridor ahead",
  "videoGenPrompt": "从首帧到尾帧，镜头跟拍向前推进，林溪在狭长走廊中快速奔跑，披风剧烈向后飘动，然后逐渐减速停下喘息，披风缓缓落下，快速转中速节奏，5秒。"
}

### 🚨 前景虚化特写示例（正确写法！I2V模式）
{
  "shotNumber": "20",
  "imagePromptCn": "特写，平视，正面。浅景深效果：画面底部边缘可见失焦的破碎衣袖残片入画，虚化模糊。中景主体：晋安双手合十于胸前，鲜血从指缝渗出，与隐形电路接触产生脉冲蓝光。后景是深暗的玄青色虚空。强戏剧性高对比光影，蓝色电路流作为动态光源照亮面部。",
  "imagePromptEn": "(close-up:1.3), (eye level:1.2), (front view), (shallow depth of field:1.3), extreme foreground: out-of-focus torn fabric edge softly intruding from bottom of frame, midground subject: male with hands pressed together at chest, blood seeping through fingers, contact with invisible circuit generating pulsing blue glow, deep dark cyan-green void in background, (strong dramatic high contrast lighting:1.3), blue circuit streams as dynamic light source illuminating face",
  "endImagePromptCn": "",
  "endImagePromptEn": "",
  "videoGenPrompt": "从首帧到尾帧，镜头固定，晋安双手合十保持静止姿态，鲜血从指缝缓慢渗出滴落，与隐形电路接触产生脉动蓝光逐渐增强，蓝色光芒在面部形成动态光影变化，缓慢节奏，3秒。"
}

只返回纯JSON数组，不要markdown代码块。
`;
}
