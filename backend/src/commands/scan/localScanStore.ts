import * as fs from 'fs';
import * as path from 'path';

import { v4 as uuidv4 } from 'uuid';

import type { ScanTaskInput } from '../../schemas/attackTaskSchema';

export type ScanRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ScanRunManifest {
  id: string;
  name: string;
  status: ScanRunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  configPath?: string;
  runnerConfigPath?: string;
  outputPath?: string;
  error?: string;
  task: ScanTaskInput;
  stats?: {
    total?: number;
    passed?: number;
    failed?: number;
    errors?: number;
    passRate?: number;
  };
}

export interface ScanRunIndexEntry {
  id: string;
  name: string;
  status: ScanRunStatus;
  createdAt: string;
}

const DEFAULT_SCANS_DIR = '.dodoguard/scans';

export function getScansRoot(cwd = process.cwd()): string {
  return path.join(cwd, DEFAULT_SCANS_DIR);
}

export function getRunDir(runId: string, cwd = process.cwd()): string {
  return path.join(getScansRoot(cwd), runId);
}

function getIndexPath(cwd = process.cwd()): string {
  return path.join(getScansRoot(cwd), 'index.json');
}

function readIndex(cwd = process.cwd()): ScanRunIndexEntry[] {
  const indexPath = getIndexPath(cwd);
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as ScanRunIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: ScanRunIndexEntry[], cwd = process.cwd()): void {
  const root = getScansRoot(cwd);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(getIndexPath(cwd), JSON.stringify(entries, null, 2), 'utf8');
}

export function createScanRun(
  task: ScanTaskInput,
  options?: { configPath?: string; runnerConfigPath?: string; cwd?: string },
): ScanRunManifest {
  const cwd = options?.cwd ?? process.cwd();
  const now = new Date().toISOString();
  const id = uuidv4();
  const manifest: ScanRunManifest = {
    id,
    name: task.name,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    configPath: options?.configPath,
    runnerConfigPath: options?.runnerConfigPath,
    task,
  };

  const runDir = getRunDir(id, cwd);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const index = readIndex(cwd);
  index.unshift({
    id,
    name: task.name,
    status: 'pending',
    createdAt: now,
  });
  writeIndex(index.slice(0, 500), cwd);

  return manifest;
}

export function updateScanRun(
  runId: string,
  patch: Partial<ScanRunManifest>,
  cwd = process.cwd(),
): ScanRunManifest {
  const manifest = getScanRun(runId, cwd);
  const updated: ScanRunManifest = {
    ...manifest,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  const runDir = getRunDir(runId, cwd);
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(updated, null, 2), 'utf8');

  const index = readIndex(cwd);
  const idx = index.findIndex((e) => e.id === runId);
  if (idx >= 0) {
    index[idx] = {
      id: updated.id,
      name: updated.name,
      status: updated.status,
      createdAt: updated.createdAt,
    };
    writeIndex(index, cwd);
  }

  return updated;
}

export function getScanRun(runId: string, cwd = process.cwd()): ScanRunManifest {
  const manifestPath = path.join(getRunDir(runId, cwd), 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Scan run not found: ${runId}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ScanRunManifest;
}

export function listScanRuns(cwd = process.cwd()): ScanRunIndexEntry[] {
  return readIndex(cwd);
}

export function saveScanResults(runId: string, results: unknown, cwd = process.cwd()): string {
  const runDir = getRunDir(runId, cwd);
  fs.mkdirSync(runDir, { recursive: true });
  const resultsPath = path.join(runDir, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  return resultsPath;
}

export function getScanResults(runId: string, cwd = process.cwd()): unknown | null {
  const resultsPath = path.join(getRunDir(runId, cwd), 'results.json');
  if (!fs.existsSync(resultsPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  } catch {
    return null;
  }
}

export function deleteScanRun(runId: string, cwd = process.cwd()): boolean {
  const runDir = getRunDir(runId, cwd);
  if (!fs.existsSync(runDir)) {
    return false;
  }

  fs.rmSync(runDir, { recursive: true, force: true });
  const index = readIndex(cwd).filter((entry) => entry.id !== runId);
  writeIndex(index, cwd);
  return true;
}
