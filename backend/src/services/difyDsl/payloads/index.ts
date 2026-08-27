import { extractAnswerPayload } from './answer';
import { extractGenericPayload } from './generic';
import { extractIfElsePayload } from './ifElse';
import { extractKnowledgeRetrievalPayload } from './knowledgeRetrieval';
import { extractLlmPayload } from './llm';
import { extractStartPayload } from './start';
import { extractToolPayload } from './tool';

function normalizeNodeType(t: string): string {
  return t.trim().toLowerCase().replace(/_/g, '-');
}

export function extractPayloadForNodeType(
  nodeType: string,
  data: Record<string, unknown> | null,
): Record<string, unknown> {
  const dt = normalizeNodeType(nodeType || 'unknown');
  if (!data) {
    return extractGenericPayload(null);
  }

  if (dt === 'start' || dt === 'trigger' || dt === 'user-input' || dt === 'userinput') {
    return extractStartPayload(data);
  }
  if (dt === 'llm' || dt === 'chat' || dt === 'completion') {
    return extractLlmPayload(data);
  }
  if (dt === 'tool' || dt === 'custom-tool' || dt === 'customtool') {
    return extractToolPayload(data);
  }
  if (
    dt === 'knowledge-retrieval' ||
    dt === 'dataset-retrieval' ||
    dt === 'knowledgeretrieval' ||
    dt.includes('knowledge')
  ) {
    return extractKnowledgeRetrievalPayload(data);
  }
  if (dt === 'if-else' || dt === 'ifelse' || dt === 'conditional') {
    return extractIfElsePayload(data);
  }
  if (dt === 'answer' || dt === 'reply') {
    return extractAnswerPayload(data);
  }

  return extractGenericPayload(data);
}

export function isMvpKnownType(nodeType: string): boolean {
  const dt = normalizeNodeType(nodeType || '');
  return (
    dt === 'start' ||
    dt === 'trigger' ||
    dt === 'user-input' ||
    dt === 'userinput' ||
    dt === 'llm' ||
    dt === 'chat' ||
    dt === 'completion' ||
    dt === 'tool' ||
    dt === 'custom-tool' ||
    dt === 'customtool' ||
    dt === 'knowledge-retrieval' ||
    dt === 'dataset-retrieval' ||
    dt.includes('knowledge') ||
    dt === 'if-else' ||
    dt === 'ifelse' ||
    dt === 'conditional' ||
    dt === 'answer' ||
    dt === 'reply'
  );
}
