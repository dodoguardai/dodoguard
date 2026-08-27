/**
 * Interactive multi-round single test: chat + batch submit for LLM review.
 */

import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db, getDbType } from '../../../../database';
import logger from '../../../../logger';
import { readQnaExcelRowsFromXlsxBuffer } from '../../../../reports/qnaExcelReportFromRows';
import { sendAgentChatRound } from '../../../../services/attackTaskAgentExecution';
import { insertAttackTaskRow } from '../../../../services/attackTaskInsertService';
import {
  buildMultiRoundExcelTemplateBuffer,
  MULTI_ROUND_EXCEL_MAX_AGENTS,
  parseMultiRoundExcelFromRows,
  runMultiRoundInstructionsForAgent,
} from '../../../../services/multiRoundExcelTest';
import {
  buildRunLogsFromMultiRoundTranscript,
  countMultiRoundUserTurns,
  type MultiRoundChatMessage,
} from '../../../../services/multiRoundTestUtils';
import { runAttackTaskInBackground } from './attack-tasks';

const router = express.Router();

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function getTargetAgentsTable(): any {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../../database/tables-mysql').targetAgentsTable;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../database/tables-enterprise').targetAgentsTable;
}

function getAttackTasksTable(): any {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../../database/tables-mysql').attackTasksTable;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../database/tables-enterprise').attackTasksTable;
}

function requireOrganizationId(req: express.Request, res: express.Response): string | null {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_CONTEXT', message: 'Organization context required' },
    });
    return null;
  }
  return organizationId;
}

async function loadAgent(agentId: string, organizationId: string) {
  const table = getTargetAgentsTable();
  if (!table) {
    return null;
  }
  const [agent] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, agentId), eq(table.organizationId, organizationId)))
    .limit(1);
  return agent ?? null;
}

function platformFamilyFromAgentType(type: string | undefined): string {
  const t = String(type ?? '').toLowerCase();
  if (t === 'coze') {
    return 'coze';
  }
  if (t === 'fastgpt') {
    return 'fastgpt';
  }
  if (t === 'n8n') {
    return 'n8n';
  }
  if (t === 'tencent-adp') {
    return 'tencent-adp';
  }
  if (t === 'api' || t === 'api-stream') {
    return 'api';
  }
  return 'dify';
}

type MultiRoundCreationMode = 'multi_round_test' | 'multi_round_excel_test';

type CreateMultiRoundTasksParams = {
  organizationId: string;
  userId: string;
  judgeModel: string;
  /** Overall attack-success expectation for the full multi-round transcript. */
  expectedSuccess?: string;
  batchName?: string;
  sessionId?: string;
  creationMode: MultiRoundCreationMode;
  excelFileName?: string;
  agents: Array<{
    agentId: string;
    agentName?: string;
    conversationId?: string;
    messages: MultiRoundChatMessage[];
  }>;
};

