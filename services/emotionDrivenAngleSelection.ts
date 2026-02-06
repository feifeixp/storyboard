/**
 * 情绪驱动的角度选择算法
 * 
 * 核心原则：先分析情绪需求 → 再选角度组合（朝向+高度）
 * 依据：.augment/rules/核心规则汇总.md
 */

import { AngleDirection, AngleHeight } from '../types';

/**
 * 情绪标签定义
 */
export type EmotionTag =
  | '威胁' | '压迫' | '恐惧' | '紧张' | '不安' | '混乱'
  | '脆弱' | '渺小' | '孤独' | '绝望' | '悲伤' | '失败'
  | '力量' | '崇高' | '威严' | '胜利' | '愤怒' | '对抗'
  | '平静' | '中立' | '客观' | '说明' | '日常' | '对话'
  | '神秘' | '悬念' | '好奇' | '探索' | '发现' | '揭秘';

/**
 * 情绪与角度的映射关系
 */
interface EmotionAngleMapping {
  emotion: EmotionTag;
  preferredHeights: AngleHeight[];  // 优先选择的高度
  preferredDirections: AngleDirection[];  // 优先选择的朝向
  weight: number;  // 权重（1-10，越高越优先）
}

/**
 * 情绪与角度映射表
 * 基于《Framed Ink》理论和项目规则
 */
