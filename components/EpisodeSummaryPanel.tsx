/**
 * 本集概述板块组件
 * 显示从思维链结果生成的本集概述
 */

import React, { useState } from 'react';
import type { GeneratedEpisodeSummary } from '../types/project';

interface EpisodeSummaryPanelProps {
  summary: GeneratedEpisodeSummary;
}

export const EpisodeSummaryPanel: React.FC<EpisodeSummaryPanelProps> = ({ summary }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="episode-summary-panel">
      {/* 标题栏 - 紧凑型深色设计 */}
      <div className="summary-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="summary-title">
          <span className="icon">📊</span>
          <span className="text">第{summary.episodeNumber}集概述</span>
          <span className="separator">|</span>
          <span className="highlight">总时长: {summary.totalDuration}</span>
          <span className="separator">|</span>
          <span className="highlight">总镜头数: {summary.totalShots}个</span>
        </div>
        <button className="collapse-btn">
          {isCollapsed ? '▼ 展开' : '▲ 折叠'}
        </button>
      </div>

      {/* 内容区 - 紧凑型单行布局 */}
      {!isCollapsed && (
        <div className="summary-content">
          {/* 故事梗概 */}
          <div className="summary-row">
            <span className="row-label">📖 故事梗概:</span>
            <span className="row-content">{summary.storySummary}</span>
          </div>

          {/* 涉及场景 */}
          {summary.scenes.length > 0 && (
            <div className="summary-row">
              <span className="row-label">📍 涉及场景:</span>
              <span className="row-content">
                {summary.scenes.map((scene, index) => (
                  <span key={index} className="scene-tag">
                    {scene.name}·{scene.description}
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* 情绪曲线 */}
          <div className="summary-row">
            <span className="row-label">🎭 情绪曲线:</span>
            <span className="row-content">{summary.emotionCurve}</span>
          </div>

          {/* 视觉风格 */}
          <div className="summary-row">
            <span className="row-label">🎨 视觉风格:</span>
            <span className="row-content">{summary.visualStyle}</span>
          </div>
        </div>
      )}

      <style>{`
        .episode-summary-panel {
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 8px;
          overflow: hidden;
        }

        .summary-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: #111827;
          border-bottom: 1px solid #374151;
          cursor: pointer;
          user-select: none;
          transition: background 0.2s;
        }

        .summary-header:hover {
          background: #1f2937;
        }

        .summary-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 600;
          color: #e5e7eb;
        }

        .summary-title .icon {
          font-size: 16px;
        }

        .summary-title .text {
          color: #60a5fa;
          font-weight: 700;
        }

        .summary-title .separator {
          color: #4b5563;
          font-weight: 400;
        }

        .summary-title .highlight {
          color: #fbbf24;
          font-weight: 700;
          font-size: 15px;
        }

        .collapse-btn {
          padding: 4px 10px;
          background: #374151;
          border: none;
          border-radius: 4px;
          font-size: 11px;
          color: #9ca3af;
          cursor: pointer;
          transition: all 0.2s;
        }

        .collapse-btn:hover {
          background: #4b5563;
          color: #e5e7eb;
        }

        .summary-content {
          padding: 12px 16px;
          background: #1f2937;
        }

        .summary-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 12px;
          line-height: 1.5;
        }

        .summary-row:last-child {
          margin-bottom: 0;
        }

        .row-label {
          flex-shrink: 0;
          color: #9ca3af;
          font-weight: 600;
          min-width: 80px;
        }

        .row-content {
          flex: 1;
          color: #d1d5db;
          line-height: 1.6;
        }

        .scene-tag {
          display: inline-block;
          margin-right: 8px;
          padding: 2px 6px;
          background: #374151;
          border-radius: 4px;
          color: #60a5fa;
          font-size: 11px;
        }

        .scene-tag:last-child {
          margin-right: 0;
        }
      `}</style>
    </div>
  );
};

