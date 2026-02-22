# App.tsx 重构计划

## 📊 当前状态

- **文件大小**: 5,508 行
- **useState 数量**: 57 个
- **函数定义**: 106 个
- **主要问题**: 职责过多、状态管理混乱、巨大的渲染函数

## 🎯 重构目标

将 App.tsx 从 5,508 行减少到 ~800 行，提高可维护性。

## 📋 重构阶段

### 阶段 1：提取自定义 Hooks（优先级：最高）

**目标**: 减少 useState 数量，提取业务逻辑

#### 1.1 useScriptManagement Hook
- **状态**: `script`, `cleaningResult`, `cleaningProgress`, `isCleaning`
- **函数**: `handleScriptUpload`, `startScriptCleaning`
- **预计减少**: ~100 行

#### 1.2 useCharacterManagement Hook
- **状态**: `characterRefs`, `newCharName`, `newCharAppearance`, `newCharGender`, `editingCharId`, `isExtractingChars`
- **函数**: `handleCharUpload`, `removeChar`, `extractCharactersFromScriptHandler`
- **预计减少**: ~150 行

#### 1.3 useShotGeneration Hook
- **状态**: `shots`, `generationMode`, `cotStage1-5`, `cotCurrentStage`, `cotRawOutput`
- **函数**: `startShotListGeneration`, `startChainOfThoughtGeneration`
- **预计减少**: ~500 行

#### 1.4 useImageGeneration Hook
- **状态**: `hqUrls`, `selectedStyle`, `customStylePrompt`, `showStyleCards`
- **函数**: `handleUploadGrid`, `handleRefreshGrid`, 图片生成相关函数
- **预计减少**: ~300 行

#### 1.5 useProjectManagement Hook
- **状态**: `projects`, `currentProject`, `currentEpisodeNumber`
- **函数**: `handleSelectProject`, `handleCreateProject`, `handleDeleteProject`, `handleSelectEpisode`
- **预计减少**: ~200 行

### 阶段 2：提取页面组件（优先级：高）

#### 2.1 ScriptInputPage
- **行数**: ~260 行（3630-3890）
- **依赖**: useScriptManagement, useCharacterManagement

#### 2.2 ScriptCleaningPage
- **行数**: ~180 行（3893-4073）
- **依赖**: useScriptManagement

#### 2.3 ShotGenerationPage
- **行数**: ~450 行（4076-4533）
- **依赖**: useShotGeneration

#### 2.4 PromptExtractionPage
- **行数**: ~300 行（4536-4836）
- **依赖**: useShotGeneration

#### 2.5 ImageGenerationPage
- **行数**: ~570 行（4839-5409）
- **依赖**: useImageGeneration

### 阶段 3：优化状态管理（优先级：中）

- 考虑使用 Zustand 或 Context API
- 统一管理全局状态
- 减少 prop drilling

## 📈 预期收益

| 阶段 | 行数减少 | 可维护性提升 |
|------|---------|-------------|
| 提取 Hooks | -1,250 行 | ⭐⭐⭐⭐ |
| 提取页面组件 | -1,760 行 | ⭐⭐⭐⭐⭐ |
| 优化状态管理 | -500 行 | ⭐⭐⭐⭐⭐ |
| **总计** | **-3,510 行** | **显著提升** |

**最终目标**: App.tsx ~2,000 行（减少 64%）

## 🚀 执行顺序

1. ✅ 创建 `src/hooks/` 目录
2. ⏳ 提取 useScriptManagement Hook
3. ⏳ 提取 useCharacterManagement Hook
4. ⏳ 提取 useShotGeneration Hook
5. ⏳ 提取 useImageGeneration Hook
6. ⏳ 提取 useProjectManagement Hook
7. ⏳ 创建 `src/pages/` 目录
8. ⏳ 提取 ScriptInputPage
9. ⏳ 提取 ScriptCleaningPage
10. ⏳ 提取 ShotGenerationPage
11. ⏳ 提取 PromptExtractionPage
12. ⏳ 提取 ImageGenerationPage
13. ⏳ 测试所有功能
14. ⏳ 提交代码

## ⚠️ 注意事项

1. 每次重构后立即测试功能
2. 保持向后兼容
3. 不改变现有功能逻辑
4. 逐步提交，避免大规模改动

