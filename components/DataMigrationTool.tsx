/**
 * 数据迁移工具组件
 * 用于将 localStorage 数据迁移到 Cloudflare D1
 */

import React, { useState } from 'react';
import { migrateFromLocalStorage, exportProjectToFile, importProjectFromFile } from '../services/d1Storage';

export function DataMigrationTool() {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    migratedProjects: number;
    errors: string[];
  } | null>(null);

  const handleMigrate = async () => {
    if (!confirm('确定要将本地数据迁移到云端数据库吗？\n\n迁移后，数据将存储在 Cloudflare D1 数据库中，支持多设备同步。')) {
      return;
    }

    setIsMigrating(true);
    setMigrationResult(null);

    try {
      const result = await migrateFromLocalStorage();
      setMigrationResult(result);

      if (result.success) {
        alert(`✅ 迁移成功！\n\n已迁移 ${result.migratedProjects} 个项目到云端数据库。`);
      } else {
        alert(`⚠️ 迁移部分失败\n\n成功迁移：${result.migratedProjects} 个项目\n失败原因：\n${result.errors.join('\n')}`);
      }
    } catch (error) {
      alert(`❌ 迁移失败：${error}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const project = await importProjectFromFile(file);
      alert(`✅ 导入成功！\n\n项目 "${project.name}" 已导入到云端数据库。`);
      window.location.reload();
    } catch (error) {
      alert(`❌ 导入失败：${error}`);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
      <h2 className="text-xl font-bold text-white mb-4">🔄 数据迁移工具</h2>

      <div className="space-y-4">
        {/* 迁移到云端 */}
        <div className="bg-gray-900 p-4 rounded-lg">
          <h3 className="text-sm font-bold text-green-400 mb-2">📤 迁移到云端数据库</h3>
          <p className="text-xs text-gray-400 mb-3">
            将浏览器本地存储（localStorage）中的所有项目数据迁移到 Cloudflare D1 云端数据库。
            迁移后支持多设备同步和协作。
          </p>
          <button
            onClick={handleMigrate}
            disabled={isMigrating}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
              isMigrating
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-500'
            }`}
          >
            {isMigrating ? '🔄 迁移中...' : '📤 开始迁移'}
          </button>

          {migrationResult && (
            <div className={`mt-3 p-3 rounded-md text-xs ${
              migrationResult.success
                ? 'bg-green-900/30 border border-green-700 text-green-300'
                : 'bg-yellow-900/30 border border-yellow-700 text-yellow-300'
            }`}>
              <div className="font-bold mb-1">
                {migrationResult.success ? '✅ 迁移成功' : '⚠️ 迁移部分失败'}
              </div>
              <div>已迁移：{migrationResult.migratedProjects} 个项目</div>
              {migrationResult.errors.length > 0 && (
                <div className="mt-2">
                  <div className="font-bold">错误信息：</div>
                  {migrationResult.errors.map((err, i) => (
                    <div key={i} className="text-red-400">• {err}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 导入项目 */}
        <div className="bg-gray-900 p-4 rounded-lg">
          <h3 className="text-sm font-bold text-blue-400 mb-2">📥 导入项目</h3>
          <p className="text-xs text-gray-400 mb-3">
            从本地 JSON 文件导入项目到云端数据库。
          </p>
          <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md font-medium text-sm hover:bg-blue-500 cursor-pointer transition-all">
            📥 选择文件导入
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </div>

        {/* 说明 */}
        <div className="bg-blue-900/20 border border-blue-700 p-4 rounded-lg">
          <h3 className="text-sm font-bold text-blue-400 mb-2">ℹ️ 迁移说明</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• 迁移后，数据将存储在 Cloudflare D1 云端数据库</li>
            <li>• 支持多设备同步，随时随地访问你的项目</li>
            <li>• 原有的 localStorage 数据不会被删除，可作为备份</li>
            <li>• 建议迁移前先导出项目备份到本地文件</li>
            <li>• 迁移过程中请勿关闭浏览器</li>
          </ul>
        </div>

        {/* 注意事项 */}
        <div className="bg-yellow-900/20 border border-yellow-700 p-4 rounded-lg">
          <h3 className="text-sm font-bold text-yellow-400 mb-2">⚠️ 注意事项</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• 迁移前请确保已部署 Cloudflare Workers API</li>
            <li>• 迁移前请确保已登录账号</li>
            <li>• 大型项目迁移可能需要几分钟时间</li>
            <li>• 如果迁移失败，请检查网络连接和 API 配置</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

