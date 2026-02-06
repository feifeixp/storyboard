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
    <div style={styles.container}>
      <div style={styles.loginBox}>
        <h1 style={styles.title}>Visionary Storyboard Studio</h1>
        <p style={styles.subtitle}>AI驱动的分镜脚本生成系统</p>

        <form onSubmit={handleLogin} style={styles.form}>
          {/* 联系方式输入 */}
          <div style={styles.formGroup}>
            <label style={styles.label}>手机号 / 邮箱</label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="请输入手机号或邮箱"
              style={styles.input}
              required
            />
          </div>

          {/* 验证码输入 */}
          <div style={styles.formGroup}>
            <label style={styles.label}>验证码</label>
            <div style={styles.codeInputGroup}>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="请输入6位验证码"
                maxLength={6}
                style={{ ...styles.input, flex: 1 }}
                required
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={countdown > 0 || loading || !contact}
                style={{
                  ...styles.codeButton,
                  opacity: countdown > 0 || loading || !contact ? 0.5 : 1,
                }}
              >
                {countdown > 0 ? `${countdown}秒后重试` : '发送验证码'}
              </button>
            </div>
          </div>

          {/* 邀请码输入（可选） */}
          <div style={styles.formGroup}>
            <label style={styles.label}>邀请码（可选）</label>
            <input
              type="text"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              placeholder="如有邀请码请输入"
              style={styles.input}
            />
          </div>

          {/* 错误提示 */}
          {error && <div style={styles.error}>{error}</div>}

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.loginButton,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}

// 样式定义
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  loginBox: {
    background: 'white',
    borderRadius: '12px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '8px',
    color: '#333',
  },
  subtitle: {
    fontSize: '14px',
    textAlign: 'center',
    color: '#666',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  input: {
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    outline: 'none',
  },
  codeInputGroup: {
    display: 'flex',
    gap: '8px',
  },
  codeButton: {
    padding: '12px 16px',
    fontSize: '14px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  error: {
    padding: '12px',
    background: '#fee',
    color: '#c33',
    borderRadius: '6px',
    fontSize: '14px',
  },
  loginButton: {
    padding: '14px',
    fontSize: '16px',
    fontWeight: '500',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '8px',
  },
};

