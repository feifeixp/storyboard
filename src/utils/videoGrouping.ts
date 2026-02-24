import { Shot, VideoGroup, VideoGroupPrompt } from '../../types';
import { SceneRef } from '../../types/project';

/**
 * 从时长字符串解析秒数
 * @param duration 格式如 "3s"、"5s"、"10s"
 * @returns 秒数
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)s$/i);
  if (!match) {
    // 默认3秒
    return 3;
  }
  return parseFloat(match[1]);
}

/**
 * 将秒数格式化为时长字符串
 * @param seconds 秒数
 * @returns 格式如 "3s"、"5.5s"
 */
export function formatDuration(seconds: number): string {
  return `${Math.round(seconds * 10) / 10}s`;
}

/**
 * 获取镜头的剧情描述
 */
export function getShotStoryBeat(shot: Shot): string {
  return typeof shot.storyBeat === 'string' ? shot.storyBeat : shot.storyBeat.event;
}

/**
 * 根据场景和时长限制分组镜头
 * @param shots 镜头数组
 * @param scenes 场景数组
 * @param maxDuration 单个视频最大时长（秒），默认15秒
 * @returns 分组后的视频分组数组
 */
export function groupShotsBySceneAndDuration(
  shots: Shot[],
  scenes: SceneRef[],
  maxDuration: number = 15
): VideoGroup[] {
  const groups: VideoGroup[] = [];

  // 按原始顺序遍历镜头
  let currentGroup: VideoGroup | null = null;
  let currentDuration = 0;
  let currentSceneId: string | undefined;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const shotDuration = parseDuration(shot.duration);

    // 获取场景信息
    const scene = scenes.find(s => s.id === shot.sceneId);

    // 如果当前组为空，或场景变化，或添加此镜头会超过时长限制，则创建新组
    if (
      !currentGroup ||
      (currentSceneId && shot.sceneId && currentSceneId !== shot.sceneId) ||
      (currentDuration + shotDuration > maxDuration)
    ) {
      // 保存当前组（如果有）
      if (currentGroup) {
        groups.push(currentGroup);
      }

      // 创建新组
      const groupSceneId = shot.sceneId;
      const groupSceneName = scene?.name || `场景${shot.sceneId || '未知'}`;

      // 计算这是该场景的第几个分组
      const sameSceneGroupsCount = groups.filter(
        g => g.sceneId === groupSceneId
      ).length;

      const groupId = groupSceneId
        ? `${groupSceneId}_${sameSceneGroupsCount + 1}`
        : `ungrouped_${groups.length + 1}`;

      const groupName = scene?.name
        ? sameSceneGroupsCount > 0
          ? `${scene.name}-${sameSceneGroupsCount + 1}`
          : scene.name
        : `未分组-${groups.length + 1}`;

      currentGroup = {
        id: groupId,
        groupName,
        sceneId: groupSceneId,
        sceneName: groupSceneName,
        totalDuration: shotDuration,
        shots: [],
      };

      currentDuration = 0;
      currentSceneId = groupSceneId;
    }

    // 将镜头添加到当前组
    if (currentGroup) {
      currentGroup.shots.push({
        shotIndex: i,
        shotNumber: shot.shotNumber,
        startSecond: currentDuration,
        endSecond: currentDuration + shotDuration,
        shot,
      });
      currentDuration += shotDuration;
      currentGroup.totalDuration = currentDuration;
    }
  }

  // 添加最后一个组
  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

// ═══════════ Seedance 2.0 运镜翻译映射 ═══════════

