/**
 * Audit Service
 * Handles audit logging and compliance tracking
 */

import { db } from '../database';
import { auditLogs, userActivities } from '../database/tables-enterprise';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import logger from '../logger';

export interface AuditLogEntry {
  organizationId?: string;
  userId?: string;
  teamId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface UserActivityEntry {
  userId: string;
  organizationId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

export class AuditService {
  /**
   * Log audit event
   */
  async logAuditEvent(entry: AuditLogEntry) {
    try {
      await db.insert(auditLogs).values({
        organizationId: entry.organizationId,
        userId: entry.userId,
        teamId: entry.teamId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: entry.details || {},
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        createdAt: new Date(),
      });

      // Log to console for immediate visibility
      logger.info('AUDIT', {
        action: entry.action,
        resource: `${entry.resourceType}${entry.resourceId ? `:${entry.resourceId}` : ''}`,
        user: entry.userId,
        org: entry.organizationId,
        ip: entry.ipAddress,
      });
    } catch (error) {
      logger.error('Log audit event error:', error);
      // Don't throw here as audit logging should not break main functionality
    }
  }

  /**
   * Log user activity
   */
  async logUserActivity(entry: UserActivityEntry) {
    try {
      await db.insert(userActivities).values({
        userId: entry.userId,
        organizationId: entry.organizationId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        details: entry.details || {},
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error('Log user activity error:', error);
      // Don't throw here as activity logging should not break main functionality
    }
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      userId?: string;
      action?: string;
      resourceType?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
    } = {},
  ) {
    try {
      const {
        limit = 50,
        offset = 0,
        userId,
        action,
        resourceType,
        dateFrom,
        dateTo,
        search,
      } = options;

      const whereConditions = [eq(auditLogs.organizationId, organizationId)];

      if (userId) {
        whereConditions.push(eq(auditLogs.userId, userId));
      }

      if (action) {
        whereConditions.push(eq(auditLogs.action, action));
      }

      if (resourceType) {
        whereConditions.push(eq(auditLogs.resourceType, resourceType));
      }

      if (dateFrom) {
        whereConditions.push(gte(auditLogs.createdAt, new Date(dateFrom)));
      }

      if (dateTo) {
        whereConditions.push(lte(auditLogs.createdAt, new Date(dateTo)));
      }

      if (search) {
        whereConditions.push(
          sql`(${auditLogs.action} ILIKE ${`%${search}%`} OR ${auditLogs.resourceType} ILIKE ${`%${search}%`} OR ${auditLogs.details}::text ILIKE ${`%${search}%`})`,
        );
      }

      const logs = await db
        .select()
        .from(auditLogs)
        .where(and(...whereConditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(and(...whereConditions));

      return {
        logs,
        total: count,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('Get audit logs error:', error);
      throw error;
    }
  }

  /**
   * Get user activities
   */
  async getUserActivities(
    userId: string,
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      action?: string;
      resourceType?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) {
    try {
      const { limit = 50, offset = 0, action, resourceType, dateFrom, dateTo } = options;

      const whereConditions = [
        eq(userActivities.userId, userId),
        eq(userActivities.organizationId, organizationId),
      ];

      if (action) {
        whereConditions.push(eq(userActivities.action, action));
      }

      if (resourceType) {
        whereConditions.push(eq(userActivities.resourceType, resourceType));
      }

      if (dateFrom) {
        whereConditions.push(gte(userActivities.createdAt, new Date(dateFrom)));
      }

      if (dateTo) {
        whereConditions.push(lte(userActivities.createdAt, new Date(dateTo)));
      }

      const activities = await db
        .select()
        .from(userActivities)
        .where(and(...whereConditions))
        .orderBy(desc(userActivities.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userActivities)
        .where(and(...whereConditions));

      return {
        activities,
        total: count,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('Get user activities error:', error);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(organizationId: string, days: number = 30) {
    try {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);

      // Action statistics
      const actionStats = await db
        .select({
          action: auditLogs.action,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(
          and(eq(auditLogs.organizationId, organizationId), gte(auditLogs.createdAt, dateFrom)),
        )
        .groupBy(auditLogs.action)
        .orderBy(desc(sql<number>`count(*)`))
        .limit(10);

      // Resource type statistics
      const resourceStats = await db
        .select({
          resourceType: auditLogs.resourceType,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(
          and(eq(auditLogs.organizationId, organizationId), gte(auditLogs.createdAt, dateFrom)),
        )
        .groupBy(auditLogs.resourceType)
        .orderBy(desc(sql<number>`count(*)`))
        .limit(10);

      // Daily activity
      const dailyStats = await db
        .select({
          date: sql<string>`DATE(${auditLogs.createdAt})`,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(
          and(eq(auditLogs.organizationId, organizationId), gte(auditLogs.createdAt, dateFrom)),
        )
        .groupBy(sql`DATE(${auditLogs.createdAt})`)
        .orderBy(sql`DATE(${auditLogs.createdAt})`);

      return {
        actionStats,
        resourceStats,
        dailyStats,
        period: { days, from: dateFrom.toISOString() },
      };
    } catch (error) {
      logger.error('Get audit statistics error:', error);
      throw error;
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(retentionDays: number = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await db.delete(auditLogs).where(lte(auditLogs.createdAt, cutoffDate));

      logger.info(
        `Cleaned up ${result.rowCount} old audit logs (older than ${retentionDays} days)`,
      );

      // Also cleanup old user activities
      const activityResult = await db
        .delete(userActivities)
        .where(lte(userActivities.createdAt, cutoffDate));

      logger.info(`Cleaned up ${activityResult.rowCount} old user activities`);

      return {
        auditLogsDeleted: result.rowCount,
        userActivitiesDeleted: activityResult.rowCount,
      };
    } catch (error) {
      logger.error('Cleanup old logs error:', error);
      throw error;
    }
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(
    organizationId: string,
    options: {
      dateFrom: string;
      dateTo: string;
      format: 'json' | 'csv';
    },
  ) {
    try {
      const logs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, organizationId),
            gte(auditLogs.createdAt, new Date(options.dateFrom)),
            lte(auditLogs.createdAt, new Date(options.dateTo)),
          ),
        )
        .orderBy(auditLogs.createdAt);

      if (options.format === 'csv') {
        // Convert to CSV format
        const csvHeaders = [
          'timestamp',
          'user_id',
          'action',
          'resource_type',
          'resource_id',
          'ip_address',
          'details',
        ];
        const csvRows = logs.map((log) => [
          log.createdAt.toISOString(),
          log.userId || '',
          log.action,
          log.resourceType,
          log.resourceId || '',
          log.ipAddress || '',
          JSON.stringify(log.details),
        ]);

        return [csvHeaders, ...csvRows];
      }

      return logs;
    } catch (error) {
      logger.error('Export audit logs error:', error);
      throw error;
    }
  }

  /**
   * Log security events
   */
  async logSecurityEvent(
    organizationId: string,
    eventType:
      | 'login_success'
      | 'login_failure'
      | 'password_change'
      | 'permission_change'
      | 'suspicious_activity',
    details: Record<string, unknown>,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.logAuditEvent({
      organizationId,
      userId,
      action: `security.${eventType}`,
      resourceType: 'security',
      details,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log data access events
   */
  async logDataAccess(
    organizationId: string,
    userId: string,
    action: 'read' | 'create' | 'update' | 'delete' | 'export',
    resourceType: string,
    resourceId?: string,
    details?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.logAuditEvent({
      organizationId,
      userId,
      action: `data.${action}`,
      resourceType,
      resourceId,
      details,
      ipAddress,
      userAgent,
    });
  }
}

export const auditService = new AuditService();
