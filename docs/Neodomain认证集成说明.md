# Neodomain 认证集成说明

## 📋 概述

本项目使用 **Neodomain 统一登录 API** 进行用户认证。Neodomain 会自动处理短信验证码的发送和验证，我们只需要调用其 API 即可。

---

## 🔄 认证流程

```
用户输入手机号/邮箱
    ↓
前端调用 Neodomain API 发送验证码
    ↓
Neodomain 自动发送短信/邮件
    ↓
用户收到验证码
    ↓
用户输入验证码
    ↓
前端调用 Neodomain API 登录
    ↓
Neodomain 验证验证码
    ↓
返回 JWT Token 和用户信息
    ↓
前端保存到 localStorage
    ↓
登录成功
```

---

## 🔌 API 端点

### 1. 发送验证码

**接口**: `POST https://story.neodomain.cn/user/login/send-unified-code`

**请求参数**:
```json
{
  "contact": "13800138000"  // 手机号或邮箱
}
```

**响应**:
```json
{
  "success": true,
  "errCode": null,
  "errMessage": null
}
```

### 2. 统一登录

**接口**: `POST https://story.neodomain.cn/user/login/unified-login`

**请求参数**:
```json
{
  "contact": "13800138000",  // 手机号或邮箱
  "code": "123456",          // 验证码
  "invitationCode": "INVITE123"  // 可选：邀请码
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "authorization": "eyJhbGciOiJIUzUxMiJ9...",
    "userId": "1234567890",
    "email": "test@example.com",
    "mobile": "138****8000",
    "nickname": "John Doe",
    "avatar": "https://example.com/avatar.jpg",
    "status": 1
  },
  "errCode": null,
  "errMessage": null
}
```

---

## 💻 前端实现

### 文件位置
`services/auth.ts`

### 核心函数

#### 1. 发送验证码
```typescript
export async function sendVerificationCode(contact: string): Promise<void> {
  const response = await fetch(`${NEODOMAIN_API_BASE}/user/login/send-unified-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contact }),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.errMessage || '发送验证码失败');
  }
}
```

#### 2. 登录
```typescript
export async function login(
  contact: string,
  code: string,
  invitationCode?: string
): Promise<UserInfo> {
  const body: { contact: string; code: string; invitationCode?: string } = {
    contact,
    code,
  };

  if (invitationCode) {
    body.invitationCode = invitationCode;
  }

  const response = await fetch(`${NEODOMAIN_API_BASE}/user/login/unified-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.errMessage || '登录失败');
  }

  const userInfo: UserInfo = result.data;
  saveUserInfo(userInfo);

  return userInfo;
}
```

---

## 🔐 Token 管理

### 存储位置
- **localStorage.userInfo**: 完整的用户信息（JSON 字符串）
- **localStorage.accessToken**: JWT Token

### 使用方式
```typescript
// 获取 Token
const token = getAccessToken();

// 在 API 请求中使用
fetch(url, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

---

## ✅ 优势

1. **无需自建短信服务** - Neodomain 自动处理短信发送
2. **无需维护验证码** - Neodomain 自动管理验证码生成、存储、验证
3. **统一用户体系** - 与 Neodomain 平台用户打通
4. **安全可靠** - 使用 JWT Token 认证
5. **简化后端** - 后端只需要保存项目数据，无需处理认证逻辑

---

## 📝 注意事项

1. **验证码有效期**: 通常为 5-10 分钟（由 Neodomain 后端配置）
2. **手机号脱敏**: 响应中的手机号会脱敏显示（如 `138****8000`）
3. **Token 过期**: JWT Token 过期后需要重新登录
4. **错误处理**: 所有 API 调用都需要处理 `errCode` 和 `errMessage`

---

## 🔧 后端简化

由于使用 Neodomain API，后端认证路由已大幅简化：

**文件位置**: `cloudflare/src/routes/auth.ts`

**保留的端点**:
- `GET /api/auth/health` - 健康检查
- `POST /api/auth/verify` - Token 验证（可选）

**删除的端点**:
- ~~`POST /api/auth/send-code`~~ - 由 Neodomain 处理
- ~~`POST /api/auth/login`~~ - 由 Neodomain 处理
- ~~`POST /api/auth/logout`~~ - 前端直接清除 localStorage
- ~~`GET /api/auth/me`~~ - 用户信息已在登录时返回

---

## 📚 相关文档

- [Neodomain 用户认证接口文档](./用户认证接口文档.md)