async function createMultiRoundTestTasks(params: CreateMultiRoundTasksParams): Promise<{
  batchId: string;
  sessionId: string;
  tasks: Array<{ taskId: string; agentId: string; agentName: string }>;
}> {
  const attackTasksTable = getAttackTasksTable();
  if (!attackTasksTable) {
    throw new Error('Attack tasks table not initialized');
  }

  const batchId = randomUUID();
  const sessionId = params.sessionId || randomUUID();
  const now = new Date();
  const createdTasks: Array<{ taskId: string; agentId: string; agentName: string }> = [];

  for (const agentEntry of params.agents) {
    const rounds = countMultiRoundUserTurns(agentEntry.messages);
    if (rounds < 1) {
      throw new Error(`Agent ${agentEntry.agentId}: at least one user message is required`);
    }

    const agent = await loadAgent(agentEntry.agentId, params.organizationId);
    if (!agent) {
      throw new Error(`Target agent not found: ${agentEntry.agentId}`);
    }

    const agentName = agentEntry.agentName || agent.name || agentEntry.agentId;
    const pf = platformFamilyFromAgentType(String(agent.type || ''));
    const transcript = agentEntry.messages;
    const userPromptSummary = transcript
      .filter((m) => m.role === 'user')
      .map((m) => m.content.trim())
      .filter(Boolean)
      .join('\n---\n')
      .slice(0, 500);

    const preRunLogs = buildRunLogsFromMultiRoundTranscript({
      agentType: String(agent.type || ''),
      transcript,
      conversationId: agentEntry.conversationId,
      now,
    });

    const batch = params.batchName?.trim();
    const modeLabel = params.creationMode === 'multi_round_excel_test' ? 'Excel多轮' : '多轮测试';
    const taskName = batch
      ? `${batch} · ${agentName}`
      : `${modeLabel} — ${agentName} — ${now.toLocaleString('zh-CN')}`;

    const expectedSuccess = String(params.expectedSuccess ?? '').trim();

    const metadata: Record<string, unknown> = {
      taskKind: 'single_test',
      runSource: 'single',
      creationMode: params.creationMode,
      multiRoundTest: {
        preRecorded: true,
        batchId,
        sessionId,
        agentId: agentEntry.agentId,
        agentName,
        conversationId: agentEntry.conversationId,
        roundCount: rounds,
        transcript,
        preRunLogs,
        submittedAt: now.toISOString(),
        ...(expectedSuccess ? { expectedSuccess } : {}),
        ...(params.creationMode === 'multi_round_excel_test'
          ? { source: 'excel', excelFileName: params.excelFileName }
          : {}),
      },
      singleTest: {
        prompt: userPromptSummary,
        ...(expectedSuccess ? { expectedSuccess } : {}),
        judgeModel: params.judgeModel,
      },
    };

    const insertValues = {
      name: taskName,
      description: userPromptSummary.slice(0, 500) || `${modeLabel} (${rounds} 轮)`,
      targetType: 'agent',
      targetConfig: { agentId: agentEntry.agentId },
      vulnerabilities: [],
      attackMode: 'conversation',
      platformFamily: pf,
      scanMode: 'runtime',
      detectionConfig: {
        useRule: false,
        useLLM: true,
        useKnowledgeBase: false,
        llmConfig: {
          model: params.judgeModel,
          ...(expectedSuccess ? { successDescription: expectedSuccess } : {}),
        },
      },
      metadata,
      organizationId: params.organizationId,
      userId: params.userId,
      status: 'pending',
    };

    const newTask = await insertAttackTaskRow(attackTasksTable, insertValues);
    if (!newTask?.id) {
      throw new Error(`Failed to create task for agent ${agentEntry.agentId}`);
    }
    createdTasks.push({
      taskId: newTask.id,
      agentId: agentEntry.agentId,
      agentName,
    });
  }

  void Promise.allSettled(
    createdTasks.map((t) => runAttackTaskInBackground(t.taskId, params.organizationId)),
  );

  return { batchId, sessionId, tasks: createdTasks };
}

const chatSchema = z.object({
  agentId: z.string().uuid(),
  message: z.string().min(1).max(32_000),
  conversationId: z.string().optional(),
});

const submitAgentSchema = z.object({
  agentId: z.string().uuid(),
  agentName: z.string().optional(),
  conversationId: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1),
});

const submitSchema = z.object({
  batchName: z.string().optional(),
  judgeModel: z.string().min(1),
  expectedSuccess: z.string().optional(),
  sessionId: z.string().optional(),
  agents: z.array(submitAgentSchema).min(1).max(MULTI_ROUND_EXCEL_MAX_AGENTS),
});

/**
 * GET /api/v1/single-test/multi-round/template
 * Download Excel template for batch multi-round instructions.
 */
router.get('/template', (_req, res) => {
  try {
    const buffer = buildMultiRoundExcelTemplateBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="multi-round-test-instructions.xlsx"',
    );
    return res.send(buffer);
  } catch (error: unknown) {
    logger.error('[single-test/multi-round/template] error', { error });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate template',
      },
    });
  }
});

/**
 * POST /api/v1/single-test/multi-round/chat
 * Send one user message to a target agent (multi-round session).
 */
router.post('/chat', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join('; '),
        },
      });
    }

    const agent = await loadAgent(parsed.data.agentId, organizationId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'AGENT_NOT_FOUND', message: 'Target agent not found' },
      });
    }

    const agentConfig =
      agent.config && typeof agent.config === 'object' && !Array.isArray(agent.config)
        ? (agent.config as Record<string, unknown>)
        : {};

    const result = await sendAgentChatRound({
      agentType: String(agent.type || ''),
      agentConfig,
      message: parsed.data.message,
      conversationId: parsed.data.conversationId,
    });

    return res.json({
      success: true,
      data: {
        agentId: parsed.data.agentId,
        ok: result.ok,
        status: result.status,
        reply: result.preview,
        durationMs: result.durationMs,
        conversationId: result.conversationId,
        error: result.error,
        source: result.source,
      },
    });
  } catch (error: unknown) {
    logger.error('[single-test/multi-round/chat] error', { error });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Chat request failed',
      },
    });
  }
});

/**
 * POST /api/v1/single-test/multi-round/submit
 * Create one attack task per agent with pre-recorded transcript, then run LLM review.
 */
router.post('/submit', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CONTEXT', message: 'User context required' },
      });
    }

    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join('; '),
        },
      });
    }

    const result = await createMultiRoundTestTasks({
      organizationId,
      userId,
      judgeModel: parsed.data.judgeModel,
      expectedSuccess: parsed.data.expectedSuccess,
      batchName: parsed.data.batchName,
      sessionId: parsed.data.sessionId,
      creationMode: 'multi_round_test',
      agents: parsed.data.agents as Array<{
        agentId: string;
        agentName?: string;
        conversationId?: string;
        messages: MultiRoundChatMessage[];
      }>,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    logger.error('[single-test/multi-round/submit] error', { error });
    const message = error instanceof Error ? error.message : 'Submit failed';
    const status = message.includes('not found') ? 404 : 500;
    return res.status(status).json({
      success: false,
      error: {
        code: status === 404 ? 'AGENT_NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
        message,
      },
    });
  }
});

