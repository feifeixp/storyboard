import React, { useState } from 'react';
import { ScriptCleaningResult } from '../../types';
import { cleanScriptStream } from '../../services/openrouter';

/**
 * 剧本管理 Hook
 * 负责剧本的上传、清洗等功能
 */
export function useScriptManagement(analysisModel: string) {
  const [script, setScript] = useState('');
  const [cleaningResult, setCleaningResult] = useState<ScriptCleaningResult | null>(null);
  const [cleaningProgress, setCleaningProgress] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);

  /**
   * 处理剧本文件上传
   */
  const handleScriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setScript(text);
      };
      reader.readAsText(file);
    }
  };

  /**
   * 开始清洗剧本
   */
  const startScriptCleaning = async () => {
    if (!script.trim()) {
      alert("请输入脚本内容");
      return;
    }

    setCleaningResult(null);
    setCleaningProgress('');
    setIsCleaning(true);

    try {
      const stream = cleanScriptStream(script, analysisModel);
      let lastText = '';
      
      for await (const text of stream) {
        lastText = text;
        setCleaningProgress(text);
      }

      // 解析最终结果
      try {
        const jsonMatch = lastText.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : lastText;
        const result = JSON.parse(jsonStr) as ScriptCleaningResult;
        
        setCleaningResult(result);
        setCleaningProgress('✅ 清洗完成！');
      } catch (parseError) {
        console.error('[剧本清洗] JSON解析失败:', parseError);
        console.log('[剧本清洗] 原始输出:', lastText);
        
        // 尝试提取部分结果
        try {
          const partialMatch = lastText.match(/\{[\s\S]*"cleanedScenes"[\s\S]*\}/);
          if (partialMatch) {
            const result = JSON.parse(partialMatch[0]) as ScriptCleaningResult;
            setCleaningResult(result);
            setCleaningProgress('⚠️ 清洗完成（部分结果）');
          } else {
            throw new Error('无法提取有效结果');
          }
        } catch (fallbackError) {
          alert('清洗结果解析失败，请重试');
          setCleaningProgress('❌ 解析失败');
        }
      }
    } catch (error) {
      console.error(error);
      alert("清洗中断，请检查网络");
      setCleaningProgress('❌ 清洗失败');
    } finally {
      setIsCleaning(false);
    }
  };

  /**
   * 重置清洗结果
   */
  const resetCleaning = () => {
    setCleaningResult(null);
    setCleaningProgress('');
  };

  return {
    // 状态
    script,
    cleaningResult,
    cleaningProgress,
    isCleaning,
    
    // 方法
    setScript,
    handleScriptUpload,
    startScriptCleaning,
    resetCleaning,
  };
}

