/**
 * 角色补充思维链 - 主流程控制
 * 参考分镜思维链架构
 */

import type { CharacterRef } from '../../types';
import type { ScriptFile } from '../../types/project';
import type { MissingField } from '../characterCompleteness';
import type {
  Stage1ScriptAnalysis,
  Stage2VisualTags,
  Stage3AppearanceDesign,
  Stage4CostumeDesign,
  SupplementResult,
  SupplementOptions,
  SupplementMode,
  BeautyLevel,
  SupplementCacheContext
} from './types';

import { getLLMChatCompletionsURL } from '../openrouter';
import { buildStage1Prompt } from './stage1-script-analysis-optimized';  // 🆕 使用优化版
import { buildStage2Prompt } from './stage2-visual-tags-optimized';  // 🆕 详细模式使用优化版
import { buildStage2PromptFast } from './stage2-visual-tags-fast';  // 🆕 快速模式
import { buildStage3Prompt } from './stage3-appearance-design-optimized';  // 🆕 详细模式使用优化版
import { buildStage3PromptFast } from './stage3-appearance-design-fast';  // 🆕 快速模式
import { buildStage4Prompt } from './stage4-costume-design-optimized';  // 🆕 详细模式使用优化版
import { buildStage4PromptFast } from './stage4-costume-design-fast';  // 🆕 快速模式
import { buildStage5Prompt, type Stage5Output } from './stage5-character-facts';  // 🆕 阶段5：角色事实补充
import { extractJSON, validateRequiredFields, mergeStageResults, validateChainOfThought } from './utils';  // 🆕 导入验证函数
import { addCharacterHistory, extractStage3Info, extractStage4Info } from './historyManager';  // 🆕 导入历史记录管理
import { getCachedResult, setCachedResult } from './cache';  // 🆕 导入缓存机制
import { extractCharacterStates, refineCharacterForms, extractFormSummaries } from './extractCharacterStates';  // 🆕 导入状态提取功能、形态清洗功能和轻量形态摘要扫描功能
import { evaluateFormSemantics } from './evaluateFormSemantics';  // 🆕 导入形态语义评估功能
import { isBaselineStateName } from '../utils/stateNameUtils';  // 🆕 导入 baseline 判断工具

const DEFAULT_MODEL = 'gemini-2.5-flash';  // 🆕 统一使用Gemini 2.5 Flash

function hasStructuredAppearance(appearance?: string): boolean {
  return !!appearance && appearance.includes('【主体人物】') && appearance.includes('【外貌特征】');
}

function hasStructuredCostume(appearance?: string): boolean {
  return !!appearance && appearance.includes('【服饰造型】');
}

function extractCostumeText(appearance: string): string | null {
  const marker = '【服饰造型】';
  const idx = appearance.indexOf(marker);
  if (idx < 0) return null;
  return appearance.slice(idx + marker.length).trim();
}

/**
 * S2 加权评分：选择最重要的形态
 *
 * 评分规则（优先级从高到低）：
 * 1. 基础分：出现集数总数 * W1（权重10）
 * 2. 视觉冲击加权：命中关键词加 W2（权重5）
 * 3. 信息量：描述长度 * W3（权重0.01）
 * 4. 兜底 T2-b：覆盖跨度（max-min）越大越优先
 *
 * 显式排除：baseline 状态（常规状态（完好））永不选为最重要形态
 */
