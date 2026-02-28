/**
 * 角色历史记录管理器
 * 用于存储最近生成的角色，帮助LLM避免重复设计
 */

export interface CharacterHistoryRecord {
  characterName: string;
  era: string;
  faceShape: string;        // 脸型
  hairStyle: string;        // 发型描述
  hairColor: string;        // 发色
  topClothing: string;      // 上装款式
  topColor: string;         // 上装颜色
  bottomClothing: string;   // 下装款式
  bottomColor: string;      // 下装颜色
  lipColor: string;         // 唇色
  timestamp: number;        // 生成时间
}

const STORAGE_KEY = 'character_design_history';
const MAX_HISTORY_SIZE = 5;  // 最多保存5个历史记录

/**
 * 获取历史记录
 */
export function getCharacterHistory(): CharacterHistoryRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const history = JSON.parse(stored) as CharacterHistoryRecord[];
    
    // 按时间倒序排列（最新的在前）
    return history.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('[历史记录] 读取失败:', error);
    return [];
  }
}

/**
 * 添加历史记录
 */
export function addCharacterHistory(record: CharacterHistoryRecord): void {
  try {
    let history = getCharacterHistory();
    
    // 添加新记录
    history.unshift(record);
    
    // 限制数量
    if (history.length > MAX_HISTORY_SIZE) {
      history = history.slice(0, MAX_HISTORY_SIZE);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    console.log('[历史记录] 已保存:', record.characterName);
  } catch (error) {
    console.error('[历史记录] 保存失败:', error);
  }
}

/**
 * 清空历史记录
 */
export function clearCharacterHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[历史记录] 已清空');
  } catch (error) {
    console.error('[历史记录] 清空失败:', error);
  }
}

/**
 * 格式化历史记录为prompt文本
 * 用于在Stage3/Stage4中引导LLM避免重复
 */
export function formatHistoryForPrompt(history: CharacterHistoryRecord[], maxCount: number = 3): string {
  if (history.length === 0) {
    return '';
  }
  
  const recentHistory = history.slice(0, maxCount);
  
  const historyText = recentHistory.map((record, index) => {
    return `${index + 1}. ${record.characterName}（${record.era}）：${record.faceShape} + ${record.hairColor}${record.hairStyle} + ${record.topColor}${record.topClothing} + ${record.bottomColor}${record.bottomClothing} + ${record.lipColor}`;
  }).join('\n   ');
  
  return `
📋 **最近生成的角色**（供参考，帮助你设计出更有区别的新角色）：
   ${historyText}

💡 **多样性思考**：
   - 思考：如何设计出与以上角色有明显区别的新角色？
   - 思考：在脸型、发型、服装款式、颜色搭配等方面，如何做到与众不同？
   - 思考：如果观众同时看到这几个角色，能否一眼区分出新角色？
   - 思考：作为专业造型师，你会如何让这个新角色在众多角色中脱颖而出？

⚠️ **注意**：以上只是参考，不是禁止使用这些元素。关键是如何设计得有独特性和辨识度。
`;
}

/**
 * 从Stage3输出中提取关键信息
 */
export function extractStage3Info(stage3Output: any): {
  faceShape: string;
  hairStyle: string;
  hairColor: string;
  lipColor: string;
} {
  try {
    // 🔧 修复：Stage3的字段名是 hairDesign, facialDesign, makeupDesign
    const hairText = stage3Output.hairDesign || stage3Output.hair || '';
    const faceText = stage3Output.facialDesign || stage3Output.face || '';
    const makeupText = stage3Output.makeupDesign || stage3Output.makeup || '';

    // 提取脸型
    const faceShape = extractKeyword(faceText, ['鹅蛋脸', '瓜子脸', '圆脸', '方脸', '长脸', '菱形脸', '心形脸', '鸭蛋脸']) || '未知脸型';

    // 提取发色（增加更多关键词）
    const hairColor = extractKeyword(hairText, ['乌黑', '黑色', '棕黑色', '深棕黑色', '深棕色', '棕色', '浅棕色', '栗色', '深褐色', '褐色', '栗棕色']) || '深色';

    // 提取发型关键词（增加更多关键词）
    const hairStyle = extractKeyword(hairText, ['长发', '短发', '中长发', '齐耳短发', '齐肩短发', '披肩发', '及腰', '及胸', '至锁骨', '马尾', '低马尾', '高马尾', '丸子头', '双马尾', '盘发', '波浪卷']) || '长发';

    // 提取唇色（增加更多关键词，包括浓妆）
    const lipColor = extractKeyword(makeupText, ['豆沙色', '豆沙粉', '裸粉色', '浅玫瑰色', '珊瑚色', '玫瑰红', '正红色', '复古红', '橘调', '暗红色', '朱砂红', '朱红色', '丹红色', '明艳红']) || '自然色';

    console.log('[历史记录] 提取Stage3信息:', { faceShape, hairStyle, hairColor, lipColor });

    return { faceShape, hairStyle, hairColor, lipColor };
  } catch (error) {
    console.error('[历史记录] 提取Stage3信息失败:', error);
    return { faceShape: '未知', hairStyle: '长发', hairColor: '深色', lipColor: '自然色' };
  }
}

/**
 * 从Stage4输出中提取关键信息
 */
export function extractStage4Info(stage4Output: any): {
  topClothing: string;
  topColor: string;
  bottomClothing: string;
  bottomColor: string;
} {
  try {
    const topText = stage4Output.top || '';
    const bottomText = stage4Output.bottom || '';

    // 提取上装款式（增加更多关键词）
    const topClothing = extractKeyword(topText, ['针织衫', '针织开衫', '开衫', '衬衫', 'T恤', '外套', '背心', '吊带', '卫衣', '毛衣', '风衣', '夹克', '马甲', '罩衫', '套头衫']) || '上衣';

    // 提取上装颜色（增加更多关键词）
    const topColor = extractKeyword(topText, ['深灰蓝', '深灰', '浅灰', '烟灰', '芥末黄', '深蓝', '浅蓝', '藏青', '深棕', '浅棕', '米白', '白色', '黑色', '酒红', '深酒红', '藕粉', '粉色', '卡其']) || '';

    // 提取下装款式（增加更多关键词）
    const bottomClothing = extractKeyword(bottomText, ['牛仔裤', '裤子', '半身裙', '长裙', '短裙', 'A字裙', '直筒裤', '阔腿裤', '微喇裤', '斜纹布裙', '棉麻裙']) || '下装';

    // 提取下装颜色（增加更多关键词）
    const bottomColor = extractKeyword(bottomText, ['深靛蓝', '旧蓝色', '深灰', '浅灰', '深蓝', '浅蓝', '藏青', '深棕', '浅棕', '卡其', '深卡其', '米白', '米色', '白色', '黑色']) || '';

    console.log('[历史记录] 提取Stage4信息:', { topClothing, topColor, bottomClothing, bottomColor });

    return { topClothing, topColor, bottomClothing, bottomColor };
  } catch (error) {
    console.error('[历史记录] 提取Stage4信息失败:', error);
    return { topClothing: '上衣', topColor: '', bottomClothing: '下装', bottomColor: '' };
  }
}

/**
 * 辅助函数：从文本中提取关键词
 */
function extractKeyword(text: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}

