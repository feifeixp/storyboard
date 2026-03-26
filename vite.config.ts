import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const versionUpdatePlugin = () => {
  const currentVersion = Date.now().toString();
  return {
    name: 'version-update',
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(currentVersion)
        }
      };
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: currentVersion })
      });
    }
  };
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,  // 修改为5173，避免与其他项目冲突
        host: '0.0.0.0',
        proxy: {
          '/volcengine': {
            target: 'https://ark.cn-beijing.volces.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/volcengine/, ''),
            configure: (proxy, _options) => {
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                if (env.VITE_ARK_API_KEY) {
                  proxyReq.setHeader('Authorization', `Bearer ${env.VITE_ARK_API_KEY}`);
                }
              });
            }
          }
        }
      },
      plugins: [react(), versionUpdatePlugin()],
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
