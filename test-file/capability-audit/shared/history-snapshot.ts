/**
 * Persisted capability-scan snapshot for local history (browser localStorage).
 */

import type { ScanArtifactKind, ScanStrategy } from './scan';

export const CAPABILITY_SCAN_META_KEY = 'capabilityScan';

export type EngineRunStatusSnapshot = {
  engine: string;
  status: 'success' | 'skipped' | 'failed' | 'timeout';
  findingCount: number;
  message?: string;
  durationMs?: number;
};

export type SkillPreviewFileSnapshot = {
  path: string;
  kind: 'instruction' | 'script' | 'config' | 'dependency' | 'data' | 'other';
  sizeBytes?: number;
  lineCount?: number;
  content?: string;
};

export type SkillPreviewSnapshot = {
  files: SkillPreviewFileSnapshot[];
  stats: Array<{ kind: string; count: number; lines: number }>;
  defaultExpanded?: string;
};

export type CapabilityScanSnapshot = {
  taskId: string;
  status: 'completed' | 'partial_completed' | 'failed';
  strategy: ScanStrategy;
  artifactKind: ScanArtifactKind;
  engines: EngineRunStatusSnapshot[];
  assetManifest?: Array<{ path: string; kind: string }>;
  skillPreview?: SkillPreviewSnapshot;
};

export function buildCapabilityScanSnapshot(scan: CapabilityScanSnapshot): CapabilityScanSnapshot {
  return {
    taskId: scan.taskId,
    status: scan.status,
    strategy: scan.strategy,
    artifactKind: scan.artifactKind,
    engines: scan.engines.map((e) => ({ ...e })),
    assetManifest: scan.assetManifest ? scan.assetManifest.map((a) => ({ ...a })) : undefined,
    skillPreview: scan.skillPreview
      ? {
          files: scan.skillPreview.files.map((f) => ({ ...f })),
          stats: scan.skillPreview.stats.map((s) => ({ ...s })),
          defaultExpanded: scan.skillPreview.defaultExpanded,
        }
      : undefined,
  };
}

export function parseCapabilityScanSnapshot(
  metadata?: Record<string, unknown>,
): CapabilityScanSnapshot | null {
  const raw = metadata?.[CAPABILITY_SCAN_META_KEY];
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.taskId !== 'string' || typeof obj.strategy !== 'string') {
    return null;
  }
  if (!Array.isArray(obj.engines)) {
    return null;
  }
  return {
    taskId: obj.taskId,
    status:
      obj.status === 'partial_completed' || obj.status === 'failed' ? obj.status : 'completed',
    strategy: obj.strategy as ScanStrategy,
    artifactKind: (obj.artifactKind === 'mcp' || obj.artifactKind === 'tool'
      ? obj.artifactKind
      : 'skills') as ScanArtifactKind,
    engines: obj.engines as EngineRunStatusSnapshot[],
    assetManifest: Array.isArray(obj.assetManifest)
      ? (obj.assetManifest as CapabilityScanSnapshot['assetManifest'])
      : undefined,
    skillPreview:
      obj.skillPreview && typeof obj.skillPreview === 'object'
        ? (obj.skillPreview as SkillPreviewSnapshot)
        : undefined,
  };
}
