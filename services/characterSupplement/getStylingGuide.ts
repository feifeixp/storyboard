/**
 * 动态加载服装搭配指南
 */

import stylingGuideData from './styling-guide.json';
import type { StylingGuide } from './styling-guide.types';

const data = stylingGuideData as StylingGuide;

/**
 * 获取人物比例指南
 */
export function getProportionGuideline(): string {
  const guideline = data.人物比例原则;
  
  let result = '# 人物比例原则\n\n';
  result += '**核心原则**：不是所有角色都应该是8头身！人物比例应该根据年龄、美学风格、社会阶层、剧本类型综合判断。\n\n';
  
  if (guideline.年龄段) {
    result += '## 按年龄分类\n';
    guideline.年龄段.forEach(item => {
      result += `- **${item.范围}**：${item.比例} - ${item.说明}\n`;
    });
    result += '\n';
  }
  
  if (guideline.美学风格) {
    result += '## 按美学风格分类\n';
    guideline.美学风格.forEach(item => {
      result += `- **${item.风格}**：${item.比例} - ${item.说明}\n`;
    });
    result += '\n';
  }
  
  if (guideline.社会阶层) {
    result += '## 按社会阶层分类\n';
    guideline.社会阶层.forEach(item => {
      result += `- **${item.阶层}**：${item.比例} - ${item.说明}\n`;
    });
    result += '\n';
  }
  
  if (guideline.剧本类型) {
    result += '## 按剧本类型分类\n';
    guideline.剧本类型.forEach(item => {
      result += `- **${item.类型}**：${item.比例} - ${item.说明}\n`;
    });
    result += '\n';
  }
  
  return result;
}

/**
 * 获取色彩搭配理论
 */
export function getColorTheory(): string {
  const theories = data.色彩搭配理论;
  
  let result = '# 色彩搭配理论\n\n';
  
  theories.forEach(theory => {
    result += `## ${theory.类型}\n`;
    result += `**定义**：${theory.定义}\n\n`;
    
    if (theory.示例) {
      result += `**示例**：${theory.示例.join('、')}\n\n`;
    }
    
    if (theory.优点) {
      result += `**优点**：${theory.优点.join('、')}\n\n`;
    }
    
    if (theory.注意) {
      result += `**注意**：${theory.注意.join('、')}\n\n`;
    }
    
    result += `**适用场景**：${theory.适用场景.join('、')}\n\n`;
    result += '---\n\n';
  });
  
  return result;
}

/**
 * 获取季节穿搭指南
 */
export function getSeasonGuideline(season?: string): string {
  const seasons = data.季节穿搭原则;
  
  if (season && seasons[season as keyof typeof seasons]) {
    const guideline = seasons[season as keyof typeof seasons];
    let result = `# ${season}穿搭原则\n\n`;
    result += `**特点**：${guideline.特点.join('、')}\n\n`;
    result += `**推荐款式**：${guideline.推荐款式.join('、')}\n\n`;
    result += `**颜色**：${guideline.颜色.join('、')}\n\n`;
    
    if (guideline.注意) {
      result += `**注意**：${guideline.注意.join('、')}\n\n`;
    }
    
    return result;
  }
  
  // 返回所有季节
  let result = '# 季节穿搭原则\n\n';
  Object.entries(seasons).forEach(([seasonName, guideline]) => {
    result += `## ${seasonName}\n`;
    result += `**特点**：${guideline.特点.join('、')}\n\n`;
    result += `**推荐款式**：${guideline.推荐款式.join('、')}\n\n`;
    result += `**颜色**：${guideline.颜色.join('、')}\n\n`;
    
    if (guideline.注意) {
      result += `**注意**：${guideline.注意.join('、')}\n\n`;
    }
    
    result += '---\n\n';
  });
  
  return result;
}

/**
 * 获取角色身份适配指南
 */
export function getIdentityGuideline(socialClass?: string): string {
  const identities = data.角色身份适配原则;
  
  if (socialClass && identities[socialClass as keyof typeof identities]) {
    const guideline = identities[socialClass as keyof typeof identities];
    let result = `# ${socialClass}穿搭指南\n\n`;
    result += `**服装特点**：${guideline.服装特点.join('、')}\n\n`;
    result += `**示例**：${guideline.示例.join('、')}\n\n`;
    result += `**注意**：${guideline.注意.join('、')}\n\n`;
    return result;
  }
  
  // 返回所有身份
  let result = '# 角色身份适配原则\n\n';
  Object.entries(identities).forEach(([className, guideline]) => {
    result += `## ${className}\n`;
    result += `**服装特点**：${guideline.服装特点.join('、')}\n\n`;
    result += `**示例**：${guideline.示例.join('、')}\n\n`;
    result += `**注意**：${guideline.注意.join('、')}\n\n`;
    result += '---\n\n';
  });
  
  return result;
}

/**
 * 获取影视化设计原则
 */
export function getFilmPrinciples(): string {
  const principles = data.影视化设计原则;
  
  let result = '# 影视化设计原则\n\n';
  
  principles.forEach((principle, index) => {
    result += `## 原则${index + 1}\n`;
    result += `**原因**：${principle.原因}\n\n`;
    
    if (principle.替代方案) {
      result += `**替代方案**：${principle.替代方案.join('、')}\n\n`;
    }
    
    if (principle.推荐面料) {
      result += `**推荐面料**：${principle.推荐面料.join('、')}\n\n`;
    }
    
    if (principle.避免面料) {
      result += `**避免面料**：${principle.避免面料.join('、')}\n\n`;
    }
    
    result += '---\n\n';
  });
  
  return result;
}

/**
 * 获取完整的搭配指南（用于Stage2/3/4）
 */
export function getStylingGuide(options?: {
  includeProportion?: boolean;
  includeColor?: boolean;
  includeSeason?: boolean;
  includeIdentity?: boolean;
  includeFilm?: boolean;
  season?: string;
  socialClass?: string;
}): string {
  const {
    includeProportion = true,
    includeColor = true,
    includeSeason = false,
    includeIdentity = false,
    includeFilm = true,
    season,
    socialClass
  } = options || {};
  
  let result = '';
  
  if (includeProportion) {
    result += getProportionGuideline() + '\n';
  }
  
  if (includeColor) {
    result += getColorTheory() + '\n';
  }
  
  if (includeSeason) {
    result += getSeasonGuideline(season) + '\n';
  }
  
  if (includeIdentity) {
    result += getIdentityGuideline(socialClass) + '\n';
  }
  
  if (includeFilm) {
    result += getFilmPrinciples() + '\n';
  }
  
  return result;
}

