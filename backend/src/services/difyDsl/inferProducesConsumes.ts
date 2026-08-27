import { refPathString } from './extractRefs';
import { isRecord } from './utils';

import type { NormalizedNode, RefToken } from './normalizeTypes';

function structuredOutputFieldPaths(nodeId: string, payload: Record<string, unknown>): string[] {
  const so = payload.structured_output_schema ?? payload.structured_output;
  if (!isRecord(so)) {
    return [];
  }
  const schema = so.schema ?? so.json_schema ?? so;
  if (!isRecord(schema)) {
    return [];
  }
  const props = schema.properties;
  if (!isRecord(props)) {
    return [];
  }
  return Object.keys(props)
    .slice(0, 48)
    .map((k) => `${nodeId}.structured_output.${k}`);
}

export function inferProduces(node: NormalizedNode): string[] {
  const { node_id, node_type, payload } = node;
  const nt = node_type.trim().toLowerCase().replace(/_/g, '-');
  const out: string[] = [];

  if (nt === 'start' || nt === 'trigger' || nt === 'user-input' || nt === 'userinput') {
    out.push('sys.query', 'sys.files', 'sys.workflow_run_id');
    return out;
  }
  if (nt === 'llm' || nt === 'chat' || nt === 'completion') {
    out.push(`${node_id}.text`);
    if (payload.structured_output_enabled) {
      out.push(...structuredOutputFieldPaths(node_id, payload));
    }
    return out;
  }
  if (nt === 'tool' || nt === 'custom-tool' || nt === 'customtool') {
    out.push(`${node_id}.text`);
    return out;
  }
  if (nt === 'if-else' || nt === 'ifelse' || nt === 'conditional') {
    return out;
  }
  if (nt === 'knowledge-retrieval' || nt.includes('knowledge')) {
    const ov = typeof payload.output_variable === 'string' ? payload.output_variable : 'result';
    out.push(`${node_id}.${ov}`);
    return out;
  }
  if (nt === 'answer' || nt === 'reply' || nt === 'output') {
    return out;
  }
  if (nt === 'template') {
    out.push(`${node_id}.text`);
    return out;
  }
  if (nt === 'code' || nt === 'custom-code') {
    const ovs = payload.output_variables;
    if (Array.isArray(ovs)) {
      for (const x of ovs) {
        if (typeof x === 'string') {
          out.push(`${node_id}.${x}`);
        } else if (isRecord(x) && typeof x.variable === 'string') {
          out.push(`${node_id}.${x.variable}`);
        }
      }
    }
    if (out.length === 0) {
      out.push(`${node_id}.output`);
    }
    return out;
  }

  return out;
}

export function refsToConsumes(refs: RefToken[]): string[] {
  return refs.map(refPathString);
}

export function inferRefsOutFromProduces(produces: string[]): RefToken[] {
  return produces.map((p) => {
    const parts = p.split('.');
    const root = parts[0] ?? p;
    const path = parts.slice(1);
    return {
      raw: p,
      root,
      path,
      kind: root === 'sys' ? ('system_ref' as const) : ('node_ref' as const),
    };
  });
}
