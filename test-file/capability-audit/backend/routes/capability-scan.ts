/**
 * Capability scan API - multi-engine orchestration.
 *
 * Legacy path:
 * - POST /api/v1/capability-scan/analyze
 * - POST /api/v1/capability-scan/tasks
 * - GET  /api/v1/capability-scan/tasks/:id
 *
 * Word-plan path:
 * - POST /api/v1/capability-scans
 * - GET  /api/v1/capability-scans/:id
 * - GET  /api/v1/capability-scans/:id/findings
 * - GET  /api/v1/capability-scans/:id/assets
 * - GET  /api/v1/capability-scans/:id/artifacts
 * - POST /api/v1/capability-scans/:id/cancel
 */

import { randomUUID } from 'node:crypto';

import express from 'express';
import multer from 'multer';

import logger from '../../../backend/src/logger';
import { syncCapabilityAuditResult } from '../../../backend/src/services/capabilityAuditSyncService';
import { MAX_SKILL_ZIP_BYTES } from '../../../backend/src/services/skillPackageExtract';
import { notifyScanCallback } from '../scan/callbacks';
import { toLegacyAuditShape } from '../scan/merge';
import { parseScanRequest, resolveScanInput } from '../scan/parse-request';
import { runCapabilityScan } from '../scan/runner';
import { capabilityScanToSarif } from '../scan/sarif';
import {
  cancelScanTask,
  createScanTask,
  getScanTask,
  listScanTasks,
  updateScanTask,
  type ScanTaskRecord,
} from '../scan/task-store';

type AuthUser = {
  organizationId?: string;
  id?: string;
  userId?: string;
};

function authFromRequest(req: express.Request): {
  organizationId?: string;
  userId: string | null;
} {
  const user = (req as express.Request & { user?: AuthUser }).user;
  return {
    organizationId: user?.organizationId,
    userId: user?.id || user?.userId || null,
  };
}

async function persistAuditOutputs(
  auth: { organizationId?: string; userId: string | null },
  params: {
    result: Awaited<ReturnType<typeof runCapabilityScan>>;
    fileName?: string;
  },
): Promise<{
  reportId?: string;
  scanTaskId?: string;
  remediationIds?: string[];
  registryId?: string;
  syncedFindings?: number;
}> {
  const { organizationId, userId } = auth;
  if (!organizationId || params.result.status === 'failed') {
    return {};
  }

  const artifactKind = params.result.artifactKind;
  const auditData = toLegacyAuditShape(params.result);

  try {
    const sync = await syncCapabilityAuditResult({
      organizationId,
      userId,
      auditData,
      fileName: params.fileName,
      artifactKind,
      capabilityScanTaskId: params.result.taskId,
    });
    return {
      reportId: sync.reportId,
      scanTaskId: sync.scanTaskId,
      remediationIds: sync.remediationIds,
      registryId: sync.registryId,
      syncedFindings: sync.syncedFindings,
    };
  } catch (error) {
    logger.warn('[capability-scan] Failed to sync audit outputs', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

const router = express.Router();

/** Prevent concurrent sync analyze — overlapping LLM triage can OOM/crash the backend. */
let analyzeInFlight = false;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SKILL_ZIP_BYTES },
});

function scanUploadMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (req.is('multipart/form-data')) {
    upload.single('archive')(req, res, next);
  } else {
    next();
  }
}

function errorResponse(
  res: express.Response,
  parsed: Extract<ReturnType<typeof parseScanRequest>, { ok: false }>,
) {
  return res.status(parsed.status).json({
    success: false,
    error: { code: parsed.code, message: parsed.message, details: parsed.details },
  });
}

function taskSummary(t: ScanTaskRecord) {
  return {
    id: t.id,
    taskId: t.id,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    fileName: t.fileName,
    error: t.error,
    overallRisk: t.result?.overallRisk,
    findingCount: t.result?.findings.length,
  };
}

function taskResultResponse(task: ScanTaskRecord) {
  if (task.status === 'queued' || task.status === 'running' || task.status === 'canceled') {
    return {
      taskId: task.id,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      fileName: task.fileName,
      error: task.error,
    };
  }

  if (task.status === 'failed' && !task.result) {
    return {
      taskId: task.id,
      status: 'failed' as const,
      error: task.error,
    };
  }

  const result = task.result!;
  const syncMeta =
    task.syncMeta && typeof task.syncMeta === 'object'
      ? (task.syncMeta as Record<string, unknown>)
      : {};
  return {
    taskId: task.id,
    status: task.status,
    ...toLegacyAuditShape(result),
    reportId: typeof syncMeta.reportId === 'string' ? syncMeta.reportId : undefined,
    securityScanTaskId: typeof syncMeta.scanTaskId === 'string' ? syncMeta.scanTaskId : undefined,
    remediationIds: Array.isArray(syncMeta.remediationIds)
      ? (syncMeta.remediationIds as string[])
      : undefined,
    registryId: typeof syncMeta.registryId === 'string' ? syncMeta.registryId : undefined,
    syncedFindings:
      typeof syncMeta.syncedFindings === 'number' ? syncMeta.syncedFindings : undefined,
    scan: result,
  };
}

