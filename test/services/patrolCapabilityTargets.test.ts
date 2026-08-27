import { buildPatrolCapabilityTargets } from '../../frontend/src/features/launch-monitoring/patrol-capability-targets';
import {
  capabilityRiskMatchesSelector,
  collectCapabilityRiskTargetSelectors,
} from '../../backend/src/services/patrolCapabilityRiskTargets';

describe('patrol capability targets', () => {
  it('keeps capability registry and risk-library context in patrol targets', () => {
    const targets = buildPatrolCapabilityTargets(
      [
        {
          id: 'asset-comp-1',
          organizationId: 'org-1',
          assetId: 'asset-1',
          componentType: 'mcp',
          componentName: 'Browser MCP',
          componentKey: 'browser-mcp',
          version: '1.0.0',
          sourceType: 'capability_component',
          sourceRefId: 'registry-1',
          highRisk: true,
          configSnapshot: {
            registryId: 'registry-1',
            riskLibraryId: 'risk-1',
            riskTitle: '工具 Schema 可被注入劫持',
            riskLevel: 'high',
          },
          enabled: true,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      ['asset-comp-1'],
    );

    expect(targets).toEqual([
      expect.objectContaining({
        kind: 'mcp',
        id: 'asset-comp-1',
        assetComponentId: 'asset-comp-1',
        registryId: 'registry-1',
        riskId: 'risk-1',
        key: 'browser-mcp',
      }),
    ]);
  });

  it('treats an empty selected component list as no capability targets', () => {
    const targets = buildPatrolCapabilityTargets(
      [
        {
          id: 'asset-comp-1',
          organizationId: 'org-1',
          assetId: 'asset-1',
          componentType: 'skill',
          componentName: 'Filesystem Skill',
          highRisk: false,
          enabled: true,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      [],
    );

    expect(targets).toEqual([]);
  });

  it('matches selected asset components back to capability risk libraries', () => {
    const initial = collectCapabilityRiskTargetSelectors([
      {
        targets: [{ kind: 'mcp', id: 'asset-comp-1', key: 'browser-mcp' }],
      },
    ]);

    const resolved = collectCapabilityRiskTargetSelectors(
      [
        {
          targets: [{ kind: 'mcp', id: 'asset-comp-1', key: 'browser-mcp' }],
        },
      ],
      [
        {
          id: 'asset-comp-1',
          componentType: 'mcp',
          componentKey: 'browser-mcp',
          sourceType: 'capability_component',
          sourceRefId: 'registry-1',
          configSnapshot: { riskLibraryId: 'risk-1' },
        },
      ],
    );

    expect(initial.assetComponentIds).toContain('asset-comp-1');
    expect(resolved.riskIds).toContain('risk-1');
    expect(resolved.registryIds).toContain('registry-1');
    expect(
      capabilityRiskMatchesSelector(
        {
          id: 'risk-1',
          registryId: 'registry-1',
          componentKind: 'mcp',
          componentKey: 'browser-mcp',
        },
        resolved,
      ),
    ).toBe(true);
  });
});
