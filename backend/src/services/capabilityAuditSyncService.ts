/**
 * Persist capability (SKILLS / MCP) audit results into:
 * - reports (报告中心)
 * - security_scan_tasks + findings + remediations (风险闭环工作台)
 * - capability_component_registry (能力组件 · Skills / MCP)
 */

import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../database';
import logger from '../logger';
import {
  buildCapabilityArtifactStoragePath,
  parseCapabilityZipBuffer,
  writeCapabilityArtifactFile,
} from './capabilityArtifactStorage';
import { createScanFindingAndRemediation } from './compliancePushService';
import { reportService } from './reportService';

export type CapabilityAuditFinding = {
  severity: string;
  category: string;
  location: string;
  issue: string;
  evidence: string;
  recommendation: string;
  dimension?: string;
  sourceFile?: string;
  processingStatus?: string;
  riskType?: string;
};

export type CapabilityAuditData = {
  summary: string;
  overallRisk: string;
  findings: CapabilityAuditFinding[];
  recommendations?: string[];
  warnings?: string[];
  truncated?: boolean;
  scannedFiles?: { path: string }[];
};

export type CapabilityAuditSyncInput = {
  organizationId: string;
  userId: string | null;
  auditData: CapabilityAuditData;
  fileName?: string;
  artifactKind: 'skills' | 'mcp';
  capabilityScanTaskId?: string;
  componentKey?: string;
  componentName?: string;
  /** When report was already created (legacy route), skip creating another */
  existingReportId?: string;
  /** Original uploaded ZIP — persisted as capability component package for detail preview */
  archiveBuffer?: Buffer;
  archiveFileName?: string;
};

export type CapabilityAuditSyncResult = {
  reportId?: string;
  scanTaskId: string;
  findingIds: string[];
  remediationIds: string[];
  registryId?: string;
  syncedFindings: number;
};

function tables() {
  const module =
    getDbType() === 'mysql'
      ? require('../database/tables-mysql')
      : require('../database/tables-enterprise');
  return {
    tasks: module.securityScanTasksTable,
    components: module.agentAssetComponentsTable,
    capabilityRegistry: module.capabilityComponentRegistryTable,
    capabilityRisks: module.capabilityRiskLibrariesTable,
    capabilityRules: module.capabilityRiskRulesTable,
    capabilityArtifacts: module.capabilityComponentArtifactsTable,
    scanFindings: module.securityScanFindingsTable,
    remediationTasks: module.securityRemediationTasksTable,
    reports: module.reportsTable,
  };
}

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Normalize skill/mcp identity so expense-approval.zip / Expense-Approval match. */
function normalizeIdentityToken(value: unknown): string {
  const raw = trimText(value);
  if (!raw) {
    return '';
  }
  const base = raw
    .replace(/\.(zip|md|markdown)$/i, '')
    .split(/[/\\]/)
    .pop()!;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function displayNameFromFile(fileName?: string, fallback = ''): string {
  const raw = trimText(fileName);
  if (!raw) {
    return fallback;
  }
  return (
    raw
      .replace(/\.(zip|md|markdown)$/i, '')
      .split(/[/\\]/)
      .pop() || fallback
  );
}

function findingFingerprint(componentKey: string, finding: CapabilityAuditFinding): string {
  const issue = trimText(finding.issue).toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
  const location = trimText(finding.location).toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
  return `${componentKey}::${issue}::${location}`;
}

function normalizeRiskLevel(level: unknown): 'critical' | 'high' | 'medium' | 'low' {
  const value = String(level || 'medium').toLowerCase();
  if (value === 'critical') {
    return 'critical';
  }
  if (value === 'high') {
    return 'high';
  }
  if (value === 'low') {
    return 'low';
  }
  return 'medium';
}

function isFormalFinding(finding: CapabilityAuditFinding): boolean {
  const status = finding.processingStatus;
  const category = String(finding.category || '').toUpperCase();
  if (category === 'SCAN_INTEGRITY' || finding.riskType === 'scan_integrity_risk') {
    return false;
  }
  if (/关键扫描引擎 .+ (?:执行失败|未执行)/i.test(String(finding.issue || ''))) {
    return false;
  }
  if (!status) {
    return true;
  }
  return status === 'confirmed' || status === 'suspected';
}

function inferSlug(fileName?: string, artifactKind: 'skills' | 'mcp' = 'skills'): string {
  return normalizeIdentityToken(fileName) || `${artifactKind}-${Date.now()}`;
}

function countByRisk(findings: CapabilityAuditFinding[]): {
  high: number;
  medium: number;
  low: number;
} {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const f of findings) {
    const level = normalizeRiskLevel(f.severity);
    if (level === 'critical' || level === 'high') {
      high += 1;
    } else if (level === 'medium') {
      medium += 1;
    } else {
      low += 1;
    }
  }
  return { high, medium, low };
}

