/**
 * 认证中间件
 */

import { Context, Next } from 'hono';
import { Env } from '../index';

export interface AuthUser {
  id: string;
  phone?: string;
  email?: string;
}

/**
 * 验证访问令牌
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const accessToken = c.req.header('accessToken') || c.req.header('Authorization')?.replace('Bearer ', '');

  if (!accessToken) {
    return c.json({ error: 'Unauthorized: Missing access token' }, 401);
  }

  try {
    // 查询会话
    const session = await c.env.DB.prepare(
      'SELECT s.*, u.id as user_id, u.phone, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.access_token = ? AND s.expires_at > ?'
    )
      .bind(accessToken, Date.now())
      .first();

    if (!session) {
      return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);
    }

    // 将用户信息附加到上下文
    c.set('user', {
      id: session.user_id as string,
      phone: session.phone as string | undefined,
      email: session.email as string | undefined,
    });

    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

/**
 * 获取当前用户
 */
export function getCurrentUser(c: Context): AuthUser {
  return c.get('user');
}

