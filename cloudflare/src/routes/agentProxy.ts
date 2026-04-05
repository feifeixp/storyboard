/**
 * Agent API 代理路由
 * 将前端对 /agent/* 的请求透明转发到后端 story.neodomain.cn，
 * 并透传 Authorization (JWT) 头，解决跨域问题。
 */

import { Hono } from 'hono';
import type { AppEnv } from '../index';

export const agentProxyRoutes = new Hono<AppEnv>();

const NEO_API_BASE = 'https://story.neodomain.cn';

/**
 * 代理所有 /agent/* 请求到后端业务 API
 * 示例：POST /agent/user/video/generate → https://story.neodomain.cn/agent/user/video/generate
 */
agentProxyRoutes.all('/*', async (c) => {
  const url = new URL(c.req.url);

  // 还原完整的目标路径（移除路由挂载前缀 /agent）
  const targetPath = '/agent' + url.pathname.replace(/^\/agent/, '');
  const targetUrl = `${NEO_API_BASE}${targetPath}${url.search}`;

  // 透传原始请求 body
  let body: BodyInit | undefined;
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    body = await c.req.arrayBuffer();
  }

  // 透传关键请求头（Authorization JWT、Content-Type）
  const forwardHeaders: Record<string, string> = {
    'Content-Type': c.req.header('Content-Type') || 'application/json',
  };
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    forwardHeaders['Authorization'] = authHeader;
  }

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers: forwardHeaders,
      body,
    });

    // 透传响应头与 body
    const responseHeaders: Record<string, string> = {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-cache, no-store',
    };
    const xRequestId = response.headers.get('x-request-id');
    if (xRequestId) responseHeaders['x-request-id'] = xRequestId;

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error('[agentProxy] 转发失败:', targetUrl, err?.message);
    return c.json({ error: 'Agent proxy error', detail: err?.message }, 502);
  }
});
