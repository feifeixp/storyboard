# Seedance 2.0 & 2.0 fast API 接入文档

## 1. 概述
本文档介绍 Seedance 2.0 和 Seedance 2.0 fast 模型独有或配置有区别的 API 参数。存量 API 基础参数的完整介绍请参考“视频生成 API”。

**特别注意事项：**
- 仅限预览及邀测用户使用，不承诺正式 API 上线 100% 一致。
- 请勿截图/分享给其他人员。
- 请确保上传的内容由您原创或已取得授权。

## 2. 模型能力与选型
Seedance 2.0 和 Seedance 2.0 fast 提供的核心能力一致。
- **Seedance 2.0**: 追求最高生成品质，推荐使用。
- **Seedance 2.0 fast**: 更注重成本与生成速度，不要求极限品质时推荐。

### 支持的生成模式
1. **纯文生视频**: 输入文本提示词生成目标视频。
2. **图生视频-首帧**: 输入首帧图片 + 文本提示词（可选）生成。
3. **图生视频-首尾帧**: 输入首帧图片 + 尾帧图片 + 文本提示词（可选）生成。
4. **多模态参考生视频 (New)**: 输入参考图片（0~9张） + 参考视频（0~3个） + 参考音频（0~3段） + 文本提示词（可选）生成。支持生成全新视频、编辑视频、延长视频。
   > **注意**：不可单独输入音频，必须至少包含 1 个参考视频或图片。

### 模型能力对比表

| 特性 / 模型名称 | doubao-seedance-2-0-260128 | doubao-seedance-2-0-fast-260128 | doubao-seedance-1-5-pro-251215 |
| --- | --- | --- | --- |
| **文生视频** | ✅ | ✅ | ✅ |
| **图生视频-首帧** | ✅ | ✅ | ✅ |
| **图生视频-首尾帧** | ✅ | ✅ | ✅ |
| **多模态参考(图片/视频/音频组合)** | ✅ | ✅ | ❌ |
| **编辑视频 / 延长视频** | ✅ | ❌ | ❌ |
| **生成有声视频** | ✅ | ✅ | ❌ |
| **联网搜索增强** | ✅ | ❌ | ❌ |
| **输出视频规格** | 480p, 720p<br/>时长: 4~15秒<br/>格式: mp4 | 480p, 720p<br/>时长: 4~15秒<br/>格式: mp4 | 480p, 720p, 1080p<br/>时长: 4~12秒<br/>格式: mp4 |
| **在线推理限流(RPM/并发)** | 600 / 10 | 600 / 10 | 600 / 10 |

*(注：相比历史 1.0/1.5 模型，2.0 新增了多模态参考、编辑视频、延长视频、配音视频、联网增强搜索等重要功能)*

---

## 3. API 接口规范
所有的 API 均共享相同的鉴权方式，通过 HTTP Header 传递：
`Authorization: Bearer <YOUR_ARK_API_KEY>`

### 3.1 创建视频生成任务 (Create)
**Endpoint:** `POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`

#### 请求参数 (Request Payload)

- `model` (string, 必选): 模型 ID，如 `"doubao-seedance-2-0-260128"` 或 `"doubao-seedance-2-0-fast-260128"`。
- `content` (array of objects, 必选): 输入给模型的信息。数组内支持组合文本、图片、视频、音频。
- `generate_audio` (boolean, 选填): 默认 `true`。控制生成的视频是否包含与画面同步的声音。模型会基于文本提示词与视觉内容自动生成人声、音效和 BGM。(注：人声对话建议放在双引号中)。
- `resolution` (string, 选填): 默认 `"720p"`。支持 `"480p"`, `"720p"`。
- `ratio` (string, 选填): 默认 `"adaptive"`。生成视频的宽高比。支持 `"16:9"`, `"4:3"`, `"1:1"`, `"3:4"`, `"9:16"`, `"21:9"`, `"adaptive"` (根据输入自动选择最佳比例)。
- `duration` (integer, 选填): 默认 `5`。视频时长，单位秒。取值范围 `[4, 15]` 或设为 `-1` (让模型自行选择)。
- `watermark` (boolean, 选填): 是否添加水印。
- `tools` (array of objects, 选填): 配置模型工具。2.0 版本支持联网搜索工具，结构为 `[{"type": "web_search"}]`。

#### `content` 数组元素详情

**1. 文本信息**
```json
{
  "type": "text",
  "text": "描述视频的提示词。支持中英文。建议中文<500字，英文<1000词。"
}
```

**2. 图片信息**
图片格式限制: jpeg, png, webp, bmp, tiff, gif。单张 <30MB，比例范围(0.4, 2.5)，边长(300, 6000)。
```json
{
  "type": "image_url",
  "image_url": {
    "url": "http公网URL，或 Base64(data:image/png;base64,...), 或 素材ID(asset://<ID>)"
  },
  "role": "first_frame" 
}
```
**`role` 取值说明：**
- 首帧生视频：配置此对象一次，`role` 填 `"first_frame"` 或不填。
- 首尾帧生视频：配置此对象两次，需明确 `"first_frame"` 和 `"last_frame"`。
- 多模态参考生视频：配置 1~9 次，`role` 统一填 `"reference_image"`。
*(注意：首尾帧模式不能和多模态参考生视频混用)*