function reportTypeForKind(kind: 'skills' | 'mcp'): 'skills_md_audit' | 'mcp_source_audit' {
  return kind === 'mcp' ? 'mcp_source_audit' : 'skills_md_audit';
}

function scanTypeLabel(kind: 'skills' | 'mcp'): string {
  return kind === 'mcp' ? 'MCP安全评估' : 'SKILLS安全评估';
}

function componentKindFor(kind: 'skills' | 'mcp'): string {
  return kind === 'mcp' ? 'mcp' : 'skill';
}

function registryIdentityTokens(row: {
  componentKey?: string | null;
  name?: string | null;
}): string[] {
  const key = normalizeIdentityToken(row.componentKey);
  const name = normalizeIdentityToken(row.name);
  return [...new Set([key, name].filter(Boolean))];
}

function registryMatchesIdentity(
  row: { componentKey?: string | null; name?: string | null },
  componentKey: string,
  componentName?: string,
): boolean {
  const rowTokens = new Set(registryIdentityTokens(row));
  const needles = [
    normalizeIdentityToken(componentKey),
    normalizeIdentityToken(componentName),
  ].filter(Boolean);
  return needles.some((token) => rowTokens.has(token));
}

function registryRecency(row: {
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
}): number {
  const updated = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  const created = row.createdAt ? new Date(row.createdAt).getTime() : 0;
  const updatedMs = Number.isFinite(updated) ? updated : 0;
  const createdMs = Number.isFinite(created) ? created : 0;
  return Math.max(updatedMs, createdMs);
}

/**
 * Soft-delete older duplicate registry rows that share the same MCP/Skills identity
 * (normalized componentKey / name). Keeps the most recently updated row.
 * Returns number of rows soft-deleted.
 */
export async function dedupeCapabilityRegistryIdentities(params: {
  organizationId: string;
  componentKind?: string;
  userId?: string | null;
}): Promise<number> {
  const { capabilityRegistry, capabilityRisks, components } = tables();
  const where = [
    eq(capabilityRegistry.organizationId, params.organizationId),
    isNull(capabilityRegistry.deletedAt),
  ];
  if (params.componentKind) {
    where.push(eq(capabilityRegistry.componentKind, params.componentKind));
  }

  const rows = await db
    .select()
    .from(capabilityRegistry)
    .where(and(...where));
  if (rows.length < 2) {
    return 0;
  }

  // Never collapse across kinds (e.g. skill vs mcp with the same name).
  const rowsByKind = new Map<string, typeof rows>();
  for (const row of rows) {
    const kind = String(row.componentKind || '').trim() || 'unknown';
    const list = rowsByKind.get(kind) || [];
    list.push(row);
    rowsByKind.set(kind, list);
  }

  const now = new Date();
  let deleted = 0;

  for (const kindRows of rowsByKind.values()) {
    if (kindRows.length < 2) {
      continue;
    }

    // Union-find so "key=a name=b" and "key=b name=b" collapse into one identity group.
    const parent = new Map<string, string>();
    const find = (id: string): string => {
      const current = parent.get(id) || id;
      if (current !== id) {
        const root = find(current);
        parent.set(id, root);
        return root;
      }
      return id;
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) {
        parent.set(ra, rb);
      }
    };

    const tokenToRowIds = new Map<string, string[]>();
    for (const row of kindRows) {
      parent.set(row.id, row.id);
      for (const token of registryIdentityTokens(row)) {
        const existing = tokenToRowIds.get(token) || [];
        for (const otherId of existing) {
          union(row.id, otherId);
        }
        existing.push(row.id);
        tokenToRowIds.set(token, existing);
      }
    }

    const groups = new Map<string, typeof kindRows>();
    for (const row of kindRows) {
      if (registryIdentityTokens(row).length === 0) {
        continue;
      }
      const root = find(row.id);
      const list = groups.get(root) || [];
      list.push(row);
      groups.set(root, list);
    }

    for (const group of groups.values()) {
      if (group.length < 2) {
        continue;
      }
      group.sort((a, b) => registryRecency(b) - registryRecency(a));
      const keep = group[0];
      const duplicates = group.slice(1);
      for (const dup of duplicates) {
        await db
          .update(capabilityRegistry)
          .set({ deletedAt: now, updatedAt: now, updatedBy: params.userId ?? null })
          .where(eq(capabilityRegistry.id, dup.id));
        await db
          .update(capabilityRisks)
          .set({ deletedAt: now, updatedAt: now, updatedBy: params.userId ?? null })
          .where(
            and(
              eq(capabilityRisks.organizationId, params.organizationId),
              eq(capabilityRisks.registryId, dup.id),
              isNull(capabilityRisks.deletedAt),
            ),
          );
        await db
          .update(components)
          .set({ sourceRefId: keep.id, updatedAt: now })
          .where(
            and(
              eq(components.organizationId, params.organizationId),
              eq(components.sourceRefId, dup.id),
            ),
          );
        deleted += 1;
      }
    }
  }

  if (deleted > 0) {
    logger.info('[capability-audit-sync] Deduped capability registry identities', {
      organizationId: params.organizationId,
      componentKind: params.componentKind,
      deleted,
    });
  }

  return deleted;
}

