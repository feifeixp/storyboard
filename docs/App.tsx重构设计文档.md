# App.tsx 重构设计文档

> 项目：AIdirector 分镜自动生成系统  
> 位置：`AIdirector/storyboard`  
> 版本：v1.0  
> 作者：小蟹  
> 日期：2026-02-25

---

## 1. 背景与问题

当前 `App.tsx` 规模已达到 **5362 行**，集中承载了登录、项目管理、剧集管理、工作流、流式 AI 生成、九宫格生图等逻辑，导致：

- **单文件过大**：改动成本高、风险大。
- **状态管理混乱**：60+ `useState` 分散在组件中，状态难以追踪与复用。
- **业务逻辑与 UI 强耦合**：流程规则、数据操作与渲染掺杂，缺乏可测试性。
- **模块边界不清晰**：缺少清晰的组件/页面/逻辑分层。

目标是进行渐进式重构，在不影响现有功能的前提下，提升可维护性、可测试性与性能表现。

---

## 2. 目标与非目标

### 2.1 目标
- 将 `App.tsx` 从 5000+ 行拆分为清晰的 **页面层 / 组件层 / 逻辑层 / 数据层**。
- 建立 **统一状态管理与持久化策略**。
- 隔离流式 AI 生成逻辑，避免 UI 生命周期影响业务流程。
- 提升可测试性（流程可测、数据可测）。
- 为后续路由化、虚拟化、大规模功能扩展打基础。

### 2.2 非目标
- 立即替换所有旧实现（采用 **渐进式** 迁移）。
- 大规模 UI 改版。
- 一次性引入重型架构（例如全量重写）。

---

## 3. 方案概述

采用 **渐进式解耦** + **可回滚重构策略**：

1. **先建立边界（契约接口）**，再逐步替换实现。
2. **流程状态机稳定化**，再做 Router 化页面拆分。
3. 将 **流式 AI 逻辑独立化**（最高优先级）。
4. 使用 **Branch by Abstraction**（旧实现与新实现并存，feature flag 切换）。

---

## 4. 设计方案

### 4.1 边界与分层
建立三层核心边界：

- **Data Layer**：API / Storage / Stream（如 `StoryboardService`、`StorageAdapter`）
- **Business Layer**：流程规则 / 状态机 / 业务编排（如 `AiTaskRunner`）
- **UI Layer**：页面与组件渲染

### 4.2 状态管理（优先级最高）
引入 **Zustand** 作为统一状态管理，并进行持久化控制。

- 创建 `stores/useAppStore.ts`
- 将 60+ `useState` 迁移至 store
- 控制持久化字段，避免大数据进入 localStorage

### 4.3 组件拆分
按功能域拆分组件目录：

```
components/
├── Auth/
├── Projects/
├── Episodes/
├── Workflow/
└── Shared/
```

### 4.4 业务逻辑提取（Hooks）
将复杂业务逻辑从组件中抽离：

```
hooks/
├── useProjectManagement.ts
├── useEpisodeManagement.ts
├── useScriptManagement.ts
├── useCharacterManagement.ts
├── useShotGeneration.ts
├── useShotReview.ts
└── useImageGeneration.ts
```

### 4.5 页面级拆分与路由化
App.tsx 退化为路由调度器：

```
pages/
├── LoginPage.tsx
├── ProjectListPage.tsx
├── ProjectWizardPage.tsx
├── ProjectDashboardPage.tsx
└── EpisodeWorkspacePage.tsx
```

### 4.6 TypeScript 类型整理
统一 `types/` 目录，并集中导出：

```
types/
├── index.ts
├── app.ts
├── project.ts
├── episode.ts
├── shot.ts
├── character.ts
└── workflow.ts
```

### 4.7 性能优化
- 大组件懒加载（`React.lazy` + `Suspense`）
- 避免大数据写入 localStorage（如 `hqUrls` 等）
- 后续可引入虚拟化列表

---

## 5. 更安全的升级方案（推荐执行顺序）

**Phase 0：契约层 + 流程状态机**
- 定义 `StoryboardService`、`AiStreamRunner`、`StorageAdapter`
- 先稳定 `AppStep` 流程图

**Phase 1：流式 AI 逻辑独立化**
- 建立 `AiTaskRunner`（单例/ Zustand slice / Web Worker）
- UI 只订阅状态，不直接执行流式逻辑

**Phase 2：Router + UI 拆分**
- `App.tsx` 只负责路由与页面切换

**Phase 3：数据层迁移**
- React Query（server state） + Zustand（client state）

**Phase 4：性能优化**
- 列表虚拟化、懒加载、减少无效 re-render

---

## 6. 实施计划（3 周）

### Week 1：状态管理重构 ⭐⭐⭐⭐⭐
- Day 1-2：引入 Zustand，创建 `useAppStore`
- Day 3-4：迁移 `useState`
- Day 5：测试持久化

### Week 2：组件拆分 ⭐⭐⭐⭐
- Day 1：目录结构搭建
- Day 2-3：拆分工作流组件（6 个步骤）
- Day 4：拆分项目管理组件
- Day 5：组件间通信测试

### Week 3：逻辑提取与优化 ⭐⭐⭐
- Day 1-2：完成 hooks 提取
- Day 3：页面级组件创建
- Day 4：App.tsx 退化成路由
- Day 5：整体回归测试 + 性能优化

---

## 7. 风险控制

- 全流程在 **Git 分支**进行
- 每个阶段完成后 **提交一次** 便于回滚
- 使用 React DevTools 监控渲染性能
- 关键流程走 **E2E 回归测试**

---

## 8. 测试策略

- **E2E 测试**：覆盖 “上传剧本 → 分镜生成 → 出图”
- **契约/流程测试**：覆盖状态机与数据迁移
- **回归测试**：每阶段完成后执行核心流程

---

## 9. 预期收益

- App.tsx 行数：**5362 → ~800**
- 渲染性能提升：**约 30%**
- 可测试性：**20% → 80%**
- 新功能开发效率：**提升 50%**
- Bug 修复速度：**提升 40%**

---

## 10. 快速可做的优化（当晚可完成）

1. **提取 CoT 逻辑** → `hooks/useCoTGeneration.ts`
2. **提取九宫格生图逻辑** → `hooks/useImageGeneration.ts`
3. **创建 ProjectContext** → `contexts/ProjectContext.tsx`

---

## 11. 后续动作（可选）

- 若确认方案，建议从 **“提取 CoT 逻辑”** 开始（最独立、风险最低）。
- 如需我直接开工，请指定起始阶段或分支名。
