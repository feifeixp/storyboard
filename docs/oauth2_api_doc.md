# OAuth2 三方授权登录接口文档

> **版本**: v1.0 | **更新日期**: 2026-05-07 | **基础路径**: `/user/oauth` | **协议**: HTTPS | **数据格式**: JSON

---

## 客户端凭据

| 项目 | 值 |
|------|-----|
| **client_id** | `neowpw_community` |
| **client_secret** | `sk_neowpw_c1576dcd043c4362beec9a22a5b0e963` |

> ⚠️ `client_secret` 为机密信息，仅限服务端使用，严禁在前端代码或公开渠道暴露。

---

## 1. 授权流程概览

本系统采用 **OAuth2 授权码模式（Authorization Code Grant）** 的简化实现。

### 时序流程

```
三方网站                     本平台API                      本平台前端                    用户浏览器
   |                           |                              |                            |
   |-- 1. GET /authorize ----->|                              |                            |
   |<-- 返回登录页URL ---------|                              |                            |
   |                           |                              |                            |
   |-- 2. 重定向用户 --------->|----------------------------->|--------------------------->|
   |                           |                              |                            |
   |                           |                              |<-- 3. 用户完成登录 ---------|
   |                           |                              |                            |
   |                           |<-- 4. POST /authorize/login --|                            |
   |                           |-- 返回 redirectUrl ---------->|                            |
   |                           |                              |-- 5. 跳转 redirectUrl ----->|
   |                           |                              |                            |
   |<-- 6. 回调 code+state ----|-------------------------------|<---------------------------|
   |                           |                              |                            |
   |-- 7. POST /token -------->|                              |                            |
   |<-- 返回 JWT Token --------|                              |                            |
   |                           |                              |                            |
   |-- 8. 用Token调业务接口 -->|                              |                            |
```

| 步骤 | 执行方 | 说明 |
|------|--------|------|
| 1 | 三方服务端/前端 | 调用 `GET /user/oauth/authorize` 获取授权登录页 URL |
| 2 | 三方前端 | 将用户重定向到返回的登录页 URL |
| 3 | 用户 | 在平台登录页完成验证码登录 |
| 4 | 平台前端 | 调用 `POST /user/oauth/authorize/login` 生成授权码 |
| 5-6 | 平台前端→用户 | 跳转回三方 `redirect_uri`，URL 携带 `code` 和 `state` |
| 7 | **三方服务端** | 调用 `POST /user/oauth/token` 用授权码换取 JWT Token（**必须服务端调用**） |
| 8 | 三方服务端 | 使用 JWT Token 调用本平台所有业务接口 |

---

## 2. 统一响应格式

所有接口使用 `SingleResponse<T>` 统一响应（COLA 框架）：

**成功响应：**
```json
{
  "success": true,
  "errCode": null,
  "errMessage": null,
  "data": { ... }
}
```

**失败响应：**
```json
{
  "success": false,
  "errCode": "1001",
  "errMessage": "具体错误描述",
  "data": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | `boolean` | 请求是否成功 |
| `errCode` | `string\|null` | 错误码，成功时为 `null` |
| `errMessage` | `string\|null` | 错误描述，成功时为 `null` |
| `data` | `T\|null` | 响应数据，失败时为 `null` |

---

## 3. 接口定义

---

### 3.1 发起授权（获取登录页URL）

验证三方参数合法性，返回平台前端授权登录页面的 URL。

- **路径**: `GET /user/oauth/authorize`
- **认证**: 无需认证
- **Content-Type**: 无（Query String 传参）

#### 请求参数（Query String）

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `clientId` | `string` | **是** | - | 三方应用客户端ID，由平台分配 |
| `redirectUri` | `string` | **是** | - | 授权成功后回调地址，必须与注册时完全一致 |
| `responseType` | `string` | 否 | `code` | 响应类型，固定 `code` |
| `state` | `string` | 否 | - | 防 CSRF 随机串，授权成功后原样回传 |

#### 请求示例

```
GET /user/oauth/authorize?clientId=demo_app_001&redirectUri=https%3A%2F%2Fthird-party.com%2Fcallback&responseType=code&state=abc123
```

#### 成功响应

```json
{
  "success": true,
  "errCode": null,
  "errMessage": null,
  "data": "https://dev.neodomain.cn/oauth/authorize?params=eyJjbGllbnRJZCI6ImRlbW9fYXBwXzAwMSIsInJlZGlyZWN0VXJpIjoiaHR0cHM6Ly90aGlyZC1wYXJ0eS5jb20vY2FsbGJhY2siLCJzdGF0ZSI6ImFiYzEyMyJ9"
}
```

**`data`** 为完整 URL，三方应将用户浏览器重定向到此地址。URL 中 `params` 参数是 Base64 URL-safe 编码（无 padding）的 JSON：

```javascript
// 前端解码
const params = JSON.parse(atob(urlParams.get('params')));
// { "clientId": "demo_app_001", "redirectUri": "https://third-party.com/callback", "state": "abc123" }
```

#### 错误响应

| errCode | errMessage | 原因 |
|---------|------------|------|
| `PARAM_ERROR` | 仅支持 response_type=code | `responseType` 不是 `code` |
| `1001` | 无效的 client_id | `clientId` 不存在或已禁用 |
| `1001` | redirect_uri 不在允许的回调地址列表中 | `redirectUri` 未在平台注册 |

---

### 3.2 授权码换取 Token

三方服务端用授权码换取本平台 JWT Token。

> **⚠️ 安全警告**：此接口 **必须在三方服务端调用**，需携带 `clientSecret`，绝不可在前端调用！

- **路径**: `POST /user/oauth/token`
- **认证**: 无需登录（通过 `clientId` + `clientSecret` 验证）
- **Content-Type**: `application/json`

#### 请求体

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `grantType` | `string` | **是** | `@NotBlank`，固定 `authorization_code` | 授权类型 |
| `code` | `string` | **是** | `@NotBlank` | 步骤 3.2 获取的一次性授权码 |
| `redirectUri` | `string` | **是** | `@NotBlank`，须与授权时一致 | 回调地址 |
| `clientId` | `string` | **是** | `@NotBlank` | 客户端ID |
| `clientSecret` | `string` | **是** | `@NotBlank` | 客户端密钥（平台分配，**严禁泄露**） |

#### 请求示例

```http
POST /user/oauth/token
Content-Type: application/json

