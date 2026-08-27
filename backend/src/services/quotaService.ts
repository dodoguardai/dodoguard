/**
 * Quota Service
 * Handles quota checking and usage tracking
 */

import { db, getDbType } from '../database';
import { eq, and, gte, sql, inArray } from 'drizzle-orm';
import logger from '../logger';

// Import tables based on database type
function getTables() {
  const dbType = getDbType();
  // SQLite (Docker single-container) uses the same quota/subscription schema as MySQL migrations.
  if (dbType === 'mysql' || dbType === 'sqlite') {
    const mysqlTables = require('../database/tables-mysql');
    return {
      quotaUsageTable: mysqlTables.quotaUsageTable,
      usageRecordsTable: mysqlTables.usageRecordsTable,
      organizationSubscriptionsTable: mysqlTables.organizationSubscriptionsTable,
      subscriptionPlansTable: mysqlTables.subscriptionPlansTable,
      targetAgentsTable: mysqlTables.targetAgentsTable,
      teamsTable: mysqlTables.teamsTable,
      usersTable: mysqlTables.usersTable,
      attackTasksTable: mysqlTables.attackTasksTable,
    };
  }
  const pgTables = require('../database/tables-enterprise');
  return {
    quotaUsageTable: pgTables.quotaUsage,
    usageRecordsTable: pgTables.usageRecords,
    organizationSubscriptionsTable: pgTables.organizationSubscriptions,
    subscriptionPlansTable: pgTables.subscriptionPlans,
    targetAgentsTable: pgTables.targetAgentsTable,
    teamsTable: pgTables.teamsTable,
    usersTable: pgTables.usersTable,
    attackTasksTable: pgTables.attackTasksTable,
  };
}

export interface QuotaLimits {
  // 简化后的配额项（只保留5个）
  targetAgents: number;
  attackTasksPerMonth: number;
  teams: number;
  teamMembers: number;
  auditLogRetentionDays: number;
}

export interface QuotaUsage {
  // 简化后的配额项（只保留5个）
  targetAgents: { used: number; limit: number };
  attackTasksPerMonth: { used: number; limit: number };
  teams: { used: number; limit: number };
  teamMembers: { used: number; limit: number };
  auditLogRetentionDays: { used: number; limit: number };
}

export class QuotaService {
  /**
   * Get organization quota limits
   */
  async getQuotaLimits(organizationId: string): Promise<QuotaLimits> {
    try {
      const { organizationSubscriptionsTable, subscriptionPlansTable } = getTables();

      // Get organization's subscription plan
      const subscription = await db
        .select({
          quotas: subscriptionPlansTable.quotas,
        })
        .from(organizationSubscriptionsTable)
        .innerJoin(
          subscriptionPlansTable,
          eq(organizationSubscriptionsTable.planId, subscriptionPlansTable.id),
        )
        .where(
          and(
            eq(organizationSubscriptionsTable.organizationId, organizationId),
            eq(organizationSubscriptionsTable.status, 'active'),
          ),
        )
        .limit(1);

      if (subscription.length === 0) {
        // Default free plan limits
        return {
          targetAgents: 3,
          attackTasksPerMonth: 10,
          teams: 0,
          teamMembers: 1,
          auditLogRetentionDays: 0,
        };
      }

      const quotas = subscription[0].quotas as Record<string, number>;
      return {
        targetAgents: quotas.targetAgents ?? 3,
        attackTasksPerMonth: quotas.attackTasksPerMonth ?? 10,
        teams: quotas.teams ?? 0,
        teamMembers: quotas.teamMembers ?? 1,
        auditLogRetentionDays: quotas.auditLogRetentionDays ?? 0,
      };
    } catch (error) {
      logger.error('Get quota limits error:', error);
      throw error;
    }
  }