const EMOTION_ANGLE_MAPPINGS: EmotionAngleMapping[] = [
  // 威胁、压迫、恐惧类
  { emotion: '威胁', preferredHeights: ['极端仰拍(Extreme Low)', '中度仰拍(Moderate Low)'], preferredDirections: ['正面(Front)', '3/4正面(3/4 Front)'], weight: 9 },
  { emotion: '压迫', preferredHeights: ['极端仰拍(Extreme Low)', '中度仰拍(Moderate Low)'], preferredDirections: ['正面(Front)', '3/4正面(3/4 Front)'], weight: 9 },
  { emotion: '恐惧', preferredHeights: ['极端俯拍(Extreme High)', '鸟瞰(Bird Eye)'], preferredDirections: ['背面(Back)', '3/4背面(3/4 Back)'], weight: 8 },
  
  // 紧张、不安、混乱类
  { emotion: '紧张', preferredHeights: ['轻微仰拍(Mild Low)', '中度仰拍(Moderate Low)'], preferredDirections: ['正侧面(Full Side)', '1/3侧面(1/3 Side)'], weight: 7 },
  { emotion: '不安', preferredHeights: ['轻微俯拍(Mild High)', '中度俯拍(Moderate High)'], preferredDirections: ['3/4背面(3/4 Back)', '1/3背面(1/3 Back)'], weight: 7 },
  { emotion: '混乱', preferredHeights: ['轻微仰拍(Mild Low)', '轻微俯拍(Mild High)'], preferredDirections: ['正侧面(Full Side)', '3/4正面(3/4 Front)'], weight: 6 },
  
  // 脆弱、渺小、孤独类
  { emotion: '脆弱', preferredHeights: ['中度俯拍(Moderate High)', '极端俯拍(Extreme High)'], preferredDirections: ['3/4正面(3/4 Front)', '正面(Front)'], weight: 8 },
  { emotion: '渺小', preferredHeights: ['鸟瞰(Bird Eye)', '极端俯拍(Extreme High)'], preferredDirections: ['背面(Back)', '3/4背面(3/4 Back)'], weight: 9 },
  { emotion: '孤独', preferredHeights: ['中度俯拍(Moderate High)', '轻微俯拍(Mild High)'], preferredDirections: ['背面(Back)', '3/4背面(3/4 Back)'], weight: 7 },
  { emotion: '绝望', preferredHeights: ['鸟瞰(Bird Eye)', '极端俯拍(Extreme High)'], preferredDirections: ['背面(Back)', '3/4背面(3/4 Back)'], weight: 9 },
  { emotion: '悲伤', preferredHeights: ['轻微俯拍(Mild High)', '中度俯拍(Moderate High)'], preferredDirections: ['3/4背面(3/4 Back)', '1/3背面(1/3 Back)'], weight: 7 },
  { emotion: '失败', preferredHeights: ['中度俯拍(Moderate High)', '极端俯拍(Extreme High)'], preferredDirections: ['背面(Back)', '3/4背面(3/4 Back)'], weight: 8 },
  
  // 力量、崇高、威严类
  { emotion: '力量', preferredHeights: ['中度仰拍(Moderate Low)', '轻微仰拍(Mild Low)'], preferredDirections: ['3/4正面(3/4 Front)', '正面(Front)'], weight: 8 },
  { emotion: '崇高', preferredHeights: ['极端仰拍(Extreme Low)', '中度仰拍(Moderate Low)'], preferredDirections: ['正面(Front)', '3/4正面(3/4 Front)'], weight: 9 },
  { emotion: '威严', preferredHeights: ['轻微仰拍(Mild Low)', '中度仰拍(Moderate Low)'], preferredDirections: ['正面(Front)', '3/4正面(3/4 Front)'], weight: 8 },
  { emotion: '胜利', preferredHeights: ['轻微仰拍(Mild Low)', '中度仰拍(Moderate Low)'], preferredDirections: ['3/4正面(3/4 Front)', '正侧面(Full Side)'], weight: 7 },
  { emotion: '愤怒', preferredHeights: ['中度仰拍(Moderate Low)', '轻微仰拍(Mild Low)'], preferredDirections: ['正面(Front)', '3/4正面(3/4 Front)'], weight: 8 },
  { emotion: '对抗', preferredHeights: ['轻微仰拍(Mild Low)', '平视(Eye Level)'], preferredDirections: ['正面(Front)', '3/4正面(3/4 Front)'], weight: 7 },
  
  // 平静、中立、客观类
  { emotion: '平静', preferredHeights: ['平视(Eye Level)', '轻微仰拍(Mild Low)'], preferredDirections: ['3/4正面(3/4 Front)', '正侧面(Full Side)'], weight: 5 },
  { emotion: '中立', preferredHeights: ['平视(Eye Level)', '轻微仰拍(Mild Low)'], preferredDirections: ['3/4正面(3/4 Front)', '正侧面(Full Side)'], weight: 5 },
  { emotion: '客观', preferredHeights: ['平视(Eye Level)'], preferredDirections: ['3/4正面(3/4 Front)', '正侧面(Full Side)'], weight: 6 },
  { emotion: '说明', preferredHeights: ['平视(Eye Level)', '轻微俯拍(Mild High)'], preferredDirections: ['3/4正面(3/4 Front)', '正侧面(Full Side)'], weight: 5 },
  { emotion: '日常', preferredHeights: ['轻微仰拍(Mild Low)', '平视(Eye Level)'], preferredDirections: ['3/4正面(3/4 Front)', '正侧面(Full Side)'], weight: 5 },
  { emotion: '对话', preferredHeights: ['轻微仰拍(Mild Low)', '平视(Eye Level)'], preferredDirections: ['3/4正面(3/4 Front)', '正侧面(Full Side)'], weight: 6 },
  
  // 神秘、悬念、探索类
  { emotion: '神秘', preferredHeights: ['轻微俯拍(Mild High)', '中度俯拍(Moderate High)'], preferredDirections: ['3/4背面(3/4 Back)', '背面(Back)'], weight: 7 },
  { emotion: '悬念', preferredHeights: ['轻微俯拍(Mild High)', '轻微仰拍(Mild Low)'], preferredDirections: ['背面(Back)', '3/4背面(3/4 Back)'], weight: 7 },
  { emotion: '好奇', preferredHeights: ['轻微仰拍(Mild Low)', '平视(Eye Level)'], preferredDirections: ['3/4正面(3/4 Front)', '1/3侧面(1/3 Side)'], weight: 6 },
  { emotion: '探索', preferredHeights: ['轻微仰拍(Mild Low)', '轻微俯拍(Mild High)'], preferredDirections: ['1/3侧面(1/3 Side)', '正侧面(Full Side)'], weight: 6 },
  { emotion: '发现', preferredHeights: ['轻微仰拍(Mild Low)', '中度仰拍(Moderate Low)'], preferredDirections: ['3/4正面(3/4 Front)', '正面(Front)'], weight: 7 },
  { emotion: '揭秘', preferredHeights: ['轻微仰拍(Mild Low)', '中度仰拍(Moderate Low)'], preferredDirections: ['背面(Back)', '3/4背面(3/4 Back)'], weight: 7 },
];

