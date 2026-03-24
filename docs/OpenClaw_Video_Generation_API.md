# OpenClaw Skill API: 视频生成 (Seedance 2.0) 接入指南

为了让 OpenClaw 等外部 AI 智能体也能调动底层的视频生成能力进行全自动的故事板短片创作，我们已经在后端 API (`api/src/routes/storyboard.ts`) 中暴露并封装了对 Volcengine Seedance 2.0 模型的调用接口。

外部 Agent **无需知道**火山引擎的 API Key (系统后端统一注入保护)，只需使用用户登录换取的 `accessToken` 即可直接发起请求。由于视频生成耗时较长（1~5分钟），接口采用了**异步提交 + 轮询**的设计规范。

## 1. 提交视频生成任务
**接口**: `POST /api/v1/storyboard/submit-video`

**Header 鉴权**:
- `accessToken`: 用户的登录凭证

**请求参数 (JSON)**:
```json
{
  "model": "doubao-seedance-2-0-260128",
  "duration": 4,
  "content": [
    {
      "type": "text",
      "text": "镜头1：[景别] 远景 [摄像机运动] 缓慢推镜头..."
    },
    {
      "type": "image_url",
      "role": "reference_image",
      "image_url": { "url": "https://oss.../ref.jpg" }
    }
  ]
}
```

**响应说明**:
请求成功后会立即返回任务 ID (`task_id` / `req_id`)。
```json
{
  "success": true,
  "data": {
    "req_id": "021774...",
    "id": "t-123456789"
  }
}
```

---

## 2. 轮询视频生成状态
**接口**: `GET /api/v1/storyboard/video-status/{taskId}`

**Header 鉴权**:
- `accessToken`: 用户的登录凭证

**请求说明**:
在拿到上述接口的 `task_id` 后，建议智能体（Agent）使用内部的 setTimeout / sleep 工具，每隔 5 到 10 秒轮询一次本接口。

**响应说明**:
- `status` 字段可能有：`running`、`succeeded`、`failed`、`pending`。
- 只有当 `status` 变为 `succeeded` 时，可以提取到 MP4 地址。

```json
{
  "success": true,
  "data": {
    "id": "t-123456789",
    "status": "succeeded",
    "content": {
      "video_url": "https://tos-cn-xx.volces.com/video..."
    }
  }
}
```

## 注意事项与建议 (Agent Prompt 写作须知)

1. **组合能力调用模式**：建议 Agent 先调用剧本清洗 (`/script/clean`) -> 分镜提示词拆解 (`/prompts/generate-video-prompts`) -> 分组（由于时长限制，每 15 秒需要划归一组） -> 调用此接口发起各组的首尾视频生成 -> 循环轮询状态 -> 将视频 URL 组织成 markdown 返回给用户。
2. **抗敏感拦截**：如果在调用时报错出现 "sensitive information"，该组件不包含前端的重写机制。这意味着 Agent 若收到此类失败反馈，自己需要思考并修改提示词再发起！
3. **接口契约已更新**：相关接口定义已更新至项目根目录 `docs/openapi.yaml`，请直接在 Agent 开发端导入更新即可生效。
