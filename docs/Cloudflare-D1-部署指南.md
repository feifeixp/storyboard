# Cloudflare D1 数据库部署指南

本指南将帮助你将分镜脚本生成项目的数据存储从 localStorage 迁移到 Cloudflare D1 数据库。

---

## 📋 前置要求

1. **Cloudflare 账号**
   - 注册地址：https://dash.cloudflare.com/sign-up
   - 免费计划即可使用 D1 数据库

2. **Node.js 环境**
   - 版本要求：Node.js 18+ 
   - 安装 Wrangler CLI：`npm install -g wrangler`

3. **域名（可选）**
   - 如果需要自定义域名，需要在 Cloudflare 托管域名

---

## 🚀 部署步骤

### 步骤1：安装 Cloudflare Workers 依赖

```bash
cd cloudflare
npm install
```

### 步骤2：登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器，授权 Wrangler 访问你的 Cloudflare 账号。

### 步骤3：创建 D1 数据库

```bash
# 创建生产环境数据库
wrangler d1 create storyboard-db

# 创建开发环境数据库
wrangler d1 create storyboard-db-dev
```

命令执行后会输出数据库ID，类似：
```
✅ Successfully created DB 'storyboard-db'
Database ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 步骤4：配置数据库ID

将上一步获得的数据库ID填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "storyboard-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # 填入你的数据库ID

[[env.dev.d1_databases]]
binding = "DB"
database_name = "storyboard-db-dev"
database_id = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"  # 填入开发环境数据库ID
```

### 步骤5：初始化数据库表结构

```bash
# 生产环境
wrangler d1 execute storyboard-db --file=./schema.sql

# 开发环境（本地测试）
wrangler d1 execute storyboard-db --local --file=./schema.sql
```

### 步骤6：本地测试

```bash
# 启动本地开发服务器
npm run dev
```

访问 http://localhost:8787/health 测试 API 是否正常运行。

### 步骤7：部署到 Cloudflare

```bash
# 部署到生产环境
npm run deploy
```

部署成功后会输出 Workers URL，类似：
```
✨ Deployment complete!
https://storyboard-api.your-subdomain.workers.dev
```

---

## 🔧 配置前端

### 步骤1：设置 API URL

在前端项目根目录创建 `.env` 文件：

```env
# 开发环境
VITE_API_URL=http://localhost:8787

# 生产环境（部署后替换为实际URL）
# VITE_API_URL=https://storyboard-api.your-subdomain.workers.dev
```

### 步骤2：修改数据存储服务

在 `services/projectStorage.ts` 中，将导入从 `projectStorage` 改为 `d1Storage`：

```typescript
// 修改前
import { getAllProjects, saveProject, deleteProject } from './services/projectStorage';

// 修改后
import { getAllProjects, saveProject, deleteProject } from './services/d1Storage';
```

---

## 📊 数据迁移

### 方法1：自动迁移（推荐）

在前端应用中添加迁移按钮：

```typescript
import { migrateFromLocalStorage } from './services/d1Storage';

async function handleMigrate() {
  const result = await migrateFromLocalStorage();
  
  if (result.success) {
    alert(`迁移成功！已迁移 ${result.migratedProjects} 个项目`);
  } else {
    alert(`迁移失败：\n${result.errors.join('\n')}`);
  }
}
```

### 方法2：手动导出/导入

1. **导出现有数据**：
   ```typescript
   import { exportProjectToFile } from './services/d1Storage';
   
   // 导出单个项目
   await exportProjectToFile('project-id');
   ```

2. **导入到新系统**：
   ```typescript
   import { importProjectFromFile } from './services/d1Storage';
   
   // 选择文件导入
   const file = event.target.files[0];
   await importProjectFromFile(file);
   ```

---

## 🔍 验证部署

### 1. 测试 API 健康检查

```bash
curl https://your-api-url.workers.dev/health
```

预期响应：
```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "environment": "production"
}
```

### 2. 测试数据库连接

```bash
# 查询数据库
wrangler d1 execute storyboard-db --command "SELECT COUNT(*) FROM projects"
```

### 3. 测试前端集成

1. 登录应用
2. 创建新项目
3. 刷新页面，确认数据持久化
4. 在 Cloudflare Dashboard 中查看数据库记录

---

## 📝 常见问题

### Q1: 数据库查询失败

**错误**：`D1_ERROR: no such table: projects`

**解决**：重新执行数据库迁移脚本
```bash
wrangler d1 execute storyboard-db --file=./schema.sql
```

### Q2: CORS 错误

**错误**：`Access to fetch at 'xxx' from origin 'xxx' has been blocked by CORS policy`

**解决**：在 `wrangler.toml` 中添加你的前端域名到 CORS 白名单：
```typescript
// src/index.ts
app.use('/*', cors({
  origin: ['https://your-frontend-domain.com'],
  // ...
}));
```

### Q3: 认证失败

**错误**：`Unauthorized: Missing access token`

**解决**：确保前端正确传递 accessToken：
```typescript
headers: {
  'accessToken': getAccessToken(),
}
```

---

## 💰 费用说明

Cloudflare D1 免费计划限额：
- **存储空间**：5GB
- **每日读取**：500万次
- **每日写入**：10万次

对于个人项目和小团队，免费计划完全够用。

---

## 🔗 相关资源

- [Cloudflare D1 官方文档](https://developers.cloudflare.com/d1/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Hono 框架文档](https://hono.dev/)

---

**部署完成后，你的数据将安全存储在 Cloudflare 的全球边缘网络中，支持多设备同步和协作！** 🎉

