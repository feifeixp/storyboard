---
type: "always_apply"
description: "分镜脚本生成项目的特定规则，包括角度规则强制校验"
scope: "project"
project: "visionary-storyboard-studio"
---

# 分镜脚本生成项目 - 项目规则配置文件

**版本**: 1.0  
**项目**: visionary-storyboard-studio  
**作用域**: 仅当前项目  
**最后更新**: 2024-12-26

> ⚠️ **重要提示**：
> - 本文件包含分镜脚本生成项目的特定规则
> - 这些规则与项目代码紧密耦合，不适用于其他项目
> - 通用规则请参考 `global-rules.md`

---

## 规则分组

### 🎬 分镜角度规则（最高优先级）

#### R008: 角度规则强制校验
- **规则类型**: mandatory（强制）
- **描述**: 修改角度相关代码前必须查阅角度规则文件，确保符合规范
- **触发条件**:
  - 修改 `services/constants.ts`
  - 修改 `services/openrouter.ts`
  - 修改 `prompts/chain-of-thought/stage3-shot-planning.ts`

#### 核心规则定义

| 规则项 | 要求 | 优先级 |
|--------|------|--------|
| 正面镜头占比 | ≤7%（30个镜头最多2个） | 最高 |
| 平视镜头占比 | 10-15%（禁止连续2个以上） | 最高 |
| 默认角度高度 | 轻微仰拍/轻微俯拍（40-50%） | 最高 |
| 极端角度占比 | ≥15%（必须有，不能全是温和角度） | 高 |

#### 验证检查项

**常量验证**:
- ✅ `DEFAULTS.ANGLE_HEIGHT` = "轻微仰拍(Mild Low)"
- ✅ `SHOT_RULES.MAX_FRONT_VIEW_SHOTS` = 2
- ✅ `SHOT_RULES.MAX_EYE_LEVEL_RATIO` = 0.15

**提示词验证**:
- ✅ `services/openrouter.ts` 中正面占比 ≤7%
- ✅ `services/openrouter.ts` 中平视占比 10-15%
- ✅ `prompts/chain-of-thought/stage3-shot-planning.ts` 中正面占比 ≤7%

#### 相关文件清单

| 文件 | 描述 | 关键内容 |
|------|------|----------|
| `services/constants.ts` | 角度常量定义 | DEFAULTS.ANGLE_HEIGHT, SHOT_RULES |
| `services/openrouter.ts` | 分镜生成提示词 | 角度分布规则表格 |
| `prompts/chain-of-thought/stage3-shot-planning.ts` | 思维链阶段3 | 角度分配规则 |
| `services/angleValidation.ts` | 角度验证服务 | 验证函数 |
| `docs/rules/角度规则优化总结.ini` | 角度规则详细文档 | 完整规则定义 |

#### 防回归检查清单

修改代码前必须确认：
- [ ] 正面镜头占比 ≤7%
- [ ] 平视镜头占比 10-15%
- [ ] 默认角度高度为"轻微仰拍"而非"平视"
- [ ] 极端角度占比 ≥15%
- [ ] 所有提示词中的角度分布规则与规则文件一致
- [ ] 没有修改关键常量（除非有明确的规则更新）

#### 规则文档引用

⚠️ 修改角度相关代码前，必须先查阅：
- `docs/rules/角度规则优化总结.ini` - 核心角度规则
- `.augment/rules/分镜设计连续性三原则.txt` - 连续性规则
- `docs/rules/提示词规范标准.ini` - 提示词规范

---

## 📋 使用验证功能

### 代码中集成验证

```typescript
import { validateAngleDistribution, generateAngleDistributionReport } from './services/angleValidation';

// 生成分镜后验证
const report = validateAngleDistribution(shots);

if (!report.overall.isValid) {
  console.warn('⚠️ 角度分布存在问题：');
  report.overall.errors.forEach(err => console.error(err));
  report.overall.warnings.forEach(warn => console.warn(warn));
}

// 输出详细报告
console.log(generateAngleDistributionReport(shots));
```

### 验证报告示例

```
═══════════════════════════════════════════════════════════════
                    角度分布验证报告
═══════════════════════════════════════════════════════════════
总镜头数：30

✅ 正面镜头占比符合规则：2个（6.7%）
✅ 平视镜头占比符合规则：4个（13.3%）
✅ 极端角度占比符合规则：5个（16.7%）
✅ 轻微角度占比符合规则：12个（40.0%）

✅ 角度分布完全符合规则！
═══════════════════════════════════════════════════════════════
```

