/**
 * Run external CLI with timeout; returns stdout/stderr.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** capability-audit/backend/scan -> capability-audit/tools */
export const TOOLS_ROOT = join(__dirname, '..', '..', 'tools');

export type CliRunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

function killChildProcess(child: ChildProcess): void {
  if (!child.pid) {
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }
  child.kill('SIGTERM');
}

export async function runCli(
  command: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; shell?: boolean } = {},
): Promise<CliRunResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const useShell = opts.shell ?? process.platform === 'win32';
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      shell: useShell,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killChildProcess(child);
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        stdout,
        stderr,
        exitCode: code,
        timedOut,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout,
        stderr: `${stderr}\n${err.message}`.trim(),
        exitCode: null,
        timedOut,
      });
    });
  });
}

function localToolPath(name: string): string | undefined {
  const venvNames: Record<string, string[]> = {
    skillspector: ['skillspector'],
    'skill-scanner': ['skill-scanner'],
    'snyk-agent-scan': ['snyk-agent-scan'],
  };
  if (venvNames[name]) {
    const scriptsDir = process.platform === 'win32' ? 'Scripts' : 'bin';
    const ext = process.platform === 'win32' ? '.exe' : '';
    for (const base of venvNames[name]) {
      const venvBin = join(TOOLS_ROOT, 'scan-venv', scriptsDir, `${base}${ext}`);
      if (existsSync(venvBin)) {
        return venvBin;
      }
    }
  }
  return undefined;
}

export function resolveBin(envKey: string, fallback: string): string {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const bundled = localToolPath(fallback);
  if (bundled) {
    return bundled;
  }
  return fallback;
}