async function upsertCapabilityRegistry(params: {
  organizationId: string;
  userId: string | null;
  artifactKind: 'skills' | 'mcp';
  componentKey: string;
  componentName: string;
  overallRisk: string;
  reportId?: string;
  scanTaskId: string;
  findingsCount: number;
  summary: string;
  scannedFiles?: { path: string }[];
}): Promise<{ registryId: string; previousReportId?: string }> {
  const { capabilityRegistry, capabilityRisks, components } = tables();
  const kind = componentKindFor(params.artifactKind);
  const riskLevel = normalizeRiskLevel(params.overallRisk);
  const now = new Date();
  const componentKey = normalizeIdentityToken(params.componentKey) || params.componentKey;

  const candidates = await db
    .select()
    .from(capabilityRegistry)
    .where(
      and(
        eq(capabilityRegistry.organizationId, params.organizationId),
        eq(capabilityRegistry.componentKind, kind),
        isNull(capabilityRegistry.deletedAt),
      ),
    );

  const matches = candidates.filter((row) =>
    registryMatchesIdentity(row, componentKey, params.componentName),
  );
  // Keep the newest row as the canonical registry entry; soft-delete older duplicates.
  matches.sort((a, b) => registryRecency(b) - registryRecency(a));
  const existing = matches[0];
  const duplicates = matches.slice(1);

  const prevMeta =
    existing?.metadata && typeof existing.metadata === 'object'
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const previousReportId =
    typeof prevMeta.lastAuditReportId === 'string' ? prevMeta.lastAuditReportId : undefined;

  const scannedPaths = (params.scannedFiles || [])
    .map((f) => trimText(f.path))
    .filter(Boolean)
    .slice(0, 500);
  const auditMeta = {
    lastAuditReportId: params.reportId || previousReportId || null,
    lastAuditScanTaskId: params.scanTaskId,
    lastAuditedAt: now.toISOString(),
    findingsCount: params.findingsCount,
    overallRisk: riskLevel,
    source: 'capability_audit',
    componentKey,
    ...(scannedPaths.length > 0 ? { scannedFiles: scannedPaths } : {}),
  };

  let registryId: string;
  if (existing) {
    registryId = existing.id;
    await db
      .update(capabilityRegistry)
      .set({
        name: params.componentName || existing.name,
        componentKey,
        description: params.summary.slice(0, 2000) || existing.description,
        riskLevel,
        riskTitle: `${params.componentName} 安全评估风险`,
        lastDetectedAt: now,
        metadata: { ...prevMeta, ...auditMeta },
        updatedBy: params.userId,
        updatedAt: now,
      })
      .where(eq(capabilityRegistry.id, registryId));

    const riskRows = await db
      .select()
      .from(capabilityRisks)
      .where(
        and(
          eq(capabilityRisks.organizationId, params.organizationId),
          eq(capabilityRisks.registryId, registryId),
          isNull(capabilityRisks.deletedAt),
        ),
      );

    if (riskRows.length > 0) {
      await db
        .update(capabilityRisks)
        .set({
          componentName: params.componentName,
          componentKey,
          riskLevel,
          riskTitle: `${params.componentName} 安全评估风险`,
          description: params.summary.slice(0, 2000) || `${params.componentName} 能力组件风险画像`,
          metadata: { registryId, ...auditMeta },
          updatedBy: params.userId,
          updatedAt: now,
        })
        .where(eq(capabilityRisks.id, riskRows[0].id));

      // Soft-delete duplicate risk profiles for the same registry.
      for (const extra of riskRows.slice(1)) {
        await db
          .update(capabilityRisks)
          .set({ deletedAt: now, updatedAt: now, updatedBy: params.userId })
          .where(eq(capabilityRisks.id, extra.id));
      }
    } else {
      await db.insert(capabilityRisks).values({
        id: uuidv4(),
        organizationId: params.organizationId,
        registryId,
        componentKind: kind,
        componentName: params.componentName,
        componentKey,
        riskTitle: `${params.componentName} 安全评估风险`,
        riskLevel,
        source: 'capability_audit',
        affectedAssets: 0,
        ruleCount: 0,
        description: params.summary.slice(0, 2000) || `${params.componentName} 能力组件风险画像`,
        checks: [],
        enabled: true,
        status: 'active',
        metadata: { registryId, ...auditMeta },
        createdBy: params.userId,
        updatedBy: params.userId,
      });
    }

    // Soft-delete duplicate registry rows for the same skill identity.
    for (const dup of duplicates) {
      await db
        .update(capabilityRegistry)
        .set({ deletedAt: now, updatedAt: now, updatedBy: params.userId })
        .where(eq(capabilityRegistry.id, dup.id));
      await db
        .update(capabilityRisks)
        .set({ deletedAt: now, updatedAt: now, updatedBy: params.userId })
        .where(
          and(
            eq(capabilityRisks.organizationId, params.organizationId),
            eq(capabilityRisks.registryId, dup.id),
            isNull(capabilityRisks.deletedAt),
          ),
        );
      await db
        .update(components)
        .set({ sourceRefId: registryId, updatedAt: now })
        .where(
          and(
            eq(components.organizationId, params.organizationId),
            eq(components.sourceRefId, dup.id),
          ),
        );
    }
  } else {
    registryId = uuidv4();
    await db.insert(capabilityRegistry).values({
      id: registryId,
      organizationId: params.organizationId,
      componentKind: kind,
      name: params.componentName,
      componentKey,
      description: params.summary.slice(0, 2000) || null,
      source: 'capability_audit',
      permissionScope: {},
      checks: [],
      riskLevel,
      riskTitle: `${params.componentName} 安全评估风险`,
      enabled: true,
      status: 'active',
      hasPackage: false,
      lastDetectedAt: now,
      metadata: auditMeta,
      createdBy: params.userId,
      updatedBy: params.userId,
    });

    await db.insert(capabilityRisks).values({
      id: uuidv4(),
      organizationId: params.organizationId,
      registryId,
      componentKind: kind,
      componentName: params.componentName,
      componentKey,
      riskTitle: `${params.componentName} 安全评估风险`,
      riskLevel,
      source: 'capability_audit',
      affectedAssets: 0,
      ruleCount: 0,
      description: params.summary.slice(0, 2000) || `${params.componentName} 能力组件风险画像`,
      checks: [],
      enabled: true,
      status: 'active',
      metadata: { registryId, ...auditMeta },
      createdBy: params.userId,
      updatedBy: params.userId,
    });
  }

  const assetComponents = await db
    .select()
    .from(components)
    .where(
      and(eq(components.organizationId, params.organizationId), eq(components.componentType, kind)),
    );

  for (const row of assetComponents) {
    const rowKey = normalizeIdentityToken(row.componentKey);
    const rowName = normalizeIdentityToken(row.componentName);
    const linked =
      row.sourceRefId === registryId || rowKey === componentKey || rowName === componentKey;
    if (!linked) {
      continue;
    }
    const prevSnapshot =
      row.configSnapshot && typeof row.configSnapshot === 'object'
        ? (row.configSnapshot as Record<string, unknown>)
        : {};
    await db
      .update(components)
      .set({
        highRisk: riskLevel === 'high' || riskLevel === 'critical',
        sensitiveLevel: riskLevel,
        sourceRefId: row.sourceRefId || registryId,
        componentKey: row.componentKey || componentKey,
        configSnapshot: {
          ...prevSnapshot,
          ...auditMeta,
        },
        updatedAt: now,
      })
      .where(eq(components.id, row.id));
  }

  return { registryId, previousReportId };
}

