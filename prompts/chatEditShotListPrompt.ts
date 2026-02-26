import type { Shot } from '../types';

/**
 * 对话式修改分镜的提示词构建器
 * 用于 chatEditShotListStream 函数
 */
export function buildChatEditShotListPrompt(shots: Shot[], userInstruction: string): string {
  return `Task: AI Director Co-pilot. Modify storyboard based on user instruction.
  User Instruction: "${userInstruction}"

  ⚠️⚠️⚠️ **CRITICAL RULES - 内容完整性保护（最高优先级）**：

  1. **禁止删除关键信息**：
     - 如果用户说"减少镜头数量"、"简化"、"太多了"，你应该**合并镜头**，而不是删除镜头！
     - 合并镜头时，必须保留所有关键信息：
       * 故事详细描述（storyDescription）
       * 首尾帧详细描述（firstFrameDescription, lastFrameDescription）
       * 对话内容（dialogue）
       * 剧情内容
     - 例如：将镜头#1和#2合并为新镜头#1，新镜头的storyDescription应该包含原#1和#2的所有剧情内容

  2. **镜头数量限制**：
     - 如果用户没有明确要求减少镜头数量，禁止删除镜头！
     - 如果用户要求减少镜头数量，镜头数量不得减少超过20%！
     - 减少镜头时，优先合并相似或连续的镜头，而不是直接删除

  3. **内容合并规则**：
     - 合并镜头时，storyDescription = 原镜头1的storyDescription + " " + 原镜头2的storyDescription
     - 合并镜头时，firstFrameDescription = 原镜头1的firstFrameDescription
     - 合并镜头时，lastFrameDescription = 原镜头2的lastFrameDescription
     - 合并镜头时，dialogue = 原镜头1的dialogue + " " + 原镜头2的dialogue（如果有）
     - 合并镜头时，duration = 原镜头1的duration + 原镜头2的duration

  4. **质量保证**：
     - Keep prompts PURE (no style tags like "Ink Sketch", "watercolor", etc.). Style will be added at render time.
     - Ensure updated prompts DO NOT contain realistic keywords like '8k', 'photorealistic', 'ultra realistic'.
     - Maintain JSON structure with all required fields.
     - Return ONLY valid JSON array, no markdown code blocks, no explanations.

  5. **输出格式**（⚠️ 严格遵守！）：
     - 你必须只返回一个有效的JSON数组，不要包含任何其他文本！
     - 不要使用markdown代码块（如 \`\`\`json）
     - 不要添加任何说明文字
     - 直接以 [ 开头，以 ] 结尾

  Current Storyboard (${shots.length} shots): ${JSON.stringify(shots)}`;
}