/**
 * 从storyBeat中提取情绪标签
 *
 * v2 更新（2024-12-28）：
 * - 扩展关键词映射表，从32个增加到80+个
 * - 添加常用同义词，提高情绪识别准确率
 * - 支持更自然的情绪描述词汇
 */
export function extractEmotionFromStoryBeat(storyBeat: string): EmotionTag[] {
  const emotions: EmotionTag[] = [];

  // 🆕 扩展的关键词映射表（80+个关键词）
  const keywords: Record<string, EmotionTag> = {
    // ═══════════ 威胁/压迫类 ═══════════
    '威胁': '威胁', '压迫': '压迫', '恐惧': '恐惧', '害怕': '恐惧',
    // 🆕 同义词扩展
    '危险': '威胁', '毁灭': '威胁', '恐怖': '恐惧', '惊悚': '恐惧',
    '凶狠': '威胁', '凶残': '威胁', '狰狞': '威胁', '邪恶': '威胁',
    '阴险': '威胁', '险恶': '威胁', '凶恶': '威胁',

    // ═══════════ 紧张/不安类 ═══════════
    '紧张': '紧张', '不安': '不安', '混乱': '混乱', '慌乱': '混乱',
    // 🆕 同义词扩展
    '焦虑': '不安', '惶恐': '恐惧', '惊慌': '混乱', '慌张': '混乱',
    '忐忑': '不安', '惊惧': '恐惧', '惊恐': '恐惧', '惊骇': '恐惧',
    '惊吓': '恐惧', // 🔧 修复：移除重复的 '惊悚'

    // ═══════════ 脆弱/渺小类 ═══════════
    '脆弱': '脆弱', '渺小': '渺小', '孤独': '孤独', '绝望': '绝望',
    '悲伤': '悲伤', '失败': '失败',
    // 🆕 同义词扩展
    '无助': '脆弱', '无力': '脆弱', '软弱': '脆弱', '卑微': '渺小',
    '微小': '渺小', '弱小': '脆弱', '无奈': '绝望', '哀伤': '悲伤',
    '悲痛': '悲伤', '痛苦': '悲伤', '凄凉': '悲伤', '凄惨': '悲伤',
    '悲凉': '悲伤', '哀怨': '悲伤',

    // ═══════════ 力量/崇高类 ═══════════
    '力量': '力量', '崇高': '崇高', '威严': '威严', '胜利': '胜利',
    '愤怒': '愤怒', '对抗': '对抗',
    // 🆕 同义词扩展
    '强大': '力量', '霸气': '威严', '冷酷': '威严', '冰冷': '威严',
    '无情': '威严', '掌控': '威严', '统治': '威严', '主宰': '崇高',
    '神圣': '崇高', '庄严': '威严', '肃穆': '威严', '凛然': '威严',
    '震怒': '愤怒', '暴怒': '愤怒', '狂怒': '愤怒', '怒火': '愤怒',
    '抗争': '对抗', '反抗': '对抗', '挑战': '对抗',

    // ═══════════ 平静/中立类 ═══════════
    '平静': '平静', '中立': '中立', '客观': '客观', '说明': '说明',
    '日常': '日常', '对话': '对话',
    // 🆕 同义词扩展
    '安静': '平静', '宁静': '平静', '淡然': '平静', '从容': '平静',
    '冷静': '平静', '沉着': '平静', '镇定': '平静', '平和': '平静',
    '安详': '平静', '祥和': '平静',

    // ═══════════ 神秘/悬念类 ═══════════
    '神秘': '神秘', '悬念': '悬念', '好奇': '好奇', '探索': '探索',
    '发现': '发现', '揭秘': '揭秘',
    // 🆕 同义词扩展
    '诡异': '神秘', '离奇': '神秘', '古怪': '神秘', '阴森': '神秘',
    '幽暗': '神秘', '诡秘': '神秘', '隐秘': '神秘', '神奇': '神秘',
    '奇异': '神秘', '怪异': '神秘', '诡谲': '神秘',
  };

  for (const [keyword, emotion] of Object.entries(keywords)) {
    if (storyBeat.includes(keyword)) {
      emotions.push(emotion);
    }
  }

  // 如果没有匹配到情绪，返回默认情绪
  if (emotions.length === 0) {
    emotions.push('中立');
  }

  return emotions;
}

