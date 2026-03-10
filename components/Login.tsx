/**
 * 用户登录页面组件
 */

import React, { useState } from 'react';
import {
  sendVerificationCode,
  login,
  validateContact,
  validateCode,
} from '../services/auth';

interface LoginProps {
  onLoginSuccess?: () => void;
}

export default function Login(props: LoginProps) {
  const { onLoginSuccess } = props;

  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 发送验证码
  const handleSendCode = async () => {
    setError('');

    // 验证联系方式
    const validation = validateContact(contact);
    if (!validation.isValid) {
      setError(validation.error || '联系方式格式错误');
      return;
    }

    setLoading(true);

    try {
      await sendVerificationCode(contact);

      // 开始倒计时（60秒）
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      alert('验证码已发送，请查收');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  // 登录
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证联系方式
    const contactValidation = validateContact(contact);
    if (!contactValidation.isValid) {
      setError(contactValidation.error || '联系方式格式错误');
      return;
    }

    // 验证验证码
    const codeValidation = validateCode(code);
    if (!codeValidation.isValid) {
      setError(codeValidation.error || '验证码格式错误');
      return;
    }

    setLoading(true);

    try {
      await login(contact, code, invitationCode || undefined);
      // 🆕 登录成功后调用回调
      if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        // 如果没有回调，刷新页面（兼容旧代码）
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
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
      <div className="relative glass-card rounded-2xl p-8 w-full max-w-md shadow-2xl border border-white/10">
        {/* Logo和标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-3xl">🎬</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            NeoAI - 导演助手
          </h1>
          <p className="text-sm text-gray-300">
            AI驱动的分镜脚本生成系统
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {/* 联系方式输入 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-200">
              手机号 / 邮箱
            </label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="请输入手机号或邮箱"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all"
              required
            />
          </div>

          {/* 验证码输入 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-200">
              验证码
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="请输入6位验证码"
                maxLength={6}
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all"
                required
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={countdown > 0 || loading || !contact}
                className="px-5 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap shadow-lg"
              >
                {countdown > 0 ? `${countdown}秒` : '发送验证码'}
              </button>
            </div>
          </div>

          {/* 邀请码输入（可选） */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-200">
              邀请码（可选）
            </label>
            <input
              type="text"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              placeholder="如有邀请码请输入"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mt-6"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>登录中...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>登录</span>
              </>
            )}
          </button>
        </form>

        {/* 底部提示 */}
        <div className="mt-6 text-center text-xs text-gray-400">
          <p>登录即表示您同意我们的服务条款和隐私政策</p>
        </div>
      </div>
    </div>
  );
}