{
  "grantType": "authorization_code",
  "code": "oac_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "redirectUri": "https://third-party.com/callback",
  "clientId": "demo_app_001",
  "clientSecret": "sk_demo_secret_2026"
}
```

#### 成功响应

```json
{
  "success": true,
  "errCode": null,
  "errMessage": null,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjM0NTY...",
    "tokenType": "Bearer",
    "expiresIn": 2592000,
    "userId": "usr_123456",
    "nickname": "张三",
    "avatar": "https://cdn.example.com/avatars/user123.jpg",
    "email": "zhangsan@example.com",
    "mobile": "138****1234",
    "status": 1,
    "userType": "PERSONAL"
  }
}
```

**`data` 字段（OAuthTokenRes）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `accessToken` | `string` | JWT Token，可直接调用本平台所有业务接口 |
| `tokenType` | `string` | 固定 `Bearer` |
| `expiresIn` | `long` | 有效期（秒），默认 `2592000`（30天） |
| `userId` | `string` | 用户唯一标识 |
| `nickname` | `string` | 用户昵称 |
| `avatar` | `string` | 用户头像完整 URL |
| `email` | `string` | 用户邮箱 |
| `mobile` | `string` | 手机号（掩码，如 `138****1234`） |
| `status` | `integer` | 用户状态：`0`=未激活，`1`=正常，`2`=禁用 |
| `userType` | `string` | 用户类型：`PERSONAL`=个人用户，`ENTERPRISE`=企业用户 |

#### 使用 Token 调用业务接口

```http
GET /api/some-business-endpoint
accesstoken: eyJhbGciOiJIUzI1NiJ9...
```

或：

```http
GET /api/some-business-endpoint
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

#### 错误响应

| errCode | errMessage | 原因 |
|---------|------------|------|
| `1001` | 不支持的grant_type | `grantType` 值不正确 |
| `1001` | 无效的 client_id | `clientId` 不存在或已禁用 |
| `2000` | client_secret 无效 | `clientSecret` 不匹配 |
| `2000` | 授权码无效或已过期 | `code` 不存在/已用/超 5 分钟 |
| `2000` | client_id 不匹配 | 换取时 `clientId` 与授权时不一致 |
| `2000` | redirect_uri 不匹配 | 换取时 `redirectUri` 与授权时不一致 |
| `3001` | 用户不存在 | 授权码对应用户已删除 |
| `1000` | 授权信息异常，请重新授权 | 系统异常 |

---

## 4. 错误码汇总

### OAuth2 专用错误码（25xx）

| errCode | 常量名 | 说明 |
|---------|--------|------|
| `2501` | `OAUTH_CLIENT_NOT_FOUND` | 客户端不存在或已禁用 |
| `2502` | `OAUTH_REDIRECT_URI_INVALID` | 回调地址不在白名单 |
| `2503` | `OAUTH_CODE_INVALID` | 授权码无效或已过期 |
| `2504` | `OAUTH_CODE_USED` | 授权码已被使用 |
| `2505` | `OAUTH_CLIENT_SECRET_INVALID` | 客户端密钥无效 |
| `2506` | `OAUTH_GRANT_TYPE_UNSUPPORTED` | 不支持的授权类型 |
| `2507` | `OAUTH_PARAM_MISMATCH` | 参数与授权时不匹配 |

### 通用错误码

| errCode | 常量名 | 说明 |
|---------|--------|------|
| `1000` | `SYSTEM_ERROR` | 系统内部错误 |
| `1001` | `PARAM_ERROR` | 参数错误 |
| `2000` | `UNAUTHORIZED` | 未授权/需要登录 |
| `3001` | `USER_NOT_FOUND` | 用户不存在 |
| `3004` | `USER_ACCOUNT_DISABLED` | 用户账户已禁用 |