async function loadOpenCapabilityRemediations(
  organizationId: string,
  componentKey: string,
): Promise<
  Array<{
    remediationId: string;
    findingId: string;
    fingerprint: string;
  }>
> {
  const { remediationTasks, scanFindings } = tables();
  const rows = await db
    .select({
      remediationId: remediationTasks.id,
      findingId: remediationTasks.findingId,
      metadata: remediationTasks.metadata,
      evidence: scanFindings.evidence,
      status: remediationTasks.status,
    })
    .from(remediationTasks)
    .leftJoin(scanFindings, eq(scanFindings.id, remediationTasks.findingId))
    .where(
      and(eq(remediationTasks.organizationId, organizationId), eq(remediationTasks.status, 'open')),
    );

  const out: Array<{ remediationId: string; findingId: string; fingerprint: string }> = [];
  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {};
    const evidence =
      row.evidence && typeof row.evidence === 'object'
        ? (row.evidence as Record<string, unknown>)
        : {};
    if (meta.source !== 'capability_audit_push' && evidence.mode !== 'capability_audit') {
      continue;
    }
    const key = normalizeIdentityToken(evidence.componentKey || meta.componentKey);
    if (key !== componentKey) {
      continue;
    }
    const fingerprint =
      trimText(evidence.fingerprint) ||
      trimText(meta.fingerprint) ||
      `${componentKey}::${trimText(meta.title || '')}`;
    out.push({
      remediationId: row.remediationId,
      findingId: row.findingId,
      fingerprint,
    });
  }
  return out;
}