function selectMostImportantFormS2(forms: any[]): any | null {
  // 关键词集合（默认集合）
  const HIGH_IMPACT_KEYWORDS = ['濒死', '垂死', '重伤', '残缺', '断臂', '断腿', '血染', '战损', '奄奄一息'];
  const FORM_CHANGE_KEYWORDS = ['变身', '化形', '异化', '魔化', '觉醒', '暴走', '黑化'];
  const LOW_IMPACT_KEYWORDS = ['轻伤', '虚弱', '疲惫'];

  // 权重配置
  const W1 = 10;   // 出现集数权重
  const W2 = 5;    // 视觉冲击关键词权重
  const W3 = 0.01; // 描述长度权重

  // 过滤掉 baseline 状态
  const candidateForms = forms.filter(f => !isBaselineStateName(f.name));

  if (candidateForms.length === 0) {
    console.log('[S2评分] 过滤后无候选形态（全是baseline）');
    return null;
  }

  // 计算每个形态的得分
  const scored = candidateForms.map(form => {
    const episodes = form.appearsInEpisodes || [];
    const episodeCount = episodes.length;
    const description = form.description || '';
    const name = form.name || '';

    // 基础分：出现集数
    let score = episodeCount * W1;

    // 视觉冲击加权
    let impactBonus = 0;
    if (HIGH_IMPACT_KEYWORDS.some(kw => name.includes(kw) || description.includes(kw))) {
      impactBonus += W2 * 2; // 高冲击关键词双倍加权
    } else if (FORM_CHANGE_KEYWORDS.some(kw => name.includes(kw) || description.includes(kw))) {
      impactBonus += W2 * 1.5; // 形态变化关键词1.5倍加权
    } else if (LOW_IMPACT_KEYWORDS.some(kw => name.includes(kw) || description.includes(kw))) {
      impactBonus += W2 * 0.5; // 低冲击关键词0.5倍加权
    }
    score += impactBonus;

    // 信息量：描述长度
    score += description.length * W3;

    // 兜底 T2-b：覆盖跨度（用于最终排序，不直接加分）
    const span = episodes.length > 0 ? Math.max(...episodes) - Math.min(...episodes) : 0;

    return {
      form,
      score,
      episodeCount,
      impactBonus,
      descLength: description.length,
      span,
      debugInfo: `${name} | 集数:${episodeCount} | 冲击:+${impactBonus.toFixed(1)} | 描述:${description.length}字 | 跨度:${span} | 总分:${score.toFixed(2)}`
    };
  });

  // 排序：分数 > 跨度（T2-b）
  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.01) {
      return b.score - a.score; // 分数高优先
    }
    return b.span - a.span; // 分数相同时，跨度大优先（T2-b）
  });

  // 输出调试信息
  console.log('[S2评分] 形态评分结果（前3名）:');
  scored.slice(0, 3).forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.debugInfo}`);
  });

  return scored[0]?.form || null;
}

function stripCostumeSection(appearance: string): string {
  return (appearance || '').replace(/【服饰造型】[\s\S]*$/g, '').trimEnd();
}

function mergeCostumeSection(baseAppearance: string, costumeText: string): string {
  const base = stripCostumeSection(baseAppearance);
  const sep = base.endsWith('\n') || base.length === 0 ? '' : '\n';
  return `${base}${sep}【服饰造型】${costumeText}`;
}

/**
 * 🆕 A3: 校验 Stage4 输出（配饰拆字段 + props 禁止）
 */
function validateStage4Output(stage4: Stage4CostumeDesign): void {
  const finalDesc = stage4.finalDescription || '';
  const headwear = (stage4 as any).headwear || '';
  const jewelry = (stage4 as any).jewelry || '';
  const props = (stage4 as any).props;

  // 1. 检查 props 字段必须为空字符串
  if (props !== '' && props !== undefined) {
    console.warn('⚠️ [Stage4校验] props 字段应为空字符串，当前值:', props);
  }

  // 2. 检查 headwear 不包含禁止项（武器/法宝/包）
  const forbiddenInHeadwear = ['武器', '法宝', '包', '剑', '刀', '枪', '法器', '宝物', '背包', '挎包'];
  for (const forbidden of forbiddenInHeadwear) {
    if (headwear.includes(forbidden)) {
      console.warn(`⚠️ [Stage4校验] headwear 不应包含"${forbidden}"，当前值:`, headwear);
    }
  }

  // 3. 检查 jewelry 不包含禁止项
  const forbiddenInJewelry = ['武器', '法宝', '包', '剑', '刀', '枪', '法器', '宝物', '背包', '挎包'];
  for (const forbidden of forbiddenInJewelry) {
    if (jewelry.includes(forbidden)) {
      console.warn(`⚠️ [Stage4校验] jewelry 不应包含"${forbidden}"，当前值:`, jewelry);
    }
  }

  // 4. 检查 finalDescription 不包含禁止项
  const forbiddenInFinal = ['武器', '法宝', '背包', '挎包', '长剑', '宝剑', '法器'];
  for (const forbidden of forbiddenInFinal) {
    if (finalDesc.includes(forbidden)) {
      console.warn(`⚠️ [Stage4校验] finalDescription 不应包含"${forbidden}"，这些应在后续场景/道具阶段提取`);
    }
  }

  // 🆕 修改F：检查全同色系（仅告警，不重跑）
  const colorFamilies = [
    { name: '绿色系', keywords: ['绿', '墨绿', '碧绿', '翡翠绿', '深绿', '暗绿'] },
    { name: '紫色系', keywords: ['紫', '淡紫', '深紫', '紫罗兰'] },
    { name: '蓝色系', keywords: ['蓝', '霜蓝', '深蓝', '藏青', '靛蓝'] },
    { name: '红色系', keywords: ['红', '暗红', '朱红', '绯红', '酒红'] },
    { name: '黑色系', keywords: ['黑', '玄色', '墨色'] },
  ];

  for (const family of colorFamilies) {
    const layers = ['【内层】', '【中层】', '【外层】', '【鞋靴】'];
    const matchedLayers: string[] = [];

    for (const layer of layers) {
      if (finalDesc.includes(layer)) {
        const layerContent = finalDesc.split(layer)[1]?.split('【')[0] || '';
        if (family.keywords.some(keyword => layerContent.includes(keyword))) {
          matchedLayers.push(layer);
        }
      }
    }

    // 如果3层以上都是同一色系，发出警告
    if (matchedLayers.length >= 3) {
      console.warn(`⚠️ [Stage4校验] 检测到全同色系配色（${family.name}）：${matchedLayers.join('、')} 都使用了${family.name}，建议内层/鞋靴使用中性色以形成层次`);
      console.warn(`   当前 finalDescription:`, finalDesc);
    }
  }
}

function mergeCachedCharacterFields(
  base: CharacterRef,
  cached: CharacterRef,
  requestedFields: string[]
): CharacterRef | null {
  // ✅ 校验缓存是否真的包含我们需要的目标字段，否则宁愿继续走 LLM
  if (requestedFields.includes('appearance')) {
    if (!hasStructuredAppearance(cached.appearance)) return null;
  }
  if (requestedFields.includes('costume')) {
    if (!hasStructuredCostume(cached.appearance)) return null;
  }

  const merged: CharacterRef = { ...base };

  for (const field of requestedFields) {
    if (field === 'appearance') {
      // appearance 只覆盖“主体人物/外貌特征”段；若不需要 costume，则尽量保留 base 的 costume 段
      const cachedText = cached.appearance || '';
      const baseCostume = base.appearance && hasStructuredCostume(base.appearance)
        ? extractCostumeText(base.appearance)
        : null;

      let nextAppearance = stripCostumeSection(cachedText);

      if (!requestedFields.includes('costume') && baseCostume) {
        nextAppearance = mergeCostumeSection(nextAppearance, baseCostume);
      }

      merged.appearance = nextAppearance;
      continue;
    }

    if (field === 'costume') {
      const costumeText = cached.appearance ? extractCostumeText(cached.appearance) : null;
      if (!costumeText) return null;

      if (typeof merged.appearance === 'string' && merged.appearance.trim().length > 0) {
        merged.appearance = mergeCostumeSection(merged.appearance, costumeText);
      } else if (cached.appearance && hasStructuredAppearance(cached.appearance)) {
        // 极端情况下 base.appearance 为空：用缓存的完整结构兜底
        merged.appearance = cached.appearance;
      } else {
        return null;
      }
      continue;
    }

    // 其他字段：仅在缓存确实有值时合并（字段级，不做整包覆盖）
    const cachedValue = (cached as any)[field];
    if (cachedValue !== undefined) {
      (merged as any)[field] = cachedValue;
    }
  }

  return merged;
}

/**
 * 进度回调函数类型
 * 🆕 修改B：改为返回 Promise<void>，支持 await
 */
export type ProgressCallback = (stage: string, step: string, content?: string) => Promise<void> | void;

/**
 * 主函数：补充角色详细信息
 * 🆕 支持快速模式和美型程度选择
 * 🔧 支持外部传入 abortSignal 以支持并发处理
 */
export async function supplementCharacterDetails(
  character: CharacterRef,
  missingFields: MissingField[],
  scripts: ScriptFile[],
  options: SupplementOptions = { mode: 'detailed', beautyLevel: 'balanced' },
  model: string = DEFAULT_MODEL,
  onProgress?: ProgressCallback,
  abortSignal?: AbortSignal,  // 🔧 新增:外部传入的中断信号
  cacheContext?: SupplementCacheContext,
  onStageComplete?: (characterId: string, characterName: string, stage: 'stage3' | 'stage4' | 'stage5' | 'stage5.5', result: Partial<CharacterRef>) => Promise<void> | void // 🆕 修改1：分段回调（stage5.5=forms即时更新）
): Promise<CharacterRef> {

  const { mode, beautyLevel } = options;

  // 🆕 检查缓存（字段级合并 + 结构化校验）
  const rawFieldNames = missingFields.map(f => f.field);
  const fieldNames = Array.from(new Set(rawFieldNames));

  // 🔧 兜底：如果 appearance 不结构化但请求了 costume，则强制补 appearance（避免“只补服装但外貌仍是剧本文字”）
  const hasPlaceholder = !!character.appearance && (
    character.appearance.includes('默认形态见forms数组') ||
    character.appearance.includes('见forms数组') ||
    character.appearance.includes('参见forms') ||
    character.appearance.includes('【服饰造型】默认形态')
  );

  const effectiveFields = [...fieldNames];
  // 互锁规则1：请求了 costume 但 appearance 不是结构化 → 强制补 appearance
  if (effectiveFields.includes('costume') && !hasStructuredAppearance(character.appearance)) {
    if (!effectiveFields.includes('appearance')) effectiveFields.push('appearance');
  }
  // 🔧 互锁规则2：请求了 appearance（Stage3）→ 必须同时请求 costume（Stage4）
  // 原因：Stage3 只生成【主体人物】【外貌特征】，Stage4 才生成【服饰造型】。
  // 当 appearance 完全为空时，characterCompleteness 原本只把 'appearance' 加入缺失列表，
  // 导致手动触发时 costume 不在 effectiveFields 里，Stage4 被跳过，【服饰造型】永远缺失。
  if (effectiveFields.includes('appearance') && !effectiveFields.includes('costume')) {
    if (!hasStructuredCostume(character.appearance)) {
      effectiveFields.push('costume');
      console.log('🔧 [互锁] appearance 在 effectiveFields 中，自动补充 costume（Stage3+Stage4 强绑定）');
    }
  }
  if (hasPlaceholder) {
    if (!effectiveFields.includes('appearance')) effectiveFields.push('appearance');
    if (!effectiveFields.includes('costume')) effectiveFields.push('costume');
  }

  const cached = getCachedResult(character.name, effectiveFields, cacheContext);
  if (cached) {
    const merged = mergeCachedCharacterFields(character, cached, effectiveFields);
    if (merged) {
      console.log('✅ 使用缓存结果（字段级合并），跳过LLM调用');
      await onProgress?.('cache', '使用缓存结果（字段级合并）'); // 🆕 修改B：await
      return merged;
    }
    console.log('⚠️ 缓存命中但校验失败，继续走LLM调用');
  }

  try {
    // 🆕 分析需要生成哪些字段
    let needAppearance = effectiveFields.includes('appearance');
    let needCostume = effectiveFields.includes('costume');
    const needQuote = effectiveFields.includes('quote');
    const needAbilities = effectiveFields.includes('abilities');
    const needIdentityEvolution = effectiveFields.includes('identityEvolution');
    const needForms = effectiveFields.includes('forms');
    const needStage5 = needQuote || needAbilities || needIdentityEvolution || needForms;

    // 🆕 检查appearance是否包含占位符（如果包含，需要重新生成）
    if (!needAppearance && character.appearance) {
      const hasPlaceholder = character.appearance.includes('默认形态见forms数组') ||
                            character.appearance.includes('见forms数组') ||
                            character.appearance.includes('参见forms') ||
                            character.appearance.includes('【服饰造型】默认形态');
      if (hasPlaceholder) {
        console.log('⚠️ [增量补充] 检测到appearance包含占位符，需要重新生成');
        needAppearance = true;
        needCostume = true; // 占位符通常出现在服饰部分，也需要重新生成服装
      }
    }

    console.log('🎯 [增量补充] 需要生成的字段:', { needAppearance, needCostume, needStage5, fieldNames: effectiveFields });

    // 阶段1: 剧本分析（总是需要执行，为后续阶段提供上下文）
    await onProgress?.('stage1', 'start', '🔍 阶段1: 剧本分析'); // 🆕 修改B：await
    const stage1Result = await executeStage1(character, scripts, missingFields, model, async (step: string, content: string) => {
      await onProgress?.('stage1', step, content); // 🆕 修改B：await
    }, abortSignal);

    // 🆕 显示Stage1判断结果（调试输出）
    const scriptTypeInfo = `剧本类型: ${stage1Result.scriptType.category} | 题材: ${stage1Result.scriptType.genre}`;
    await onProgress?.('stage1', 'complete', `✅ 阶段1完成 - ${scriptTypeInfo}`); // 🆕 修改B：await

    // 阶段2: 视觉标签设计（总是需要执行，为Stage3和Stage4提供设计方向）
    await onProgress?.('stage2', 'start', `🎨 阶段2: 视觉标签设计 (${mode === 'fast' ? '快速模式' : '详细模式'})`); // 🆕 修改B：await
    const stage2Result = await executeStage2(stage1Result, model, mode, beautyLevel, async (step: string, content: string) => {
      await onProgress?.('stage2', step, content); // 🆕 修改B：await
    }, abortSignal);
    await onProgress?.('stage2', 'complete', '✅ 阶段2完成'); // 🆕 修改B：await

    // 🆕 阶段3: 外貌描述创作（只在需要appearance时执行）
    let stage3Result: Stage3AppearanceDesign | null = null;
    if (needAppearance) {
      await onProgress?.('stage3', 'start', `👤 阶段3: 外貌描述创作 (${mode === 'fast' ? '快速模式' : '详细模式'})`); // 🆕 修改B：await
      stage3Result = await executeStage3(stage1Result, stage2Result, model, mode, beautyLevel, async (step: string, content: string) => {
        await onProgress?.('stage3', step, content); // 🆕 修改B：await
      }, abortSignal);
      await onProgress?.('stage3', 'complete', '✅ 阶段3完成'); // 🆕 修改B：await

      // 🆕 修改1：Stage3 完成后立即回调
      if (stage3Result && onStageComplete) {
        // 🔧 修复：传结构化文本（含【主体人物】和【外貌特征】标记）
        // 旧代码传 facialFeatures（无标记），UI 骨架屏的 appearance.includes('【主体人物】') 判定永远失败
        const mainCharacterInfo = stage3Result.finalDescription.mainCharacter || '';
        const facialFeatures = stage3Result.finalDescription.facialFeatures || '';
        const structuredStage3Appearance = `【主体人物】${mainCharacterInfo}\n【外貌特征】${facialFeatures}`;
        await onStageComplete(character.id, character.name, 'stage3', {
          appearance: structuredStage3Appearance
        });
      }
    } else {
      console.log('⏭️ [增量补充] 跳过阶段3（外貌描述），使用已有数据');
      await onProgress?.('stage3', 'skip', '⏭️ 跳过阶段3（已有外貌描述）'); // 🆕 修改B：await
    }

    // 🆕 阶段4: 服装设计（只在需要costume时执行）
    let stage4Result: Stage4CostumeDesign | null = null;
    if (needCostume) {
      await onProgress?.('stage4', 'start', `👗 阶段4: 服装设计 (${mode === 'fast' ? '快速模式' : '详细模式'})`); // 🆕 修改B：await

      // 🔧 如果跳过了阶段3，需要从角色的appearance字段构造stage3Result
      let stage3ForStage4 = stage3Result;
      if (!stage3ForStage4 && character.appearance) {
        console.log('🔧 [增量补充] 阶段3被跳过，从角色appearance构造stage3数据供阶段4使用');
        stage3ForStage4 = {
          finalDescription: {
            mainCharacter: `${character.gender || '未知'},${character.ageGroup || '未知'}`,
            facialFeatures: character.appearance
          }
        } as Stage3AppearanceDesign;
      }

      stage4Result = await executeStage4(stage1Result, stage2Result, stage3ForStage4, model, mode, beautyLevel, async (step: string, content: string) => {
        await onProgress?.('stage4', step, content); // 🆕 修改B：await
      }, abortSignal);

      // 🆕 A3: 校验 Stage4 输出（配饰拆字段 + props 禁止）
      if (stage4Result) {
        validateStage4Output(stage4Result);
      }

      await onProgress?.('stage4', 'complete', '✅ 阶段4完成'); // 🆕 修改B：await

      // 🆕 修改1：Stage4 完成后立即回调（需要合并外貌和服装）
      if (stage4Result && onStageComplete) {
        // 🔧 修复1：finalDescription 直接是 string，不是 { finalDescription: string }
        // 旧代码 finalDescription?.finalDescription 始终为 undefined，costumeText 始终为 ''
        const costumeText = (stage4Result.finalDescription as string) || '';

        // 🔧 修复2：用 Stage3 结构化文本作为基底（含【主体人物】和【外貌特征】）
        // 旧代码用 facialFeatures（无标记），mergeCostumeSection 输出缺少前两段
        let baseAppearance: string;
        if (stage3Result) {
          const mainCharacterInfo = stage3Result.finalDescription.mainCharacter || '';
          const facialFeatures = stage3Result.finalDescription.facialFeatures || '';
          baseAppearance = `【主体人物】${mainCharacterInfo}\n【外貌特征】${facialFeatures}`;
        } else {
          // Stage3 被跳过（角色已有外观），使用已有 appearance 作为基底
          baseAppearance = character.appearance || '';
        }

        const mergedAppearance = mergeCostumeSection(baseAppearance, costumeText);
        await onStageComplete(character.id, character.name, 'stage4', {
          appearance: mergedAppearance
        });
      }
    } else {
      console.log('⏭️ [增量补充] 跳过阶段4（服装设计），使用已有数据');
      await onProgress?.('stage4', 'skip', '⏭️ 跳过阶段4（已有服装描述）'); // 🆕 修改B：await
    }

    // 🆕 阶段5: 角色事实补充（只在需要quote/abilities/identityEvolution时执行）
    // ⚠️ forms 不再通过 Stage5 生成，而是通过 extractCharacterStates 提取
    let stage5Result: Stage5Output | null = null;
    const needStage5WithoutForms = needQuote || needAbilities || needIdentityEvolution;
    if (needStage5WithoutForms) {
      await onProgress?.('stage5', 'start', '📚 阶段5: 角色事实补充（quote/abilities/identityEvolution）');

      // 获取剧本内容
      const scriptContent = scripts.map(s => s.content).join('\n\n---\n\n');
      const stage5MissingFields = effectiveFields.filter(f => ['quote', 'abilities', 'identityEvolution'].includes(f));

      stage5Result = await executeStage5(stage1Result, character.name, scriptContent, stage5MissingFields, model, async (step: string, content: string) => {
        await onProgress?.('stage5', step, content);
      }, abortSignal);
      await onProgress?.('stage5', 'complete', '✅ 阶段5完成');
    } else {
      console.log('⏭️ [增量补充] 跳过阶段5（角色事实补充），无需补充quote/abilities/identityEvolution');
      await onProgress?.('stage5', 'skip', '⏭️ 跳过阶段5（无需补充角色事实）');
    }

    // 🔄 阶段5.5: Phase 1 轻量形态扫描（只在需要forms时执行）
    // 三阶段渐进式设计：Phase1=自动轻量扫描（本阶段），Phase2=用户审查，Phase3=按需详细生成
    if (needForms) {
      await onProgress?.('stage5.5', 'start', '🔍 阶段5.5: Phase 1 轻量形态扫描');

      // 🆕 将 Stage 1 提取的时间线阶段传递给 Phase 1，实现"一次提取，全局复用"
      const formSummaries = await extractFormSummaries(character, scripts, model, stage1Result.timelinePhases);
      console.log(`[Phase 1] 识别到 ${formSummaries.length} 个外观变化形态（不限数量，由用户在 Phase 2 决定生成哪些）`);

      // 将 formSummaries 存入 stage5Result，供后续 mergeResults 合并
      if (!stage5Result) {
        stage5Result = { formSummaries };
      } else {
        stage5Result.formSummaries = formSummaries;
      }

      // Stage5.5 完成后立即触发回调，UI 可即时展示形态清单供用户审查
      if (onStageComplete && formSummaries.length > 0) {
        await onStageComplete(character.id, character.name, 'stage5.5', { formSummaries });
      }

      await onProgress?.('stage5.5', 'complete', `✅ 阶段5.5完成，识别到 ${formSummaries.length} 个形态`);
    }

    // 🆕 合并结果（只合并需要的字段）
    await onProgress?.('merge', 'start', '🔄 正在合并结果...'); // 🆕 修改B：await
    const finalResult = mergeResults(character, stage1Result, stage2Result, stage3Result, stage4Result, stage5Result, needAppearance, needCostume);
    await onProgress?.('merge', 'complete', '✅ 全部完成！'); // 🆕 修改B：await

    // 🆕 保存到缓存
    setCachedResult(character.name, effectiveFields, finalResult, cacheContext);

    return finalResult;

  } catch (error) {
    // 🆕 如果是用户中断，返回原始角色
    if (error.name === 'AbortError') {
      console.log('⏹️ 用户中断生成，返回原始角色');
      onProgress?.('abort', '用户中断生成');
      return character;
    }

    console.error('[角色补充] 执行失败:', error);
    throw error;
  }
}

/**
 * 执行阶段1: 剧本分析
 * 🔧 支持外部传入 abortSignal
 */
async function executeStage1(
  character: CharacterRef,
  scripts: ScriptFile[],
  missingFields: MissingField[],
  model: string,
  onProgress: (step: string, content: string) => void,
  abortSignal?: AbortSignal  // 🔧 新增
): Promise<Stage1ScriptAnalysis> {

  const prompt = buildStage1Prompt(character, scripts, missingFields);
  const content = await callLLMWithStreaming(prompt, model, onProgress, [
    { marker: '【Step 1.1 执行中】', step: 'step1_1', message: '📋 正在分析时代背景...' },
    { marker: '【Step 1.2 执行中】', step: 'step1_2', message: '🎭 正在分析角色行为...' },
    { marker: '【Step 1.3 执行中】', step: 'step1_3', message: '🎯 正在分析角色定位...' },
    { marker: '【Step 1.4 执行中】', step: 'step1_4', message: '📊 正在分析剧本类型...' },
    { marker: '【Step 1.5 执行中】', step: 'step1_5', message: '🎬 正在判断场景...' },
    { marker: '【Step 1.6 执行中】', step: 'step1_6', message: '🎨 正在判断美学风格...' },
    { marker: '【Step 1.7 执行中】', step: 'step1_7', message: '🌤️ 正在判断季节...' },
    { marker: '【Step 1.9 执行中】', step: 'step1_9', message: '🕰️ 正在分析角色时间线...' },
    { marker: '【最终输出】', step: 'final', message: '📝 正在生成最终结果...' }
  ], 2, abortSignal);

  const result = extractJSON(content, '最终输出');

  // 验证必需字段（age是可选的，因为CharacterRef中只有ageGroup）
  validateRequiredFields(result, [
    'basicInfo.era',
    'basicInfo.gender',
    // 'basicInfo.age', // 🔧 移除：CharacterRef中没有age字段，只有ageGroup
    'behaviorAnalysis.personalityTraits',
    'characterPosition.role',
    'characterPosition.socialClass',
    'scriptType.category',
    // 🆕 P1新增字段
    'sceneInfo.mainScene',
    // 🔧 aestheticStyle.style 暂时移除（提示词中未要求输出）
    // 'aestheticStyle.style',
    'seasonInfo.season'
  ], '阶段1');

  return result;
}

/**
 * 执行阶段2: 视觉标签设计
 * 🆕 支持快速模式和美型程度
 * 🔧 支持外部传入 abortSignal
 */
async function executeStage2(
  stage1: Stage1ScriptAnalysis,
  model: string,
  mode: SupplementMode,
  beautyLevel: BeautyLevel,
  onProgress: (step: string, content: string) => void,
  abortSignal?: AbortSignal  // 🔧 新增
): Promise<Stage2VisualTags> {

  // 🆕 根据模式选择提示词
  const prompt = mode === 'fast'
    ? buildStage2PromptFast(stage1, beautyLevel)
    : buildStage2Prompt(stage1, beautyLevel);

  // 🆕 快速模式不需要中间步骤
  const stepMarkers = mode === 'fast'
    ? [{ marker: '```json', step: 'final', message: '⚡ 快速生成中...' }]
    : [
        { marker: '【Step 2.1 执行中】', step: 'step2_1', message: '💡 正在理解角色与视觉定位...' },
        { marker: '【Step 2.2 执行中】', step: 'step2_2', message: '✨ 正在设计视觉标签...' },
        { marker: '【Step 2.3 执行中】', step: 'step2_3', message: '🔍 正在进行自我批判...' },
        { marker: '【最终输出】', step: 'final', message: '📝 正在生成最终结果...' }
      ];

  const content = await callLLMWithStreaming(prompt, model, onProgress, stepMarkers, 2, abortSignal);

  // 🔧 P0修复：将JSON提取+校验包进try/catch，optimized模式失败时自动降级到fast模式
  try {
    const result = extractJSON(content, '最终输出');

    // 🆕 调试: 输出实际提取的JSON结构
    console.log('[Stage2] 提取的JSON字段:', Object.keys(result));
    console.log('[Stage2] 完整JSON:', JSON.stringify(result, null, 2));

    // 🆕 根据模式验证不同的字段
    if (mode === 'fast') {
      // 快速模式只验证核心字段
      validateRequiredFields(result, ['visualTags'], '阶段2');
    } else {
      // 详细模式验证完整字段
      validateRequiredFields(result, [
        'positioning',
        'visualTags',
        'selfCritique'
      ], '阶段2');
    }

    return result;

  } catch (err) {
    if (mode !== 'fast') {
      // optimized/detailed 模式解析或校验失败 → 自动降级到 fast 模式重试
      // 常见原因：LLM只输出了Step 2.1/2.2的说明文字，没有给出【最终输出】JSON
      const reason = (err as Error).message?.slice(0, 120) ?? String(err);
      console.warn(`[Stage2] ⚠️ 优化版解析失败，自动降级到快速模式重试。原因: ${reason}`);
      onProgress('fallback', '⚠️ 深度模式解析失败，正在用快速模式重试...');
      // 递归调用自身，但强制使用 fast 模式；fast 模式失败则原样抛出，不再套娃
      return await executeStage2(stage1, model, 'fast', beautyLevel, onProgress, abortSignal);
    }
    // fast 模式下仍然失败，原样抛出，保持错误信号清晰
    throw err;
  }
}

