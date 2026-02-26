/**
 * 摄像机角度映射表
 * 用于生成精确的生图提示词，防止 AI 生图误解
 * 包含角度方向和角度高度的精确英文描述
 */

/**
 * 角度方向精确映射
 * 每个角度都有精确的角度范围描述，确保 AI 生图模型理解正确
 */
export const angleDirectionPrecision: Record<string, string> = {
  // 正面系列
  '正面(Front)': 'front view, face looking DIRECTLY at camera (0° horizontal rotation), both eyes and ears equally visible',
  'Front': 'front view, face looking DIRECTLY at camera (0° horizontal rotation), both eyes and ears equally visible',

  // 3/4 正面 - 最容易被误画成正面的角度！
  '3/4正面(3/4 Front)': '(3/4 front view:1.3), face turned 35-45° away from camera, (one cheek more prominent:1.2), far ear partially hidden, clear asymmetric face',
  '3/4 Front': '(3/4 front view:1.3), face turned 35-45° away from camera, (one cheek more prominent:1.2), far ear partially hidden, clear asymmetric face',

  // 1/3 侧面
  '1/3侧面(1/3 Side)': '1/3 side view, face turned 55-65° from camera, showing dominant profile with some far cheek visible',
  '1/3 Side': '1/3 side view, face turned 55-65° from camera, showing dominant profile with some far cheek visible',

  // 正侧面
  '正侧面(Full Side)': '(perfect profile view:1.3), face turned exactly 90° from camera, (only one side of face visible:1.2), nose silhouette clear',
  'Full Side': '(perfect profile view:1.3), face turned exactly 90° from camera, (only one side of face visible:1.2), nose silhouette clear',

  // 1/3 背面
  '1/3背面(1/3 Back)': '1/3 back view, face turned 115-125° from camera, showing mostly profile with back of head visible',
  '1/3 Back': '(1/3 back view:1.2), face turned 115-125° from camera, showing mostly profile with back of head visible',

  // 3/4 背面
  '3/4背面(3/4 Back)': '(3/4 back view:1.2), face turned 135-150° from camera, (mostly back of head:1.2), only ear and slight cheek contour visible',
  '3/4 Back': '(3/4 back view:1.2), face turned 135-150° from camera, (mostly back of head:1.2), only ear and slight cheek contour visible',

  // 背面
  '背面(Back)': '(back view:1.3), showing only back of head (180° rotation), (no face visible:1.2), only hair and shoulders',
  'Back': '(back view:1.3), showing only back of head (180° rotation), (no face visible:1.2), only hair and shoulders',

  // 主观视角（POV）
  '主观视角(POV)': '(POV shot:1.4), (first-person perspective:1.3), viewing scene from character eyes, no character face visible in frame',
  'POV': '(POV shot:1.4), (first-person perspective:1.3), viewing scene from character eyes, no character face visible in frame',
  'pov': '(POV shot:1.4), (first-person perspective:1.3), viewing scene from character eyes, no character face visible in frame',
} as const;

/**
 * 角度高度精确映射
 */
