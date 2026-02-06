/**
 * 用户认证服务
 * 🆕 使用 Cloudflare D1 认证系统
 */

// 🆕 使用 D1 API
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://storyboard-api.feifeixp.workers.dev';

// 用户信息接口
export interface UserInfo {
  authorization: string;
  userId: string;
  email: string;
  mobile: string;
  nickname: string;
  avatar: string;
  status: number;
}

// API响应接口
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  errCode: string | null;
  errMessage: string | null;
}

/**
 * 发送验证码（统一接口，支持手机号和邮箱）
 */
export async function sendVerificationCode(contact: string): Promise<void> {
  // 🆕 判断是手机号还是邮箱
  const validation = validateContact(contact);
  const body = validation.type === 'mobile'
    ? { phone: contact }
    : { email: contact };

  const response = await fetch(`${API_BASE_URL}/api/auth/send-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || result.message || '发送验证码失败');
  }
}

/**
 * 统一登录（支持手机号和邮箱验证码登录）
 */
export async function login(
  contact: string,
  code: string,
  invitationCode?: string
): Promise<UserInfo> {
  // 🆕 判断是手机号还是邮箱
  const validation = validateContact(contact);
  const body = validation.type === 'mobile'
    ? { phone: contact, code }
    : { email: contact, code };

  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || result.message || '登录失败');
  }

  // 🆕 D1 API 返回格式不同，需要转换
  const userInfo: UserInfo = {
    authorization: result.accessToken,
    userId: result.user.id,
    email: result.user.email || '',
    mobile: result.user.phone || '',
    nickname: result.user.email || result.user.phone || '',
    avatar: '',
    status: 1,
  };

  // 保存用户信息到本地存储
  saveUserInfo(userInfo);

  return userInfo;
}

/**
 * 保存用户信息到本地存储
 */
export function saveUserInfo(userInfo: UserInfo): void {
  localStorage.setItem('userInfo', JSON.stringify(userInfo));
  localStorage.setItem('accessToken', userInfo.authorization);
}

/**
 * 获取本地存储的用户信息
 */
export function getUserInfo(): UserInfo | null {
  const userInfoStr = localStorage.getItem('userInfo');
  if (!userInfoStr) return null;

  try {
    return JSON.parse(userInfoStr);
  } catch (error) {
    console.error('解析用户信息失败:', error);
    return null;
  }
}

/**
 * 获取访问令牌
 */
export function getAccessToken(): string | null {
  return localStorage.getItem('accessToken');
}

/**
 * 检查用户是否已登录
 */
export function isLoggedIn(): boolean {
  const token = getAccessToken();
  const userInfo = getUserInfo();
  return !!(token && userInfo);
}

/**
 * 退出登录
 */
export function logout(): void {
  localStorage.removeItem('userInfo');
  localStorage.removeItem('accessToken');
  // 刷新页面回到登录页
  window.location.reload();
}

/**
 * 验证联系方式格式（手机号或邮箱）
 */
export function validateContact(contact: string): {
  isValid: boolean;
  type: 'mobile' | 'email' | null;
  error?: string;
} {
  // 手机号格式: 以1开头,第二位为3-9,共11位数字
  const mobileRegex = /^1[3-9]\d{9}$/;
  // 邮箱格式
  const emailRegex = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;

  if (mobileRegex.test(contact)) {
    return { isValid: true, type: 'mobile' };
  }

  if (emailRegex.test(contact)) {
    return { isValid: true, type: 'email' };
  }

  return {
    isValid: false,
    type: null,
    error: '请输入有效的手机号或邮箱地址',
  };
}

/**
 * 验证验证码格式
 */
export function validateCode(code: string): {
  isValid: boolean;
  error?: string;
} {
  if (!code || code.length !== 6) {
    return {
      isValid: false,
      error: '验证码必须为6位数字',
    };
  }

  if (!/^\d{6}$/.test(code)) {
    return {
      isValid: false,
      error: '验证码只能包含数字',
    };
  }

  return { isValid: true };
}

