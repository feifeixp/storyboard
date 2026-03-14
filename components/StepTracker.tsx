import React from 'react';
import { AppStep } from '../types';

interface StepTrackerProps {
  currentStep: AppStep;
  branch?: 'image' | 'video'; // 🆕 增加流程分支
}

// 原生共用分支（在精修及之前显示）
const commonSteps = [
  "导入",
  "清洗",
  "精修",    // (AppStep.GENERATE_LIST, REVIEW_OPTIMIZE, MANUAL_EDIT)
  "分支选择：1-九宫格分镜 ｜ 2-Seedance视频"
];

// 原始九宫格生图分支（共6步）
const imageSteps = [
  "导入",
  "清洗",
  "精修",    // (AppStep.GENERATE_LIST, REVIEW_OPTIMIZE, MANUAL_EDIT)
  "提示词",
  "绘制",
  "故事板"
];

// 直接视频分支（共5步）
const videoSteps = [
  "导入",
  "清洗",
  "精修",    // (AppStep.GENERATE_LIST, REVIEW_OPTIMIZE, MANUAL_EDIT)
  "视频提示词",
  "最终预览"
];

// 映射当前 AppStep 到视频分支中的有效索引
function getVideoStepIndex(step: AppStep): number {
  if (step === AppStep.INPUT_SCRIPT) return 0;
  if (step === AppStep.SCRIPT_CLEANING) return 1;
  if (step === AppStep.GENERATE_LIST || step === AppStep.REVIEW_OPTIMIZE || step === AppStep.MANUAL_EDIT) return 2;
  if (step === AppStep.EXTRACT_VIDEO_PROMPTS) return 3;
  if (step === AppStep.FINAL_STORYBOARD) return 4;
  return 0; // fallback
}

// 映射当前 AppStep 到图片分支中的有效索引
function getImageStepIndex(step: AppStep): number {
  if (step === AppStep.INPUT_SCRIPT) return 0;
  if (step === AppStep.SCRIPT_CLEANING) return 1;
  if (step === AppStep.GENERATE_LIST || step === AppStep.REVIEW_OPTIMIZE || step === AppStep.MANUAL_EDIT) return 2;
  if (step === AppStep.EXTRACT_PROMPTS) return 3;
  if (step === AppStep.GENERATE_IMAGES) return 4;
  if (step === AppStep.FINAL_STORYBOARD) return 5;
  return 0; // fallback
}

export const StepTracker: React.FC<StepTrackerProps> = ({ currentStep, branch = 'image' }) => {
  const isVideo = branch === 'video';
  
  // 如果当前步骤还在精修及以前，显示公共分支选择提示；否则显示具体分支
  const steps = currentStep <= AppStep.MANUAL_EDIT 
    ? commonSteps 
    : (isVideo ? videoSteps : imageSteps);
  
  // 对于视频分支和图片分支都使用特定的映射函数，因为AppStep枚举索引和展示步骤索引不再是一一对应
  // 公共分支和具体分支的前3个索引 (0, 1, 2) 是一致的。
  const activeIndex = isVideo ? getVideoStepIndex(currentStep) : getImageStepIndex(currentStep);

  return (
    <div className="flex items-center justify-center gap-1 w-full max-w-[800px] mx-auto mb-3">
      {steps.map((label, index) => (
        <React.Fragment key={index}>
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
              index <= activeIndex ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500'
            }`}>
              {index + 1}
            </div>
            <span className={`text-xs font-medium ${
              index <= activeIndex ? 'text-gray-200' : 'text-gray-500'
            }`}>
              {label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={`w-8 h-px mx-1 ${
              index < activeIndex ? 'bg-blue-600' : 'bg-gray-700'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
