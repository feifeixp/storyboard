/**
 * Cloudflare Workers API for Storyboard Studio
 * 使用 Hono 框架构建 RESTful API
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { projectRoutes } from './routes/projects';
import { episodeRoutes } from './routes/episodes';
import { authRoutes } from './routes/auth';

// 环境变量类型定义
export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env }>();

// CORS 中间件
app.use('/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://yourdomain.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'accessToken'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
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

