# 角色补全模块 - 优化建议

## 🎯 核心问题

### 1. Prompt臃肿问题

**症状：**
- Stage3/Stage4的prompt可能超过8000 tokens
- 包含大量历史记录、美型要求、禁止词汇列表
- 流式输出时可能超时或被截断

**解决方案：**

#### 方案A：压缩Prompt（推荐）
```typescript
// ❌ 现在：冗长的美型要求
const beautyRequirements = `
⚠️ **美型程度**: 理想美型
- 🎯 **核心原则**: 这是现代拍摄的短剧...（200字）
- 🎯 **五官**: 注重五官的精致度...（100字）
- 🎯 **妆容**: 精致的现代妆容...（150字）
...
`;

// ✅ 改进：结构化精简
const beautyRequirements = {
  idealized: {
    core: "现代短剧标准:款式符合时代,质感使用现代标准",
    facial: "精致立体五官,现代审美",
    makeup: "精致现代妆容,适龄淡妆(18-22岁)",
    hair: "多样发型设计,自然发色(深棕/棕黑)",
    vibe: "优雅迷人,镜头感强"
  },
  // ...
};
```

#### 方案B：分层注入（针对历史记录）
```typescript
// ❌ 现在：每次都注入5个历史记录
const historyPrompt = formatHistoryForPrompt(history, 3);

// ✅ 改进：仅在Stage3/4注入，Stage1/2跳过
const historyPrompt = stage === 'stage3' || stage === 'stage4'
  ? formatHistoryForPrompt(history, 2)  // 减少到2个
  : '';
```

---

## 🚀 具体优化建议

### 优化1：提取公共逻辑到配置文件

**创建 `config/beautyLevels.ts`：**
```typescript
export const BEAUTY_LEVEL_CONFIGS = {
  idealized: {
    core: "现代短剧标准",
    focus: ["精致五官", "现代妆容", "多样发型", "镜头感"],
    constraints: ["妆容适龄", "自然发色"]
  },
  balanced: {
    core: "真实美平衡",
    focus: ["略优化五官", "适度发型设计感"],
    constraints: []
  },
  realistic: {
    core: "真实朴素",
    focus: ["符合时代", "符合阶层"],
    constraints: []
  }
};
```

**优势：**
- Prompt从2000字 → 500字
- 可维护性提升
- 方便A/B测试

---

### 优化2：增量验证（防止生成错误）

**现状：**
```typescript
// ❌ 只在最后验证
const result = extractJSON(content, '最终输出');
validateRequiredFields(result, [...], '阶段3');
```

**改进：**
```typescript
// ✅ 流式验证每个Step
const stepValidations = [
  { marker: '【Step 3.1 执行中】', fields: ['roleUnderstanding'] },
  { marker: '【Step 3.2 执行中】', fields: ['visualStyle'] },
  // ...
];

// 实时检测并验证
for (const validation of stepValidations) {
  if (fullContent.includes(validation.marker)) {
    const stepResult = extractJSON(fullContent, validation.marker);
    if (!validatePartial(stepResult, validation.fields)) {
      console.warn(`⚠️ ${validation.marker} 输出不完整`);
    }
  }
}
```

**优势：**
- 早发现问题
- 可以重试单个Step（节省token）

---

### 优化3：缓存机制

**问题：**
同一个角色可能多次触发补全（用户点击"补全"按钮）

**解决：**
```typescript
// services/characterSupplement/cache.ts
const CACHE_KEY_PREFIX = 'char_supplement_';
const CACHE_EXPIRY = 30 * 60 * 1000; // 30分钟

export function getCachedResult(
  characterName: string, 
  missingFields: string[]
): CharacterRef | null {
  const key = `${CACHE_KEY_PREFIX}${characterName}_${missingFields.join(',')}`;
  const cached = sessionStorage.getItem(key);
  
  if (!cached) return null;
  
  const { result, timestamp } = JSON.parse(cached);
  if (Date.now() - timestamp > CACHE_EXPIRY) {
    sessionStorage.removeItem(key);
    return null;
  }
  
  return result;
}

export function setCachedResult(
  characterName: string,
  missingFields: string[],
  result: CharacterRef
): void {
  const key = `${CACHE_KEY_PREFIX}${characterName}_${missingFields.join(',')}`;
  sessionStorage.setItem(key, JSON.stringify({
    result,
    timestamp: Date.now()
  }));
}
```

