/**
 * Fetch skill/MCP artifact from http(s) URL (SSRF-safe subset).
 */

import { URL } from 'node:url';

import { MAX_SKILL_ZIP_BYTES } from '../../../backend/src/services/skillPackageExtract';

const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export type FetchedArtifact =
  | { kind: 'archive'; buffer: Buffer; fileName: string }
  | { kind: 'markdown'; text: string; fileName: string };

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(h)) {
    return true;
  }
  if (h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    return true;
  }
  return false;
}

function fileNameFromUrl(url: URL): string {
  const segment = decodeURIComponent(url.pathname.split('/').pop() ?? '').trim();
  return segment || 'remote-artifact';
}

function classifyByName(fileName: string): 'archive' | 'markdown' | 'unknown' {
  const lower = fileName.toLowerCase();
  if (/\.(zip|tar\.gz|tgz)$/.test(lower)) {
    return 'archive';
  }
  if (/\.(md|markdown)$/.test(lower)) {
    return 'markdown';
  }
  return 'unknown';
}

export async function fetchArtifactFromUrl(
  sourceUrl: string,
): Promise<{ ok: true; artifact: FetchedArtifact } | { ok: false; message: string }> {
  let url: URL;
  try {
    url = new URL(sourceUrl.trim());
  } catch {
    return { ok: false, message: 'Invalid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'Only http(s) URLs are supported' };
  }

  if (isBlockedHost(url.hostname)) {
    return { ok: false, message: 'URL host is not allowed' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'zhian-safe-capability-scan/1.0' },
    });

    if (!response.ok) {
      return { ok: false, message: `Failed to fetch URL (HTTP ${response.status})` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_SKILL_ZIP_BYTES) {
      return {
        ok: false,
        message: `Remote file exceeds ${Math.floor(MAX_SKILL_ZIP_BYTES / 1024 / 1024)} MB limit`,
      };
    }

    const fileName = fileNameFromUrl(url);
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    let kind = classifyByName(fileName);

    if (kind === 'unknown') {
      if (
        contentType.includes('zip') ||
        contentType.includes('gzip') ||
        contentType.includes('x-tar')
      ) {
        kind = 'archive';
      } else if (contentType.includes('markdown') || contentType.includes('text/plain')) {
        kind = 'markdown';
      }
    }

    if (kind === 'archive') {
      return { ok: true, artifact: { kind: 'archive', buffer, fileName } };
    }

    if (kind === 'markdown') {
      const text = buffer.toString('utf8');
      if (text.length > MAX_MARKDOWN_BYTES) {
        return { ok: false, message: 'Remote markdown exceeds size limit' };
      }
      return { ok: true, artifact: { kind: 'markdown', text, fileName } };
    }

    return {
      ok: false,
      message: 'URL must point to .zip, .tar.gz, .tgz, or .md / .markdown',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg.includes('abort') ? 'URL fetch timed out' : msg };
  } finally {
    clearTimeout(timeout);
  }
}
