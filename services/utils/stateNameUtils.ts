/**
 * 状态名归一化工具
 * 用于统一处理状态名的变体（全角/半角括号、空格等）
 * 
 * 创建原因：解决"正道修士乙重复常规完好"问题（测试15.ini）
 * - extractCharacterStates 返回的状态名可能有微小差异（全角/半角括号、空格）
 * - App.tsx 用精确字符串匹配 `f.name !== '常规状态（完好）'` 导致去重失败
 * - 统一归一化逻辑，避免多处重复实现
 */

/**
 * 归一化状态名
 * - 去除所有空格
 * - 统一括号为半角
 * - 转为小写
 * 
 * @example
 * normalizeStateName('常规状态（完好）') === normalizeStateName('常规状态(完好) ')
 * // => true
 */
export function normalizeStateName(name: string): string {
  return name
    .replace(/\s+/g, '') // 去除所有空格
    .replace(/[（(]/g, '(') // 统一左括号为半角
    .replace(/[）)]/g, ')') // 统一右括号为半角
    .trim()
    .toLowerCase();
}

/**
 * 检查两个状态名是否相同（忽略格式差异）
 * 
 * @example
 * isSameStateName('常规状态（完好）', '常规状态(完好) ') // => true
 */
export function isSameStateName(name1: string, name2: string): boolean {
  return normalizeStateName(name1) === normalizeStateName(name2);
}

/**
 * 常规完好状态的标准名称（全角括号）
 */
export const BASELINE_STATE_NAME = '常规状态（完好）';

/**
 * 归一化后的常规完好状态名
 */
export const NORMALIZED_BASELINE = normalizeStateName(BASELINE_STATE_NAME);

/**
 * Baseline 状态的语义同义名列表（B2方案）
 * 这些名称语义上等同于"常规状态（完好）"，会被识别为 baseline 并过滤/去重。
 *
 * 选取原则：
 * - 只加入"完好+常服/常态"的明确组合，避免误伤真实状态名
 * - 不包含"正常状态"、"日常状态"等通用词（有误伤风险）
 * - 可按需追加新的同义名（B2方案可扩展）
 */
export const BASELINE_SYNONYMS: readonly string[] = [
  '完好常服',  // 测试15实际案例：LLM 将"常规"理解为"常服"（服装语境）
  '常服完好',  // 同义倒装
  '完好常态',  // "常服"→"常态" 的同义替换
  '常态完好',  // 同义倒装
];

/**
 * 归一化后的 baseline 同义名列表（预计算，提升性能）
 */
const NORMALIZED_BASELINE_SYNONYMS: string[] = [...BASELINE_SYNONYMS].map(normalizeStateName);

/**
 * 检查是否为 baseline 状态（忽略格式差异 + B2 语义同义名）
 *
 * @example
 * isBaselineStateName('常规状态(完好)') // => true
 * isBaselineStateName('常规状态（完好） ') // => true
 * isBaselineStateName('完好常服') // => true  (B2 同义名)
 * isBaselineStateName('常服完好') // => true  (B2 同义名)
 * isBaselineStateName('战损状态') // => false
 */
export function isBaselineStateName(name: string): boolean {
  const normalized = normalizeStateName(name);
  // 1. 严格匹配（忽略格式差异：括号/空格）
  if (normalized === NORMALIZED_BASELINE) return true;
  // 2. B2 语义同义名匹配
  return NORMALIZED_BASELINE_SYNONYMS.includes(normalized);
}

