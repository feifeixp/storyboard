# 思维链JSON输出问题修复方案

## 🔍 核心问题

**现象**: LLM在【最终输出】标记后不输出完整JSON,导致extractJSON提取失败

**根本原因**: 每个中间步骤(Step X.1, X.2, X.3)都要求输出```json```格式,LLM在输出多个JSON块后,到【最终输出】时混淆,不知道该输出什么,或者认为已经输出过了。

**证据**:
1. ✅ LLM输出了【最终输出】标记(detectedSteps包含'final')
2. ❌ 但extractJSON找不到【最终输出】后的JSON
3. ❌ fallback到"最后一个JSON块",提取到的是中间步骤的JSON(如Step 2.3的`{"qualityCheck": "...", "improvements": "..."}`)
4. ❌ 这说明【最终输出】后没有完整的JSON,或者根本没有JSON

---

## ✅ 解决方案

**移除所有中间步骤的JSON格式,改为纯文本输出。只在【最终输出】要求JSON。**

### 修改前(❌ 错误):
```markdown
【Step 2.1 执行中】角色理解

思考过程:...

输出结果:
\`\`\`json
{
  "roleUnderstanding": "...",
  "visualDirection": "...",
  "aestheticStrategy": "..."
}
\`\`\`

---

【Step 2.2 执行中】视觉标签设计

思考过程:...

输出结果:
\`\`\`json
{
  "visualTags": [...]
}
\`\`\`

---

【最终输出】

请将所有步骤的结果合并为一个完整的JSON:
\`\`\`json
{
  "positioning": {...},
  "visualTags": [...],
  ...
}
\`\`\`
```

**问题**: LLM看到3个```json```块,不知道哪个是"最终"的,可能在Step 2.2就停止了。

### 修改后(✅ 正确):
```markdown
【Step 2.1 执行中】角色理解

思考过程:...

输出结果（文本格式，不要用JSON）:
- 角色理解：[...]
- 视觉方向：[...]
- 美学策略：[...]

⚠️ **注意**：这只是Step 2.1的思考结果，不要输出JSON！继续执行Step 2.2！

---

【Step 2.2 执行中】视觉标签设计

思考过程:...

输出结果（文本格式，不要用JSON）:
列出5-8个视觉标签，每个标签包含：
1. 标签名称
2. 具体描述
3. 为什么选择这个标签

⚠️ **注意**：这只是Step 2.2的思考结果，不要输出JSON！继续执行Step 2.3！

---

【最终输出】

🚨🚨🚨 **这是最后一步，必须输出完整的JSON！** 🚨🚨🚨

⚠️ **重要**：
- 前面的步骤只是思考过程，现在才是真正输出JSON的时候！
- 必须包含所有必需字段：positioning, visualTags, selfCritique, thinking
- 必须是完整的、可解析的JSON格式！

请将所有步骤的结果合并为一个完整的JSON:
\`\`\`json
{
  "positioning": {...},
  "visualTags": [...],
  ...
}
\`\`\`
```

**优点**: 
1. LLM只看到1个```json```块,明确知道这是最终输出
2. 中间步骤的文本输出不会干扰最终JSON的生成
3. 每个步骤都有明确的提示"不要输出JSON！继续执行下一步！"

---

## 📋 需要修改的文件

### ✅ 已完成:
1. `stage2-visual-tags.ts` - Step 2.1, 2.2, 2.3已改为文本输出

### ⏳ 待完成:
1. `stage3-appearance-design-v2.ts` - Step 3.1已完成,还需修改3.2, 3.3, 3.4
2. `stage4-costume-design-v2.ts` - 需修改Step 4.1, 4.2, 4.3, 4.4

---

## 🎯 预期效果

修改后,LLM的输出应该是:

```
【Step 2.1 执行中】角色理解

思考过程:...

输出结果（文本格式，不要用JSON）:
- 角色理解：这是一个...
- 视觉方向：清冷、内敛、坚韧
- 美学策略：通过朴素的时代背景...

【Step 2.2 执行中】视觉标签设计

思考过程:...

输出结果（文本格式，不要用JSON）:
1. 深邃冷清的凤眼 - 眼型狭长而上挑...
2. 纤长利落的眉形 - 眉毛自然纤长...
...

【Step 2.3 执行中】自我批判

思考过程:...

输出结果（文本格式，不要用JSON）:
- 质量检查：满意
- 改进说明：无改进

【最终输出】

\`\`\`json
{
  "positioning": {
    "roleUnderstanding": "这是一个...",
    "visualDirection": "清冷、内敛、坚韧",
    "aestheticStrategy": "通过朴素的时代背景..."
  },
  "visualTags": [
    {
      "tag": "深邃冷清的凤眼",
      "description": "眼型狭长而上挑...",
      "meaning": "体现角色重生后的冷静..."
    },
    ...
  ],
  "selfCritique": {
    "qualityCheck": "满意",
    "improvements": "无改进"
  },
  "thinking": {
    "step2_1": "...",
    "step2_2": "...",
    "step2_3": "..."
  }
}
\`\`\`
```

这样extractJSON就能正确提取到【最终输出】后的完整JSON了! ✅