async function enqueueScan(req: express.Request, res: express.Response, responseStatus = 202) {
  const parsed = parseScanRequest(req);
  if (!parsed.ok) {
    return errorResponse(res, parsed);
  }

  const resolved = await resolveScanInput(parsed.input);
  if (!resolved.ok) {
    return errorResponse(res, resolved);
  }

  const taskId = randomUUID();
  createScanTask(taskId, resolved.input.fileName, { callbackUrl: resolved.input.callbackUrl });
  const auth = authFromRequest(req);

  res.status(responseStatus).json({
    success: true,
    data: { taskId, status: 'queued' as const },
  });

  setImmediate(() => {
    void (async () => {
      updateScanTask(taskId, { status: 'running' });
      try {
        const result = await runCapabilityScan({
          ...resolved.input,
          taskId,
          organizationId: auth.organizationId,
        });
        const current = getScanTask(taskId);
        if (current?.status === 'canceled') {
          return;
        }
        const callback = await notifyScanCallback(resolved.input.callbackUrl, result);
        if (resolved.input.callbackUrl && !callback.delivered && callback.message) {
          result.warnings.push(`callback: ${callback.message}`);
        }
        const syncMeta = await persistAuditOutputs(auth, {
          result,
          fileName: resolved.input.fileName,
        });
        updateScanTask(taskId, { status: result.status, result, syncMeta });
      } catch (error) {
        const current = getScanTask(taskId);
        if (current?.status === 'canceled') {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        updateScanTask(taskId, { status: 'failed', error: message });
      }
    })();
  });
}

router.post(
  '/analyze',
  scanUploadMiddleware,
  async (req: express.Request, res: express.Response) => {
    if (analyzeInFlight) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'SCAN_BUSY',
          message: '已有分析任务进行中，请等待完成后再试（勿重复点击）',
        },
      });
    }
    analyzeInFlight = true;
    try {
      const parsed = parseScanRequest(req);
      if (!parsed.ok) {
        return errorResponse(res, parsed);
      }

      const resolved = await resolveScanInput(parsed.input);
      if (!resolved.ok) {
        return errorResponse(res, resolved);
      }

      const result = await runCapabilityScan({
        ...resolved.input,
        organizationId: authFromRequest(req).organizationId,
      });
      createScanTask(result.taskId, resolved.input.fileName, {
        callbackUrl: resolved.input.callbackUrl,
      });
      const callback = await notifyScanCallback(resolved.input.callbackUrl, result);
      if (resolved.input.callbackUrl && !callback.delivered && callback.message) {
        result.warnings.push(`callback: ${callback.message}`);
      }
      const syncMeta = await persistAuditOutputs(authFromRequest(req), {
        result,
        fileName: resolved.input.fileName,
      });
      updateScanTask(result.taskId, { status: result.status, result, syncMeta });

      return res.json({
        success: result.status !== 'failed',
        data: {
          ...toLegacyAuditShape(result),
          reportId: syncMeta.reportId,
          securityScanTaskId: syncMeta.scanTaskId,
          remediationIds: syncMeta.remediationIds,
          registryId: syncMeta.registryId,
          syncedFindings: syncMeta.syncedFindings,
          scan: result,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        success: false,
        error: { code: 'SCAN_ERROR', message },
      });
    } finally {
      analyzeInFlight = false;
    }
  },
);

router.post('/', scanUploadMiddleware, async (req: express.Request, res: express.Response) =>
  enqueueScan(req, res, 202),
);

router.post('/tasks', scanUploadMiddleware, async (req: express.Request, res: express.Response) =>
  enqueueScan(req, res, 202),
);

router.get('/tasks', (_req: express.Request, res: express.Response) => {
  const items = listScanTasks(30).map(taskSummary);
  return res.json({ success: true, data: items });
});

router.get('/tasks/:id/sarif', (req: express.Request, res: express.Response) => {
  const task = getScanTask(req.params.id);
  if (!task?.result) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Scan result not ready' },
    });
  }

  const sarif = capabilityScanToSarif(task.result);
  res.setHeader('Content-Type', 'application/sarif+json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="capability-scan-${task.id}.sarif.json"`,
  );
  return res.json(sarif);
});

router.get('/tasks/:id', (req: express.Request, res: express.Response) => {
  const task = getScanTask(req.params.id);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Scan task not found' },
    });
  }

  return res.json({
    success: task.status !== 'failed',
    data: taskResultResponse(task),
  });
});

router.get('/:id/findings', (req: express.Request, res: express.Response) => {
  const task = getScanTask(req.params.id);
  if (!task?.result) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Scan result not ready' },
    });
  }
  return res.json({ success: true, data: task.result.findings });
});

router.get('/:id/assets', (req: express.Request, res: express.Response) => {
  const task = getScanTask(req.params.id);
  if (!task?.result) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Scan result not ready' },
    });
  }
  return res.json({ success: true, data: task.result.assetManifest ?? [] });
});

router.get('/:id/artifacts/sarif', (req: express.Request, res: express.Response) => {
  const task = getScanTask(req.params.id);
  if (!task?.result) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Scan result not ready' },
    });
  }

  const sarif = capabilityScanToSarif(task.result);
  res.setHeader('Content-Type', 'application/sarif+json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="capability-scan-${task.id}.sarif.json"`,
  );
  return res.json(sarif);
});

router.get('/:id/artifacts', (req: express.Request, res: express.Response) => {
  const task = getScanTask(req.params.id);
  if (!task?.result) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Scan result not ready' },
    });
  }
  return res.json({
    success: true,
    data: [
      {
        kind: 'json',
        mediaType: 'application/json',
        path: `/capability-scans/${task.id}`,
      },
      {
        kind: 'sarif',
        mediaType: 'application/sarif+json',
        path: `/capability-scans/${task.id}/artifacts/sarif`,
      },
    ],
  });
});

router.post('/:id/cancel', (req: express.Request, res: express.Response) => {
  const task = cancelScanTask(req.params.id);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Scan task not found' },
    });
  }
  return res.json({ success: true, data: taskSummary(task) });
});

router.get('/:id', (req: express.Request, res: express.Response) => {
  const task = getScanTask(req.params.id);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Scan task not found' },
    });
  }
  return res.json({ success: task.status !== 'failed', data: taskResultResponse(task) });
});

export default router;
