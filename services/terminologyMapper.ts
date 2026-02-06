/**
 * 术语映射模块
 * 
 * 功能：将电影分镜术语转换为中文摄影术语
 * 依据：.augment/rules/核心规则汇总.md
 * 
 * 核心原则：
 * - 分镜术语用于内部数据结构（如 angleDirection: "3/4正面(3/4 Front)"）
 * - 摄影术语用于中文提示词（如 "轻微向右转"）
 * - 英文术语用于英文提示词（如 "looking slightly to the right"）
 */

/**
 * 景别术语映射表
 */
const SHOT_SIZE_MAPPING: Record<string, string> = {
  // 基础景别
  '特远景(ELS)': '广角镜头拍摄',
  '大远景(ELS)': '广角镜头拍摄',
  '远景(LS)': '远景拍摄',
  '全景(FS)': '全景拍摄',
  '中景(MS)': '中景拍摄',
  '近景(MCU)': '近景拍摄',
  '特写(CU)': '特写拍摄',
  '大特写(ECU)': '大特写拍摄',
  '局部特写(DS)': '局部特写拍摄',
  
  // 特殊景别
  '过肩镜头(OTS)': '过肩镜头拍摄',
  '双人镜头': '双人镜头拍摄',
  '群像镜头': '群像镜头拍摄',
  
  // 兼容旧格式（只有中文）
  '特远景': '广角镜头拍摄',
  '大远景': '广角镜头拍摄',
  '远景': '远景拍摄',
  '全景': '全景拍摄',
  '中景': '中景拍摄',
  '近景': '近景拍摄',
  '特写': '特写拍摄',
  '大特写': '大特写拍摄',
  '局部特写': '局部特写拍摄',
};

/**
 * 角度高度术语映射表
 */
const ANGLE_HEIGHT_MAPPING: Record<string, string> = {
  // 标准格式（中文+英文）
  '鸟瞰(Bird Eye)': '航拍视角',
  '极端俯拍(Extreme High)': '从高处拍摄',
  '中度俯拍(Moderate High)': '从上方拍摄',
  '轻微俯拍(Mild High)': '略微从上方拍摄',
  '平视(Eye Level)': '与眼睛同高',
  '轻微仰拍(Mild Low)': '略微从下方拍摄',
  '中度仰拍(Moderate Low)': '从下方拍摄',
  '极端仰拍(Extreme Low)': '从极低处拍摄',
  '虫视(Worm Eye)': '贴近地面仰视',
  '荷兰角(Dutch Angle)': '镜头倾斜拍摄',
  
  // 兼容旧格式（只有中文）
  '鸟瞰': '航拍视角',
  '极端俯拍': '从高处拍摄',
  '中度俯拍': '从上方拍摄',
  '轻微俯拍': '略微从上方拍摄',
  '平视': '与眼睛同高',
  '轻微仰拍': '略微从下方拍摄',
  '中度仰拍': '从下方拍摄',
  '极端仰拍': '从极低处拍摄',
  '虫视': '贴近地面仰视',
  '荷兰角': '镜头倾斜拍摄',
};

/**
 * 角度朝向术语映射表
 */
const ANGLE_DIRECTION_MAPPING: Record<string, string> = {
  // 标准格式（中文+英文）
  '正面(Front)': '直视镜头',
  '微侧正面(Slight Front)': '略微向右转',
  '3/4正面(3/4 Front)': '轻微向右转',
  '1/3侧面(1/3 Side)': '侧身轮廓带部分正面',
  '正侧面(Full Side)': '右侧面轮廓',
  '1/3背面(1/3 Back)': '侧身轮廓带部分背面',
  '3/4背面(3/4 Back)': '转身背对，回头看肩',
  '背面(Back)': '背对镜头',
  '主观视角(POV)': '主观视角',
  
  // 兼容旧格式（只有中文）
  '正面': '直视镜头',
  '微侧正面': '略微向右转',
  '3/4正面': '轻微向右转',
  '1/3侧面': '侧身轮廓带部分正面',
  '正侧面': '右侧面轮廓',
  '1/3背面': '侧身轮廓带部分背面',
  '3/4背面': '转身背对，回头看肩',
  '背面': '背对镜头',
  '主观视角': '主观视角',
};

/**
 * 将分镜术语转换为中文摄影术语
 * 
 * @param shotSize 景别（如 "特写(CU)" 或 "特写"）
 * @param angleHeight 角度高度（如 "中度俯拍(Moderate High)" 或 "中度俯拍"）
 * @param angleDirection 角度朝向（如 "3/4正面(3/4 Front)" 或 "3/4正面"）
 * @returns 转换后的摄影术语
 */
export function convertToPhotographyTerms(
  shotSize?: string,
  angleHeight?: string,
  angleDirection?: string
): {
  shotSizeCn: string;
  angleHeightCn: string;
  angleDirectionCn: string;
} {
  return {
    shotSizeCn: shotSize ? (SHOT_SIZE_MAPPING[shotSize] || shotSize) : '',
    angleHeightCn: angleHeight ? (ANGLE_HEIGHT_MAPPING[angleHeight] || angleHeight) : '',
    angleDirectionCn: angleDirection ? (ANGLE_DIRECTION_MAPPING[angleDirection] || angleDirection) : '',
  };
}

/**
 * 从分镜术语中提取中文部分（去掉英文括号）
 * 然后转换为摄影术语
 * 
 * @param term 分镜术语（如 "3/4正面(3/4 Front)"）
 * @returns 摄影术语（如 "轻微向右转"）
 */
export function extractAndConvert(term: string, type: 'shotSize' | 'angleHeight' | 'angleDirection'): string {
  if (!term) return '';
  
  // 先尝试直接映射（包含英文括号的完整格式）
  const mapping = type === 'shotSize' ? SHOT_SIZE_MAPPING :
                  type === 'angleHeight' ? ANGLE_HEIGHT_MAPPING :
                  ANGLE_DIRECTION_MAPPING;
  
  if (mapping[term]) {
    return mapping[term];
  }
  
  // 如果没有匹配，提取中文部分再尝试
  const cnOnly = term.replace(/\([^)]+\)/g, '').trim();
  return mapping[cnOnly] || term;
}

