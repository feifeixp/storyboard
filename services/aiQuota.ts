/**
 * AI解析配额管理服务
 * 
 * 功能：
 * 1. 每天免费10次AI解析
 * 2. 超过配额后提示用户
 * 3. 每天0点重置配额
 * 4. 使用localStorage持久化配额数据
 * 
 * 创建时间：2024-12-30
 */

/**
 * 配额数据
 */
interface QuotaData {
  date: string; // YYYY-MM-DD
  used: number; // 已使用次数
}

/**
 * 配额配置
 */
const QUOTA_CONFIG = {
  KEY: 'ai_parse_quota',
  DAILY_LIMIT: 10, // 每天免费10次
};

/**
 * 获取今天的日期字符串（YYYY-MM-DD）
 */
function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 从localStorage读取配额数据
 */
function loadQuota(): QuotaData {
  try {
    const data = localStorage.getItem(QUOTA_CONFIG.KEY);
    if (!data) {
      return { date: getTodayString(), used: 0 };
    }
    
    const quota: QuotaData = JSON.parse(data);
    
    // 如果日期不是今天，重置配额
    if (quota.date !== getTodayString()) {
      return { date: getTodayString(), used: 0 };
    }
    
    return quota;
  } catch (error) {
    console.warn('[配额] 读取配额失败:', error);
    return { date: getTodayString(), used: 0 };
  }
}

/**
 * 保存配额数据到localStorage
 */
function saveQuota(quota: QuotaData): void {
  try {
    localStorage.setItem(QUOTA_CONFIG.KEY, JSON.stringify(quota));
  } catch (error) {
    console.warn('[配额] 保存配额失败:', error);
  }
}

/**
 * 检查是否还有配额
 */
export function hasQuota(): boolean {
  const quota = loadQuota();
  return quota.used < QUOTA_CONFIG.DAILY_LIMIT;
}

/**
 * 获取剩余配额
 */
export function getRemainingQuota(): number {
  const quota = loadQuota();
  return Math.max(0, QUOTA_CONFIG.DAILY_LIMIT - quota.used);
}

/**
 * 使用配额（调用AI解析时）
 */
export function useQuota(): boolean {
  const quota = loadQuota();
  
  if (quota.used >= QUOTA_CONFIG.DAILY_LIMIT) {
    console.warn('[配额] 今日配额已用完');
    return false;
  }
  
  quota.used++;
  saveQuota(quota);
  
  console.log(`[配额] 使用配额，剩余: ${QUOTA_CONFIG.DAILY_LIMIT - quota.used}/${QUOTA_CONFIG.DAILY_LIMIT}`);
  return true;
}

/**
 * 重置配额（仅用于测试）
 */
export function resetQuota(): void {
  const quota: QuotaData = {
    date: getTodayString(),
    used: 0,
  };
  saveQuota(quota);
  console.log('[配额] 配额已重置');
}

/**
 * 获取配额统计信息
 */
export function getQuotaStats(): {
  date: string;
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
} {
  const quota = loadQuota();
  const remaining = Math.max(0, QUOTA_CONFIG.DAILY_LIMIT - quota.used);
  const percentage = (quota.used / QUOTA_CONFIG.DAILY_LIMIT) * 100;
  
  return {
    date: quota.date,
    used: quota.used,
    limit: QUOTA_CONFIG.DAILY_LIMIT,
    remaining,
    percentage,
  };
}

/**
 * 获取配额重置时间（明天0点）
 */
export function getQuotaResetTime(): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

/**
 * 获取配额重置倒计时（秒）
 */
export function getQuotaResetCountdown(): number {
  const now = new Date();
  const resetTime = getQuotaResetTime();
  return Math.floor((resetTime.getTime() - now.getTime()) / 1000);
}

