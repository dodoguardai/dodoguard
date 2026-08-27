import express from 'express';

const router = express.Router();

router.post('/main-system', (req, res) => {
  const body = req.body as { taskId?: unknown; status?: unknown };
  if (typeof body.taskId !== 'string' || typeof body.status !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'taskId and status are required' },
    });
  }

  return res.status(202).json({
    success: true,
    data: {
      accepted: true,
      taskId: body.taskId,
      status: body.status,
      receivedAt: new Date().toISOString(),
    },
  });
});

export default router;
