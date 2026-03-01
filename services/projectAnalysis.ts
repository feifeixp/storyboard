/**
 * 项目分析服务
 * 使用AI批量分析多集剧本，提取世界观、角色、场景、剧情大纲
 * 参考：《启示录/山海经》深度分析格式
 *
 * 🆕 v2: 支持分批分析（20集一批），实时显示进度
 */

import {
  ScriptFile,
  ProjectAnalysisResult,
  BatchAnalysisProgress,
  KeyTerm,
  SceneRef,
  EpisodeSummary,
  CharacterState,
  StoryVolume,
  Antagonist
} from '../types/project';
import { CharacterRef, CharacterForm } from '../types';
import { getLLMChatCompletionsURL } from './openrouter';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const BATCH_SIZE = 20;  // 每批分析20集

/**
 * 分析多集剧本，提取项目级信息
 * 采用深度分析格式，支持角色多形态、分卷结构、BOSS档案
 *
 * @param scripts 剧本文件列表
 * @param model AI模型
 * @param knownCharacters 已知角色名列表（来自预扫描或前批次）
 * @param knownScenes 已知场景名列表（来自预扫描或前批次）
 * @param mode 提取模式：quick(快速) | standard(标准) | deep(深度)
 */
export async function analyzeProjectScripts(
  scripts: ScriptFile[],
  model: string = DEFAULT_MODEL,
  knownCharacters: string[] = [],
  knownScenes: string[] = [],
  mode: 'quick' | 'standard' | 'deep' = 'standard'
): Promise<ProjectAnalysisResult> {
  // 合并所有剧本内容（取样分析，避免token超限）
  // 🔧 v3修复：增加每集取样长度，确保信息提取完整
  // Gemini 2.0 Flash 支持 1M token，可以使用更大的上下文
  const totalScripts = scripts.length;
  let maxPerScript: number;
  if (totalScripts > 50) {
    maxPerScript = 2500;  // 50集以上：每集2500字（原1200字太少）
  } else if (totalScripts > 20) {
    maxPerScript = 4000;  // 20-50集：每集4000字（原2000字太少）
  } else if (totalScripts > 10) {
    maxPerScript = 6000;  // 10-20集：每集6000字（原3500字）
  } else {
    maxPerScript = 8000;  // 10集以下：每集8000字（原5000字）
  }

  // 计算当前批次的集数范围
  // 调试：打印每个脚本的集数信息
  console.log('[ProjectAnalysis] 脚本集数列表:', scripts.map(s => ({ fileName: s.fileName?.slice(0, 15), epNum: s.episodeNumber })));

  const episodeNumbers = scripts.map(s => s.episodeNumber).filter((n): n is number => n !== undefined && n !== null);
  console.log('[ProjectAnalysis] 提取到的集数:', episodeNumbers);

  const minEp = episodeNumbers.length > 0 ? Math.min(...episodeNumbers) : 1;
  const maxEp = episodeNumbers.length > 0 ? Math.max(...episodeNumbers) : scripts.length;
  const episodeRangeInfo = `第${minEp}集至第${maxEp}集（共${totalScripts}集）`;

  const combinedContent = scripts.map((s, idx) => {
    // 确保每集标题使用正确的集数
    const epNum = s.episodeNumber ?? (minEp + idx);
    return `=== 第${epNum}集 ===\n${s.content.slice(0, maxPerScript)}`;
  }).join('\n\n');

  console.log(`[ProjectAnalysis] 分析${episodeRangeInfo}，每集取样${maxPerScript}字`);

  // 🆕 v5: 如果有已知角色/场景列表，添加到提示词中
  const knownCharactersSection = knownCharacters.length > 0
    ? `\n## 🔔 预扫描发现的角色名（必须全部包含在分析结果中！）\n以下角色在剧本中被发现，请确保全部出现在 characters 数组中：\n${knownCharacters.map(n => `- ${n}`).join('\n')}\n`
    : '';

  const knownScenesSection = knownScenes.length > 0
    ? `\n## 🔔🔔🔔 预扫描发现的场景名（🔴 必须全部包含！）\n**⚠️ 超级重要：以下 ${knownScenes.length} 个场景在剧本中被发现，你必须确保全部出现在 scenes 数组中！**\n**不要遗漏任何一个场景，即使你认为它不重要！**\n${knownScenes.map(n => `- ${n}`).join('\n')}\n`
    : '';

  // 🆕 根据模式生成不同的提取要求
  const modeConfig = {
    quick: {
      title: '快速分析模式',
      description: '仅提取基础信息，跳过详细内容',
      characterDetail: '只提取角色名、性别、基础外观（50字以内）',
      skipForms: true,
      skipAbilities: true,
      skipQuote: true,
      skipIdentityEvolution: true,
      sceneDetail: '只提取场景名称和基础描述（50字以内）',
    },
    standard: {
      title: '标准分析模式',
      description: '提取完整基础信息 + 多形态 + 经典台词',
      characterDetail: '提取基础信息 + 多形态图鉴 + 经典台词',
      skipForms: false,
      skipAbilities: true,
      skipQuote: false,
      skipIdentityEvolution: false,
      sceneDetail: '提取场景名称和详细描述（80-150字）',
    },
    deep: {
      title: '深度分析模式',
      description: '提取全部信息，包括能力进化、关系网络',
      characterDetail: '提取全部信息（基础 + 多形态 + 能力 + 台词 + 关系）',
      skipForms: false,
      skipAbilities: false,
      skipQuote: false,
      skipIdentityEvolution: false,
      sceneDetail: '提取场景名称和超详细描述（100-200字）',
    },
  };

  const currentMode = modeConfig[mode];

  const prompt = `
# 任务：${currentMode.title} - 生成项目档案

📢 **当前分析的剧本范围：${episodeRangeInfo}**
📊 **提取模式：${currentMode.title}** - ${currentMode.description}
${knownCharactersSection}${knownScenesSection}
你是一位资深影视策划，需要从剧本中提取完整的项目信息，用于后续分镜制作。

## ⚠️ 关键要求（必读！）

### 0. 世界观与项目类型（🔴 必须详细填写！）
- **worldView 字段必须详细描述故事的世界观设定**（100-300字）：
  - 时代背景：故事发生在什么时代/世界？（如：近未来、平行世界、古代、虚拟世界）
  - 核心设定：世界的核心规则是什么？（如：异能存在、AI觉醒、修仙体系）
  - 社会结构：世界的权力结构、主要势力、社会形态
  - 特殊元素：独特的科技/魔法/能力体系
  - ❌ 错误示范："这是一个科幻故事"（太简单）
  - ✅ 正确示范："近未来世界，AI主脑'十二星宫'统治着人类，所有人类都是NPC，被算法预测命运。主角晋安发现自己是唯一拥有自主意识的BUG，开始反抗系统的统治..."
- **genre 字段必须识别项目的具体类型**，包括：
  - **媒体形式**：短剧、长剧、动画、电影、网剧、广播剧等
  - **题材类型**：仙侠、科幻、现代、奇幻、悬疑、言情、玄幻、都市、穿越等
- 格式示例：
  - "都市短剧"、"仙侠动画"、"科幻长剧"、"奇幻电影"、"现代悬疑网剧"
- 根据剧本结构判断：
  - 每集1-3分钟 → 短剧
  - 每集10-20分钟 → 动画
  - 每集40-60分钟 → 长剧/电视剧
  - 单集完整故事 → 电影

### 1. 角色分析（最重要！🔴 必须完整提取）
- **⚠️ 必须识别本批次剧本中出现的所有有名字的角色！**
  - 主角、配角、反派、路人角色，只要在剧本中有名字或称呼就要记录
  - 仔细阅读每一集的对话和描写，提取所有角色
  - 如果一个角色只在一集中出现一次，也要记录
  - 常见遗漏：反派手下、群众角色、家人、老师、NPC等
- **📊 当前模式要求：${currentMode.characterDetail}**
${currentMode.skipForms ? '- ⚠️ **快速模式：跳过多形态提取**，只记录角色的默认外观' : '- **🎭 多形态/换装图鉴（核心中的核心！🔴 必须细致提取！）**：'}
${currentMode.skipForms ? '' : `  - **⚠️ 形态识别清单**（遇到以下情况必须创建新形态）：
    1. 服装/造型变化：换装、战损、伪装、制服切换
    2. 身体状态变化：受伤、觉醒、义体化、半兽化、数据化
    3. 环境适应变化：不同世界的装束（废土、蒸汽朋克、武侠等）
    4. 能力觉醒表现：眼睛发光、身体发光、符文显现、形态变异
    5. 特殊状态：濒死、被控制、伪装身份、梦境中的形象
  - 例如一个主角在80集中可能有**10-15个形态**：
    - 日常校服形态、战损形态、换装形态、觉醒形态、不同世界的伪装形态等`}
${currentMode.skipForms ? '' : '- **🎭 多形态/换装图鉴（核心中的核心！🔴 必须细致提取！）**：'}
  - **⚠️ 形态识别清单**（遇到以下情况必须创建新形态）：
    1. 服装/造型变化：换装、战损、伪装、制服切换
    2. 身体状态变化：受伤、觉醒、义体化、半兽化、数据化
    3. 环境适应变化：不同世界的装束（废土、蒸汽朋克、武侠等）
    4. 能力觉醒表现：眼睛发光、身体发光、符文显现、形态变异
    5. 特殊状态：濒死、被控制、伪装身份、梦境中的形象
  - 例如一个主角在80集中可能有**10-15个形态**：
    - 日常校服形态、战损形态、换装形态、觉醒形态、不同世界的伪装形态等
${currentMode.skipForms ? '' : `  - **每个形态必须包含**：
    1. **name**: 形态名称（带emoji），如"🎒 高中校服"、"🤖 类人尖兵"、"🔥 焚衣半裸"
    2. **episodeRange**: ⚠️ **必须精确标注该形态在哪些集出现**
       - **只能使用本次分析的剧本范围内的集数**：${episodeRangeInfo}
       - 仔细阅读剧本，找出该形态**实际首次出现和最后出现**的集数
       - 格式示例："Ep ${minEp}"（仅在该集出现）、"Ep ${minEp}-${maxEp}"（持续出现）
    3. **description**: ⚠️ **必须使用以下三段式格式**（100-150字）：
       \`\`\`
       【外貌特征】发型发色、眼睛颜色形状、五官特点、表情气质、身形体态、肤色
       【主体人物】画风定位（如：日系动漫风格、二次元少年、写实青年等）+ 角色类型
       【服饰造型】上装（款式、颜色、材质）+ 下装 + 鞋子 + 配饰（如有）
       \`\`\`
    4. **note**: 备注，说明这个形态的情境或意义（如：觉醒后、伪装状态、战损等）
    5. **visualPromptCn/En**: 中英文视觉提示词
  - **形态示例（完整换装图鉴参考）**：
    | 形态 | 集数 | 详细描述 | 备注 |
    |------|------|----------|------|
    | 🎒 高中校服 | Ep 1-20 | 【外貌】浅棕短发...【主体】日系少年...【服饰】蓝白校服+书包 | 伪装期，日常 |
    | 🔥 焚衣半裸 | Ep 20 | 【外貌】同上但眼神坚毅...【服饰】赤裸上身，火光映照 | 销毁血衣场景 |
    | 🌫️ 废土流浪 | Ep 27 | 【服饰】沾满油污的休闲装 | 穿越初期狼狈状态 |
    | 🤖 类人尖兵 | Ep 32-36 | 【外貌】面部金属化...【服饰】全覆式流线型机甲 | 机甲寄宿形态 |
    | ✨ 神性素体 | Ep 46 | 【外貌】皮肤苍白，血管流淌金色算力 | 神性重构后 |`}
