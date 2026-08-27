import express from 'express';

import { getCapabilityEngineStatuses } from '../scan/engine-status';

const router = express.Router();

router.get('/status', async (_req, res) => {
  try {
    const statuses = await getCapabilityEngineStatuses();
    return res.json({ success: true, data: statuses });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      error: { code: 'ENGINE_STATUS_ERROR', message },
    });
  }
});

export default router;
