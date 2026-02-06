/**
 * 认证中间件
 * 🆕 使用 Neodomain 统一登录 API 的 JWT Token
 */

import { Context, Next } from 'hono';
import { Env } from '../index';

export interface AuthUser {
  id: string;
  phone?: string;
  email?: string;
}

/**
 * 解析 JWT Token（简单版本，不验证签名）
 * 注意：这里信任 Neodomain 的 Token，不进行签名验证
 */
function parseJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // 解码 payload（第二部分）
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (error) {
    console.error('JWT parse error:', error);
    return null;
  }
}

/**
 * 验证访问令牌
 * 🆕 支持 Neodomain JWT Token
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const accessToken = c.req.header('accessToken') || c.req.header('Authorization')?.replace('Bearer ', '');

  if (!accessToken) {
    console.error('[Auth] Missing access token');
    return c.json({ error: 'Unauthorized: Missing access token' }, 401);
  }

  try {
    // 🆕 解析 JWT Token
    const payload = parseJWT(accessToken);

    if (!payload) {
      console.error('[Auth] Invalid token format');
      return c.json({ error: 'Unauthorized: Invalid token format' }, 401);
    }

    console.log('[Auth] JWT payload:', JSON.stringify(payload, null, 2));

    // 检查 Token 是否过期
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      console.error('[Auth] Token expired');
      return c.json({ error: 'Unauthorized: Token expired' }, 401);
    }

    // 从 JWT payload 中提取用户信息
    // Neodomain JWT 包含: userId, mobile, email 等字段
    const userId = payload.userId || payload.sub || payload.id;

    if (!userId) {
      console.error('[Auth] Invalid token payload - no userId found');
      return c.json({ error: 'Unauthorized: Invalid token payload' }, 401);
    }

    console.log('[Auth] User ID:', userId);

    // 🆕 确保用户在数据库中存在（如果不存在则创建）
    await ensureUserExists(c.env.DB, {
      id: userId,
      phone: payload.mobile,
      email: payload.email,
    });

    // 将用户信息附加到上下文
    c.set('user', {
      id: userId,
      phone: payload.mobile,
      email: payload.email,
    });

    console.log('[Auth] Authentication successful for user:', userId);

    await next();
  } catch (error) {
    console.error('[Auth] Middleware error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

/**
 * 确保用户在数据库中存在
 */
async function ensureUserExists(db: D1Database, user: { id: string; phone?: string; email?: string }) {
  try {
    // 检查用户是否存在
    const existingUser = await db.prepare('SELECT id FROM users WHERE id = ?')
      .bind(user.id)
      .first();

    if (!existingUser) {
      const now = Date.now();
      // 创建新用户
      await db.prepare(
        'INSERT INTO users (id, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(user.id, user.phone || null, user.email || null, now, now)
        .run();

      console.log(`[Auth] Created new user: ${user.id}`);
    }
  } catch (error) {
    console.error('[Auth] Ensure user exists error:', error);
    console.error('[Auth] Error details:', JSON.stringify(error, null, 2));
    // 抛出错误，让调用者知道用户创建失败
    throw error;
  }
}

/**
 * 获取当前用户
 */
export function getCurrentUser(c: Context): AuthUser {
  return c.get('user');
}

