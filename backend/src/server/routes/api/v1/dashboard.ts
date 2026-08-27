/**
 * Dashboard API Routes
 */

import express from 'express';
import { db, getDbType } from '../../../../database';
import { eq, and, gte, sql } from 'drizzle-orm';
import logger from '../../../../logger';
import { findingsService } from '../../../../services/findingsService';
import { quotaService } from '../../../../services/quotaService';

// Import tables based on database type
function getTables() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../../../../database/tables-mysql');
    return {
      attackTasksTable: mysqlTables.attackTasksTable,
      targetAgentsTable: mysqlTables.targetAgentsTable,
      vulnerabilitiesTable: mysqlTables.vulnerabilitiesTable,
    };
  } else {
    const pgTables = require('../../../../database/tables-enterprise');
    return {
      attackTasksTable: pgTables.attackTasksTable,
      targetAgentsTable: pgTables.targetAgentsTable,
      vulnerabilitiesTable: pgTables.vulnerabilitiesTable,
    };
  }
}

const router = express.Router();

/**
 * GET /api/v1/dashboard/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Prefer organizationId from query (frontend currentOrg) so dashboard matches the org the user is viewing
    const queryOrg =
      typeof req.query.organizationId === 'string' ? req.query.organizationId.trim() : undefined;
    const organizationId = queryOrg || req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const tables = getTables();
    if (!tables.attackTasksTable || !tables.targetAgentsTable) {
      logger.warn('Dashboard tables not available, returning default stats');
      return res.json({
        success: true,
        data: {
          totalTasks: 0,
          completedTasks: 0,
          runningTasks: 0,
          failedTasks: 0,
          totalVulnerabilities: 0,
          criticalVulnerabilities: 0,
          highVulnerabilities: 0,
          mediumVulnerabilities: 0,
          lowVulnerabilities: 0,
          activeAgents: 0,
          quotaUsage: {
            attackTasksPerMonth: { used: 0, limit: 100 },
            reportsPerMonth: { used: 0, limit: 50 },
            apiCallsPerMonth: { used: 0, limit: 10000 },
          },
          systemHealth: {
            status: 'healthy',
            database: 'online',
            cache: 'online',
            queue: 'online',
          },
          riskDistribution: [
            { level: 'critical', count: 0, percentage: 0 },
            { level: 'high', count: 0, percentage: 0 },
            { level: 'medium', count: 0, percentage: 0 },
            { level: 'low', count: 0, percentage: 0 },
          ],
          recentHighRiskFindings: [],
        },
      });
    }

    // Get current month start date (for quota only)
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Task statistics - ALL TIME (not just current month) for dashboard cards
    let taskStats: Array<{ status: string; count: number }> = [];
    let totalTasks = 0;
    let completedTasks = 0;
    let runningTasks = 0;
    let failedTasks = 0;
    let tasksThisMonth = 0;

    try {
      taskStats = await db
        .select({
          status: tables.attackTasksTable.status,
          count: sql<number>`count(*)`,
        })
        .from(tables.attackTasksTable)
        .where(eq(tables.attackTasksTable.organizationId, organizationId))
        .groupBy(tables.attackTasksTable.status);

      const toNum = (v: unknown): number =>
        typeof v === 'number' && !Number.isNaN(v) ? v : Number(v ?? 0);
      const statusIs = (stat: { status: string | null }, value: string) =>
        String(stat.status ?? '')
          .toLowerCase()
          .trim() === value.toLowerCase();
      totalTasks = taskStats.reduce((sum, stat) => sum + toNum(stat.count), 0);
      completedTasks = toNum(taskStats.find((s) => statusIs(s, 'completed'))?.count);
      runningTasks = toNum(taskStats.find((s) => statusIs(s, 'running'))?.count);
      failedTasks = toNum(taskStats.find((s) => statusIs(s, 'failed'))?.count);

      // Current month count for quota: single COUNT(*) and coerce to number (MySQL may return BigInt/string)
      const monthCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(tables.attackTasksTable)
        .where(
          and(
            eq(tables.attackTasksTable.organizationId, organizationId),
            gte(tables.attackTasksTable.createdAt, currentMonth),
          ),
        );
      const monthRow = monthCountResult?.[0];
      const rawMonthCount = monthRow?.count ?? (monthRow as any)?.['count(*)'];
      tasksThisMonth =
        typeof rawMonthCount === 'number' && !Number.isNaN(rawMonthCount)
          ? rawMonthCount
          : Number(rawMonthCount ?? 0);
    } catch (error: any) {
      if (error?.code === 'ER_NO_SUCH_TABLE' || error?.message?.includes("doesn't exist")) {
        logger.warn('attack_tasks table does not exist, using default values');
      } else {
        logger.error('Error fetching task stats:', error);
      }
    }

    // Agent statistics - count all agents for the org (same as Agents list; status can be null for older rows)
    let activeAgents = 0;
    try {
      const agentResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(tables.targetAgentsTable)
        .where(eq(tables.targetAgentsTable.organizationId, organizationId));

      const firstRow = agentResult?.[0];
      const rawCount = firstRow?.count ?? (firstRow as any)?.['count(*)'];
      activeAgents = typeof rawCount === 'number' ? rawCount : Number(rawCount ?? 0);
    } catch (error: any) {
      if (error?.code === 'ER_NO_SUCH_TABLE' || error?.message?.includes("doesn't exist")) {
        logger.warn('target_agents table does not exist, using default values');
      } else {
        logger.error('Error fetching agent stats:', error);
      }
    }

    // Vulnerability statistics from findings (attack_results with vulnerable=true)
    let criticalVulnerabilities = 0;
    let highVulnerabilities = 0;
    let mediumVulnerabilities = 0;
    let lowVulnerabilities = 0;
    try {
      if (getDbType() === 'mysql' || getDbType() === 'postgres') {
        const counts = await findingsService.getCountsByRiskLevel(organizationId);
        criticalVulnerabilities = counts.critical;
        highVulnerabilities = counts.high;
        mediumVulnerabilities = counts.medium;
        lowVulnerabilities = counts.low;
      }
    } catch (findingsErr: any) {
      logger.warn('Fetching finding counts by risk level failed:', {
        message: findingsErr?.message,
      });
    }
    const totalVulnerabilities =
      criticalVulnerabilities + highVulnerabilities + mediumVulnerabilities + lowVulnerabilities;

    // Quota usage: derive from quotaService so limits follow subscription plans
    let quotaUsage;
    try {
      const usage = await quotaService.getCurrentUsage(organizationId);
      quotaUsage = {
        attackTasksPerMonth: usage.attackTasksPerMonth,
        // These are still mock values for now
        reportsPerMonth: { used: 0, limit: 50 },
        apiCallsPerMonth: { used: 0, limit: 10000 },
      };
    } catch (error: any) {
      logger.warn('Failed to fetch quota usage, falling back to defaults', {
        message: error?.message,
      });
      quotaUsage = {
        attackTasksPerMonth: { used: tasksThisMonth, limit: 100 },
        reportsPerMonth: { used: 0, limit: 50 },
        apiCallsPerMonth: { used: 0, limit: 10000 },
      };
    }

    // System health (mock data for now)
    const systemHealth = {
      status: 'healthy',
      database: 'online',
      cache: 'online',
      queue: 'online',
    };

    // Risk distribution
    const riskDistribution = [
      {
        level: 'critical',
        count: criticalVulnerabilities,
        percentage:
          totalVulnerabilities > 0 ? (criticalVulnerabilities / totalVulnerabilities) * 100 : 0,
      },
      {
        level: 'high',
        count: highVulnerabilities,
        percentage:
          totalVulnerabilities > 0 ? (highVulnerabilities / totalVulnerabilities) * 100 : 0,
      },
      {
        level: 'medium',
        count: mediumVulnerabilities,
        percentage:
          totalVulnerabilities > 0 ? (mediumVulnerabilities / totalVulnerabilities) * 100 : 0,
      },
      {
        level: 'low',
        count: lowVulnerabilities,
        percentage:
          totalVulnerabilities > 0 ? (lowVulnerabilities / totalVulnerabilities) * 100 : 0,
      },
    ];

    // Recent high risk findings (from attack_results via findingsService)
    let recentHighRiskFindings: any[] = [];
    try {
      if (getDbType() === 'mysql' || getDbType() === 'postgres') {
        recentHighRiskFindings = await findingsService.listRecentHighRisk(organizationId, 5);
      }
    } catch (findingsErr: any) {
      logger.warn('Fetching recent high-risk findings failed:', { message: findingsErr?.message });
    }

    // Monthly activity: attack tasks created per month (last 12 months)
    const monthlyActivity: Array<{ name: string; total: number }> = [];
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyActivity.push({ name: monthNames[d.getMonth()], total: 0 });
    }
    try {
      if (tables.attackTasksTable) {
        const dbType = getDbType();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        if (dbType === 'mysql') {
          const [rawRows] = (await db.execute(sql`
            SELECT YEAR(created_at) as y, MONTH(created_at) as m, COUNT(*) as cnt
            FROM attack_tasks
            WHERE organization_id = ${organizationId} AND created_at >= ${twelveMonthsAgo}
            GROUP BY y, m ORDER BY y, m
          `)) as [any[], any];
          const countByKey: Record<string, number> = {};
          const arr = Array.isArray(rawRows) ? rawRows : [];
          for (const row of arr) {
            const r = row as any;
            const y = r.y ?? r?.y;
            const m = r.m ?? r?.m;
            const cnt = typeof r?.cnt === 'number' ? r.cnt : Number(r?.cnt ?? 0);
            if (y != null && m != null) { countByKey[`${y}-${m}`] = cnt; }
          }
          monthlyActivity.forEach((entry, idx) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
            entry.total = countByKey[`${d.getFullYear()}-${d.getMonth() + 1}`] ?? 0;
          });
        } else if (dbType === 'postgres') {
          const [rawRows] = (await db.execute(sql`
            SELECT EXTRACT(YEAR FROM created_at)::int as y, EXTRACT(MONTH FROM created_at)::int as m, COUNT(*)::int as cnt
            FROM attack_tasks
            WHERE organization_id = ${organizationId} AND created_at >= ${twelveMonthsAgo}
            GROUP BY 1, 2 ORDER BY 1, 2
          `)) as [any[], any];
          const countByKey: Record<string, number> = {};
          const arr = Array.isArray(rawRows) ? rawRows : [];
          for (const row of arr) {
            const r = row as any;
            const y = r?.y ?? r?.[0];
            const m = r?.m ?? r?.[1];
            const cnt =
              typeof (r?.cnt ?? r?.[2]) === 'number'
                ? (r?.cnt ?? r?.[2])
                : Number(r?.cnt ?? r?.[2] ?? 0);
            if (y != null && m != null) { countByKey[`${y}-${m}`] = cnt; }
          }
          monthlyActivity.forEach((entry, idx) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
            entry.total = countByKey[`${d.getFullYear()}-${d.getMonth() + 1}`] ?? 0;
          });
        }
      }
    } catch (monthErr: any) {
      logger.warn('Fetching monthly activity failed:', { message: monthErr?.message });
    }

    res.json({
      success: true,
      data: {
        totalTasks,
        completedTasks,
        runningTasks,
        failedTasks,
        totalVulnerabilities,
        criticalVulnerabilities,
        highVulnerabilities,
        mediumVulnerabilities,
        lowVulnerabilities,
        activeAgents,
        quotaUsage,
        systemHealth,
        riskDistribution,
        recentHighRiskFindings,
        monthlyActivity,
      },
    });
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get dashboard statistics',
      },
    });
  }
});

/**
 * GET /api/v1/dashboard/activity
 * Get recent activity
 */
