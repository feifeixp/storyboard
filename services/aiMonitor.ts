/**
 * AI解析性能监控服务
 * 
 * 功能：
 * 1. 记录每次AI调用的性能数据
 * 2. 统计调用次数、成功率、平均耗时
 * 3. 估算成本
 * 4. 使用localStorage持久化监控数据
 * 
 * 创建时间：2024-12-30
 */

/**
 * 调用记录
 */
interface CallRecord {
  timestamp: number;
  input: string;
  success: boolean;
  duration: number; // 毫秒
  cached: boolean;
  error?: string;
}

/**
 * 监控数据
 */
interface MonitorData {
  records: CallRecord[];
}

/**
 * 监控配置
 */
const MONITOR_CONFIG = {
  KEY: 'ai_parse_monitor',
  MAX_RECORDS: 1000, // 最多保存1000条记录
  COST_PER_CALL: 0.00015, // 每次调用成本（美元）
};

/**
 * 从localStorage读取监控数据
 */
function loadMonitor(): MonitorData {
  try {
    const data = localStorage.getItem(MONITOR_CONFIG.KEY);
    if (!data) {
      return { records: [] };
    }
    
    return JSON.parse(data);
  } catch (error) {
    console.warn('[监控] 读取监控数据失败:', error);
    return { records: [] };
  }
}

/**
 * 保存监控数据到localStorage
 */
function saveMonitor(data: MonitorData): void {
  try {
    // 限制记录数量
    if (data.records.length > MONITOR_CONFIG.MAX_RECORDS) {
      data.records = data.records.slice(-MONITOR_CONFIG.MAX_RECORDS);
    }
    
    localStorage.setItem(MONITOR_CONFIG.KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[监控] 保存监控数据失败:', error);
  }
}

/**
 * 记录调用
 */
export function recordCall(
  input: string,
  success: boolean,
  duration: number,
  cached: boolean,
  error?: string
): void {
  const data = loadMonitor();
  
  data.records.push({
    timestamp: Date.now(),
    input,
    success,
    duration,
    cached,
    error,
  });
  
  saveMonitor(data);
  
  console.log(`[监控] 记录调用: ${success ? '成功' : '失败'}, 耗时: ${duration}ms, 缓存: ${cached}`);
}

/**
 * 获取统计信息
 */
export function getStats(days: number = 7): {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  cachedCalls: number;
  successRate: number;
  cacheHitRate: number;
  avgDuration: number;
  totalCost: number;
  avgCostPerDay: number;
} {
  const data = loadMonitor();
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  
  // 过滤最近N天的记录
  const recentRecords = data.records.filter(r => r.timestamp >= cutoffTime);
  
  const totalCalls = recentRecords.length;
  const successCalls = recentRecords.filter(r => r.success).length;
  const failedCalls = totalCalls - successCalls;
  const cachedCalls = recentRecords.filter(r => r.cached).length;
  const apiCalls = recentRecords.filter(r => r.success && !r.cached).length;
  
  const successRate = totalCalls > 0 ? (successCalls / totalCalls) * 100 : 0;
  const cacheHitRate = totalCalls > 0 ? (cachedCalls / totalCalls) * 100 : 0;
  
  const totalDuration = recentRecords.reduce((sum, r) => sum + r.duration, 0);
  const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
  
  const totalCost = apiCalls * MONITOR_CONFIG.COST_PER_CALL;
  const avgCostPerDay = days > 0 ? totalCost / days : 0;
  
  return {
    totalCalls,
    successCalls,
    failedCalls,
    cachedCalls,
    successRate,
    cacheHitRate,
    avgDuration,
    totalCost,
    avgCostPerDay,
  };
}

/**
 * 获取最近的调用记录
 */
export function getRecentCalls(limit: number = 10): CallRecord[] {
  const data = loadMonitor();
  return data.records.slice(-limit).reverse();
}

/**
 * 清空监控数据
 */
export function clearMonitor(): void {
  localStorage.removeItem(MONITOR_CONFIG.KEY);
  console.log('[监控] 已清空监控数据');
}

/**
 * 获取今日统计
 */
export function getTodayStats(): {
  calls: number;
  success: number;
  failed: number;
  cached: number;
  cost: number;
} {
  const data = loadMonitor();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();
  
  const todayRecords = data.records.filter(r => r.timestamp >= todayTimestamp);
  
  const calls = todayRecords.length;
  const success = todayRecords.filter(r => r.success).length;
  const failed = calls - success;
  const cached = todayRecords.filter(r => r.cached).length;
  const apiCalls = todayRecords.filter(r => r.success && !r.cached).length;
  const cost = apiCalls * MONITOR_CONFIG.COST_PER_CALL;
  
  return { calls, success, failed, cached, cost };
}