${currentMode.skipQuote ? '- ⚠️ **快速模式：跳过经典台词提取**' : '- **角色经典台词**：提取最能代表角色性格的一句话'}
${currentMode.skipIdentityEvolution ? '- ⚠️ **快速模式：跳过身份演变提取**' : '- **身份演变**：用箭头连接，如"高中生 ➔ 觉醒者 ➔ 救世主"'}
- **外观描述（appearance）**：⚠️ **${mode === 'quick' ? '简要描述（50字以内）' : '使用三段式格式'}**，描述角色的默认/基础外观
${currentMode.skipAbilities ? '- ⚠️ **当前模式跳过能力进化提取**' : '- **能力进化（abilities）**：记录角色能力的成长轨迹'}

### 2. 场景分析（🔴 必须完整提取，纯环境设计不包含人物！）
- **⚠️ 重要说明：Scene XX｜主题名 是分镜小节标题，不是场景名！**
  - **真正的场景**是指剧情发生的**地点/环境**，需要从"画面"描述中提取
  - 例如：
    - ❌ 错误："突破天穹"、"硬闯决断"（这些是Scene标题，不是地点）
    - ✅ 正确："环形都市上空"、"叹息之墙"、"月球背面表面"、"深渊底层回收站"
- **⚠️ 关键要求：从画面描述中提取所有独特地点/环境！**
  - 仔细阅读每个Scene下的"画面"部分，识别剧情发生的地点
  - 相同地点但不同时间/状态的场景也要分别记录（如"教室-白天"和"教室-夜晚"）
  - 必须提取所有独特场景：学校、家、战斗场地、异世界、过渡空间、街道、车内、月面、虚拟空间等
- **⚠️ 场景数量要求：必须提取所有独特地点，不要遗漏！**
  - 如果预扫描提供了场景列表，必须全部包含
  - 每集通常有3-8个不同地点，${scripts.length}集剧本可能有${Math.floor(scripts.length * 1.5)}-${scripts.length * 3}+个场景
  - 宁可多提取，不要遗漏
- **🔴🔴🔴 超级重要：场景描述绝对不能包含人物！这是场景设定图！**
  - ❌ 严禁出现："晋安站在..."、"林溪靠墙..."、"晋安喘气"、"远处传来..."等人物描写
  - ❌ 严禁出现：任何角色名字、人物动作、人物状态、角色对话
  - ❌ 错误示范："暗灰色数据排污管道...晋安靠墙喘气左手半透明蓝色符文闪烁"
  - ✅ 正确做法：只描述建筑、空间、物件、光影、材质、氛围
  - ✅ 正确示范："暗灰色数据排污管道，管壁密密麻麻的微光符号，荧光苔藓散发冷光，积水反射金属管道轮廓，暗灰压抑科技感"
- **每个场景必须包含以下详细信息**：
  1. **description**: 场景的纯环境设计描述（80-150字），必须包含：
     - **前景**：最靠近镜头的物体或元素（如：落地窗框架、路灯、树枝、栏杆）
     - **中景**：主要空间区域的描述（如：宽敞的走廊、课桌椅排列整齐、林间小路）
     - **后景/远景**：背景延伸的空间感（如：远处可见操场、窗外城市天际线、山峦轮廓）
     - **光影设计**：光源位置、投射方向、阴影分布
     - **色调氛围**：整体色调倾向（暖调、冷调、对比色等）
     - ❌ **禁止**：任何人物描写、角色动作、人物位置
  2. **visualPromptCn**: 中文视觉提示词（80-120字），纯环境元素：
     - 建筑/空间结构描述
     - 光影氛围（如：昏暗的灯光、刺眼的阳光、幽蓝的月色）
     - 材质细节（如：斑驳的墙壁、光滑的金属地面、潮湿的石板）
     - 特征物件（如：堆叠的课桌、闪烁的全息屏幕、枯萎的树木）
     - ❌ **禁止**：人物、角色、人物动作
  3. **visualPromptEn**: 英文视觉提示词（与中文对应，80-120字），同样不含人物
  4. **atmosphere**: 氛围关键词（如：日常平静、紧张压抑、科技冷酷）
  5. **appearsInEpisodes**: 出现在哪些集数（使用实际集数，如 [${minEp}, ${minEp + 1}]）
