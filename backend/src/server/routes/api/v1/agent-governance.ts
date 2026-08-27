/**
 * Agent governance master data API — departments, business systems, scenes, owners.
 */

import express from 'express';
import { z } from 'zod';

import {
  agentGovernanceService,
  type OwnerType,
} from '../../../../services/agentGovernanceService';

const router = express.Router();

const govStatusSchema = z.enum(['active', 'inactive']);
const ownerTypeSchema = z.enum(['business', 'developer', 'security', 'ops']);

const departmentBodySchema = z.object({
  name: z.string().min(1),
  deptType: z.string().optional(),
  lead: z.string().optional(),
  status: govStatusSchema.optional(),
});

const sceneBodySchema = z.object({
  name: z.string().min(1),
  status: govStatusSchema.optional(),
});

const businessSystemBodySchema = z.object({
  name: z.string().min(1),
  departmentName: z.string().optional(),
  sceneName: z.string().optional(),
  status: govStatusSchema.optional(),
});

const ownerBodySchema = z.object({
  name: z.string().min(1),
  ownerType: ownerTypeSchema,
  departmentName: z.string().optional(),
  email: z.string().optional(),
  status: govStatusSchema.optional(),
});

function requireOrganizationId(req: express.Request, res: express.Response): string | null {
  const organizationId = (req as express.Request & { user?: { organizationId?: string } }).user
    ?.organizationId;
  if (!organizationId) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
    });
    return null;
  }
  return organizationId;
}

function conflictMessage(reason: string): string {
  const messages: Record<string, string> = {
    REFERENCED_BY_BUSINESS_SYSTEM: '该记录仍被业务系统引用，无法删除',
    REFERENCED_BY_ASSET: '该记录仍被智能体资产引用，无法删除',
    NOT_FOUND: '记录不存在',
  };
  return messages[reason] || '无法删除该记录';
}

router.get('/master', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const master = await agentGovernanceService.getMaster(organizationId);
    res.json({ success: true, data: master });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.post('/departments', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const parsed = departmentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    const { name, deptType, lead, status } = parsed.data;
    const created = await agentGovernanceService.createDepartment(organizationId, {
      name,
      deptType,
      lead,
      status,
    });
    res.status(201).json({ success: true, data: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.patch('/departments/:id', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const parsed = departmentBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    const updated = await agentGovernanceService.updateDepartment(
      req.params.id,
      organizationId,
      parsed.data,
    );
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Department not found' },
      });
    }
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.delete('/departments/:id', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const result = await agentGovernanceService.deleteDepartment(req.params.id, organizationId);
    if (!result.ok) {
      return res.status(result.reason === 'NOT_FOUND' ? 404 : 409).json({
        success: false,
        error: {
          code: result.reason || 'CONFLICT',
          message: conflictMessage(result.reason || ''),
        },
      });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.post('/business-scenes', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const parsed = sceneBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    const { name, status } = parsed.data;
    const created = await agentGovernanceService.createBusinessScene(organizationId, {
      name,
      status,
    });
    res.status(201).json({ success: true, data: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.patch('/business-scenes/:id', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const parsed = sceneBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    const updated = await agentGovernanceService.updateBusinessScene(
      req.params.id,
      organizationId,
      parsed.data,
    );
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Business scene not found' },
      });
    }
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.delete('/business-scenes/:id', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const result = await agentGovernanceService.deleteBusinessScene(req.params.id, organizationId);
    if (!result.ok) {
      return res.status(result.reason === 'NOT_FOUND' ? 404 : 409).json({
        success: false,
        error: {
          code: result.reason || 'CONFLICT',
          message: conflictMessage(result.reason || ''),
        },
      });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.post('/business-systems', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const parsed = businessSystemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    const { name, departmentName, sceneName, status } = parsed.data;
    const created = await agentGovernanceService.createBusinessSystem(organizationId, {
      name,
      departmentName,
      sceneName,
      status,
    });
    res.status(201).json({ success: true, data: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.patch('/business-systems/:id', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const parsed = businessSystemBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    const updated = await agentGovernanceService.updateBusinessSystem(
      req.params.id,
      organizationId,
      parsed.data,
    );
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Business system not found' },
      });
    }
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.delete('/business-systems/:id', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const result = await agentGovernanceService.deleteBusinessSystem(req.params.id, organizationId);
    if (!result.ok) {
      return res.status(result.reason === 'NOT_FOUND' ? 404 : 409).json({
        success: false,
        error: {
          code: result.reason || 'CONFLICT',
          message: conflictMessage(result.reason || ''),
        },
      });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.post('/owners', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const parsed = ownerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    const { name, ownerType, departmentName, email, status } = parsed.data;
    const created = await agentGovernanceService.createOwner(organizationId, {
      name,
      ownerType: ownerType as OwnerType,
      departmentName,
      email,
      status,
    });
    res.status(201).json({ success: true, data: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.patch('/owners/:id', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const parsed = ownerBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    const updated = await agentGovernanceService.updateOwner(req.params.id, organizationId, {
      ...parsed.data,
      ownerType: parsed.data.ownerType as OwnerType | undefined,
    });
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Owner not found' },
      });
    }
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.delete('/owners/:id', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const result = await agentGovernanceService.deleteOwner(req.params.id, organizationId);
    if (!result.ok) {
      return res.status(result.reason === 'NOT_FOUND' ? 404 : 409).json({
        success: false,
        error: {
          code: result.reason || 'CONFLICT',
          message: conflictMessage(result.reason || ''),
        },
      });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

export default router;
