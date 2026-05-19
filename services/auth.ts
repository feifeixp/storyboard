/**
 * 用户认证服务
 * 🆕 使用 Neodomain 统一登录 API
 */

// 🆕 使用 Neodomain API
const NEODOMAIN_API_BASE = 'https://story.neodomain.cn';
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://storyboard-api.feifeixp.workers.dev';

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

export const OAUTH_CLIENT_ID = 'neowpw_community';
export const OAUTH_CLIENT_SECRET = 'sk_neowpw_c1576dcd043c4362beec9a22a5b0e963';

// 优先使用环境变量中配置的国内可访问域名，避免 *.workers.dev 在部分地区被封锁
export const WORKER_API_BASE = import.meta.env.VITE_API_URL || 'https://visionary-storyboard-skill-api.feifeixp.workers.dev';

/**
 * 获取 OAuth2 登录授权URL
 */
export async function getOAuthLoginUrl(redirectUri: string, state: string): Promise<string> {
  const response = await fetch(`${WORKER_API_BASE}/api/v1/auth/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: OAUTH_CLIENT_ID, redirectUri, state })
  });
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.errMessage || '获取登录地址失败');
  }

  return result.data;
}

/**
 * 用授权码换取 Token 并保存用户信息
 */
export async function exchangeOAuthToken(code: string, redirectUri: string): Promise<UserInfo> {
  const response = await fetch(`${WORKER_API_BASE}/api/v1/auth/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grantType: 'authorization_code',
      code,
      redirectUri,
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET
    })
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.errMessage || '登录验证失败');
  }

  const tokenData = result.data;
  const userInfo: UserInfo = {
    authorization: tokenData.accessToken,
    userId: tokenData.userId,
    email: tokenData.email || '',
    mobile: tokenData.mobile || '',
    nickname: tokenData.nickname || '',
    avatar: tokenData.avatar || '',
    status: tokenData.status || 1
  };
  
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
 * 获取用户积分信息
 * 🆕 调用 Neodomain API
 */
export async function getUserPoints(): Promise<PointsInfo> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('未登录，无法获取积分信息');
  }

  const response = await fetch(`${WORKER_API_BASE}/api/v1/auth/user/points/info`, {
    method: 'GET',
    headers: {
      'accessToken': accessToken,
    },
  });

  if (response.status === 401) {
    logout();
    throw new Error('登录凭证已过期，请重新登录');
  }

  const result: ApiResponse<PointsInfo> = await response.json();

  if (!result.success || !result.data) {
    const errStr = result.errMessage || '';
    if (errStr.includes('Token has been revoked') || errStr.includes('token') || errStr.includes('未登录') || errStr.includes('过期')) {
      logout();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth-expired'));
      }
      throw new Error('登录凭证已过期，请重新登录');
    }
    throw new Error(errStr || '获取积分信息失败');
  }

  return result.data;
}

