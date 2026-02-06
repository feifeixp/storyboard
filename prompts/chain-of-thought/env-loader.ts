/**
 * 环境变量加载器
 * 用于在 Node.js 环境中加载 .env.local 文件
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 加载 .env.local 文件
 */
export function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    
    // 解析环境变量
    envContent.split('\n').forEach(line => {
      line = line.trim();
      
      // 跳过空行和注释
      if (!line || line.startsWith('#')) {
        return;
      }
      
      // 解析 KEY=VALUE
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        
        // 移除引号
        const cleanValue = value.replace(/^["']|["']$/g, '');
        
        // 设置环境变量
        process.env[key] = cleanValue;
      }
    });
    
    console.log('✅ 环境变量加载成功');
    return true;
  } catch (error) {
    console.error('❌ 加载 .env.local 失败:', error);
    return false;
  }
}

/**
 * 获取 Gemini API Key
 */
export function getGeminiApiKey(): string {
  const apiKey = process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      '未找到 VITE_GEMINI_API_KEY 环境变量。\n' +
      '请确保 .env.local 文件存在，并包含：\n' +
      'VITE_GEMINI_API_KEY=your_api_key_here'
    );
  }

  return apiKey;
}

/**
 * 获取 OpenRouter API Key
 */
export function getOpenRouterApiKey(): string {
  const apiKey = process.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      '未找到 VITE_OPENROUTER_API_KEY 环境变量。\n' +
      '请确保 .env.local 文件存在，并包含：\n' +
      'VITE_OPENROUTER_API_KEY=your_api_key_here'
    );
  }

  return apiKey;
}

