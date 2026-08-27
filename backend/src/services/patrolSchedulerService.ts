import { and, eq, isNull, or } from 'drizzle-orm';
import { db, getDbType } from '../database';
import logger from '../logger';
import {
  computeInitialNextRunAt,
  computeNextRunAtAfterRun,
  formatPatrolPlanNextRunAt,
  isPatrolPlanDue,
  type PatrolPlanSchedule,
  resolvePatrolPlanSchedule,
} from './patrolScheduleUtils';
import { executePatrolPlanAsRun } from './securityScanExecutionService';

const TICK_INTERVAL_MS = 60_000;

function tables() {
  const module =
    getDbType() === 'mysql'
      ? require('../database/tables-mysql')
      : require('../database/tables-enterprise');
  return {
    tasks: module.securityScanTasksTable,
  };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPatrolTaskRow(task: {
  scanType?: string | null;
  source?: string | null;
  targetKind?: string | null;
  metadata?: unknown;
  runConfig?: unknown;
}): boolean {
  const metadata = jsonRecord(task.metadata);
  return (
    metadata.isPatrolPlan === true ||
    task.scanType === '周期巡检' ||
    task.scanType === '周期检测' ||
    task.source === '定期巡检' ||
    task.targetKind === 'agent_patrol_plan'
  );
}

function resolvePlanFromTask(task: {
  metadata?: unknown;
  runConfig?: unknown;
}): PatrolPlanSchedule | null {
  const metadata = jsonRecord(task.metadata);
  const runConfig = jsonRecord(task.runConfig);
  const metadataPlan = resolvePatrolPlanSchedule(metadata.patrolPlan);
  const runConfigPlan = resolvePatrolPlanSchedule(runConfig.patrolPlan);
  if (!metadataPlan && !runConfigPlan) {
    return null;
  }
  return {
    ...(runConfigPlan || {}),
    ...(metadataPlan || {}),
  } as PatrolPlanSchedule;
}

function withPatchedPatrolPlan(
  task: { metadata?: unknown; runConfig?: unknown },
  plan: PatrolPlanSchedule,
) {
  const metadata = jsonRecord(task.metadata);
  const runConfig = jsonRecord(task.runConfig);
  return {
    metadata: {
      ...metadata,
      patrolPlan: plan,
    },
    runConfig: {
      ...runConfig,
      patrolPlan: plan,
    },
  };
}

export function enrichPatrolPlanSchedule(
  plan: PatrolPlanSchedule,
  now = new Date(),
): PatrolPlanSchedule {
  const nextRunAt = formatPatrolPlanNextRunAt(computeInitialNextRunAt(plan, now));
  return {
    ...plan,
    nextRunAt,
  };
}

export class PatrolSchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  start() {
    if (this.timer) {
      return;
    }
    logger.info('[PatrolScheduler] Starting patrol scheduler');
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      const { tasks } = tables();
      const rows = await db
        .select({
          id: tasks.id,
          organizationId: tasks.organizationId,
          status: tasks.status,
          scanType: tasks.scanType,
          source: tasks.source,
          targetKind: tasks.targetKind,
          metadata: tasks.metadata,
          runConfig: tasks.runConfig,
        })
        .from(tasks)
        .where(
          and(
            isNull(tasks.deletedAt),
            or(
              eq(tasks.scanType, '周期巡检'),
              eq(tasks.scanType, '周期检测'),
              eq(tasks.source, '定期巡检'),
              eq(tasks.targetKind, 'agent_patrol_plan'),
            ),
          ),
        );

      const now = new Date();
      for (const row of rows) {
        if (!isPatrolTaskRow(row)) {
          continue;
        }
        let plan = resolvePlanFromTask(row);
        if (!plan) {
          continue;
        }
        if (!plan.nextRunAt) {
          plan = await this.backfillNextRunAt(row.organizationId, row.id, row, plan, now);
        }
        if (row.status === 'running') {
          continue;
        }
        if (!isPatrolPlanDue(plan, now)) {
          continue;
        }
        await this.executePatrolPlan(row.organizationId, row.id, plan, now);
      }
    } catch (error) {
      logger.error('[PatrolScheduler] Tick failed:', error);
    } finally {
      this.ticking = false;
    }
  }

  private async backfillNextRunAt(
    organizationId: string,
    taskId: string,
    task: { metadata?: unknown; runConfig?: unknown },
    plan: PatrolPlanSchedule,
    now: Date,
  ): Promise<PatrolPlanSchedule> {
    const nextPlan = enrichPatrolPlanSchedule(plan, now);
    const patched = withPatchedPatrolPlan(task, nextPlan);
    const { tasks } = tables();
    await db
      .update(tasks)
      .set({
        metadata: patched.metadata,
        runConfig: patched.runConfig,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId)));
    return nextPlan;
  }

  private async executePatrolPlan(
    organizationId: string,
    taskId: string,
    plan: PatrolPlanSchedule,
    now: Date,
  ) {
    const { tasks } = tables();
    logger.info(`[PatrolScheduler] Executing patrol plan ${taskId}`);

    try {
      await executePatrolPlanAsRun(
        organizationId,
        taskId,
        { mode: 'scheduled', generateFindings: true },
        null,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Patrol execution failed';
      logger.error(`[PatrolScheduler] Patrol plan ${taskId} failed:`, error);

      const [task] = await db
        .select({ metadata: tasks.metadata, runConfig: tasks.runConfig })
        .from(tasks)
        .where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId)))
        .limit(1);
      if (!task) {
        return;
      }

      const failedPlan: PatrolPlanSchedule = {
        ...plan,
        lastRunAt: now.toISOString(),
        lastRunError: message,
        nextRunAt: formatPatrolPlanNextRunAt(computeNextRunAtAfterRun(plan, now)),
      };
      const patched = withPatchedPatrolPlan(task, failedPlan);
      await db
        .update(tasks)
        .set({
          metadata: patched.metadata,
          runConfig: patched.runConfig,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId)));
    }
  }
}

export const patrolSchedulerService = new PatrolSchedulerService();