/**
 * 执行阶段3: 外貌描述创作
 * 🆕 支持快速模式和美型程度
 * 🔧 支持外部传入 abortSignal
 */
async function executeStage3(
  stage1: Stage1ScriptAnalysis,
  stage2: Stage2VisualTags,
  model: string,
  mode: SupplementMode,
  beautyLevel: BeautyLevel,
  onProgress: (step: string, content: string) => void,
  abortSignal?: AbortSignal  // 🔧 新增
): Promise<Stage3AppearanceDesign> {

  // 🆕 根据模式选择提示词
  const prompt = mode === 'fast'
    ? buildStage3PromptFast(stage1, stage2, beautyLevel)
    : buildStage3Prompt(stage1, stage2, beautyLevel);

  // 🆕 快速模式不需要中间步骤
  const stepMarkers = mode === 'fast'
    ? [{ marker: '```json', step: 'final', message: '⚡ 快速生成中...' }]
    : [
        { marker: '【Step 3.1 执行中】', step: 'step3_1', message: '🎨 正在理解角色...' },
        { marker: '【Step 3.2 执行中】', step: 'step3_2', message: '📏 正在定位视觉风格...' },
        { marker: '【Step 3.3 执行中】', step: 'step3_3', message: '✍️ 正在设计外貌特征...' },
        { marker: '【Step 3.4 执行中】', step: 'step3_4', message: '🔍 正在进行自我批判...' },
        { marker: '【最终输出】', step: 'final', message: '📝 正在生成最终结果...' }
      ];

  const content = await callLLMWithStreaming(prompt, model, onProgress, stepMarkers, 2, abortSignal);

  // 🆕 验证思维链完整性
  const validation = validateChainOfThought(
    content,
    stepMarkers.map(m => m.marker),
    '阶段3'
  );

  if (!validation.isValid) {
    console.error('[阶段3] ❌ 思维链不完整!', validation);
    // 不抛出错误,继续尝试提取结果,但记录警告
  }

  const result = extractJSON(content, '最终输出');

  // 🆕 调试: 输出实际提取的JSON结构
  console.log('[Stage3] 提取的JSON字段:', Object.keys(result));
  console.log('[Stage3] 完整JSON:', JSON.stringify(result, null, 2));

  // 🆕 根据模式验证不同的字段
  if (mode === 'fast') {
    // 快速模式只验证核心字段 (makeupDesign是可选的,不强制验证)
    validateRequiredFields(result, [
      'hairDesign',
      'eyesDesign',
      'facialDesign',
      'finalDescription.mainCharacter',
      'finalDescription.facialFeatures'
    ], '阶段3');
  } else {
    // 🔧 修复Bug A：Optimized模式只验证核心输出字段（finalDescription.*）
    // 原因：LLM在optimized模式下可能用step3_1等步骤名代替roleUnderstanding等语义字段
    // 解决方案：放弃验证中间步骤字段，只强制要求最终输出的finalDescription
    validateRequiredFields(result, [
      'finalDescription.mainCharacter',
      'finalDescription.facialFeatures'
    ], '阶段3');
  }

  return result;
}

