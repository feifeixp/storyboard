/**
 * Cloudflare Worker - API 代理
 * 用途：保护 API Key 不暴露在前端代码中
 * 
 * 部署步骤：
 * 1. 在 Cloudflare Workers 控制台创建新 Worker
 * 2. 复制此代码到 Worker 编辑器
 * 3. 在 Worker 设置中添加环境变量：
 *    - OPENROUTER_API_KEY: 你的 OpenRouter API Key
 *    - DEEPSEEK_API_KEY: 你的 DeepSeek API Key (可选)
 *    - GEMINI_API_KEY: 你的 Gemini API Key (可选)
 *    - ALLOWED_ORIGIN: 你的网站域名 (如 https://your-app.pages.dev)
 * 4. 部署 Worker
 * 5. 修改前端代码，将 API 请求发送到 Worker URL
 */

export default {
  async fetch(request, env, ctx) {
    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return handleCORS(request, env);
    }

    // 验证来源
    const origin = request.headers.get('Origin');
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://your-app.pages.dev';
    
    if (!origin || !origin.includes(allowedOrigin.replace('https://', ''))) {
      return new Response('Forbidden: Invalid origin', { 
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
        }
      });
    }

    // 解析请求路径
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 路由到不同的 API
      if (path.startsWith('/openrouter/')) {
        return await proxyOpenRouter(request, env, origin);
      } else if (path.startsWith('/deepseek/')) {
        return await proxyDeepSeek(request, env, origin);
      } else if (path.startsWith('/gemini/')) {
        return await proxyGemini(request, env, origin);
      } else {
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      return new Response(`Error: ${error.message}`, { 
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': origin,
        }
      });
    }
  }
};

/**
 * 代理 OpenRouter API
 */
async function proxyOpenRouter(request, env, origin) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response('OpenRouter API Key not configured', { status: 500 });
  }

  // 移除 /openrouter 前缀
  const url = new URL(request.url);
  const targetPath = url.pathname.replace('/openrouter', '');
  const targetUrl = `https://openrouter.ai${targetPath}${url.search}`;

  // 转发请求
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': origin,
      'X-Title': 'Visionary Storyboard Studio',
    },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  // 返回响应，添加 CORS 头
  return new Response(response.body, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

/**
 * 代理 DeepSeek API
 */
async function proxyDeepSeek(request, env, origin) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return new Response('DeepSeek API Key not configured', { status: 500 });
  }

  const url = new URL(request.url);
  const targetPath = url.pathname.replace('/deepseek', '');
  const targetUrl = `https://api.deepseek.com${targetPath}${url.search}`;

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

/**
 * 代理 Gemini API
 */
async function proxyGemini(request, env, origin) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response('Gemini API Key not configured', { status: 500 });
  }

  // Gemini API 需要在 URL 中传递 API Key
  const url = new URL(request.url);
  const targetPath = url.pathname.replace('/gemini', '');
  url.searchParams.set('key', apiKey);
  const targetUrl = `https://generativelanguage.googleapis.com${targetPath}?${url.searchParams}`;

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

/**
 * 处理 CORS 预检请求
 */
function handleCORS(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://your-app.pages.dev';

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin || allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
  });
}

