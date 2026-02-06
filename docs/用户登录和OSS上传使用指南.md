# 用户登录和OSS上传使用指南

**版本**: v1.0  
**创建时间**: 2026-02-06  
**适用范围**: Visionary Storyboard Studio

---

## 📋 概述

本系统已集成用户登录认证和阿里云OSS文件上传功能，用户必须登录后才能使用分镜生成功能，生成的结果可以上传到云端存储。

---

## 🔐 用户登录功能

### 登录方式

系统支持两种登录方式：
1. **手机号验证码登录**
2. **邮箱验证码登录**

### 登录步骤

1. **打开系统**
   - 访问系统URL，自动跳转到登录页面

2. **输入联系方式**
   - 输入手机号（11位，以1开头，第二位为3-9）
   - 或输入邮箱地址

3. **获取验证码**
   - 点击"发送验证码"按钮
   - 系统会发送6位数字验证码到您的手机或邮箱
   - 60秒倒计时后可重新发送

4. **输入验证码**
   - 输入收到的6位验证码

5. **输入邀请码（可选）**
   - 如果有邀请码，可以输入
   - 没有邀请码可以跳过

6. **点击登录**
   - 登录成功后自动跳转到主界面

### 用户信息显示

- 登录成功后，页面顶部左侧会显示用户信息
- 包括头像（如有）和昵称/手机号/邮箱

### 退出登录

- 点击页面顶部右侧的"🚪 退出"按钮
- 退出后会清除本地登录信息，返回登录页面

---

## ☁️ OSS文件上传功能

### 功能说明

系统集成了阿里云OSS（对象存储服务），可以将生成的分镜图片和视频上传到云端存储。

### 上传方式

#### 1. 上传文件对象

```typescript
import { uploadToOSS, generateOSSPath } from './services/oss';

// 生成文件路径
const filePath = generateOSSPath(
  'project123',  // 项目ID
  '01',          // 镜头编号
  'image',       // 文件类型（image/video）
  'png'          // 文件扩展名
);

// 上传文件
const fileUrl = await uploadToOSS(
  file,          // File 或 Blob 对象
  filePath,      // 文件路径
  (percent) => {
    console.log(`上传进度: ${percent}%`);
  }
);

console.log('文件URL:', fileUrl);
```

#### 2. 上传Base64图片

```typescript
import { uploadBase64ToOSS, generateOSSPath } from './services/oss';

// Base64图片数据
const base64Data = 'data:image/png;base64,iVBORw0KGgoAAAANS...';

// 生成文件路径
const filePath = generateOSSPath('project123', '01', 'image', 'png');

// 上传Base64图片
const imageUrl = await uploadBase64ToOSS(
  base64Data,
  filePath,
  (percent) => {
    console.log(`上传进度: ${percent}%`);
  }
);

console.log('图片URL:', imageUrl);
```

### 文件路径规范

OSS文件路径格式：
```
storyboard/{projectId}/{type}/shot_{shotNumber}_{timestamp}.{extension}
```

示例：
```
storyboard/project123/image/shot_01_1707217800000.png
storyboard/project123/video/shot_02_1707217900000.mp4
```

### 安全机制

- **STS临时凭证**：使用阿里云STS服务获取临时访问凭证
- **权限限制**：临时凭证仅有 `PutObject` 权限，只能上传文件
- **自动刷新**：STS令牌会自动缓存，提前5分钟刷新
- **登录验证**：必须登录后才能获取STS令牌

---

## 🔧 技术细节

### API接口

#### 1. 发送验证码

- **接口**: `POST /user/login/send-unified-code`
- **参数**: `{ contact: string }`
- **说明**: 统一接口，自动识别手机号或邮箱

#### 2. 统一登录

- **接口**: `POST /user/login/unified-login`
- **参数**: `{ contact: string, code: string, invitationCode?: string }`
- **返回**: UserInfo（包含 JWT Token）

#### 3. 获取OSS STS令牌

- **接口**: `GET /agent/sts/oss/token`
- **请求头**: `accessToken: {JWT Token}`
- **返回**: STSToken（包含临时访问凭证）

### 数据存储

- **用户信息**: 存储在 `localStorage.userInfo`
- **访问令牌**: 存储在 `localStorage.accessToken`
- **STS令牌**: 内存缓存，不持久化

---

## ❓ 常见问题

### Q1: 验证码收不到怎么办？

- 检查手机号或邮箱是否正确
- 检查垃圾邮件文件夹（邮箱登录）
- 等待60秒后重新发送

### Q2: 登录后刷新页面需要重新登录吗？

- 不需要，登录信息会保存在本地
- 除非手动点击"退出"按钮

### Q3: OSS上传失败怎么办？

- 检查是否已登录
- 检查网络连接
- 查看浏览器控制台错误信息

### Q4: 上传的文件在哪里？

- 文件存储在阿里云OSS
- Bucket: wlpaas
- Region: oss-cn-shanghai
- 可以通过返回的URL访问

---

**维护人**: AI Assistant  
**最后更新**: 2026-02-06

