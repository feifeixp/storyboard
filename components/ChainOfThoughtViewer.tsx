/**
 * 思维链可视化组件
 * 展示AI的推理过程
 */

import React, { useState } from 'react';
import type { ScriptAnalysis } from '../prompts/chain-of-thought/types';

interface Props {
  analysis: ScriptAnalysis | null;
  rawOutput?: string;
}

export const ChainOfThoughtViewer: React.FC<Props> = ({ analysis, rawOutput }) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(['step1_1']));

  if (!analysis) {
    return (
      <div className="cot-viewer empty">
        <p>暂无分析结果</p>
      </div>
    );
  }

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const steps = [
    {
      id: 'step1_1',
      title: 'Step 1.1: 提取关键信息',
      thinking: analysis.thinking?.step1_1,
      result: analysis.basicInfo
    },
    {
      id: 'step1_2',
      title: 'Step 1.2: 识别情绪转折点',
      thinking: analysis.thinking?.step1_2,
      result: { emotionArc: analysis.emotionArc, climax: analysis.climax }
    },
    {
      id: 'step1_3',
      title: 'Step 1.3: 确定核心冲突',
      thinking: analysis.thinking?.step1_3,
      result: analysis.conflict
    },
    {
      id: 'step1_4',
      title: 'Step 1.4: 划分场景段落',
      thinking: analysis.thinking?.step1_4,
      result: analysis.scenes
    }
  ];

  return (
    <div className="cot-viewer">
      <div className="cot-header">
        <h2>🧠 AI 推理过程</h2>
        <p className="subtitle">思维链模式 - 可追溯每一步决策</p>
      </div>

      <div className="cot-steps">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`cot-step ${expandedSteps.has(step.id) ? 'expanded' : 'collapsed'}`}
          >
            <div className="step-header" onClick={() => toggleStep(step.id)}>
              <div className="step-number">{index + 1}</div>
              <h3>{step.title}</h3>
              <button className="toggle-btn">
                {expandedSteps.has(step.id) ? '▼' : '▶'}
              </button>
            </div>

            {expandedSteps.has(step.id) && (
              <div className="step-content">
                {step.thinking && (
                  <div className="thinking-process">
                    <h4>💭 思考过程：</h4>
                    <div className="thinking-text">
                      {step.thinking.split('\n').map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="step-result">
                  <h4>📊 输出结果：</h4>
                  <pre className="result-json">
                    {JSON.stringify(step.result, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {rawOutput && (
        <details className="raw-output">
          <summary>查看原始输出</summary>
          <pre>{rawOutput}</pre>
        </details>
      )}

      <style>{`
        .cot-viewer {
          background: #1f2937;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }

        .cot-header {
          margin-bottom: 24px;
        }

        .cot-header h2 {
          margin: 0 0 8px 0;
          color: #f3f4f6;
        }

        .cot-header .subtitle {
          margin: 0;
          color: #9ca3af;
          font-size: 14px;
        }

        .cot-steps {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .cot-step {
          background: #374151;
          border-radius: 8px;
          border: 2px solid #4b5563;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .cot-step.expanded {
          border-color: #22c55e;
        }

        .step-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          cursor: pointer;
          user-select: none;
          background: #374151;
          transition: background 0.2s;
        }

        .step-header:hover {
          background: #4b5563;
        }

        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #22c55e;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          flex-shrink: 0;
        }

        .step-header h3 {
          margin: 0;
          flex: 1;
          font-size: 16px;
          color: #f3f4f6;
        }

        .toggle-btn {
          background: none;
          border: none;
          font-size: 18px;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px 8px;
        }

        .step-content {
          padding: 0 16px 16px 60px;
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .thinking-process {
          margin-bottom: 16px;
        }

        .thinking-process h4 {
          margin: 0 0 8px 0;
          color: #9ca3af;
          font-size: 14px;
        }

        .thinking-text {
          background: #422006;
          border-left: 4px solid #f59e0b;
          padding: 12px;
          border-radius: 4px;
        }

        .thinking-text p {
          margin: 4px 0;
          color: #fef3c7;
          line-height: 1.6;
        }

        .step-result h4 {
          margin: 0 0 8px 0;
          color: #9ca3af;
          font-size: 14px;
        }

        .result-json {
          background: #111827;
          border: 1px solid #4b5563;
          border-radius: 4px;
          padding: 12px;
          overflow-x: auto;
          font-size: 13px;
          line-height: 1.5;
          color: #d1d5db;
        }

        .raw-output {
          margin-top: 24px;
          padding: 16px;
          background: #374151;
          border-radius: 8px;
          border: 1px solid #4b5563;
        }

        .raw-output summary {
          cursor: pointer;
          color: #9ca3af;
          font-size: 14px;
          user-select: none;
        }

        .raw-output pre {
          margin-top: 12px;
          background: #111827;
          padding: 12px;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 12px;
          line-height: 1.4;
          color: #d1d5db;
        }

        .cot-viewer.empty {
          text-align: center;
          padding: 40px;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
};

