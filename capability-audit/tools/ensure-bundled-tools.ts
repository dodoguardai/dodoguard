/**
 * Extract bundled SkillSpector venv from git-tracked zip when scan-venv is missing.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const TOOLS_ROOT = join(__dirname);

function platformBundleName(): string | null {
  if (process.platform === 'win32' && process.arch === 'x64') {
    return 'scan-venv-win-amd64.zip';
  }
  return null;
}

function skillspectorReady(): boolean {
  const scripts = process.platform === 'win32' ? 'Scripts' : 'bin';
  const ext = process.platform === 'win32' ? '.exe' : '';
  return existsSync(join(TOOLS_ROOT, 'scan-venv', scripts, `skillspector${ext}`));
}

function extractWindowsZip(zipPath: string, destDir: string): void {
  const ps = [
    '$ErrorActionPreference="Stop"',
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
  ].join('; ');
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0) {
    throw new Error(
      `Failed to extract bundled tools: ${r.stderr || r.stdout || `exit ${r.status}`}`,
    );
  }
}

let ensured = false;

/** Idempotent — safe to call before every scan. */
export function ensureBundledTools(): void {
  if (ensured || skillspectorReady()) {
    ensured = true;
    return;
  }

  const bundleFile = platformBundleName();
  if (!bundleFile) {
    return;
  }

  const zipPath = join(TOOLS_ROOT, 'bundled', bundleFile);
  if (!existsSync(zipPath)) {
    return;
  }

  extractWindowsZip(zipPath, TOOLS_ROOT);
  ensured = true;
}
