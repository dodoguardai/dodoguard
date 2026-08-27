#!/usr/bin/env node
/**
 * 在清除 HTTP(S)/ALL 代理环境变量后执行 electron-builder，
 * 避免本机 IDE/系统代理（如 127.0.0.1:端口）触发 agent-base / https-proxy-agent 与 node-gyp 下载 Electron headers 时的兼容问题。
 */
const { spawnSync } = require('node:child_process');

const env = { ...process.env };
for (const k of [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
]) {
  delete env[k];
}

const args = process.argv.slice(2);
const r = spawnSync('npx', ['electron-builder', ...args], {
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(r.status === null ? 1 : r.status);
