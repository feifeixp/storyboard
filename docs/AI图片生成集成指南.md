# AI图片生成集成指南

## 概述

本项目已集成新的AI图片生成API，支持豆包AI绘画4.0等多种模型，生成的图片自动上传到阿里云OSS永久存储。

---

## 核心功能

### 1. 模型管理

#### 获取可用模型列表
```typescript
import { getModelsByScenario, ScenarioType } from './services/aiImageGeneration';

// 获取分镜场景下的可用模型
const models = await getModelsByScenario(ScenarioType.STORYBOARD);

// 获取设计场景下的可用模型
const models = await getModelsByScenario(ScenarioType.DESIGN);
```

#### 获取默认模型
```typescript
import { getDefaultStoryboardModel, getDefaultDesignModel } from './services/aiImageGeneration';

// 获取默认分镜模型
const model = await getDefaultStoryboardModel();

// 获取默认设计模型
const model = await getDefaultDesignModel();
```

---

### 2. 图片生成

#### 基础生成流程
```typescript
import { generateImage, pollGenerationResult } from './services/aiImageGeneration';

// 1. 提交生成请求
const task = await generateImage({
  prompt: '一个美丽的风景画，山川湖泊，日落，写实风格',
  negativePrompt: 'blurry, low quality, watermark',
  modelName: 'doubao-seedream-4-0',
  numImages: '1',
  aspectRatio: '16:9',
  size: '2K',
  outputFormat: 'jpeg',
  guidanceScale: 7.5,
});

// 2. 轮询查询结果
const result = await pollGenerationResult(
  task.task_code,
  (status, attempt) => {
    console.log(`状态: ${status}, 第${attempt}次查询`);
  }
);

// 3. 获取图片URL
if (result.status === 'SUCCESS') {
  console.log('生成成功:', result.image_urls);
} else {
  console.error('生成失败:', result.failure_reason);
}
```

#### 一站式生成并上传到OSS
```typescript
import { generateAndUploadImage } from './services/aiImageGeneration';

const ossUrls = await generateAndUploadImage(
  {
    prompt: '分镜草图，黑白线稿，3x3九宫格布局',
    negativePrompt: 'blurry, low quality',
    modelName: 'doubao-seedream-4-0',
    numImages: '1',
    aspectRatio: '16:9',
    size: '2K',
  },
  'project_123',      // 项目ID
  'shot_001',         // 镜头编号
  (stage, percent) => {
    console.log(`${stage}: ${percent}%`);
    // 输出示例:
    // 提交生成请求: 10%
    // AI生成中: 30%
    // AI生成中 (5次查询): 40%
    // 上传到OSS: 80%
    // 上传到OSS (1/1): 90%
    // 完成: 100%
  }
);

console.log('OSS URL:', ossUrls);
```

---

### 3. 模型选择器组件

#### 基础使用
```tsx
import AIImageModelSelector from './components/AIImageModelSelector';
import { ScenarioType } from './services/aiImageGeneration';

function MyComponent() {
  const [selectedModel, setSelectedModel] = useState('');

  return (
    <AIImageModelSelector
      value={selectedModel}
      onChange={setSelectedModel}
      scenarioType={ScenarioType.STORYBOARD}
      label="选择生图模型"
    />
  );
}
```

#### 组件特性
- ✅ 自动加载场景下的可用模型
- ✅ 显示模型详细信息（描述、价格、支持的尺寸等）
- ✅ 标注默认模型（⭐）和会员专属模型（🔒）
- ✅ 自动选择默认模型
- ✅ 错误处理和加载状态

---

## 参数说明

### ImageGenerationRequest

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| prompt | string | 是 | 提示词 | `"一个美丽的风景画"` |
| negativePrompt | string | 否 | 负面提示词 | `"blurry, low quality"` |
| modelName | string | 是 | 模型名称 | `"doubao-seedream-4-0"` |
| imageUrls | string[] | 否 | 参考图片URL列表 | `["https://..."]` |
| aspectRatio | string | 否 | 宽高比 | `"16:9"` |
| numImages | string | 是 | 生成数量 | `"1"` 或 `"4"` |
| outputFormat | string | 否 | 输出格式 | `"jpeg"` |
| size | string | 否 | 尺寸 | `"1K"`, `"2K"`, `"4K"` |
| guidanceScale | number | 否 | 引导比例(1.0-20.0) | `7.5` |
| seed | number | 否 | 随机种子 | `42` |

### 宽高比选项
- `1:1` - 正方形（头像、图标）
- `16:9` - 横屏（视频封面、分镜）
- `9:16` - 竖屏（手机壁纸）
- `4:3` - 传统照片
- `3:4` - 竖版照片
- `21:9` - 超宽屏

### 尺寸选项
- `1K` - 快速预览，积分消耗少
- `2K` - 平衡质量和速度（推荐）
- `4K` - 高清输出，适合打印

---

## 错误处理

### 常见错误

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| UNAUTHORIZED | 访问令牌无效 | 重新登录 |
| INSUFFICIENT_POINTS | 积分不足 | 充值积分或降低生成数量/尺寸 |
| INVALID_MODEL | 模型不存在 | 使用getModelsByScenario获取可用模型 |
| CONTENT_VIOLATION | 内容违规 | 修改提示词，避免敏感内容 |
| MEMBERSHIP_REQUIRED | 需要会员权限 | 升级会员等级 |

### 错误处理示例
```typescript
try {
  const ossUrls = await generateAndUploadImage(request, projectId, shotNumber);
} catch (error) {
  if (error.message.includes('积分不足')) {
    alert('积分不足，请充值后重试');
  } else if (error.message.includes('内容违规')) {
    alert('提示词包含敏感内容，请修改后重试');
  } else if (error.message.includes('会员权限')) {
    alert('该模型需要会员权限，请升级会员或选择其他模型');
  } else {
    alert(`生成失败: ${error.message}`);
  }
}
```

---

## 最佳实践

### 1. 提示词优化
- ✅ 使用详细、具体的描述
- ✅ 合理使用负面提示词排除不需要的元素
- ✅ 避免敏感、违规内容
- ❌ 不要使用过于简短的提示词

### 2. 性能优化
- ✅ 使用1K尺寸进行快速预览
- ✅ 批量生成时使用numImages="4"
- ✅ 缓存常用模型列表
- ❌ 不要频繁切换模型

### 3. 成本控制
- ✅ 优先使用默认模型（性价比高）
- ✅ 根据用途选择合适的尺寸
- ✅ 使用负面提示词提高成功率
- ❌ 不要盲目使用4K高清

---

## 下一步计划

- [ ] 在分镜生成页面集成新的AI图片生成功能
- [ ] 替换现有的OpenRouter图片生成为新接口
- [ ] 添加批量生成和重试机制
- [ ] 支持图片编辑和重绘功能
- [ ] 添加生成历史记录

---

**创建时间**: 2026-02-06
**维护人**: AI Assistant

