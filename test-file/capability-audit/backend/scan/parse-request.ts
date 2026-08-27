/**
 * Parse analyze request from express (shared by sync + async routes).
 */

import type express from 'express';
import { z } from 'zod';

import { MAX_SKILL_ZIP_BYTES } from '../../../backend/src/services/skillPackageExtract';
import { fetchArtifactFromUrl } from './fetch-source-url';
import type { ScanArtifactKind, ScanStrategy } from './types';

export const strategySchema = z.enum([
  'quick',
  'standard',
  'deep_offline',
  'online_enhanced',
  'debug',
  'llm_only',
]);
export const artifactKindSchema = z.enum(['skills', 'mcp', 'tool']);
const engineNameSchema = z.string().trim().min(1).max(80);

export const providerSchema = z
  .object({
    id: z.string().min(1),
    config: z.record(z.unknown()).optional(),
  })
  .optional();

const ARCHIVE_EXT = /\.(zip|tar\.gz|tgz)$/i;

function isSupportedArchive(fileName?: string): boolean {
  return Boolean(fileName && ARCHIVE_EXT.test(fileName));
}

export const jsonBodySchema = z
  .object({
    strategy: strategySchema.default('standard'),
    artifactKind: artifactKindSchema.default('skills'),
    engines: z.array(engineNameSchema).max(12).optional(),
    markdown: z
      .string()
      .min(1)
      .max(5 * 1024 * 1024)
      .optional(),
    fileName: z.string().max(512).optional(),
    sourceUrl: z.string().url().max(2048).optional(),
    provider: providerSchema,
    callbackUrl: z.string().url().max(2048).optional(),
  })
  .refine((d) => Boolean(d.markdown?.trim()) || Boolean(d.sourceUrl?.trim()), {
    message: 'JSON body requires markdown, sourceUrl, or multipart archive upload',
  });

export type ParsedScanInput = {
  strategy: ScanStrategy;
  artifactKind: ScanArtifactKind;
  markdown?: string;
  fileName?: string;
  sourceUrl?: string;
  provider?: z.infer<typeof providerSchema>;
  engines?: string[];
  callbackUrl?: string;
  zipBuffer?: Buffer;
};

export type ParseScanResult =
  | { ok: true; input: ParsedScanInput }
  | { ok: false; status: number; code: string; message: string; details?: unknown };

function parseEngines(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw.trim().startsWith('[')
      ? (JSON.parse(raw) as unknown)
      : typeof raw === 'string'
        ? raw.split(',')
        : raw;
  const parsed = z.array(engineNameSchema).max(12).safeParse(values);
  if (!parsed.success) {
    throw new Error('engines must be a comma-separated list or JSON string array');
  }
  return [...new Set(parsed.data.map((v) => v.trim()).filter(Boolean))];
}

export function parseScanRequest(req: express.Request): ParseScanResult {
  if (req.file) {
    const body = req.body as Record<string, unknown>;
    const st = strategySchema.safeParse(body.strategy ?? 'standard');
    const ak = artifactKindSchema.safeParse(body.artifactKind ?? 'skills');
    if (!st.success || !ak.success) {
      return {
        ok: false,
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid strategy or artifactKind',
      };
    }
    const fileName = req.file.originalname;
    if (st.data && (ak.data === 'mcp' || ak.data === 'tool') && !isSupportedArchive(fileName)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_ARCHIVE',
        message: `${ak.data === 'tool' ? 'Tool' : 'MCP'} audit requires .zip or .tar.gz archive`,
      };
    }

    let provider: z.infer<typeof providerSchema>;
    const rawProvider = body.provider;
    if (rawProvider !== undefined && rawProvider !== '') {
      try {
        const parsed = typeof rawProvider === 'string' ? JSON.parse(rawProvider) : rawProvider;
        const pr = providerSchema.safeParse(parsed);
        if (!pr.success) {
          return {
            ok: false,
            status: 400,
            code: 'VALIDATION_ERROR',
            message: 'Invalid provider JSON',
          };
        }
        provider = pr.data;
      } catch {
        return {
          ok: false,
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'provider must be valid JSON',
        };
      }
    }

    let engines: string[] | undefined;
    try {
      engines = parseEngines(body.engines);
    } catch {
      return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid engines value' };
    }

    const callbackUrl =
      typeof body.callbackUrl === 'string' && body.callbackUrl.trim()
        ? body.callbackUrl.trim()
        : undefined;
    if (callbackUrl && !z.string().url().safeParse(callbackUrl).success) {
      return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid callbackUrl' };
    }

    if (req.file.size > MAX_SKILL_ZIP_BYTES) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_ARCHIVE',
        message: 'Archive exceeds size limit',
      };
    }

    return {
      ok: true,
      input: {
        strategy: st.data,
        artifactKind: ak.data,
        fileName,
        zipBuffer: req.file.buffer,
        provider,
        engines,
        callbackUrl,
      },
    };
  }

  const parsed = jsonBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'JSON body requires markdown or use multipart with archive',
      details: parsed.error.flatten(),
    };
  }

  if (
    (parsed.data.artifactKind === 'mcp' || parsed.data.artifactKind === 'tool') &&
    !parsed.data.markdown &&
    !parsed.data.sourceUrl
  ) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_ARCHIVE',
      message: `${parsed.data.artifactKind === 'tool' ? 'Tool' : 'MCP'} scan requires ZIP upload`,
    };
  }

  return { ok: true, input: parsed.data };
}

export async function resolveScanInput(input: ParsedScanInput): Promise<ParseScanResult> {
  if (!input.sourceUrl?.trim()) {
    if (!input.zipBuffer && !input.markdown?.trim()) {
      return {
        ok: false,
        status: 400,
        code: 'MISSING_INPUT',
        message: 'Upload archive, paste markdown, or provide sourceUrl',
      };
    }
    return { ok: true, input };
  }

  const fetched = await fetchArtifactFromUrl(input.sourceUrl);
  if (!fetched.ok) {
    return {
      ok: false,
      status: 400,
      code: 'URL_FETCH_FAILED',
      message: fetched.message,
    };
  }

  const { sourceUrl: _drop, ...rest } = input;
  if (fetched.artifact.kind === 'archive') {
    return {
      ok: true,
      input: {
        ...rest,
        zipBuffer: fetched.artifact.buffer,
        fileName: fetched.artifact.fileName,
      },
    };
  }

  return {
    ok: true,
    input: {
      ...rest,
      markdown: fetched.artifact.text,
      fileName: fetched.artifact.fileName,
    },
  };
}
