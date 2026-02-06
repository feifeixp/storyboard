# AI图片生成快速开始

## 1. 最简单的使用方式

### 一行代码生成并上传图片

```typescript
import { generateAndUploadImage } from './services/aiImageGeneration';

// 生成图片并自动上传到OSS
const ossUrls = await generateAndUploadImage(
  {
    prompt: '一个美丽的风景画，山川湖泊，日落',
    modelName: 'doubao-seedream-4-0',
    numImages: '1',
  },
  'project_123',  // 项目ID
  'shot_001'      // 镜头编号
);

console.log('图片已保存到OSS:', ossUrls[0]);
```

---

## 2. 在分镜生成中使用

### 替换现有的OpenRouter图片生成

**原代码（App.tsx）**：
```typescript
// 旧方式：使用OpenRouter生成图片（临时URL）
const imageUrl = await generateSingleImage(gridPrompt, imageModel, []);
```

**新代码**：
```typescript
import { generateAndUploadImage } from './services/aiImageGeneration';

// 新方式：使用新接口生成图片并上传到OSS
const ossUrls = await generateAndUploadImage(
  {
    prompt: gridPrompt,
    modelName: 'doubao-seedream-4-0',  // 豆包AI绘画4.0
    numImages: '1',
    aspectRatio: '16:9',
    size: '2K',
    negativePrompt: 'blurry, low quality, watermark',
  },
  currentProject?.id || 'default',
  `grid_${gridIndex + 1}`,
  (stage, percent) => {
    setProgressMsg(`${stage}: ${percent}%`);
  }
);

const imageUrl = ossUrls[0];  // 获取OSS永久URL
```

---

## 3. 添加模型选择器

### 在UI中添加模型选择

```tsx
import AIImageModelSelector from './components/AIImageModelSelector';
import { ScenarioType } from './services/aiImageGeneration';

function StoryboardPage() {
  const [selectedModel, setSelectedModel] = useState('doubao-seedream-4-0');

  return (
    <div>
      {/* 模型选择器 */}
      <AIImageModelSelector
        value={selectedModel}
        onChange={setSelectedModel}
        scenarioType={ScenarioType.STORYBOARD}
        label="AI生图模型"
      />

      {/* 生成按钮 */}
      <button onClick={async () => {
        const ossUrls = await generateAndUploadImage(
          {
            prompt: '分镜草图',
            modelName: selectedModel,  // 使用用户选择的模型
            numImages: '1',
          },
          projectId,
          shotNumber
        );
        console.log('生成成功:', ossUrls);
      }}>
        生成分镜图
      </button>
    </div>
  );
}
```

---

## 4. 批量生成九宫格

### 生成多张九宫格图片

```typescript
import { generateAndUploadImage } from './services/aiImageGeneration';

async function generateAllGrids(shots: Shot[], projectId: string) {
  const GRID_SIZE = 9;
  const totalGrids = Math.ceil(shots.length / GRID_SIZE);
  const results: string[] = [];

  for (let gridIndex = 0; gridIndex < totalGrids; gridIndex++) {
    const startIdx = gridIndex * GRID_SIZE;
    const endIdx = Math.min(startIdx + GRID_SIZE, shots.length);
    const gridShots = shots.slice(startIdx, endIdx);

    // 构建九宫格提示词
    const gridPrompt = buildNineGridPrompt(gridShots, gridIndex + 1, totalGrids);

    try {
      // 生成并上传到OSS
      const ossUrls = await generateAndUploadImage(
        {
          prompt: gridPrompt,
          modelName: 'doubao-seedream-4-0',
          numImages: '1',
          aspectRatio: '16:9',
          size: '2K',
        },
        projectId,
        `grid_${gridIndex + 1}`,
        (stage, percent) => {
          console.log(`九宫格 ${gridIndex + 1}/${totalGrids}: ${stage} ${percent}%`);
        }
      );

      results.push(ossUrls[0]);
      console.log(`✅ 第 ${gridIndex + 1} 张九宫格生成成功`);
    } catch (error) {
      console.error(`❌ 第 ${gridIndex + 1} 张九宫格生成失败:`, error);
      results.push('');  // 失败时推入空字符串
    }
  }

  return results;
}
```

