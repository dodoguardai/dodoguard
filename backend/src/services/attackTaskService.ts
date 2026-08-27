/**
 * Attack Task Service
 * Handles attack task operations
 */

import { db } from '../database';
import { attackTasksTable } from '../database/tables-enterprise';
import { eq, and, sql } from 'drizzle-orm';
import logger from '../logger';
import { websocketService } from './websocketService';
import { taskQueueService } from './taskQueueService';

export interface CreateAttackTaskData {
  organizationId: string;
  teamId?: string;
  userId: string;
  name: string;
  description?: string;
  targetType: 'agent' | 'mcp' | 'llm' | 'tool' | 'platform' | 'composite';
  targetConfig: Record<string, unknown>;
  vulnerabilities: string[];
  attackMode: 'simple' | 'conversation' | 'composite';
  compositeAttackConfig?: Record<string, unknown>;
  detectionConfig: {
    useRule: boolean;
    useLLM: boolean;
    useKnowledgeBase: boolean;
    ruleSetId?: string;
  };
  agentConfig?: {
    enabled: boolean;
    provider?: string;
    model?: string;
    temperature?: number;
  };
}

export interface UpdateAttackTaskData {
  name?: string;
  description?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  metadata?: Record<string, unknown>;
}

export class AttackTaskService {
  /**
   * Create a new attack task
   */
  async createTask(data: CreateAttackTaskData) {
    try {
      const [newTask] = await db.insert(attackTasksTable).values(data).returning();

      logger.info(`Attack task created: ${newTask.name} (${newTask.id})`);
      return newTask;
    } catch (error) {
      logger.error('Create attack task error:', error);
      throw error;
    }
  }

  /**
   * Get task by ID
   */
  async getTaskById(taskId: string, organizationId: string) {
    try {
      const [task] = await db
        .select()
        .from(attackTasksTable)
        .where(
          and(eq(attackTasksTable.id, taskId), eq(attackTasksTable.organizationId, organizationId)),
        )
        .limit(1);

      return task || null;
    } catch (error) {
      logger.error('Get task by ID error:', error);
      throw error;
    }
  }

  /**
   * Update task
   */
  async updateTask(taskId: string, organizationId: string, data: UpdateAttackTaskData) {
    try {
      const [updatedTask] = await db
        .update(attackTasksTable)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(
          and(eq(attackTasksTable.id, taskId), eq(attackTasksTable.organizationId, organizationId)),
        )
        .returning();

      if (!updatedTask) {
        throw new Error('Attack task not found');
      }

      logger.info(`Attack task updated: ${updatedTask.name} (${updatedTask.id})`);
      return updatedTask;
    } catch (error) {
      logger.error('Update attack task error:', error);
      throw error;
    }
  }

  /**
   * Delete task
   */
  async deleteTask(taskId: string, organizationId: string) {
    try {
      const result = await db
        .delete(attackTasksTable)
        .where(
          and(eq(attackTasksTable.id, taskId), eq(attackTasksTable.organizationId, organizationId)),
        );

      if (result.rowCount === 0) {
        throw new Error('Attack task not found');
      }

      logger.info(`Attack task deleted: ${taskId}`);
      return true;
    } catch (error) {
      logger.error('Delete attack task error:', error);
      throw error;
    }
  }

