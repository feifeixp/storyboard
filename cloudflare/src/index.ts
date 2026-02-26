/**
 * Cloudflare Workers API for Storyboard Studio
 * 使用 Hono 框架构建 RESTful API
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { projectRoutes } from './routes/projects';
import { episodeRoutes } from './routes/episodes';
import { authRoutes } from './routes/auth';
import { aiProxyRoutes } from './routes/aiProxy';

// 环境变量类型定义
export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  VITE_OPENROUTER1_API_KEY: string;
}

/**
 * 认证后的用户信息（写入 Hono Context Variables）
 */
export interface AuthUser {
  id: string;
  phone?: string;
  email?: string;
}

/**
 * Hono 应用类型（Bindings + Variables）
 * - Bindings: Cloudflare 环境绑定（D1 等）
 * - Variables: 中间件注入的上下文变量（例如 user）
 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: AuthUser;
  };
};

// 创建 Hono 应用
const app = new Hono<AppEnv>();

// CORS 中间件 - 允许所有来源（生产环境建议限制为特定域名）
app.use('/*', cors({
  origin: '*',  // 允许所有来源
  // 🆕 PATCH：用于项目局部更新（避免全量保存）
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'accessToken'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: false,  // 允许所有来源时必须设置为 false
}));

// 健康检查
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    environment: c.env.ENVIRONMENT,
  });
});

// 路由
app.route('/api/auth', authRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/episodes', episodeRoutes);
app.route('/api/ai-proxy', aiProxyRoutes);

// 404 处理
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    error: err.message || 'Internal Server Error',
  }, 500);
});

export default app;

