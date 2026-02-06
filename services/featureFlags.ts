/**
 * 功能开关配置
 * 
 * 使用方法：
 * 1. 开发新功能时，添加对应的开关，默认关闭
 * 2. 在代码中使用 if (FEATURES.xxx) { 新代码 } else { 旧代码 }
 * 3. 测试通过后，将开关改为 true
 * 4. 稳定后，删除旧代码和开关
 */

// 从 localStorage 读取功能开关（允许运行时切换）
const getFlag = (key: string, defaultValue: boolean): boolean => {
  try {
    const stored = localStorage.getItem(`feature_${key}`);
    if (stored !== null) {
      return stored === 'true';
    }
  } catch (e) {
    // localStorage 不可用时使用默认值
  }
  return defaultValue;
};

// 设置功能开关
export const setFeatureFlag = (key: string, value: boolean): void => {
  try {
    localStorage.setItem(`feature_${key}`, String(value));
    console.log(`[FeatureFlag] ${key} = ${value}`);
  } catch (e) {
    console.warn('[FeatureFlag] 无法保存到 localStorage');
  }
};

/**
 * 功能开关列表
 * 
 * 命名规则：use_xxx_v2 表示新版本功能
 */
export const FEATURES = {
  // ═══════════════════════════════════════════════════════════════
  // 🟢 已稳定功能（默认开启）
  // ═══════════════════════════════════════════════════════════════
  
  /** 思维链生成模式 */
  USE_CHAIN_OF_THOUGHT: getFlag('USE_CHAIN_OF_THOUGHT', true),
  
  /** 项目管理功能 */
  USE_PROJECT_MANAGEMENT: getFlag('USE_PROJECT_MANAGEMENT', true),
  
  // ═══════════════════════════════════════════════════════════════
  // 🟡 实验性功能（默认关闭，测试中）
  // ═══════════════════════════════════════════════════════════════
  
  /** 新版状态管理（使用 Zustand） */
  USE_ZUSTAND_STORE: getFlag('USE_ZUSTAND_STORE', false),
  
  /** 新版分镜编辑器 */
  USE_NEW_SHOT_EDITOR: getFlag('USE_NEW_SHOT_EDITOR', false),
  
  /** 性能优化：虚拟滚动列表 */
  USE_VIRTUAL_LIST: getFlag('USE_VIRTUAL_LIST', false),
  
  /** 新版导出功能（支持 PDF） */
  USE_PDF_EXPORT: getFlag('USE_PDF_EXPORT', false),
  
  /** 调试模式：显示思维链原始输出 */
  DEBUG_SHOW_RAW_OUTPUT: getFlag('DEBUG_SHOW_RAW_OUTPUT', false),
  
  // ═══════════════════════════════════════════════════════════════
  // 🔴 开发中功能（请勿在生产环境开启）
  // ═══════════════════════════════════════════════════════════════
  
  /** 版本控制系统 */
  USE_VERSION_CONTROL: getFlag('USE_VERSION_CONTROL', false),
  
  /** 协作功能 */
  USE_COLLABORATION: getFlag('USE_COLLABORATION', false),
};

/**
 * 在控制台中切换功能开关
 * 
 * 使用方法（在浏览器控制台中）：
 * window.toggleFeature('USE_NEW_SHOT_EDITOR', true)
 */
if (typeof window !== 'undefined') {
  (window as any).toggleFeature = (key: string, value: boolean) => {
    setFeatureFlag(key, value);
    console.log(`✅ 功能开关已更新，请刷新页面生效`);
    console.log(`当前状态: ${key} = ${value}`);
  };
  
  (window as any).showFeatures = () => {
    console.table(FEATURES);
  };
  
  console.log('[FeatureFlags] 使用 window.showFeatures() 查看所有功能开关');
  console.log('[FeatureFlags] 使用 window.toggleFeature("xxx", true/false) 切换功能');
}

export default FEATURES;