  /**
   * Get current usage for organization
   * Calculates real-time usage from actual database tables
   */
  async getCurrentUsage(organizationId: string): Promise<QuotaUsage> {
    try {
      const { targetAgentsTable, teamsTable, usersTable, attackTasksTable, usageRecordsTable } =
        getTables();
      const limits = await this.getQuotaLimits(organizationId);
      const currentPeriod = this.getCurrentPeriod();

      // Calculate real-time usage from actual database tables
      const usage: Record<string, number> = {};

      // 1. Count target agents (智能体数量) - always count from actual table
      try {
        if (targetAgentsTable) {
          const [agentResult] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(targetAgentsTable)
            .where(eq(targetAgentsTable.organizationId, organizationId));
          usage.targetAgents = Number(agentResult?.count || 0);
        } else {
          // Fallback: try to get from usage records if table not available
          const [result] = await db
            .select({ total: sql<number>`SUM(${usageRecordsTable.quantity})` })
            .from(usageRecordsTable)
            .where(
              and(
                eq(usageRecordsTable.organizationId, organizationId),
                eq(usageRecordsTable.metric, 'targetAgents'),
                eq(usageRecordsTable.period, currentPeriod),
              ),
            );
          usage.targetAgents = Number(result?.total || 0);
        }
      } catch (error) {
        logger.warn('Failed to count target agents:', error);
        usage.targetAgents = 0;
      }

      // 2. Count teams (团队数量)
      try {
        if (teamsTable) {
          const [teamResult] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(teamsTable)
            .where(eq(teamsTable.organizationId, organizationId));
          usage.teams = Number(teamResult?.count || 0);
        } else {
          usage.teams = 0;
        }
      } catch (error) {
        logger.warn('Failed to count teams:', error);
        usage.teams = 0;
      }

      // 3. Count team members (团队成员数量) - count distinct users in the organization
      try {
        if (usersTable) {
          const [memberResult] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(usersTable)
            .where(eq(usersTable.organizationId, organizationId));
          usage.teamMembers = Number(memberResult?.count || 0);
        } else {
          usage.teamMembers = 0;
        }
      } catch (error) {
        logger.warn('Failed to count team members:', error);
        usage.teamMembers = 0;
      }

      // 4. Count attack tasks per month (攻击任务数量/月) - count from actual attack_tasks table for current month
      try {
        const currentMonth = new Date();
        currentMonth.setDate(1);
        currentMonth.setHours(0, 0, 0, 0);

        if (attackTasksTable) {
          // Count tasks created in current month
          const [taskResult] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(attackTasksTable)
            .where(
              and(
                eq(attackTasksTable.organizationId, organizationId),
                gte(attackTasksTable.createdAt, currentMonth),
              ),
            );
          usage.attackTasksPerMonth = Number(taskResult?.count || 0);
        } else {
          // Fallback: try to get from usage records
          const [taskResult] = await db
            .select({ total: sql<number>`SUM(${usageRecordsTable.quantity})` })
            .from(usageRecordsTable)
            .where(
              and(
                eq(usageRecordsTable.organizationId, organizationId),
                eq(usageRecordsTable.metric, 'attackTasksPerMonth'),
                eq(usageRecordsTable.period, currentPeriod),
              ),
            );
          usage.attackTasksPerMonth = Number(taskResult?.total || 0);
        }
      } catch (error) {
        logger.warn('Failed to count attack tasks:', error);
        usage.attackTasksPerMonth = 0;
      }

      // 5. Audit log retention days (审计日志保留天数) - this is a configuration value, not usage
      // The "used" value should be the actual configured retention days, which equals the limit
      usage.auditLogRetentionDays = limits.auditLogRetentionDays;

      const usageResult: QuotaUsage = {
        targetAgents: { used: usage.targetAgents, limit: limits.targetAgents },
        attackTasksPerMonth: { used: usage.attackTasksPerMonth, limit: limits.attackTasksPerMonth },
        teams: { used: usage.teams, limit: limits.teams },
        teamMembers: { used: usage.teamMembers, limit: limits.teamMembers },
        auditLogRetentionDays: {
          used: usage.auditLogRetentionDays,
          limit: limits.auditLogRetentionDays,
        },
      };

      return usageResult;
    } catch (error) {
      logger.error('Get current usage error:', error);
      throw error;
    }
  }

  /**
   * Check if quota allows operation
   */
  async checkQuota(
    organizationId: string,
    metric: string,
    quantity: number = 1,
  ): Promise<{
    allowed: boolean;
    currentUsage: number;
    limit: number;
    remaining: number;
  }> {
    try {
      const usage = await this.getCurrentUsage(organizationId);
      const metricKey = metric as keyof QuotaUsage;

      if (!usage[metricKey]) {
        throw new Error(`Unknown metric: ${metric}`);
      }

      const currentUsage = usage[metricKey].used;
      const limit = usage[metricKey].limit;
      const remaining = Math.max(0, limit - currentUsage);
      const allowed = limit === -1 || currentUsage + quantity <= limit; // -1 means unlimited

      return {
        allowed,
        currentUsage,
        limit,
        remaining,
      };
    } catch (error) {
      logger.error('Check quota error:', error);
      throw error;
    }
  }

  /**
   * Record usage
   */
  async recordUsage(
    organizationId: string,
    metric: string,
    quantity: number = 1,
    metadata?: Record<string, unknown>,
  ) {
    try {
      const { usageRecordsTable } = getTables();
      const period = this.getCurrentPeriod();

      const dbType = getDbType();
      const values: any = {
        organizationId,
        metric,
        quantity,
        period,
        timestamp: new Date(),
        metadata: metadata || {},
      };
      // For MySQL, usage_records.id is a VARCHAR(36) primary key with no default
      if (dbType === 'mysql') {
        const { v4: uuidv4 } = await import('uuid');
        values.id = uuidv4();
      }

      await db.insert(usageRecordsTable).values(values);

      // Update quota usage summary
      await this.updateQuotaUsageSummary(organizationId, period);

      logger.info(`Usage recorded: ${organizationId} - ${metric} +${quantity}`);
    } catch (error) {
      logger.error('Record usage error:', error);
      throw error;
    }
  }

