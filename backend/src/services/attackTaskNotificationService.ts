/**
 * Task-run notifications driven by wizard advancedSettings.notifications.
 */

import { and, eq } from 'drizzle-orm';
import { db, getDbType } from '../database';
import type { AttackTaskExecutionSettings } from '../lib/attackTaskRowNormalize';
import logger from '../logger';
import { isEmailConfigured, sendGenericEmail } from './emailService';

export type AttackTaskNotificationType = 'complete' | 'failure' | 'vulnerability_found';

export type AttackTaskNotificationContext = {
  type: AttackTaskNotificationType;
  taskId: string;
  taskName: string;
  userId: string;
  organizationId: string;
  executionSettings?: AttackTaskExecutionSettings;
  vulnerabilityCount?: number;
  errorMessage?: string;
};

function shouldSendNotification(
  type: AttackTaskNotificationType,
  settings?: AttackTaskExecutionSettings,
): boolean {
  if (!settings) {
    return false;
  }
  const n = settings.notifications;
  if (type === 'complete') {
    return n.onComplete;
  }
  if (type === 'failure') {
    return n.onFailure;
  }
  return n.onVulnerabilityFound;
}

async function resolveUserEmail(
  userId: string,
  organizationId: string,
): Promise<string | undefined> {
  const dbType = getDbType();
  const usersTable =
    dbType === 'mysql'
      ? // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../database/tables-mysql').usersTable
      : // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../database/tables-enterprise').usersTable;
  if (!usersTable) {
    return undefined;
  }
  const [row] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, organizationId)))
    .limit(1);
  const email = row?.email ? String(row.email).trim() : '';
  return email || undefined;
}

function buildNotificationContent(ctx: AttackTaskNotificationContext): {
  subject: string;
  text: string;
} {
  const name = ctx.taskName.trim() || ctx.taskId;
  if (ctx.type === 'complete') {
    return {
      subject: `DodoGuard task completed: ${name}`,
      text: `Your security test task "${name}" has completed successfully.`,
    };
  }
  if (ctx.type === 'failure') {
    return {
      subject: `DodoGuard task failed: ${name}`,
      text: `Your security test task "${name}" failed.${ctx.errorMessage ? `\n\nError: ${ctx.errorMessage}` : ''}`,
    };
  }
  const count = Math.max(0, ctx.vulnerabilityCount ?? 0);
  return {
    subject: `DodoGuard vulnerabilities found: ${name}`,
    text: `Your security test task "${name}" detected ${count} potential vulnerability result(s).`,
  };
}

export async function maybeNotifyAttackTaskUser(ctx: AttackTaskNotificationContext): Promise<void> {
  if (!shouldSendNotification(ctx.type, ctx.executionSettings)) {
    return;
  }

  const { subject, text } = buildNotificationContent(ctx);

  if (!isEmailConfigured()) {
    logger.info('[attackTaskNotification] Notification skipped (email not configured)', {
      taskId: ctx.taskId,
      type: ctx.type,
    });
    return;
  }

  const to = await resolveUserEmail(ctx.userId, ctx.organizationId);
  if (!to) {
    logger.warn('[attackTaskNotification] Notification skipped (user email not found)', {
      taskId: ctx.taskId,
      userId: ctx.userId,
      type: ctx.type,
    });
    return;
  }

  try {
    await sendGenericEmail({ to, subject, text });
    logger.info('[attackTaskNotification] Notification email sent', {
      taskId: ctx.taskId,
      type: ctx.type,
      to,
    });
  } catch (error: unknown) {
    logger.warn('[attackTaskNotification] Failed to send notification email', {
      taskId: ctx.taskId,
      type: ctx.type,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