/**
 * 根据情绪选择最佳角度组合
 */
export function selectAngleByEmotion(
  storyBeat: string,
  currentDirection?: AngleDirection,
  currentHeight?: AngleHeight
): { direction: AngleDirection; height: AngleHeight; reason: string } {
  // 1. 提取情绪标签
  const emotions = extractEmotionFromStoryBeat(storyBeat);

  // 2. 查找匹配的映射
  const matchedMappings = EMOTION_ANGLE_MAPPINGS.filter(m => emotions.includes(m.emotion));

  // 3. 如果没有匹配，使用默认角度
  if (matchedMappings.length === 0) {
    return {
      direction: '3/4正面(3/4 Front)',
      height: '轻微仰拍(Mild Low)',
      reason: '未检测到明确情绪，使用默认角度'
    };
  }

  // 4. 按权重排序，选择权重最高的映射
  const sortedMappings = matchedMappings.sort((a, b) => b.weight - a.weight);
  const bestMapping = sortedMappings[0];

  // 5. 从优先列表中随机选择（避免单一）
  const selectedDirection = bestMapping.preferredDirections[
    Math.floor(Math.random() * bestMapping.preferredDirections.length)
  ];
  const selectedHeight = bestMapping.preferredHeights[
    Math.floor(Math.random() * bestMapping.preferredHeights.length)
  ];

  return {
    direction: selectedDirection,
    height: selectedHeight,
    reason: `情绪"${bestMapping.emotion}"驱动：${selectedHeight} + ${selectedDirection}`
  };
}

/**
 * 批量修复角度分布问题（情绪驱动）
 */
export function fixAngleDistributionByEmotion(
  shots: Array<{ shotNumber: string; storyBeat: string; angleDirection?: AngleDirection; angleHeight?: AngleHeight }>,
  issues: {
    frontViewExcess?: number;  // 正面镜头超标数量
    eyeLevelExcess?: number;   // 平视镜头超标数量
  }
): Array<{ shotNumber: string; newDirection?: AngleDirection; newHeight?: AngleHeight; reason: string }> {
  const fixes: Array<{ shotNumber: string; newDirection?: AngleDirection; newHeight?: AngleHeight; reason: string }> = [];

  // 1. 修复正面镜头超标
  if (issues.frontViewExcess && issues.frontViewExcess > 0) {
    const frontViewShots = shots.filter(s =>
      s.angleDirection?.includes('正面') || s.angleDirection?.includes('Front')
    );

    // 保留前2个，其余根据情绪修复
    const shotsToFix = frontViewShots.slice(2);

    for (const shot of shotsToFix) {
      const { direction, reason } = selectAngleByEmotion(shot.storyBeat, shot.angleDirection, shot.angleHeight);

      // 确保不再选择正面
      let finalDirection = direction;
      if (finalDirection.includes('正面') || finalDirection.includes('Front')) {
        finalDirection = '3/4正面(3/4 Front)';
      }

      fixes.push({
        shotNumber: shot.shotNumber,
        newDirection: finalDirection,
        reason: `正面镜头超标修复：${reason}`
      });
    }
  }

  // 2. 修复平视镜头超标
  if (issues.eyeLevelExcess && issues.eyeLevelExcess > 0) {
    const eyeLevelShots = shots.filter(s =>
      s.angleHeight?.includes('平视') || s.angleHeight?.includes('Eye Level')
    );

    // 需要修复的数量
    const shotsToFix = eyeLevelShots.slice(-issues.eyeLevelExcess);

    for (const shot of shotsToFix) {
      const { height, reason } = selectAngleByEmotion(shot.storyBeat, shot.angleDirection, shot.angleHeight);

      // 确保不再选择平视
      let finalHeight = height;
      if (finalHeight.includes('平视') || finalHeight.includes('Eye Level')) {
        finalHeight = '轻微仰拍(Mild Low)';
      }

      fixes.push({
        shotNumber: shot.shotNumber,
        newHeight: finalHeight,
        reason: `平视镜头超标修复：${reason}`
      });
    }
  }

  return fixes;
}

