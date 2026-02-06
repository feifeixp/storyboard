/**
 * 场景重新提取服务
 * 从剧本中智能提取新场景，支持去重和相似度检测
 * 
 * @version 1.0
 * @date 2024-12-26
 */

import { ScriptFile, SceneRef } from '../types/project';

const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const SIMILARITY_THRESHOLD = 0.8; // 相似度阈值（80%）

/**
 * 计算两个字符串的相似度（使用Levenshtein距离算法）
 * @returns 相似度分数 0-1，1表示完全相同
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Levenshtein距离算法
  const matrix: number[][] = [];
  
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j] + 1      // 删除
        );
      }
    }
  }
  
  const maxLen = Math.max(s1.length, s2.length);
  const distance = matrix[s2.length][s1.length];
  return 1 - distance / maxLen;
}

/**
 * 检查场景名称是否与已有场景相似
 * @returns 如果相似则返回相似的场景名，否则返回null
 */
function findSimilarScene(sceneName: string, existingScenes: SceneRef[]): string | null {
  for (const scene of existingScenes) {
    const similarity = calculateSimilarity(sceneName, scene.name);
    if (similarity >= SIMILARITY_THRESHOLD) {
      console.log(`[场景去重] "${sceneName}" 与 "${scene.name}" 相似度: ${(similarity * 100).toFixed(1)}%`);
      return scene.name;
    }
  }
  return null;
}

/**
 * 从剧本中重新提取场景
 * @param scripts 所有剧本
 * @param existingScenes 现有场景（用于去重）
 * @param model AI模型
 * @param onProgress 进度回调
 * @returns 新发现的场景列表
 */
export async function extractNewScenes(
  scripts: ScriptFile[],
  existingScenes: SceneRef[],
  model: string = DEFAULT_MODEL,
  onProgress?: (current: number, total: number) => void
): Promise<SceneRef[]> {
  console.log(`[场景提取] 开始提取，共${scripts.length}集剧本，已有${existingScenes.length}个场景`);
  
  // 构建已知场景列表
  const existingNames = existingScenes.map(s => s.name).join('、');
  
  // 构建剧本内容（每集取样3000字）
  const scriptSamples = scripts.map((s, idx) => {
    const epNum = s.episodeNumber ?? (idx + 1);
    return `=== 第${epNum}集 ===\n${s.content.slice(0, 3000)}`;
  }).join('\n\n');
  
  // 构建提示词
  const prompt = `# 任务：从剧本中提取新场景

## 已知场景（不要重复提取以下场景）
${existingNames || '（无）'}

## 剧本内容
${scriptSamples}

## 要求
1. 仔细阅读剧本，提取所有出现的场景地点
2. **排除已知场景**，只提取新场景
3. 场景必须是具体的地点，不要提取角色名或剧情事件
4. 每个场景包含：
   - name: 场景名称（简洁明确）
   - description: 场景描述（50-100字）
   - atmosphere: 氛围描述（如"神秘、压抑"）
   - appearsInEpisodes: 出现的集数数组（如[1, 3, 5]）

## 输出格式（严格JSON）
\`\`\`json
{
  "newScenes": [
    {
      "name": "场景名称",
      "description": "场景的详细描述，包括环境特征、视觉元素等",
      "atmosphere": "氛围描述",
      "appearsInEpisodes": [1, 3, 5]
    }
  ]
}
\`\`\`

**重要**: 
- 只输出JSON，不要有其他文字
- 如果没有新场景，返回 {"newScenes": []}
- 确保JSON格式正确，可以被解析`;

  try {
    onProgress?.(0, 1);
    
    // 调用API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Visionary Storyboard Studio',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3, // 降低温度，提高准确性
      }),
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('API返回内容为空');
    }

    onProgress?.(1, 1);

    // 解析JSON结果
    let parsedResult: { newScenes: any[] };
    try {
      // 清理 markdown 代码块标记
      let cleanedContent = content.trim();

      // 移除开头的 ```json 或 ```
      cleanedContent = cleanedContent.replace(/^```(?:json)?\s*\n?/i, '');

      // 移除结尾的 ```
      cleanedContent = cleanedContent.replace(/\n?```\s*$/i, '');

      // 再次清理空白字符
      cleanedContent = cleanedContent.trim();

      console.log('[场景提取] 清理后的JSON:', cleanedContent.substring(0, 200) + '...');

      parsedResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('[场景提取] JSON解析失败，原始内容:', content.substring(0, 500));
      throw new Error(`JSON解析失败: ${parseError}`);
    }

    if (!parsedResult.newScenes || !Array.isArray(parsedResult.newScenes)) {
      console.error('[场景提取] 返回格式错误:', parsedResult);
      throw new Error('返回格式错误：缺少newScenes数组');
    }

    console.log(`[场景提取] AI返回${parsedResult.newScenes.length}个场景`);

    // 转换为SceneRef格式，并进行去重
    const newScenes: SceneRef[] = [];
    const skippedScenes: string[] = [];

    for (const scene of parsedResult.newScenes) {
      // 验证必需字段
      if (!scene.name || !scene.description) {
        console.warn('[场景提取] 跳过无效场景:', scene);
        continue;
      }

      // 精确匹配去重
      const exactMatch = existingScenes.find(s => s.name === scene.name);
      if (exactMatch) {
        console.log(`[场景去重] 精确匹配，跳过: "${scene.name}"`);
        skippedScenes.push(scene.name);
        continue;
      }

      // 相似度检测去重
      const similarScene = findSimilarScene(scene.name, existingScenes);
      if (similarScene) {
        console.log(`[场景去重] 相似场景，跳过: "${scene.name}" (相似于 "${similarScene}")`);
        skippedScenes.push(scene.name);
        continue;
      }

      // 检查是否与已添加的新场景重复
      const duplicateInNew = newScenes.find(s => s.name === scene.name);
      if (duplicateInNew) {
        console.log(`[场景去重] 新场景中重复，跳过: "${scene.name}"`);
        continue;
      }

      // 添加新场景
      newScenes.push({
        id: `scene-extracted-${Date.now()}-${newScenes.length}`,
        name: scene.name,
        description: scene.description,
        atmosphere: scene.atmosphere || '',
        visualPromptCn: '', // 待后续补充
        visualPromptEn: '', // 待后续补充
        appearsInEpisodes: Array.isArray(scene.appearsInEpisodes) ? scene.appearsInEpisodes : [],
      });
    }

    console.log(`[场景提取] 完成：发现${newScenes.length}个新场景，跳过${skippedScenes.length}个重复场景`);
    if (skippedScenes.length > 0) {
      console.log(`[场景提取] 跳过的场景:`, skippedScenes);
    }

    return newScenes;

  } catch (error: any) {
    console.error('[场景提取] 提取失败:', error);
    throw new Error(`场景提取失败: ${error.message || error}`);
  }
}