- 示例（纯环境描述）：
  | 场景名 | description |
  |--------|-------------|
  | 废弃工厂 | 【前景】破碎的玻璃窗框斜插地面，锋利边缘反射微光；【中景】锈迹斑斑的传送带和倾倒的工业设备散落各处，地面积水反射天花板破洞；【后景】巨大的锅炉轮廓在烟尘中若隐若现。昏黄斜阳从顶部破洞穿入形成光柱，整体冷灰色调带锈红点缀 |
  | 泥沼竹林 | 【前景】倒伏的竹竿半没入泥水，青苔覆盖的石头零星分布；【中景】密集的竹林在雾气中若隐若现，地面泥泞积水；【后景】远处山峦轮廓模糊，雾气弥漫。冷调青灰色，潮湿阴冷的氛围 |

### 3. 剧情分析（🔴 每集概要必须详细准确！）
- **每集概要（必须！）**：
  - ⚠️ **严格按照剧本中的集数标注输出**，本次分析的剧集为：${episodeNumbers.join(', ')}
  - **episodeNumber 必须与剧本标注完全一致**，不要自己编号！
  - **title**: 本集标题（5-15字），概括本集核心内容，如"世界观崩塌"、"铸剑阶段"、"机甲觉醒"
  - **summary**: 剧情概要（⚠️ 必须 50-100 字），必须包含：
    - **谁**：本集主要出场的角色
    - **做了什么**：核心事件、行动
    - **结果如何**：剧情推进、状态变化
    - ❌ 错误示范："晋安继续探索" （太简单、没有具体内容）
    - ✅ 正确示范："晋安在废弃工厂发现陈瑶变成的寄生兽，首次使用管理员权限'删除指令'消灭敌人，但林溪对他产生怀疑"
- **分卷结构**：如有明显的篇章划分（如第一卷、第二章），识别出来
- **角色状态追踪 characterStates**：记录每集中主要角色的**具体状态变化**
  - stateDescription 必须具体，如"首次觉醒管理员能力"、"受重伤昏迷"、"义体过热濒死"

### 4. 专有名词
- 提取所有独特术语并解释，如：异能名称、地点名称、组织名称等

## 📖 剧本内容（共${scripts.length}集）
${combinedContent}

