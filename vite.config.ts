import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,  // 修改为5173，避免与其他项目冲突
        host: '0.0.0.0',
        proxy: {
          // 本地开发：将 /api/ai-proxy 转发到 ALB（绕过浏览器 CORS/Mixed Content 限制）
          '/api/ai-proxy': {
            target: 'http://alb-r3li6yh4ktpwq7ugkg.ap-southeast-1.alb.aliyuncsslbintl.com:7000/v1',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/ai-proxy/, ''),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
