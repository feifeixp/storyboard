/**
 * 自动补充主要角色
 * 在项目创建后自动为主要角色生成详细描述
 */

import type { CharacterRef } from '../../types';
import type { ScriptFile } from '../../types/project';
import type { SupplementOptions } from './types';
import { identifyMainCharacters, needsSupplement, getMissingFields } from './identifyMainCharacters';
import { supplementCharacterDetails } from './index';
import { generateScriptHash } from './cache';

export interface AutoSupplementProgress {
  total: number; // 总角色数
  current: number; // 当前处理的角色索引（1-based）
  characterName: string; // 当前角色名称
  stage: string; // 当前阶段
  status: 'processing' | 'completed' | 'error';
  message: string;
}

export interface AutoSupplementOptions extends SupplementOptions {
  /**
   * 可选：项目ID（用于补全缓存强隔离）
   * 不传则不启用缓存（保持兼容且更保守）。
   */
  projectId?: string;
  maxCharacters?: number; // 最多补充几个角色
  minAppearances?: number; // 最少出场次数
  /**
   * 🆕 固定的主角ID列表
   * 如果传入，则不使用 identifyMainCharacters 自动识别，而是直接使用这个列表
   * 这样可以尊重用户在向导中勾选的主角
   */
  fixedMainCharacterIds?: string[];
  onProgress?: (progress: AutoSupplementProgress) => Promise<void> | void; // 🆕 修改B：支持 async
  onStageComplete?: (characterId: string, characterName: string, stage: 'stage3' | 'stage4' | 'stage5' | 'stage5.5', result: Partial<CharacterRef>) => Promise<void> | void; // 🆕 修改1：分段回调（stage5.5=forms即时更新）
  abortSignal?: AbortSignal;
}

/**
 * 自动补充主要角色
 */
export async function autoSupplementMainCharacters(
  characters: CharacterRef[],
  scripts: ScriptFile[],
  options: AutoSupplementOptions = { mode: 'fast', beautyLevel: 'balanced' }
): Promise<CharacterRef[]> {
  
  const {
    projectId,
    maxCharacters = 5,
    minAppearances = 3,
    mode = 'fast',
    beautyLevel = 'balanced',
    fixedMainCharacterIds,  // 🆕 新增：固定的主角ID列表
    onProgress,
    onStageComplete, // 🆕 修改1：分段回调
    abortSignal
  } = options;

  // 🆕 计算脚本 hash（用于缓存隔离/失效）
  const scriptHash = generateScriptHash(scripts);

  console.log('[自动补充] 开始识别主要角色...');

  // 1. 识别主要角色
  // 🆕 如果传入了 fixedMainCharacterIds，则直接使用，不再自动识别
  const mainCharacters = fixedMainCharacterIds
    ? characters.filter(c => fixedMainCharacterIds.includes(c.id))
    : identifyMainCharacters(characters, {
        minAppearances,
        maxCount: maxCharacters
      });

  if (fixedMainCharacterIds) {
    console.log(`[自动补充] 使用用户指定的主角列表（${fixedMainCharacterIds.length} 个）`);
  }

  if (mainCharacters.length === 0) {
    console.log('[自动补充] 没有找到需要补充的主要角色');
    return characters;
  }
  
  // 2. 过滤出需要补充的角色
  const needsSupplementChars = mainCharacters.filter(needsSupplement);
  
  if (needsSupplementChars.length === 0) {
    console.log('[自动补充] 所有主要角色都已有完整描述');
    return characters;
  }
  
  console.log(`[自动补充] 将补充 ${needsSupplementChars.length} 个主要角色`);

  // 3. 批量补充（使用并发控制）
  const updatedCharacters = [...characters];
  const concurrency = 2; // 🆕 降低并发：从 3 → 2（减少竞态条件）
  
  for (let i = 0; i < needsSupplementChars.length; i += concurrency) {
    // 检查是否被取消
    if (abortSignal?.aborted) {
      console.log('[自动补充] 用户取消了自动补充');
      break;
    }
    
    const batch = needsSupplementChars.slice(i, i + concurrency);
    
    // 并发处理当前批次
    const batchPromises = batch.map(async (char, batchIndex) => {
      const currentIndex = i + batchIndex + 1;
      
      try {
        // 报告进度
        await onProgress?.({ // 🆕 修改B：await
          total: needsSupplementChars.length,
          current: currentIndex,
          characterName: char.name,
          stage: 'start',
          status: 'processing',
          message: `正在补充角色 ${currentIndex}/${needsSupplementChars.length}: ${char.name}`
        });

        // 获取缺失字段
        const missingFields = getMissingFields(char);

        // 补充角色
        const cacheContext = projectId
          ? {
            projectId,
            characterId: char.id,
            scriptHash,
            mode,
            beautyLevel,
          }
          : undefined;

        const updatedChar = await supplementCharacterDetails(
          char,
          missingFields,
          scripts,
          { mode, beautyLevel },
          undefined,
          async (stage, step, content) => { // 🆕 修改B：async
            await onProgress?.({ // 🆕 修改B：await
              total: needsSupplementChars.length,
              current: currentIndex,
              characterName: char.name,
              stage,
              status: 'processing',
              message: content
            });
          },
          abortSignal,  // 🔧 传入中断信号
          cacheContext,
          onStageComplete // 🆕 修改1：传递分段回调
        );

        // 更新角色列表
        const charIndex = updatedCharacters.findIndex(c => c.id === char.id);
        if (charIndex !== -1) {
          console.log(`[自动补充] 🔍 更新前 appearance 长度:`, updatedCharacters[charIndex].appearance?.length || 0);
          console.log(`[自动补充] 🔍 更新前是否包含【服饰造型】:`, /【服饰造型】/.test(updatedCharacters[charIndex].appearance || ''));

          updatedCharacters[charIndex] = updatedChar;

          console.log(`[自动补充] ✅ 更新后 appearance 长度:`, updatedCharacters[charIndex].appearance?.length || 0);
          console.log(`[自动补充] ✅ 更新后是否包含【服饰造型】:`, /【服饰造型】/.test(updatedCharacters[charIndex].appearance || ''));
          console.log(`[自动补充] 📝 更新后 appearance 预览:`, updatedCharacters[charIndex].appearance?.substring(0, 200) + '...');
        }

        // 报告完成
        await onProgress?.({ // 🆕 修改B：await
          total: needsSupplementChars.length,
          current: currentIndex,
          characterName: char.name,
          stage: 'complete',
          status: 'completed',
          message: `✅ ${char.name} 补充完成`
        });

        return updatedChar;

      } catch (error) {
        console.error(`[自动补充] 角色 ${char.name} 补充失败:`, error);

        await onProgress?.({ // 🆕 修改B：await
          total: needsSupplementChars.length,
          current: currentIndex,
          characterName: char.name,
          stage: 'error',
          status: 'error',
          message: `❌ ${char.name} 补充失败: ${error instanceof Error ? error.message : '未知错误'}`
        });

        return char; // 返回原始角色
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  console.log('[自动补充] 完成');
  return updatedCharacters;
}