## 输出要求（JSON格式）
\`\`\`json
{
  "worldView": "近未来都市世界，AI主脑'十二星宫'统治着表面秩序井然的社会，但实际上所有人类都是被命运算法预定的NPC。主角晋安是系统中唯一的BUG——一个本不应该存在的'真实人类'。他拥有破坏系统规则的能力，可以看到普通人看不到的'代码层'，并逐渐觉醒了'管理员权限'。世界分为真实层和虚拟层，寄生兽是被污染的数据具象化的产物，机甲类人尖兵是AI的执行者。故事围绕晋安如何在系统追杀下生存、觉醒、最终与AI主脑对抗展开。",
  "genre": "科幻都市短剧",
  "visualStyle": "日系赛博朋克+科技感",
  "keyTerms": [{ "term": "术语", "explanation": "解释" }],
  "volumes": [{ "volumeNumber": 1, "title": "卷标题", "episodeRange": [1, 20], "coreConflict": "核心冲突", "keyPlots": ["剧情1"], "color": "#22c55e" }],

  "characters": [
    {
      "name": "晋安",
      "gender": "男",
      "quote": "我是病毒，是Bug，也是爱你的幽灵",
      "identityEvolution": "高中生 ➔ 觉醒NPC ➔ 机甲驾驶员 ➔ 救世主",
      "abilities": ["管理员面板", "义体超频", "底层修改"],
      "appearance": "【外貌特征】浅棕色碎短发、发型蓬松有层次感、深棕色狭长眼眸、五官清爽利落、表情平静略带清冷感、身形高挑纤瘦、肤色白皙、少年感体态\\n【主体人物】日系动漫风格年轻男性（高中生形象）、二次元少年、清瘦修长的身形、简约干净的气质\\n【服饰造型】默认形态见forms数组",
      "forms": [
        {
          "name": "🎒 日常休闲",
          "episodeRange": "Ep 1-20",
          "description": "【外貌特征】浅棕色碎短发、发型蓬松有层次感、深棕色狭长眼眸、五官清爽利落、表情平静略带清冷感、身形高挑纤瘦、肤色白皙、少年感体态\\n【主体人物】日系动漫风格年轻男性（高中生形象）、二次元少年、清瘦修长的身形、简约干净的气质\\n【服饰造型】纯白色圆领短袖T恤（版型宽松有自然褶皱）、黑色修身长裤（简约休闲款）、黑白拼色运动鞋（款式轻便日常）、休闲日常风穿搭",
          "note": "日常状态，伪装期",
          "visualPromptCn": "日系动漫风格少年，浅棕色蓬松碎短发，深棕色狭长眼眸，五官清爽利落，表情平静清冷，身形高挑纤瘦，肤色白皙，穿白色宽松圆领T恤，黑色修身长裤，黑白运动鞋",
          "visualPromptEn": "anime style young male, light brown fluffy short hair, deep brown narrow eyes, clean sharp features, calm expression, tall slender figure, fair skin, loose white t-shirt, black slim pants, black-white sneakers"
        },
        {
          "name": "🔥 焚衣形态",
          "episodeRange": "Ep 20",
          "description": "【外貌特征】浅棕短发凌乱，眼神凌厉，五官轮廓更深刻，表情冷峻，上身赤裸露出纤细肌肉线条\\n【主体人物】日系动漫风格年轻男性，气质从少年转为冷酷\\n【服饰造型】赤裸上身，仅穿黑色长裤，赤足",
          "note": "转折点，第一次展现冷峻一面",
          "visualPromptCn": "日系动漫风格少年，浅棕短发凌乱，深棕眼眸透出凌厉，五官深刻冷峻，赤裸上身展现纤细肌肉线条，仅穿黑色长裤，赤足，火光映照在皮肤上",
          "visualPromptEn": "anime style young male, messy light brown hair, piercing deep brown eyes, sharp cold features, bare upper body showing lean muscles, only black pants, barefoot, firelight on skin"
        }
      ]
    }
  ],

  "antagonists": [{ "name": "AI主脑", "volumeOrArc": "机械篇", "formDescription": "巨大黑色光球", "outcome": "被净化" }],

  "scenes": [
    {
      "name": "教室",
      "description": "【前景】木质窗框和半拉的蓝色窗帘，窗台放着盆栽；【中景】六排浅蓝色课桌椅整齐排列，过道宽敞明亮；【后景】黑板上残留粉笔字迹，黑板上方挂着时钟。午后阳光从左侧斜照进来，在地面投下格子窗影，整体暖黄色调，尘埃在光线中漂浮",
      "visualPromptCn": "阳光透过半拉窗帘斜照入室，浅蓝色课桌椅整齐排列六排，黑板上残留着粉笔字迹，窗边绿植微微摇曳，空气中浮动着细微尘埃，地面反射柔和光泽，墙壁贴着学习标语",
      "visualPromptEn": "sunlight streaming through half-drawn curtains, six rows of light blue desks neatly arranged, chalk marks on blackboard, potted plants by window, dust particles floating in air, floor reflecting soft light, study posters on walls",
      "atmosphere": "日常平静",
      "appearsInEpisodes": [${minEp},${minEp + 1}]
    },
    {
      "name": "废弃工厂",
      "description": "【前景】破碎的玻璃窗框斜插地面，锋利边缘反射微光；【中景】锈迹斑斑的传送带和倾倒的工业设备散落各处，地面积水反射天花板的破洞；【后景】巨大的锅炉轮廓在烟尘中若隐若现，远处墙壁坍塌露出外面的荒地。昏黄斜阳从顶部破洞穿入形成光柱，整体冷灰色调带锈红点缀",
      "visualPromptCn": "锈迹斑斑的钢梁交错，破碎玻璃窗透入昏黄斜阳形成光柱，地面散落生锈机械零件和碎玻璃，积水倒映天花板破洞，墙壁爬满藤蔓，蜘蛛网挂在角落，远处锅炉若隐若现",
      "visualPromptEn": "rusty steel beams crossing, broken windows with dim yellow sunlight forming light shafts, scattered rusty machinery and glass shards on floor, puddles reflecting ceiling holes, vines on walls, cobwebs in corners, distant boiler silhouette in dust",
      "atmosphere": "荒废颓废",
      "appearsInEpisodes": [${minEp + 2}]
    }
  ],

  "episodeSummaries": [
    {
      "episodeNumber": ${minEp},
      "title": "世界观崩塌",
      "summary": "晋安在废弃工厂发现陈瑶变成的寄生兽，首次使用管理员权限'删除指令'消灭敌人，但林溪对他产生怀疑，两人关系出现裂痕",
      "characterStates": [
        { "characterName": "晋安", "stateDescription": "首次觉醒管理员能力，精神受到冲击" },
        { "characterName": "林溪", "stateDescription": "目睹晋安异能，开始怀疑其身份" }
      ]
    },
    {
      "episodeNumber": ${minEp + 1},
      "title": "铸剑阶段",
      "summary": "晋安在铁匠铺学习锻造技术，与老铁匠建立师徒关系，同时发现自己的能力可以影响物质结构，为后续战斗做准备",
      "characterStates": [
        { "characterName": "晋安", "stateDescription": "学习锻造，发现新能力" }
      ]
    }
  ]
}
\`\`\`

## ⚠️ 严格要求（必须遵守！）

### 🚨 最重要：完整提取，不要遗漏！
- **角色**：本批剧本中出现的所有有名字的角色都要提取！不只是主角！
- **场景**：每个Scene都要单独提取！如果剧本有Scene 1-30，就要有30个场景！
- **概要**：每集都要有50-100字的详细概要！不是一句话！
- **形态**：角色有换装/变形就必须记录！

### 1. episodeSummaries 必须与剧本集数完全匹配
   - 本次分析的剧集为：${episodeNumbers.join(', ')}（共${scripts.length}集）
   - **episodeNumber 必须使用剧本中的实际集数**，不要从1开始编号！
   - 例如：如果剧本是第21-30集，那么 episodeNumber 就是 21, 22, 23... 不是 1, 2, 3

### 2. forms 数组的 episodeRange（关键！）
   - ⚠️ **必须使用本次剧本的实际集数范围：${episodeNumbers.join(', ')}**
   - ❌ 错误示范：本次分析第21-40集，但forms写"Ep 1-20"或"Ep 1-4"
   - ✅ 正确做法：如果角色形态在本批剧本的第21-25集出现，就写"Ep 21-25"
   - **description 必须详细**：30-50字，包含服装细节、颜色、特征物品、状态描述
   - 没有变装的角色forms可以为空数组

### 3. scenes 的视觉提示词（重要！）
   - **visualPromptCn/En 必须详细**：50-80字，不能只写"明亮教室，课桌整齐"
   - 必须包含：光影氛围、材质细节、特征物件、空间结构
   - ⚠️ **不要包含人物描写**，纯环境描述
   - 这些提示词将直接用于AI生图，细节越丰富生图效果越好

### 4. 输出格式
   - **只输出JSON**，不要任何其他文字
   - **JSON必须完整**，不要省略或用...代替
`;

  // 🔧 v7修复：增加客户端超时控制（180秒），避免因后端网关超时导致504无响应挂起
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(getLLMChatCompletionsURL(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER1_API_KEY}`,
        'HTTP-Referer': window.location.origin,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        // 🔧 v7修复：max_tokens 统一降为 8192，避免生成过长导致 ALB 网关 504 超时
        // 原 32000 需要 2-3 分钟生成，超过后端网关超时限制
        // 8192 token 对于角色/场景/剧集概要提取已完全足够
        max_tokens: 8192,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 402) {
        throw new Error('API余额不足，请检查OpenRouter账户余额或使用跳过分析功能');
      }
      if (response.status === 401) {
        throw new Error('API Key无效，请检查VITE_OPENROUTER1_API_KEY配置');
      }
      throw new Error(`API请求失败: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                      content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[分析] 无法匹配JSON，原始内容:', content.substring(0, 500));
      throw new Error('无法解析AI返回的JSON');
    }

    let jsonStr = jsonMatch[1] || jsonMatch[0];

    // 尝试修复常见的JSON错误
    const result = parseJsonWithFixes(jsonStr);

    // 调试日志
    console.log('[分析] 解析成功，episodeSummaries数量:', result.episodeSummaries?.length || 0);
    if (result.episodeSummaries?.length > 0) {
      console.log('[分析] 前3集示例:', result.episodeSummaries.slice(0, 3));
    }

    // 转换为标准格式（场景由AI智能分析，不使用正则提取）
    const normalizedResult = normalizeAnalysisResult(result, scripts);

    return normalizedResult;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('项目分析超时（90秒），请减少批次大小或重试');
    } else {
      console.error('项目分析失败:', error);
    }
    // 🔧 v7修复：返回默认结果时，传递预扫描的角色和场景
    const preScanResult = knownCharacters.length > 0 || knownScenes.length > 0
      ? { characterNames: knownCharacters, sceneNames: knownScenes }
      : undefined;
    return createDefaultAnalysisResult(scripts, preScanResult);
  }
}

/**
 * 尝试解析JSON，自动修复常见错误
 */