export const angleHeightPrecision: Record<string, string> = {
  // 俯视系列
  '鸟瞰(Bird Eye)': '(extreme bird eye view:1.4), camera DIRECTLY above looking straight down (85-90° angle), (top of head dominant:1.3), body foreshortened vertically',
  'Bird Eye': '(extreme bird eye view:1.4), camera DIRECTLY above looking straight down (85-90° angle), (top of head dominant:1.3), body foreshortened vertically',
  '极端俯拍(Extreme High)': '(extreme high angle:1.3), camera 55-75° above eye level, (top of head very prominent:1.2), face foreshortened, body compressed',
  'Extreme High': '(extreme high angle:1.3), camera 55-75° above eye level, (top of head very prominent:1.2), face foreshortened, body compressed',

  '中度俯拍(Moderate High)': 'moderate high angle, camera 30-45° above eye level, noticeable downward perspective',
  'Moderate High': 'moderate high angle, camera 30-45° above eye level, noticeable downward perspective',

  '轻微俯拍(Mild High)': 'mild high angle, camera 10-25° above eye level, subtle downward tilt',
  'Mild High': 'mild high angle, camera 10-25° above eye level, subtle downward tilt',

  // 平视
  '平视(Eye Level)': 'eye level shot, camera at SAME height as subject face, neutral horizon line',
  'Eye Level': 'eye level shot, camera at SAME height as subject face, neutral horizon line',

  // 仰视系列
  '轻微仰拍(Mild Low)': 'mild low angle, camera 10-25° below eye level, subtle upward tilt',
  'Mild Low': 'mild low angle, camera 10-25° below eye level, subtle upward tilt',

  '中度仰拍(Moderate Low)': 'moderate low angle, camera 30-45° below eye level, noticeable upward perspective',
  'Moderate Low': 'moderate low angle, camera 30-45° below eye level, noticeable upward perspective',

  '极端仰拍(Extreme Low)': '(extreme low angle:1.3), camera 55-75° below eye level, (chin prominent:1.2), body towering upward',
  'Extreme Low': '(extreme low angle:1.3), camera 55-75° below eye level, (chin prominent:1.2), body towering upward',

  '仰拍(Low Angle)': 'low angle, camera 25-40° below eye level, looking up at subject',
  'Low Angle': 'low angle, camera 25-40° below eye level, looking up at subject',

  '俯拍(High Angle)': 'high angle, camera 25-40° above eye level, looking down at subject',
  'High Angle': 'high angle, camera 25-40° above eye level, looking down at subject',

  '蚁视(Worm Eye)': '(worm eye view:1.4), camera almost at ground level (80-90° below), looking STRAIGHT UP, (extreme foreshortening:1.3)',
  'Worm Eye': '(worm eye view:1.4), camera almost at ground level (80-90° below), looking STRAIGHT UP, (extreme foreshortening:1.3)',
} as const;

/**
 * 角度信息接口
 */
export interface AngleInfo {
  cn: string;         // 中文描述
  en: string;         // 英文描述
  preciseEn: string;   // 精确英文描述（用于生图）
}

/**
 * 获取角度信息
 * @param heightCn 角度高度中文术语
 * @param directionCn 角度方向中文术语
 * @returns 角度信息对象
 */
export function getAngleInfo(heightCn: string, directionCn: string): AngleInfo {
  const cnLabel = [heightCn, directionCn].filter(Boolean).join('，');

  const heightEn = heightCn.match(/\(([^)]+)\)/)?.[1] || '';
  const directionEn = directionCn.match(/\(([^)]+)\)/)?.[1] || '';

  const preciseHeightEn = angleHeightPrecision[heightCn] || heightEn;
  const preciseDirectionEn = angleDirectionPrecision[directionCn] || directionEn;
  const preciseEnLabel = [preciseHeightEn, preciseDirectionEn].filter(Boolean).join('; ');
  const enLabel = [heightEn, directionEn].filter(Boolean).join(', ');

  return { cn: cnLabel, en: enLabel, preciseEn: preciseEnLabel };
}

/**
 * 从文本中提取角度信息
 * 用于从 storyBeat 或提示词文本中提取角度
 */
export function extractAngleFromText(text: string): AngleInfo {
  const angleMap: { pattern: RegExp; cn: string; en: string; preciseEn: string }[] = [
    { pattern: /极端仰拍|Extreme Low/i, cn: '极端仰拍', en: 'Extreme Low Angle', preciseEn: 'extreme low angle, camera 50-70° below eye level, looking up sharply' },
    { pattern: /极端俯拍|Bird's Eye|鸟瞰/i, cn: '极端俯拍/鸟瞰', en: 'Bird Eye View', preciseEn: 'extreme overhead shot, camera directly above (80-90° down)' },
    { pattern: /仰拍|Low Angle/i, cn: '仰拍', en: 'Low Angle', preciseEn: 'low angle, camera 25-40° below eye level' },
    { pattern: /俯拍|High Angle/i, cn: '俯拍', en: 'High Angle', preciseEn: 'high angle, camera 25-40° above eye level' },
    { pattern: /平视|Eye Level/i, cn: '平视', en: 'Eye Level', preciseEn: 'eye level shot, camera at same height as subject' },
  ];

  for (const { pattern, cn, en, preciseEn } of angleMap) {
    if (pattern.test(text)) {
      return { cn, en, preciseEn };
    }
  }
  return { cn: '', en: '', preciseEn: '' };
}
