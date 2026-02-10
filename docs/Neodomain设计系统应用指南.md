# Neodomain 设计系统应用指南

**日期**: 2026-02-09  
**状态**: 🚧 进行中

---

## 📋 改造计划

### 阶段 1: CSS 变量和全局样式 ✅

已完成：
- ✅ 更新 `index.css` 添加 Neodomain CSS 变量
- ✅ 添加玻璃卡片样式 `.glass-card`
- ✅ 添加按钮样式 `.btn-primary`, `.btn-secondary`
- ✅ 添加全局背景渐变
- ✅ 添加滚动条样式
- ✅ 添加动画效果

### 阶段 2: ProjectDashboard 组件重构 🚧

需要修改的部分：

#### 2.1 顶部导航栏
- 当前：蓝色背景 + 灰色按钮
- 目标：玻璃卡片 + 金色激活态

#### 2.2 Tab 切换
- 当前：蓝色激活态
- 目标：金色激活态 + 玻璃效果

#### 2.3 卡片组件
- 当前：`bg-gray-800` + `border-gray-700`
- 目标：`.glass-card` + 悬停效果

#### 2.4 按钮组件
- 当前：`bg-blue-600` 等
- 目标：`.btn-primary` / `.btn-secondary`

#### 2.5 输入框和选择器
- 当前：灰色背景
- 目标：玻璃效果 + 金色聚焦边框

#### 2.6 文字颜色
- 当前：`text-white`, `text-gray-300` 等
- 目标：`text-[var(--color-text)]` 等

---

## 🎨 关键样式映射

### 背景色映射

| 旧样式 | 新样式 |
|--------|--------|
| `bg-gray-800` | `glass-card` 类或 `bg-[var(--color-surface)]` |
| `bg-gray-700` | `bg-[var(--color-surface-hover)]` |
| `bg-gray-900` | `bg-[var(--color-bg-subtle)]` |

### 边框色映射

| 旧样式 | 新样式 |
|--------|--------|
| `border-gray-700` | `border-[var(--color-border)]` |
| `border-gray-600` | `border-[var(--color-border-hover)]` |

### 文字色映射

| 旧样式 | 新样式 |
|--------|--------|
| `text-white` | `text-[var(--color-text)]` |
| `text-gray-300` | `text-[var(--color-text-secondary)]` |
| `text-gray-400` | `text-[var(--color-text-secondary)]` |
| `text-gray-500` | `text-[var(--color-text-tertiary)]` |

### 按钮映射

| 旧样式 | 新样式 |
|--------|--------|
| `bg-blue-600 hover:bg-blue-700` | `btn-primary` |
| `bg-gray-700 hover:bg-gray-600` | `btn-secondary` |
| `bg-emerald-600` | `btn-primary`（生成按钮） |

---

## 🔧 具体修改示例

### 示例 1: 卡片组件

**修改前**:
```tsx
<div className="bg-gray-800 rounded-lg border border-gray-700/60 p-3">
  内容
</div>
```

**修改后**:
```tsx
<div className="glass-card rounded-xl p-5">
  内容
</div>
```

### 示例 2: 主要按钮

**修改前**:
```tsx
<button className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded text-xs font-medium">
  按钮
</button>
```

**修改后**:
```tsx
<button className="btn-primary px-4 py-2 rounded-lg text-[14px]">
  按钮
</button>
```

### 示例 3: Tab 按钮

**修改前**:
```tsx
<button className={`px-3 py-1.5 rounded text-xs ${
  activeTab === 'overview' 
    ? 'bg-blue-600 text-white' 
    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
}`}>
  概览
</button>
```

**修改后**:
```tsx
<button className={`px-4 py-2 rounded-lg text-[13px] transition-colors ${
  activeTab === 'overview'
    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary-light)] font-medium'
    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
}`}>
  概览
</button>
```

---

## 📝 下一步行动

1. 修改顶部导航栏和返回按钮
2. 修改 Tab 切换样式
3. 修改所有卡片组件
4. 修改所有按钮
5. 修改输入框和选择器
6. 修改文字颜色
7. 测试响应式布局
8. 测试交互效果

---

**创建时间**: 2026-02-09  
**维护人**: AI Assistant