/** 运镜类型 → Seedance 2.0 专业运镜描述（核心规范三） */
const CAMERA_MOVE_MAP: Record<string, string> = {
  '固定(Static)': '镜头固定不动',
  '推镜(Dolly In)': '镜头缓慢推进',
  '拉镜(Dolly Out)': '镜头平稳拉远',
  '左摇(Pan Left)': '镜头向左平摇',
  '右摇(Pan Right)': '镜头向右平摇',
  '上摇(Tilt Up)': '镜头向上仰拍',
  '下摇(Tilt Down)': '镜头向下俯拍',
  '跟拍(Tracking)': '镜头跟随主体移动',
  '移焦(Rack Focus)': '焦点在前后景之间切换',
  '希区柯克变焦(Dolly Zoom)': '希区柯克变焦（背景拉伸人物不变）',
  '升镜(Crane Up)': '镜头垂直升起',
  '降镜(Crane Down)': '镜头垂直下降',
  '环绕(Arc)': '用机械臂多角度环绕主体',
  '手持(Handheld)': '手持镜头自然晃动',
};

/** 角度高度 → 简洁运镜描述 */
function translateAngleHeight(h?: string): string {
  if (!h) return '';
  if (h.includes('俯拍') || h.includes('High')) return '俯视角度';
  if (h.includes('仰拍') || h.includes('Low')) return '仰视角度';
  if (h.includes('鸟瞰') || h.includes('Aerial')) return '鸟瞰视角';
  if (h.includes('蚂蚁') || h.includes('Worm')) return '低视角';
  return '';
}

/**
 * 根据前后景别变化推断转场方式（核心规范二）
 * @returns 转场描述文本
 */
function inferTransition(current: Shot, next: Shot): string {
  const curScene = current.sceneId;
  const nextScene = next.sceneId;

  // 跨场景：使用渐变/遮罩转场
  if (curScene && nextScene && curScene !== nextScene) {
    return '无缝渐变转场，';
  }

  const curSize = current.shotSize || '';
  const nextSize = next.shotSize || '';

  // 远 → 近：推进
  if ((curSize.includes('远') || curSize.includes('LS') || curSize.includes('ELS'))
    && (nextSize.includes('近') || nextSize.includes('CU') || nextSize.includes('特写') || nextSize.includes('ECU'))) {
    return '快速推进特写，';
  }
  // 近 → 远：拉远
  if ((curSize.includes('近') || curSize.includes('CU') || curSize.includes('特写') || curSize.includes('ECU'))
    && (nextSize.includes('远') || nextSize.includes('LS') || nextSize.includes('ELS'))) {
    return '镜头急速拉远，';
  }
  // 相同景别：硬切
  if (curSize === nextSize) {
    return '切镜，';
  }
  // 默认：平滑过渡
  return '画面平滑过渡，';
}

/**
 * 生成符合 Seedance 2.0 规范的视频提示词
 * 公式：[素材@定义] + [整体风格与画质基调] + [0-N秒：镜头+动作+台词] + [转场] + [N-M秒：…] + …
 *
 * @param group 视频分组
 * @param style 整体风格描述（可选）
 * @returns 视频生成提示词
 */
