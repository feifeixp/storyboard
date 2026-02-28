/**
 * 角色外观实时预览组件
 * 在生成过程中实时显示角色外观描述
 */

import React from 'react';
// 🆕 材质词汇映射工具（用于UI展示中文化）
import { replaceEnglishMaterialTerms } from '../utils/materialVocabularyMapper';

interface CharacterPreviewProps {
  characterName: string;
  appearance?: string;
  costume?: string;
  hair?: string;
  makeup?: string;
  isGenerating: boolean;
  currentStage?: string;
}

export const CharacterPreview: React.FC<CharacterPreviewProps> = ({
  characterName,
  appearance,
  costume,
  hair,
  makeup,
  isGenerating,
  currentStage
}) => {
  
  // 解析外观描述中的各个部分
  const parsedAppearance = appearance ? parseAppearance(appearance) : null;
  
  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
          🎨 {characterName} - 外观预览
        </h3>
        {isGenerating && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-pulse"></div>
            <span className="text-xs text-[var(--color-text-secondary)]">{currentStage || '生成中...'}</span>
          </div>
        )}
      </div>
      
      {/* 预览内容 */}
      {parsedAppearance ? (
        <div className="space-y-2">
          {/* 主体人物 */}
          {parsedAppearance.mainCharacter && (
            <PreviewSection
              title="主体人物"
              content={parsedAppearance.mainCharacter}
              icon="👤"
            />
          )}
          
          {/* 外貌特征 */}
          {parsedAppearance.facialFeatures && (
            <PreviewSection
              title="外貌特征"
              content={parsedAppearance.facialFeatures}
              icon="✨"
            />
          )}
          
          {/* 服饰造型 */}
          {parsedAppearance.costume && (
            <PreviewSection
              title="服饰造型"
              content={parsedAppearance.costume}
              icon="👔"
            />
          )}
          
          {/* 发型设计 */}
          {hair && (
            <PreviewSection
              title="发型设计"
              content={hair}
              icon="💇"
            />
          )}
          
          {/* 妆容设计 */}
          {makeup && (
            <PreviewSection
              title="妆容设计"
              content={makeup}
              icon="💄"
            />
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-[var(--color-text-tertiary)] text-sm">
          {isGenerating ? '⏳ 正在生成外观描述...' : '暂无预览内容'}
        </div>
      )}
    </div>
  );
};

/**
 * 预览区块组件
 */
const PreviewSection: React.FC<{
  title: string;
  content: string;
  icon: string;
}> = ({ title, content, icon }) => {
  return (
    <div className="bg-[var(--color-surface)]/50 rounded-lg p-3 border border-[var(--color-border)]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-bold text-[var(--color-text-secondary)]">{title}</span>
      </div>
      <p className="text-xs text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
};

/**
 * 解析外观描述
 */
function parseAppearance(appearance: string): {
  mainCharacter?: string;
  facialFeatures?: string;
  costume?: string;
} | null {
  if (!appearance) return null;

  const result: any = {};

  // 🔧 修复：使用"顶层标签"方式提取，避免【服饰造型】被【内层】截断
  const topLevelTags = ['主体人物', '外貌特征', '服饰造型'];
  const topLevelSections: Record<string, string> = {};

  for (let i = 0; i < topLevelTags.length; i++) {
    const currentTag = topLevelTags[i];
    const currentPattern = `【${currentTag}】`;
    const startIdx = appearance.indexOf(currentPattern);

    if (startIdx === -1) continue;

    // 找到下一个顶层标签的位置
    let endIdx = appearance.length;
    for (let j = i + 1; j < topLevelTags.length; j++) {
      const nextPattern = `【${topLevelTags[j]}】`;
      const nextIdx = appearance.indexOf(nextPattern, startIdx + currentPattern.length);
      if (nextIdx !== -1) {
        endIdx = nextIdx;
        break;
      }
    }

    const content = appearance.slice(startIdx + currentPattern.length, endIdx).trim();
    topLevelSections[currentTag] = content;
  }

  // 映射到返回结果
  if (topLevelSections['主体人物']) {
    result.mainCharacter = replaceEnglishMaterialTerms(topLevelSections['主体人物']);
  }
  if (topLevelSections['外貌特征']) {
    result.facialFeatures = replaceEnglishMaterialTerms(topLevelSections['外貌特征']);
  }
  if (topLevelSections['服饰造型']) {
    result.costume = replaceEnglishMaterialTerms(topLevelSections['服饰造型']);
  }

  return Object.keys(result).length > 0 ? result : null;
}

