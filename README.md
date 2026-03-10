
# Visionary Storyboard Studio

AI 驱动的全流程分镜草图生成工具——从剧本到九宫格分镜，一站式完成。

## ✨ 核心功能

- **项目管理**：多项目/多剧集管理，支持角色库、场景库、剧情大纲
- **剧本分析**：AI 自动提取角色、场景、剧情节拍
- **智能分镜**：五阶段思维链（剧本分析 → 视觉策略 → 镜头规划 → 镜头设计 → 质量检查）
- **角色/场景设定图**：AI 生成多形态角色设定图（正/侧/背 + 面部特写）
- **九宫格分镜草图**：批量生成 3×3 分镜草图，支持多种美术风格（12种预设 + 自定义）
- **提示词提取与优化**：自动提取生图提示词，支持自检修复
- **视觉一致性**：角色/场景参考图自动注入生图上下文，保持外观一致

## 🚀 快速开始

**环境要求：** Node.js 18+

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
cp .env.local.example .env.local
# 编辑 .env.local，填入你的 API Key

# 3. 启动开发服务器
npm run dev
```

## ⚙️ 环境变量

在 `.env.local` 中配置：

```
VITE_OPENROUTER1_API_KEY=sk-or-v1-...  # OpenRouter API Key（必需）
VITE_DEEPSEEK_API_KEY=sk-...            # DeepSeek API Key（可选）
VITE_GEMINI_API_KEY=...                 # Gemini API Key（可选）
```

## 🤖 支持的 LLM 模型

| 模型 | 提供商 | 价格 | 说明 |
|------|--------|------|------|
| DeepSeek V3 | DeepSeek | ¥1/M | 🔥最便宜，推荐日常使用 |
| GPT-4o Mini | OpenRouter | $0.15/M | |
| Gemini 2.5 Flash | OpenRouter | $0.30/M | |
| Gemini 3 Flash Preview | OpenRouter | $0.50/M | ⭐默认推荐 |
| Claude Haiku 4.5 | OpenRouter | $1.00/M | |
| Gemini 2.5 Pro | OpenRouter | $1.25/M | 高质量 |
| Claude Sonnet 4.5 | OpenRouter | $3.00/M | 最强 |

## 🎨 支持的生图模型

通过 Neodomain API 动态获取，支持：
- **Nano Banana 2**（默认）— 高质量分镜草图
- **Nano Banana Pro** — 专业级生图
- **Seedream 4.5** — 备选模型

## 🎭 支持的美术风格（12种）

3D国潮动漫 · 水墨写意 · 日式赛璐璐 · 电影超写实 · 3D黏土/盲盒 · 数字艺术厚涂 · 美式漫画 · 低多边形 · 像素艺术 · 2D Q版卡通 · 黑白电影 · 手绘线稿

## 📚 文档导航

| 文档 | 说明 |
|------|------|
| [项目交付文档](./PROJECT_DELIVERY.md) | 功能清单、部署指南、性能指标 |
| [完整项目文档](./PROJECT.md) | 项目架构、功能说明、使用指南 |
| [开发日志](./DEVELOPMENT_LOG.md) | 开发历史记录和重大变更 |
| [功能文档](./docs/) | 功能使用指南和参考资料 |

## 📝 更新日志

### 2026-03-10
- 修复角色设定图引用错误：多形态角色的设定图现在可以被正确识别
- 默认生图模型切换为 Nano Banana 2
- 优化九宫格生成时角色参考图的提取逻辑
