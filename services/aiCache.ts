/**
 * AI解析缓存服务
 * 
 * 功能：
 * 1. 缓存AI解析结果，避免重复调用
 * 2. 使用localStorage持久化缓存
 * 3. 支持缓存过期时间（默认7天）
 * 4. 支持缓存清理
 * 
 * 创建时间：2024-12-30
 */

import type { AIParseResult } from './aiParser';

/**
 * 缓存项
 */
interface CacheItem {
  input: string;
  result: AIParseResult;
  timestamp: number;
}

/**
 * 缓存配置
 */
const CACHE_CONFIG = {
  KEY: 'ai_parse_cache',
  MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7天（毫秒）
  MAX_SIZE: 100, // 最多缓存100条
};

/**
 * 生成缓存键（使用输入文本的hash）
 */
function generateCacheKey(input: string): string {
  // 简单的hash函数（使用输入文本的小写版本）
  return input.toLowerCase().trim();
}

/**
 * 从localStorage读取缓存
 */
function loadCache(): Map<string, CacheItem> {
  try {
    const data = localStorage.getItem(CACHE_CONFIG.KEY);
    if (!data) return new Map();
    
    const items: [string, CacheItem][] = JSON.parse(data);
    return new Map(items);
  } catch (error) {
    console.warn('[缓存] 读取缓存失败:', error);
    return new Map();
  }
}

/**
 * 保存缓存到localStorage
 */
function saveCache(cache: Map<string, CacheItem>): void {
  try {
    const items = Array.from(cache.entries());
    localStorage.setItem(CACHE_CONFIG.KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('[缓存] 保存缓存失败:', error);
  }
}

/**
 * 清理过期缓存
 */
function cleanExpiredCache(cache: Map<string, CacheItem>): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, item] of cache.entries()) {
    if (now - item.timestamp > CACHE_CONFIG.MAX_AGE) {
      cache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[缓存] 清理了${cleaned}条过期缓存`);
  }
}

/**
 * 限制缓存大小（LRU策略）
 */
function limitCacheSize(cache: Map<string, CacheItem>): void {
  if (cache.size <= CACHE_CONFIG.MAX_SIZE) return;
  
  // 按时间戳排序，删除最旧的
  const sorted = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toDelete = sorted.slice(0, cache.size - CACHE_CONFIG.MAX_SIZE);
  
  for (const [key] of toDelete) {
    cache.delete(key);
  }
  
  console.log(`[缓存] 删除了${toDelete.length}条旧缓存`);
}

/**
 * 获取缓存
 */
export function getCachedResult(input: string): AIParseResult | null {
  const cache = loadCache();
  cleanExpiredCache(cache);
  
  const key = generateCacheKey(input);
  const item = cache.get(key);
  
  if (!item) return null;
  
  // 检查是否过期
  if (Date.now() - item.timestamp > CACHE_CONFIG.MAX_AGE) {
    cache.delete(key);
    saveCache(cache);
    return null;
  }
  
  console.log('[缓存] 命中缓存:', input);
  return item.result;
}

/**
 * 保存缓存
 */
export function setCachedResult(input: string, result: AIParseResult): void {
  const cache = loadCache();
  cleanExpiredCache(cache);
  limitCacheSize(cache);
  
  const key = generateCacheKey(input);
  cache.set(key, {
    input,
    result,
    timestamp: Date.now(),
  });
  
  saveCache(cache);
  console.log('[缓存] 保存缓存:', input);
}

/**
 * 清空所有缓存
 */
export function clearCache(): void {
  localStorage.removeItem(CACHE_CONFIG.KEY);
  console.log('[缓存] 已清空所有缓存');
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  maxAge: number;
  oldestTimestamp: number | null;
} {
  const cache = loadCache();
  
  let oldestTimestamp: number | null = null;
  for (const item of cache.values()) {
    if (oldestTimestamp === null || item.timestamp < oldestTimestamp) {
      oldestTimestamp = item.timestamp;
    }
  }
  
  return {
    size: cache.size,
    maxSize: CACHE_CONFIG.MAX_SIZE,
    maxAge: CACHE_CONFIG.MAX_AGE,
    oldestTimestamp,
  };
}