/**
 * Persist a completed capability audit into reports, risk closed-loop, and component registry.
 * Same skill/MCP identity is upserted to one capability-component row; open remediations are reused.
 */
async function persistCapabilityAuditPackage(params: {
  organizationId: string;
  userId: string | null;
  registryId: string;
  archiveBuffer: Buffer;
  archiveFileName: string;
}): Promise<void> {
  const { capabilityRegistry, capabilityArtifacts } = tables();
  const parsed = parseCapabilityZipBuffer(params.archiveBuffer, params.archiveFileName);
  const storagePath = buildCapabilityArtifactStoragePath(
    params.organizationId,
    params.registryId,
    parsed.contentHash,
    params.archiveFileName,
  );
  writeCapabilityArtifactFile(storagePath, params.archiveBuffer);

  await db
    .update(capabilityArtifacts)
    .set({ isCurrent: false })
    .where(
      and(
        eq(capabilityArtifacts.organizationId, params.organizationId),
        eq(capabilityArtifacts.registryId, params.registryId),
        eq(capabilityArtifacts.isCurrent, true),
      ),
    );

  const artifactId = uuidv4();
  await db.insert(capabilityArtifacts).values({
    id: artifactId,
    organizationId: params.organizationId,
    registryId: params.registryId,
    fileName: params.archiveFileName,
    contentHash: parsed.contentHash,
    storagePath,
    fileSize: parsed.fileSize,
    fileTreeJson: parsed.fileTree,
    skillMdExcerpt: parsed.skillMdExcerpt,
    isCurrent: true,
    metadata: {
      source: 'capability_audit',
      inferredName: parsed.inferredName,
      inferredKey: parsed.inferredKey,
      inferredVersion: parsed.inferredVersion,
    },
    createdBy: params.userId,
  });

  const patch: Record<string, unknown> = {
    hasPackage: true,
    updatedBy: params.userId,
    updatedAt: new Date(),
  };
  if (parsed.inferredVersion) {
    patch.version = parsed.inferredVersion;
  }
  await db
    .update(capabilityRegistry)
    .set(patch)
    .where(eq(capabilityRegistry.id, params.registryId));
}

