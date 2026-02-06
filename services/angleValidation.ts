/**
 * 角度分布验证服务
 * 
 * 用途：验证分镜脚本的角度分布是否符合规则
 * 规则依据：.augment/rules/角度规则优化总结.ini
 * 
 * 核心规则：
 * - 正面镜头占比 ≤7%（30个镜头最多2个）
 * - 平视镜头占比 10-15%（禁止连续2个以上）
 * - 默认选择：轻微仰拍/轻微俯拍（40-50%）
 * - 极端角度占比 ≥15%
 */

import { Shot } from '../types';
import { SHOT_RULES } from './constants';

export interface AngleDistributionReport {
  /** 总镜头数 */
  totalShots: number;
  
  /** 正面镜头统计 */
  frontView: {
    count: number;
    ratio: number;
    isValid: boolean;
    message: string;
  };
  
  /** 平视镜头统计 */
  eyeLevel: {
    count: number;
    ratio: number;
    isValid: boolean;
    message: string;
    consecutiveViolations: number[];  // 连续平视镜头的位置
  };
  
  /** 极端角度统计 */
  extremeAngles: {
    count: number;
    ratio: number;
    isValid: boolean;
    message: string;
  };
  
  /** 轻微角度统计（轻微仰拍/轻微俯拍） */
  mildAngles: {
    count: number;
    ratio: number;
    isValid: boolean;
    message: string;
  };
  
