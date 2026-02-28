/**
 * 智能历史记录注入
 * 优先选择相似角色，只提取关键特征
 */

export interface CharacterHistory {
  name: string;
  gender?: string;
  ageGroup?: string;
  appearance?: string;
  costume?: string;
}

export interface HistoryOptions {
  maxRecords: number; // 最多注入几条记录
  prioritizeSimilar: boolean; // 是否优先选择相似角色
  includeKeyFeatures: boolean; // 是否只包含关键特征
}

/**
 * 计算角色相似度
 * @param currentChar 当前要生成的角色（用于与历史角色比较）
 * @param historyChar 历史中的角色记录
 * @returns 相似度分数（越高越相似，越适合作为参考排在前面）
 */
function calculateSimilarity(
  currentChar: Pick<CharacterHistory, 'gender' | 'ageGroup'> | undefined,
  historyChar: CharacterHistory
): number {
  let score = 0;

  // 同性别：+2分（最重要维度，避免男/女角色外貌相互干扰）
  if (currentChar?.gender && historyChar.gender && currentChar.gender === historyChar.gender) {
    score += 2;
  }

  // 同年龄段：+1分（年龄段相近的角色外貌参考价值更高）
  if (currentChar?.ageGroup && historyChar.ageGroup && currentChar.ageGroup === historyChar.ageGroup) {
    score += 1;
  }

  // 有外貌描述：+1分（有描述的记录作为参考更有价值，避免注入空记录）
  if (historyChar.appearance) {
    score += 1;
  }

  return score;
}

/**
 * 提取关键特征
 */
function extractKeyFeatures(char: CharacterHistory): string[] {
  const features: string[] = [];
  
  if (char.appearance) {
    // 提取发型
    const hairMatch = char.appearance.match(/【外貌特征】([^【\n]+)/);
    if (hairMatch) {
      const hairDesc = hairMatch[1].split('、')[0]; // 只取第一个特征
      features.push(hairDesc);
    }
    
    // 提取主体人物
    const mainMatch = char.appearance.match(/【主体人物】([^【\n]+)/);
    if (mainMatch) {
      features.push(mainMatch[1].substring(0, 30)); // 限制长度
    }
  }
  
  return features;
}

/**
 * 获取智能历史记录提示词
 * @param characterName 当前角色名（用于过滤自身）
 * @param stage 当前阶段（stage1不注入历史）
 * @param history 历史角色记录列表
 * @param options 注入选项
 * @param currentChar 可选：当前角色的性别/年龄信息，用于相似度排序（提供后排序效果更佳）
 */
export function getSmartHistoryPrompt(
  characterName: string,
  stage: string,
  history: CharacterHistory[],
  options: HistoryOptions,
  currentChar?: Pick<CharacterHistory, 'gender' | 'ageGroup'>
): string {

  // Stage1不需要历史记录
  if (options.maxRecords === 0) {
    return '';
  }

  // 1. 过滤掉当前角色
  let filtered = history.filter(h => h.name !== characterName);

  if (filtered.length === 0) {
    return '';
  }

  // 2. 优先选择相似角色（同性别、同年龄段）
  if (options.prioritizeSimilar) {
    filtered = filtered.sort((a, b) => {
      const scoreA = calculateSimilarity(currentChar, a);
      const scoreB = calculateSimilarity(currentChar, b);
      return scoreB - scoreA;
    });
  }
  
  // 3. 限制数量
  const records = filtered.slice(0, options.maxRecords);
  
  // 4. 只提取关键特征
  if (options.includeKeyFeatures) {
    const keyFeatures = records.map(r => {
      const features = extractKeyFeatures(r);
      return `${r.name}: ${features.join(', ')}`;
    }).filter(f => f.length > 0);
    
    if (keyFeatures.length === 0) {
      return '';
    }
    
    return `
## 参考已生成的角色（关键特征）
${keyFeatures.join('\n')}

⚠️ 注意：保持风格一致，但避免重复设计
`;
  }
  
  // 5. 完整描述（不推荐，token消耗大）
  return `
## 参考已生成的角色
${records.map(r => `### ${r.name}\n${r.appearance || ''}`).join('\n\n')}
`;
}

/**
 * 格式化历史记录（简化版）
 */
export function formatHistoryForPrompt(records: CharacterHistory[]): string {
  if (records.length === 0) {
    return '';
  }
  
  const keyFeatures = records.map(r => {
    const features = extractKeyFeatures(r);
    return `- ${r.name}: ${features.join(', ')}`;
  }).filter(f => f.length > 0);
  
  if (keyFeatures.length === 0) {
    return '';
  }
  
  return `
## 已生成角色参考
${keyFeatures.join('\n')}
⚠️ 保持风格一致，避免重复
`;
}

