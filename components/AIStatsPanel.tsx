/**
 * AI解析统计面板组件
 * 
 * 功能：
 * 1. 展示配额使用情况
 * 2. 展示缓存统计
 * 3. 展示性能监控数据
 * 4. 支持清空缓存和监控数据
 * 
 * 创建时间：2024-12-30
 */

import React, { useState, useEffect } from 'react';
import { getQuotaStats, resetQuota } from '../services/aiQuota';
import { getCacheStats, clearCache } from '../services/aiCache';
import { getStats, getTodayStats, clearMonitor } from '../services/aiMonitor';

export const AIStatsPanel: React.FC = () => {
  const [quotaStats, setQuotaStats] = useState(getQuotaStats());
  const [cacheStats, setCacheStats] = useState(getCacheStats());
  const [todayStats, setTodayStats] = useState(getTodayStats());
  const [weekStats, setWeekStats] = useState(getStats(7));
  
  // 刷新统计数据
  const refreshStats = () => {
    setQuotaStats(getQuotaStats());
    setCacheStats(getCacheStats());
    setTodayStats(getTodayStats());
    setWeekStats(getStats(7));
  };
  
  // 每秒刷新一次
  useEffect(() => {
    const timer = setInterval(refreshStats, 1000);
    return () => clearInterval(timer);
  }, []);
  
  // 清空缓存
  const handleClearCache = () => {
    if (confirm('确定要清空所有缓存吗？')) {
      clearCache();
      refreshStats();
    }
  };
  
  // 清空监控数据
  const handleClearMonitor = () => {
    if (confirm('确定要清空所有监控数据吗？')) {
      clearMonitor();
      refreshStats();
    }
  };
  
  // 重置配额（仅用于测试）
  const handleResetQuota = () => {
    if (confirm('确定要重置今日配额吗？（仅用于测试）')) {
      resetQuota();
      refreshStats();
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">AI解析统计</h2>
      
      {/* 配额统计 */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">今日配额</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">已使用</span>
            <span className="font-semibold text-blue-600">
              {quotaStats.used} / {quotaStats.limit}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">剩余</span>
            <span className="font-semibold text-green-600">
              {quotaStats.remaining}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${quotaStats.percentage}%` }}
            />
          </div>
          <button
            onClick={handleResetQuota}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            重置配额（测试）
          </button>
        </div>
      </div>
      
      {/* 缓存统计 */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">缓存统计</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">缓存数量</span>
            <span className="font-semibold">
              {cacheStats.size} / {cacheStats.maxSize}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">缓存有效期</span>
            <span className="font-semibold">7天</span>
          </div>
          <button
            onClick={handleClearCache}
            className="text-sm text-red-500 hover:text-red-700"
          >
            清空缓存
          </button>
        </div>
      </div>
      
      {/* 今日统计 */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">今日统计</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 p-3 rounded">
            <div className="text-sm text-gray-600">总调用</div>
            <div className="text-2xl font-bold text-blue-600">{todayStats.calls}</div>
          </div>
          <div className="bg-green-50 p-3 rounded">
            <div className="text-sm text-gray-600">成功</div>
            <div className="text-2xl font-bold text-green-600">{todayStats.success}</div>
          </div>
          <div className="bg-yellow-50 p-3 rounded">
            <div className="text-sm text-gray-600">缓存命中</div>
            <div className="text-2xl font-bold text-yellow-600">{todayStats.cached}</div>
          </div>
          <div className="bg-purple-50 p-3 rounded">
            <div className="text-sm text-gray-600">成本</div>
            <div className="text-2xl font-bold text-purple-600">
              ${todayStats.cost.toFixed(4)}
            </div>
          </div>
        </div>
      </div>
      
      {/* 近7天统计 */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">近7天统计</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">总调用</span>
            <span className="font-semibold">{weekStats.totalCalls}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">成功率</span>
            <span className="font-semibold text-green-600">
              {weekStats.successRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">缓存命中率</span>
            <span className="font-semibold text-yellow-600">
              {weekStats.cacheHitRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">平均耗时</span>
            <span className="font-semibold">
              {weekStats.avgDuration.toFixed(0)}ms
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">总成本</span>
            <span className="font-semibold text-purple-600">
              ${weekStats.totalCost.toFixed(4)}
            </span>
          </div>
          <button
            onClick={handleClearMonitor}
            className="text-sm text-red-500 hover:text-red-700"
          >
            清空监控数据
          </button>
        </div>
      </div>
    </div>
  );
};