  /** 整体验证结果 */
  overall: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

/**
 * 验证角度分布
 */
export function validateAngleDistribution(shots: Shot[]): AngleDistributionReport {
  const totalShots = shots.length;
  
  // 统计正面镜头
  const frontViewShots = shots.filter(s => 
    s.angleDirection?.includes('正面(Front)') || 
    s.angleDirection?.includes('Front View')
  );
  const frontViewCount = frontViewShots.length;
  const frontViewRatio = totalShots > 0 ? frontViewCount / totalShots : 0;
  
  // 统计平视镜头
  const eyeLevelShots = shots.filter(s => 
    s.angleHeight?.includes('平视(Eye Level)') || 
    s.angleHeight?.includes('Eye Level')
  );
  const eyeLevelCount = eyeLevelShots.length;
  const eyeLevelRatio = totalShots > 0 ? eyeLevelCount / totalShots : 0;
  
  // 检查连续平视镜头
  const consecutiveEyeLevelViolations: number[] = [];
  let consecutiveCount = 0;
  shots.forEach((shot, index) => {
    const isEyeLevel = shot.angleHeight?.includes('平视(Eye Level)') || 
                       shot.angleHeight?.includes('Eye Level');
    if (isEyeLevel) {
      consecutiveCount++;
      if (consecutiveCount > SHOT_RULES.MAX_CONSECUTIVE_EYE_LEVEL) {
        consecutiveEyeLevelViolations.push(index + 1);  // 1-based index
      }
    } else {
      consecutiveCount = 0;
    }
  });
  
  // 统计极端角度（极端仰拍/极端俯拍/鸟瞰/虫视）
  const extremeAngleShots = shots.filter(s => 
    s.angleHeight?.includes('极端仰拍(Extreme Low)') ||
    s.angleHeight?.includes('极端俯拍(Extreme High)') ||
    s.angleHeight?.includes('鸟瞰(Bird') ||
    s.angleHeight?.includes('虫视(Worm') ||
    s.angleHeight?.includes('Extreme Low') ||
    s.angleHeight?.includes('Extreme High') ||
    s.angleHeight?.includes('Bird') ||
    s.angleHeight?.includes('Worm')
  );
  const extremeAngleCount = extremeAngleShots.length;
  const extremeAngleRatio = totalShots > 0 ? extremeAngleCount / totalShots : 0;
  
  // 统计轻微角度（轻微仰拍/轻微俯拍）
  const mildAngleShots = shots.filter(s => 
    s.angleHeight?.includes('轻微仰拍(Mild Low)') ||
    s.angleHeight?.includes('轻微俯拍(Mild High)') ||
    s.angleHeight?.includes('Mild Low') ||
    s.angleHeight?.includes('Mild High')
  );
  const mildAngleCount = mildAngleShots.length;
  const mildAngleRatio = totalShots > 0 ? mildAngleCount / totalShots : 0;
  
  // 验证结果
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 验证正面镜头
  const frontViewValid = frontViewCount <= SHOT_RULES.MAX_FRONT_VIEW_SHOTS;
  const frontViewMessage = frontViewValid
    ? `✅ 正面镜头占比符合规则：${frontViewCount}个（${(frontViewRatio * 100).toFixed(1)}%）`
    : `❌ 正面镜头超标：${frontViewCount}个（${(frontViewRatio * 100).toFixed(1)}%），最多${SHOT_RULES.MAX_FRONT_VIEW_SHOTS}个（≤7%）`;
  
  if (!frontViewValid) {
    errors.push(frontViewMessage);
  }
  
  // 验证平视镜头
  const eyeLevelValid = eyeLevelRatio <= SHOT_RULES.MAX_EYE_LEVEL_RATIO && 
                        consecutiveEyeLevelViolations.length === 0;
  let eyeLevelMessage = '';
  if (eyeLevelRatio > SHOT_RULES.MAX_EYE_LEVEL_RATIO) {
    eyeLevelMessage = `❌ 平视镜头超标：${eyeLevelCount}个（${(eyeLevelRatio * 100).toFixed(1)}%），应控制在10-15%`;
    errors.push(eyeLevelMessage);
  } else if (consecutiveEyeLevelViolations.length > 0) {
    eyeLevelMessage = `⚠️ 存在连续平视镜头：镜头 #${consecutiveEyeLevelViolations.join(', #')}，禁止连续2个以上`;
    warnings.push(eyeLevelMessage);
  } else {
    eyeLevelMessage = `✅ 平视镜头占比符合规则：${eyeLevelCount}个（${(eyeLevelRatio * 100).toFixed(1)}%）`;
  }
  
  // 验证极端角度
  const extremeAngleValid = extremeAngleRatio >= SHOT_RULES.MIN_EXTREME_ANGLE_RATIO;
  const extremeAngleMessage = extremeAngleValid
    ? `✅ 极端角度占比符合规则：${extremeAngleCount}个（${(extremeAngleRatio * 100).toFixed(1)}%）`
    : `⚠️ 极端角度不足：${extremeAngleCount}个（${(extremeAngleRatio * 100).toFixed(1)}%），建议≥15%`;
  
  if (!extremeAngleValid) {
    warnings.push(extremeAngleMessage);
  }
  
  // 验证轻微角度（应该是默认选择，占比40-50%）
  const mildAngleValid = mildAngleRatio >= 0.4 && mildAngleRatio <= 0.5;
  const mildAngleMessage = mildAngleValid
    ? `✅ 轻微角度占比符合规则：${mildAngleCount}个（${(mildAngleRatio * 100).toFixed(1)}%）`
    : `⚠️ 轻微角度占比偏离：${mildAngleCount}个（${(mildAngleRatio * 100).toFixed(1)}%），建议40-50%`;
  
  if (!mildAngleValid) {
    warnings.push(mildAngleMessage);
  }
  
  return {
    totalShots,
    frontView: {
      count: frontViewCount,
      ratio: frontViewRatio,
      isValid: frontViewValid,
      message: frontViewMessage,
    },
    eyeLevel: {
      count: eyeLevelCount,
      ratio: eyeLevelRatio,
      isValid: eyeLevelValid,
      message: eyeLevelMessage,
      consecutiveViolations: consecutiveEyeLevelViolations,
    },
    extremeAngles: {
      count: extremeAngleCount,
      ratio: extremeAngleRatio,
      isValid: extremeAngleValid,
      message: extremeAngleMessage,
    },
    mildAngles: {
      count: mildAngleCount,
      ratio: mildAngleRatio,
      isValid: mildAngleValid,
      message: mildAngleMessage,
    },
    overall: {
      isValid: frontViewValid && eyeLevelValid && extremeAngleValid && mildAngleValid,
      errors,
      warnings,
    },
  };
}

/**
 * 生成角度分布报告（用于控制台输出）
 */
export function generateAngleDistributionReport(shots: Shot[]): string {
  const report = validateAngleDistribution(shots);
  
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '                    角度分布验证报告',
    '═══════════════════════════════════════════════════════════════',
    `总镜头数：${report.totalShots}`,
    '',
    report.frontView.message,
    report.eyeLevel.message,
    report.extremeAngles.message,
    report.mildAngles.message,
    '',
  ];
  
  if (report.overall.errors.length > 0) {
    lines.push('❌ 错误：');
    report.overall.errors.forEach(err => lines.push(`  - ${err}`));
    lines.push('');
  }
  
  if (report.overall.warnings.length > 0) {
    lines.push('⚠️ 警告：');
    report.overall.warnings.forEach(warn => lines.push(`  - ${warn}`));
    lines.push('');
  }
  
  if (report.overall.isValid) {
    lines.push('✅ 角度分布完全符合规则！');
  } else {
    lines.push('❌ 角度分布存在问题，请调整！');
  }
  
  lines.push('═══════════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

