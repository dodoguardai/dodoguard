import '../loadEnv';

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { fromError } from 'zod-validation-error';
import { getDefaultHost, getDefaultPort, VERSION } from '../constants';
import { setupSignalWatcher } from '../database/signal';
import { getDirectory } from '../esm';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { runDbMigrations } from '../migrate';
import Eval, { getEvalSummaries } from '../models/eval';
import { getRemoteHealthUrl } from '../redteam/remoteGeneration';
import { createShareableUrl, determineShareDomain, stripAuthFromUrl } from '../share';
import telemetry, { TelemetryEventSchema } from '../telemetry';
import { synthesizeFromTestSuite } from '../testCase/synthesis';
import { checkRemoteHealth } from '../util/apiHealth';
import {
  getPrompts,
  getPromptsForTestCasesHash,
  getStandaloneEvals,
  getTestCases,
  readResult,
} from '../util/database';
import invariant from '../util/invariant';
import { assertProductionJwtSecrets } from '../util/jwtSecrets';
import { BrowserBehavior, openBrowser } from '../util/server';
import apiV1Router from './routes/api/v1';
import { configsRouter } from './routes/configs';
import { difyPentestRouter } from './routes/difyPentest';
import { evalRouter } from './routes/eval';
import { llmPentestRouter } from './routes/llmPentest';
import { modelAuditRouter } from './routes/modelAudit';
import { providersRouter } from './routes/providers';
import { redteamRouter } from './routes/redteam';
import { tracesRouter } from './routes/traces';
import { userRouter } from './routes/user';
import versionRouter from './routes/version';
import { routeParam } from './utils/routeParam';
import type { Request, Response } from 'express';

import type { Prompt, PromptWithMetadata, TestCase, TestSuite } from '../index';
import type { EvalSummary } from '../types/index';

// Prompts cache
let allPrompts: PromptWithMetadata[] | null = null;

// JavaScript file extensions that need proper MIME type
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const FRONTEND_ASSET_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.woff',
  '.woff2',
]);

// Express middleware limits
const REQUEST_SIZE_LIMIT = '100mb';

/**
 * Middleware to set proper MIME types for JavaScript files.
 * This is necessary because some browsers (especially Arc) enforce strict MIME type checking
 * and will refuse to execute scripts with incorrect MIME types for security reasons.
 */
export function setJavaScriptMimeType(
  req: Request,
  res: Response,
  next: express.NextFunction,
): void {
  const ext = path.extname(req.path);
  if (JS_EXTENSIONS.has(ext)) {
    res.setHeader('Content-Type', 'application/javascript');
  }
  next();
}

function setFrontendCacheHeaders(res: Response, filePath: string): void {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath);

  if (fileName === 'index.html') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return;
  }

  if (FRONTEND_ASSET_EXTENSIONS.has(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }

  res.setHeader('Cache-Control', 'no-cache');
}

/**
 * Handles server startup errors with proper logging and graceful shutdown.
 */
