/**
 * Group raw workflow node types (Dify / FastGPT / Coze) into coarse categories for dashboard-style UI.
 */

export type WorkflowNodeCategoryId =
  | 'entry'
  | 'llm'
  | 'knowledge'
  | 'tools'
  | 'code_data'
  | 'variables'
  | 'control'
  | 'output'
  | 'annotation'
  | 'other';

export const WORKFLOW_NODE_CATEGORY_ORDER: WorkflowNodeCategoryId[] = [
  'entry',
  'llm',
  'knowledge',
  'tools',
  'code_data',
  'variables',
  'control',
  'output',
  'annotation',
  'other',
];

export function normalizeWorkflowNodeTypeKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

/**
 * Map a single normalized or raw node type string to a category.
 */
export function inferWorkflowNodeCategory(rawType: string): WorkflowNodeCategoryId {
  const nt = normalizeWorkflowNodeTypeKey(rawType);

  if (!nt || nt === 'unknown') {
    return 'other';
  }

  if (
    nt === 'start' ||
    nt === 'trigger' ||
    nt === 'user-input' ||
    nt === 'userinput' ||
    nt === 'chat-trigger' ||
    nt.endsWith('-trigger')
  ) {
    return 'entry';
  }

  if (
    nt === 'llm' ||
    nt === 'chat' ||
    nt === 'completion' ||
    nt === 'agent' ||
    nt === 'question-classifier' ||
    nt === 'questionclassifier' ||
    nt === 'parameter-extractor' ||
    nt === 'parameterextractor' ||
    nt.includes('classifier')
  ) {
    return 'llm';
  }

  if (
    nt === 'knowledge-retrieval' ||
    nt === 'dataset-retrieval' ||
    nt === 'knowledgeretrieval' ||
    nt.includes('knowledge') ||
    nt.includes('retrieval')
  ) {
    return 'knowledge';
  }

  if (
    nt === 'tool' ||
    nt === 'custom-tool' ||
    nt === 'customtool' ||
    nt === 'http-request' ||
    nt === 'httprequest' ||
    nt.startsWith('mcp') ||
    nt.includes('datasource') ||
    nt.includes('plugin') ||
    nt === 'api'
  ) {
    return 'tools';
  }

  if (
    nt === 'code' ||
    nt === 'template-transform' ||
    nt === 'templatetransform' ||
    nt === 'list-operator' ||
    nt === 'listoperator' ||
    nt === 'document-extractor' ||
    nt === 'documentextractor' ||
    nt === 'text-splitter' ||
    nt === 'textsplitter'
  ) {
    return 'code_data';
  }

  if (
    nt === 'variable-assigner' ||
    nt === 'variableassigner' ||
    nt === 'variable-aggregator' ||
    nt === 'variableaggregator' ||
    nt === 'assigner' ||
    nt.includes('assigner') ||
    nt.includes('aggregator')
  ) {
    return 'variables';
  }

  if (
    nt === 'if-else' ||
    nt === 'ifelse' ||
    nt === 'conditional' ||
    nt === 'switch' ||
    nt.includes('iteration') ||
    nt.includes('loop') ||
    nt === 'break' ||
    nt === 'continue'
  ) {
    return 'control';
  }

  if (nt === 'answer' || nt === 'reply' || nt === 'end') {
    return 'output';
  }

  if (nt === 'note' || nt === 'sticky' || nt === 'markdown') {
    return 'annotation';
  }

  return 'other';
}

export type DistributionEntry = { type: string; count: number };

export type GroupedCategory = {
  id: WorkflowNodeCategoryId;
  total: number;
  items: DistributionEntry[];
};

/**
 * Bucket flat type→count into categories; items within each category sorted by count desc.
 */
export function groupNodeTypeDistribution(entries: DistributionEntry[]): GroupedCategory[] {
  const map = new Map<WorkflowNodeCategoryId, DistributionEntry[]>();
  for (const id of WORKFLOW_NODE_CATEGORY_ORDER) {
    map.set(id, []);
  }

  for (const e of entries) {
    if (e.count <= 0) {
      continue;
    }
    const cat = inferWorkflowNodeCategory(e.type);
    const list = map.get(cat);
    if (list) {
      list.push(e);
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => b.count - a.count);
  }

  return WORKFLOW_NODE_CATEGORY_ORDER.map((id) => {
    const items = map.get(id) ?? [];
    const total = items.reduce((s, x) => s + x.count, 0);
    return { id, total, items };
  }).filter((g) => g.total > 0);
}