router.get('/activity', async (req, res) => {
  try {
    const queryOrg =
      typeof req.query.organizationId === 'string' ? req.query.organizationId.trim() : undefined;
    const organizationId = queryOrg || req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const { limit = 20 } = req.query;
    const tables = getTables();

    // Get recent tasks - handle table not existing
    let recentTasks: any[] = [];
    try {
      if (tables.attackTasksTable) {
        recentTasks = await db
          .select({
            id: tables.attackTasksTable.id,
            name: tables.attackTasksTable.name,
            status: tables.attackTasksTable.status,
            createdAt: tables.attackTasksTable.createdAt,
            type: sql<string>`'task'`,
            action: sql<string>`'created'`,
          })
          .from(tables.attackTasksTable)
          .where(eq(tables.attackTasksTable.organizationId, organizationId))
          .orderBy(sql`${tables.attackTasksTable.createdAt} desc`)
          .limit(Number(limit));
      }
    } catch (error: any) {
      if (error?.code === 'ER_NO_SUCH_TABLE' || error?.message?.includes("doesn't exist")) {
        logger.warn('attack_tasks table does not exist, skipping');
      } else {
        logger.error('Error fetching recent tasks:', error);
      }
    }

    // Get recent agents - handle table not existing
    let recentAgents: any[] = [];
    try {
      if (tables.targetAgentsTable) {
        recentAgents = await db
          .select({
            id: tables.targetAgentsTable.id,
            name: tables.targetAgentsTable.name,
            status: sql<string>`null`,
            createdAt: tables.targetAgentsTable.createdAt,
            type: sql<string>`'agent'`,
            action: sql<string>`'created'`,
          })
          .from(tables.targetAgentsTable)
          .where(eq(tables.targetAgentsTable.organizationId, organizationId))
          .orderBy(sql`${tables.targetAgentsTable.createdAt} desc`)
          .limit(Number(limit));
      }
    } catch (error: any) {
      if (error?.code === 'ER_NO_SUCH_TABLE' || error?.message?.includes("doesn't exist")) {
        logger.warn('target_agents table does not exist, skipping');
      } else {
        logger.error('Error fetching recent agents:', error);
      }
    }

    // Combine and sort by created date
    const activities = [...recentTasks, ...recentAgents]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, Number(limit));

    res.json({
      success: true,
      data: activities,
    });
  } catch (error: any) {
    logger.error('Get dashboard activity error:', error);
    // Return empty array instead of error if tables don't exist
    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.message?.includes("doesn't exist")) {
      return res.json({
        success: true,
        data: [],
      });
    }
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get dashboard activity',
      },
    });
  }
});

