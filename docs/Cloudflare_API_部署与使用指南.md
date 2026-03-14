# Visionary Storyboard Skill API 部署与使用指南

恭喜！您的 API 服务代码已经全部生成完毕，目前位于 `api/` 目录下。为了让大模型服务和最终的 OpenClaw Agent 能顺利访问，我们需要将其部署到 Cloudflare Workers 上。

由于部署涉及到您的私有账户和机密 API Key，**请您在终端中亲自执行以下操作**：

## 一、 部署前置操作 (环境认证与密钥注入)

1. **登录 Cloudflare 账户**  
   打开终端，首先进入 `api` 目录，然后执行登录命令：
   ```bash
   cd api
   npx wrangler login
   ```
   *这会自动在您的浏览器中弹出一个授权页面，点击 "Allow All" 完成身份验证。*

2. **注入机密 API Key (非常重要)**  
   您的 Hono 后端代码需要调用大模型，因此必须向 Cloudflare 安全环境中注入 API Key，这样就能避免明文把密码写进代码里。
   执行以下命令：
   ```bash
   npx wrangler secret put VITE_OPENROUTER1_API_KEY
   ```
   *当控制台提示 `Enter a secret value:` 时，粘贴您的自定义接口 API Key 并回车。*(如果同时使用 Gemini 等，也可重复运行此命令并替换为相应的 Key)

## 二、 正式发布上线

在完成上一步后，依然保持在 `api/` 目录下，直接执行发布命令：
```bash
npm run deploy
# 或者直接用 
npx wrangler deploy
```

发布成功并绑定自定义域名后，您的公网 API 域名将是：
`https://storyboard.neodomain.ai`

## 三、 更新 OpenAPI 配置文件

复制您的自定义域名，打开项目根目录下的 `docs/openapi.yaml` 文件，找到 `servers` 节点：
```yaml
servers:
  - url: https://storyboard.neodomain.ai # <--- 替换成您真实的部署链接或自定义域名
    description: Production Environment
```

## 四、 本地与联调测试

如果您想在没有改好公网部署前单独测试 API，您可以跑本地开发环境：
```bash
# 1. 在 `api` 目录下新建一个名为 `.dev.vars` 的文本文件
# 2. 里面写入您的测试 Key:
VITE_OPENROUTER1_API_KEY="sk-xxxx..."

# 3. 启动本地服务
npx wrangler dev
```
然后您可以用任意 HTTP 客户端发起 POST 测试：
```bash
curl -X POST http://localhost:8787/api/v1/characters/extract \
  -H "Content-Type: application/json" \
  -d '{"scriptContent": "晋安站起身，林溪拔出长剑..."}'
```