/**
 * 执行阶段4: 服装设计
 * 🆕 支持快速模式和美型程度
 * 🔧 stage3可以为null（当跳过阶段3时）
 * 🔧 支持外部传入 abortSignal
 */
async function executeStage4(
  stage1: Stage1ScriptAnalysis,
  stage2: Stage2VisualTags,
  stage3: Stage3AppearanceDesign | null,
  model: string,
  mode: SupplementMode,
  beautyLevel: BeautyLevel,
  onProgress: (step: string, content: string) => void,
  abortSignal?: AbortSignal  // 🔧 新增
): Promise<Stage4CostumeDesign> {

  // 🔧 如果stage3为null，抛出错误（不应该发生，因为调用前已经构造了stage3）
  if (!stage3) {
    throw new Error('[Stage4] stage3不能为null，请在调用前构造stage3数据');
  }

  // 🆕 根据模式选择提示词
  const prompt = mode === 'fast'
    ? buildStage4PromptFast(stage1, stage2, stage3, beautyLevel)
    : buildStage4Prompt(stage1, stage2, stage3, beautyLevel);

	// 🆕 快速模式不需要中间步骤；详细模式只跟踪关键节点（设计思考、风格定位、最终输出）
	const stepMarkers = mode === 'fast'
	  ? [{ marker: '```json', step: 'final', message: '⚡ 快速生成中...' }]
	  : [
	      { marker: '【Step 4.1 执行中】', step: 'step4_1', message: '📋 正在理解时代和身份...' },
	      { marker: '【Step 4.2 执行中】', step: 'step4_2', message: '🎯 正在定位服装风格...' },
	      { marker: '【最终输出】', step: 'final', message: '📝 正在生成最终结果...' }
	    ];

  const content = await callLLMWithStreaming(prompt, model, onProgress, stepMarkers, 2, abortSignal);

  const result = extractJSON(content, '最终输出');

  // 🆕 调试: 输出实际提取的JSON结构
  console.log('[Stage4] 提取的JSON字段:', Object.keys(result));
  console.log('[Stage4] 完整JSON:', JSON.stringify(result, null, 2));

  // 🔧 验证核心字段（fast 和 detailed 模式的 optimized Prompt 均输出相同格式）
  // detailed 模式使用 stage4-costume-design-optimized.ts，输出字段为 thinking/top/bottom/accessories/finalDescription
  validateRequiredFields(result, [
    'top',
    'bottom',
    'finalDescription'
  ], '阶段4');

  return result;
}

