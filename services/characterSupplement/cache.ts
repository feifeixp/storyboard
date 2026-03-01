/**
 * 角色补全缓存机制
 * 使用localStorage存储，24小时过期
 * 支持版本号，方便后续升级
 */

import type { CharacterRef } from '../../types';
import type { ScriptFile } from '../../types/project';
import type { SupplementCacheContext } from './types';

const CACHE_KEY_PREFIX = 'char_supplement_';
const CACHE_VERSION = '1.2';  // 🆕 升级版本：增加Stage5（quote/abilities/identityEvolution/forms补充）+ 材质词库
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时

interface CacheData {
  result: CharacterRef;
  timestamp: number;
  version: string;
  missingFields: string[];
}

/**
 * 生成缓存键
 */
function normalizeFields(fields: string[]): string {
  // 🔧 使用拷贝避免 sort() 原地修改调用方数组
  return [...fields].sort().join(',');
}

function getCacheKey(
  characterName: string,
  missingFields: string[],
  context: SupplementCacheContext
): string {
  // ✅ 强隔离：project/character/script/mode/beautyLevel/fields
  const sortedFields = normalizeFields(missingFields);
  const safeName = (characterName || '').trim().slice(0, 32);
  return `${CACHE_KEY_PREFIX}${CACHE_VERSION}_${context.projectId}_${context.characterId}_${context.scriptHash}_${context.mode}_${context.beautyLevel}_${sortedFields}_${safeName}`;
}

/**
 * 生成脚本指纹（轻量 hash）
 * 说明：用于脚本内容变化后自动失效缓存，避免旧结果短路。
 */
export function generateScriptHash(scripts: ScriptFile[]): string {
  try {
    const sorted = [...(scripts || [])].sort((a, b) => (a.fileName || '').localeCompare(b.fileName || ''));
    const content = sorted
      .map(s => `${s.fileName || ''}\n${s.content || ''}`)
      .join('\n\n---\n\n');

    // FNV-1a 32-bit
    let hash = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
      hash ^= content.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  } catch (error) {
    console.warn('[缓存] 生成脚本hash失败，降级为固定值:', error);
    return '00000000';
  }
}

function sanitizeResultForCache(result: CharacterRef): CharacterRef {
  // localStorage 空间有限，避免缓存 base64 图片等大字段
  const { data, ...rest } = (result || {}) as CharacterRef & { data?: string };
  return rest;
}

/**
 * 获取缓存结果
 */
export function getCachedResult(
  characterName: string,
  missingFields: string[],
  context?: SupplementCacheContext
): CharacterRef | null {
  try {
    if (!context) {
      console.log('[缓存] 未提供cacheContext，跳过缓存读取');
      return null;
    }

    const key = getCacheKey(characterName, missingFields, context);
    const cached = localStorage.getItem(key);
    
    if (!cached) {
      console.log('[缓存] 未找到缓存');
      return null;
    }
    
    const data: CacheData = JSON.parse(cached);
    
    // 检查版本号
    if (data.version !== CACHE_VERSION) {
      console.log('[缓存] 版本不匹配，清除缓存', { cached: data.version, current: CACHE_VERSION });
      localStorage.removeItem(key);
      return null;
    }
    
    // 检查过期时间
    const age = Date.now() - data.timestamp;
    if (age > CACHE_EXPIRY) {
      console.log('[缓存] 已过期，清除缓存', { age: `${(age / 1000 / 60 / 60).toFixed(1)}小时` });
      localStorage.removeItem(key);
      return null;
    }
    
    // 检查字段是否匹配（双重校验，避免脏数据）
    const cachedFields = normalizeFields(data.missingFields || []);
    const requestedFields = normalizeFields(missingFields);
    if (cachedFields !== requestedFields) {
      console.log('[缓存] 字段不匹配', { cached: cachedFields, requested: requestedFields });
      return null;
    }
    
    console.log('✅ [缓存] 命中缓存', { 
      age: `${(age / 1000 / 60).toFixed(1)}分钟前`,
      fields: missingFields.join(', ')
    });
    
    return data.result;
    
  } catch (error) {
    console.error('[缓存] 读取失败:', error);
    return null;
  }
}

/**
 * 保存缓存结果
 */
export function setCachedResult(
  characterName: string,
  missingFields: string[],
  result: CharacterRef,
  context?: SupplementCacheContext
): void {
  try {
    if (!context) {
      console.log('[缓存] 未提供cacheContext，跳过缓存写入');
      return;
    }

    const key = getCacheKey(characterName, missingFields, context);
    const data: CacheData = {
      result: sanitizeResultForCache(result),
      timestamp: Date.now(),
      version: CACHE_VERSION,
      missingFields
    };
    
    const jsonStr = JSON.stringify(data);
    
    // 检查数据大小（localStorage限制约5-10MB）
    const sizeInMB = jsonStr.length / 1024 / 1024;
    if (sizeInMB > 5) {
      console.warn('[缓存] 数据过大，不缓存', { size: `${sizeInMB.toFixed(2)}MB` });
      return;
    }
    
    localStorage.setItem(key, jsonStr);
    console.log('✅ [缓存] 已保存', { 
      character: characterName,
      fields: missingFields.join(', '),
      size: `${(jsonStr.length / 1024).toFixed(1)}KB`
    });
    
  } catch (error) {
    console.error('[缓存] 保存失败:', error);
    // 如果是QuotaExceededError，清理旧缓存
    if (error.name === 'QuotaExceededError') {
      console.warn('[缓存] 存储空间不足，清理旧缓存...');
      clearOldCache();
      
      // 重试一次
      try {
        const key = getCacheKey(characterName, missingFields, context);
        const data: CacheData = {
          result: sanitizeResultForCache(result),
          timestamp: Date.now(),
          version: CACHE_VERSION,
          missingFields
        };
        localStorage.setItem(key, JSON.stringify(data));
        console.log('✅ [缓存] 清理后保存成功');
      } catch (retryError) {
        console.error('[缓存] 重试保存失败:', retryError);
      }
    }
  }
}

/**
 * 清理旧缓存（保留最近的10个）
 */
export function clearOldCache(): void {
  try {
    const cacheKeys: Array<{ key: string; timestamp: number }> = [];
    
    // 收集所有缓存键和时间戳
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const data: CacheData = JSON.parse(localStorage.getItem(key)!);
          cacheKeys.push({ key, timestamp: data.timestamp });
        } catch (e) {
          // 无效的缓存，直接删除
          localStorage.removeItem(key);
        }
      }
    }
    
    // 按时间戳排序，删除最旧的
    cacheKeys.sort((a, b) => b.timestamp - a.timestamp);
    const toDelete = cacheKeys.slice(10); // 保留最近的10个
    
    toDelete.forEach(({ key }) => {
      localStorage.removeItem(key);
    });
    
    console.log(`[缓存] 已清理 ${toDelete.length} 个旧缓存`);
    
  } catch (error) {
    console.error('[缓存] 清理失败:', error);
  }
}

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  try {
    const keys: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    
    keys.forEach(key => localStorage.removeItem(key));
    
    console.log(`[缓存] 已清除所有缓存 (${keys.length}个)`);
    
  } catch (error) {
    console.error('[缓存] 清除失败:', error);
  }
}

