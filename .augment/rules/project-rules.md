---
type: "always_apply"
description: "分镜脚本生成项目的特定规则，包括角度规则强制校验"
scope: "project"
project: "visionary-storyboard-studio"
---

# 分镜脚本生成项目 - 项目规则配置文件

**版本**: 1.0  
**项目**: visionary-storyboard-studio  
**作用域**: 仅当前项目  
**最后更新**: 2024-12-26

> ⚠️ **重要提示**：
> - 本文件包含分镜脚本生成项目的特定规则
> - 这些规则与项目代码紧密耦合，不适用于其他项目
> - 通用规则请参考 `global-rules.md`

---

## 规则分组

### 🎬 分镜角度规则（最高优先级）

#### R008: 角度规则强制校验
- **规则类型**: mandatory（强制）
- **描述**: 修改角度相关代码前必须查阅角度规则文件，确保符合规范
- **触发条件**:
  - 修改 `services/constants.ts`
  - 修改 `services/openrouter.ts`
  - 修改 `prompts/chain-of-thought/stage3-shot-planning.ts`

#### 核心规则定义

| 规则项 | 要求 | 优先级 |
|--------|------|--------|
| 正面镜头占比 | ≤7%（30个镜头最多2个） | 最高 |
| 平视镜头占比 | 10-15%（禁止连续2个以上） | 最高 |
| 默认角度高度 | 轻微仰拍/轻微俯拍（40-50%） | 最高 |
| 极端角度占比 | ≥15%（必须有，不能全是温和角度） | 高 |

#### 验证检查项

**常量验证**:
- ✅ `DEFAULTS.ANGLE_HEIGHT` = "轻微仰拍(Mild Low)"
- ✅ `SHOT_RULES.MAX_FRONT_VIEW_SHOTS` = 2
- ✅ `SHOT_RULES.MAX_EYE_LEVEL_RATIO` = 0.15

**提示词验证**:
- ✅ `services/openrouter.ts` 中正面占比 ≤7%
- ✅ `services/openrouter.ts` 中平视占比 10-15%
- ✅ `prompts/chain-of-thought/stage3-shot-planning.ts` 中正面占比 ≤7%

#### 相关文件清单

| 文件 | 描述 | 关键内容 |
|------|------|----------|
| `services/constants.ts` | 角度常量定义 | DEFAULTS.ANGLE_HEIGHT, SHOT_RULES |
| `services/openrouter.ts` | 分镜生成提示词 | 角度分布规则表格 |
| `prompts/chain-of-thought/stage3-shot-planning.ts` | 思维链阶段3 | 角度分配规则 |
| `services/angleValidation.ts` | 角度验证服务 | 验证函数 |
| `docs/rules/角度规则优化总结.ini` | 角度规则详细文档 | 完整规则定义 |

#### 防回归检查清单

修改代码前必须确认：
- [ ] 正面镜头占比 ≤7%
- [ ] 平视镜头占比 10-15%
- [ ] 默认角度高度为"轻微仰拍"而非"平视"
- [ ] 极端角度占比 ≥15%
- [ ] 所有提示词中的角度分布规则与规则文件一致
- [ ] 没有修改关键常量（除非有明确的规则更新）

#### 规则文档引用

⚠️ 修改角度相关代码前，必须先查阅：
- `docs/rules/角度规则优化总结.ini` - 核心角度规则
- `.augment/rules/分镜设计连续性三原则.txt` - 连续性规则
- `docs/rules/提示词规范标准.ini` - 提示词规范

---

## 📋 使用验证功能

### 代码中集成验证

```typescript
import { validateAngleDistribution, generateAngleDistributionReport } from './services/angleValidation';

// 生成分镜后验证
const report = validateAngleDistribution(shots);

if (!report.overall.isValid) {
  console.warn('⚠️ 角度分布存在问题：');
  report.overall.errors.forEach(err => console.error(err));
  report.overall.warnings.forEach(warn => console.warn(warn));
}

// 输出详细报告
console.log(generateAngleDistributionReport(shots));
```

### 验证报告示例

```
═══════════════════════════════════════════════════════════════
                    角度分布验证报告
═══════════════════════════════════════════════════════════════
总镜头数：30

✅ 正面镜头占比符合规则：2个（6.7%）
✅ 平视镜头占比符合规则：4个（13.3%）
✅ 极端角度占比符合规则：5个（16.7%）
✅ 轻微角度占比符合规则：12个（40.0%）

✅ 角度分布完全符合规则！
═══════════════════════════════════════════════════════════════
```

---

## 🔗 规则依赖关系

```
project-rules.md (本文件)
  ↓ 引用
docs/rules/角度规则优化总结.ini
.augment/rules/分镜设计连续性三原则.txt
docs/rules/提示词规范标准.ini
  ↓ 应用于
services/constants.ts
services/openrouter.ts
prompts/chain-of-thought/stage3-shot-planning.ts
services/angleValidation.ts
```

---

## 📝 规则更新流程

1. **提出修改需求** - 说明为什么需要修改规则
2. **更新规则文件** - 修改对应的 .ini 或 .txt 文件
3. **同步代码实现** - 修改所有相关代码文件
4. **验证一致性** - 运行测试，确保规则生效
5. **更新本文件** - 记录规则变更
6. **更新开发日志** - 在 DEVELOPMENT_LOG.md 中记录

---

**创建时间**: 2024-12-26  
**维护人**: AI Assistant  
**适用范围**: 仅 visionary-storyboard-studio 项目

