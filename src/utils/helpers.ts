import { ScriptCleaningResult } from '../../types';

/**
 * 将任意值规范化为字符串
 * 适用于 LLM 返回格式不稳定（对象、数组混入）的 string[] 字段
 */
export function _normalizeToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(_normalizeToString).filter(Boolean).join(' / ');
  }
  if (typeof value === 'object') {
    try {
      const vals = Object.values(value as object).filter(v => v != null && v !== '');
      return vals.length > 0 ? (vals as string[]).join(' / ') : JSON.stringify(value);
    } catch {
      return JSON.stringify(value);
    }
  }
  return String(value);
}

/** 将任意值规范化为 string[]，过滤空值 */
export function _normalizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return typeof arr === 'string' ? [arr] : [];
  return arr.map(_normalizeToString).filter(Boolean);
}

/**
 * 规范化清洗结果：确保所有 string[] 字段中的每个元素都是字符串
 * 防止不同模型返回对象/嵌套结构导致 React 渲染崩溃
 */
export function normalizeCleaningResult(result: ScriptCleaningResult): ScriptCleaningResult {
  return {
    ...result,
    cleanedScenes: (result.cleanedScenes || []).map(scene => ({
      ...scene,
      dialogues: _normalizeStringArray(scene.dialogues),
      uiElements: _normalizeStringArray(scene.uiElements),
      moodTags: _normalizeStringArray(scene.moodTags),
    })),
    audioEffects: _normalizeStringArray(result.audioEffects),
    musicCues: _normalizeStringArray(result.musicCues),
    timeCodes: _normalizeStringArray(result.timeCodes),
    cameraSuggestions: _normalizeStringArray(result.cameraSuggestions),
  };
}