export function handleServerError(error: NodeJS.ErrnoException, port: number): void {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${port} is already in use. Do you have another DodoGuard instance running?`);
  } else {
    logger.error(`Failed to start server: ${error instanceof Error ? error.message : error}`);
  }
  process.exit(1);
}

export function createApp() {
  const app = express();

  // Static frontend: prefer FRONTEND_DIST_DIR, then frontend/dist; else legacy dist/src/app if present (old builds)
  const projectRoot = path.resolve(getDirectory(), '../..');
  const frontendDist = process.env.FRONTEND_DIST_DIR || path.join(projectRoot, 'frontend/dist');
  const legacyAppDir = path.join(getDirectory(), 'app');
  const staticDir =
    process.env.FRONTEND_DIST_DIR || (fs.existsSync(frontendDist) ? frontendDist : legacyAppDir);

  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
  app.use(express.urlencoded({ limit: REQUEST_SIZE_LIMIT, extended: true }));
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'OK', version: VERSION });
  });

  app.get('/api/remote-health', async (_req: Request, res: Response): Promise<void> => {
    const apiUrl = getRemoteHealthUrl();

    if (apiUrl === null) {
      res.json({
        status: 'DISABLED',
        message: 'remote generation and grading are disabled',
      });
      return;
    }

    const result = await checkRemoteHealth(apiUrl);
    res.json(result);
  });

  /**
   * Fetches summaries of all evals, optionally for a given dataset.
   */
  app.get(
    '/api/results',
    async (
      req: Request<
        {},
        {},
        {},
        { datasetId?: string; type?: 'redteam' | 'eval'; includeProviders?: boolean }
      >,
      res: Response<{ data: EvalSummary[] }>,
    ): Promise<void> => {
      const previousResults = await getEvalSummaries(
        req.query.datasetId,
        req.query.type,
        req.query.includeProviders,
      );
      res.json({ data: previousResults });
    },
  );

  app.get('/api/results/:id', async (req: Request, res: Response): Promise<void> => {
    const id = routeParam(req.params.id);
    const file = await readResult(id);
    if (!file) {
      res.status(404).send('Result not found');
      return;
    }
    res.json({ data: file.result });
  });

  app.get('/api/prompts', async (_req: Request, res: Response): Promise<void> => {
    if (allPrompts == null) {
      allPrompts = await getPrompts();
    }
    res.json({ data: allPrompts });
  });

  app.get('/api/history', async (req: Request, res: Response): Promise<void> => {
    const tagName = req.query.tagName as string | undefined;
    const tagValue = req.query.tagValue as string | undefined;
    const description = req.query.description as string | undefined;
    const tag = tagName && tagValue ? { key: tagName, value: tagValue } : undefined;
    const results = await getStandaloneEvals({
      tag,
      description,
    });
    res.json({
      data: results,
    });
  });

  app.get('/api/prompts/:sha256hash', async (req: Request, res: Response): Promise<void> => {
    const sha256hash = routeParam(req.params.sha256hash);
    const prompts = await getPromptsForTestCasesHash(sha256hash);
    res.json({ data: prompts });
  });

  app.get('/api/datasets', async (_req: Request, res: Response): Promise<void> => {
    res.json({ data: await getTestCases() });
  });

  app.get('/api/results/share/check-domain', async (req: Request, res: Response): Promise<void> => {
    const id = req.query.id as string | undefined;
    if (!id || id === 'undefined') {
      logger.warn(`Missing or invalid id parameter in ${req.method} ${req.path}`);
      res.status(400).json({ error: 'Missing id parameter' });
      return;
    }

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      logger.warn(`Eval not found for id: ${id}`);
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    const { domain } = determineShareDomain(eval_);
    const isCloudEnabled = cloudConfig.isEnabled();
    res.json({ domain, isCloudEnabled });
  });

  app.post('/api/results/share', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.body;
    logger.debug(`[${req.method} ${req.path}] Share request for eval ID: ${id || 'undefined'}`);

    const result = await readResult(id);
    if (!result) {
      logger.warn(`Result not found for id: ${id}`);
      res.status(404).json({ error: 'Eval not found' });
      return;
    }
    const eval_ = await Eval.findById(id);
    invariant(eval_, 'Eval not found');

    try {
      const url = await createShareableUrl(eval_, true);
      logger.debug(`Generated share URL for eval ${id}: ${stripAuthFromUrl(url || '')}`);
      res.json({ url });
    } catch (error) {
      logger.error(
        `Failed to generate share URL for eval ${id}: ${error instanceof Error ? error.message : error}`,
      );
      res.status(500).json({ error: 'Failed to generate share URL' });
    }
  });

  app.post('/api/dataset/generate', async (req: Request, res: Response): Promise<void> => {
    const testSuite: TestSuite = {
      prompts: req.body.prompts as Prompt[],
      tests: req.body.tests as TestCase[],
      providers: [],
    };
    const results = await synthesizeFromTestSuite(testSuite, {});
    res.json({ results });
  });

  app.use('/api/eval', evalRouter);
  app.use('/api/providers', providersRouter);
  app.use('/api/redteam', redteamRouter);
  app.use('/api/llm-pentest', llmPentestRouter);
  app.use('/api/dify-pentest', difyPentestRouter);
  app.use('/api/user', userRouter);
  app.use('/api/configs', configsRouter);
  app.use('/api/model-audit', modelAuditRouter);
  app.use('/api/traces', tracesRouter);
  app.use('/api/version', versionRouter);

  // New DodoGuard API v1 routes
  app.use('/api/v1', apiV1Router);

  app.post('/api/telemetry', async (req: Request, res: Response): Promise<void> => {
    try {
      const result = TelemetryEventSchema.safeParse(req.body);

      if (!result.success) {
        res
          .status(400)
          .json({ error: 'Invalid request body', details: fromError(result.error).toString() });
        return;
      }
      const { event, properties } = result.data;
      await telemetry.record(event, properties);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error(
        `Error processing telemetry request: ${error instanceof Error ? error.message : error}`,
      );
      res.status(500).json({ error: 'Failed to process telemetry request' });
    }
  });

  // Must come after the above routes (particularly /api/config) so it doesn't
  // overwrite dynamic routes.

  // Configure proper MIME types for JavaScript files
  app.use(setJavaScriptMimeType);

  app.use(
    express.static(staticDir, {
      dotfiles: 'allow',
      etag: true,
      setHeaders: (res, filePath) => setFrontendCacheHeaders(res, filePath),
    }),
  );

  // Handle client routing, return all requests to the app
  app.get('/*splat', (_req: Request, res: Response): void => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile('index.html', { root: staticDir, dotfiles: 'allow' });
  });
  return app;
}

export async function startServer(
  port = getDefaultPort(),
  browserBehavior: BrowserBehavior = BrowserBehavior.ASK,
) {
  assertProductionJwtSecrets();
  const app = createApp();

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  });

  await runDbMigrations();
  const { ensureSubscriptionSchema } = await import('../services/subscriptionBootstrap');
  await ensureSubscriptionSchema();

  const { patrolSchedulerService } = await import('../services/patrolSchedulerService');
  patrolSchedulerService.start();

  // Initialize WebSocket service
  const { websocketService } = await import('../services/websocketService');
  websocketService.initialize(io);

  setupSignalWatcher(async () => {
    const latestEval = await Eval.latest();
    const results = await latestEval?.getResultsCount();

    if (results && results > 0) {
      logger.info(
        `Emitting update for eval: ${latestEval?.config?.description || latestEval?.id || 'unknown'}`,
      );
      io.emit('update', latestEval);
      allPrompts = null;
    }
  });

  io.on('connection', async (socket) => {
    socket.emit('init', await Eval.latest());
  });

  // 读取 HOST 环境变量，默认为 '0.0.0.0'（允许外部访问）
  const host = getDefaultHost();

  httpServer
    .listen(port, host, () => {
      const displayHost = host === '0.0.0.0' ? '0.0.0.0 (all interfaces)' : host;
      const url = host === '0.0.0.0' ? `http://localhost:${port}` : `http://${host}:${port}`;
      logger.info(`Server running on ${displayHost}:${port} (accessible via ${url})`);
      openBrowser(browserBehavior, port).catch((error) => {
        logger.error(
          `Failed to handle browser behavior (${BrowserBehavior[browserBehavior]}): ${error instanceof Error ? error.message : error}`,
        );
      });
    })
    .on('error', (error: NodeJS.ErrnoException) => {
      handleServerError(error, port);
    });
}
