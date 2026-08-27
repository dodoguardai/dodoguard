import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Resolve hoisted workspace `node_modules/@xyflow/react/dist/style.css` for Vite. */
function resolveXyflowStyleCss(): string | undefined {
  for (const root of [__dirname, path.resolve(__dirname, '..')]) {
    try {
      const pkgJson = require.resolve('@xyflow/react/package.json', { paths: [root] });
      return path.join(path.dirname(pkgJson), 'dist', 'style.css');
    } catch {
      /* try parent (monorepo root) */
    }
  }
  return undefined;
}

const xyflowStyleCss = resolveXyflowStyleCss();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      'capability-audit': path.resolve(__dirname, '../capability-audit'),
      ...(xyflowStyleCss ? { '@xyflow/react/dist/style.css': xyflowStyleCss } : {}),
    },
  },
  server: {
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:15500',
        changeOrigin: true,
        secure: false,
        // Dify config audit and other LLM-backed routes can exceed 30s (two model calls).
        timeout: 300_000,
        proxyTimeout: 300_000,
        // 明确配置headers选项，确保所有headers都被转发
        headers: {
          // 不删除任何headers，让所有headers都被转发
        },
        // 确保转发所有请求头，特别是Authorization
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Proxying request:', req.method, req.url);
            console.log('Proxy - Request headers:', Object.keys(req.headers));
            // 确保Authorization头被转发
            if (req.headers.authorization) {
              proxyReq.setHeader('Authorization', req.headers.authorization);
              console.log(
                'Proxy - Authorization header forwarded:',
                req.headers.authorization.substring(0, 20) + '...',
              );
            } else {
              console.warn('Proxy - No Authorization header in request');
              console.warn('Proxy - All request headers:', req.headers);
            }
            // 确保所有其他重要headers也被转发
            if (req.headers['content-type']) {
              proxyReq.setHeader('Content-Type', req.headers['content-type']);
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log(
              'Proxy - Response status:',
              proxyRes.statusCode,
              'for',
              req.method,
              req.url,
            );
          });
        },
      },
    },
  },
});
