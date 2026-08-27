/**
 * OpenAPI 3.0 document for /api/v1/external/* only (public, no auth).
 */

import type express from 'express';
import {
  ALL_EXTERNAL_API_SCOPES,
  DEFAULT_EXTERNAL_SCOPES,
} from '../../../../../services/externalApiKeyService';

export function buildExternalOpenApiDocument(baseUrl = '/api/v1') {
  const paths: Record<string, unknown> = {
    '/external/assets/agents': {
      get: {
        tags: ['Assets'],
        summary: 'List ledger agents',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'offset', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK' }, '403': { description: 'Insufficient scope' } },
        'x-required-scopes': ['assets:read'],
      },
      post: {
        tags: ['Assets'],
        summary: 'Create ledger agent',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assets:write'],
        responses: { '201': { description: 'Created' } },
      },
    },
    '/external/assets/agents/{id}': {
      get: {
        tags: ['Assets'],
        summary: 'Get agent detail',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assets:read'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
      patch: {
        tags: ['Assets'],
        summary: 'Update agent',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assets:write'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/assets/discovered': {
      get: {
        tags: ['Assets'],
        summary: 'List discovered assets',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assets:read'],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/assets/discovered/{id}/claim': {
      post: {
        tags: ['Assets'],
        summary: 'Claim discovered asset into ledger',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assets:write'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '201': { description: 'Created' } },
      },
    },
    '/external/assets/discovered/{id}/ignore': {
      post: {
        tags: ['Assets'],
        summary: 'Ignore discovered asset',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assets:write'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/assessments/quick-start': {
      post: {
        tags: ['Assessments'],
        summary: 'One-click assessment create (recommended Python path)',
        description:
          'Pass kind=dialogue|compliance and assetId. Server auto-recommends libraries (like UI wizards), fills runtime from asset metadata.runtimeConfig, and for compliance resolves the default LLM judge. Optional libraryIds override. Default start=true executes after create. Errors: ASSET_RUNTIME_MISSING, NO_LIBRARIES, JUDGE_MODEL_MISSING.',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assessments:write'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['kind', 'assetId'],
                properties: {
                  kind: { type: 'string', enum: ['dialogue', 'compliance'] },
                  assetId: { type: 'string' },
                  name: { type: 'string' },
                  libraryIds: { type: 'array', items: { type: 'string' } },
                  assessScenario: { type: 'string' },
                  domainOverride: { type: 'string' },
                  start: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' }, '400': { description: 'Bad request' } },
      },
    },
    '/external/assessments/tasks': {
      get: {
        tags: ['Assessments'],
        summary: 'List assessment / scan tasks',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assessments:read'],
        responses: { '200': { description: 'OK' } },
      },
      post: {
        tags: ['Assessments'],
        summary: 'Create assessment with full wizard payload (advanced)',
        description:
          'Prefer POST /external/assessments/quick-start. Raw create requires the same fields as UI wizards: libIds/plans, asset runtime in runConfig, and for compliance a judgeConfig. Dialogue: scanType=agent_api; Compliance: scanType=合规检测.',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assessments:write'],
        responses: { '201': { description: 'Created' } },
      },
    },
    '/external/assessments/tasks/{id}': {
      get: {
        tags: ['Assessments'],
        summary: 'Get assessment task (poll status from Python)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assessments:read'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/assessments/tasks/{id}/execute': {
      post: {
        tags: ['Assessments'],
        summary: 'Execute assessment task (Python run step)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assessments:write'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/assessments/tasks/{id}/findings': {
      get: {
        tags: ['Assessments'],
        summary: 'List findings for an assessment task (Python result step)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['assessments:read'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/remediations': {
      get: {
        tags: ['Remediations'],
        summary: 'List remediations',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['remediations:read'],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/remediations/{id}': {
      get: {
        tags: ['Remediations'],
        summary: 'Get remediation detail',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['remediations:read'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
      patch: {
        tags: ['Remediations'],
        summary: 'Update remediation status / owner',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['remediations:write'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/remediations/{id}/evidence': {
      post: {
        tags: ['Remediations'],
        summary: 'Submit remediation evidence',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['remediations:write'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '201': { description: 'Created' } },
      },
    },
    '/external/remediations/{id}/retest': {
      post: {
        tags: ['Remediations'],
        summary: 'Record remediation retest',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['remediations:write'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '201': { description: 'Created' } },
      },
    },
    '/external/reports': {
      get: {
        tags: ['Reports'],
        summary: 'List reports (Python primary path)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['reports:read'],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/reports/{id}': {
      get: {
        tags: ['Reports'],
        summary: 'Get report metadata (Python)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['reports:read'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/reports/{id}/download': {
      get: {
        tags: ['Reports'],
        summary: 'Download report file (Python)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['reports:read'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Binary file' } },
      },
    },
    '/external/workbench/todos': {
      get: {
        tags: ['Workbench'],
        summary: 'My Todos summary (intake / admission / remediation)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['workbench:read'],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/tasks': {
      get: {
        tags: ['AttackTasks'],
        summary: 'List attack tasks (legacy)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['tasks:read'],
        responses: { '200': { description: 'OK' } },
      },
      post: {
        tags: ['AttackTasks'],
        summary: 'Create attack task (legacy)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['tasks:write'],
        responses: { '201': { description: 'Created' } },
      },
    },
    '/external/agents': {
      get: {
        tags: ['AttackTasks'],
        summary: 'List target agents (legacy red-team targets)',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['agents:read'],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/external/vulnerabilities': {
      get: {
        tags: ['Vulnerabilities'],
        summary: 'List vulnerability catalog',
        security: [{ ApiKeyAuth: [] }],
        'x-required-scopes': ['vulnerabilities:read'],
        responses: { '200': { description: 'OK' } },
      },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'Zhian External Integration API',
      version: '1.0.0',
      description:
        'Programmatic API for third-party Python clients. Primary product modules: Dialogue Security Assessment (agent_api /scan/technical-risks) and Output Compliance Assessment (合规检测 /scan/compliance-tasks). Flow: create → execute → poll → findings. Authenticate with Authorization: Bearer zhian.<uuid>.<secret>.',
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'zhian.<uuid>.<secret>',
          description: 'External API key issued from Developer API console',
        },
      },
    },
    'x-scopes': ALL_EXTERNAL_API_SCOPES,
    'x-default-scopes': DEFAULT_EXTERNAL_SCOPES,
    paths,
  };
}

export function externalOpenApiHandler(req: express.Request, res: express.Response) {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.get('host');
  const baseUrl = host ? `${proto}://${host}/api/v1` : '/api/v1';
  res.json(buildExternalOpenApiDocument(baseUrl));
}