---

## 🔗 规则依赖关系

```
project-rules.md (本文件)
  ↓ 引用
docs/rules/角度规则优化总结.ini
.augment/rules/分镜设计连续性三原则.txt
docs/rules/提示词规范标准.ini
  ↓ 应用于
services/constants.ts
services/openrouter.ts
prompts/chain-of-thought/stage3-shot-planning.ts
services/angleValidation.ts
```

---

## 📝 规则更新流程

1. **提出修改需求** - 说明为什么需要修改规则
2. **更新规则文件** - 修改对应的 .ini 或 .txt 文件
3. **同步代码实现** - 修改所有相关代码文件
4. **验证一致性** - 运行测试，确保规则生效
5. **更新本文件** - 记录规则变更
6. **更新开发日志** - 在 DEVELOPMENT_LOG.md 中记录

---

**创建时间**: 2024-12-26
**维护人**: AI Assistant
**适用范围**: 仅 visionary-storyboard-studio 项目

---

## 🌐 R009: API 调用规范（强制）

> ⛔ 本节规则因多次线上事故（Mixed Content、ModelSelector崩溃、构建失败）总结而来，**禁止违反**。

### 9.1 后端 API 端点

| 用途 | 地址 | 协议 | 备注 |
|------|------|------|------|
| 自建 LLM API（前端直连） | `https://ai-api.neodomain.cn/v1` | **HTTPS** | 唯一允许的前端直连地址 |
| Cloudflare Worker 代理 | `${VITE_API_URL}/api/ai-proxy` | HTTPS（Worker内部转HTTP） | 短时请求走此路径 |
| ALB 后端（仅 Worker 内） | `http://alb-r3li6yh4ktpwq7ugkg.ap-southeast-1.alb.aliyuncsslbintl.com:7000/v1` | HTTP（仅服务端可用） | **绝对不能**出现在前端代码 |
| 旧地址（永久废弃） | `http://47.237.171.88:3000` | ❌ 禁止使用 | Mixed Content 根因 |

**强制规则**：
- ✅ 前端代码中所有 API URL 必须使用 **HTTPS**
- ❌ 前端代码中绝对禁止出现 `http://47.237.171.88` 或任何 HTTP 明文地址
- ❌ 前端代码中绝对禁止出现 ALB 地址（仅 Cloudflare Worker 服务端使用）

### 9.2 三种 API 调用模式

#### 模式 A：`getGeminiClient()`（OpenAI SDK，走 Worker 代理）

```typescript
// 内部私有，不对外导出
// baseURL = ${VITE_API_URL}/api/ai-proxy
// 适用场景：短时请求（<30s），大多数分镜生成调用
const client = getGeminiClient();
const resp = await client.chat.completions.create({ model, messages, stream: true });
```

#### 模式 B：`getOpenRouterDirectClient()`（OpenAI SDK，前端直连）

```typescript
// 内部私有，不对外导出
// baseURL = https://ai-api.neodomain.cn/v1
// 适用场景：长时流式请求（>30s），避免 Worker 30s 超时限制
// 例：extractImagePromptsStream、generateStoryboard 等主流程函数
const client = getOpenRouterDirectClient();
const stream = await client.chat.completions.create({ model, messages, stream: true });
```

#### 模式 C：`getLLMChatCompletionsURL()` + 原生 `fetch`

```typescript
// 从 openrouter.ts 导入，返回 'https://ai-api.neodomain.cn/v1/chat/completions'
import { getLLMChatCompletionsURL } from './openrouter';

const response = await fetch(getLLMChatCompletionsURL(), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER1_API_KEY}`,
    'HTTP-Referer': window.location.origin,
  },
  body: JSON.stringify({ model, messages, temperature, max_tokens }),
});
```

**使用场景**：需要精细控制请求体（如多模态图像上传）的服务文件

**强制规则**：
- ✅ 使用 `getLLMChatCompletionsURL()` 函数，**永远不要硬编码 URL**
- ✅ `getLLMChatCompletionsURL` 必须从 `./openrouter` 或 `../openrouter` 导入
- ❌ 不能自行拼接 `https://ai-api.neodomain.cn/v1/chat/completions`

### 9.3 API Key 管理

