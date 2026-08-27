/**
 * Dashboard Service
 * Handles dashboard statistics and analytics
 */

import { db } from '../database';
import { attackTasksTable, targetAgentsTable } from '../database/tables-enterprise';
import { eq, and, gte, sql } from 'drizzle-orm';
import logger from '../logger';

export class DashboardService {
  /**
   * Get dashboard statistics
   */
  async getStatistics(organizationId: string) {
    try {
      // Get current month start date
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Task statistics
      const taskStats = await db
        .select({
          status: attackTasksTable.status,
          count: sql<number>`count(*)`,
        })
        .from(attackTasksTable)
        .where(
          and(
            eq(attackTasksTable.organizationId, organizationId),
            gte(attackTasksTable.createdAt, currentMonth),
          ),
        )
        .groupBy(attackTasksTable.status);

      const totalTasks = taskStats.reduce((sum, stat) => sum + stat.count, 0);
      const completedTasks = taskStats.find((s) => s.status === 'completed')?.count || 0;
      const runningTasks = taskStats.find((s) => s.status === 'running')?.count || 0;
      const failedTasks = taskStats.find((s) => s.status === 'failed')?.count || 0;

      // Agent statistics
      const [{ agentCount }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(targetAgentsTable)
        .where(
          and(
            eq(targetAgentsTable.organizationId, organizationId),
            eq(targetAgentsTable.status, 'active'),
          ),
        );

      const activeAgents = agentCount || 0;

      // Vulnerability statistics (mock data for now)
      // TODO: Implement actual vulnerability tracking
      const criticalVulnerabilities = 0;
      const highVulnerabilities = 0;
      const mediumVulnerabilities = 0;
      const lowVulnerabilities = 0;
      const totalVulnerabilities =
        criticalVulnerabilities + highVulnerabilities + mediumVulnerabilities + lowVulnerabilities;

      // Quota usage (mock data for now)
      // TODO: Implement actual quota tracking
      const quotaUsage = {
        attackTasksPerMonth: { used: completedTasks + runningTasks + failedTasks, limit: 100 },
        reportsPerMonth: { used: 0, limit: 50 },
        apiCallsPerMonth: { used: 0, limit: 10000 },
      };

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

      // Recent high risk findings (mock data for now)
      const recentHighRiskFindings = [];

      return {
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
      };
    } catch (error) {
      logger.error('Get dashboard statistics error:', error);
      throw error;
    }
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(organizationId: string, limit: number = 20) {
    try {
      // Get recent tasks
      const recentTasks = await db
        .select({
          id: attackTasksTable.id,
          name: attackTasksTable.name,
          status: attackTasksTable.status,
          createdAt: attackTasksTable.createdAt,
          type: sql<string>`'task'`,
          action: sql<string>`'created'`,
        })
        .from(attackTasksTable)
        .where(eq(attackTasksTable.organizationId, organizationId))
        .orderBy(sql`${attackTasksTable.createdAt} DESC`)
        .limit(limit);

      // Get recent agents
      const recentAgents = await db
        .select({
          id: targetAgentsTable.id,
          name: targetAgentsTable.name,
          status: sql<string>`null`,
          createdAt: targetAgentsTable.createdAt,
          type: sql<string>`'agent'`,
          action: sql<string>`'created'`,
        })
        .from(targetAgentsTable)
        .where(eq(targetAgentsTable.organizationId, organizationId))
        .orderBy(sql`${targetAgentsTable.createdAt} DESC`)
        .limit(limit);

      // Combine and sort by created date
      const activities = [...recentTasks, ...recentAgents]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);

      return activities;
    } catch (error) {
      logger.error('Get recent activity error:', error);
      throw error;
    }
  }

  /**
   * Get system health status
   */
  async getSystemHealth() {
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

      return health;
    } catch (error) {
      logger.error('Get system health error:', error);
      throw error;
    }
  }

  /**
   * Get organization metrics
   */
  async getOrganizationMetrics(organizationId: string) {
    try {
      // Get task metrics over time (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const taskMetrics = await db
        .select({
          date: sql<string>`DATE(${attackTasksTable.createdAt})`,
          status: attackTasksTable.status,
          count: sql<number>`count(*)`,
        })
        .from(attackTasksTable)
        .where(
          and(
            eq(attackTasksTable.organizationId, organizationId),
            gte(attackTasksTable.createdAt, thirtyDaysAgo),
          ),
        )
        .groupBy(sql`DATE(${attackTasksTable.createdAt})`, attackTasksTable.status)
        .orderBy(sql`DATE(${attackTasksTable.createdAt})`);

      // Get agent metrics
      const agentMetrics = await db
        .select({
          type: targetAgentsTable.type,
          status: targetAgentsTable.status,
          count: sql<number>`count(*)`,
        })
        .from(targetAgentsTable)
        .where(eq(targetAgentsTable.organizationId, organizationId))
        .groupBy(targetAgentsTable.type, targetAgentsTable.status);

      return {
        taskMetrics,
        agentMetrics,
      };
    } catch (error) {
      logger.error('Get organization metrics error:', error);
      throw error;
    }
  }
}

export const dashboardService = new DashboardService();
