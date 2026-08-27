/**
 * Task Queue Service
 * Simple in-memory task queue for background processing
 */

import logger from '../logger';
import { attackTaskService } from './attackTaskService';
import { websocketService } from './websocketService';

export interface TaskJob {
  id: string;
  type: 'attack_task_execution' | 'report_generation' | 'agent_health_check';
  data: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: Date;
  retryCount: number;
  maxRetries: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalProcessed: number;
}

export class TaskQueueService {
  private queue: TaskJob[] = [];
  private processing: Set<string> = new Set();
  private completed: Set<string> = new Set();
  private failed: Set<string> = new Set();
  private isProcessing = false;
  private maxConcurrentJobs = 5;
  private retryDelays = [1000, 5000, 30000, 300000]; // Retry delays in milliseconds

  /**
   * Add job to queue
   */
  addJob(job: Omit<TaskJob, 'id' | 'createdAt' | 'retryCount'>): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullJob: TaskJob = {
      ...job,
      id: jobId,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
    };

    this.queue.push(fullJob);
    logger.info(`Job added to queue: ${jobId} (${job.type})`);

    // Start processing if not already running
    this.processQueue();

    return jobId;
  }

  /**
   * Add attack task execution job
   */
  addAttackTaskJob(
    taskId: string,
    organizationId: string,
    priority: 'low' | 'normal' | 'high' | 'critical' = 'normal',
  ) {
    return this.addJob({
      type: 'attack_task_execution',
      data: { taskId, organizationId },
      priority,
      maxRetries: 3,
    });
  }

  /**
   * Add report generation job
   */
  addReportGenerationJob(taskId: string, organizationId: string, format: 'pdf' | 'html' = 'pdf') {
    return this.addJob({
      type: 'report_generation',
      data: { taskId, organizationId, format },
      priority: 'normal',
      maxRetries: 2,
    });
  }

  /**
   * Add agent health check job
   */
  addAgentHealthCheckJob(agentId: string, organizationId: string) {
    return this.addJob({
      type: 'agent_health_check',
      data: { agentId, organizationId },
      priority: 'low',
      maxRetries: 1,
    });
  }

  /**
   * Process queue
   */
  private async processQueue() {
    if (this.isProcessing) { return; }
    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.processing.size < this.maxConcurrentJobs) {
        // Sort queue by priority
        this.queue.sort(
          (a, b) => this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority),
        );

        const job = this.queue.shift();
        if (!job) { continue; }

        this.processing.add(job.id);
        logger.debug(`Processing job: ${job.id} (${job.type})`);

        // Process job asynchronously
        this.processJob(job).catch((error) => {
          logger.error(`Job processing error for ${job.id}:`, error);
        });
      }
    } finally {
      this.isProcessing = false;

      // Continue processing if there are more jobs
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  /**
   * Process individual job
   */
  private async processJob(job: TaskJob) {
    try {
      switch (job.type) {
        case 'attack_task_execution':
          await this.processAttackTaskExecution(job);
          break;
        case 'report_generation':
          await this.processReportGeneration(job);
          break;
        case 'agent_health_check':
          await this.processAgentHealthCheck(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      this.completed.add(job.id);
      logger.info(`Job completed: ${job.id} (${job.type})`);
    } catch (error) {
      logger.error(`Job failed: ${job.id} (${job.type}):`, error);

      this.failed.add(job.id);
      this.processing.delete(job.id);

      // Retry logic
      if (job.retryCount < job.maxRetries) {
        job.retryCount++;
        const delay = this.retryDelays[job.retryCount - 1] || 300000;

        logger.info(
          `Retrying job ${job.id} in ${delay}ms (attempt ${job.retryCount}/${job.maxRetries})`,
        );

        setTimeout(() => {
          this.queue.push(job);
          this.processQueue();
        }, delay);
      } else {
        logger.error(`Job ${job.id} failed permanently after ${job.maxRetries} retries`);
      }
    } finally {
      this.processing.delete(job.id);
    }
  }

  /**
   * Process attack task execution
   */
  private async processAttackTaskExecution(job: TaskJob) {
    const { taskId, organizationId } = job.data as { taskId: string; organizationId: string };

    logger.info(`Starting attack task execution: ${taskId}`);

    // Update task status
    await attackTaskService.updateTask(taskId, organizationId, { status: 'running' });

    // Send WebSocket update
    websocketService.sendTaskUpdate(taskId, {
      taskId,
      status: 'running',
      message: 'Task execution started',
    });

    // Simulate task execution with progress updates
    const steps = [
      'Initializing',
      'Gathering intelligence',
      'Executing attacks',
      'Analyzing results',
      'Finalizing',
    ];
    let progress = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      progress = ((i + 1) / steps.length) * 100;

      websocketService.sendTaskRunProgress(
        taskId,
        progress,
        step,
        `Step ${i + 1}/${steps.length}: ${step}`,
      );

      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Complete the task
    await attackTaskService.completeTask(taskId, organizationId, {
      status: 'completed',
      metadata: {
        executionTime: steps.length * 2000,
        completedAt: new Date().toISOString(),
        processedBy: 'background-worker',
      },
    });

    // Send final WebSocket update
    websocketService.sendTaskUpdate(taskId, {
      taskId,
      status: 'completed',
      message: 'Task completed successfully',
    });

    logger.info(`Attack task execution completed: ${taskId}`);
  }

  /**
   * Process report generation
   */
  private async processReportGeneration(job: TaskJob) {
    const { taskId, organizationId, format } = job.data as {
      taskId: string;
      organizationId: string;
      format: 'pdf' | 'html';
    };

    logger.info(`Starting report generation: ${taskId} (${format})`);

    // TODO: Implement actual report generation
    // For now, simulate report generation
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Send WebSocket update (if needed)
    websocketService.sendToOrganization(organizationId, {
      type: 'report.generated',
      data: { taskId, format },
      timestamp: new Date().toISOString(),
    });

    logger.info(`Report generation completed: ${taskId} (${format})`);
  }

  /**
   * Process agent health check
   */
  private async processAgentHealthCheck(job: TaskJob) {
    const { agentId } = job.data as { agentId: string; organizationId: string };

    logger.info(`Starting agent health check: ${agentId}`);

    // TODO: Implement actual health check
    // For now, simulate health check
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Send WebSocket update
    websocketService.sendAgentHealthUpdate(agentId, {
      agentId,
      status: 'healthy',
      responseTime: Math.floor(Math.random() * 500) + 50,
    });

    logger.info(`Agent health check completed: ${agentId}`);
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.size,
      failed: this.failed.size,
      totalProcessed: this.completed.size + this.failed.size,
    };
  }

  /**
   * Get jobs by status
   */
  getJobs(status: 'pending' | 'processing' | 'completed' | 'failed'): TaskJob[] {
    switch (status) {
      case 'pending':
        return [...this.queue];
      case 'processing':
        return this.queue.filter((job) => this.processing.has(job.id));
      case 'completed':
        return []; // We don't keep completed jobs in memory
      case 'failed':
        return []; // We don't keep failed jobs in memory
      default:
        return [];
    }
  }

  /**
   * Cancel job
   */
  cancelJob(jobId: string): boolean {
    const index = this.queue.findIndex((job) => job.id === jobId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      logger.info(`Job cancelled: ${jobId}`);
      return true;
    }
    return false;
  }

  /**
   * Clear completed/failed jobs from memory
   */
  clearCompletedJobs() {
    this.completed.clear();
    this.failed.clear();
    logger.info('Completed and failed jobs cleared from memory');
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority: string): number {
    switch (priority) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'normal':
        return 2;
      case 'low':
        return 1;
      default:
        return 2;
    }
  }
}

export const taskQueueService = new TaskQueueService();