function parseJsonWithFixes(jsonStr: string): any {
  // 第一次尝试：直接解析
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.log('JSON解析失败，尝试修复...');
  }

  // 修复1：移除尾部逗号
  let fixed = jsonStr.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(fixed);
  } catch (e) {}

  // 修复2：修复未闭合的字符串（在换行符处）
  fixed = fixed.replace(/:\s*"([^"]*)\n/g, ': "$1",\n');
  try {
    return JSON.parse(fixed);
  } catch (e) {}

  // 修复3：截断到最后一个有效的闭合括号
  const lastBrace = fixed.lastIndexOf('}');
  if (lastBrace > 0) {
    let truncated = fixed.substring(0, lastBrace + 1);
    // 确保括号平衡
    const openBraces = (truncated.match(/\{/g) || []).length;
    const closeBraces = (truncated.match(/\}/g) || []).length;
    const openBrackets = (truncated.match(/\[/g) || []).length;
    const closeBrackets = (truncated.match(/\]/g) || []).length;

    // 添加缺失的闭合括号
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      truncated += ']';
    }
    for (let i = 0; i < openBraces - closeBraces; i++) {
      truncated += '}';
    }

    try {
      return JSON.parse(truncated);
    } catch (e) {}
  }

  // 修复4：提取部分有效数据
  const partialResult: any = {};

  // 提取 worldView
  const worldViewMatch = jsonStr.match(/"worldView"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
  if (worldViewMatch) {
    partialResult.worldView = worldViewMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  // 提取 genre
  const genreMatch = jsonStr.match(/"genre"\s*:\s*"([^"]*)"/);
  if (genreMatch) {
    partialResult.genre = genreMatch[1];
  }

  // 提取 visualStyle
  const styleMatch = jsonStr.match(/"visualStyle"\s*:\s*"([^"]*)"/);
  if (styleMatch) {
    partialResult.visualStyle = styleMatch[1];
  }

  // 提取角色数组（🔧 v5增强：尽可能保留更多信息）
  const charsMatch = jsonStr.match(/"characters"\s*:\s*\[([\s\S]*?)\](?=\s*[,}])/);
  if (charsMatch) {
    try {
      // 尝试修复角色数组
      let charsStr = '[' + charsMatch[1] + ']';
      charsStr = charsStr.replace(/,\s*\]/g, ']');
      partialResult.characters = JSON.parse(charsStr);
    } catch (e) {
      // 🔧 v5增强：逐个提取角色对象，尽可能保留更多字段
      console.log('[JSON修复] 角色数组解析失败，尝试逐个提取...');
      const charObjects: any[] = [];
      // 匹配每个角色对象 {...}
      const charObjMatches = charsMatch[1].matchAll(/\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g);
      for (const objMatch of charObjMatches) {
        try {
          const charObj = JSON.parse('{' + objMatch[1] + '}');
          if (charObj.name) charObjects.push(charObj);
        } catch {
          // 无法解析完整对象，提取关键字段
          const nameMatch = objMatch[1].match(/"name"\s*:\s*"([^"]*)"/);
          const genderMatch = objMatch[1].match(/"gender"\s*:\s*"([^"]*)"/);
          const appearanceMatch = objMatch[1].match(/"appearance"\s*:\s*"([^"]*)"/);
          if (nameMatch) {
            charObjects.push({
              name: nameMatch[1],
              gender: genderMatch?.[1] || '未知',
              appearance: appearanceMatch?.[1] || '',
            });
          }
        }
      }
      if (charObjects.length > 0) {
        partialResult.characters = charObjects;
        console.log(`[JSON修复] 成功提取 ${charObjects.length} 个角色`);
      } else {
        // 最后回退：只提取名字
        const charMatches = charsMatch[1].matchAll(/"name"\s*:\s*"([^"]*)"/g);
        partialResult.characters = Array.from(charMatches).map(m => ({ name: m[1] }));
      }
    }
  }

  // 提取场景数组（🔧 v5增强：尽可能保留更多信息）
  const scenesMatch = jsonStr.match(/"scenes"\s*:\s*\[([\s\S]*?)\](?=\s*[,}])/);
  if (scenesMatch) {
    try {
      let scenesStr = '[' + scenesMatch[1] + ']';
      scenesStr = scenesStr.replace(/,\s*\]/g, ']');
      partialResult.scenes = JSON.parse(scenesStr);
    } catch (e) {
      // 🔧 v5增强：逐个提取场景对象
      console.log('[JSON修复] 场景数组解析失败，尝试逐个提取...');
      const sceneObjects: any[] = [];
      const sceneObjMatches = scenesMatch[1].matchAll(/\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g);
      for (const objMatch of sceneObjMatches) {
        try {
          const sceneObj = JSON.parse('{' + objMatch[1] + '}');
          if (sceneObj.name) sceneObjects.push(sceneObj);
        } catch {
          const nameMatch = objMatch[1].match(/"name"\s*:\s*"([^"]*)"/);
          const descMatch = objMatch[1].match(/"description"\s*:\s*"([^"]*)"/);
          const promptCnMatch = objMatch[1].match(/"visualPromptCn"\s*:\s*"([^"]*)"/);
          if (nameMatch) {
            sceneObjects.push({
              name: nameMatch[1],
              description: descMatch?.[1] || '',
              visualPromptCn: promptCnMatch?.[1] || '',
            });
          }
        }
      }
      if (sceneObjects.length > 0) {
        partialResult.scenes = sceneObjects;
        console.log(`[JSON修复] 成功提取 ${sceneObjects.length} 个场景`);
      } else {
        const sceneMatches = scenesMatch[1].matchAll(/"name"\s*:\s*"([^"]*)"/g);
        partialResult.scenes = Array.from(sceneMatches).map(m => ({ name: m[1] }));
      }
    }
  }

  if (Object.keys(partialResult).length > 0) {
    console.log('使用部分提取的数据:', partialResult);
    return partialResult;
  }

  throw new Error('无法修复JSON格式');
}

/**
 * 标准化分析结果
 * 支持角色多形态、分卷结构、BOSS档案
 */
