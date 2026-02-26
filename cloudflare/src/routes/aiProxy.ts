/**
 * AI API 代理路由
 * 将前端请求转发到自建 ALB 接口，解决 Mixed Content 问题
 * 模型固定使用 google/gemini-2.5-flash
 */

import { Hono } from 'hono';
import type { AppEnv } from '../index';

export const aiProxyRoutes = new Hono<AppEnv>();

const ALB_BASE_URL = 'http://alb-r3li6yh4ktpwq7ugkg.ap-southeast-1.alb.aliyuncsslbintl.com:7000/v1';

/**
 * 代理所有 /api/ai-proxy/* 请求到 ALB
 * 例：POST /api/ai-proxy/chat/completions → ALB /v1/chat/completions
 */
aiProxyRoutes.all('/*', async (c) => {
  const apiKey = c.env.VITE_OPENROUTER1_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'VITE_OPENROUTER1_API_KEY not configured in Worker secrets' }, 500);
  }

  // 拼接目标 URL，移除 /api/ai-proxy 前缀
  const url = new URL(c.req.url);
  const targetPath = url.pathname.replace(/^\/api\/ai-proxy/, '');
  const targetUrl = `${ALB_BASE_URL}${targetPath}${url.search}`;

  // 读取请求体
  let body: string | undefined;
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    body = await c.req.text();
  }

  // 转发请求到 ALB
  const response = await fetch(targetUrl, {
    method: c.req.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body,
  });

  // 透传响应（支持流式 SSE）
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
});