```typescript
// getApiKey() 是 openrouter.ts 内部私有函数，不对外导出
// 外部服务文件需要 apiKey 时，用以下方式（仅用于原生 fetch 场景）：
'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER1_API_KEY}`
```

**强制规则**：
- ✅ API Key 环境变量名：`VITE_OPENROUTER1_API_KEY`
- ❌ 不能重复造轮子重新读取环境变量；OpenAI SDK 客户端由 `openrouter.ts` 内部统一管理
- ❌ 不能将 API Key 硬编码在源代码中

### 9.4 支持的模型（MODELS 常量）

> ⛔ **高危区域**：`MODELS` 对象已裁剪为仅 Gemini 模型。引用不存在的 key 将导致 `undefined`，进而在运行时崩溃（如 `undefined.includes()` 错误）。

```typescript
// services/openrouter.ts 中当前有效的 MODELS 常量（截至 2026-03）
export const MODELS = {
  GEMINI_2_5_FLASH: 'gemini-2.5-flash',        // ✅ 默认，速度快
  GEMINI_3_FLASH_PREVIEW: 'gemini-3-flash-preview', // 新版快速
  GEMINI_2_5_PRO: 'gemini-3-pro-preview',       // 注：映射到同一模型
  GEMINI_3_PRO_PREVIEW: 'gemini-3-pro-preview', // 思维链，复杂任务
  GEMINI_3_PRO_IMAGE_PREVIEW: 'gemini-3-pro-image-preview', // 图像理解专用
} as const;
```

**已永久删除的模型常量（禁止引用）**：

| 常量名 | 值（已废弃） |
|--------|-------------|
| `MODELS.GPT_5_MINI` | `gpt-5-mini` |
| `MODELS.GPT_4O_MINI` | `gpt-4o-mini` |
| `MODELS.MINIMAX_M2_5` | `minimax-m2.5` |
| `MODELS.KIMI_K_2_5` | `kimi-k2.5` |
| `MODELS.CLAUDE_HAIKU_4_5` | `claude-haiku-4.5` |
| `MODELS.CLAUDE_SONNET_4_5` | `claude-sonnet-4.5` |
| `MODELS.DEEPSEEK_CHAT` | `deepseek-chat` |

**强制规则**：
- ✅ 新增模型选择时，必须先确认 `MODELS` 对象中存在对应 key
- ✅ UI 可选模型列表（`ModelSelector.tsx`）必须只包含 `MODELS` 中存在的 key
- ❌ 绝对禁止引用上表中的废弃常量
- ❌ 新增 `ModelSelector.tsx` 的模型条目前，必须同步在 `openrouter.ts` 的 `MODELS` 中添加

### 9.5 文件职责分工

| 文件 | 职责 | 注意事项 |
|------|------|---------|
| `services/openrouter.ts` | 所有 LLM 调用的**唯一入口**；定义 MODELS、客户端、getLLMChatCompletionsURL | 修改此文件前先阅读本规则 |
| `components/ModelSelector.tsx` | UI 模型选择器；模型列表必须与 `MODELS` 同步 | 不能引用不存在的 MODELS key |
| `cloudflare/src/routes/aiProxy.ts` | Worker 代理路由；服务端 HTTP 转发 | ALB 地址只在此处出现 |
| `services/sceneSupplement.ts` 等 | 业务服务，使用模式 C（fetch + getLLMChatCompletionsURL） | 禁止硬编码 URL |

### 9.6 部署规范

```bash
# 标准构建 + 部署流程
npm run build
npx wrangler pages deploy dist --project-name=storyboard --commit-dirty=true
```

**关键参数**：
- Cloudflare Pages 项目名：`storyboard`（**不是** `visionary-storyboard-studio`）
- 生产地址：`https://storyboard.neodomain.ai`
- Worker 地址：`https://storyboard-api.neodomain.ai`

### 9.7 防回归检查清单

修改 API 相关代码前必须确认：
- [ ] 没有引入任何 HTTP（非 HTTPS）的前端 API 地址
- [ ] 没有硬编码 `https://ai-api.neodomain.cn/v1/chat/completions`（必须用函数）
- [ ] `ModelSelector.tsx` 中的每个模型常量都在 `MODELS` 对象中存在
- [ ] `getLLMChatCompletionsURL` 已从 `openrouter.ts` 导出（构建时会报错）
- [ ] `getApiKey`、`getGeminiClient`、`getOpenRouterDirectClient` 保持私有（不导出）
- [ ] 构建命令 `npm run build` 执行成功（无错误，warnings 可忽略）

