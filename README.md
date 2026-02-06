<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1U6efUJDjnGUDh51zEi9FwJbQmNqptWUs

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set API keys in [.env.local](.env.local):
   ```
   VITE_OPENROUTER1_API_KEY=sk-or-v1-...  # OpenRouter API Key (必需)
   VITE_DEEPSEEK_API_KEY=sk-...            # DeepSeek API Key (可选，用于更便宜的模型)
   VITE_GEMINI_API_KEY=...                 # Gemini API Key (可选)
   ```
3. Run the app:
   `npm run dev`

## 支持的模型

| 模型 | 提供商 | 价格 | 说明 |
|------|--------|------|------|
| DeepSeek V3 | DeepSeek | ¥1/M | 🔥最便宜，推荐日常使用 |
| GPT-4o Mini | OpenRouter | $0.15/M | |
| Gemini 2.5 Flash | OpenRouter | $0.30/M | |
| Gemini 3 Flash Preview | OpenRouter | $0.50/M | ⭐默认推荐 |
| Claude Haiku 4.5 | OpenRouter | $1.00/M | |
| Gemini 2.5 Pro | OpenRouter | $1.25/M | 高质量 |
| Claude Sonnet 4.5 | OpenRouter | $3.00/M | 最强 |

## 📚 文档导航

### 项目交付
- **[项目交付文档](./PROJECT_DELIVERY.md)** - 完整的项目交付说明（功能清单、部署指南、性能指标）
- **[最终总结](./FINAL_SUMMARY.md)** - 项目成果总结（核心价值、关键指标、未来规划）

### 核心文档
- **[完整项目文档](./PROJECT.md)** - 项目架构、功能说明、使用指南（1500+行完整文档）
- **[开发日志](./DEVELOPMENT_LOG.md)** - 开发历史记录和重大变更（2800+行）
- **[功能文档](./docs/)** - 功能使用指南和参考资料
- **[规则库](./.augment/rules/)** - 核心规则和规范（155KB）
- **[历史报告](./reports/2024年12月/)** - 项目报告归档

## 🎯 快速链接

### 新手入门
1. 阅读 [完整项目文档](./PROJECT.md) 了解项目全貌
2. 查看 [智能补充快速开始](./docs/智能补充快速开始.md) 体验核心功能
3. 参考 [功能验证清单](./docs/功能验证清单.md) 测试功能

### 开发者
- [规则库索引](./.augment/rules/README.md) - 查看所有开发规则
- [开发日志](./DEVELOPMENT_LOG.md) - 了解开发历史
- [参考资料](./docs/references/) - AI工具手册和理论文档