function normalizeAnalysisResult(
  raw: any,
  scripts: ScriptFile[]
): ProjectAnalysisResult {
  // 处理角色（包含多形态）
  const characters: CharacterRef[] = (raw.characters || []).map((c: any, i: number) => {
    // 处理角色形态
    const forms: CharacterForm[] = (c.forms || []).map((f: any, j: number) => ({
      id: `form-${Date.now()}-${i}-${j}`,
      name: f.name || `形态${j + 1}`,
      episodeRange: f.episodeRange || '',
      description: f.description || '',
      note: f.note || '',
      visualPromptCn: f.visualPromptCn || '',
      visualPromptEn: f.visualPromptEn || '',
    }));

    return {
      id: `char-${Date.now()}-${i}`,
      name: c.name || '未命名',
      gender: c.gender || '未知',
      appearance: c.appearance || '',
      quote: c.quote || '',
      identityEvolution: c.identityEvolution || '',
      abilities: c.abilities || [],
      forms: forms.length > 0 ? forms : undefined,
    };
  });

  // 处理场景
  const scenes: SceneRef[] = (raw.scenes || []).map((s: any, i: number) => ({
    id: `scene-${Date.now()}-${i}`,
    name: s.name || '未命名场景',
    description: s.description || '',
    visualPromptCn: s.visualPromptCn || '',
    visualPromptEn: s.visualPromptEn || '',
    atmosphere: s.atmosphere || '',
    appearsInEpisodes: s.appearsInEpisodes || [],
  }));

  // 处理分卷
  const volumes: StoryVolume[] = (raw.volumes || []).map((v: any, i: number) => ({
    id: `vol-${Date.now()}-${i}`,
    volumeNumber: v.volumeNumber || i + 1,
    title: v.title || `第${i + 1}卷`,
    episodeRange: v.episodeRange || [1, 20],
    coreConflict: v.coreConflict || '',
    keyPlots: v.keyPlots || [],
    color: v.color || ['#22c55e', '#3b82f6', '#eab308', '#f97316', '#ef4444', '#8b5cf6'][i % 6],
  }));

  // 处理反派/BOSS
  const antagonists: Antagonist[] = (raw.antagonists || []).map((a: any, i: number) => ({
    id: `boss-${Date.now()}-${i}`,
    name: a.name || '未命名BOSS',
    volumeOrArc: a.volumeOrArc || '',
    formDescription: a.formDescription || '',
    outcome: a.outcome || '',
  }));

  // 处理剧集概要 - 多重匹配策略
  const rawEpisodes = raw.episodeSummaries || [];
  console.log('[分析] 原始episodeSummaries数量:', rawEpisodes.length);
  console.log('[分析] AI返回的集数列表:', rawEpisodes.map((e: any) => e.episodeNumber));
  console.log('[分析] 脚本中期望的集数列表:', scripts.map(s => s.episodeNumber));

  // 检查概要是否有效的辅助函数
  const isValidSummary = (summary: string | undefined): boolean => {
    if (!summary) return false;
    const trimmed = summary.trim();
    const invalidPatterns = ['待分析', '待定', '(待定)', '...', '待填写', '无', '暂无', 'TBD', '略'];
    return trimmed.length > 5 &&
           !invalidPatterns.some(p => trimmed === p || trimmed.startsWith(p));
  };

  const episodeSummaries: EpisodeSummary[] = scripts.map((script, i) => {
    const targetEp = script.episodeNumber || i + 1;

    // 多重匹配策略：
    // 1. 精确匹配 episodeNumber（支持数字和字符串）
    let rawEp = rawEpisodes.find(
      (e: any) => Number(e.episodeNumber) === Number(targetEp)
    );

    // 2. 如果精确匹配失败，尝试从标题中提取集数匹配
    if (!rawEp) {
      rawEp = rawEpisodes.find((e: any) => {
        const titleMatch = e.title?.match(/第(\d+)[集话]/);
        return titleMatch && Number(titleMatch[1]) === Number(targetEp);
      });
    }

    // 3. 尝试从 summary 中匹配含有集数的（备用）
    if (!rawEp) {
      rawEp = rawEpisodes.find((e: any) => {
        const summaryMatch = e.summary?.match(/第(\d+)[集话]/);
        return summaryMatch && Number(summaryMatch[1]) === Number(targetEp);
      });
    }

    // 4. 如果以上都失败，使用索引回退
    if (!rawEp && rawEpisodes[i]) {
      rawEp = rawEpisodes[i];
    }

    // 5. 如果当前匹配的概要无效，尝试从剧本开头自动提取
    let finalSummary = isValidSummary(rawEp?.summary) ? rawEp.summary : '';

    // 6. 回退策略：从剧本内容提取前100字作为概要
    if (!finalSummary && script.content) {
      const cleanContent = script.content
        .replace(/[=\-#*\[\]]/g, '')
        .replace(/第\d+集/g, '')
        .trim()
        .slice(0, 100);
      if (cleanContent.length > 20) {
        finalSummary = cleanContent + '...';
      }
    }

    if (!finalSummary) {
      finalSummary = '待分析';
    }

    let finalTitle = rawEp?.title || `第${targetEp}集`;
    // 清理标题中的占位符
    if (finalTitle === '...' || finalTitle.startsWith('第') && finalTitle.endsWith('集')) {
      finalTitle = `第${targetEp}集`;
    }
    let finalCharStates = rawEp?.characterStates || [];

    return {
      episodeNumber: targetEp,
      title: finalTitle,
      summary: finalSummary,
      characterStates: (finalCharStates).map((cs: any) => ({
        characterId: cs.characterId || '',
        characterName: cs.characterName || '',
        stateDescription: cs.stateDescription || '',
        location: cs.location || '',
      })),
    };
  });

  return {
    worldView: raw.worldView || '',
    genre: raw.genre || '',
    visualStyle: raw.visualStyle || '',
    keyTerms: (raw.keyTerms || []).map((t: any) => ({
      term: t.term || '',
      explanation: t.explanation || '',
    })),
    characters,
    scenes,
    volumes,
    antagonists,
    episodeSummaries,
  };
}

/**
 * 创建默认分析结果（分析失败时使用）
 * 🔧 v7修复：API失败时使用预扫描结果，而不是返回空数据
 */
function createDefaultAnalysisResult(
  scripts: ScriptFile[],
  preScanResult?: { characterNames: string[]; sceneNames: string[] }
): ProjectAnalysisResult {
  // 🔧 如果有预扫描结果，使用预扫描的角色和场景
  const characters = preScanResult?.characterNames.map(name => ({
    name,
    description: '（正则提取，待AI分析）',
    personality: '',
    appearance: '',
    relationships: [],
  })) || [];

  const scenes = preScanResult?.sceneNames.map(name => ({
    name,
    description: '（正则提取，待AI分析）',
    atmosphere: '',
    keyProps: [],
  })) || [];

  console.log(`[默认结果] 使用预扫描数据 - 角色: ${characters.length}个, 场景: ${scenes.length}个`);

  // 🔧 修复：为角色和场景添加必需的 id 字段
  const charactersWithId = characters.map((char, index) => ({
    id: `C${index + 1}`,
    ...char,
    visualPromptCn: char.appearance || '',
    visualPromptEn: '',
    appearsInEpisodes: [],
  }));

  const scenesWithId = scenes.map((scene, index) => ({
    id: `S${index + 1}`,
    ...scene,
    visualPromptCn: scene.description || '',
    visualPromptEn: '',
    appearsInEpisodes: [],
  }));

  return {
    worldView: '未能自动识别世界观，请手动填写',
    genre: '',
    visualStyle: '',
    keyTerms: [],
    characters: charactersWithId,
    scenes: scenesWithId,
    volumes: [],
    antagonists: [],
    episodeSummaries: scripts.map((s, i) => ({
      episodeNumber: s.episodeNumber || i + 1,
      title: `第${s.episodeNumber || i + 1}集`,
      summary: '待分析',
      characterStates: [],
    })),
  };
}

/**
 * 🆕 v6新增：使用正则表达式快速提取角色名（不依赖AI）
 *
 * 注意：Scene XX｜主题名 不是场景，是分镜小节标题
 * 真正的场景需要从剧情内容中提取（如"月球背面"、"办公室"等地点描述）
 */
export function regexPreScanScripts(scripts: ScriptFile[]): { characterNames: string[]; sceneNames: string[] } {
  console.log(`[正则预扫描] 开始扫描 ${scripts.length} 集剧本...`);

  const sceneNames = new Set<string>();
  const characterNames = new Set<string>();

  // 🔧 v6改进：角色提取正则（对话格式很规范，正则可靠）
  const characterPatterns = [
    // 标准对话格式：晋安：对话内容 / 林溪喘息：对话 / 林溪低声：
    // 匹配 "角色名" + 可选的状态词 + 冒号
    /^([^\s:：【】()（）"""\n]{2,4})(?:喘息|大喊|低声|沉声|笑道|叹息|怒道|冷道|惊道|急道|严肃|内心低语|惊恐|沙哑)?[：:]/gm,
    /^「([^\s」]{2,8})」/gm,                         // 「林溪」说
    /^([^\s]{2,4})说[：:]/gm,                         // 某某说：
    // 剧本格式：角色名（状态）
    /^([^\s]{2,4})（[^）]+）$/gm,                     // 独孤云（惊恐）
  ];

  for (const script of scripts) {
    const content = script.content;

    // 提取角色名
    for (const pattern of characterPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const charName = match[1].trim();
        // 过滤掉常见的非角色名词
        const excludeWords = [
          // 剧本结构词
          '画面', '台词', '音效', 'BGM', '音乐', '旁白', '字幕', '特效', '转场', '淡入', '淡出',
          '黑屏', '白屏', '闪回', '备注', '说明', '描述', '场景', '地点', '时间', '注', '注意',
          '提示', '标题', 'Scene', 'scene', 'SCENE', '分镜', '镜头',
          // 常见动词/描述词（可能被误匹配）
          '两人', '三人', '众人', '对方', '此时', '然后', '接着', '随后', '同时', '突然',
          '环形', '头顶', '远处', '近处', '前方', '后方', '左侧', '右侧', '上方', '下方',
          '紫色', '黑色', '白色', '红色', '金色', '灰色', '蓝色', '绿色',
          // 数字开头
          '第一', '第二', '第三', '第四', '第五',
        ];
        // 检查是否是纯数字或以数字开头
        const isNumeric = /^\d/.test(charName) || /^[一二三四五六七八九十]/.test(charName);
        if (charName && charName.length >= 2 && charName.length <= 6 && !excludeWords.includes(charName) && !isNumeric) {
          characterNames.add(charName);
        }
      }
    }
  }

  console.log(`[正则预扫描] 提取到 ${characterNames.size} 个角色名：${Array.from(characterNames).slice(0, 10).join('、')}...`);
  console.log(`[正则预扫描] 场景名将由AI从画面描述中智能提取`);

  return {
    sceneNames: [],  // 🔧 v6：场景名不再用正则提取，交给AI从画面描述中理解
    characterNames: Array.from(characterNames),
  };
}

/**
 * 🆕 v5新增：预扫描剧本，快速提取所有角色名和场景名
 * v6改进：先用正则提取，再用AI补充
 */
async function preScanScripts(
  scripts: ScriptFile[],
  model: string = DEFAULT_MODEL
): Promise<{ characterNames: string[]; sceneNames: string[] }> {
  console.log(`[预扫描] 开始快速扫描 ${scripts.length} 集剧本...`);

  // 🆕 v6：先用正则表达式提取（100%可靠）
  const regexResult = regexPreScanScripts(scripts);

  // 🔧 v7改进：每集取更多内容（5000字），确保覆盖足够的画面描述
  const combinedContent = scripts.map((s, idx) => {
    const epNum = s.episodeNumber ?? (idx + 1);
    // 每集取5000字，确保能覆盖多个场景的画面描述
    return `=== 第${epNum}集 ===\n${s.content.slice(0, 5000)}`;
  }).join('\n\n');

  const prompt = `
# 任务：快速扫描剧本，提取所有角色名和场景地点

## 重要说明
- **Scene XX｜主题名** 是分镜小节标题，不是场景名
- **真正的场景**是指剧情发生的地点/环境，需要从"画面"描述中提取

## 要求
1. **角色名**：提取剧本中出现的所有有名字的角色（对话者、被提及者），只需要名字
2. **场景名**：从"画面"描述中提取地点/环境（如"月球背面"、"环形都市上空"、"办公室"、"深渊底层"等）

## 示例
剧本：
\`\`\`
Scene 27｜月球背面
画面
月球表面拉近。
密集的方形坑洞遍布其上，粗大缆线连接其间。
\`\`\`
应提取场景名：**月球背面**（而不是"月球背面"这个Scene标题）

## 剧本内容
${combinedContent}

## 输出格式（只输出JSON，不要其他文字）
{
  "characterNames": ["角色1", "角色2", ...],
  "sceneNames": ["月球背面", "环形都市上空", "深渊底层", ...]
}
`;

  try {
    const response = await fetch(getLLMChatCompletionsURL(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER1_API_KEY}`,
        'HTTP-Referer': window.location.origin,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,  // 低温度，更准确
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.warn('[预扫描] API请求失败，使用正则结果');
      return regexResult;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const aiResult = JSON.parse(jsonMatch[0]);
      console.log(`[预扫描] AI发现 ${aiResult.characterNames?.length || 0} 个角色名，${aiResult.sceneNames?.length || 0} 个场景名`);

      // 🆕 v6：合并正则结果和AI结果（去重）
      const mergedCharNames = [...new Set([...regexResult.characterNames, ...(aiResult.characterNames || [])])];
      const mergedSceneNames = [...new Set([...regexResult.sceneNames, ...(aiResult.sceneNames || [])])];

      console.log(`[预扫描] 合并后共 ${mergedCharNames.length} 个角色名，${mergedSceneNames.length} 个场景名`);
      return {
        characterNames: mergedCharNames,
        sceneNames: mergedSceneNames,
      };
    }
  } catch (error) {
    console.warn('[预扫描] AI解析失败，使用正则结果:', error);
  }

  // 如果AI失败，返回正则结果
  return regexResult;
}

/**
 * 🆕 分批分析多集剧本（实时进度回调）
 * 将剧本按 BATCH_SIZE 分批，逐批调用 API，实时合并结果
 *
 * 🔧 v5修复：增加预扫描机制，先快速扫描所有剧本提取角色名和场景名列表
 * 🔧 v6新增：支持提取模式选择
 */
export async function analyzeProjectScriptsWithProgress(
  scripts: ScriptFile[],
  model: string = DEFAULT_MODEL,
  onProgress?: (progress: BatchAnalysisProgress) => void,
  mode: 'quick' | 'standard' | 'deep' = 'standard'
): Promise<ProjectAnalysisResult> {
  const totalScripts = scripts.length;

  // 🆕 第一步：预扫描所有剧本，提取角色名和场景名
  let preScanResult = { characterNames: [] as string[], sceneNames: [] as string[] };
  if (totalScripts > BATCH_SIZE) {
    onProgress?.({
      currentBatch: 0,
      totalBatches: Math.ceil(totalScripts / BATCH_SIZE) + 1,
      batchEpisodeRange: '预扫描',
      partialResult: null as any,
      status: 'analyzing',
    });
    preScanResult = await preScanScripts(scripts, model);
    console.log(`[分批分析] 预扫描完成，发现角色: ${preScanResult.characterNames.join(', ')}`);
  }

  // 如果剧本数量较少，直接使用原有方法
  if (totalScripts <= BATCH_SIZE) {
    console.log(`[分批分析] 剧本数量 ${totalScripts} <= ${BATCH_SIZE}，使用单次分析（模式: ${mode}）`);
    const result = await analyzeProjectScripts(scripts, model, [], [], mode);
    onProgress?.({
      currentBatch: 1,
      totalBatches: 1,
      batchEpisodeRange: `1-${totalScripts}`,
      partialResult: result,
      status: 'complete',
    });
    return result;
  }

  // 确保每个脚本都有正确的 episodeNumber
  // 如果原始脚本没有 episodeNumber，则根据索引分配
  const scriptsWithEpisodeNumber = scripts.map((script, idx) => {
    if (script.episodeNumber !== undefined && script.episodeNumber !== null) {
      return script;
    }
    // 回退：使用索引 + 1 作为集数
    return { ...script, episodeNumber: idx + 1 };
  });

  console.log(`[分批分析] 脚本集数分配完成，前5个:`, scriptsWithEpisodeNumber.slice(0, 5).map(s => s.episodeNumber));

  // 分批
  const batches: ScriptFile[][] = [];
  for (let i = 0; i < totalScripts; i += BATCH_SIZE) {
    batches.push(scriptsWithEpisodeNumber.slice(i, i + BATCH_SIZE));
  }

  console.log(`[分批分析] 共 ${totalScripts} 集，分成 ${batches.length} 批，每批 ${BATCH_SIZE} 集`);

  // 累积结果
  let mergedResult: ProjectAnalysisResult = {
    worldView: '',
    genre: '',
    visualStyle: '',
    keyTerms: [],
    characters: [],
    scenes: [],
    volumes: [],
    antagonists: [],
    episodeSummaries: [],
  };

  // 🆕 v5: 累积已发现的角色名和场景名，传递给后续批次
  let accumulatedCharNames = [...preScanResult.characterNames];
  let accumulatedSceneNames = [...preScanResult.sceneNames];

  console.log(`[分批分析] 初始化累积数据 - 角色: ${accumulatedCharNames.length}个, 场景: ${accumulatedSceneNames.length}个`);
  console.log(`[分批分析] 预扫描结果 - 角色: ${preScanResult.characterNames.length}个, 场景: ${preScanResult.sceneNames.length}个`);

  // 逐批分析
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const firstEp = batch[0]?.episodeNumber || (batchIdx * BATCH_SIZE + 1);
    const lastEp = batch[batch.length - 1]?.episodeNumber || ((batchIdx + 1) * BATCH_SIZE);
    const batchRange = `${firstEp}-${lastEp}`;

    console.log(`[分批分析] 正在分析第 ${batchIdx + 1}/${batches.length} 批 (第${batchRange}集)...`);
    console.log(`[分批分析] 本批次脚本的 episodeNumber:`, batch.map(s => s.episodeNumber));
    console.log(`[分批分析] 传递给本批次的已知角色: ${accumulatedCharNames.length}个，已知场景: ${accumulatedSceneNames.length}个`);

    // 通知开始分析此批次
    onProgress?.({
      currentBatch: batchIdx + 1,
      totalBatches: batches.length,
      batchEpisodeRange: batchRange,
      partialResult: mergedResult,
      status: 'analyzing',
    });

    try {
      // 🔧 v5修复：传递已知角色/场景名给分析函数
      // 🔧 v6新增：传递提取模式
      const batchResult = await analyzeProjectScripts(batch, model, accumulatedCharNames, accumulatedSceneNames, mode);

      // 🆕 v5: 累积本批次发现的角色名和场景名
      const newCharNames = batchResult.characters?.map(c => c.name) || [];
      const newSceneNames = batchResult.scenes?.map(s => s.name) || [];
      accumulatedCharNames = [...new Set([...accumulatedCharNames, ...newCharNames])];
      accumulatedSceneNames = [...new Set([...accumulatedSceneNames, ...newSceneNames])];

      // 调试：显示本批次返回的详细信息
      console.log(`[分批分析] 第 ${batchIdx + 1} 批AI返回:`, {
        角色数: batchResult.characters?.length || 0,
        场景数: batchResult.scenes?.length || 0,
        概要数: batchResult.episodeSummaries?.length || 0,
        角色名: batchResult.characters?.map(c => c.name),
        场景名: batchResult.scenes?.map(s => s.name),
      });
      console.log(`[分批分析] 第 ${batchIdx + 1} 批返回的 episodeSummaries:`, batchResult.episodeSummaries?.map(e => e.episodeNumber));

      // 合并结果
      mergedResult = mergeAnalysisResults(mergedResult, batchResult, batchIdx === 0);

      console.log(`[分批分析] 第 ${batchIdx + 1} 批完成，累计: ${mergedResult.characters.length}角色, ${mergedResult.scenes.length}场景, ${mergedResult.episodeSummaries.length}集概要`);
      console.log(`[分批分析] 合并后所有集数:`, mergedResult.episodeSummaries?.map(e => e.episodeNumber));

      // 通知合并完成
      onProgress?.({
        currentBatch: batchIdx + 1,
        totalBatches: batches.length,
        batchEpisodeRange: batchRange,
        partialResult: mergedResult,
        status: batchIdx === batches.length - 1 ? 'complete' : 'merging',
      });

    } catch (error) {
      console.error(`[分批分析] 第 ${batchIdx + 1} 批失败:`, error);
      // 失败时填充默认剧集概要
      const defaultEpisodes = batch.map((s, i) => ({
        episodeNumber: s.episodeNumber || (batchIdx * BATCH_SIZE + i + 1),
        title: `第${s.episodeNumber || (batchIdx * BATCH_SIZE + i + 1)}集`,
        summary: '分析失败，待手动填写',
        characterStates: [],
      }));
      mergedResult.episodeSummaries.push(...defaultEpisodes);
    }
  }

  // 🆕 v7：验证预扫描的场景是否都被包含
  if (preScanResult.sceneNames.length > 0) {
    console.log(`[分批分析] 开始验证预扫描场景（共${preScanResult.sceneNames.length}个）`);
    mergedResult = ensurePreScannedScenesIncluded(mergedResult, preScanResult.sceneNames);
    console.log(`[分批分析] 验证完成，最终场景数: ${mergedResult.scenes.length}`);
  }

  return mergedResult;
}

/**
 * 🆕 v7新增：确保预扫描的场景都被包含在最终结果中
 * 防止场景在分批分析中丢失
 */
function ensurePreScannedScenesIncluded(
  result: ProjectAnalysisResult,
  preScannedScenes: string[]
): ProjectAnalysisResult {
  const existingNames = new Set(result.scenes.map(s => s.name));
  const missingScenes = preScannedScenes.filter(name => !existingNames.has(name));

  if (missingScenes.length === 0) {
    return result;
  }

  console.log(`[场景验证] 发现 ${missingScenes.length} 个遗漏场景:`, missingScenes);

  // 为遗漏的场景创建占位符
  const placeholderScenes: SceneRef[] = missingScenes.map((name, idx) => ({
    id: `scene-补充-${Date.now()}-${idx}`,
    name,
    description: '⚠️ 待补充详细描述（从剧本中提取）',
    atmosphere: '',
    visualPromptCn: '',
    visualPromptEn: '',
    appearsInEpisodes: [],
  }));

  return {
    ...result,
    scenes: [...result.scenes, ...placeholderScenes],
  };
}

/**
 * 合并两次分析结果
 * - 世界观、类型、风格：使用第一批的结果
 * - 角色、场景：去重合并（按名称）
 * - 剧集概要：追加
 */
function mergeAnalysisResults(
  existing: ProjectAnalysisResult,
  newResult: ProjectAnalysisResult,
  isFirstBatch: boolean
): ProjectAnalysisResult {
  // 第一批时使用世界观等基础信息
  const worldView = isFirstBatch ? newResult.worldView : existing.worldView;
  const genre = isFirstBatch ? newResult.genre : existing.genre;
  const visualStyle = isFirstBatch ? newResult.visualStyle : existing.visualStyle;

  // 合并专有名词（按术语去重）
  const existingTerms = new Set(existing.keyTerms.map(t => t.term));
  const mergedKeyTerms = [
    ...existing.keyTerms,
    ...newResult.keyTerms.filter(t => !existingTerms.has(t.term)),
  ];

  // 合并角色（按名称去重，保留更完整的信息）
  const charMap = new Map<string, CharacterRef>();
  for (const char of existing.characters) {
    charMap.set(char.name, char);
  }
  for (const char of newResult.characters) {
    const existingChar = charMap.get(char.name);
    if (!existingChar) {
      charMap.set(char.name, char);
    } else {
      // 合并形态
      const existingForms = existingChar.forms || [];
      const newForms = char.forms || [];
      const formNames = new Set(existingForms.map(f => f.name));
      const mergedForms = [
        ...existingForms,
        ...newForms.filter(f => !formNames.has(f.name)),
      ];
      charMap.set(char.name, {
        ...existingChar,
        forms: mergedForms.length > 0 ? mergedForms : undefined,
        // 如果新的有更多能力，合并
        abilities: [...new Set([...(existingChar.abilities || []), ...(char.abilities || [])])],
      });
    }
  }

  // 合并场景（按名称去重）
  const sceneMap = new Map<string, SceneRef>();
  for (const scene of existing.scenes) {
    sceneMap.set(scene.name, scene);
  }
  for (const scene of newResult.scenes) {
    const existingScene = sceneMap.get(scene.name);
    if (!existingScene) {
      sceneMap.set(scene.name, scene);
    } else {
      // 合并出现集数
      const eps = new Set([
        ...(existingScene.appearsInEpisodes || []),
        ...(scene.appearsInEpisodes || []),
      ]);
      sceneMap.set(scene.name, {
        ...existingScene,
        appearsInEpisodes: Array.from(eps).sort((a, b) => a - b),
      });
    }
  }

  // 合并分卷（去重，按标题）
  const volumeMap = new Map<string, StoryVolume>();
  for (const vol of existing.volumes || []) {
    volumeMap.set(vol.title, vol);
  }
  for (const vol of newResult.volumes || []) {
    if (!volumeMap.has(vol.title)) {
      volumeMap.set(vol.title, vol);
    }
  }

  // 合并BOSS（去重）
  const bossMap = new Map<string, Antagonist>();
  for (const boss of existing.antagonists || []) {
    bossMap.set(boss.name, boss);
  }
  for (const boss of newResult.antagonists || []) {
    if (!bossMap.has(boss.name)) {
      bossMap.set(boss.name, boss);
    }
  }

  // 剧集概要合并，按集数去重（新的覆盖旧的，但只在新的有效时）
  const episodeMap = new Map<number, EpisodeSummary>();
  for (const ep of existing.episodeSummaries || []) {
    episodeMap.set(ep.episodeNumber, ep);
  }
  for (const ep of newResult.episodeSummaries || []) {
    const existing = episodeMap.get(ep.episodeNumber);
    // 如果旧的是"待分析"或无效，新的有内容就覆盖
    const existingInvalid = !existing || !existing.summary || existing.summary === '待分析' || existing.summary === '待定';
    const newValid = ep.summary && ep.summary !== '待分析' && ep.summary !== '待定';
    if (existingInvalid || newValid) {
      episodeMap.set(ep.episodeNumber, ep);
    }
  }
  const mergedEpisodes = Array.from(episodeMap.values())
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  return {
    worldView,
    genre,
    visualStyle,
    keyTerms: mergedKeyTerms,
    characters: Array.from(charMap.values()),
    scenes: Array.from(sceneMap.values()),
    volumes: Array.from(volumeMap.values()),
    antagonists: Array.from(bossMap.values()),
    episodeSummaries: mergedEpisodes,
  };
}
