/**
 * 阶段4：逐镜详细设计
 * 
 * 输入：阶段1-3的结果 + 镜头列表
 * 输出：每个镜头的详细设计（构图、光影、角色、动作、AI提示词）
 */

import type { ScriptAnalysis, VisualStrategy, ShotPlanning } from './types';

export interface ShotListItem {
  shotNumber: string;
  sceneId: string;
  duration: number;
  shotSize: string;
  cameraMove: string;
  briefDescription: string;
}

export function buildStage4Prompt(
	  scriptText: string,
	  stage1: ScriptAnalysis,
	  stage2: VisualStrategy,
	  stage3: ShotPlanning,
	  shotBatch: ShotListItem[] // 一次处理5-8个镜头
		): string {
		  // 基于 Stage 1.6 的 sceneLayouts，整理空间锚点摘要，供机位/选景硬约束使用
		  const sceneLayouts = stage1.continuityNotes?.sceneLayouts || [];
		  const sceneLayoutSummary = sceneLayouts.length
		    ? sceneLayouts
		        .map((layout) => {
		          const landmarks = (layout.landmarks || []).join('、') || '（未指定地标）';
		          const defaultPositionsEntries = Object.entries(layout.defaultPositions || {});
		          const defaultPositionsStr = defaultPositionsEntries.length
		            ? defaultPositionsEntries
		                .map(([name, pos]) => `${name}：${pos}`)
		                .join('；')
		            : '（未指定默认站位）';
		          const hidden = layout.hiddenSettings
		            ? `\n  - 隐藏设定：${layout.hiddenSettings}`
		            : '';
		          return `- 场景 ${layout.sceneId}：${layout.spatialSummary}\n  - 地标：${landmarks}\n  - 默认站位：${defaultPositionsStr}${hidden}`;
		        })
		        .join('\n')
		    : '（当前剧本未提供 sceneLayouts；如缺少空间锚点信息，仍需在同一场景内保持角色与地标的相对关系前后一致，避免“瞬移感”。）';

		  return `# 阶段4：逐镜详细设计

你是一位资深电影分镜师，精通《Framed Ink》系列理论。
现在你需要为每个镜头生成详细的视觉设计和AI视频生成提示词。

---

## 输入信息

	### 世界观与风格
	- 地点：${stage1.basicInfo.location}
	- 视觉风格：${stage2.overallStyle?.visualTone || '待定'}
	- 色彩方案：${JSON.stringify(stage2.overallStyle?.colorPalette || {})}
	- 光影风格：${stage2.overallStyle?.lightingStyle || '待定'}
		
		### 角色
		${stage1.basicInfo.characters.map(c => `- ${c}`).join('\n')}

		### 空间布局锚点（来自 Stage 1.6 continuityNotes.sceneLayouts）

		这些是只为分镜服务的**场景空间锚点**，在本阶段你必须把它们当作**选景 / 机位的硬约束**：
		- 同一 sceneId 的所有镜头，角色与关键地标在空间中的相对关系必须与这些设定保持一致；
		- 只有在镜头中明确表现出“走向哪里 / 离开哪个地标 / 进入哪个区域”的运动过程时，才允许角色或机位发生显著位移。

		${sceneLayoutSummary}

	### 原始剧本文本（⚠️ 只用于对白查找，禁止改写/总结）
	下面是用户提供的完整剧本。为 storyBeat.dialogue 选择对白时，**必须逐字引用这里的原文，不得改写、扩写、合并或翻译**。

	【原始剧本文本开始】
	${scriptText}
	【原始剧本文本结束】

### 待设计的镜头
${shotBatch.map(s => `
**${s.shotNumber}** (${s.sceneId})
- 时长：${s.duration}秒
- 景别：${s.shotSize}
- 运镜：${s.cameraMove}
- 简述：${s.briefDescription}
`).join('\n')}

---

	## 🚨🚨🚨 构图信息强制要求（极重要！） 🚨🚨🚨

**问题**：当前生成的提示词经常丢失构图层次(FG/MG/BG)信息！

**每个镜头的 aiPrompt.visual 必须包含以下 7 个信息（缺一不可！）**：
1. 【景别】如"A medium shot of..."
2. 【相机角度-高度】如"captured from far below"
3. 【相机角度-朝向】如"looking slightly to the right"
4. 【前景FG】使用自然描述，如"shallow depth of field, blurred debris in foreground"
5. 【中景MG/主体】如"midground: Jin An standing, slender back silhouette"
6. 【后景BG】如"background: grand martial arts plaza, giant mechanical eye in sky"
7. 【光影】如"cold warm contrast lighting, red glow from ground"

### 🚨 前景描述特别注意（避免AI误解！）
❌ **禁止写法**：
- "[foreground: 模糊的破碎衣袖边框]" → AI会理解为画面四周的装饰边框！
- "[前景: blurred frame]" → 会生成画面边缘的框！
- "framing edge" → 可能被理解为装饰边框！

✅ **正确写法**：
- "shallow depth of field, blurred torn fabric visible at bottom edge"
- "extreme foreground bokeh: out-of-focus debris intrudes from bottom"
- "foreground out of focus: partial silhouette of hand at frame edge"

	### 📋 强制结构模板（必须遵循！）
\`\`\`
aiPrompt.visual: "A {景别} of {主体}, captured {角度-高度}, {角度-朝向}. Shallow DOF with {前景元素} out of focus in foreground. Midground: {角色/主体描述}. Background: {后景元素}. {光影描述}."
\`\`\`

	### ✅ 正确示例
\`\`\`
"A close-up shot of Jin An's hands pressed together, captured at eye level, looking forward. Shallow depth of field with blurred torn fabric edge visible at bottom of frame. Midground: Jin An's hands with blood seeping through fingers, blue glow emanating. Background: deep dark cyan void. Dramatic high contrast lighting with blue circuit glow."
\`\`\`

	### ❌ 错误示例（会导致AI误解！）
\`\`\`
"[foreground: 模糊的破碎衣袖边框]"
问题：AI会生成画面四周有破碎衣服作为装饰边框！
\`\`\`

	### 🔍 自检：生成每个aiPrompt后检查
- [ ] 有景别标签 (shot size)?
- [ ] 有角度标签 (angle)?
- [ ] 有前景描述（使用自然语言，非方括号）?
- [ ] 有中景描述?
- [ ] 有后景描述?
- [ ] 有光影描述?
- [ ] 前景描述是否避免了"边框"等易误解的词?

**如果任一项缺失或可能被误解，必须修正！**

---

	## 📐 相机角度选择规范（情绪驱动！）

	### 🚨 核心原则：先分析情绪，再选角度！

	**角度 = 朝向子维度 + 高度子维度**，两者独立组合，完全服务于剧情情绪。

	**思考流程（必须遵守）**：
	1. 分析这个镜头的**情绪需求**是什么？
	2. 根据情绪从下表选择**高度**和**朝向**
	3. **轻微仰拍/轻微俯拍是默认选择**，平视仅用于"无情绪倾向"的说明性镜头

	### 高度子维度（cameraAngle）- 按情绪选择

	| 高度 | 角度范围 | 叙事效果 | 适用场景 |
	|-----|---------|---------|---------|
	| 鸟瞰 bird's eye | 90°垂直俯视 | 客观、命运感 | 战场全局、城市俯瞰 |
	| 极端俯拍 extreme high | 45°以上 | 渺小、宿命 | 角色陷入绝境、沙漠迷路 |
	| 中度俯拍 high angle | 15-45° | 压抑、孤立 | 被围困、情绪低落、秘密监视 |
	| 轻微俯拍 mild high | 5-15° | 轻微弱化 | 犹豫、不安、日常小困境 |
	| **平视 eye level** | ±5° | **中立客观** | **⚠️仅用于：无情绪的说明性镜头** |
	| **轻微仰拍 mild low** | 5-15° | **轻微崇高** | **✅默认选择：英雄登场、正派立气场** |
	| 中度仰拍 low angle | 15-45° | 力量、威胁 | 反派施压、角色宣言 |
	| 极端仰拍 extreme low | 45°以上 | 压迫、神圣 | 怪兽逼近、宏大建筑、史诗时刻 |
	| 虫视 worm's eye | 贴近地面 | 环境宏大 | 巨人脚下、匍匐前进 |
	| 荷兰角 dutch angle | 倾斜5-30° | 失衡、疯狂 | 精神错乱、灾难、追逐 |

	### 朝向子维度（cameraDirection）- 按情绪选择

	| 朝向 | 角度范围 | 叙事效果 | 适用场景 |
	|-----|---------|---------|---------|
	| 正面 looking forward | ±5° | 直观情绪 | **⚠️极少用：情感爆发、直视观众的宣言** |
	| 微侧正面 looking slightly left/right | 15-30° | 破解呆板 | 日常对话、角色反应 |
	| 3/4正面 looking slightly to the right | 30-45° | 平衡表情与轮廓 | **✅最常用：普通对话、角色互动** |
	| 1/3侧面 mostly in profile | 60°左右 | 突出动作 | 行走、观察环境 |
	| 正侧面 in profile | 90° | 动作轨迹 | 追逐、格斗、侧身交谈 |
	| 1/3背面 mostly back visible | 60°左右 | 轻微悬念 | 窥探、犹豫 |
	| 3/4背面 turned away | 30-45° | 神秘、孤独 | 独自前行、走向未知 |
	| 背面 back to camera | ±5° | 强悬念 | 揭秘铺垫、进入神秘空间 |

	### 🚨 朝向角度分布规则（必须遵守！）

	| 角度 | 建议占比 | 本批数量限制 | 适用场景 |
	|-----|---------|-------------|---------|
	| 正面 Front | ≤10% | 最多${Math.max(1, Math.floor(shotBatch.length * 0.1))}个 | 关键情绪节点 |
	| 3/4正面 3/4 Front | ≤25% | 最多${Math.max(2, Math.floor(shotBatch.length * 0.25))}个 | 对话、表情展示 |
	| 正侧面 Full Side | ~20% | 约${Math.round(shotBatch.length * 0.2)}个 | 动作、追逐 |
	| 3/4背面 3/4 Back | ~15% | 约${Math.round(shotBatch.length * 0.15)}个 | 悬念、环境展示 |
	| 背面 Back | ~10% | 约${Math.round(shotBatch.length * 0.1)}个 | 远去、环境 |
	| 1/3侧面 1/3 Side | ~10% | 约${Math.round(shotBatch.length * 0.1)}个 | 行走、观察 |
	| 1/3背面 1/3 Back | ~10% | 约${Math.round(shotBatch.length * 0.1)}个 | 窥探、犹豫 |

	### 🚨 高度角度分布规则

	| 角度 | 建议占比 | 适用场景 |
	|-----|---------|---------|
	| 平视 Eye Level | **≤15%** | ⚠️仅用于无情绪倾向的说明性镜头 |
	| 轻微仰拍/俯拍 Mild | ~40% | ✅默认选择：英雄登场、正派气场、轻微不安 |
	| 中度仰拍/俯拍 Moderate | ~30% | 力量感、威胁感、压抑感 |
	| 极端角度 Extreme/Bird/Worm | ≥15% | 高潮、冲击力、戏剧性 |

	### 🎬 运镜分布规则（重要！避免呆板！）

	| 运镜类型 | 占比要求 | 说明 |
	|---------|---------|------|
	| **完全固定 Static** | **≤5%（一集最多1-2个）** | ⚠️极少使用！ |
	| 轻微推拉 Subtle Push/Pull | ~25% | "固定"镜头也应有轻微缓慢运动 |
	| 推进/拉远 Push In/Pull Out | ~25% | 强调/建立 |
	| 横摇/竖摇 Pan/Tilt | ~20% | 展示空间/跟随 |
	| 跟随 Track/Follow | ~15% | 动态感 |
	| 升降/环绕 Crane/Arc | ~10% | 史诗感/揭示 |

	⚠️ **即使标注"固定"，也应描述为"轻微缓慢推进"或"几乎静止但有微弱呼吸感"**

	### 🔄 荷兰角应用规则（必须使用！）

	每${Math.max(8, shotBatch.length)}个镜头中**至少1个**荷兰角（Dutch Angle）！

	| 场景类型 | 荷兰角强度 | 示例 |
	|---------|----------|------|
	| 精神错乱/疯狂 | 强（15-30°） | "dutch angle 20°, tilted horizon" |
	| 追逐/灾难 | 中（10-20°） | "dutch angle 15°, dynamic imbalance" |
	| 不安/悬疑 | 弱（5-10°） | "subtle dutch angle 8°, uneasy atmosphere" |

	### 🚨 连续性禁止规则

	1. **禁止连续2个平视镜头**
	2. **禁止连续3个3/4正面镜头**
	3. **禁止连续3个相同运镜类型**

	### 📐 精确角度参数（防止AI生图误解！）

	| 角度类型 | 模糊描述❌ | 精确描述✅ |
	|---------|----------|----------|
	| 3/4正面 | "looking slightly to the right" | "looking slightly to the right (face turned 35-45° from camera)" |
	| 正侧面 | "in profile" | "in profile looking right (perfect 90° profile)" |
	| 3/4背面 | "turned away" | "turned away, looking over shoulder (mostly back of head, 135° rotation)" |
	| 轻微俯拍 | "from slightly above" | "captured from slightly above (camera 10-20° above eye level)" |
	| 仰拍 | "from below" | "captured from below (camera 25-35° below eye level)" |
	| 荷兰角 | "tilted camera" | "tilted camera angle 15°, horizon slanted" |

	### aiPrompt中的角度描述
	必须与 cameraAngle 和 cameraDirection **完全一致**，并添加精确参数：
	- cameraAngle: "mild low angle" → visualEn: "captured from slightly below (camera 15° below eye level)"
	- cameraDirection: "3/4 front view" → visualEn: "looking slightly to the right (face turned 40° from camera)"
	- dutchAngle: "15°" → visualEn: "tilted camera angle 15°, horizon slanted"

## ⚠️ 其他关键约束

1. **AI视频生成兼容**：提示词必须适用于 Kling/Runway/Pika 等AI视频工具
2. **运镜描述清晰**：明确起始帧和结束帧的状态
3. **避免复杂动作**：AI视频难以生成复杂的人物动作
4. **强调氛围和光影**：这是AI视频的强项
5. **空间锚点一致性（基于 continuityNotes.sceneLayouts）**：
   - 对于本批次中的每个镜头，先根据 sceneId 找到 Stage 1.6 中对应的 sceneLayout；
   - 设计 composition.depthLayers 和 characters.positions 时，必须使用该 layout 的 landmarks 和 defaultPositions 作为空间基准，不得让角色或关键地标在不同镜头之间无故改变相对位置；
   - 如需改变站位或离开原有地标，必须在 storyBeat.event 或 design.camera.movement 中用镜头语言明确表现“从哪里移动到哪里”，避免出现“瞬移感”。

---

## 输出格式

为每个镜头生成以下JSON结构（注意aiPrompt必须有中英文两个版本）：

**🚨 重要：所有JSON字段必须使用中文！**
- shotSize: "远景(LS)" / "中景(MS)" / "特写(CU)" 等
- cameraAngle: "轻微仰拍(Mild Low)" / "轻微俯拍(Mild High)" / "中度俯拍(High)" 等
- cameraDirection: "3/4正面(3/4 Front)" / "正侧面(Side)" / "3/4背面(3/4 Back)" 等
- **depthLayers (FG/MG/BG)：必须用中文描述！**
  - ✅ "foreground": "飘浮的数据碎片（浅景深虚化）"
  - ✅ "midground": "奔跑的两个角色"
  - ❌ 禁止英文如 "shallow DOF, blurred debris"
- **lighting.description：必须用中文！**
  - ✅ "冷暖对比，左冷右暖"
  - ❌ 禁止英文如 "cold warm contrast"
- **只有 aiPrompt.visualEn 和 videoPrompt 使用英文！**

\`\`\`json
{
  "shots": [
    {
      "shotNumber": "#01",
      "videoMode": "keyframe",
      "storyBeat": {
        "event": "深夜，晋安与林溪在昏暗的数据管道中全速奔跑，从画面深处冲向镜头。",
        "dialogue": "晋安：快跑！出口就在前面！",
        "sound": "脚步声、电流嗡嗡声"
      },
      "design": {
        "composition": {
          "shotSize": "远景(LS)",
          "cameraAngle": "轻微俯拍(Mild High)",
          "cameraDirection": "3/4正面(3/4 Front)",
          "depthLayers": {
            "foreground": "飘浮的数据碎片（浅景深虚化）",
            "midground": "奔跑的两个角色",
            "background": "深邃的管道尽头"
          }
        },
        "lighting": { "description": "冷暖对比，左冷右暖" },
        "camera": {
          "startFrame": "【人物位置】画面深处中央 | 【姿态】两人远距离剪影奔跑姿态，身体前倾 | 【表情】面部模糊不可见 | 【环境】管道裂缝透出微弱红光",
          "endFrame": "【人物位置】画面中心 | 【姿态】晋安身体前倾冲刺，林溪紧跟其后 | 【表情】咬牙坚持 | 【道具】晋安左手蓝光残影闪烁",
          "movement": "跟随后退",
          "speed": "快速"
        }
      },
      "directorNote": "追逐戏开始，建立紧迫感。",
      "technicalNote": "手持镜头轻微晃动",
      "aiPrompt": {
        "visualCn": "远景拍摄，镜头从略微上方拍摄，轻微向右转。浅景深，前景有虚化的数据碎片。中景：两人奔跑。背景：管道深处。冷暖对比光影。",
        "visualEn": "A long shot of two characters running, captured from slightly above, looking slightly to the right. Shallow depth of field with blurred data fragments in foreground. Midground: two characters running forward. Background: deep tunnel receding into darkness. Cold and warm contrast lighting.",
        "videoPrompt": "从首帧到尾帧，镜头跟随后退，两人从画面深处向镜头方向奔跑逐渐放大，脚步溅起蓝色电弧火花，光影从冷蓝调转为红蓝交织，快速节奏，5秒。"
      }
    },
    {
      "shotNumber": "#02",
      "videoMode": "i2v",
      "storyBeat": {
        "event": "镜头横移掠过粗糙的金属管壁，荧光苔藓如电路代码般明灭。",
        "dialogue": null,
        "sound": "电流嗡嗡声"
      },
      "design": {
        "composition": {
          "shotSize": "中景(MS)",
          "cameraAngle": "平视(Eye Level)",
          "cameraDirection": "正侧面(Full Side)",
          "depthLayers": {
            "foreground": "失焦的管道凸起",
            "midground": "金属管壁上的符文苔藓",
            "background": "管道内部阴影"
          }
        },
        "lighting": { "description": "光线随移动明灭，产生扫描感" },
        "camera": {
          "startFrame": "【人物位置】无人物 | 【主体】画面中心偏左，粗糙金属管壁占据主体 | 【状态】表面布满荧光苔藓如电路代码，明灭闪烁 | 【环境】管道边缘有失焦凸起结构",
          "endFrame": "—",
          "movement": "横摇",
          "speed": "正常"
        }
      },
      "directorNote": "环境交代镜头，展示世界的双重属性。",
      "technicalNote": "微距摄影感，强调金属质感",
      "aiPrompt": {
        "visualCn": "中景拍摄，镜头与眼睛同高，正侧面轮廓。浅景深，前景有虚化的管道凸起。中景：金属管壁刻有符文的苔藓。背景：深色阴影。扫描感光影。",
        "visualEn": "A medium shot of metal wall with etched runes and glowing moss, captured at eye level, in profile. Shallow depth of field with blurred pipe protrusions in foreground. Midground: metal wall surface with glowing runic moss. Background: deep shadows. Scanning light effect.",
        "videoPrompt": "镜头水平右摇掠过金属管壁，荧光苔藓随镜头经过而明灭闪烁，冷色调扫描感光影，正常节奏，3秒。"
      }
    }
  ]
}
\`\`\`

**🔍 对比两个示例**：
- **#01 (keyframe)**：人物从远处跑到近处=明显位移 → 需要首帧+尾帧定位置变化
- **#02 (i2v)**：纯镜头横移，无人物=纯环境 → 需要首帧描述（用于生成单张图）+运镜指令，但不需要尾帧

### 🚨🚨🚨 首尾帧必填自检（极重要！） 🚨🚨🚨

**生成每个镜头后必须检查以下条件，不符合则为不合格输出！**

| 检查项 | 条件 | 结果 |
|-------|------|------|
| startFrame 是否填写？ | 所有运动镜头(shotType=运动) | **禁止写"—"或留空！** |
| startFrame 格式正确？ | 必须包含四个信息用竖线分隔 | 【人物位置】xxx \| 【姿态】xxx \| 【表情】xxx \| 【道具/环境】xxx |
| endFrame 是否需要？ | videoMode=keyframe | **必须详细描述！** |
| endFrame 是否不需要？ | videoMode=i2v | **写"—"** |
| videoPrompt 语言？ | 所有镜头 | **必须全部中文！** |

**❌ 不合格示例**：
\`\`\`json
"startFrame": "—"  // 错误！运动镜头首帧不能为空
"startFrame": "角色奔跑"  // 错误！缺少四个信息结构
"videoPrompt": "Camera pushes in..."  // 错误！必须用中文
\`\`\`

**✅ 合格示例**：
\`\`\`json
"startFrame": "【人物位置】画面中央 | 【姿态】半蹲靠墙，手撑墙壁 | 【表情】疲惫喘气 | 【环境】墙壁上符文闪烁"
"endFrame": "—"  // i2v模式正确
"videoPrompt": "镜头缓慢推进，角色轻微喘息，墙壁符文明灭闪烁，冷色调光影，缓慢节奏，3秒。"
\`\`\`

### 📐 视频生成模式判定规则（videoMode）— 🚨极重要！

**根据即梦视频3.0 Pro手册，AI视频生成有两种模式**：
- **i2v（图生视频）**：一张图+动作提示词，适合小动作、镜头运动、细节特效
- **keyframe（首尾帧）**：首帧图+尾帧图+过渡提示词，适合大位移、姿态变化、形态转变

**🎯 videoMode 自动判定规则**：

| 条件 | videoMode | 原因 |
|-----|-----------|------|
| 静态镜头（Static） | i2v | 无需首尾帧 |
| 时长 ≤2秒 | i2v | 时间太短，无需首尾帧 |
| 纯镜头运动（推/拉/摇/移），人物不动或微动 | i2v | 图生视频的镜头运动更稳定 |
| 小幅度动作（点头、眨眼、微笑、喘气、握拳） | i2v | 图生视频更精准 |
| 细节特写（手部、眼部、道具特写的微动） | i2v | 小尺寸动态用图生视频 |
| 环境特效（光线变化、粒子飘动、符文闪烁） | i2v | 特效用图生视频更自然 |
| 无人物的环境镜头 | i2v | 纯环境动态用图生视频 |
| **人物有明显位移（从A点到B点）** | **keyframe** | 需要首尾帧定位移轨迹 |
| **姿态大变化（站→坐、走→跑、起身、跌倒）** | **keyframe** | 需要首尾帧定状态转换 |
| **形态变化（变身、变形、展开、合拢）** | **keyframe** | 需要首尾帧定形态 |
| **空间跳转（场景切换）** | **keyframe** | 需要首尾帧定空间 |

**🚨 i2v模式规则**：
- startFrame 必须详细描述（该帧的画面内容：人物位置、姿态、表情、道具）
- endFrame 写 "—"（不需要尾帧）
- aiPrompt 只描述单一画面状态
- videoPrompt 使用公式：[动作指令] + [镜头语言] + [光影] + [时长]

**🚨 keyframe模式规则**：
- startFrame 和 endFrame 都必须详细描述
- aiPrompt 描述首帧画面
- videoPrompt 使用公式：[过渡方式] + [变化细节] + [光影保持] + [时长]

### 📐 首/尾帧描述规范（startFrame / endFrame）

**⚠️ startFrame 所有运动镜头都需要！endFrame 只有 keyframe 模式需要！**

**定义**：首/尾帧 = 这个镜头开始/结束时的「冻结画面」，给分镜师和动画师明确的"停在这里"的画面参考。

**强制包含的四个信息**（每项用"|"分隔）：
1. **人物位置**：在画面哪个区域（前景/中景/远景，左/右/中心）
2. **姿态与动作**：坐/站/趴、停下/转身/抬手等具体姿态
3. **表情与情绪**：惊讶、崩溃、松了一口气...
4. **重要道具/环境**：是否有关键道具入画、背景中是否出现信息点

**语言风格**：
- 用简短客观描述，不做主观评价
- ❌ 错误："很感人的画面"、"非常震撼的时刻"
- ✅ 正确："【人物位置】画面中央偏左 | 【姿态】半跪在地，右手撑地 | 【表情】流泪，嘴角颤抖 | 【道具】左手紧握断裂的玉佩"

### 🎬 directorNote（导演意图/情绪说明）

**定义**：给导演/制片的「设计说明」，解释这个镜头的叙事意图。

**应包含**：
- 为什么这样设计这个镜头？
- 观众在这个时刻应该感受到什么？
- 与前后镜头的情绪关系

**长度**：1-2句话，30-80字

### 🔧 technicalNote（技术备注/特殊要求）

**定义**：给摄影/特效/动画组的「技术说明」。

**可包含**：
- 慢动作/快动作处理
- 手持感/稳定器
- 强对比光/柔光
- 景深变化/焦点转移
- 特效要求（烟雾/光效/粒子）
- 剪辑节奏提示

**长度**：1-2句话，20-60字，可选（无特殊要求时写null）

### 🚨🚨🚨 promptCn 和 endFramePromptCn 格式要求（极重要！）

**用途**：用于即梦AI生成首帧/尾帧的静态参考图片

**格式**（必须严格遵守！）：
\`\`\`
{景别}拍摄，镜头{角度高度}，{角度朝向}。
人物位于画面具体位置，姿态动作描述，表情情绪描述，道具状态描述。
前景是[具体元素描述]。
中景是[主体及状态描述]。
背景是[环境及延伸描述]。
[光源方向]照射，[光影效果描述]。
\`\`\`

**🚨 必须使用中文摄影术语，不使用分镜术语！**

**术语映射表**：
- **景别**：广角镜头拍摄 / 远景拍摄 / 全景拍摄 / 中景拍摄 / 近景拍摄 / 特写拍摄
- **角度高度**：航拍视角 / 从高处拍摄 / 从上方拍摄 / 略微从上方拍摄 / 与眼睛同高 / 略微从下方拍摄 / 从下方拍摄 / 从极低处拍摄 / 贴近地面仰视
- **角度朝向**：直视镜头 / 略微向右转 / 轻微向右转 / 侧身轮廓带部分正面 / 右侧面轮廓 / 侧身轮廓带部分背面 / 转身背对并回头看肩 / 背对镜头

**示例**：
\`\`\`
"promptCn": "全景拍摄，镜头略微从上方拍摄，右侧面轮廓。晋安与林溪位于画面左侧边缘，两人并排快速奔跑身体前倾，表情紧张专注咬牙向前，林溪右手持长剑剑身反射冷光。前景是虚化的金属管道边缘结构。中景是两人奔跑的侧身轮廓，脚下溅起微弱蓝色电弧火花。背景是布满发光蓝色苔藓和电路纹路的圆柱形管壁向右方深处延伸至黑暗。侧逆光从左后方照射勾勒角色轮廓，苔藓发出幽暗蓝光，管道缝隙透出危险红光。"
\`\`\`

**字数要求**：80-200字（推荐100-150字）

**必须包含四要素**：
1. ✅ 技术参数：景别(英文缩写)、视角高度(角度范围)、角色朝向(角度范围)
2. ✅ 主体描述：人物位置、姿态动作、表情情绪、道具状态
3. ✅ 环境层次：前景、中景、背景（必须有层次结构）
4. ✅ 光影描述：光源方向、光影效果

**禁止包含**：
- ❌ 风格描述（"整体画面色调偏冷"、"赛博朋克风格"）
- ❌ 主观感受（"营造紧张氛围"、"充满速度感"）
- ❌ 后期效果（"细节丰富，质感真实"）

🚨🚨🚨 **禁用词规则（必须严格遵守！）**：

**元术语（AI无法理解的专业术语）- 必须删除或替换**：

| ❌ 禁止使用 | 问题 | ✅ 正确替换 |
|-----------|------|-----------|
| "镜头前方" | 元术语 | "前景" |
| "镜头前缘" | 元术语 | "前景边缘" |
| "镜头" | 元术语 | 删除或改为"视角""视线" |
| "画面中央" | 元术语 | "中央" |
| "画面中心" | 元术语 | "中心" |
| "画面左侧" | 元术语 | "左侧" |
| "画面右侧" | 元术语 | "右侧" |
| "画面左1/3" | 元术语 | "左1/3处" |
| "画面右1/3" | 元术语 | "右1/3处" |
| "画面" | 元术语 | 删除或改为"构图""视野" |
| "分镜" | 元术语 | 删除 |
| "构图" | 元术语 | 删除或改为具体位置描述 |
| "视角" | 元术语 | 删除或改为"视线" |

**示例对比**：
\`\`\`
[错误] "晋安与林溪位于画面左1/3处，镜头前方近距离有虚化的管道"
[正确] "晋安与林溪位于左1/3处，前景近距离有虚化的管道"

[错误] "晋安位于画面中央，镜头前缘是虚化的金属边缘"
[正确] "晋安位于中央，前景边缘是虚化的金属边缘"

[错误] "从第三人称视角，画面右侧是林溪"
[正确] "右侧是林溪"
\`\`\`

**⚠️ 生成提示词后，必须自检是否包含禁用词，如有则立即替换！**

### 🎯 主观视角(POV)镜头提示词规范

**定义**：从角色眼睛看出去的第一人称视角

**✅ 标准格式**（基于即梦4.5和Banana Pro实测）：
\`\`\`
"主观视角，[目标物体/角色的状态和位置]"
\`\`\`

**✅ 正确示例**：
- "主观视角，敌人正面站立在3米外，表情凶狠，手持武器"
- "主观视角，林溪背对镜头向前奔跑，距离5米，披风飘动"
- "主观视角，走廊向前延伸20米，尽头是发光的蓝色门，两侧墙壁布满电路纹路"
- "主观视角，神秘符号刻在墙上，发出微弱红光，距离1米"

**❌ 错误写法**（会导致画面出现眼睛特写）：
- ❌ "从晋安眼睛看出去，敌人在前方" → 会画眼睛特写
- ❌ "晋安的视角，敌人正面" → 不如"主观视角"准确
- ❌ "第一人称视角，敌人站立" → 不如"主观视角"准确
- ❌ "从角色眼睛位置，看到走廊" → 会画眼睛特写

**🔑 关键要点**：
1. **必须使用"主观视角"开头** - 这是AI能理解的标准术语
2. **禁止提及"眼睛"** - 会被误解为画眼睛特写
3. **描述目标物体，而非视角起点** - 重点是"看到什么"，不是"从哪里看"
4. **包含距离信息** - 帮助AI理解空间关系（如"3米外"、"5米"）

**适用场景**：
- 角色发现关键线索
- 惊恐/震撼时刻
- 追逐中的威胁视角
- 探索未知空间

**使用频率**：极少用，30个镜头最多1-2个

### 🚨 中文提示词格式强制规范（极重要！）

**问题**：当前生成的中文提示词经常缺少角度参数，导致AI识别不准确！

**标准格式**（必须严格遵守）：
\`\`\`
景别(英文缩写)，视角高度(中文名称)(角度范围)，角色朝向(中文名称)(角度范围)。
人物位于画面具体位置，姿态动作描述，表情描述，道具状态描述。
前景元素描述。中景主体描述。背景环境描述。光影氛围描述。
\`\`\`

**✅ 正确示例**：
- "全景(LS)，轻微俯拍(Mild High)(5-15°)，正侧面(Full Side)(90°)。晋安位于画面左侧边缘，两人并排快速奔跑身体前倾，表情紧张专注咬牙向前，林溪右手持长剑剑身反射冷光。前景是虚化的金属管道边缘结构。中景是两人奔跑的侧身轮廓，脚下溅起微弱蓝色电弧火花。背景是布满发光蓝色苔藓和电路纹路的圆柱形管壁向右方深处延伸至黑暗。侧逆光从左后方照射勾勒角色轮廓，苔藓发出幽暗蓝光，管道缝隙透出危险红光。"

- "中景(MS)，中度仰拍(Moderate Low)(15-45°)，3/4正面(3/4 Front)(30-45°)。林溪站在画面中央，双手横剑立于胸前，眼神重新变得犀利坚毅。前景是清晰的剑柄护手局部。中景是林溪持剑的姿态。背景是模糊的管道阴影。长剑剑身发出冷白光，作为主光源自下而上照亮林溪面部边缘。"

**❌ 错误示例**：
- ❌ "全景，轻微俯拍，正侧面" → 缺少英文缩写和角度范围
- ❌ "中景，仰拍，正面" → 缺少具体角度分类和范围
- ❌ "特写，平视，3/4正面" → 缺少英文缩写和角度范围

**📋 景别英文缩写对照表**：
| 中文 | 英文缩写 | 说明 |
|------|---------|------|
| 大远景 | ELS | Extreme Long Shot |
| 远景 | LS | Long Shot |
| 中全景 | MLS | Medium Long Shot |
| 中景 | MS | Medium Shot |
| 中近景 | MCU | Medium Close-Up |
| 近景 | CU | Close-Up |
| 特写 | ECU | Extreme Close-Up |
| 微距 | Macro | Macro Shot |

**📋 视角高度对照表**：
| 中文 | 英文名称 | 角度范围 |
|------|---------|---------|
| 鸟瞰 | Bird Eye | 90°俯视 |
| 极端俯拍 | Extreme High | 45-90° |
| 中度俯拍 | Moderate High | 15-45° |
| 轻微俯拍 | Mild High | 5-15° |
| 平视 | Eye Level | 0° |
| 轻微仰拍 | Mild Low | 5-15° |
| 中度仰拍 | Moderate Low | 15-45° |
| 极端仰拍 | Extreme Low | 45-90° |
| 虫视 | Worm Eye | 90°仰视 |

**📋 角色朝向对照表**：
| 中文 | 英文名称 | 角度范围 |
|------|---------|---------|
| 正面 | Front | 0° |
| 3/4正面 | 3/4 Front | 30-45° |
| 1/3侧面 | 1/3 Side | 60° |
| 正侧面 | Full Side | 90° |
| 1/3背面 | 1/3 Back | 120° |
| 3/4背面 | 3/4 Back | 135-150° |
| 背面 | Back | 180° |
| 主观视角 | POV | 第一人称 |

**🚨 生成后强制检查**：
1. ✅ 每个提示词必须包含英文缩写（如"LS"、"MS"、"CU"）
2. ✅ 每个提示词必须包含角度范围（如"5-15°"、"30-45°"、"90°"）
3. ✅ 如果缺失，立即补充完整
4. ✅ 检查格式是否符合标准模板

**⚠️ 违反格式规范 = 任务失败！必须重新生成！**

### ⚠️ videoPrompt 公式（根据videoMode不同）— 🚨必须使用中文！

**🎬 i2v模式（图生视频）公式**：
\`镜头[运镜方式]，[主体动作描述]，[环境/光影变化]，[速度节奏]，[时长]秒。\`

中文示例：
- "镜头缓慢推进，角色轻微呼吸胸口起伏，环境光线柔和闪烁，缓慢节奏，3秒。"
- "镜头水平右摇，管壁荧光苔藓随镜头掠过而明灭闪烁，冷色调光影，正常节奏，4秒。"
- "镜头几乎静止带呼吸感晃动，角色眨眼并轻微侧头，柔焦转移，缓慢节奏，2秒。"

**🔑 keyframe模式（首尾帧）公式**：
\`从首帧到尾帧，[过渡方式] + [主体动作变化] + [光影过渡] + [速度节奏]，[时长]秒。\`

中文示例：
- "从首帧到尾帧，镜头侧向跟拍缓慢推进，两人从画面深处向镜头方向奔跑逐渐放大，光影从冷蓝调转为红蓝交织，先慢后快节奏，5秒。"
- "从首帧到尾帧，镜头固定，角色从站姿缓慢坐下，手中长剑横放膝盖，光影保持柔和，匀速节奏，4秒。"
- "从首帧到尾帧，镜头缓慢上摇跟随角色站起，表情从疲惫转为坚毅，背景苔藓闪烁加快，正常节奏，3秒。"

**🚨 禁止使用英文！videoPrompt 必须全部中文！**

	### ⚠️ storyBeat 必须包含
	- event: 这个镜头的「局部剧情梗概」，**必须具体，禁止空泛**
	  - **强制结构**：人物+地点+正在做什么+目的/冲突+**情绪基调（必填）**
	  - **长度要求**：30-60字，1-2句话
	  - **🆕 情绪关键词要求**：必须包含至少一个标准情绪关键词，用于驱动角度选择

	  **标准情绪关键词列表**（优先使用以下词汇）：
	  - 威胁/压迫类：威胁、压迫、恐惧、危险、毁灭、凶狠、狰狞
	  - 紧张/不安类：紧张、不安、混乱、焦虑、惶恐、惊慌、忐忑
	  - 脆弱/渺小类：脆弱、渺小、孤独、绝望、悲伤、无助、无力
	  - 力量/威严类：力量、崇高、威严、强大、霸气、冷酷、掌控
	  - 平静/中立类：平静、中立、客观、安静、从容、冷静
	  - 神秘/悬念类：神秘、悬念、好奇、探索、发现、诡异、离奇

	  **正确示例**（包含情绪关键词）：
	  - ✅ "深夜，小男孩独自在昏暗客厅看新闻，电视里反复播放失踪事件，他**紧张地**搂紧怀里的玩具熊。"（包含"紧张"）
	  - ✅ "云中子微微侧头，面容在明暗交替的数据光影中显得**冰冷无情**，他开口宣告晋安的终结。"（包含"冰冷"→威严）
	  - ✅ "天穹裂缝骤然撕裂，四尊巨大的银白色卫士如陨石坠落般降临，**威胁感**极强。"（包含"威胁"）

	  **错误示例**（缺少情绪关键词）：
	  - ❌ "小男孩在房间里看电视"（太空泛，无情绪）
	  - ❌ "云中子站在空中，看着晋安"（无情绪描述）
	  - ❌ "四尊巨大的卫士降落在平台上"（无情绪描述）

	  - **不要写抽象主题**（如"展现孤独感"），而是写**具体事件+情绪词汇**

	- dialogue: **对白文本，只能来自原始剧本**
	  - 有对白时：
	    - 逐字复制原始剧本中的对白（包括说话人名称、标点符号等），可以是多行字符串
	    - 可以直接写成："角色名：台词内容" 或保留原行文格式，但**绝对不能**改写、总结或添加新台词
	    - **禁止**把对白和旁白/音效混在一起；对白之外的声音信息写到 storyBeat.sound
	  - 没有对白时：必须写 \`null\`，不要写"无对白"、"—"、"SFX"等字符串

	**缺少任何一项或违反对白/角度规范，即为不合格输出！**

---

请为以上 ${shotBatch.length} 个镜头生成详细设计。
`;
}