---

## 5. 安全约束

### 5.1 授权码

| 项目 | 说明 |
|------|------|
| 格式 | `oac_` + 32位UUID（无连字符），共36字符 |
| 有效期 | **5 分钟** |
| 使用次数 | **一次性**，换取 Token 后立即销毁 |
| 存储 | Redis，Key: `oauth:code:<授权码>` |

### 5.2 Token 复用

- 换取的 Token 是用户在平台已有的 JWT Token（非新生成）
- 有效期与用户原始登录会话一致（默认 30 天）
- 权限与用户本人完全一致

### 5.3 redirect_uri 白名单

- 注册时以 JSON 数组配置，如：`["https://a.com/cb","https://b.com/cb"]`
- **如果客户端未配置 `redirect_uris`（为空或空数组），则不限制回调地址，允许任意 `redirectUri` 通过**
- 已配置白名单时，校验为 **精确匹配**，不支持通配符
- 换取 Token 时的 `redirectUri` 必须与生成授权码时完全一致

### 5.4 client_secret

- **严禁** 在前端、客户端、日志中暴露
- 换取 Token 接口 **只能在服务端调用**
- 泄露后请立即联系平台重置

---

## 6. 集成代码示例

### Python

```python
import requests

BASE_URL = "https://api.example.com"
CLIENT_ID = "demo_app_001"
CLIENT_SECRET = "sk_demo_secret_2026"
REDIRECT_URI = "https://third-party.com/callback"

# 步骤 1: 发起授权
resp = requests.get(f"{BASE_URL}/user/oauth/authorize", params={
    "clientId": CLIENT_ID,
    "redirectUri": REDIRECT_URI,
    "responseType": "code",
    "state": "random_csrf_string"
})
login_url = resp.json()["data"]
# → 重定向用户到 login_url

# 步骤 2: 回调中用授权码换 Token
def handle_callback(code, state):
    resp = requests.post(f"{BASE_URL}/user/oauth/token", json={
        "grantType": "authorization_code",
        "code": code,
        "redirectUri": REDIRECT_URI,
        "clientId": CLIENT_ID,
        "clientSecret": CLIENT_SECRET
    })
    token_data = resp.json()["data"]
    access_token = token_data["accessToken"]
    # 使用 Token 调用业务接口
    biz = requests.get(f"{BASE_URL}/api/endpoint", headers={"accesstoken": access_token})
```

### Node.js

```javascript
const axios = require('axios');

// 步骤 1: 发起授权
const { data: authResp } = await axios.get(`${BASE_URL}/user/oauth/authorize`, {
  params: { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, responseType: 'code', state: 'xyz' }
});
// res.redirect(authResp.data) → 重定向用户

// 步骤 2: 回调中换 Token
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const { data: tokenResp } = await axios.post(`${BASE_URL}/user/oauth/token`, {
    grantType: 'authorization_code', code,
    redirectUri: REDIRECT_URI, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET
  });
  const { accessToken } = tokenResp.data;
  // 使用 Token 调用业务接口
  const biz = await axios.get(`${BASE_URL}/api/endpoint`, { headers: { accesstoken: accessToken } });
});
```

### Java

```java
// 回调接口中用授权码换 Token
@GetMapping("/callback")
public void handleCallback(@RequestParam("code") String code, @RequestParam("state") String state) {
    Map<String, String> body = Map.of(
        "grantType", "authorization_code",
        "code", code,
        "redirectUri", REDIRECT_URI,
        "clientId", CLIENT_ID,
        "clientSecret", CLIENT_SECRET
    );
    String json = objectMapper.writeValueAsString(body);
    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create(BASE_URL + "/user/oauth/token"))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(json))
        .build();
    HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    // 解析 response.body() 获取 accessToken
}
```

---

## 7. 数据库表结构参考

### ai_oauth_clients（客户端应用表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 主键 |
| `client_id` | `varchar(64)` UNIQUE | 客户端ID |
| `client_secret` | `varchar(128)` | 客户端密钥 |
| `client_name` | `varchar(100)` | 应用名称 |
| `client_description` | `varchar(500)` | 应用描述 |
| `redirect_uris` | `text` | 回调地址白名单（JSON数组） |
| `auto_approve` | `tinyint` | 0=需确认，1=自动授权 |
| `status` | `tinyint` | 0=禁用，1=正常 |

### ai_oauth_authorization_records（授权记录表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 主键 |
| `user_id` | `varchar(50)` | 用户ID |
| `client_id` | `varchar(64)` | 客户端ID |
| `authorization_code` | `varchar(64)` | 授权码（仅前8位，脱敏） |
| `status` | `tinyint` | 0=授权码已生成，1=Token已换取，2=已过期 |
| `authorize_ip` | `varchar(50)` | 授权时IP |
| `token_exchange_ip` | `varchar(50)` | 换取Token时IP |
| `token_exchange_time` | `datetime` | 换取Token时间 |
