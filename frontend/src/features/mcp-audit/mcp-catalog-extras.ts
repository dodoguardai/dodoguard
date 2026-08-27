/**
 * Curated MCP directory rows (reference-style entries; no bundled server in repo).
 * Aligned with public MCP directory UX such as [TrustTools MCP](https://ai.trusttools.cn/mcp).
 */

export type McpCatalogExtra = {
  slug: string;
  name: { zh: string; en: string };
  desc: { zh: string; en: string };
};

export const MCP_CATALOG_EXTRAS: McpCatalogExtra[] = [
  {
    slug: 'stdio-transport',
    name: { en: 'stdio MCP', zh: 'stdio 型 MCP' },
    desc: {
      en: 'Typical Node/Python MCP over stdio — review tool handlers, env, and subprocess usage.',
      zh: '常见 stdio 型 MCP（Node/Python）— 关注工具处理函数、环境变量与子进程调用。',
    },
  },
  {
    slug: 'sse-streamable-http',
    name: { en: 'HTTP / SSE MCP', zh: 'HTTP / SSE MCP' },
    desc: {
      en: 'HTTP/SSE MCP servers — check auth, URL validation, SSRF, and tool schema poisoning.',
      zh: 'HTTP/SSE 类 MCP — 检查鉴权、URL 校验、SSRF 与工具描述投毒。',
    },
  },
  {
    slug: 'filesystem-tools',
    name: { en: 'Filesystem tools', zh: '文件系统工具' },
    desc: {
      en: 'File-oriented tools — sensitive paths, destructive ops, and path traversal.',
      zh: '文件类工具 — 敏感路径、破坏性操作与路径穿越风险。',
    },
  },
];

export function reservedMcpSlugsFromExtras(): Set<string> {
  return new Set(MCP_CATALOG_EXTRAS.map((e) => e.slug));
}
