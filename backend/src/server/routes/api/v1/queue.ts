/**
 * Task Queue API Routes
 */

import express from 'express';
import { taskQueueService } from '../../../../services/taskQueueService';
import logger from '../../../../logger';

const router = express.Router();

/**
 * GET /api/v1/queue/stats
 * Get queue statistics
 */
router.get('/stats', async (_req, res) => {
  try {
    const stats = taskQueueService.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Get queue stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get queue statistics',
      },
    });
  }
});

/**
 * GET /api/v1/queue/jobs
 * Get jobs by status
 */
router.get('/jobs', async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const jobs = taskQueueService.getJobs(
      status as 'pending' | 'processing' | 'completed' | 'failed',
    );

    res.json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    logger.error('Get queue jobs error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get queue jobs',
      },
    });
  }
});

/**
 * POST /api/v1/queue/clear
 * Clear completed and failed jobs
 */
router.post('/clear', async (_req, res) => {
  try {
    taskQueueService.clearCompletedJobs();

    res.json({
      success: true,
      message: 'Queue cleared successfully',
    });
  } catch (error) {
    logger.error('Clear queue error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to clear queue',
      },
    });
  }
});

/**
 * POST /api/v1/queue/:jobId/cancel
 * Cancel a job
 */
router.post('/:jobId/cancel', async (req, res) => {
  try {
    const { jobId } = req.params;
    const cancelled = taskQueueService.cancelJob(jobId);

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Job not found or cannot be cancelled',
        },
      });
    }

    res.json({
      success: true,
      message: 'Job cancelled successfully',
    });
  } catch (error) {
    logger.error('Cancel job error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel job',
      },
    });
  }
});

export default router;
