import React from 'react';
import { AppStep } from '../types';

interface StepTrackerProps {
  currentStep: AppStep;
}

const steps = [
  "导入",
  "清洗",    // 🆕 剧本清洗
  "生成",
  "自检",
  "精修",
  "提示词",
  "绘制"
];

export const StepTracker: React.FC<StepTrackerProps> = ({ currentStep }) => {
  return (
    <div className="flex items-center justify-center gap-1 w-full max-w-xl mx-auto mb-3">
      {steps.map((label, index) => (
        <React.Fragment key={index}>
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
              index <= currentStep ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500'
            }`}>
              {index + 1}
            </div>
            <span className={`text-xs font-medium ${
              index <= currentStep ? 'text-gray-200' : 'text-gray-500'
            }`}>
              {label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={`w-8 h-px mx-1 ${
              index < currentStep ? 'bg-blue-600' : 'bg-gray-700'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