  /**
   * Update quota usage summary
   */
  private async updateQuotaUsageSummary(organizationId: string, period: string) {
    try {
      const { quotaUsageTable, usageRecordsTable } = getTables();
      // Calculate current usage for all metrics
      const metrics = [
        'targetAgents',
        'attackTasksPerMonth',
        'teams',
        'teamMembers',
        'auditLogRetentionDays',
      ];
      const usage: Record<string, number> = {};

      for (const metric of metrics) {
        const [result] = await db
          .select({ total: sql<number>`SUM(${usageRecordsTable.quantity})` })
          .from(usageRecordsTable)
          .where(
            and(
              eq(usageRecordsTable.organizationId, organizationId),
              eq(usageRecordsTable.metric, metric),
              eq(usageRecordsTable.period, period),
            ),
          );

        usage[metric] = result?.total ?? 0;
      }

      // Upsert quota usage
      const dbType = getDbType();
      if (dbType === 'mysql') {
        // MySQL: Check if record exists, then update or insert
        const [existing] = await db
          .select()
          .from(quotaUsageTable)
          .where(
            and(
              eq(quotaUsageTable.organizationId, organizationId),
              eq(quotaUsageTable.period, period),
            ),
          )
          .limit(1);

        if (existing) {
          // Update existing record
          await db
            .update(quotaUsageTable)
            .set({
              quotas: usage,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(quotaUsageTable.organizationId, organizationId),
                eq(quotaUsageTable.period, period),
              ),
            );
        } else {
          // Insert new record
          await db.insert(quotaUsageTable).values({
            organizationId,
            period,
            quotas: usage,
            updatedAt: new Date(),
          });
        }
      } else {
        // PostgreSQL/SQLite support onConflictDoUpdate
        // Note: If table has composite primary key (organizationId, period), use both
        // Otherwise, use just organizationId
        await db
          .insert(quotaUsageTable)
          .values({
            organizationId,
            period,
            quotas: usage,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: quotaUsageTable.organizationId,
            set: {
              quotas: usage,
              period,
              updatedAt: new Date(),
            },
          });
      }
    } catch (error) {
      logger.error('Update quota usage summary error:', error);
      // Don't throw here as this is a background operation
    }
  }

  /**
   * Reset quota usage for new period
   */
  async resetQuotaUsage(organizationId: string, period: string) {
    try {
      const { quotaUsageTable } = getTables();
      await db
        .update(quotaUsageTable)
        .set({
          quotas: {
            targetAgents: 0,
            attackTasksPerMonth: 0,
            teams: 0,
            teamMembers: 0,
            auditLogRetentionDays: 0,
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(quotaUsageTable.organizationId, organizationId),
            eq(quotaUsageTable.period, period),
          ),
        );

      logger.info(`Quota usage reset for organization: ${organizationId}, period: ${period}`);
    } catch (error) {
      logger.error('Reset quota usage error:', error);
      throw error;
    }
  }

  /**
   * Get usage statistics for organization
   */
  async getUsageStatistics(organizationId: string, months: number = 12) {
    try {
      const { quotaUsageTable } = getTables();
      const periods = [];
      for (let i = 0; i < months; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        periods.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
      }

      // Use inArray for cross-database compatibility
      const statistics = await db
        .select({
          period: quotaUsageTable.period,
          quotas: quotaUsageTable.quotas,
        })
        .from(quotaUsageTable)
        .where(
          and(
            eq(quotaUsageTable.organizationId, organizationId),
            inArray(quotaUsageTable.period, periods),
          ),
        )
        .orderBy(quotaUsageTable.period);

      return statistics;
    } catch (error) {
      logger.error('Get usage statistics error:', error);
      throw error;
    }
  }

  /**
   * Check and notify quota usage
   */
  async checkAndNotifyQuotaUsage(organizationId: string) {
    try {
      const usage = await this.getCurrentUsage(organizationId);
      const warnings: string[] = [];

      // Check each metric for high usage
      Object.entries(usage).forEach(([metric, data]) => {
        const usagePercent = data.limit > 0 ? (data.used / data.limit) * 100 : 0;

        if (usagePercent >= 90) {
          warnings.push(`${metric}: ${data.used}/${data.limit} (${usagePercent.toFixed(1)}%)`);
        }
      });

      if (warnings.length > 0) {
        logger.warn(`High quota usage for organization ${organizationId}:`, warnings);

        // TODO: Send notification to organization admins
        // await notificationService.sendQuotaWarning(organizationId, warnings);
      }

      return warnings;
    } catch (error) {
      logger.error('Check and notify quota usage error:', error);
      throw error;
    }
  }

  /**
   * Get current period (YYYY-MM)
   */
  getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Validate metric name
   */
  validateMetric(metric: string): boolean {
    const validMetrics = [
      'targetAgents',
      'attackTasksPerMonth',
      'teams',
      'teamMembers',
      'auditLogRetentionDays',
    ];
    return validMetrics.includes(metric);
  }
}

export const quotaService = new QuotaService();
