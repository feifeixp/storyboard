# Cloudflare Pages 部署指南

**项目**: Visionary Storyboard Studio  
**更新时间**: 2026-02-06

---

## 🚀 快速部署步骤

### 1. 修复部署配置

创建 `wrangler.toml` 文件（已为你准备好）：

```toml
name = "visionary-storyboard-studio"
compatibility_date = "2026-02-06"

[site]
bucket = "./dist"
```

### 2. Cloudflare Pages 控制台配置

登录 [Cloudflare Pages](https://dash.cloudflare.com/) 并配置：

| 配置项 | 值 |
|--------|-----|
| **Framework preset** | Vite |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` |
| **Node.js version** | 22 |

**重要**：删除或清空 "Deploy command" 字段

---

## 🔑 环境变量配置（API Keys）

### 在 Cloudflare Pages 设置环境变量

1. 进入项目 → **Settings** → **Environment variables**
2. 添加以下环境变量：

#### 必需的环境变量

```bash
# OpenRouter API Key (必需 - 用于分镜生成)
VITE_OPENROUTER1_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**获取方式**：
- 访问 https://openrouter.ai/
- 注册账号并充值（建议充值 $10-20）
- 在 Keys 页面创建 API Key

#### 可选的环境变量

```bash
# DeepSeek API Key (可选 - 更便宜的模型)
VITE_DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Gemini API Key (可选 - Google 模型)
VITE_GEMINI_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**DeepSeek 获取方式**：
- 访问 https://platform.deepseek.com/
- 注册账号并充值（非常便宜，¥1/百万tokens）

**Gemini 获取方式**：
- 访问 https://aistudio.google.com/
- 创建 API Key（有免费额度）

---

## ⚠️ 重要安全提示

### 问题：API Key 暴露风险

当前架构中，API Key 是在**前端代码**中使用的（`dangerouslyAllowBrowser: true`），这意味着：

❌ **API Key 会暴露在浏览器中**  
❌ **任何人都可以查看和盗用你的 Key**  
❌ **可能导致高额费用**

### 解决方案：使用后端代理

#### 方案1：Cloudflare Workers 代理（推荐）

创建一个 Cloudflare Worker 作为 API 代理：

```javascript
// worker.js
export default {
  async fetch(request, env) {
    // 只允许你的域名访问
    const origin = request.headers.get('Origin');
    if (!origin || !origin.includes('your-domain.pages.dev')) {
      return new Response('Forbidden', { status: 403 });
    }

    // 转发请求到 OpenRouter
    const apiKey = env.OPENROUTER_API_KEY; // 从 Worker 环境变量读取
    const url = new URL(request.url);
    const targetUrl = 'https://openrouter.ai' + url.pathname;

    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers),
        'Authorization': `Bearer ${apiKey}`,
      },
      body: request.body,
    });

    return response;
  }
}
```

然后修改前端代码，将 API 请求发送到你的 Worker 而不是直接发送到 OpenRouter。

#### 方案2：使用后端服务

- 部署一个后端服务（Node.js/Python）
- 后端存储 API Key
- 前端通过后端调用 AI API

---

## 📝 部署检查清单

### 部署前

- [ ] 已创建 `wrangler.toml` 配置文件
- [ ] 已在 Cloudflare Pages 设置环境变量
- [ ] 已获取 OpenRouter API Key 并充值
- [ ] 已测试本地构建 (`npm run build`)

### 部署后

- [ ] 访问部署的网站，检查是否正常加载
- [ ] 测试登录功能
- [ ] 测试分镜生成功能
- [ ] 检查浏览器控制台是否有错误
- [ ] 监控 API 使用量，防止滥用

---

## 🔧 常见问题

### Q1: 部署失败 "Missing entry-point"

**解决方案**：
- 确保已创建 `wrangler.toml` 文件
- 或在 Cloudflare Pages 设置中删除 "Deploy command"

### Q2: 环境变量不生效

**解决方案**：
- 确保环境变量名称以 `VITE_` 开头
- 在 Cloudflare Pages 中设置，而不是在代码中
- 重新部署项目

### Q3: API Key 被盗用怎么办

**解决方案**：
- 立即在 OpenRouter 控制台删除旧 Key
- 创建新的 API Key
- 更新 Cloudflare Pages 环境变量
- 考虑实施方案1（Worker 代理）

### Q4: 构建包太大（1.29MB）

**解决方案**：
- 使用代码分割（见下一节）
- 启用 gzip 压缩（Cloudflare 自动启用）
- 考虑使用 CDN 加载大型依赖

---

## 🎯 下一步优化

1. **实施 API 代理**：保护 API Key 安全
2. **代码分割**：减小初始加载体积
3. **添加监控**：监控 API 使用量和费用
4. **设置速率限制**：防止滥用

---

**维护人**: AI Assistant  
**最后更新**: 2026-02-06

