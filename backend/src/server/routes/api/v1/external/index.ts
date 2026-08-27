/**
 * /api/v1/external — programmatic integration API (zhian.* API keys).
 * OpenAPI is public; all other routes require Bearer API key.
 */

import express from 'express';
import assessmentsRoutes from './assessments';
import assetsRoutes from './assets';
import legacyIntegrationRoutes from './integration';
import { authenticateExternalApiKey } from './middleware';
import { externalOpenApiHandler } from './openapi';
import remediationsRoutes from './remediations';
import reportsRoutes from './reports';
import workbenchRoutes from './workbench';

const router = express.Router();

/** Public OpenAPI for integrators */
router.get('/openapi.json', externalOpenApiHandler);

router.use(authenticateExternalApiKey);

router.use('/assets', assetsRoutes);
router.use('/assessments', assessmentsRoutes);
router.use('/remediations', remediationsRoutes);
router.use('/reports', reportsRoutes);
router.use('/workbench', workbenchRoutes);

/** Legacy: /tasks, /agents, /vulnerabilities */
router.use(legacyIntegrationRoutes);

export default router;
