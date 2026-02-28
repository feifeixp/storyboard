/**
 * 角色提取缓存服务
 * 
 * 功能：
 * 1. 缓存角色提取结果，避免重复LLM调用
 * 2. 使用localStorage持久化缓存
 * 3. 支持缓存过期时间（默认7天）
 * 
 * 创建时间：2024-12-28
 */

const CACHE_KEY_PREFIX = 'character_extraction_';
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7天（毫秒）

/**
 * 缓存项
 */
interface CacheItem {
  data: Array<{ name: string; gender: '男' | '女' | '未知'; appearance: string }>;
  timestamp: number;
}

/**
 * 生成剧本hash（简单hash：取前100字符）
 */
function hashScript(script: string): string {
  return script.toLowerCase().trim().substring(0, 100);
}

/**
 * 获取缓存的角色提取结果
 */
export function getCachedCharacters(script: string): Array<{ name: string; gender: '男' | '女' | '未知'; appearance: string }> | null {
  try {
    const key = CACHE_KEY_PREFIX + hashScript(script);
    const cached = localStorage.getItem(key);
    
    if (!cached) return null;
    
    const item: CacheItem = JSON.parse(cached);
    
    // 检查是否过期
    if (Date.now() - item.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(key);
      return null;
    }
    
    console.log('[角色提取缓存] 缓存命中');
    return item.data;
  } catch (error) {
    console.warn('[角色提取缓存] 读取缓存失败:', error);
    return null;
  }
}

/**
 * 保存角色提取结果到缓存
 */
export function setCachedCharacters(
  script: string,
  characters: Array<{ name: string; gender: '男' | '女' | '未知'; appearance: string }>
): void {
  try {
    const key = CACHE_KEY_PREFIX + hashScript(script);
    const item: CacheItem = {
      data: characters,
      timestamp: Date.now(),
    };
    
    localStorage.setItem(key, JSON.stringify(item));
    console.log('[角色提取缓存] 缓存已保存');
  } catch (error) {
    console.warn('[角色提取缓存] 保存缓存失败:', error);
  }
}

/**
 * 清除所有角色提取缓存
 */
export function clearCharacterCache(): void {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
    
    cacheKeys.forEach(key => localStorage.removeItem(key));
    console.log(`[角色提取缓存] 已清除 ${cacheKeys.length} 个缓存项`);
  } catch (error) {
    console.warn('[角色提取缓存] 清除缓存失败:', error);
  }
}