async function syncCapabilityAuditRules(params: {
  organizationId: string;
  userId: string | null;
  registryId: string;
  findings: CapabilityAuditFinding[];
}): Promise<number> {
  const { capabilityRisks, capabilityRules } = tables();
  const [risk] = await db
    .select()
    .from(capabilityRisks)
    .where(
      and(
        eq(capabilityRisks.organizationId, params.organizationId),
        eq(capabilityRisks.registryId, params.registryId),
        isNull(capabilityRisks.deletedAt),
      ),
    )
    .limit(1);
  if (!risk) {
    return 0;
  }

  // Replace previous audit-synced rules for this library so re-runs stay current.
  const existingRules = await db
    .select()
    .from(capabilityRules)
    .where(
      and(
        eq(capabilityRules.organizationId, params.organizationId),
        eq(capabilityRules.riskLibraryId, risk.id),
      ),
    );
  for (const rule of existingRules) {
    const cfg =
      rule.ruleConfig && typeof rule.ruleConfig === 'object'
        ? (rule.ruleConfig as Record<string, unknown>)
        : {};
    if (cfg.source === 'capability_audit' || String(rule.ruleCode || '').startsWith('CAP-AUDIT-')) {
      await db
        .delete(capabilityRules)
        .where(
          and(
            eq(capabilityRules.organizationId, params.organizationId),
            eq(capabilityRules.id, rule.id),
          ),
        );
    }
  }

  const formal = params.findings.filter(isFormalFinding);
  let created = 0;
  for (const [index, finding] of formal.entries()) {
    const ruleCode = `CAP-AUDIT-${String(index + 1).padStart(3, '0')}-${normalizeIdentityToken(
      finding.dimension || finding.category || finding.issue || 'finding',
    ).slice(0, 40)}`;
    try {
      await db.insert(capabilityRules).values({
        id: uuidv4(),
        organizationId: params.organizationId,
        riskLibraryId: risk.id,
        ruleCode: `${ruleCode}-${params.registryId.replace(/-/g, '').slice(0, 8)}`.slice(0, 128),
        name: (finding.issue || '安全发现').slice(0, 255),
        checkTarget: (finding.location || finding.sourceFile || finding.dimension || 'mcp').slice(
          0,
          128,
        ),
        ruleType: 'static',
        severity: normalizeRiskLevel(finding.severity),
        ruleConfig: {
          source: 'capability_audit',
          category: finding.category,
          dimension: finding.dimension,
          evidence: finding.evidence,
          location: finding.location,
          sourceFile: finding.sourceFile,
        },
        remediation: finding.recommendation || null,
        enabled: true,
      });
      created += 1;
    } catch (error) {
      logger.warn('[capability-audit-sync] Failed to insert capability rule', {
        ruleCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await db
    .update(capabilityRisks)
    .set({
      ruleCount: created,
      updatedBy: params.userId,
      updatedAt: new Date(),
    })
    .where(eq(capabilityRisks.id, risk.id));

  return created;
}

export async function syncCapabilityAuditResult(
  input: CapabilityAuditSyncInput,
): Promise<CapabilityAuditSyncResult> {
  const { tasks, scanFindings, remediationTasks, capabilityRegistry, reports } = tables();
  const formalFindings = input.auditData.findings.filter(isFormalFinding);
  const counts = countByRisk(formalFindings);
  const componentKey =
    normalizeIdentityToken(input.componentKey) || inferSlug(input.fileName, input.artifactKind);
  const componentName =
    trimText(input.componentName) ||
    displayNameFromFile(input.fileName, componentKey) ||
    componentKey;

  // Peek existing registry so we can reuse its report when re-analyzing the same skill.
  const kind = componentKindFor(input.artifactKind);
  const existingRegistryRows = await db
    .select()
    .from(capabilityRegistry)
    .where(
      and(
        eq(capabilityRegistry.organizationId, input.organizationId),
        eq(capabilityRegistry.componentKind, kind),
        isNull(capabilityRegistry.deletedAt),
      ),
    );
  const existingMatches = existingRegistryRows
    .filter((row) => registryMatchesIdentity(row, componentKey, componentName))
    .sort((a, b) => registryRecency(b) - registryRecency(a));
  const existingRegistry = existingMatches[0];
  const existingMeta =
    existingRegistry?.metadata && typeof existingRegistry.metadata === 'object'
      ? (existingRegistry.metadata as Record<string, unknown>)
      : {};
  const reusableReportId =
    trimText(input.existingReportId) ||
    (typeof existingMeta.lastAuditReportId === 'string'
      ? existingMeta.lastAuditReportId
      : undefined);

  let reportId = reusableReportId;
  try {
    const nextReportId = await reportService.createAuditReport(
      input.organizationId,
      input.auditData as any,
      {
        fileName: input.fileName || componentName,
        reportType: reportTypeForKind(input.artifactKind),
      },
    );
    if (reusableReportId) {
      // Keep a single current report per skill: copy newest content onto the existing report, drop the temp one.
      const [fresh] = await db
        .select()
        .from(reports)
        .where(and(eq(reports.id, nextReportId), eq(reports.organizationId, input.organizationId)))
        .limit(1);
      if (fresh) {
        await db
          .update(reports)
          .set({
            title: fresh.title,
            content: fresh.content,
            filePath: fresh.filePath,
            fileSize: fresh.fileSize,
            metadata: {
              ...(fresh.metadata && typeof fresh.metadata === 'object'
                ? (fresh.metadata as Record<string, unknown>)
                : {}),
              componentKey,
              componentName,
              reusedFromReportId: nextReportId,
              updatedAt: new Date().toISOString(),
            },
          })
          .where(
            and(eq(reports.id, reusableReportId), eq(reports.organizationId, input.organizationId)),
          );
        try {
          await db
            .delete(reports)
            .where(
              and(eq(reports.id, nextReportId), eq(reports.organizationId, input.organizationId)),
            );
        } catch {
          // Best-effort cleanup of the temporary report row.
        }
        reportId = reusableReportId;
      } else {
        reportId = nextReportId;
      }
    } else {
      reportId = nextReportId;
    }
  } catch (error) {
    logger.warn('[capability-audit-sync] Failed to create/update report', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const scanTaskId = uuidv4();
  const now = new Date();
  await db.insert(tasks).values({
    id: scanTaskId,
    organizationId: input.organizationId,
    assetId: null,
    assetCode: null,
    assetName: componentName,
    assetVersion: null,
    assetSnapshotId: null,
    componentVersions: [],
    name: `${scanTypeLabel(input.artifactKind)} · ${componentName}`,
    source: 'capability_audit',
    scanType: scanTypeLabel(input.artifactKind),
    targetKind: kind,
    targetSummary: input.fileName || componentName,
    status: 'completed',
    progress: 100,
    highCount: counts.high,
    mediumCount: counts.medium,
    lowCount: counts.low,
    ownerName: null,
    runConfig: {
      artifactKind: input.artifactKind,
      capabilityScanTaskId: input.capabilityScanTaskId || null,
      componentKey,
    },
    metadata: {
      source: 'capability_audit',
      artifactKind: input.artifactKind,
      reportId: reportId || null,
      capabilityScanTaskId: input.capabilityScanTaskId || null,
      componentKey,
      componentName,
      overallRisk: normalizeRiskLevel(input.auditData.overallRisk),
      findingsCount: formalFindings.length,
      auditReportNo: `CAP-${now.toISOString().slice(0, 7).replace('-', '')}-${scanTaskId.replace(/-/g, '').slice(-6).toUpperCase()}`,
    },
    createdBy: input.userId,
    updatedBy: input.userId,
    startedAt: now,
    completedAt: now,
  });

  const findingIds: string[] = [];
  const remediationIds: string[] = [];
  const taskCtx = {
    id: scanTaskId,
    assetId: null,
    assetVersion: null,
    assetSnapshotId: null,
    componentVersions: [],
    ownerName: null,
  };

  const openRemediations = await loadOpenCapabilityRemediations(input.organizationId, componentKey);
  const openByFingerprint = new Map(openRemediations.map((row) => [row.fingerprint, row]));

  for (const [index, finding] of formalFindings.entries()) {
    const title = finding.issue || '能力组件安全风险';
    const fingerprint = findingFingerprint(componentKey, finding);
    const category =
      finding.dimension ||
      finding.category ||
      finding.riskType ||
      scanTypeLabel(input.artifactKind);
    const description = [finding.location, finding.evidence].filter(Boolean).join('\n');
    const recommendation = finding.recommendation || '请根据评估建议完成整改后复测。';
    const riskLevel = normalizeRiskLevel(finding.severity);
    const evidence = {
      mode: 'capability_audit',
      artifactKind: input.artifactKind,
      sourceFile: finding.sourceFile || null,
      location: finding.location,
      dimension: finding.dimension || null,
      processingStatus: finding.processingStatus || null,
      reportId: reportId || null,
      capabilityScanTaskId: input.capabilityScanTaskId || null,
      componentKey,
      componentName,
      fingerprint,
      violationNo: `RSK-CAP-${now.toISOString().slice(0, 7).replace('-', '')}-${String(index + 1).padStart(2, '0')}`,
    };

    try {
      const existingOpen = openByFingerprint.get(fingerprint);
      if (existingOpen) {
        await db
          .update(scanFindings)
          .set({
            taskId: scanTaskId,
            title,
            riskLevel,
            category,
            description,
            evidence,
            recommendation,
            status: 'open',
            updatedAt: now,
          })
          .where(
            and(
              eq(scanFindings.organizationId, input.organizationId),
              eq(scanFindings.id, existingOpen.findingId),
            ),
          );

        const due = new Date();
        due.setDate(due.getDate() + (riskLevel === 'critical' ? 3 : riskLevel === 'high' ? 7 : 14));
        await db
          .update(remediationTasks)
          .set({
            taskId: scanTaskId,
            title: `整改：${title}`,
            riskLevel,
            remediationAdvice: recommendation,
            dueAt: due,
            metadata: {
              source: 'capability_audit_push',
              category,
              violationNo: evidence.violationNo,
              needsConfirmation: false,
              componentKey,
              componentName,
              fingerprint,
              reportId: reportId || null,
            },
            updatedBy: input.userId,
            updatedAt: now,
          })
          .where(
            and(
              eq(remediationTasks.organizationId, input.organizationId),
              eq(remediationTasks.id, existingOpen.remediationId),
            ),
          );

        findingIds.push(existingOpen.findingId);
        remediationIds.push(existingOpen.remediationId);
        openByFingerprint.delete(fingerprint);
        continue;
      }

      const { findingId, remediationId } = await createScanFindingAndRemediation({
        organizationId: input.organizationId,
        userId: input.userId,
        task: taskCtx,
        title,
        riskLevel,
        category,
        description,
        recommendation,
        evidence,
        remediationSource: 'capability_audit_push',
      });
      findingIds.push(findingId);
      remediationIds.push(remediationId);
    } catch (error) {
      logger.warn('[capability-audit-sync] Failed to create/update finding/remediation', {
        issue: finding.issue,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let registryId: string | undefined;
  try {
    const upserted = await upsertCapabilityRegistry({
      organizationId: input.organizationId,
      userId: input.userId,
      artifactKind: input.artifactKind,
      componentKey,
      componentName,
      overallRisk: input.auditData.overallRisk,
      reportId,
      scanTaskId,
      findingsCount: formalFindings.length,
      summary: input.auditData.summary || '',
      scannedFiles: input.auditData.scannedFiles,
    });
    registryId = upserted.registryId;

    if (input.archiveBuffer && input.archiveBuffer.byteLength > 0) {
      try {
        await persistCapabilityAuditPackage({
          organizationId: input.organizationId,
          userId: input.userId,
          registryId,
          archiveBuffer: input.archiveBuffer,
          archiveFileName:
            trimText(input.archiveFileName) ||
            trimText(input.fileName) ||
            `${componentKey || input.artifactKind}.zip`,
        });
      } catch (error) {
        logger.warn('[capability-audit-sync] Failed to persist capability package', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      await syncCapabilityAuditRules({
        organizationId: input.organizationId,
        userId: input.userId,
        registryId,
        findings: input.auditData.findings,
      });
    } catch (error) {
      logger.warn('[capability-audit-sync] Failed to sync capability rules', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    logger.warn('[capability-audit-sync] Failed to sync capability component registry', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info('[capability-audit-sync] Synced capability audit', {
    organizationId: input.organizationId,
    artifactKind: input.artifactKind,
    componentKey,
    reportId,
    scanTaskId,
    syncedFindings: findingIds.length,
    registryId,
  });

  return {
    reportId,
    scanTaskId,
    findingIds,
    remediationIds,
    registryId,
    syncedFindings: findingIds.length,
  };
}
