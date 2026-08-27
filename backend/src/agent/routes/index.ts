/**
 * Agent module — conversational task builder (Integration LLM + bundled skills).
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../logger';
import type { AgentModeChatMessage } from '../chat/runAgentModeChat';
import { runAgentModeChat } from '../chat/runAgentModeChat';
import { listBundledSkillSlugs, loadBundledSkill } from '../skills';

const router = express.Router();

const chatBodySchema = z.object({
  conversationId: z.string().optional(),
  surface: z.string().min(1),
  targetAgentId: z.string().optional(),
  pinnedSkillSlug: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1),
});

router.get('/bundled-skills', async (_req, res) => {
  try {
    const slugs = listBundledSkillSlugs();
    const catalog = slugs
      .map((slug) => {
        const sk = loadBundledSkill(slug);
        if (!sk) {
          return null;
        }
        return {
          slug: sk.slug,
          manifest: sk.manifest,
        };
      })
      .filter(Boolean);

    res.json({ success: true, data: catalog });
  } catch (error) {
    logger.error('[agent] bundled-skills failed', { error });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list bundled skills' },
    });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
    }

    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const messages: AgentModeChatMessage[] = parsed.data.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const result = await runAgentModeChat({
      surface: parsed.data.surface,
      targetAgentId: parsed.data.targetAgentId,
      pinnedSkillSlug: parsed.data.pinnedSkillSlug || null,
      messages,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[agent] chat failed', { message: message.slice(0, 500) });
    const noLlm = message.includes('No LLM integration');
    const status = noLlm ? 503 : 500;
    res.status(status).json({
      success: false,
      error: {
        code: noLlm ? 'NO_LLM_INTEGRATION' : 'AGENT_MODE_CHAT_FAILED',
        message,
      },
    });
  }
});

export default router;
