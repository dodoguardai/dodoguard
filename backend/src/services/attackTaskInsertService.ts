/**
 * Shared attack task row creation (quota + DB insert + usage record).
 * Used by POST /attack-tasks and finding retest flows.
 */

import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../database';
import logger from '../logger';
import { quotaService } from './quotaService';

export class AttackTaskQuotaExceededError extends Error {
  readonly code = 'QUOTA_EXCEEDED' as const;
  readonly details: {
    metric: string;
    currentUsage: number;
    limit: number;
    remaining: number;
  };

  constructor(details: AttackTaskQuotaExceededError['details']) {
    super('Attack task quota exceeded');
    this.name = 'AttackTaskQuotaExceededError';
    this.details = details;
  }
}

export class AttackTaskQuotaCheckError extends Error {
  readonly code = 'QUOTA_CHECK_FAILED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AttackTaskQuotaCheckError';
  }
}

/**
 * Insert one attack_tasks row after quota check and record usage.
 * May assign `insertValues.id` for MySQL when missing.
 */
export async function insertAttackTaskRow(table: any, insertValues: any): Promise<any> {
  const organizationId = insertValues.organizationId;
  if (!organizationId) {
    throw new Error('insertAttackTaskRow: organizationId is required');
  }

  try {
    const quotaCheck = await quotaService.checkQuota(organizationId, 'attackTasksPerMonth', 1);
    if (!quotaCheck.allowed) {
      logger.warn(
        `Quota exceeded for organization ${organizationId}: attackTasksPerMonth ${quotaCheck.currentUsage}/${quotaCheck.limit}`,
      );
      throw new AttackTaskQuotaExceededError({
        metric: 'attackTasksPerMonth',
        currentUsage: quotaCheck.currentUsage,
        limit: quotaCheck.limit,
        remaining: quotaCheck.remaining,
      });
    }
    logger.info(
      `Quota check passed: attackTasksPerMonth ${quotaCheck.currentUsage + 1}/${quotaCheck.limit === -1 ? 'unlimited' : quotaCheck.limit}`,
    );
  } catch (e: unknown) {
    if (e instanceof AttackTaskQuotaExceededError) {
      throw e;
    }
    logger.error('Quota check error:', {
      message: e instanceof Error ? e.message : String(e),
    });
    throw new AttackTaskQuotaCheckError(e instanceof Error ? e.message : 'Quota check failed');
  }

  const dbType = getDbType();
  if (!insertValues.status) {
    insertValues.status = 'pending';
  }
  if (dbType === 'mysql' && !insertValues.id) {
    insertValues.id = uuidv4();
  }

  let newTask: any;
  if (dbType === 'mysql') {
    await db.insert(table).values(insertValues);
    newTask = insertValues;
  } else {
    const [inserted] = await db.insert(table).values(insertValues).returning();
    newTask = inserted;
  }

  try {
    await quotaService.recordUsage(organizationId, 'attackTasksPerMonth', 1, {
      taskId: newTask.id,
      taskName: newTask.name,
    });
    logger.info(
      `Usage recorded for attack task creation: ${organizationId} - attackTasksPerMonth +1`,
    );
  } catch (usageError) {
    logger.error('Failed to record usage after attack task creation:', {
      message: usageError instanceof Error ? usageError.message : String(usageError),
    });
  }

  return newTask;
}