**3. 视频信息** (仅 2.0 系列支持)
视频格式限制: mp4, mov。长宽边介于300~6000px，像素满足 480p~720p。单视频 [2, 15] 秒且 <50MB。最多传 3 个参考视频，总时长 <15秒。
```json
{
  "type": "video_url",
  "video_url": {
    "url": "视频公网URL 或 素材 ID (asset://<ID>)"
  },
  "role": "reference_video" 
}
```

**4. 音频信息** (仅 2.0 系列支持)
格式限制: wav, mp3。单个 [2, 15] 秒且 <15MB。最多传 3 段，总长 <15秒。不可单独使用，需结合视频/图片使用。
```json
{
  "type": "audio_url",
  "audio_url": {
    "url": "音频公网URL 或 Base64 或 素材 ID"
  },
  "role": "reference_audio" 
}
```

---

### 3.2 查询视频生成任务 (Get)
任务采用异步生成机制。创建任务后需通过不断轮询（例如每隔 30 秒）获取任务状态。
**Endpoint:** `GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{task_id}`

#### 响应状态说明:
- `status`: 任务状态。包含 `"running"`, `"succeeded"`, `"failed"` 等。当为 `"succeeded"` 时，可通过响应中的字段获取成品链接。生成结果需在 24 小时内下载。
- `usage`: 包含 token 和 tool 用量统计（例如 `usage.tool_usage.web_search` 表示搜索调用次数）。

---

## 4. 调用示例 (Examples)

### 4.1. 多模态参考生成
利用提示词 + 参考图 + 参考视频 + 参考音频综合生成视频：
```bash
curl https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks \
 -H "Content-Type: application/json" \
 -H "Authorization: Bearer $ARK_API_KEY" \
 -d '{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    {
      "type": "text",
      "text": "全程使用视频1的第一视角构图，背景音乐使用音频1。首帧为图片1，尾帧为图片2。"
    },
    { "type": "image_url", "image_url": { "url": "https://.../pic1.jpg" }, "role": "reference_image" },
    { "type": "image_url", "image_url": { "url": "https://.../pic2.jpg" }, "role": "reference_image" },
    { "type": "video_url", "video_url": { "url": "https://.../video1.mp4" }, "role": "reference_video" },
    { "type": "audio_url", "audio_url": { "url": "https://.../audio1.mp3" }, "role": "reference_audio" }
  ],
  "generate_audio": true,
  "ratio": "16:9",
  "duration": 11
}'
```

### 4.2. 编辑视频
替换现有视频中的元素（无需音频，改变画风/对象）：
```bash
curl https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks \
 -H "Content-Type: application/json" \
 -H "Authorization: Bearer $ARK_API_KEY" \
 -d '{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "将视频1礼盒中的香水替换成图片1中的面霜，运镜不变" },
    { "type": "image_url", "image_url": { "url": "https://.../pic1.jpg" }, "role": "reference_image" },
    { "type": "video_url", "video_url": { "url": "https://.../video1.mp4" }, "role": "reference_video" }
  ],
  "generate_audio": true,
  "ratio": "16:9",
  "duration": 5
}'
```

### 4.3. 延长视频 / 扩展视频
传入多个视频作为序列，实现镜头的自然衔接。
```bash
curl https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks \
 -H "Content-Type: application/json" \
 -H "Authorization: Bearer $ARK_API_KEY" \
 -d '{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "视频1完成后接视频2，之后接视频3" },
    { "type": "video_url", "video_url": { "url": "https://.../video1.mp4" }, "role": "reference_video" },
    { "type": "video_url", "video_url": { "url": "https://.../video2.mp4" }, "role": "reference_video" },
    { "type": "video_url", "video_url": { "url": "https://.../video3.mp4" }, "role": "reference_video" }
  ],
  "duration": 8
}'
```

### 4.4. 联网搜索增强 (Web Search)
针对生成时效性强的内容开放网络检索权限：
```bash
curl https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks \
 -H "Content-Type: application/json" \
 -H "Authorization: Bearer $ARK_API_KEY" \
 -d '{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "微距镜头对准叶片上翠绿的玻璃蛙..." }
  ],
  "tools": [{ "type": "web_search" }]
}'
```

---

## 5. 虚拟数字人预置素材库 (Asset URI)
视频生成平台提供预置的公共/私有虚拟数字人素材，可以在 `url` 参数中直接调用该系统资产。格式为 `asset://<ASSET_ID>`。

**示例调用方式：**
```json
{
  "type": "image_url",
  "image_url": {
    "url": "asset://asset-20260224200602-qn7wr"
  },
  "role": "reference_image"
}
```

> **注意**：首次通过 API 使用虚拟人像时，需先在“方舟体验中心” Web 端体验一次视频生成，完成弹窗呈现的 **《虚拟人像库使用协议》** 授权认证后，方可进行高频 API 调用。若需要使用您上传的自有数字人素材库，需先联系商务进行合规材料报备和入库操作。
