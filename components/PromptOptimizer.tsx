/**
 * 提示词优化助手 - React组件
 * 
 * 功能：提供四种输入方式
 * 1. 快速输入（表单选择）
 * 2. 文本输入（智能分词）
 * 3. AI解析（复杂场景）
 * 4. 图像识别（上传参考图）
 * 
 * 创建时间：2024-12-30
 */

import React, { useState } from 'react';
import {
  SHOT_SIZE_OPTIONS,
  ANGLE_HEIGHT_OPTIONS,
  ANGLE_DIRECTION_OPTIONS,
  PERSPECTIVE_OPTIONS,
  LENS_TYPE_OPTIONS,
  LIGHTING_OPTIONS,
} from '../services/terminologyConstants';
import { optimizePrompt, PromptOptimizationResult } from '../services/promptOptimizer';

type InputMode = 'form' | 'text' | 'ai' | 'image';

export function PromptOptimizer() {
  const [inputMode, setInputMode] = useState<InputMode>('form');
  const [result, setResult] = useState<PromptOptimizationResult | null>(null);
  
  // 表单输入状态
  const [formData, setFormData] = useState({
    shotSize: '',
    angleHeight: '',
    angleDirection: '',
    perspective: '',
    lensType: '',
    lighting: '',
    description: '',
  });
  
  // 文本输入状态
  const [textInput, setTextInput] = useState('');
  
  // 处理表单提交
  const handleFormSubmit = async () => {
    const result = await optimizePrompt(formData);
    setResult(result);
  };
  
  // 处理文本提交
  const handleTextSubmit = async () => {
    const result = await optimizePrompt(textInput);
    setResult(result);
  };
  
  return (
    <div className="prompt-optimizer">
      <h2>提示词优化助手</h2>
      
      {/* 输入方式选择 */}
      <div className="input-mode-selector">
        <label>
          <input
            type="radio"
            value="form"
            checked={inputMode === 'form'}
            onChange={(e) => setInputMode(e.target.value as InputMode)}
          />
          快速输入
        </label>
        <label>
          <input
            type="radio"
            value="text"
            checked={inputMode === 'text'}
            onChange={(e) => setInputMode(e.target.value as InputMode)}
          />
          文本输入
        </label>
        <label>
          <input
            type="radio"
            value="ai"
            checked={inputMode === 'ai'}
            onChange={(e) => setInputMode(e.target.value as InputMode)}
          />
          AI解析
        </label>
        <label>
          <input
            type="radio"
            value="image"
            checked={inputMode === 'image'}
            onChange={(e) => setInputMode(e.target.value as InputMode)}
          />
          图像识别
        </label>
      </div>
      
      {/* 表单输入模式 */}
      {inputMode === 'form' && (
        <div className="form-input-mode">
          <h3>【快速输入模式】</h3>
          
          <div className="form-group">
            <label>景别：</label>
            <select
              value={formData.shotSize}
              onChange={(e) => setFormData({ ...formData, shotSize: e.target.value })}
            >
              <option value="">请选择</option>
              {SHOT_SIZE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} - {opt.description}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>角度高度：</label>
            <select
              value={formData.angleHeight}
              onChange={(e) => setFormData({ ...formData, angleHeight: e.target.value })}
            >
              <option value="">请选择</option>
              {ANGLE_HEIGHT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} - {opt.description}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>人物朝向：</label>
            <select
              value={formData.angleDirection}
              onChange={(e) => setFormData({ ...formData, angleDirection: e.target.value })}
            >
              <option value="">请选择</option>
              {ANGLE_DIRECTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} - {opt.description}
                </option>
              ))}
            </select>
          </div>
          
          <button onClick={handleFormSubmit}>生成提示词</button>
        </div>
      )}
      
      {/* 文本输入模式 */}
      {inputMode === 'text' && (
        <div className="text-input-mode">
          <h3>【文本输入模式】</h3>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="请输入画面描述，例如：中景，轻微俯拍，人物3/4正面"
            rows={5}
          />
          <button onClick={handleTextSubmit}>优化提示词</button>
        </div>
      )}
      
      {/* 结果展示 */}
      {result && (
        <div className="result-display">
          <h3>优化结果</h3>
          <div className="result-item">
            <strong>中文提示词：</strong>
            <p>{result.chinesePrompt}</p>
          </div>
          <div className="result-item">
            <strong>置信度：</strong>
            <p>{(result.confidence * 100).toFixed(0)}%</p>
          </div>
          <div className="result-item">
            <strong>处理方式：</strong>
            <p>{result.method}</p>
          </div>
        </div>
      )}
    </div>
  );
}

