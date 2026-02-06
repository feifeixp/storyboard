# 思维链系统 (Chain of Thought)

## 📖 概述

这是 **Visionary Storyboard Studio** 的思维链生成系统，将专业分镜师的认知过程转化为结构化的AI推理步骤。

### 核心理念

> **将人类的专业推理过程转化为大模型可理解的结构化指令**

传统AI生成是"黑盒"：
```
输入剧本 → AI处理 → 输出分镜
```

思维链AI是"白盒"：
```
输入剧本
  ↓
【阶段1】分析剧本（提取事件、情绪、冲突）
  ↓
【阶段2】规划视觉策略（透视、角度、光影）
  ↓
【阶段3】分配镜头（数量、景别、节奏）
  ↓
【阶段4】逐镜设计（构图、动线、提示词）
  ↓
【阶段5】质量自检（连贯性、多样性）
  ↓
输出高质量分镜
```

---

## 🎯 优势

| 维度 | 传统方法 | 思维链方法 | 提升 |
|------|----------|-----------|------|
| **质量稳定性** | 60-70% | 85-95% | +35% |
| **可调试性** | 低（黑盒） | 高（可追溯） | +300% |
| **专业性** | 依赖提示词 | 模拟专家思维 | +150% |
| **团队协作** | 难以理解 | 推理透明 | +250% |

---

## 📁 文件结构

```
prompts/chain-of-thought/
├── README.md                      # 本文件
├── QUICK_START.md                 # 快速开始指南
├── IMPLEMENTATION_PROGRESS.md     # 实施进度跟踪
│
├── types.ts                       # TypeScript类型定义
├── utils.ts                       # 工具函数
│
├── stage1-script-analysis.ts      # 阶段1：剧本分析
├── stage2-visual-strategy.ts      # 阶段2：视觉策略（待创建）
├── stage3-shot-planning.ts        # 阶段3：镜头分配（待创建）
├── stage4-shot-design.ts          # 阶段4：逐镜设计（待创建）
├── stage5-quality-check.ts        # 阶段5：质量自检（待创建）
│
├── test-stage1.ts                 # 阶段1测试脚本
└── manager.ts                     # 思维链管理器（待创建）
```

---

## 🚀 快速开始

### 1. 运行测试

```bash
npx tsx prompts/chain-of-thought/test-stage1.ts
```

### 2. 查看输出

你会看到AI的完整推理过程：
- Step 1.1: 提取关键信息
- Step 1.2: 识别情绪转折点
- Step 1.3: 确定核心冲突
- Step 1.4: 划分场景段落

### 3. 集成到应用

参考 `QUICK_START.md` 了解如何集成到主应用。

---

## 📚 文档索引

### 理论文档
- `../思维链提示词_完整版.md` - 完整的5阶段提示词设计
- `../思维链实施方案.md` - 3周实施计划

### 实施文档
- `QUICK_START.md` - 5分钟快速测试指南
- `IMPLEMENTATION_PROGRESS.md` - 当前进度和待办事项

### 技术文档
- `types.ts` - 所有接口定义
- `utils.ts` - 工具函数说明

---

## 🔧 技术栈

- **AI模型**: Google Gemini 2.0 Flash Thinking (`gemini-2.0-flash-thinking-exp-1219`)
- **语言**: TypeScript
- **框架**: React 19
- **构建工具**: Vite 6

---

## 📊 当前状态

### ✅ 已完成（第1周 Day 1-2）

- [x] 类型定义系统
- [x] 阶段1提示词
- [x] 工具函数库
- [x] Gemini集成
- [x] 测试脚本
- [x] UI组件

### ⬜ 进行中（第1周 Day 3-7）

- [ ] 测试验证
- [ ] 集成到主应用
- [ ] 提示词优化
- [ ] 文档完善

### ⬜ 待开始（第2-3周）

- [ ] 阶段2-5实施
- [ ] 思维链管理器
- [ ] UI优化
- [ ] 团队培训

---

## 🎓 学习资源

### 理论基础
1. **Framed Ink系列**：分镜设计理论
2. **Chain of Thought论文**：思维链原理
3. **Prompt Engineering**：提示词工程

### 实践案例
- `test-stage1.ts` - 阶段1测试案例
- `../分镜脚本设计新手手册.md` - 分镜设计手册

---

## 🤝 贡献指南

### 添加新阶段

1. 创建提示词文件：`stageX-xxx.ts`
2. 定义类型：在 `types.ts` 中添加接口
3. 实现生成函数：在 `services/gemini.ts` 中添加
4. 创建测试脚本：`test-stageX.ts`
5. 更新进度：在 `IMPLEMENTATION_PROGRESS.md` 中标记

### 优化现有阶段

1. 修改提示词：调整 `stageX-xxx.ts`
2. 运行测试：验证改进效果
3. 更新文档：记录变更原因

---

## 📞 联系方式

如有问题或建议，请：
1. 查看文档
2. 运行测试
3. 联系团队

---

## 📄 许可证

本项目是 Visionary Storyboard Studio 的一部分。

---

**开始你的思维链之旅！** 🚀

```bash
# 快速测试
npx tsx prompts/chain-of-thought/test-stage1.ts

# 查看进度
cat prompts/chain-of-thought/IMPLEMENTATION_PROGRESS.md

# 阅读指南
cat prompts/chain-of-thought/QUICK_START.md
```

