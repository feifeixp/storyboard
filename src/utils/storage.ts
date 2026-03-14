// localStorage 持久化 Key
export const STORAGE_KEYS = {
  CURRENT_STEP: 'storyboard_current_step',
  CURRENT_EPISODE_NUMBER: 'storyboard_current_episode_number',
  SCRIPT: 'storyboard_script',
  SHOTS: 'storyboard_shots',
  CHARACTER_REFS: 'storyboard_character_refs',
  CHAT_HISTORY: 'storyboard_chat_history',
  SELECTED_STYLE: 'storyboard_selected_style',
  CUSTOM_STYLE_PROMPT: 'storyboard_custom_style_prompt',
  HQ_URLS: 'storyboard_hq_urls',
  // 思维链状态
  COT_STAGE1: 'storyboard_cot_stage1',
  COT_STAGE2: 'storyboard_cot_stage2',
  COT_STAGE3: 'storyboard_cot_stage3',
  COT_STAGE4: 'storyboard_cot_stage4',
  COT_STAGE5: 'storyboard_cot_stage5',
  // 剧本清洗状态
  CLEANING_RESULT: 'storyboard_cleaning_result',
  CLEANING_PROGRESS: 'storyboard_cleaning_progress',
};

// 从 localStorage 安全读取数据
export const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn(`[localStorage] 读取失败: ${key}`, e);
  }
  return defaultValue;
};

// 保存到 localStorage
export const saveToStorage = (key: string, value: any) => {
  try {
    const jsonString = JSON.stringify(value);

    // 检查数据大小（localStorage 限制通常为 5-10MB）
    const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);

    if (sizeInMB > 5) {
      console.warn(`[localStorage] 数据过大 (${sizeInMB.toFixed(2)}MB)，跳过保存: ${key}`);
      console.warn(`[localStorage] 建议：不要将大量图片数据存储到 localStorage`);
      return;
    }

    localStorage.setItem(key, jsonString);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn(`[localStorage] 存储空间不足，跳过保存: ${key}`);
      console.warn(`[localStorage] 建议：清理旧数据或使用 IndexedDB`);
    } else {
      console.warn(`[localStorage] 保存失败: ${key}`, e);
    }
  }
};