---

## 5. 错误处理和重试

### 添加自动重试机制

```typescript
async function generateWithRetry(
  request: ImageGenerationRequest,
  projectId: string,
  shotNumber: string,
  maxRetries: number = 3
): Promise<string[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`尝试生成 (${attempt}/${maxRetries})...`);
      
      const ossUrls = await generateAndUploadImage(
        request,
        projectId,
        shotNumber,
        (stage, percent) => {
          console.log(`[尝试${attempt}] ${stage}: ${percent}%`);
        }
      );

      console.log(`✅ 生成成功 (第${attempt}次尝试)`);
      return ossUrls;
    } catch (error) {
      lastError = error as Error;
      console.error(`❌ 第${attempt}次尝试失败:`, error);

      // 如果是积分不足或会员权限问题，不重试
      if (
        error.message.includes('积分不足') ||
        error.message.includes('会员权限')
      ) {
        throw error;
      }

      // 等待后重试
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  throw new Error(`生成失败（已重试${maxRetries}次）: ${lastError?.message}`);
}
```

---

## 6. 完整示例：替换现有生成函数

### 修改 `generateHQImages` 函数

```typescript
// 在 App.tsx 中修改
const generateHQImages = async () => {
  if (!currentProject) return;

  setIsLoading(true);
  setProgressMsg("准备生成九宫格...");
  setHqUrls([]);

  try {
    const GRID_SIZE = 9;
    const totalGrids = Math.ceil(shots.length / GRID_SIZE);
    const results: string[] = [];

    for (let gridIndex = 0; gridIndex < totalGrids; gridIndex++) {
      const startIdx = gridIndex * GRID_SIZE;
      const endIdx = Math.min(startIdx + GRID_SIZE, shots.length);
      const gridShots = shots.slice(startIdx, endIdx);

      setProgressMsg(`正在生成第 ${gridIndex + 1}/${totalGrids} 张九宫格...`);

      // 构建提示词
      const gridPrompt = buildNineGridPrompt(
        gridShots,
        gridIndex + 1,
        totalGrids,
        selectedStyle.promptSuffix,
        selectedStyle.name,
        characterRefs
      );

      // 🆕 使用新的AI图片生成接口
      const ossUrls = await generateAndUploadImage(
        {
          prompt: gridPrompt,
          modelName: 'doubao-seedream-4-0',
          numImages: '1',
          aspectRatio: '16:9',
          size: '2K',
          negativePrompt: 'blurry, low quality, watermark, text',
        },
        currentProject.id,
        `grid_${gridIndex + 1}`,
        (stage, percent) => {
          setProgressMsg(
            `第 ${gridIndex + 1}/${totalGrids} 张: ${stage} (${percent}%)`
          );
        }
      );

      results.push(ossUrls[0]);

      // 实时显示
      setHqUrls(prev => {
        const newUrls = [...prev];
        newUrls[gridIndex] = ossUrls[0];
        return newUrls;
      });
    }

    setProgressMsg(`✅ 全部生成完成！(${results.filter(r => r).length}/${totalGrids})`);
  } catch (error) {
    console.error('生成失败:', error);
    alert(`生成失败: ${error.message}`);
  } finally {
    setIsLoading(false);
  }
};
```

---

## 7. 下一步

完成以上集成后，你的分镜生成系统将：

- ✅ 使用豆包AI绘画4.0等最新模型
- ✅ 图片永久保存在OSS（不再是临时URL）
- ✅ 支持多种模型选择
- ✅ 显示详细的生成进度
- ✅ 自动处理错误和重试
- ✅ 支持会员权限和积分系统

**建议的集成顺序**：
1. 先在测试页面验证功能
2. 替换单张图片生成
3. 替换九宫格批量生成
4. 添加模型选择器UI
5. 添加错误处理和重试机制
6. 优化用户体验（进度条、预览等）

---

**创建时间**: 2026-02-06
**维护人**: AI Assistant