**使用：**
```typescript
// index.ts
export async function supplementCharacterDetails(...) {
  // 检查缓存
  const cached = getCachedResult(character.name, missingFields.map(f => f.field));
  if (cached) {
    console.log('✅ 使用缓存结果');
    return cached;
  }
  
  // 正常流程...
  const result = await ...;
  
  // 保存缓存
  setCachedResult(character.name, missingFields.map(f => f.field), result);
  return result;
}
```

**优势：**
- 节省API调用（30分钟内重复点击不重新生成）
- 提升响应速度

---

### 优化4：错误重试机制

**现状：**
```typescript
// ❌ 出错直接抛异常
if (!response.ok) {
  throw new Error(`LLM调用失败: ${response.status}`);
}
```

**改进：**
```typescript
// ✅ 指数退避重试
async function callLLMWithRetry(
  prompt: string,
  model: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callLLMWithStreaming(prompt, model, ...);
      return result;
    } catch (error) {
      lastError = error as Error;
      
      // 如果是402余额不足，不重试
      if (error.message.includes('402')) {
        throw error;
      }
      
      // 指数退避
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.warn(`⚠️ 重试 ${attempt}/${maxRetries}，等待${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}
```

---

### 优化5：用户中断处理

**问题：**
用户可能在生成过程中关闭页面或切换项目

**解决：**
```typescript
// index.ts
let abortController: AbortController | null = null;

export async function supplementCharacterDetails(...) {
  // 创建中断控制器
  abortController = new AbortController();
  
  try {
    const response = await fetch('...', {
      signal: abortController.signal
    });
    // ...
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('⏹️ 用户中断生成');
      return character; // 返回原始角色
    }
    throw error;
  }
}

// 导出中断函数
export function abortSupplement(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}
```

**前端使用：**
```typescript
// ProjectDashboard.tsx
useEffect(() => {
  return () => {
    // 组件卸载时中断
    abortSupplement();
  };
}, []);
```

---

## 🎨 UI/UX改进建议

### 改进1：实时预览

**现状：**
用户只能看到"正在生成..."，不知道进度

**改进：**
```typescript
// ProjectDashboard.tsx
const [generatedParts, setGeneratedParts] = useState({
  appearance: '',
  costume: '',
  hair: '',
  makeup: ''
});

const onProgress = (stage, step, content) => {
  if (stage === 'stage3' && step === 'final') {
    // 提取并实时显示外貌描述
    const appearance = extractAppearance(content);
    setGeneratedParts(prev => ({ ...prev, appearance }));
  }
  
  if (stage === 'stage4' && step === 'final') {
    // 提取并实时显示服装描述
    const costume = extractCostume(content);
    setGeneratedParts(prev => ({ ...prev, costume }));
  }
};
```

**UI展示：**
```jsx
<div className="preview-panel">
  {generatedParts.appearance && (
    <div className="fade-in">
      <h4>👤 外貌特征</h4>
      <p>{generatedParts.appearance}</p>
    </div>
  )}
  
  {generatedParts.costume && (
    <div className="fade-in">
      <h4>👗 服装造型</h4>
      <p>{generatedParts.costume}</p>
    </div>
  )}