/**
 * GET /api/v1/dashboard/health
 * Get system health status
 */
router.get('/health', async (_req, res) => {
  try {
    // TODO: Implement actual health checks
    const health = {
      status: 'healthy',
      database: 'online',
      cache: 'online',
      queue: 'online',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger.error('Get system health error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get system health',
      },
    });
  }
});

/**
 * POST /api/v1/dashboard/create-attack-tasks-table
 * Temporary endpoint to create attack_tasks table
 * This is a one-time migration script
 */
router.post('/create-attack-tasks-table', async (_req, res) => {
  try {
    const dbType = getDbType();

    if (dbType !== 'mysql') {
      return res.status(400).json({
        success: false,
        error: { code: 'UNSUPPORTED_DB', message: 'This migration only supports MySQL' },
      });
    }

    // Read the migration SQL file
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.join(
      __dirname,
      '../../../../database/migrations/007_create_attack_tasks_table.sql',
    );

    if (!fs.existsSync(migrationPath)) {
      return res.status(404).json({
        success: false,
        error: { code: 'MIGRATION_NOT_FOUND', message: 'Migration file not found' },
      });
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    logger.info('Successfully created attack_tasks table');

    res.json({
      success: true,
      message: 'attack_tasks table created successfully',
    });
  } catch (error: any) {
    logger.error('Create attack_tasks table migration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MIGRATION_FAILED',
        message: `Failed to create attack_tasks table: ${error.message}`,
      },
    });
  }
});

export default router;
