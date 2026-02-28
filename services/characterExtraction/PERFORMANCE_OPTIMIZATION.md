# 角色智能提取性能优化方案

**创建时间**: 2024-12-28  
**问题**: 角色智能提取太慢  
**目标**: 提升提取速度，改善用户体验

---

## 🔍 当前性能分析

### 现状

**当前实现**（`services/openrouter.ts` - `extractCharactersFromScript`）：
- 使用 `deepseek/deepseek-chat` 模型
- 单次LLM调用提取所有角色
- max_tokens: 3000
- 无缓存机制
- 无并发优化

**性能瓶颈**：
1. **LLM调用慢**：单次调用需要5-15秒（取决于剧本长度）
2. **剧本过长**：完整剧本可能有几千字，LLM处理慢
3. **无缓存**：每次都重新提取，即使剧本没变
4. **无进度反馈**：用户不知道进度，体验差

---

## 💡 优化方案

### 方案A: 添加缓存机制 ⭐⭐⭐ 推荐

**原理**：
- 使用剧本内容的hash作为缓存键
- 缓存提取结果到localStorage
- 剧本未变化时直接返回缓存

**实现**：
```typescript
// 1. 生成缓存键
function generateScriptHash(script: string): string {
  return script.toLowerCase().trim().substring(0, 100);
}

// 2. 检查缓存
const cacheKey = `character_extraction_${generateScriptHash(script)}`;
const cached = localStorage.getItem(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

// 3. 提取后保存缓存
const result = await extractCharactersFromScript(script, model);
localStorage.setItem(cacheKey, JSON.stringify(result));
return result;
```

**优势**：
- ✅ 实现简单（10分钟）
- ✅ 效果显著（缓存命中时速度提升100倍）
- ✅ 无需修改现有逻辑

**劣势**：
- ❌ 首次提取仍然慢

**预期效果**：
- 首次提取：5-15秒（无变化）
- 后续提取：<0.1秒（缓存命中）

---

### 方案B: 分段提取 + 并发

**原理**：
- 将长剧本拆分为多个片段
- 并发提取每个片段的角色
- 合并去重

**实现**：
```typescript
// 1. 拆分剧本（按集数或字数）
const segments = splitScript(script, 1000); // 每段1000字

// 2. 并发提取
const results = await Promise.all(
  segments.map(seg => extractCharactersFromScript(seg, model))
);

// 3. 合并去重
const allCharacters = results.flat();
const uniqueCharacters = deduplicateCharacters(allCharacters);
```

**优势**：
- ✅ 速度提升（并发处理）
- ✅ 适合长剧本

**劣势**：
- ❌ 实现复杂
- ❌ 可能出现重复角色
- ❌ 需要合并逻辑

**预期效果**：
- 提取时间：减少30-50%

---

### 方案C: 使用更快的模型

**原理**：
- 切换到更快的模型（如 `gpt-4o-mini`）
- 牺牲一点准确性换取速度

**实现**：
```typescript
// 修改默认模型
const FAST_MODEL = 'openai/gpt-4o-mini';

export async function extractCharactersFromScript(
  script: string,
  model: string = FAST_MODEL // 改为更快的模型
) {
  // ...
}
```

**优势**：
- ✅ 实现简单（1分钟）
- ✅ 速度提升明显

**劣势**：
- ❌ 可能降低准确性
- ❌ 成本可能更高

**预期效果**：
- 提取时间：减少20-40%

---

### 方案D: 添加进度反馈

**原理**：
- 使用流式输出（streaming）
- 实时显示提取进度

**实现**：
```typescript
export async function extractCharactersFromScript(
  script: string,
  model: string = DEFAULT_MODEL,
  onProgress?: (message: string) => void
) {
  onProgress?.('正在分析剧本...');
  
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 3000,
    stream: true, // 启用流式输出
  });

  let fullText = '';
  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullText += content;
    
    // 检测到角色名时更新进度
    if (content.includes('"name"')) {
      onProgress?.('发现新角色...');
    }
  }
  
  // 解析结果
  return parseCharacters(fullText);
}
```

