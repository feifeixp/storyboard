# Visionary Storyboard Studio - 项目完整说明文档

**项目名称**: Visionary Storyboard Studio (Director Studio)
**项目类型**: AI驱动的分镜脚本生成系统
**技术栈**: React 19 + TypeScript + Vite 6 + OpenRouter API
**创建日期**: 2024-12
**文档版本**: 2.0
**最后更新**: 2024-12-27

---

## 📋 目录

1. [项目概述](#项目概述)
2. [项目文件结构](#项目文件结构)
3. [工作流程](#工作流程)
4. [提示词体系](#提示词体系)
5. [规则体系](#规则体系)
6. [技术架构](#技术架构)
7. [核心服务](#核心服务)
8. [主要组件](#主要组件)

---

## 📖 项目概述

### 项目定位

Visionary Storyboard Studio 是一个专业的 AI 分镜脚本生成系统，旨在将文字剧本转化为可执行的分镜脚本，包含：
- 镜头设计（景别、角度、运镜）
- 视觉提示词（中英文）
- AI 草图生成
- 剧本模板导出

### 核心功能

| 功能模块 | 描述 | 状态 |
|---------|------|------|
| **项目管理** | 多项目、多集管理，支持项目设置和元数据 | ✅ 已完成 |
| **剧本分析** | 智能提取场景、角色、情绪节奏 | ✅ 已完成 |
| **思维链生成** | 5阶段思维链推理，模拟专业分镜师思维 | ✅ 已完成 |
| **分镜设计** | 自动生成镜头设计（景别、角度、运镜、提示词） | ✅ 已完成 |
| **AI 草图** | 调用 AI 图像生成模型生成分镜草图 | ✅ 已完成 |
| **智能补充** | 自动补充角色和场景的缺失信息 | ✅ 已完成 |
| **模板导出** | 导出标准化的剧本模板（.ini 格式） | ✅ 已完成 |
| **提示词校验** | 验证提示词符合规范（四要素、禁用词） | ✅ 已完成 |
| **角度自动修复** | 🆕 情绪驱动的角度分布自动修复 | ✅ 已完成 |
| **九宫格单独重新生成** | 🆕 为每张九宫格图片添加独立重新生成按钮 | ✅ 已完成 |
| **故事梗概智能生成** | 🆕 智能提取关键剧情点，生成20-300字连贯概括 | ✅ 已完成 |

### 技术特点

- **思维链推理**: 将专业分镜师的认知过程转化为结构化的 AI 推理步骤
- **多模型支持**: 支持 Gemini、GPT、Claude、DeepSeek 等多种模型
- **规则驱动**: 基于《Framed Ink》等经典教材的专业规则
- **实时流式**: 流式输出，实时显示生成过程
- **本地存储**: 使用 localStorage 实现项目持久化
- **🆕 情绪驱动**: 基于镜头情绪自动选择最合适的角度
- **🆕 智能修复**: 自动检测并修复角度分布问题
- **🆕 灵活重生成**: 支持单独重新生成某张九宫格图片

---

## 🌟 最新功能亮点（2024-12-27）

### 1️⃣ 角度自动修复功能

**问题**：AI生成的分镜脚本可能违反角度分布规则
- ❌ 正面镜头超标（25.7%，应 ≤7%）
- ❌ 平视镜头占比不符（应 10-15%）
- ❌ 极端角度占比不足（应 ≥15%）

**解决方案**：情绪驱动的自动修复
- ✅ 自动检测角度分布问题
- ✅ 基于镜头情绪选择最合适的角度替换方案
- ✅ 保留情绪高潮镜头的正面角度
- ✅ 一键修复，符合专业规则

**效果**：
```
修复前：19个正面镜头（54.3%）
修复后：2个正面镜头（5.7%）
```

---

### 2️⃣ 九宫格单独重新生成功能

**问题**：某张九宫格生成失败或不满意时，需要重新生成所有图片

**解决方案**：为每张九宫格添加独立的"重新生成"按钮
- ✅ 只重新生成该张九宫格
- ✅ 不影响其他已生成的图片
- ✅ 节省时间和API成本

**效果**：
```
修复前：重新生成所有图片（4张 × 成本）
修复后：只重新生成1张（1张 × 成本）
节省：75%的时间和成本
```

---

### 3️⃣ 故事梗概智能生成

**问题**：简单拼接所有镜头的 storyBeat，导致信息堆砌，不连贯

**解决方案**：智能概括算法
- ✅ 提取开头、高潮、结尾的关键剧情点
- ✅ 去除重复事件（相似度>80%）
- ✅ 组合成连贯的故事概括（20-300字）

**效果**：
```
修复前：在S1垂直结构空间...。，云中子悬浮于半空...。，在平原中心...。
修复后：天空的数据裂缝扩张，云中子悬浮半空冷酷无情，晋安与林溪背靠背站立渺小孤独，四尊银白色卫士从裂缝中降临...（连贯、完整）
```

---

## 📂 项目文件结构

### 根目录结构

```
visionary-storyboard-studio/
├── .augment/                    # Augment 规则配置
│   └── rules/                   # 规则库
│       ├── global-rules.md      # 全局规则
│       ├── project-rules.md     # 项目规则
│       ├── rules.md             # 完整规则
│       ├── 角度规则优化总结.ini
│       ├── 分镜设计连续性三原则.txt
│       └── 提示词规范标准.ini
│
├── components/                  # React 组件
│   ├── ChainOfThoughtViewer.tsx # 思维链查看器
│   ├── EditModal.tsx            # 编辑弹窗
│   ├── ModelSelector.tsx        # 模型选择器
│   ├── ProjectDashboard.tsx     # 项目主界面
│   ├── ProjectList.tsx          # 项目列表
│   ├── ProjectWizard.tsx        # 新建项目向导
│   ├── StepTracker.tsx          # 步骤追踪器
│   └── SuggestionDetailModal.tsx # 建议详情弹窗
│
├── services/                    # 核心服务
│   ├── angleValidation.ts       # 角度分布验证
│   ├── angleAutoFix.ts          # 🆕 角度自动修复服务
│   ├── characterCompleteness.ts # 角色完整度检查
│   ├── characterSupplement.ts   # 角色智能补充
│   ├── constants.ts             # 全局常量
│   ├── emotionDrivenAngleSelection.ts # 🆕 情绪驱动的角度选择
│   ├── episodeSummaryGenerator.ts # 🆕 本集概述生成服务
│   ├── featureFlags.ts          # 功能开关
│   ├── formExtractor.ts         # 表单提取
│   ├── gemini.ts                # Gemini API 集成
│   ├── openrouter.ts            # OpenRouter API 集成（含单独生成九宫格）
│   ├── projectAnalysis.ts       # 项目分析
│   ├── projectContext.ts        # 项目上下文
│   ├── projectStorage.ts        # 项目存储
│   ├── promptValidation.ts      # 提示词验证
│   ├── sceneExtraction.ts       # 场景提取
│   ├── sceneSupplement.ts       # 场景智能补充
│   ├── scriptTemplateExport.ts  # 剧本模板导出
│   └── terminologyMapper.ts     # 🆕 术语映射服务（分镜术语→摄影术语）
│
├── prompts/                     # 提示词库
│   ├── chain-of-thought/        # 思维链系统
│   │   ├── stage1-script-analysis.ts    # 阶段1：剧本分析
│   │   ├── stage2-visual-strategy.ts    # 阶段2：视觉策略
│   │   ├── stage3-shot-planning.ts      # 阶段3：镜头分配
│   │   ├── stage4-shot-design.ts        # 阶段4：逐镜设计
│   │   ├── stage5-quality-review.ts     # 阶段5：质量自检
│   │   ├── types.ts                     # 类型定义
│   │   └── utils.ts                     # 工具函数
│   ├── 优化后的生成提示词_动画版.md
│   ├── 思维链提示词_完整版.md
│   └── 系统提示词库.md
│
├── types/                       # TypeScript 类型
│   └── project.ts               # 项目类型定义
│
├── docs/                        # 文档
│   ├── 智能补充功能使用指南.md
│   ├── 智能补充功能实现总结.md
│   └── 功能验证清单.md
│
├── reports/                     # 🆕 开发报告和功能说明
│   └── 2024年12月/
│       ├── 角度自动修复功能-使用说明.md
│       ├── 九宫格单独重新生成功能-使用说明.md
│       └── 中文提示词术语修复方案.md
│
├── App.tsx                      # 主应用组件
├── index.tsx                    # 应用入口
├── types.ts                     # 全局类型
├── vite.config.ts               # Vite 配置
├── tsconfig.json                # TypeScript 配置
├── package.json                 # 依赖配置
├── README.md                    # 项目说明
└── DEVELOPMENT_LOG.md           # 开发日志
```

### 目录说明

| 目录 | 作用 | 关键文件 |
|------|------|---------|
| `.augment/rules/` | 规则库，存放所有业务规则和技术规范 | 角度规则、连续性规则、提示词规范 |
| `components/` | React 组件，UI 层 | ProjectDashboard, ProjectWizard |
| `services/` | 核心业务逻辑，服务层 | openrouter.ts, projectAnalysis.ts |
| `prompts/chain-of-thought/` | 思维链系统，5阶段提示词 | stage1-5.ts, types.ts |
| `types/` | TypeScript 类型定义 | project.ts |
| `docs/` | 功能文档和使用指南 | 智能补充功能文档 |

---

## 🔄 工作流程

### 完整工作流程图

```
用户输入剧本
    ↓
【项目创建】
    ├─ 填写项目信息（名称、类型、风格）
    ├─ 上传剧本文件
    └─ 创建项目
    ↓
【项目分析】(projectAnalysis.ts)
    ├─ 预扫描剧本（提取场景、角色）
    ├─ 分批分析（每批5000字）
    ├─ 合并结果
    └─ 生成项目元数据
    ↓
【思维链生成】(5阶段)
    ├─ 阶段1：剧本分析 (stage1-script-analysis.ts)
    │   ├─ 提取关键信息
    │   ├─ 识别情绪转折点
    │   ├─ 确定核心冲突
    │   └─ 划分场景段落
    ├─ 阶段2：视觉策略 (stage2-visual-strategy.ts)
    │   ├─ 确定视觉风格
    │   ├─ 规划透视类型
    │   ├─ 设计光影方案
    │   └─ 确定运镜分布
    ├─ 阶段3：镜头分配 (stage3-shot-planning.ts)
    │   ├─ 计算镜头数量
    │   ├─ 分配景别分布
    │   ├─ 分配角度分布
    │   └─ 分配运镜类型
    ├─ 阶段4：逐镜设计 (stage4-shot-design.ts)
    │   ├─ 设计每个镜头
    │   ├─ 生成提示词（中英文）
    │   ├─ 标注景别、角度、运镜
    │   └─ 输出分镜列表
    └─ 阶段5：质量自检 (stage5-quality-review.ts)
        ├─ 检查连贯性
        ├─ 检查多样性
        ├─ 检查规则符合性
        └─ 生成优化建议
    ↓
【智能补充】(可选)
    ├─ 角色完整度检查 (characterCompleteness.ts)
    ├─ 角色智能补充 (characterSupplement.ts)
    ├─ 场景智能补充 (sceneSupplement.ts)
    └─ 更新项目元数据
    ↓
【角度自动修复】🆕 (angleAutoFix.ts)
    ├─ 检测角度分布问题
    │   ├─ 正面镜头超标（>7%）
    │   ├─ 平视镜头占比不符（<10% 或 >15%）
    │   └─ 极端角度占比不足（<15%）
    ├─ 情绪驱动修复 (emotionDrivenAngleSelection.ts)
    │   ├─ 分析镜头情绪
    │   ├─ 选择最合适的角度替换方案
    │   └─ 保留情绪高潮镜头的正面角度
    └─ 应用修复并验证
    ↓
【提示词校验】(promptValidation.ts)
    ├─ 检查四要素（景别、角度、主体、环境）
    ├─ 检查禁用词
    ├─ 检查首尾帧一致性
    └─ 生成校验报告
    ↓
【AI 草图生成】(可选)
    ├─ 调用 AI 图像生成模型（Nano Banana Pro）
    ├─ 批量生成九宫格草图（每张9个镜头）
    ├─ 🆕 单独重新生成某张九宫格（generateSingleGrid）
    └─ 批量下载
    ↓
【模板导出】(scriptTemplateExport.ts)
    ├─ 生成剧集信息
    ├─ 生成角色人设
    ├─ 生成场景描述
    ├─ 生成场景布局
    ├─ 🆕 生成故事梗概（智能概括，20-300字）
    │   ├─ 提取开头、高潮、结尾的关键剧情点
    │   ├─ 去除重复事件（相似度>80%）
    │   └─ 组合成连贯的故事概括
    ├─ 生成分镜内容
    ├─ 生成 AI 提示词
    └─ 导出 .ini 文件
```

### 关键流程说明

#### 1. 项目分析流程

**目的**: 从剧本中提取结构化信息

**步骤**:
1. **预扫描**: 取前5000字，快速提取场景和角色
2. **分批分析**: 将剧本分成多批（每批5000字），逐批分析
3. **合并结果**: 合并所有批次的结果，去重
4. **验证**: 确保预扫描的场景都被保留

**关键代码**: `services/projectAnalysis.ts`

#### 2. 思维链生成流程

**目的**: 模拟专业分镜师的思维过程

**特点**:
- **结构化推理**: 5个阶段，每个阶段有明确的输入输出
- **可追溯**: 每个阶段的推理过程都可查看
- **可调试**: 可以单独测试每个阶段

**关键代码**: `prompts/chain-of-thought/stage1-5.ts`

#### 3. 智能补充流程

**目的**: 自动补充角色和场景的缺失信息

**步骤**:
1. **完整度检查**: 检查角色/场景的必填字段
2. **提取相关内容**: 从剧本中提取与该角色/场景相关的内容
3. **AI 补充**: 调用 AI 模型补充缺失信息
4. **更新项目**: 更新项目元数据

**关键代码**: `services/characterSupplement.ts`, `services/sceneSupplement.ts`

---

## 🎯 提示词体系

### 提示词分类

项目中使用的提示词分为以下几类：

| 类别 | 文件位置 | 用途 | 数量 |
|------|---------|------|------|
| **思维链提示词** | `prompts/chain-of-thought/stage1-5.ts` | 5阶段思维链推理 | 5个 |
| **项目分析提示词** | `services/projectAnalysis.ts` | 剧本分析、场景提取、角色提取 | 3个 |
| **智能补充提示词** | `services/characterSupplement.ts`, `services/sceneSupplement.ts` | 角色/场景信息补充 | 2个 |
| **图像生成提示词** | 分镜脚本中的 `promptCn/promptEn` | AI 图像生成 | 动态生成 |
| **视频生成提示词** | 分镜脚本中的 `videoPromptCn/videoPromptEn` | AI 视频生成 | 动态生成 |

### 思维链提示词详解

#### 阶段1：剧本分析 (stage1-script-analysis.ts)

**输入**: 原始剧本文本
**输出**: ScriptAnalysis 对象

**推理步骤**:
```
Step 1.1: 提取关键信息
  - 识别主要角色
  - 识别主要场景
  - 识别核心事件

Step 1.2: 识别情绪转折点
  - 标记情绪高潮
  - 标记情绪低谷
  - 标记情绪转折

Step 1.3: 确定核心冲突
  - 识别主要冲突
  - 识别次要冲突
  - 分析冲突关系

Step 1.4: 划分场景段落
  - 按场景划分
  - 按情绪划分
  - 确定段落边界
```

**关键输出**:
- `characters`: 角色列表
- `scenes`: 场景列表
- `emotionCurve`: 情绪曲线
- `conflicts`: 冲突列表
- `segments`: 场景段落

#### 阶段2：视觉策略 (stage2-visual-strategy.ts)

**输入**: 原始剧本 + 阶段1分析结果
**输出**: VisualStrategy 对象

**推理步骤**:
```
Step 2.1: 确定视觉风格
  - 分析剧本类型
  - 确定色调
  - 确定光影风格

Step 2.2: 规划透视类型
  - 一点透视（30-40%）
  - 两点透视（30-40%）
  - 三点透视（15-25%）

Step 2.3: 设计光影方案
  - 主光源方向
  - 光影对比度
  - 特殊光效

Step 2.4: 确定运镜分布
  - 固定镜头（≤5%）
  - 推拉镜头（~25%）
  - 横摇竖摇（~20%）
  - 跟拍（~15%）
  - 升降环绕（~10%）
```

**关键输出**:
- `visualStyle`: 视觉风格
- `perspectiveDistribution`: 透视分布
- `lightingPlan`: 光影方案
- `cameraMovementDistribution`: 运镜分布

#### 阶段3：镜头分配 (stage3-shot-planning.ts)

**输入**: 原始剧本 + 阶段1 + 阶段2
**输出**: ShotPlanning 对象

**推理步骤**:
```
Step 3.1: 计算镜头数量
  - 基于情绪节奏
  - 基于场景复杂度
  - 基于剧本长度

Step 3.2: 分配景别分布
  - 远景（ELS）: 7%
  - 全景（LS）: 17%
  - 中景（MS）: 33%
  - 近景（CU）: 27%
  - 特写（ECU）: 17%

Step 3.3: 分配角度分布
  - 朝向角度：正面≤7%, 3/4正面≤25%, 侧面~20%
  - 高度角度：平视10-15%, 轻微仰/俯~40%, 极端角度≥15%

Step 3.4: 分配运镜类型
  - 根据阶段2的运镜分布
  - 确保动态运镜占90%以上
```

**关键输出**:
- `totalShots`: 总镜头数
- `shotDistribution`: 镜头分布（景别、角度、运镜）
- `sceneBreakdown`: 场景分解

#### 阶段4：逐镜设计 (stage4-shot-design.ts)

**输入**: 原始剧本 + 阶段1 + 阶段2 + 阶段3
**输出**: ShotDesign 对象（包含完整的分镜列表）

**推理步骤**:
```
Step 4.1: 设计每个镜头
  - 确定镜头内容
  - 确定景别、角度、运镜
  - 设计构图

Step 4.2: 生成提示词
  - 中文提示词（promptCn）
  - 英文提示词（promptEn）
  - 视频提示词（videoPromptCn/En）

Step 4.3: 标注技术参数
  - 景别（shotSize）
  - 角度朝向（angleDirection）
  - 角度高度（angleHeight）
  - 运镜方式（cameraMovement）
  - 透视类型（perspective）

Step 4.4: 确保连续性
  - 检查视觉中心连续性
  - 检查动作连续性
  - 检查视线连续性
```

**关键输出**:
- `shots`: 完整的分镜列表（ShotListItem[]）
- 每个镜头包含：
  - `shotNumber`: 镜号
  - `content`: 镜头内容
  - `dialogue`: 台词
  - `shotSize`: 景别
  - `angleDirection`: 角度朝向
  - `angleHeight`: 角度高度
  - `cameraMovement`: 运镜方式
  - `perspective`: 透视类型
  - `promptCn/En`: 图像提示词
  - `videoPromptCn/En`: 视频提示词

#### 阶段5：质量自检 (stage5-quality-review.ts)

**输入**: 原始剧本 + 阶段1-4
**输出**: QualityCheck 对象

**推理步骤**:
```
Step 5.1: 检查连贯性
  - 空间连续性
  - 视觉中心连续性
  - 动作连续性

Step 5.2: 检查多样性
  - 景别多样性
  - 角度多样性
  - 运镜多样性

Step 5.3: 检查规则符合性
  - 正面镜头占比 ≤7%
  - 平视镜头占比 10-15%
  - 极端角度占比 ≥15%
  - 动态运镜占比 ≥90%

Step 5.4: 生成优化建议
  - 列出问题
  - 提供解决方案
  - 标注优先级
```

**关键输出**:
- `continuityIssues`: 连续性问题
- `diversityIssues`: 多样性问题
- `ruleViolations`: 规则违反
- `suggestions`: 优化建议
- `overallScore`: 总体评分

### 图像生成提示词规范

**格式**: 景别 + 角度 + 主体 + 环境 + 光影 + 风格

**示例**:
```
中文：中景，3/4侧面轻微仰拍，少女站在教室窗边，阳光从左侧照入，
      温暖的午后光线，水墨风格，柔和笔触

英文：Medium shot, 3/4 side view with mild low angle,
      young girl standing by classroom window,
      sunlight from left side, warm afternoon light,
      ink wash style, soft brushstrokes
```

**四要素检查**:
1. ✅ 景别：中景
2. ✅ 角度：3/4侧面轻微仰拍
3. ✅ 主体：少女站在教室窗边
4. ✅ 环境：阳光从左侧照入，温暖的午后光线

**禁用词检查**:
- ❌ 避免：分镜、镜头、画面、构图等元术语
- ❌ 避免：AI无法理解的专业术语

### 视频生成提示词规范

**格式**: 风格保持 + 主体动作 + 运镜方式 + 光影变化 + 时长

**示例**:
```
中文：保持水墨风格，少女缓慢转头看向窗外，镜头从侧面缓慢推进至面部特写，
      阳光在脸上形成渐变光影，5秒

英文：Maintain ink wash style, girl slowly turns head to look out window,
      camera slowly pushes from side view to facial close-up,
      sunlight creates gradient shadows on face, 5 seconds
```

**关键原则**:
- 动作适度：优先简单动作，避免大幅度动作
- 时长匹配：画面内容必须在指定时长内可完成
- 风格一致：必须强调风格保持

---

## 📚 规则体系

### 规则分层

```
规则体系
├── 全局规则 (global-rules.md)
│   ├── R001: 代码操作前置校验
│   ├── R002: 代码完整性约束
│   ├── R006: 规则简洁性约束
│   ├── R007: 开发日志记录规范
│   └── G001-G004: 规则设计指南
│
├── 项目规则 (project-rules.md)
│   └── R008: 角度规则强制校验
│
└── 业务规则
    ├── 角度规则优化总结.ini
    ├── 分镜设计连续性三原则.txt
    ├── 提示词规范标准.ini
    ├── 视频生成提示词规范.ini（待整理）
    ├── 短剧漫剧剧本的核心要求.txt（待整理）
    ├── 分镜脚本设计新手手册.md（待整理）
    └── 透视知识-项目应用指南.md（待整理）
```

### 核心业务规则

#### 1. 角度规则（最高优先级）

**文件**: `.augment/rules/角度规则优化总结.ini`

**核心规则**:
| 规则项 | 要求 | 优先级 |
|--------|------|--------|
| 正面镜头占比 | ≤7%（30个镜头最多2个） | 最高 |
| 平视镜头占比 | 10-15%（禁止连续2个以上） | 最高 |
| 默认角度高度 | 轻微仰拍/轻微俯拍（40-50%） | 最高 |
| 极端角度占比 | ≥15%（必须有，不能全是温和角度） | 高 |

**验证代码**: `services/angleValidation.ts`

#### 2. 连续性规则

**文件**: `.augment/rules/分镜设计连续性三原则.txt`

**三大原则**:
1. **空间连续性**: 镜头始终在"两主要元素连线同侧"
2. **视觉中心连续性**: 上一镜视觉焦点，下一镜优先承接
3. **动作与视线连续性**: 动作衔接顺承，视线方向统一

**应用位置**: `prompts/chain-of-thought/stage4-shot-design.ts`

#### 3. 提示词规范

**文件**: `.augment/rules/提示词规范标准.ini`

**四要素**:
1. ✅ 景别（Shot Size）
2. ✅ 角度（Angle）
3. ✅ 主体（Subject）
4. ✅ 环境（Environment）

**禁用词**:
- 分镜、镜头、画面、构图、视角、取景
- 第一人称、第三人称
- 其他AI无法理解的元术语

**验证代码**: `services/promptValidation.ts`

### 规则应用流程

```
代码修改
    ↓
触发规则检查（R008）
    ↓
查阅规则文件
    ├─ 角度规则优化总结.ini
    ├─ 分镜设计连续性三原则.txt
    └─ 提示词规范标准.ini
    ↓
确认符合规则
    ↓
执行修改
    ↓
运行验证函数
    ├─ validateAngleDistribution()
    └─ validatePrompt()
    ↓
生成验证报告
    ↓
更新开发日志
```

---

## 🏗️ 技术架构

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面层                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ProjectList  │  │ProjectWizard │  │ProjectDashboard│     │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ EditModal    │  │ ModelSelector│  │ StepTracker  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        业务逻辑层                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   App.tsx (主控制器)                  │  │
│  │  - 状态管理 (useState)                                │  │
│  │  - 流程控制 (handleXxx)                               │  │
│  │  - 数据持久化 (localStorage)                          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        服务层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ openrouter.ts│  │projectAnalysis│ │characterSupplement│ │
│  │ (AI调用)     │  │ (剧本分析)    │  │ (智能补充)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │promptValidation│ │angleValidation│ │scriptTemplateExport││
│  │ (提示词校验)  │  │ (角度验证)    │  │ (模板导出)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        数据层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ localStorage │  │ types.ts     │  │ constants.ts │      │
│  │ (持久化)     │  │ (类型定义)    │  │ (常量配置)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        外部服务层                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ OpenRouter   │  │ DeepSeek     │  │ Gemini       │      │
│  │ API          │  │ API          │  │ API          │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **前端框架** | React | 19 | UI 框架 |
| **语言** | TypeScript | 5.6 | 类型安全 |
| **构建工具** | Vite | 6 | 快速构建 |
| **样式** | Tailwind CSS | 3.4 | 原子化 CSS |
| **AI 服务** | OpenRouter | - | 统一 AI API 网关 |
| **AI 模型** | Gemini 3 Flash | - | 默认推荐模型 |
| **状态管理** | React Hooks | - | useState, useEffect |
| **数据持久化** | localStorage | - | 浏览器本地存储 |

### 数据流

```
用户操作
    ↓
组件事件处理 (onClick, onChange)
    ↓
App.tsx 状态更新 (setState)
    ↓
调用服务层函数 (services/xxx.ts)
    ↓
调用 AI API (OpenRouter)
    ↓
解析 AI 响应
    ↓
更新状态
    ↓
持久化到 localStorage
    ↓
重新渲染组件
```

### 状态管理

**核心状态**:
```typescript
// 项目管理
const [projects, setProjects] = useState<Project[]>([]);
const [currentProject, setCurrentProject] = useState<Project | null>(null);
const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number | null>(null);

// 流程控制
const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.PROJECT_LIST);

// 分镜数据
const [shots, setShots] = useState<Shot[]>([]);
const [characterRefs, setCharacterRefs] = useState<CharacterRef[]>([]);

// 思维链状态
const [stage1Result, setStage1Result] = useState<ScriptAnalysis | null>(null);
const [stage2Result, setStage2Result] = useState<VisualStrategy | null>(null);
const [stage3Result, setStage3Result] = useState<ShotPlanning | null>(null);
const [stage4Result, setStage4Result] = useState<ShotDesign | null>(null);
const [stage5Result, setStage5Result] = useState<QualityCheck | null>(null);

// UI 状态
const [isGenerating, setIsGenerating] = useState(false);
const [progress, setProgress] = useState(0);
const [selectedModel, setSelectedModel] = useState(MODELS.GEMINI_3_FLASH);
```

**持久化策略**:
- 所有项目数据存储在 `localStorage`
- 使用 `STORAGE_KEYS` 常量管理键名
- 每次状态更新后自动保存
- 页面刷新后自动恢复

---

## 🔧 核心服务

### 1. OpenRouter 服务 (services/openrouter.ts)

**功能**: 统一的 AI API 调用服务

**支持的模型**:
```typescript
MODELS = {
  // Gemini 系列
  GEMINI_2_5_FLASH: 'google/gemini-2.5-flash',
  GEMINI_2_5_PRO: 'google/gemini-2.5-pro',
  GEMINI_3_FLASH: 'google/gemini-3-flash-preview',  // 默认推荐
  GEMINI_3_PRO: 'google/gemini-3-pro-preview',      // 思维链推理

  // GPT 系列
  GPT_4O_MINI: 'openai/gpt-4o-mini',
  GPT_5_MINI: 'openai/gpt-5-mini',

  // Claude 系列
  CLAUDE_HAIKU_4_5: 'anthropic/claude-haiku-4.5',
  CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4.5',

  // DeepSeek 系列
  DEEPSEEK_V3: 'deepseek/deepseek-chat',
}
```

**核心函数**:
```typescript
// 思维链生成（5阶段）
generateStage1Analysis(script: string, model: string): AsyncGenerator<string>
generateStage2Strategy(script: string, stage1: ScriptAnalysis, model: string): AsyncGenerator<string>
generateStage3Planning(script: string, stage1: ScriptAnalysis, stage2: VisualStrategy, model: string): AsyncGenerator<string>
generateStage4Design(script: string, stage1-3: ..., model: string): AsyncGenerator<string>
generateStage5Review(script: string, stage1-4: ..., model: string): AsyncGenerator<string>

// 解析输出
parseStage1Output(output: string): ScriptAnalysis
parseStage2Output(output: string): VisualStrategy
parseStage3Output(output: string): ShotPlanning
parseStage4Output(output: string): ShotDesign
parseStage5Output(output: string): QualityCheck

// 图像生成
generateImage(prompt: string, model: string): Promise<string>
```

**特点**:
- ✅ 流式输出（AsyncGenerator）
- ✅ 错误处理和重试
- ✅ 调试日志
- ✅ 双环境支持（浏览器 + Node.js）

### 2. 项目分析服务 (services/projectAnalysis.ts)

**功能**: 从剧本中提取结构化信息

**核心函数**:
```typescript
// 完整分析流程
analyzeProject(
  script: string,
  model: string,
  onProgress: (progress: number, message: string) => void
): Promise<{
  scenes: Scene[];
  characters: CharacterRef[];
  metadata: ProjectMetadata;
}>

// 预扫描（快速提取）
preScanScript(script: string, model: string): Promise<{
  scenes: Scene[];
  characters: CharacterRef[];
}>

// 分批分析
analyzeBatch(
  scriptChunk: string,
  batchNumber: number,
  totalBatches: number,
  model: string
): Promise<{
  scenes: Scene[];
  characters: CharacterRef[];
}>

// 合并结果
mergeAnalysisResults(
  preScanResult: AnalysisResult,
  batchResults: AnalysisResult[]
): AnalysisResult
```

**分析流程**:
1. **预扫描**: 取前5000字，快速提取场景和角色
2. **分批分析**: 将剧本分成多批（每批5000字），逐批分析
3. **合并结果**: 合并所有批次的结果，去重
4. **验证**: 确保预扫描的场景都被保留

**防丢失机制**:
- 预扫描结果优先保留
- 分批结果去重合并
- 遗漏场景以占位符形式出现

### 3. 角色补充服务 (services/characterSupplement.ts)

**功能**: 智能补充角色的缺失信息

**核心函数**:
```typescript
// 补充角色详细信息
supplementCharacterDetails(
  character: CharacterRef,
  missingFields: MissingField[],
  scripts: ScriptFile[],
  model: string
): Promise<CharacterRef>

// 批量补充
batchSupplementCharacters(
  characters: CharacterRef[],
  scripts: ScriptFile[],
  model: string,
  onProgress: (progress: number, message: string) => void
): Promise<CharacterRef[]>
```

**补充字段**:
- `description`: 角色描述
- `appearance`: 外貌特征
- `personality`: 性格特点
- `visualPromptCn`: 中文视觉提示
- `visualPromptEn`: 英文视觉提示

**工作流程**:
1. 检查角色完整度
2. 提取剧本中与该角色相关的内容
3. 调用 AI 模型补充缺失信息
4. 更新角色数据

### 4. 场景补充服务 (services/sceneSupplement.ts)

**功能**: 智能补充场景的缺失信息

**核心函数**:
```typescript
// 补充场景详细信息
supplementSceneDetails(
  scene: Scene,
  missingFields: MissingField[],
  scripts: ScriptFile[],
  model: string
): Promise<Scene>

// 批量补充
batchSupplementScenes(
  scenes: Scene[],
  scripts: ScriptFile[],
  model: string,
  onProgress: (progress: number, message: string) => void
): Promise<Scene[]>
```

**补充字段**:
- `description`: 场景描述
- `atmosphere`: 氛围
- `visualPromptCn`: 中文视觉提示
- `visualPromptEn`: 英文视觉提示

### 5. 提示词验证服务 (services/promptValidation.ts)

**功能**: 验证提示词符合规范

**核心函数**:
```typescript
// 验证单个提示词
validatePrompt(prompt: string): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingElements: string[];
  forbiddenWords: string[];
}

// 批量验证
validateAllPrompts(shots: Shot[]): {
  totalShots: number;
  validShots: number;
  invalidShots: number;
  issues: PromptIssue[];
}
```

**验证规则**:
1. **四要素检查**: 景别、角度、主体、环境
2. **禁用词检查**: 分镜、镜头、画面等元术语
3. **首尾帧一致性**: 运动镜头的首尾帧必须保持角色、场景一致

### 6. 角度验证服务 (services/angleValidation.ts)

**功能**: 验证角度分布符合规则

**核心函数**:
```typescript
// 验证角度分布
validateAngleDistribution(shots: Shot[]): {
  overall: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  direction: AngleDirectionStats;
  height: AngleHeightStats;
}

// 生成验证报告
generateAngleDistributionReport(shots: Shot[]): string
```

**验证规则**:
- 正面镜头占比 ≤7%
- 平视镜头占比 10-15%
- 极端角度占比 ≥15%
- 轻微角度占比 40-50%

### 7. 剧本模板导出服务 (services/scriptTemplateExport.ts)

**功能**: 导出标准化的剧本模板

**核心函数**:
```typescript
// 导出剧本模板
exportScriptTemplate(
  project: Project,
  episodeNumber: number,
  shots: Shot[],
  sceneLayouts: SceneLayout[]
): string

// 生成各个部分
generateHeader(episodeNumber: number, episodeTitle: string): string
generateCharacterSection(project: Project, shots: Shot[]): string
generateSceneSection(project: Project, shots: Shot[]): string
generateLayoutSection(sceneLayouts: SceneLayout[]): string
generateStorySummary(shots: Shot[]): string
generateStoryContent(shots: Shot[]): string
generateAIPrompts(shots: Shot[]): string
```

**导出内容**:
1. 剧集信息
2. 本集人物人设
3. 本集场景描述
4. 场景空间布局
5. 本集故事梗概
6. 分镜故事内容
7. AI 图片提示词

---

## 🎨 主要组件

### 1. ProjectList (components/ProjectList.tsx)

**功能**: 项目列表页面

**主要功能**:
- 显示所有项目
- 创建新项目
- 选择项目
- 删除项目

**关键代码**:
```typescript
interface ProjectListProps {
  projects: Project[];
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
}
```

### 2. ProjectWizard (components/ProjectWizard.tsx)

**功能**: 新建项目向导

**步骤**:
1. 填写项目信息（名称、类型、风格）
2. 上传剧本文件
3. 分析剧本（提取场景、角色）
4. 完成创建

**关键代码**:
```typescript
interface ProjectWizardProps {
  onComplete: (project: Project) => void;
  onCancel: () => void;
  onAnalyze: (script: string, projectName: string, genre: string, style: string) => Promise<Project>;
}
```

### 3. ProjectDashboard (components/ProjectDashboard.tsx)

**功能**: 项目主界面

**主要功能**:
- 显示项目信息
- 管理剧集
- 管理场景
- 管理角色
- 智能补充
- 场景重新提取

**关键代码**:
```typescript
interface ProjectDashboardProps {
  project: Project;
  onSelectEpisode: (episodeNumber: number) => void;
  onUpdateProject: (project: Project) => void;
  onBack: () => void;
}
```

**核心功能**:
- **剧集管理**: 添加、编辑、删除剧集
- **场景管理**: 查看、编辑、删除场景
- **角色管理**: 查看、编辑、删除角色
- **智能补充**: 自动补充角色和场景的缺失信息
- **场景重新提取**: 从剧本中重新提取场景

### 4. EditModal (components/EditModal.tsx)

**功能**: 通用编辑弹窗

**支持的编辑类型**:
- 角色编辑
- 场景编辑
- 镜头编辑

**关键代码**:
```typescript
interface EditModalProps {
  type: 'character' | 'scene' | 'shot';
  data: CharacterRef | Scene | Shot;
  onSave: (data: any) => void;
  onClose: () => void;
}
```

### 5. ModelSelector (components/ModelSelector.tsx)

**功能**: AI 模型选择器

**支持的模型类型**:
- 思维链模型（Gemini 3 Pro）
- 快速模型（Gemini 2.5 Flash, DeepSeek V3）
- 图像生成模型（Nano Banana Pro）

**关键代码**:
```typescript
interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  type?: 'thinking' | 'fast' | 'image' | 'all';
  label?: string;
  className?: string;
  showLabel?: boolean;
}
```

### 6. ChainOfThoughtViewer (components/ChainOfThoughtViewer.tsx)

**功能**: 思维链查看器

**显示内容**:
- 阶段1：剧本分析
- 阶段2：视觉策略
- 阶段3：镜头分配
- 阶段4：逐镜设计
- 阶段5：质量自检

**关键代码**:
```typescript
interface ChainOfThoughtViewerProps {
  stage1?: ScriptAnalysis;
  stage2?: VisualStrategy;
  stage3?: ShotPlanning;
  stage4?: ShotDesign;
  stage5?: QualityCheck;
}
```

### 7. StepTracker (components/StepTracker.tsx)

**功能**: 步骤追踪器

**显示步骤**:
1. 项目列表
2. 新建项目
3. 项目主界面
4. 剧集编辑
5. 思维链生成
6. 分镜编辑
7. AI 草图生成
8. 模板导出

**关键代码**:
```typescript
interface StepTrackerProps {
  currentStep: AppStep;
  completedSteps: AppStep[];
}
```

---

## 📖 使用指南

### 快速开始

#### 1. 安装依赖

```bash
npm install
```

#### 2. 配置 API Key

在 `.env.local` 文件中配置 API Key：

```env
VITE_OPENROUTER1_API_KEY=sk-or-v1-...  # OpenRouter API Key (必需)
VITE_DEEPSEEK_API_KEY=sk-...            # DeepSeek API Key (可选)
VITE_GEMINI_API_KEY=...                 # Gemini API Key (可选)
```

#### 3. 启动应用

```bash
npm run dev
```

#### 4. 访问应用

打开浏览器访问 `http://localhost:5173`

### 完整工作流程

#### 步骤1：创建项目

1. 点击"新建项目"
2. 填写项目信息：
   - 项目名称：如"霸道总裁爱上我"
   - 项目类型：如"现代都市"
   - 视觉风格：如"水墨风格"
3. 上传剧本文件（.txt 格式）
4. 点击"分析剧本"
5. 等待分析完成（自动提取场景、角色）
6. 点击"完成创建"

#### 步骤2：管理项目

1. 在项目主界面查看：
   - 项目信息
   - 剧集列表
   - 场景列表
   - 角色列表
2. 可选：使用"智能补充"功能补充角色和场景信息
3. 可选：使用"场景重新提取"功能补充遗漏的场景

#### 步骤3：生成分镜

1. 选择一个剧集
2. 选择 AI 模型（推荐：Gemini 3 Flash）
3. 点击"开始生成"
4. 等待思维链生成（5个阶段）：
   - 阶段1：剧本分析（~30秒）
   - 阶段2：视觉策略（~30秒）
   - 阶段3：镜头分配（~30秒）
   - 阶段4：逐镜设计（~60秒）
   - 阶段5：质量自检（~30秒）
5. 查看生成的分镜列表

#### 步骤4：编辑分镜

1. 点击任意镜头的"编辑"按钮
2. 修改镜头内容：
   - 镜头内容
   - 台词
   - 景别
   - 角度朝向
   - 角度高度
   - 运镜方式
   - 透视类型
   - 提示词（中英文）
3. 点击"保存"

#### 步骤5：生成 AI 草图（可选）

1. 选择图像生成模型（Nano Banana Pro）
2. 点击"生成 AI 草图"
3. 等待生成完成（每9个镜头生成一张九宫格图）
4. 点击"下载全部"下载所有草图

#### 步骤6：导出剧本模板

1. 点击"导出剧本模板"
2. 选择保存位置
3. 保存为 `.ini` 文件
4. 文件包含：
   - 剧集信息
   - 角色人设
   - 场景描述
   - 场景布局
   - 故事梗概
   - 分镜内容
   - AI 提示词

### 常见问题

#### Q1: 为什么场景数量会减少？

**原因**: 预扫描发现的场景在分批分析中可能丢失

**解决方案**:
1. 使用"场景重新提取"功能
2. 手动添加遗漏的场景
3. 查看开发日志了解详情

#### Q2: 如何提高分镜质量？

**建议**:
1. 使用高质量模型（Gemini 3 Pro, Claude Sonnet 4.5）
2. 确保剧本质量（参考"短剧漫剧剧本的核心要求.txt"）
3. 使用"质量自检"功能查看优化建议
4. 手动调整不符合规则的镜头

#### Q3: 如何验证角度分布？

**方法**:
1. 在浏览器控制台运行：
   ```javascript
   import { validateAngleDistribution, generateAngleDistributionReport } from './services/angleValidation';
   const report = validateAngleDistribution(shots);
   console.log(generateAngleDistributionReport(shots));
   ```
2. 查看验证报告
3. 根据报告调整镜头

#### Q4: 如何验证提示词？

**方法**:
1. 在浏览器控制台运行：
   ```javascript
   import { validateAllPrompts } from './services/promptValidation';
   const report = validateAllPrompts(shots);
   console.log(report);
   ```
2. 查看验证报告
3. 修复提示词问题

---

## 🔍 开发指南

### 添加新功能

#### 1. 添加新的思维链阶段

**步骤**:
1. 在 `prompts/chain-of-thought/` 创建 `stageX-xxx.ts`
2. 在 `types.ts` 添加类型定义
3. 在 `services/openrouter.ts` 添加生成函数
4. 在 `App.tsx` 添加状态管理
5. 在 `ChainOfThoughtViewer.tsx` 添加显示逻辑

**示例**:
```typescript
// prompts/chain-of-thought/stage6-xxx.ts
export const STAGE6_XXX_PROMPT = `
你是一位资深的XXX专家...

## 输入
{{SCRIPT}}
{{STAGE1_RESULT}}
...

## 任务
...

## 输出格式
\`\`\`json
{
  "xxx": "...",
  ...
}
\`\`\`
`;
```

#### 2. 添加新的验证规则

**步骤**:
1. 在 `.augment/rules/` 创建规则文件
2. 在 `services/` 创建验证服务
3. 在 `App.tsx` 调用验证函数
4. 在 UI 显示验证结果

**示例**:
```typescript
// services/xxxValidation.ts
export function validateXxx(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证逻辑
  if (...) {
    errors.push('...');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
```

#### 3. 添加新的导出格式

**步骤**:
1. 在 `services/` 创建导出服务
2. 在 `App.tsx` 添加导出按钮
3. 实现导出逻辑

**示例**:
```typescript
// services/xxxExport.ts
export function exportXxx(project: Project, shots: Shot[]): string {
  // 生成导出内容
  return content;
}
```

### 调试技巧

#### 1. 查看思维链推理过程

在浏览器控制台查看：
```javascript
console.log(stage1Result);
console.log(stage2Result);
console.log(stage3Result);
console.log(stage4Result);
console.log(stage5Result);
```

#### 2. 查看 API 调用日志

在 `services/openrouter.ts` 中启用调试日志：
```typescript
const DEBUG = true;
```

#### 3. 查看验证报告

```javascript
import { validateAngleDistribution, generateAngleDistributionReport } from './services/angleValidation';
import { validateAllPrompts } from './services/promptValidation';

const angleReport = generateAngleDistributionReport(shots);
const promptReport = validateAllPrompts(shots);

console.log(angleReport);
console.log(promptReport);
```

### 性能优化

#### 1. 减少 API 调用

- 使用缓存（localStorage）
- 批量处理
- 避免重复调用

#### 2. 优化渲染性能

- 使用 `React.memo`
- 使用 `useMemo` 和 `useCallback`
- 虚拟滚动（大列表）

#### 3. 减少存储空间

- 压缩数据
- 定期清理
- 使用 IndexedDB（大数据）

---

## 📚 参考资料

### 理论基础

1. **《Framed Ink》** - Marcos Mateu-Mestre
   - 分镜设计理论
   - 能量流动、透视、光影、构图

2. **《分镜脚本设计新手手册》**
   - 分镜设计实践
   - 景别、角度、运镜

3. **《动画大师课：画幅与分镜》**
   - 画幅比例
   - 分镜节奏

4. **《场景透视》**
   - 透视原理
   - 透视应用

### 技术文档

1. **OpenRouter API 文档**
   - https://openrouter.ai/docs

2. **Gemini API 文档**
   - https://ai.google.dev/docs

3. **React 19 文档**
   - https://react.dev

4. **TypeScript 文档**
   - https://www.typescriptlang.org/docs

### 项目文档

1. **规则库**: `.augment/rules/`
2. **功能文档**: `docs/`
3. **开发日志**: `DEVELOPMENT_LOG.md`
4. **思维链文档**: `prompts/chain-of-thought/README.md`

---

## 📝 更新日志

### 2024-12-26

- ✅ 创建项目完整说明文档
- ✅ 整理规则库
- ✅ 完善文档索引

### 2024-12-27 🆕

**重大更新**：

1. **角度自动修复功能**
   - ✅ 实现情绪驱动的角度分布自动修复
   - ✅ 自动检测并修复正面镜头超标（>7%）
   - ✅ 自动调整平视镜头占比（10-15%）
   - ✅ 自动增加极端角度占比（≥15%）
   - 📄 文档：`reports/2024年12月/角度自动修复功能-使用说明.md`

2. **九宫格单独重新生成功能**
   - ✅ 为每张九宫格图片添加独立的"重新生成"按钮
   - ✅ 支持单独重新生成某张九宫格，不影响其他图片
   - ✅ 节省时间和API成本
   - 📄 文档：`reports/2024年12月/九宫格单独重新生成功能-使用说明.md`

3. **故事梗概智能生成**
   - ✅ 智能提取关键剧情点（开头、高潮、结尾）
   - ✅ 去除重复事件（相似度>80%）
   - ✅ 生成20-300字连贯概括
   - ✅ 替代简单拼接，提升概括质量

4. **术语映射优化**
   - ✅ 创建 `terminologyMapper.ts` 服务
   - ✅ 将分镜术语转换为摄影术语（AI能理解）
   - ✅ 修复九宫格中文标注问题
   - 📄 文档：`reports/2024年12月/中文提示词术语修复方案.md`

5. **Bug修复**
   - ✅ 修复 `require is not defined` 错误（浏览器环境）
   - ✅ 修复 localStorage 超出配额问题（不再存储大图片数据）
   - ✅ 修复九宫格生成中的JSON解析错误
   - ✅ 增强错误处理，输出详细错误信息

### 2024-12-22

- ✅ 接入 OpenRouter API
- ✅ 支持多种 AI 模型
- ✅ 实现思维链系统

### 2024-12-20

- ✅ 实现项目管理功能
- ✅ 实现智能补充功能
- ✅ 实现场景重新提取功能

---

## 📞 联系方式

如有问题或建议，请：
1. 查看文档
2. 查看开发日志
3. 联系团队

---

**文档版本**: 2.0
**最后更新**: 2024-12-27
**维护人**: AI Assistant


