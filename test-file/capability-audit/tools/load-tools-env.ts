/**
 * Load capability-audit/tools/tools.env into process.env (idempotent).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILE = join(__dirname, 'tools.env');

export function loadCapabilityToolsEnv(): void {
  if (!existsSync(ENV_FILE)) {
    return;
  }
  const text = readFileSync(ENV_FILE, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadCapabilityToolsEnv();
