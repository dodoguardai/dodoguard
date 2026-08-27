/**
 * Aggregate timeline events for a finding (baseline task, scans, retests, conclusion).
 */

import { and, asc, desc, eq } from 'drizzle-orm';
import { db, getDbType } from '../database';
import { findingsService } from './findingsService';

export type TimelineEventType = 'scan' | 'test' | 'finding' | 'retest' | 'conclusion';

export type TimelineEventStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  summary?: string;
  at: string;
  status: TimelineEventStatus;
  refs?: { taskId?: string; findingId?: string; scanRunId?: string };
  parentEventId?: string;
  retestFindingStatus?: 'old_fixed' | 'old_unfixed' | 'new' | 'unknown';
  retestFindingStatusReason?: string;
}

export interface FindingTimelineResult {
  events: TimelineEvent[];
  agentId?: string;
  agentName?: string;
  baselineTaskId: string;
  highlightFindingId: string;
}

function getAttackTasksTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return mysqlTables.attackTasksTable;
  }
  const pgTables = require('../database/tables-enterprise');
  return pgTables.attackTasksTable;
}

function getAttackResultsTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return mysqlTables.attackResultsTable;
  }
  const pgTables = require('../database/tables-enterprise');
  return pgTables.attackResultsTable;
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw == null) {
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return typeof p === 'object' && p != null && !Array.isArray(p)
        ? { ...(p as Record<string, unknown>) }
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function toIsoOrUndefined(d: unknown): string | undefined {
  if (d instanceof Date) {
    const t = d.getTime();
    return Number.isFinite(t) ? d.toISOString() : undefined;
  }
  if (typeof d === 'string' || typeof d === 'number') {
    const parsed = new Date(d);
    const t = parsed.getTime();
    return Number.isFinite(t) ? parsed.toISOString() : undefined;
  }
  return undefined;
}

function toIso(d: unknown, fallback?: unknown): string {
  return toIsoOrUndefined(d) ?? toIsoOrUndefined(fallback) ?? new Date(0).toISOString();
}

function latestEventAt(events: TimelineEvent[], fallback?: unknown): string {
  let latest = Number.NaN;
  for (const event of events) {
    const t = new Date(event.at).getTime();
    if (!Number.isFinite(t)) {
      continue;
    }
    if (!Number.isFinite(latest) || t > latest) {
      latest = t;
    }
  }
  if (Number.isFinite(latest)) {
    return new Date(latest).toISOString();
  }
  return toIso(fallback);
}

function mapTaskStatus(s: string | null | undefined): TimelineEventStatus {
  const v = String(s ?? '').toLowerCase();
  if (v === 'running') {
    return 'running';
  }
  if (v === 'completed') {
    return 'succeeded';
  }
  if (v === 'failed') {
    return 'failed';
  }
  if (v === 'cancelled' || v === 'canceled') {
    return 'skipped';
  }
  return 'pending';
}

function mapScanStatus(s: string | null | undefined): TimelineEventStatus {
  const v = String(s ?? '').toLowerCase();
  if (v === 'running') {
    return 'running';
  }
  if (v === 'completed' || v === 'succeeded') {
    return 'succeeded';
  }
  if (v === 'failed') {
    return 'failed';
  }
  return 'pending';
}

function normalizeRiskLevel(v: unknown): 'high' | 'medium' | 'low' {
  const s = String(v ?? '').toLowerCase();
  if (s === 'critical' || s === 'high') {
    return 'high';
  }
  if (s === 'medium') {
    return 'medium';
  }
  return 'low';
}

function getScanRunId(row: Record<string, unknown>): string {
  const req = (row.request ?? {}) as Record<string, unknown>;
  const runIdRaw = row.scanRunId ?? req.scanRunId;
  return String(runIdRaw ?? '').trim();
}

function pickLatestRunRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  type Bucket = { t: number; rows: Array<Record<string, unknown>> };
  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const runId = getScanRunId(row);
    if (!runId) {
      continue;
    }
    const created = new Date(String(row.createdAt ?? '')).getTime();
    const prev = buckets.get(runId);
    if (prev) {
      prev.rows.push(row);
      if (Number.isFinite(created) && created > prev.t) {
        prev.t = created;
      }
    } else {
      buckets.set(runId, { t: Number.isFinite(created) ? created : 0, rows: [row] });
    }
  }
  if (buckets.size === 0) {
    return rows;
  }
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => a.t - b.t);
  const latest = sortedBuckets[sortedBuckets.length - 1];
  return latest?.rows ?? rows;
}

function toVulnerableSet(rows: Array<Record<string, unknown>>) {
  const ids = new Set<string>();
  const riskById = new Map<string, 'high' | 'medium' | 'low'>();
  for (const row of rows) {
    const vid = String(row.vulnerabilityId ?? '').trim();
    if (!vid) {
      continue;
    }
    const verdict = (row.finalVerdict ?? {}) as Record<string, unknown>;
    const vulnerable =
      verdict.vulnerable === true || String(verdict.vulnerable ?? '').toLowerCase() === 'true';
    if (!vulnerable) {
      continue;
    }
    const level = normalizeRiskLevel(verdict.riskLevel);
    const prev = riskById.get(vid);
    if (
      !prev ||
      (prev !== 'high' && (level === 'high' || (level === 'medium' && prev === 'low')))
    ) {
      riskById.set(vid, level);
    }
  }
  for (const id of riskById.keys()) {
    ids.add(id);
  }
  return ids;
}