/**
 * 执行阶段5: 角色事实补充
 * 从剧本中抽取/生成 quote、abilities、identityEvolution、forms
 * 🔧 支持外部传入 abortSignal
 */
async function executeStage5(
  stage1: Stage1ScriptAnalysis,
  characterName: string,
  scriptContent: string,
  missingFields: string[],
  model: string,
  onProgress: (step: string, content: string) => void,
  abortSignal?: AbortSignal
): Promise<Stage5Output> {

  const prompt = buildStage5Prompt(stage1, characterName, scriptContent, missingFields);

  // Stage5 直接输出JSON，不需要中间步骤
  const stepMarkers = [
    { marker: '```json', step: 'final', message: '📚 正在从剧本中抽取角色事实...' }
  ];

  const content = await callLLMWithStreaming(prompt, model, onProgress, stepMarkers, 2, abortSignal);

  const result = extractJSON(content, '最终输出');

  console.log('[Stage5] 提取的JSON字段:', Object.keys(result));
  console.log('[Stage5] 完整JSON:', JSON.stringify(result, null, 2));

  // 验证字段（根据 missingFields 动态验证）
  // 注意：这些字段都是可选的（可能为null），所以不强制验证

  return result as Stage5Output;
}

/**
 * 🆕 辅助函数：延迟执行
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 🆕 调用LLM并支持流式输出（带重试机制）
 * 优化: 添加详细日志,帮助诊断问题
 * 优化: 添加JSON解析错误重试机制
 * 🔧 支持外部传入 abortSignal
 */
