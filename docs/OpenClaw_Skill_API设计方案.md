# OpenClaw Skill API 集成方案设计

目前的 Visionary Storyboard Studio 是一个纯前端的 React (Vite) SPA 应用，所有的提示词构建（`prompts/*`）和 LLM 调用解析逻辑（`services/*`）都在浏览器端运行。目前的 `cloudflare-worker-proxy.js` 仅仅是一个为了保护 API Key 的反向代理。

如果想让 OpenClaw 的 Skill（智能体插件）调用“角色设定生成”、“剧本清洗精修”和“分镜提示词生成”能力，你需要将这些纯前端的 TypeScript 逻辑**剥离并封装为一个可被 HTTP 请求直接调用的后端 API 服务**。

以下是推荐的架构演进方案和实现步骤：

## 1. 架构选型建议

由于你已经有一部分代码（`cloudflare-worker-proxy.js`）部署在 Cloudflare Workers 上，且所有的 AI 能力都是通过 REST API (OpenRouter/Gemini) 调用的，**最推荐的做法是：使用 [Hono](https://hono.dev/) 框架重构 Cloudflare Worker**，将其从简单的透传代理，升级为全功能的 API 服务。

- **优势**：Hono + Cloudflare Worker 是边缘计算的最佳组合，冷启动快，且完全兼容你现有的 TypeScript 工具库。
- **替代方案**：如果你更熟悉传统 Node.js 服务器，也可以使用 **Express** 或 **Fastify** 独立起一个后端微服务，然后通过 Docker 部署。

---

## 2. API 接口设计 (OpenAPI 规范)

OpenClaw 等 AI Agent 框架要调用外部 Skill 时，通常需要一份符合 **OpenAPI (Swagger)** 规范的描述文件。你需要按照系统现有的业务流划分以下核心接口：

### 接口一：角色信息自动提取 API
- **Endpoint**: `POST /api/v1/characters/extract`
- **说明**: 传入原始剧本文本，大模型返回所有分析出的角色、性别与外观设定词。
- **Request Body**:
  ```json
  {
    "scriptContent": "晋安双手合十，林溪拔出长剑..."
  }
  ```
- **Response**:
  ```json
  {
    "characters": [
      {
        "name": "晋安",
        "gender": "男",
        "appearance": "浅棕色碎短发、蓬松有层次感..."
      }
    ]
  }
  ```

### 接口二：剧本智能清洗与精修 API
- **Endpoint**: `POST /api/v1/script/clean`
- **说明**: 输入原始剧本，输出剥离了非画面信息的分镜预处理列表，并带有情绪权重评估。
- **Request Body**:
  ```json
  { "scriptContent": "..." }
  ```
- **Response** (`CleanedScript`):
  ```json
  {
    "cleanedScenes": [...],
    "sceneWeights": [...],
    "moodTags": ["科技恐惧"]
  }
  ```

### 接口三：视频生成提示词批量转换 API
- **Endpoint**: `POST /api/v1/prompts/generate-video-prompts`
- **说明**: 传入已解析的分镜列表（Shots），核心系统完成情绪计算、视角计算，并返回给 Seedance 2.0 或其他生图工具的完整 Prompt 组。

---

## 3. 具体实施步骤改造

### 第一步：剥离核心逻辑，做到前后端同构 (Isomorphic)
目前在引用的 `prompts/extractCharactersPrompt.ts` 等文件，本身没有任何浏览器环境的依赖（如 `window` / `DOM`）。你应该把 `prompts/` 目录和部分不依赖 React 的 `services/` 取出来，作为核心库（Core Lib）。

### 第二步：创建 Hono API Worker
可以在仓库内创建一个新的工作区或独立仓库，例如 `packages/api`。
```typescript
import { Hono } from 'hono'
import { buildExtractCharactersPrompt } from '../prompts/extractCharactersPrompt';
// 导入你的 LLM 工具类

const app = new Hono()

app.post('/api/v1/characters/extract', async (c) => {
  const { scriptContent } = await c.req.json();
  const prompt = buildExtractCharactersPrompt(scriptContent);
  
  // 在这里发起对 OpenRouter 的请求 (取代原来的纯前端请求)
  const llmResponse = await fetchOpenRouterAPI(prompt, c.env.OPENROUTER_API_KEY);
  
  // 将结果打平为 JSON 返回给 OpenClaw
  return c.json(JSON.parse(llmResponse));
})

export default app
```

### 第三步：为 OpenClaw 编写 Skill 描述文件 (openapi.yaml)
OpenClaw 框架加载 Skill 时，依赖一份包含了所有输入输出结构的 yaml 文件。你只需把前面设计的 API 定义写成标准 `openapi.yaml`。
然后在 OpenClaw 中配置：
- **Server URL**: `https://api.your-worker.workers.dev`
- **API Header**: 可以加入简单的 Token 鉴权（在 Worker 中拦截）。

---

## 4. 后续方案
如果你觉得这个思路正确，我们可以按照以下路径一步步进行：
1. **先为你生成 Hono Cloudflare Worker 的基础后端脚手架代码。**
2. **将现存的各种 `prompt.ts` 构建器移动到可被后端导入的地方。**
3. **为你写出可以在 OpenClaw 直接注册的 `openapi.yaml` 规格文件。**

请问你想直接在我们当前这个代码库里新建一个 `api-server/` 目录来写这套后端代码，还是只希望我为你输出设计文档和 `openapi.yaml` 即可？