  /**
   * List tasks
   */
  async listTasks(
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      search?: string;
      status?: string;
      targetType?: string;
      userId?: string;
    } = {},
  ) {
    try {
      const { limit = 50, offset = 0, search, status, targetType, userId } = options;

      const whereConditions = [eq(attackTasksTable.organizationId, organizationId)];

      if (search) {
        whereConditions.push(sql`${attackTasksTable.name} ILIKE ${`%${search}%`}`);
      }

      if (status) {
        whereConditions.push(eq(attackTasksTable.status, status as any));
      }

      if (targetType) {
        whereConditions.push(eq(attackTasksTable.targetType, targetType as any));
      }

      if (userId) {
        whereConditions.push(eq(attackTasksTable.userId, userId));
      }

      const tasks = await db
        .select()
        .from(attackTasksTable)
        .where(and(...whereConditions))
        .limit(limit)
        .offset(offset)
        .orderBy(sql`${attackTasksTable.createdAt} DESC`);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(attackTasksTable)
        .where(and(...whereConditions));

      return {
        tasks,
        total: count,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('List attack tasks error:', error);
      throw error;
    }
  }

  /**
   * Start task execution
   */
  async startTask(taskId: string, organizationId: string) {
    try {
      const task = await this.getTaskById(taskId, organizationId);
      if (!task) {
        throw new Error('Attack task not found');
      }

      if (task.status !== 'pending') {
        throw new Error('Task is not in pending status');
      }

      // Update status to running
      const updatedTask = await this.updateTask(taskId, organizationId, {
        status: 'running',
      });

      // Send WebSocket update
      websocketService.sendTaskUpdate(taskId, {
        taskId,
        status: 'running',
        message: 'Task execution started',
      });

      // Add task to background queue
      taskQueueService.addAttackTaskJob(taskId, organizationId, 'normal');

      logger.info(`Attack task started: ${task.name} (${taskId})`);
      return updatedTask;
    } catch (error) {
      logger.error('Start attack task error:', error);
      throw error;
    }
  }

  /**
   * Cancel task execution
   */
  async cancelTask(taskId: string, organizationId: string) {
    try {
      const task = await this.getTaskById(taskId, organizationId);
      if (!task) {
        throw new Error('Attack task not found');
      }

      if (task.status !== 'running') {
        throw new Error('Task is not running');
      }

      // Update status to canceled
      const updatedTask = await this.updateTask(taskId, organizationId, {
        status: 'canceled',
        metadata: {
          ...task.metadata,
          canceledAt: new Date().toISOString(),
        },
      });

      // TODO: Actually cancel running task

      logger.info(`Attack task canceled: ${task.name} (${taskId})`);
      return updatedTask;
    } catch (error) {
      logger.error('Cancel attack task error:', error);
      throw error;
    }
  }

  /**
   * Complete task execution
   */
  async completeTask(taskId: string, organizationId: string, updates: UpdateAttackTaskData) {
    try {
      const updatedTask = await this.updateTask(taskId, organizationId, {
        status: 'completed',
        ...updates,
      });

      logger.info(`Attack task completed: ${updatedTask.name} (${taskId})`);
      return updatedTask;
    } catch (error) {
      logger.error('Complete attack task error:', error);
      throw error;
    }
  }

  /**
   * Fail task execution
   */
  async failTask(taskId: string, organizationId: string, error: string) {
    try {
      const task = await this.getTaskById(taskId, organizationId);
      if (!task) {
        throw new Error('Attack task not found');
      }

      const updatedTask = await this.updateTask(taskId, organizationId, {
        status: 'failed',
        metadata: {
          ...task.metadata,
          error,
          failedAt: new Date().toISOString(),
        },
      });

      logger.info(`Attack task failed: ${task.name} (${taskId}) - ${error}`);
      return updatedTask;
    } catch (error) {
      logger.error('Fail attack task error:', error);
      throw error;
    }
  }

  /**
   * Get task statistics
   */
  async getTaskStatistics(organizationId: string) {
    try {
      const stats = await db
        .select({
          status: attackTasksTable.status,
          count: sql<number>`count(*)`,
        })
        .from(attackTasksTable)
        .where(eq(attackTasksTable.organizationId, organizationId))
        .groupBy(attackTasksTable.status);

      const totalTasks = stats.reduce((sum, stat) => sum + stat.count, 0);
      const completedTasks = stats.find((s) => s.status === 'completed')?.count || 0;
      const runningTasks = stats.find((s) => s.status === 'running')?.count || 0;
      const failedTasks = stats.find((s) => s.status === 'failed')?.count || 0;
      const pendingTasks = stats.find((s) => s.status === 'pending')?.count || 0;

      return {
        totalTasks,
        completedTasks,
        runningTasks,
        failedTasks,
        pendingTasks,
      };
    } catch (error) {
      logger.error('Get task statistics error:', error);
      throw error;
    }
  }
}

export const attackTaskService = new AttackTaskService();