export function generateVideoGroupPrompt(
  group: VideoGroup,
  style?: string
): VideoGroupPrompt {
  const sections: string[] = [];

  // ───── 1. 素材@定义（核心规范一）─────
  let assetsText = '';
  const firstShot = group.shots[0]?.shot;
  if (firstShot?.storyboardGridUrl) {
    assetsText = '以@图片1为首帧参考';
    sections.push(assetsText + '，');
  }

  // ───── 2. 整体风格与画质基调 ─────
  const styleElements: string[] = [];
  if (style) {
    styleElements.push(style);
  }
  if (firstShot?.lighting) {
    styleElements.push(firstShot.lighting);
  }
  styleElements.push('保持画面风格统一');
  const styleText = styleElements.join('，') + '。';
  sections.push(styleText);

  // ───── 3. 时间轴分段脚本（核心规范二）─────
  const timelineLines: string[] = [];
  const transitionNotes: string[] = [];

  for (let i = 0; i < group.shots.length; i++) {
    const shotRange = group.shots[i];
    const shot = shotRange.shot;
    const startSec = Math.floor(shotRange.startSecond);
    const endSec = Math.floor(shotRange.endSecond);

    let line = `\n${startSec}-${endSec}秒画面：`;

    // (a) 运镜方式（核心规范三 — 专业化描述）
    const moveDesc = CAMERA_MOVE_MAP[shot.cameraMove] || '';
    if (moveDesc && shot.cameraMove !== '固定(Static)') {
      line += `${moveDesc}，`;
    }
    // 运镜细节补充（如速度、幅度）
    if (shot.cameraMoveDetail) {
      line += `${shot.cameraMoveDetail}，`;
    }
    // 角度高度描述
    const angleDesc = translateAngleHeight(shot.angleHeight);
    if (angleDesc) {
      line += `${angleDesc}，`;
    }

    // (b) 主体动作 / 故事节拍
    const storyBeat = getShotStoryBeat(shot);
    if (storyBeat) {
      line += `${storyBeat}。`;
    }

    // (c) 台词/对白 — 音画同步（核心规范四）
    if (shot.dialogue) {
      line += `说话"${shot.dialogue}"。`;
    }

    // (d) 音效（从 storyBeat 对象获取）
    if (typeof shot.storyBeat === 'object' && shot.storyBeat.sound) {
      line += `音效：${shot.storyBeat.sound}。`;
    }

    // (e) 视频生成提示词（如果存在，优先使用更精准的描述）
    if (shot.videoPromptCn) {
      line += `${shot.videoPromptCn}`;
    }

    timelineLines.push(line);

    // (f) 转场（非最后一个镜头）— 核心规范二转场词汇
    if (i < group.shots.length - 1) {
      const nextShot = group.shots[i + 1].shot;
      const transition = inferTransition(shot, nextShot);
      timelineLines.push(transition);
      transitionNotes.push(`镜头${shot.shotNumber}→${nextShot.shotNumber}：${transition.trim()}`);
    }
  }

  sections.push(timelineLines.join(''));

  // ───── 4. 运镜总体说明（核心规范三补充）─────
  let cameraNotes = '';
  const allStatic = group.shots.every(s => s.shot.cameraMove === '固定(Static)');
  if (group.shots.length === 1) {
    cameraNotes = allStatic
      ? `全程${group.totalDuration.toFixed(0)}秒，镜头固定。`
      : `全程${group.totalDuration.toFixed(0)}秒，一镜到底。`;
  } else if (allStatic) {
    cameraNotes = `全程${group.totalDuration.toFixed(0)}秒，多镜头切换。`;
  } else {
    cameraNotes = `全程${group.totalDuration.toFixed(0)}秒，注意镜头之间自然衔接，保持运动流畅性。`;
  }
  sections.push('\n\n' + cameraNotes);

  const timelineScript = sections.join('').trim();
  const fullPromptCn = timelineScript;

  return {
    groupId: group.id,
    groupName: group.groupName,
    assets: assetsText || undefined,
    style: styleText,
    timelineScript,
    cameraNotes,
    transitionNotes: transitionNotes.length > 0 ? transitionNotes.join('\n') : undefined,
    fullPromptCn,
  };
}

/**
 * 批量生成所有分组的视频提示词
 */
export function generateAllVideoGroupPrompts(
  groups: VideoGroup[],
  style?: string
): VideoGroupPrompt[] {
  return groups.map(group => generateVideoGroupPrompt(group, style));
}

/**
 * 获取分组的缩略图URL（使用第一个镜头的图片）
 */
export function getGroupThumbnailUrl(group: VideoGroup): string | undefined {
  return group.shots[0]?.shot.storyboardGridUrl;
}

/**
 * 获取分组中所有镜头的网格位置信息
 * 用于生成分组拼图时参考
 */
export interface GridPosition {
  gridUrl: string;
  cellIndex: number;
}

export function getGroupGridPositions(group: VideoGroup): Map<string, GridPosition[]> {
  const positions = new Map<string, GridPosition[]>();

  for (const shotRange of group.shots) {
    const shot = shotRange.shot;
    if (shot.storyboardGridUrl && typeof shot.storyboardGridCellIndex === 'number') {
      const key = shot.storyboardGridUrl;
      if (!positions.has(key)) {
        positions.set(key, []);
      }
      positions.get(key)!.push({
        gridUrl: key,
        cellIndex: shot.storyboardGridCellIndex,
      });
    }
  }

  return positions;
}