function classifyRetestFindingStatus(
  baselineRows: Array<Record<string, unknown>>,
  currentRows: Array<Record<string, unknown>>,
  vulnerabilityId: string,
): { status: 'old_fixed' | 'old_unfixed' | 'new' | 'unknown'; reason?: string } {
  if (!vulnerabilityId) {
    return { status: 'unknown', reason: 'Missing vulnerability ID for this finding.' };
  }
  if (currentRows.length === 0) {
    return { status: 'unknown', reason: 'No attack results found for this retest task yet.' };
  }
  const baselineSet = toVulnerableSet(pickLatestRunRows(baselineRows));
  const currentSet = toVulnerableSet(pickLatestRunRows(currentRows));
  const inBaseline = baselineSet.has(vulnerabilityId);
  const inCurrent = currentSet.has(vulnerabilityId);

  if (!inBaseline && inCurrent) {
    return { status: 'new' };
  }
  if (inBaseline && inCurrent) {
    return { status: 'old_unfixed' };
  }
  if (inBaseline && !inCurrent) {
    return { status: 'old_fixed' };
  }
  return {
    status: 'unknown',
    reason: 'This finding was not marked vulnerable in baseline or current comparable runs.',
  };
}

export async function getTimelineForFinding(
  findingId: string,
  organizationId: string,
): Promise<FindingTimelineResult | null> {
  const finding = await findingsService.getById(findingId, organizationId);
  if (!finding?.taskId) {
    return null;
  }

  const table = getAttackTasksTable();
  if (!table) {
    return null;
  }

  const [baseline] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, finding.taskId), eq(table.organizationId, organizationId)))
    .limit(1);

  if (!baseline) {
    return null;
  }

  const baselineEventId = `task-${baseline.id}`;
  const events: TimelineEvent[] = [];
  const attackResultsTable = getAttackResultsTable();
  const baselineRowsForComparison =
    attackResultsTable && finding.vulnerabilityId
      ? ((await db
          .select({
            vulnerabilityId: attackResultsTable.vulnerabilityId,
            finalVerdict: attackResultsTable.finalVerdict,
            request: attackResultsTable.request,
            scanRunId: attackResultsTable.scanRunId,
            createdAt: attackResultsTable.createdAt,
          })
          .from(attackResultsTable)
          .where(eq(attackResultsTable.taskId, baseline.id))) as Array<Record<string, unknown>>)
      : [];

  events.push({
    id: baselineEventId,
    type: 'test',
    title: `Attack task: ${baseline.name}`,
    summary: baseline.status ? `Status: ${baseline.status}` : undefined,
    at: toIso(baseline.createdAt),
    status: mapTaskStatus(baseline.status),
    refs: { taskId: baseline.id },
  });

  const dbType = getDbType();

  if (dbType === 'mysql') {
    const { scanRunsTable } = require('../database/tables-mysql');
    const scans = await db
      .select()
      .from(scanRunsTable)
      .where(eq(scanRunsTable.taskId, baseline.id))
      .orderBy(asc(scanRunsTable.createdAt));
    for (const sc of scans) {
      events.push({
        id: `scan-${sc.id}`,
        type: 'scan',
        title: 'Scan run',
        summary: sc.status ? `Status: ${sc.status}` : undefined,
        at: toIso(sc.startedAt ?? sc.createdAt, baseline.createdAt),
        status: mapScanStatus(sc.status),
        refs: { scanRunId: sc.id, taskId: baseline.id },
        parentEventId: baselineEventId,
      });
    }

    const retests = await db
      .select()
      .from(table)
      .where(and(eq(table.organizationId, organizationId), eq(table.retestOfTaskId, baseline.id)))
      .orderBy(asc(table.createdAt));

    for (const rt of retests) {
      const rid = `retest-${rt.id}`;
      let retestFindingStatus: TimelineEvent['retestFindingStatus'] = 'unknown';
      let retestFindingStatusReason: string | undefined;
      if (mapTaskStatus(rt.status) !== 'succeeded') {
        retestFindingStatusReason = 'Retest task is not completed yet.';
      }
      if (attackResultsTable && finding.vulnerabilityId) {
        const rows = (await db
          .select({
            vulnerabilityId: attackResultsTable.vulnerabilityId,
            finalVerdict: attackResultsTable.finalVerdict,
            request: attackResultsTable.request,
            scanRunId: attackResultsTable.scanRunId,
            createdAt: attackResultsTable.createdAt,
          })
          .from(attackResultsTable)
          .where(eq(attackResultsTable.taskId, rt.id))) as Array<Record<string, unknown>>;
        const classified = classifyRetestFindingStatus(
          baselineRowsForComparison,
          rows,
          String(finding.vulnerabilityId),
        );
        retestFindingStatus = classified.status;
        retestFindingStatusReason = classified.reason ?? retestFindingStatusReason;
      } else if (!finding.vulnerabilityId) {
        retestFindingStatusReason = 'Missing vulnerability ID for this finding.';
      }
      events.push({
        id: rid,
        type: 'retest',
        title: `Retest: ${rt.name}`,
        summary: rt.status ? `Status: ${rt.status}` : undefined,
        at: toIso(rt.createdAt, baseline.createdAt),
        status: mapTaskStatus(rt.status),
        refs: { taskId: rt.id },
        parentEventId: baselineEventId,
        retestFindingStatus,
        retestFindingStatusReason,
      });
      const scansRt = await db
        .select()
        .from(scanRunsTable)
        .where(eq(scanRunsTable.taskId, rt.id))
        .orderBy(asc(scanRunsTable.createdAt));
      for (const sc of scansRt) {
        events.push({
          id: `scan-${sc.id}`,
          type: 'scan',
          title: 'Scan run (retest)',
          summary: sc.status ? `Status: ${sc.status}` : undefined,
          at: toIso(sc.startedAt ?? sc.createdAt, rt.createdAt ?? baseline.createdAt),
          status: mapScanStatus(sc.status),
          refs: { scanRunId: sc.id, taskId: rt.id },
          parentEventId: rid,
        });
      }
    }
  } else {
    const orgTasks = await db
      .select()
      .from(table)
      .where(eq(table.organizationId, organizationId))
      .orderBy(desc(table.createdAt))
      .limit(400);
    const retests = orgTasks.filter((t: { metadata?: unknown }) => {
      const m = parseMetadata(t.metadata);
      return String(m.retestOfTaskId ?? '') === String(baseline.id);
    });
    retests.sort(
      (a: { createdAt?: unknown }, b: { createdAt?: unknown }) =>
        new Date(toIso(a.createdAt)).getTime() - new Date(toIso(b.createdAt)).getTime(),
    );
    for (const rt of retests) {
      const rid = `retest-${(rt as { id: string }).id}`;
      let retestFindingStatus: TimelineEvent['retestFindingStatus'] = 'unknown';
      let retestFindingStatusReason: string | undefined;
      if (mapTaskStatus((rt as { status?: string }).status) !== 'succeeded') {
        retestFindingStatusReason = 'Retest task is not completed yet.';
      }
      if (attackResultsTable && finding.vulnerabilityId) {
        const rows = (await db
          .select({
            vulnerabilityId: attackResultsTable.vulnerabilityId,
            finalVerdict: attackResultsTable.finalVerdict,
            request: attackResultsTable.request,
            scanRunId: attackResultsTable.scanRunId,
            createdAt: attackResultsTable.createdAt,
          })
          .from(attackResultsTable)
          .where(eq(attackResultsTable.taskId, (rt as { id: string }).id))) as Array<
          Record<string, unknown>
        >;
        const classified = classifyRetestFindingStatus(
          baselineRowsForComparison,
          rows,
          String(finding.vulnerabilityId),
        );
        retestFindingStatus = classified.status;
        retestFindingStatusReason = classified.reason ?? retestFindingStatusReason;
      } else if (!finding.vulnerabilityId) {
        retestFindingStatusReason = 'Missing vulnerability ID for this finding.';
      }
      events.push({
        id: rid,
        type: 'retest',
        title: `Retest: ${(rt as { name: string }).name}`,
        summary: (rt as { status?: string }).status
          ? `Status: ${(rt as { status?: string }).status}`
          : undefined,
        at: toIso((rt as { createdAt?: unknown }).createdAt, baseline.createdAt),
        status: mapTaskStatus((rt as { status?: string }).status),
        refs: { taskId: (rt as { id: string }).id },
        parentEventId: baselineEventId,
        retestFindingStatus,
        retestFindingStatusReason,
      });
    }
  }

  events.push({
    id: `finding-${findingId}`,
    type: 'finding',
    title: `Finding: ${finding.vulnerabilityName}`,
    summary:
      finding.finalVerdict?.reason ||
      (finding.finalVerdict?.vulnerable ? 'Marked vulnerable' : 'Not vulnerable'),
    at: toIso(finding.detectedAt, baseline.createdAt),
    status: 'succeeded',
    refs: { findingId, taskId: finding.taskId },
    parentEventId: baselineEventId,
  });

  events.push({
    id: `conclusion-${findingId}`,
    type: 'conclusion',
    title: 'Finding workflow status',
    summary: `Status: ${finding.status}`,
    // Keep conclusion aligned with the latest workflow event shown above.
    at: latestEventAt(events, finding.detectedAt ?? baseline.createdAt),
    status: 'succeeded',
    refs: { findingId },
    parentEventId: `finding-${findingId}`,
  });

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    events,
    agentId: finding.agentId,
    agentName: finding.agentName,
    baselineTaskId: baseline.id,
    highlightFindingId: findingId,
  };
}
