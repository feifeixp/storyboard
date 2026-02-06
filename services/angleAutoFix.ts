/**
 * 角度自动修复服务
 * 
 * 功能：自动修复违反角度规则的分镜脚本
 * 依据：.augment/rules/角度规则优化总结.ini
 */

import type { Shot } from '../types';
import { validateAngleDistribution, type AngleDistributionReport } from './angleValidation';

/**
 * 自动修复角度分布问题
 * 
 * @param shots 原始镜头列表
 * @returns 修复后的镜头列表和修复报告
 */
export function autoFixAngleDistribution(shots: Shot[]): {
  fixedShots: Shot[];
  report: AngleDistributionReport;
  fixes: string[];
} {
  const fixes: string[] = [];
  let fixedShots = [...shots];

  // 第一步：修复正面镜头超标
  const frontViewShots = fixedShots.filter(s =>
    s.angleDirection?.includes('正面(Front)') ||
    s.angleDirection === '正面'
  );

  if (frontViewShots.length > 2) {
    fixes.push(`🔧 正面镜头超标：${frontViewShots.length}个 → 修复为2个`);

    // 保留前2个，其余改为3/4正面
    const shotsToFix = frontViewShots.slice(2);
    for (const shot of shotsToFix) {
      const index = fixedShots.findIndex(s => s.id === shot.id);
      if (index !== -1) {
        fixedShots[index] = {
          ...fixedShots[index],
          angleDirection: '3/4正面(3/4 Front)'
        };
        fixes.push(`  - 镜头 #${shot.shotNumber}: 正面(Front) → 3/4正面(3/4 Front)`);
      }
    }
  }

  // 第二步：修复平视镜头占比
  const eyeLevelShots = fixedShots.filter(s =>
    s.angleHeight?.includes('平视(Eye Level)') ||
    s.angleHeight === '平视'
  );
  const eyeLevelRatio = eyeLevelShots.length / fixedShots.length;

  if (eyeLevelRatio < 0.10) {
    // 平视镜头不足，将部分轻微仰拍改为平视
    const targetCount = Math.ceil(fixedShots.length * 0.12); // 目标12%
    const needToAdd = targetCount - eyeLevelShots.length;

    fixes.push(`🔧 平视镜头不足：${eyeLevelShots.length}个（${(eyeLevelRatio * 100).toFixed(1)}%） → 增加到${targetCount}个`);

    const mildLowShots = fixedShots.filter(s =>
      s.angleHeight?.includes('轻微仰拍(Mild Low)')
    );

    for (let i = 0; i < Math.min(needToAdd, mildLowShots.length); i++) {
      const shot = mildLowShots[i];
      const index = fixedShots.findIndex(s => s.id === shot.id);
      if (index !== -1) {
        fixedShots[index] = {
          ...fixedShots[index],
          angleHeight: '平视(Eye Level)'
        };
        fixes.push(`  - 镜头 #${shot.shotNumber}: 轻微仰拍(Mild Low) → 平视(Eye Level)`);
      }
    }
  } else if (eyeLevelRatio > 0.15) {
    // 平视镜头过多，将多余的改为轻微仰拍
    const targetCount = Math.floor(fixedShots.length * 0.13); // 目标13%
    const needToRemove = eyeLevelShots.length - targetCount;

    fixes.push(`🔧 平视镜头过多：${eyeLevelShots.length}个（${(eyeLevelRatio * 100).toFixed(1)}%） → 减少到${targetCount}个`);

    const shotsToFix = eyeLevelShots.slice(targetCount);
    for (let i = 0; i < Math.min(needToRemove, shotsToFix.length); i++) {
      const shot = shotsToFix[i];
      const index = fixedShots.findIndex(s => s.id === shot.id);
      if (index !== -1) {
        fixedShots[index] = {
          ...fixedShots[index],
          angleHeight: '轻微仰拍(Mild Low)'
        };
        fixes.push(`  - 镜头 #${shot.shotNumber}: 平视(Eye Level) → 轻微仰拍(Mild Low)`);
      }
    }
  }

  // 第三步：修复极端角度占比不足
  const extremeAngleShots = fixedShots.filter(s =>
    s.angleHeight?.includes('极端俯拍(Extreme High)') ||
    s.angleHeight?.includes('极端仰拍(Extreme Low)') ||
    s.angleHeight?.includes('鸟瞰(Bird Eye)') ||
    s.angleHeight?.includes('虫视(Worm Eye)') ||
    s.dutchAngle
  );
  const extremeAngleRatio = extremeAngleShots.length / fixedShots.length;

  if (extremeAngleRatio < 0.15) {
    // 极端角度不足，将部分中度角度升级为极端角度
    const targetCount = Math.ceil(fixedShots.length * 0.16); // 目标16%
    const needToAdd = targetCount - extremeAngleShots.length;

    fixes.push(`🔧 极端角度不足：${extremeAngleShots.length}个（${(extremeAngleRatio * 100).toFixed(1)}%） → 增加到${targetCount}个`);

    const moderateHighShots = fixedShots.filter(s =>
      s.angleHeight?.includes('中度俯拍(Moderate High)')
    );
    const moderateLowShots = fixedShots.filter(s =>
      s.angleHeight?.includes('中度仰拍(Moderate Low)')
    );

    const shotsToUpgrade = [...moderateHighShots, ...moderateLowShots].slice(0, needToAdd);

    for (const shot of shotsToUpgrade) {
      const index = fixedShots.findIndex(s => s.id === shot.id);
      if (index !== -1) {
        const newHeight = shot.angleHeight?.includes('俯拍')
          ? '极端俯拍(Extreme High)'
          : '极端仰拍(Extreme Low)';

        fixedShots[index] = {
          ...fixedShots[index],
          angleHeight: newHeight
        };
        fixes.push(`  - 镜头 #${shot.shotNumber}: ${shot.angleHeight} → ${newHeight}`);
      }
    }
  }

  // 生成修复后的验证报告
  const report = validateAngleDistribution(fixedShots);

  return { fixedShots, report, fixes };
}