**优势**：
- ✅ 改善用户体验
- ✅ 让用户知道进度

**劣势**：
- ❌ 不能真正提升速度
- ❌ 实现稍复杂

**预期效果**：
- 提取时间：无变化
- 用户体验：显著提升

---

## 🎯 推荐方案组合

### 最优方案：A + D

**组合方式**：
1. 先实现方案A（缓存机制）- 解决重复提取问题
2. 再实现方案D（进度反馈）- 改善首次提取体验

**实现步骤**：
1. 创建缓存工具函数（5分钟）
2. 修改 `extractCharactersFromScript` 添加缓存（5分钟）
3. 添加进度回调参数（10分钟）
4. 在UI中显示进度（5分钟）

**总时间**：25分钟

**预期效果**：
- 首次提取：5-15秒（有进度反馈）
- 后续提取：<0.1秒（缓存命中）
- 用户体验：显著提升

---

## 📝 实现代码示例

### 1. 创建缓存工具

```typescript
// services/characterExtraction/cache.ts
const CACHE_KEY_PREFIX = 'character_extraction_';
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7天

export function getCachedCharacters(script: string) {
  const key = CACHE_KEY_PREFIX + hashScript(script);
  const cached = localStorage.getItem(key);
  
  if (!cached) return null;
  
  const { data, timestamp } = JSON.parse(cached);
  
  // 检查是否过期
  if (Date.now() - timestamp > CACHE_EXPIRY) {
    localStorage.removeItem(key);
    return null;
  }
  
  return data;
}

export function setCachedCharacters(script: string, characters: any[]) {
  const key = CACHE_KEY_PREFIX + hashScript(script);
  localStorage.setItem(key, JSON.stringify({
    data: characters,
    timestamp: Date.now(),
  }));
}

function hashScript(script: string): string {
  // 简单hash：取前100字符
  return script.toLowerCase().trim().substring(0, 100);
}
```

### 2. 修改提取函数

```typescript
// services/openrouter.ts
import { getCachedCharacters, setCachedCharacters } from './characterExtraction/cache';

export async function extractCharactersFromScript(
  script: string,
  model: string = DEFAULT_MODEL,
  onProgress?: (message: string) => void
): Promise<Array<{ name: string; gender: '男' | '女' | '未知'; appearance: string }>> {
  
  // 1. 检查缓存
  onProgress?.('检查缓存...');
  const cached = getCachedCharacters(script);
  if (cached) {
    onProgress?.('✅ 使用缓存结果');
    return cached;
  }
  
  // 2. 调用LLM提取
  onProgress?.('正在分析剧本...');
  
  try {
    const client = getClient(model);
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
    });

    const text = response.choices[0]?.message?.content || '[]';
    
    onProgress?.('正在解析结果...');
    
    // 提取JSON数组
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonStr = text.substring(jsonStart, jsonEnd + 1);
      const result = JSON.parse(jsonStr);
      
      // 3. 保存缓存
      setCachedCharacters(script, result);
      onProgress?.(`✅ 提取完成，共${result.length}个角色`);
      
      return result;
    }

    return [];
  } catch (error) {
    console.error('提取角色失败:', error);
    onProgress?.('❌ 提取失败');
    return [];
  }
}
```

---

## 🧪 测试建议

1. **测试缓存命中率**：
   - 多次提取同一剧本，验证缓存生效
   - 修改剧本后，验证缓存失效

2. **测试性能提升**：
   - 记录首次提取时间
   - 记录缓存命中时间
   - 对比提升幅度

3. **测试用户体验**：
   - 验证进度反馈是否及时
   - 验证提示信息是否清晰

---

**维护人**: AI Assistant  
**参考文档**: `services/openrouter.ts`, `services/aiCache.ts`

