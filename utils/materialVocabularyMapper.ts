/**
 * 材质词汇映射工具
 * 用于将外观描述中的英文材质词替换为中文（仅用于UI展示）
 */

import materialVocabulary from '../services/characterSupplement/materialVocabulary.json';

// 构建 en -> zh 映射表
const enToZhMap = new Map<string, string>();

// 从 materialVocabulary.json 提取所有 en -> zh 映射
function buildMapping() {
  const { categories } = materialVocabulary;
  
  // fabricTypes
  if (categories.fabricTypes) {
    ['naturalFibers', 'specialFabrics', 'modernMaterials'].forEach(key => {
      const items = (categories.fabricTypes as any)[key];
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          if (item.en && item.zh) {
            enToZhMap.set(item.en.toLowerCase(), item.zh);
          }
        });
      }
    });
  }
  
  // structure
  if (categories.structure) {
    ['weaveTypes', 'thickness', 'transparency'].forEach(key => {
      const items = (categories.structure as any)[key];
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          if (item.en && item.zh) {
            enToZhMap.set(item.en.toLowerCase(), item.zh);
          }
        });
      }
    });
  }
  
  // sheen
  if (categories.sheen) {
    ['sheenTypes', 'lightEffects'].forEach(key => {
      const items = (categories.sheen as any)[key];
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          if (item.en && item.zh) {
            enToZhMap.set(item.en.toLowerCase(), item.zh);
          }
        });
      }
    });
  }
  
  // texture
  if (categories.texture) {
    ['surfaceTexture', 'specialTexture'].forEach(key => {
      const items = (categories.texture as any)[key];
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          if (item.en && item.zh) {
            enToZhMap.set(item.en.toLowerCase(), item.zh);
          }
        });
      }
    });
  }
  
  // craftsmanship
  if (categories.craftsmanship) {
    ['embroidery', 'decorativeDetails', 'dyeingTechniques'].forEach(key => {
      const items = (categories.craftsmanship as any)[key];
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          if (item.en && item.zh) {
            enToZhMap.set(item.en.toLowerCase(), item.zh);
          }
        });
      }
    });
  }
}

// 初始化映射表
buildMapping();

/**
 * 将文本中的英文材质词替换为中文（仅用于UI展示）
 * @param text 原始文本
 * @returns 替换后的文本
 */
export function replaceEnglishMaterialTerms(text: string): string {
  if (!text) return text;
  
  let result = text;
  
  // 1. 替换已知的材质词（从映射表）
  enToZhMap.forEach((zh, en) => {
    // 使用单词边界匹配，避免误替换（例如 "soft" 不应该替换 "software" 中的 "soft"）
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    result = result.replace(regex, zh);
  });
  
  // 2. 移除残留的纯英文单词（A-Z连续串，但保留常见缩写如 "T恤"）
  // 保留列表：常见的中英混合词
  const preserveList = ['T恤', 'V领', 'U领', 'A字裙', 'H型', 'X型', 'O型'];
  const shouldPreserve = (word: string) => {
    return preserveList.some(p => word.includes(p.charAt(0)));
  };
  
  // 移除孤立的英文单词（长度>=2，避免误删单字母）
  result = result.replace(/\b[A-Za-z]{2,}\b/g, (match) => {
    // 如果是保留词的一部分，不删除
    if (shouldPreserve(match)) return match;
    // 否则删除
    return '';
  });
  
  // 3. 清理多余的标点符号（连续的逗号、句号等）
  result = result.replace(/[，。；、]{2,}/g, '，');
  result = result.replace(/\s{2,}/g, ' ');
  result = result.trim();
  
  return result;
}

