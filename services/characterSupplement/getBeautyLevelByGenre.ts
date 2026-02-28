/**
 * 剧本类型 → 美型等级映射
 * 
 * 核心规则（参考 .augment/rules/角色补充核心规则.md）：
 * - 剧本类型决定美学标准（最高优先级）
 * - 题材类型优先于时代背景
 * 
 * 优先级系统：
 * 1. 明确的美型指向词（言情、甜宠、仙侠等）→ idealized
 * 2. 写实类型（悬疑、犯罪等）→ realistic
 * 3. 场景类型（现代都市、校园等）→ balanced
 *
 * 示例：
 * - "现代都市言情" → 优先匹配"言情" → idealized ✅
 * - "校园甜宠" → 优先匹配"甜宠" → idealized ✅
 * - "仙侠" → 优先匹配"仙侠" → idealized ✅
 * - "现代都市悬疑" → 优先匹配"悬疑" → realistic ✅
 * - "现代都市" → 无明确指向 → balanced ✅
 */

import type { BeautyLevel } from './types';

export function getBeautyLevelByGenre(genre: string): BeautyLevel {
  const genreLower = genre.toLowerCase();

  // 【优先级1】理想美型 (idealized) - 明确的美型指向词
  // 核心判断：剧情类型（言情、甜宠等）优先于场景设定（都市、校园等）
  //
  // 幻想世界类：仙侠/玄幻/奇幻/修仙/武侠/穿越/重生
  // 爱情类：女频/言情/偶像/甜宠/霸道总裁/耽美
  // 古典类：古装/宫廷
  if (genreLower.includes('仙侠') ||
      genreLower.includes('玄幻') ||
      genreLower.includes('奇幻') ||
      genreLower.includes('修仙') ||
      genreLower.includes('武侠') ||
      genreLower.includes('女频') ||
      genreLower.includes('言情') ||
      genreLower.includes('偶像') ||
      genreLower.includes('古装') ||
      genreLower.includes('宫廷') ||
      genreLower.includes('霸道总裁') ||
      genreLower.includes('总裁') ||
      genreLower.includes('甜宠') ||
      genreLower.includes('耽美') ||
      genreLower.includes('穿越') ||
      genreLower.includes('重生') ||
      genreLower.includes('玛丽苏') ||
      genreLower.includes('霸总')) {
    return 'idealized';
  }

  // 【优先级2】写实美型 (realistic) - 强调真实感的类型
  // 悬疑/推理/犯罪/历史/现实/纪实等
  if (genreLower.includes('悬疑') ||
      genreLower.includes('历史') ||
      genreLower.includes('现实') ||
      genreLower.includes('纪实') ||
      genreLower.includes('犯罪') ||
      genreLower.includes('推理')) {
    return 'realistic';
  }

  // 【优先级3】平衡美型 (balanced) - 场景类型或默认
  // 现代都市/校园/科幻等，以及无明确指向的类型
  return 'balanced';
}

