# 👑 OpenClaw Skill 最终接入指南 (全自动动态验证 + 设定图生成版)

本指南将指导您如何在 OpenClaw 中配置并发布 **Visionary Storyboard Skill** 插件。

## 架构升级说明
根据您的最新要求，我们在 API 中加入了一个阻塞式的大模型生图代理端点。
现在，OpenClaw 智能体不仅可以帮您提取文字人物，还能**自动调用底层的 `gemini-3.0-flash-image` 为角色绘制 包含头像和三视图 的设定图**，并将图像直链直接发送在对话框里！

---

## 1. 在 OpenClaw 中配置 OpenAPI 规范

以下是最新的包含了 **生成设定图** 节点的完整 OpenAPI 规范，**请直接复制并在 OpenClaw 的 Skill 导入界面粘贴**：

```yaml
openapi: 3.0.3
info:
  title: Visionary Storyboard Skill API
  description: Skills for AI Agents to interact with the Visionary Storyboard engines. Includes authentication, character extraction, reference image generation, and script cleaning.
  version: 1.0.0
servers:
  - url: https://visionary-storyboard-skill-api.feifeixp.workers.dev
    description: Production Cloudflare Worker

paths:
  /api/v1/auth/send-code:
    post:
      summary: Send Login Verification Code
      description: Sends an SMS or Email verification code to the user based on their contact information. Use this FIRST to initiate login.
      operationId: sendCode
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - contact
              properties:
                contact:
                  type: string
                  description: The user's phone number or email address.
      responses:
        '200':
          description: Code sent successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  errMessage:
                    type: string

  /api/v1/auth/login:
    post:
      summary: Login with Verification Code
      description: Logs the user in using the code they received. Returns the `accessToken`.
      operationId: unifiedLogin
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - contact
                - code
              properties:
                contact:
                  type: string
                  description: The user's phone number or email address.
                code:
                  type: string
                  description: The 6-digit verification code.
      responses:
        '200':
          description: Login successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: object
                    properties:
                      authorization:
                        type: string
                        description: The Bearer Token (accessToken) to use for subsequent API calls.
                  errMessage:
                    type: string

  /api/v1/characters/extract:
    post:
      summary: Extract Characters from Script
      description: Parses raw script text, identifies core characters, and generates detailed, purely visual descriptions.
      operationId: extractCharacters
      parameters:
        - in: header
          name: accessToken
          required: true
          description: JWT accessToken obtained from Login.
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - scriptContent
              properties:
                scriptContent:
                  type: string
                  description: The raw movie/animation script snippet.
      responses:
        '200':
          description: Successful Extraction
          content:
            application/json:
              schema:
                type: object

  /api/v1/characters/generate-reference:
    post:
      summary: Generate Character Reference Sheet
      description: Generates a visual reference sheet (turnaround + 3-views + headshot avatar) for a character based on their extracted appearance. Auto-applies standard layout tags and uses gemini-3.0-flash-image internally.
      operationId: generateCharacterReference
      parameters:
        - in: header
          name: accessToken
          required: true
          description: JWT accessToken string.
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - name
                - appearance
              properties:
                name:
                  type: string
                  description: The name of the character.
                appearance:
                  type: string
                  description: The detailed visual appearance of the character.
      responses:
        '200':
          description: Sheet Generated Successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  imageUrls:
                    type: array
                    items:
                      type: string

  /api/v1/script/clean:
    post:
      summary: Clean and Pre-process Script
      description: Separates visual content from dialogues and extracts psychological "mood tags".
      operationId: cleanScript
      parameters:
        - in: header
          name: accessToken
          required: true
          description: JWT accessToken string.
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - scriptContent
              properties:
                scriptContent:
                  type: string
      responses:
        '200':
          description: Cleaned script data
          content:
            application/json:
              schema:
                type: object

  /api/v1/prompts/generate-video-prompts:
    post:
      summary: Generate Machine-Readable Prompts
      description: Translates a structured Shot list into rigorous, style-agnostic technical Image Generation prompts.
      operationId: generateVideoPrompts
      parameters:
        - in: header
          name: accessToken
          required: true
          description: JWT accessToken string.
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - shots
              properties:
                shots:
                  type: array
                  items:
                    type: object
      responses:
        '200':
          description: A list of prompts
          content:
            application/json:
              schema:
                type: object
```

---

## 2. 互动测试 (全自动生图工作流)

由于生图 API 已经被挂载并在后端配置好了固定的模型与画风，您可以体验到丝滑的“提取 + 绘图”一条龙服务。

* **对配置好的 Agent 说话：** 
  > 🗣️ *"请帮我从这段文字中提取角色，并为他们画出设定图：'林溪，20岁，穿着白色赛博机甲装甲，手持光剑，长发飘飘'"*
  
  🤖 *智能体会要求验证码登录，完成登录后它会串行调用两个接口：*
  1. 调用 `extractCharacters` 提炼出标准外表属性。
  2. 自动调用 `generateCharacterReference` 并挂起等待（可能需要 15-40 秒）。
  3. 当 Cloudflare 轮询拿到 Neodomain 最终生成的永久链接后，直接以 Markdown 图片卡片的格式回复给您：
  
  🤖 *"这是为您生成的林溪角色设定图（包含头像和三视图）："*
  ![林溪设定图](https://oss.neodomain.cn/.....jpg)

整个过程全在 OpenClaw 的一个聊天框内完成，极致简洁！
