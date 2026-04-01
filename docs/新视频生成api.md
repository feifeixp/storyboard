# 视频生成接口文档

## 1. 提交视频生成任务

- **接口描述**：提交视频生成任务，支持文生视频、图生视频以及全能模型生成的任务请求。
- **接口地址**：`/agent/user/video/generate`
- **请求方式**：`POST`
- **Content-Type**：`application/json`

### 1.1 请求参数 (Request Body)

| 参数名称 | 类型 | 必填 | 默认值 | 描述说明 | 示例 |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `shotId` | Long | 否 | - | 分镜ID | `1` |
| `sourceType` | String | 否 | - | 数据来源类型：<br>`USER_DIRECT`-用户直接生成<br>`CANVAS_SHOT`-Canvas分镜生成 | `USER_DIRECT` |
| `modelName` | String | **是** | - | 模型名称 | `neo-video-2-0`, `neo-video-2-0-fast` |
| `generationType` | String | **是** | - | 生成类型：<br/>`UNIVERSAL_TO_VIDEO`<br/>`IMAGE_TO_VIDEO`<br/>`REFERENCE_TO_VIDEO`<br/>`TEXT_TO_VIDEO` | `UNIVERSAL_TO_VIDEO` |
| `prompt` | String | **是** | - | 提示词 | `A futuristic city at night` |
| `negativePrompt` | String | 否 | - | 负面提示词 | - |
| `firstFrameImageUrl` | String | 否 | - | 首帧图片URL(图生视频或全能模型时使用) | `https://example.com/first.jpg` |
| `lastFrameImageUrl` | String | 否 | - | 尾帧图片URL(全能模型时使用) | `https://example.com/last.jpg` |
| `referenceVideoUrls` | Array(String) | 否 | - | 全能模型参考视频URL列表 | `["https://example.com/ref_video.mp4"]` |
| `videoReferType` | String | 否 | - | 视频参考类型: `feature`(特征参考), `base`(待编辑视频) | `base` |
| `keepOriginalSound` | String | 否 | - | 是否保留视频原声: `yes`, `no` | `yes` |
| `imageUrls` | Array(String) | 否 | - | 多图参考生成视频时的参考图列表 | - |
| `audioUrl` | Array(String) | 否 | - | 音频URL列表 | - |
| `aspectRatio` | String | 否 | - | 视频宽高比 | `16:9` |
| `resolution` | String | 否 | - | 视频分辨率 | `1080p` |
| `duration` | String | 否 | - | 视频时长 | `5s` |
| `seed` | Integer | 否 | - | 随机种子 | - |
| `generateAudio` | Boolean | 否 | `false` | 是否生成音频 | `false` |
| `enhancePrompt` | Boolean | 否 | `false` | 是否启用提示词增强 | `false` |
| `promptOptimizer` | Boolean | 否 | `false` | 是否使用提示词优化器 | `false` |
| `draft` | Boolean | 否 | `false` | 是否生成草稿视频 | `false` |
| `sessionId` | String | 否 | - | 会话ID | - |

### 1.2 响应参数 (Response Body)

外层由于统一封装在 `SingleResponse<T>`，所以返回主要数据在 `data` 字段内。

| 参数名称 | 类型 | 描述说明 |
| :--- | :--- | :--- |
| `success` | Boolean | 是否成功 |
| `errCode` | String | 错误代码 |
| `errMessage` | String | 错误信息 |
| `data` | Object | 返回的具体数据内容（详情见下表） |

**`data` 对象参数表格**：

| 字段名称 | 类型 | 描述说明 |
| :--- | :--- | :--- |
| `id` | Long | 数据库记录ID |
| `generationRecordId` | String | **生成记录ID** (用于后续查询状态) |
| `modelName` | String | 模型名称 |
| `modelProvider` | String | 模型提供商 |
| `generationType` | String | 生成类型 |
| `prompt` | String | 提示词 |
| `negativePrompt` | String | 负面提示词 |
| `status` | String | 任务状态，可选值：`PENDING`, `PROCESSING`, `SUCCESS`, `FAILED` |
| `statusDesc` | String | 状态描述 |
| *(其他与生成任务相关的字段同步返回)* | - | - |

***

## 2. 查询视频生成状态

- **接口描述**：根据 `generationRecordId` 轮询/查询对应的视频生成进度与状态及结果。
- **接口地址**：`/agent/user/video/status/{generationRecordId}`
- **请求方式**：`GET`

### 2.1 请求参数 (Path Variables)

| 参数名称 | 类型 | 必填 | 描述说明 | 示例 |
| :--- | :--- | :---: | :--- | :--- |
| `generationRecordId` | String | **是** | 视频生成记录ID (由提交接口返回) | `rec_123abc` |

### 2.2 响应参数 (Response Body)

返回结构与请求接口类似，依然被包装在 `SingleResponse<T>`。当状态变更为成功时，会携带有真实的视频链接、封面等信息。

**`data` 对象详解**：

| 字段名称 | 类型 | 描述说明 |
| :--- | :--- | :--- |
| `id` | Long | 记录内网ID |
| `generationRecordId` | String | 生成记录ID |
| `status` | String | **任务状态**：`PENDING`, `PROCESSING`, `SUCCESS`, `FAILED` |
| `statusDesc` | String | 状态的详细文字描述 |
| `ossVideoUrl` | String | 生成成功的视频 OSS URL (SUCCESS时返回) |
| `thumbnailUrl` | String | 缩略图/首帧图 URL (SUCCESS时返回) |
| `videoDurationSeconds` | BigDecimal | 实际视频时长(秒) |
| `errorCode` | String | 错误码 (FAILED时返回) |
| `errorMessage` | String | 错误信息 (FAILED时返回) |
| `startTime` | DateTime | 开始处理时间 |
| `completeTime` | DateTime | 生成完成时间 |
| `modelName` | String | 所用模型名称 (示例: `neo-video-2-0`) |
| `modelProvider` | String | 模型提供商 |
| `generationType` | String | 生成类型 (示例: `TEXT_TO_VIDEO`) |
| `prompt` | String | (实际使用的)提示词 |
| `negativePrompt` | String | 负面提示词 |
| `firstFrameImageUrl`| String | 首帧图片URL |
| `lastFrameImageUrl` | String | 尾帧图片URL |
| `imageUrls` | Array | 参考图片URL列表 |
| `videoUrls` | Array | 参考视频URL列表 |
| `audioUrls` | Array | 参考音频URL列表 |
| `aspectRatio` | String | 视频宽高比 |
| `resolution` | String | 视频分辨率 |
| `duration` | Integer | (预期配置) 视频时长数值 |
| `fps` | Integer | 帧率 |
| `seed` | Integer | 随机种子 |
| `draft` | Integer | 是否草稿模式 (1-是, 0-否) |

### 2.3 响应示例

```json
{
  "success": true,
  "errCode": "200",
  "errMessage": "success",
  "data": {
    "generationRecordId": "rec_abcdef123",
    "status": "SUCCESS",
    "statusDesc": "生成成功",
    "ossVideoUrl": "https://oss.example.com/videos/xyz.mp4",
    "thumbnailUrl": "https://oss.example.com/videos/xyz_thumb.jpg",
    "videoDurationSeconds": 5.0,
    "modelName": "neo-video-2-0",
    "generationType": "TEXT_TO_VIDEO",
    "prompt": "A futuristic city at night",
    "aspectRatio": "16:9",
    "resolution": "1080p",
    "startTime": "2026-03-26T12:00:00.000+00:00",
    "completeTime": "2026-03-26T12:02:30.000+00:00"
  }
}
```