</div>
```

---

### 改进2：质量评分

**问题：**
用户不知道生成质量如何

**解决：**
```typescript
// services/characterSupplement/quality.ts
export function evaluateQuality(result: CharacterRef): {
  score: number;  // 0-100
  issues: string[];
  suggestions: string[];
} {
  let score = 100;
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // 检查外观描述长度
  if (result.appearance.length < 150) {
    score -= 10;
    issues.push('外观描述过短');
    suggestions.push('建议重新生成，选择"详细模式"');
  }
  
  // 检查是否包含关键元素
  const hasHair = /头发|发型/.test(result.appearance);
  const hasFace = /脸|五官/.test(result.appearance);
  const hasCostume = /服装|衣服/.test(result.appearance);
  
  if (!hasHair || !hasFace || !hasCostume) {
    score -= 15;
    issues.push('缺少关键描述元素');
    suggestions.push('可能需要重新生成');
  }
  
  // 检查是否重复词汇过多
  const words = result.appearance.split(/\s+/);
  const uniqueWords = new Set(words);
  if (uniqueWords.size / words.length < 0.6) {
    score -= 5;
    issues.push('词汇重复较多');
  }
  
  return { score, issues, suggestions };
}
```

**UI展示：**
```jsx
const quality = evaluateQuality(generatedCharacter);

<div className={`quality-badge ${quality.score >= 80 ? 'good' : 'warning'}`}>
  质量评分: {quality.score}/100
  
  {quality.issues.length > 0 && (
    <ul>
      {quality.issues.map(issue => <li>⚠️ {issue}</li>)}
    </ul>
  )}
</div>
```

---

## 📊 性能优化建议

### 1. Token计数优化

```typescript
// utils/tokenCounter.ts
export function estimateTokenCount(text: string): number {
  // 中文约1.5字符 = 1 token，英文约4字符 = 1 token
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
  const englishWords = text.match(/[a-zA-Z]+/g)?.length || 0;
  
  return Math.ceil(chineseChars / 1.5 + englishWords / 4);
}

// 在调用前检查
const promptTokens = estimateTokenCount(prompt);
if (promptTokens > 6000) {
  console.warn('⚠️ Prompt过长，可能影响质量');
}
```

### 2. 并行化（如果项目有多个角色）

```typescript
// 批量补全多个角色
export async function supplementMultipleCharacters(
  characters: CharacterRef[],
  scripts: ScriptFile[],
  options: SupplementOptions
): Promise<CharacterRef[]> {
  // ✅ 并行处理（注意API限流）
  const results = await Promise.all(
    characters.map(char => 
      supplementCharacterDetails(char, getMissingFields(char), scripts, options)
    )
  );
  
  return results;
}
```

---

## 🔍 测试建议

### 单元测试

```typescript
// __tests__/characterSupplement.test.ts
import { extractJSON, validateRequiredFields } from '../utils';

describe('extractJSON', () => {
  it('should extract JSON from markdown', () => {
    const input = `
【最终输出】
\`\`\`json
{ "name": "test" }
\`\`\`
    `;
    
    const result = extractJSON(input, '最终输出');
    expect(result).toEqual({ name: 'test' });
  });
});

describe('validateRequiredFields', () => {
  it('should throw on missing fields', () => {
    const data = { name: 'test' };
    expect(() => {
      validateRequiredFields(data, ['name', 'age'], 'Test');
    }).toThrow('缺少必需字段: age');
  });
});
```

### E2E测试

```typescript
// __tests__/e2e/supplement.test.ts
import { supplementCharacterDetails } from '../index';

describe('补全流程', () => {
  it('should complete all stages', async () => {
    const character = { name: '测试角色', ... };
    const scripts = loadTestScripts();
    
    const result = await supplementCharacterDetails(
      character,
      [],
      scripts,
      { mode: 'fast', beautyLevel: 'balanced' }
    );
    
    expect(result.appearance).toBeTruthy();
    expect(result.appearance.length).toBeGreaterThan(100);
  }, 60000); // 60秒超时
});
```

---

## 🎯 优先级建议

**P0（立即做）：**
1. ✅ 添加缓存机制（避免重复调用）
2. ✅ 添加用户中断处理（提升体验）
3. ✅ 压缩Prompt（降低成本）

**P1（本周）：**
4. ✅ 增量验证（早发现问题）
5. ✅ 错误重试机制（提升成功率）
6. ✅ 质量评分（用户反馈）

**P2（下周）：**
7. 实时预览（UI优化）
8. 并行化处理（批量补全）
9. Token计数优化（成本优化）

**P3（长期）：**
10. A/B测试不同Prompt
11. 用户反馈收集
12. 模型效果对比