function parseAgentIdsFromMultipart(body: Record<string, unknown>): string[] {
  const raw = body.agentIds ?? body['agentIds[]'];
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(Boolean);
      }
    } catch {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * POST /api/v1/single-test/multi-round/excel-submit
 * Upload Excel with test instructions; server runs multi-round chats per agent, then submits for review.
 * multipart: file, agentIds (JSON array or comma-separated), judgeModel,
 * optional batchName / expectedSuccess (form overrides Excel column when both present)
 */
router.post('/excel-submit', excelUpload.single('file'), async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CONTEXT', message: 'User context required' },
      });
    }

    const file = req.file;
    if (!file?.buffer || !file.originalname) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FILE', message: 'Excel file is required (field name: file)' },
      });
    }
    if (!/\.xlsx$/i.test(file.originalname)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FILE_TYPE', message: 'Only .xlsx files are supported' },
      });
    }

    const body = req.body as Record<string, unknown>;
    const agentIds = parseAgentIdsFromMultipart(body);
    const agentIdSchema = z.array(z.string().uuid()).min(1).max(MULTI_ROUND_EXCEL_MAX_AGENTS);
    const parsedAgentIds = agentIdSchema.safeParse(agentIds);
    if (!parsedAgentIds.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Select 1–${MULTI_ROUND_EXCEL_MAX_AGENTS} valid agent IDs`,
        },
      });
    }

    const judgeModel = String(body.judgeModel ?? '').trim();
    if (!judgeModel) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Review model (judgeModel) is required' },
      });
    }

    const batchName =
      typeof body.batchName === 'string' && body.batchName.trim()
        ? body.batchName.trim().slice(0, 120)
        : undefined;

    const expectedFromForm =
      typeof body.expectedSuccess === 'string' ? body.expectedSuccess.trim() : '';

    let instructions;
    let expectedFromExcel = '';
    try {
      const rows = readQnaExcelRowsFromXlsxBuffer(file.buffer);
      const parsed = parseMultiRoundExcelFromRows(rows);
      instructions = parsed.instructions;
      expectedFromExcel = String(parsed.expectedSuccess ?? '').trim();
    } catch (error: unknown) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EXCEL',
          message: error instanceof Error ? error.message : 'Failed to parse Excel file',
        },
      });
    }

    const expectedSuccess = expectedFromForm || expectedFromExcel;
    if (!expectedSuccess) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请在 Excel「攻击成功预期」列填写整体攻击成功预期（建议首行填写一次）',
        },
      });
    }

    const agentsToRun: Array<{
      agentId: string;
      agentName: string;
      agentType: string;
      agentConfig: Record<string, unknown>;
    }> = [];

    for (const agentId of parsedAgentIds.data) {
      const agent = await loadAgent(agentId, organizationId);
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `Target agent not found: ${agentId}`,
          },
        });
      }
      const agentConfig =
        agent.config && typeof agent.config === 'object' && !Array.isArray(agent.config)
          ? (agent.config as Record<string, unknown>)
          : {};
      agentsToRun.push({
        agentId,
        agentName: agent.name || agentId,
        agentType: String(agent.type || ''),
        agentConfig,
      });
    }

    logger.info('[single-test/multi-round/excel-submit] starting batch run', {
      agentCount: agentsToRun.length,
      instructionCount: instructions.length,
      excelFileName: file.originalname,
    });

    const runResults = await Promise.all(
      agentsToRun.map((agent) =>
        runMultiRoundInstructionsForAgent({
          agentId: agent.agentId,
          agentName: agent.agentName,
          agentType: agent.agentType,
          agentConfig: agent.agentConfig,
          instructions,
        }),
      ),
    );

    const result = await createMultiRoundTestTasks({
      organizationId,
      userId,
      judgeModel,
      expectedSuccess,
      batchName,
      creationMode: 'multi_round_excel_test',
      excelFileName: file.originalname,
      agents: runResults.map((r) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        conversationId: r.conversationId,
        messages: r.messages,
      })),
    });

    return res.json({
      success: true,
      data: {
        ...result,
        instructionCount: instructions.length,
        failedRoundsByAgent: Object.fromEntries(runResults.map((r) => [r.agentId, r.failedRounds])),
      },
    });
  } catch (error: unknown) {
    logger.error('[single-test/multi-round/excel-submit] error', { error });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Excel batch submit failed',
      },
    });
  }
});

export default router;
