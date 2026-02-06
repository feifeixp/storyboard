# AI图片生成功能说明

## 📋 功能概述

本次更新集成了新的AI图片生成API，支持豆包AI绘画4.0等多种先进模型，生成的图片自动上传到阿里云OSS永久存储。

---

## ✨ 核心特性

### 1. 多模型支持
- ✅ **豆包AI绘画4.0** - 豆包最新一代AI绘画模型
- ✅ **Gemini 3 Pro Image** - Google最新图像生成模型
- ✅ 支持动态加载场景下的可用模型
- ✅ 自动识别默认模型和会员专属模型

### 2. OSS永久存储
- ✅ 图片自动上传到阿里云OSS
- ✅ 生成永久访问URL（不再是临时链接）
- ✅ STS令牌自动管理和刷新
- ✅ 支持自定义文件路径和命名

### 3. 异步任务模式
- ✅ 提交请求 → 轮询查询 → 下载上传
- ✅ 实时显示生成进度
- ✅ 支持超时和错误处理
- ✅ 自动重试机制

### 4. 丰富的配置选项
- ✅ 多种宽高比（1:1, 16:9, 9:16, 4:3等）
- ✅ 多种尺寸（1K, 2K, 4K）
- ✅ 负面提示词支持
- ✅ 引导比例调节（1.0-20.0）
- ✅ 随机种子控制

### 5. 会员和积分系统
- ✅ 支持会员权限验证
- ✅ 积分消耗计算
- ✅ 不同尺寸不同定价
- ✅ 会员专属模型标识

---

## 📁 新增文件

### 核心服务
| 文件 | 说明 | 行数 |
|------|------|------|
| `services/aiImageGeneration.ts` | AI图片生成服务 | 323行 |
| `services/oss.ts` | OSS上传服务（已修复） | 170行 |

### UI组件
| 文件 | 说明 | 行数 |
|------|------|------|
| `components/AIImageModelSelector.tsx` | 模型选择器组件 | 120行 |

### 文档
| 文件 | 说明 |
|------|------|
| `docs/AI图片生成集成指南.md` | 详细使用文档 |
| `docs/AI图片生成快速开始.md` | 快速开始指南 |
| `docs/AI图片生成功能说明.md` | 本文件 |

---

## 🚀 核心API

### 1. 模型管理

```typescript
// 获取场景下的可用模型
const models = await getModelsByScenario(ScenarioType.STORYBOARD);

// 获取默认模型
const model = await getDefaultStoryboardModel();
```

### 2. 图片生成

```typescript
// 提交生成请求
const task = await generateImage({
  prompt: '一个美丽的风景画',
  modelName: 'doubao-seedream-4-0',
  numImages: '1',
});

// 轮询查询结果
const result = await pollGenerationResult(task.task_code);
```

### 3. 一站式生成并上传

```typescript
// 生成图片并自动上传到OSS
const ossUrls = await generateAndUploadImage(
  {
    prompt: '分镜草图，黑白线稿',
    modelName: 'doubao-seedream-4-0',
    numImages: '1',
    aspectRatio: '16:9',
    size: '2K',
  },
  projectId,
  shotNumber,
  (stage, percent) => {
    console.log(`${stage}: ${percent}%`);
  }
);
```

---

## 🎨 使用示例

### 基础使用

```typescript
import { generateAndUploadImage } from './services/aiImageGeneration';

const ossUrls = await generateAndUploadImage(
  {
    prompt: '一个美丽的风景画，山川湖泊，日落',
    negativePrompt: 'blurry, low quality, watermark',
    modelName: 'doubao-seedream-4-0',
    numImages: '1',
    aspectRatio: '16:9',
    size: '2K',
  },
  'project_123',
  'shot_001'
);

console.log('图片URL:', ossUrls[0]);
```

### 在React组件中使用

```tsx
import AIImageModelSelector from './components/AIImageModelSelector';
import { generateAndUploadImage, ScenarioType } from './services/aiImageGeneration';

function MyComponent() {
  const [selectedModel, setSelectedModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const ossUrls = await generateAndUploadImage(
        {
          prompt: '分镜草图',
          modelName: selectedModel,
          numImages: '1',
        },
        projectId,
        shotNumber,
        (stage, percent) => {
          setProgress(`${stage}: ${percent}%`);
        }
      );
      alert('生成成功！');
    } catch (error) {
      alert(`生成失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <AIImageModelSelector
        value={selectedModel}
        onChange={setSelectedModel}
        scenarioType={ScenarioType.STORYBOARD}
      />
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? progress : '生成图片'}
      </button>
    </div>
  );
}
```

---

## 📊 参数配置

### 宽高比选项
- `1:1` - 正方形（头像、图标）
- `16:9` - 横屏（视频封面、分镜）⭐推荐
- `9:16` - 竖屏（手机壁纸）
- `4:3` - 传统照片
- `21:9` - 超宽屏

### 尺寸选项
- `1K` - 快速预览（积分消耗少）
- `2K` - 平衡质量和速度 ⭐推荐
- `4K` - 高清输出（适合打印）

### 引导比例
- `1.0-5.0` - 更自由的创作
- `7.5` - 推荐值 ⭐
- `10.0-20.0` - 严格遵循提示词

---

## ⚠️ 注意事项

### 1. 积分消耗
- 不同模型和尺寸消耗的积分不同
- 生成前请确保积分充足
- 可通过模型选择器查看具体定价

### 2. 会员权限
- 某些高级模型需要会员权限
- 模型选择器会显示🔒标识
- 非会员用户请选择无会员要求的模型

### 3. 生成时间
- 一般图片生成需要10-60秒
- 建议3-5秒轮询一次
- 默认最大等待时间3分钟

### 4. 提示词优化
- 使用详细、具体的描述
- 合理使用负面提示词
- 避免敏感、违规内容

---

## 🔄 迁移指南

### 从OpenRouter迁移

**旧代码**：
```typescript
const imageUrl = await generateSingleImage(prompt, imageModel, []);
```

**新代码**：
```typescript
const ossUrls = await generateAndUploadImage(
  {
    prompt: prompt,
    modelName: 'doubao-seedream-4-0',
    numImages: '1',
  },
  projectId,
  shotNumber
);
const imageUrl = ossUrls[0];
```

---

## 📚 相关文档

- [AI图片生成集成指南](./AI图片生成集成指南.md) - 详细使用文档
- [AI图片生成快速开始](./AI图片生成快速开始.md) - 快速开始指南
- [AI图片生成接口文档](../AI图片生成接口文档.md) - API接口文档
- [OSS-STS令牌接口文档](../OSS-STS令牌接口文档.md) - OSS接口文档

---

**创建时间**: 2026-02-06  
**版本**: 1.0.0  
**维护人**: AI Assistant

