/**
 * 用户登录页面组件 - 使用 OAuth 2.0 授权码模式
 */

import React, { useEffect, useState } from 'react';
import {
  getOAuthLoginUrl,
  exchangeOAuthToken,
} from '../services/auth';

interface LoginProps {
  onLoginSuccess?: () => void;
}

export default function Login(props: LoginProps) {
  const { onLoginSuccess } = props;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // 检查 URL 是否包含 OAuth 回调参数
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code) {
      handleOAuthCallback(code, state);
    }
  }, []);

  const handleOAuthCallback = async (code: string, state: string | null) => {
    setLoading(true);
    setError('');

    const savedState = localStorage.getItem('oauth_state');
    if (savedState && state !== savedState) {
      setError('安全验证失败：State 不匹配，可能存在 CSRF 风险');
      setLoading(false);
      return;
    }

    try {
      const redirectUri = window.location.origin + window.location.pathname;
      await exchangeOAuthToken(code, redirectUri);
      
      // 清除 URL 中的参数
      window.history.replaceState({}, document.title, window.location.pathname);
      
      if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
      window.history.replaceState({}, document.title, window.location.pathname);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginClick = async () => {
    setLoading(true);
    setError('');

    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const state = Date.now().toString();
      localStorage.setItem('oauth_state', state);

      const loginUrl = await getOAuthLoginUrl(redirectUri, state);
      window.location.href = loginUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取登录地址失败，请重试');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
      </div>

      {/* 登录卡片 */}
      <div className="relative glass-card rounded-2xl p-8 w-full max-w-md shadow-2xl border border-white/10 text-center">
        {/* Logo和标题 */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl mb-6 shadow-xl shadow-purple-500/20">
            <span className="text-4xl">🎬</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            NeoAI - 导演助手
          </h1>
          <p className="text-gray-300">
            AI驱动的分镜脚本生成系统
          </p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-start gap-3 text-left">
            <span className="text-lg">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* 登录按钮 */}
        <button
          onClick={handleLoginClick}
          disabled={loading}
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-purple-500/30 flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>正在跳转...</span>
            </>
          ) : (
            <>
              <span className="text-xl">✨</span>
              <span>NeoDomain 统一登录</span>
            </>
          )}
        </button>

        {/* 底部提示 */}
        <div className="mt-8 text-xs text-gray-400">
          <p>登录即表示您同意我们的服务条款和隐私政策</p>
        </div>
      </div>
    </div>
  );
}