async function callLLMWithStreaming(
  prompt: string,
  model: string,
  onProgress: (step: string, content: string) => void,
  stepMarkers: Array<{ marker: string; step: string; message: string }>,
  maxRetries: number = 2,
  abortSignal?: AbortSignal  // 🔧 新增:外部传入的中断信号
): Promise<string> {

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callLLMWithStreamingInternal(prompt, model, onProgress, stepMarkers, abortSignal);

      // 成功返回
      if (attempt > 1) {
        console.log(`✅ 重试成功 (第${attempt}次尝试)`);
      }
      return result;

    } catch (error) {
      lastError = error as Error;

      // 如果是API错误（402余额不足、401认证失败），不重试
      if (error.message.includes('402') || error.message.includes('401')) {
        throw error;
      }

      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        console.error(`❌ 重试失败，已达到最大重试次数 (${maxRetries})`);
        throw error;
      }

      // 递增延迟重试
      const delay = 1000 * attempt;
      console.warn(`⚠️ 调用失败，${delay}ms后重试 (${attempt}/${maxRetries})...`);
      console.warn(`错误信息: ${error.message}`);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * 调用LLM并支持流式输出（内部实现）
 * 🔧 支持外部传入 abortSignal
 */
async function callLLMWithStreamingInternal(
  prompt: string,
  model: string,
  onProgress: (step: string, content: string) => void,
  stepMarkers: Array<{ marker: string; step: string; message: string }>,
  abortSignal?: AbortSignal  // 🔧 新增:外部传入的中断信号
): Promise<string> {

  const startTime = Date.now();
  console.log('[思维链] 开始调用LLM...', { model, promptLength: prompt.length });

  const apiKey = import.meta.env.VITE_OPENROUTER1_API_KEY;
  if (!apiKey) {
    throw new Error('未设置OpenRouter API密钥 (VITE_OPENROUTER1_API_KEY)');
  }

  const response = await fetch(getLLMChatCompletionsURL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'AI Director'
    },
    signal: abortSignal,  // 🔧 使用传入的中断信号
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: 0.9,  // 🆕 从0.7提升到0.9,增加多样性和随机性
      max_tokens: 8000  // 🆕 增加到8000,确保JSON能完整输出
    })
  });

  if (!response.ok) {
    if (response.status === 402) {
      throw new Error('API余额不足，请检查OpenRouter账户余额');
    }
    if (response.status === 401) {
      throw new Error('API Key无效，请检查VITE_OPENROUTER1_API_KEY配置');
    }
    throw new Error(`LLM调用失败: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法获取响应流');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let detectedSteps = new Set<string>();  // 🆕 记录已检测到的步骤

  console.log('[思维链] 开始接收流式响应...');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim() !== '');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          fullContent += content;

          // 🆕 检测步骤标记 - 修复重复检测问题
          for (const { marker, step, message } of stepMarkers) {
            // 只有当步骤未被检测过时才触发
            if (fullContent.includes(marker) && !detectedSteps.has(step)) {
              detectedSteps.add(step);
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
              console.log(`[思维链] 检测到步骤: ${marker} (耗时: ${elapsed}s)`);
              onProgress(step, message);
              break;
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('[思维链] 接收完成', {
    totalTime: `${totalTime}s`,
    contentLength: fullContent.length,
    detectedSteps: Array.from(detectedSteps)
  });

  // 🆕 验证是否检测到所有步骤
  const expectedSteps = stepMarkers.map(m => m.step);
  const missingSteps = expectedSteps.filter(s => !detectedSteps.has(s));
  if (missingSteps.length > 0) {
    console.warn('[思维链] ⚠️ 警告: 未检测到以下步骤:', missingSteps);
    console.warn('[思维链] 响应内容预览:', fullContent.substring(0, 500));
  }

  return fullContent;
}

/**
 * 🆕 合并所有阶段的结果（增量合并）
 * @param needAppearance 是否需要更新appearance字段
 * @param needCostume 是否需要更新costume字段
 */
function mergeResults(
  character: CharacterRef,
  stage1: Stage1ScriptAnalysis,
  stage2: Stage2VisualTags,
  stage3: Stage3AppearanceDesign | null,
  stage4: Stage4CostumeDesign | null,
  stage5: Stage5Output | null,
  needAppearance: boolean = true,
  needCostume: boolean = true
): CharacterRef {

  // 🆕 根据需要生成的字段，合并结果
  let newAppearance = character.appearance || '';
  console.log('[mergeResults] 🔍 开始合并，初始 appearance 长度:', newAppearance.length);

  // 如果需要appearance且stage3有结果，生成新的appearance
  if (needAppearance && stage3) {
    const mainCharacter = stage3.finalDescription.mainCharacter;
    const facialFeatures = stage3.finalDescription.facialFeatures;
    newAppearance = `【主体人物】${mainCharacter}\n【外貌特征】${facialFeatures}`;
    console.log('[mergeResults] ✅ Stage3 已拼接，当前 appearance 长度:', newAppearance.length);
    console.log('[mergeResults] 📝 Stage3 内容预览:', newAppearance.substring(0, 100) + '...');

    // 如果不需要costume，保留原有的costume部分
    if (!needCostume && character.appearance) {
      const costumeMatch = character.appearance.match(/【服饰造型】(.+)/s);
      if (costumeMatch) {
        newAppearance += `\n【服饰造型】${costumeMatch[1]}`;
        console.log('[mergeResults] ✅ 保留了原有【服饰造型】');
      }
    }
  }

  // 如果需要costume且stage4有结果，生成新的costume
  if (needCostume && stage4) {
    const newCostume = stage4.finalDescription;
    console.log('[mergeResults] 🎨 Stage4 服装内容长度:', newCostume.length);
    console.log('[mergeResults] 📝 Stage4 内容预览:', newCostume.substring(0, 100) + '...');

    // 如果需要appearance，将costume合并到appearance中
    if (needAppearance && stage3) {
      console.log('[mergeResults] 🔧 执行拼接：needAppearance && stage3');
      const beforeLength = newAppearance.length;
      newAppearance += `\n【服饰造型】\n${newCostume}`;  // 🆕 修改：强制换行
      console.log('[mergeResults] ✅ 拼接完成，长度从', beforeLength, '增加到', newAppearance.length);
      console.log('[mergeResults] 📝 拼接后内容预览:', newAppearance.substring(newAppearance.length - 200));
    } else if (!needAppearance && character.appearance) {
      console.log('[mergeResults] 🔧 执行替换：!needAppearance && character.appearance');
      // 🔧 修复：如果不需要appearance，只更新costume部分
      if (/【服饰造型】/.test(character.appearance)) {
        // 已有【服饰造型】：替换它
        newAppearance = character.appearance.replace(/【服饰造型】[\s\S]*/s, `【服饰造型】\n${newCostume}`);
        console.log('[mergeResults] ✅ 替换了已有【服饰造型】');
      } else {
        // 没有【服饰造型】：追加它
        newAppearance = `${character.appearance}\n【服饰造型】\n${newCostume}`;
        console.log('[mergeResults] ✅ 追加了【服饰造型】');
      }
    } else if (!needAppearance && !character.appearance) {
      console.log('[mergeResults] 🔧 执行创建：!needAppearance && !character.appearance');
      // 🔧 修复：如果没有appearance，创建新的
      newAppearance = `【服饰造型】\n${newCostume}`;
      console.log('[mergeResults] ✅ 创建了新的【服饰造型】');
    }
  }

  console.log('[mergeResults] 🎯 最终 appearance 长度:', newAppearance.length);
  console.log('[mergeResults] 📝 最终内容是否包含【服饰造型】:', /【服饰造型】/.test(newAppearance));
  if (/【服饰造型】/.test(newAppearance)) {
    const costumeIndex = newAppearance.indexOf('【服饰造型】');
    console.log('[mergeResults] 📝 【服饰造型】位置:', costumeIndex, '后续内容长度:', newAppearance.length - costumeIndex);
  }

  // 🆕 保存到历史记录（只在生成了新内容时保存）
  if ((needAppearance && stage3) || (needCostume && stage4)) {
    try {
      const stage3Info = stage3 ? extractStage3Info(stage3) : {
        faceShape: '',
        hairStyle: '',
        hairColor: '',
        lipColor: ''
      };
      const stage4Info = stage4 ? extractStage4Info(stage4) : {
        topClothing: '',
        topColor: '',
        bottomClothing: '',
        bottomColor: ''
      };

      addCharacterHistory({
        characterName: character.name,
        era: stage1.basicInfo.era,
        faceShape: stage3Info.faceShape,
        hairStyle: stage3Info.hairStyle,
        hairColor: stage3Info.hairColor,
        topClothing: stage4Info.topClothing,
        topColor: stage4Info.topColor,
        bottomClothing: stage4Info.bottomClothing,
        bottomColor: stage4Info.bottomColor,
        lipColor: stage3Info.lipColor,
        timestamp: Date.now()
      });

      console.log('[历史记录] ✅ 已保存角色:', character.name);
    } catch (error) {
      console.error('[历史记录] ❌ 保存失败:', error);
    }
  }

  // 🔧 增量合并逻辑：只更新需要的字段

  // 🆕 处理 Stage5 的数组字段（去重合并）
  let mergedAbilities = character.abilities || [];
  if (stage5?.abilities) {
    // 合并并去重（基于内容）
    const allAbilities = [...mergedAbilities, ...stage5.abilities];
    mergedAbilities = Array.from(new Set(allAbilities));
  }

  let mergedForms = character.forms || [];
  if (stage5?.forms) {
    // 合并并去重（基于name）
    const existingFormNames = new Set(mergedForms.map(f => f.name));
    const newForms = stage5.forms.filter(f => !existingFormNames.has(f.name));
    mergedForms = [...mergedForms, ...newForms];
  }

  // 🆕 Phase 1 轻量形态摘要：合并去重（基于name）
  let mergedFormSummaries = character.formSummaries || [];
  if (stage5?.formSummaries && stage5.formSummaries.length > 0) {
    const existingNames = new Set(mergedFormSummaries.map(f => (f as { name: string }).name));
    const newSummaries = stage5.formSummaries.filter(f => !existingNames.has(f.name));
    mergedFormSummaries = [...mergedFormSummaries, ...newSummaries];
  }

  const result = {
    ...character,  // 保留所有已有字段

    // 🆕 外观描述：根据needAppearance和needCostume决定是否更新
    appearance: newAppearance,

    // 🆕 数组字段：合并Stage5结果并去重
    forms: mergedForms,
    abilities: mergedAbilities,

    // 🆕 Phase 1 形态摘要：合并 Stage5.5 轻量扫描结果
    formSummaries: mergedFormSummaries.length > 0 ? mergedFormSummaries : undefined,

    // 🆕 字符串字段：优先使用Stage5结果，否则保留已有内容
    quote: stage5?.quote || character.quote || undefined,
    identityEvolution: stage5?.identityEvolution || character.identityEvolution || undefined,

    // 🆕 角色定位：始终以阶段1的 characterPosition.role 为准，便于后续主角识别/评分
    role: stage1.characterPosition?.role || (character as any).role,

    // 🆕 结构化外貌配置：Stage3 新输出，向后兼容（有新结果优先用，否则保留已有）
    appearanceConfig: (needAppearance && stage3?.appearanceConfig)
      ? stage3.appearanceConfig
      : character.appearanceConfig,

    // 🆕 结构化服装配置：Stage4 新输出，向后兼容（有新结果优先用，否则保留已有）
    costumeConfig: (needCostume && stage4?.costumeConfig)
      ? stage4.costumeConfig
      : character.costumeConfig,
  };

  console.log('[mergeResults] 🎯 返回结果 appearance 长度:', result.appearance.length);
  console.log('[mergeResults] 📝 返回结果是否包含【服饰造型】:', /【服饰造型】/.test(result.appearance));

  return result;
}

// 🆕 导出状态提取功能（供UI调用）
export { extractCharacterStates };
export { generateFormDetail } from './generateFormDetail';

// 🆕 导出 Phase 1 轻量形态摘要扫描功能（供UI调用）
export { extractFormSummaries };
export type { FormSummary, FormGenerationStatus } from './types';

// 🆕 导出状态外观生成功能（阶段3）
export { generateStateAppearance, generateStatesAppearance } from './generateStateAppearance';

// 🆕 导出质量评分功能（阶段P1）
export { evaluateQuality } from './qualityEvaluation';
export type { QualityReport } from './qualityEvaluation';

// 🆕 导出智能自动补充功能（方案C）
export { autoSupplementMainCharacters } from './autoSupplement';
export type { AutoSupplementProgress, AutoSupplementOptions } from './autoSupplement';

// 🆕 导出主要角色识别功能
export { identifyMainCharacters, needsSupplement, getMissingFields } from './identifyMainCharacters';

// 🆕 导出智能历史记录注入功能（P1优化）
export { getSmartHistoryPrompt, formatHistoryForPrompt } from './smartHistoryInjection';
export type { CharacterHistory, HistoryOptions } from './smartHistoryInjection';
