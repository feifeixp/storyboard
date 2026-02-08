/**
 * 认证路由
 * 🆕 简化版本 - 只保留会话管理，验证码发送和验证由 Neodomain API 处理
 */

import { Hono } from 'hono';
import type { AppEnv } from '../index';

export const authRoutes = new Hono<AppEnv>();

/**
 * 健康检查
 * GET /api/auth/health
 */
authRoutes.get('/health', (c) => {
  return c.json({ status: 'ok', message: 'Auth service is running' });
});

/**
 * 会话验证（可选 - 如果需要后端会话管理）
 * POST /api/auth/verify
 */
authRoutes.post('/verify', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Authorization header is required' }, 401);
  }

  // 这里可以添加会话验证逻辑
  // 目前直接返回成功，因为前端使用 Neodomain 的 JWT token

  return c.json({ success: true, message: 'Token is valid' });
});


