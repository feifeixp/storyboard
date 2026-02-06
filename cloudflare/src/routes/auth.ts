/**
 * 认证路由
 */

import { Hono } from 'hono';
import { Env } from '../index';

export const authRoutes = new Hono<{ Bindings: Env }>();

/**
 * 发送验证码（模拟）
 * POST /api/auth/send-code
 */
authRoutes.post('/send-code', async (c) => {
  const { phone, email } = await c.req.json();

  if (!phone && !email) {
    return c.json({ error: 'Phone or email is required' }, 400);
  }

  // TODO: 集成真实的短信/邮件服务
  // 这里仅返回成功，实际应该发送验证码

  return c.json({
    success: true,
    message: 'Verification code sent',
  });
});

/**
 * 验证码登录
 * POST /api/auth/login
 */
authRoutes.post('/login', async (c) => {
  const { phone, email, code } = await c.req.json();

  if (!phone && !email) {
    return c.json({ error: 'Phone or email is required' }, 400);
  }

  if (!code) {
    return c.json({ error: 'Verification code is required' }, 400);
  }

  // TODO: 验证验证码
  // 这里简化处理，实际应该验证验证码是否正确

  try {
    // 查找或创建用户
    let user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE phone = ? OR email = ?'
    )
      .bind(phone || null, email || null)
      .first();

    if (!user) {
      // 创建新用户
      const userId = `user-${Date.now()}`;
      const now = Date.now();

      await c.env.DB.prepare(
        'INSERT INTO users (id, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(userId, phone || null, email || null, now, now)
        .run();

      user = { id: userId, phone, email };
    }

    // 创建会话
    const sessionId = `session-${Date.now()}`;
    const accessToken = `token-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30天

    await c.env.DB.prepare(
      'INSERT INTO sessions (id, user_id, access_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(sessionId, user.id, accessToken, expiresAt, Date.now())
      .run();

    return c.json({
      success: true,
      accessToken,
      expiresAt,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login failed' }, 500);
  }
});

/**
 * 登出
 * POST /api/auth/logout
 */
authRoutes.post('/logout', async (c) => {
  const accessToken = c.req.header('accessToken');

  if (!accessToken) {
    return c.json({ error: 'Missing access token' }, 400);
  }

  try {
    await c.env.DB.prepare('DELETE FROM sessions WHERE access_token = ?')
      .bind(accessToken)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Logout failed' }, 500);
  }
});

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
authRoutes.get('/me', async (c) => {
  const accessToken = c.req.header('accessToken');

  if (!accessToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const session = await c.env.DB.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.access_token = ? AND s.expires_at > ?'
    )
      .bind(accessToken, Date.now())
      .first();

    if (!session) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    return c.json({
      id: session.id,
      phone: session.phone,
      email: session.email,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ error: 'Failed to get user info' }, 500);
  }
});

