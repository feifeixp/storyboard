/**
 * Volcengine Ark API 代理路由
 * 用于代理视频生成请求并隐藏 ARK_API_KEY
 */

import { Hono } from 'hono';
import type { AppEnv } from '../index';

export const volcengineRoutes = new Hono<AppEnv>();

volcengineRoutes.all('/*', async (c) => {
  const apiKey = (c.env as any).ARK_API_KEY || (c.env as any).VITE_ARK_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'ARK_API_KEY not configured in Worker secrets' }, 500);
  }

  // 拼接目标 URL，移除 /volcengine 前缀
  const url = new URL(c.req.url);
  const targetPath = url.pathname.replace(/^\/volcengine/, '');
  const targetUrl = `https://ark.cn-beijing.volces.com${targetPath}${url.search}`;

  // 读取请求体
  let body: string | undefined;
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    body = await c.req.text();
  }

  // 转发请求到 Volcengine
  const response = await fetch(targetUrl, {
    method: c.req.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body,
  });

  // 透传响应
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
});
