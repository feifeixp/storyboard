/**
 * 用户认证服务
 * 🆕 使用 Neodomain 统一登录 API
 */

// 🆕 使用 Neodomain API
const NEODOMAIN_API_BASE = 'https://story.neodomain.cn';
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

// 积分详情接口
export interface PointsDetail {
  pointsType: number;
  pointsTypeName: string;
  currentPoints: number;
  resetTime: string | null;
  description: string | null;
  sortOrder: number;
  expireTime: string | null;
}

// 会员信息接口
export interface MembershipInfo {
  levelCode: string;
  levelName: string;
  status: number;
  statusDesc: string;
  expireTime: string;
  isExpiringSoon: boolean;
  dailyPointsQuota: number;
  membershipType: number;
  membershipTypeDesc: string;
}

// 积分信息接口
export interface PointsInfo {
  totalAvailablePoints: number;
  pointsDetails: PointsDetail[];
  membershipInfo: MembershipInfo;
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
 * 🆕 调用 Neodomain API
 */
export async function sendVerificationCode(contact: string): Promise<void> {
  const response = await fetch(`${NEODOMAIN_API_BASE}/user/login/send-unified-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contact }),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.errMessage || '发送验证码失败');
  }
}

/**
 * 统一登录（支持手机号和邮箱验证码登录）
 * 🆕 调用 Neodomain API
 */
export async function login(
  contact: string,
  code: string,
  invitationCode?: string
): Promise<UserInfo> {
  const body: { contact: string; code: string; invitationCode?: string } = {
    contact,
    code,
  };

  if (invitationCode) {
    body.invitationCode = invitationCode;
  }

  const response = await fetch(`${NEODOMAIN_API_BASE}/user/login/unified-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.errMessage || '登录失败');
  }

  // 🆕 Neodomain API 直接返回 UserInfo 格式
  const userInfo: UserInfo = result.data;

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

/**
 * 获取用户积分信息
 * 🆕 调用 Neodomain API
 */
export async function getUserPoints(): Promise<PointsInfo> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('未登录，无法获取积分信息');
  }

  const response = await fetch(`${NEODOMAIN_API_BASE}/agent/user/points/info`, {
    method: 'GET',
    headers: {
      'accessToken': accessToken,
    },
  });

  const result: ApiResponse<PointsInfo> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.errMessage || '获取积分信息失败');
  }

  return result.data;
}

