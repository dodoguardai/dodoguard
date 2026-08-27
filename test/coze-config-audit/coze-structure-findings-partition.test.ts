import {
  locationMatchesNode,
  nodeIndexFromLogicalPointer,
  partitionFindingsByNode,
} from '../../frontend/src/features/coze-config-audit/coze-structure-findings-partition';
import type {
  DifyConfigAuditFinding,
  DifyNodeInventoryItem,
} from '../../frontend/src/services/api/dify-config-audit';

describe('coze-structure-findings-partition', () => {
  it('nodeIndexFromLogicalPointer reads Coze /nodes/N', () => {
    expect(nodeIndexFromLogicalPointer('/nodes/3')).toBe('3');
    expect(nodeIndexFromLogicalPointer('/nodes/0/data')).toBe('0');
  });

  it('nodeIndexFromLogicalPointer reads Dify workflow path', () => {
    expect(nodeIndexFromLogicalPointer('/workflow/graph/nodes/2/data')).toBe('2');
  });

  it('partitionFindingsByNode assigns by Coze node id in location', () => {
    const nodes: DifyNodeInventoryItem[] = [
      {
        id: 'node_a',
        graphType: 'llm',
        dataType: 'llm',
        title: 'A',
        logicalPointer: '/nodes/0',
      },
    ];
    const findings: DifyConfigAuditFinding[] = [
      {
        severity: 'high',
        category: 'test',
        location: 'rule · L12 · node_a',
        issue: 'hit',
        evidence: 'x',
        recommendation: 'y',
      },
    ];
    const { byNodeId, unmatched } = partitionFindingsByNode(findings, nodes);
    expect(unmatched).toHaveLength(0);
    expect(byNodeId.get('node_a')).toHaveLength(1);
  });

  it('locationMatchesNode matches logicalPointer substring', () => {
    const node: DifyNodeInventoryItem = {
      id: 'x',
      graphType: 'plugin',
      dataType: 'plugin',
      logicalPointer: '/nodes/1',
    };
    expect(locationMatchesNode('/nodes/1 · line 5', node)).toBe(true);
  });
});
