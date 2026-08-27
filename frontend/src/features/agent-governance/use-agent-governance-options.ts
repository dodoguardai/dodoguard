import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  agentGovernanceApi,
  type AgentGovernanceMaster,
  type OwnerType,
} from '@/services/api/agent-governance';

export const AGENT_GOVERNANCE_QUERY_KEY = ['agent-governance', 'master'] as const;

export function selectableValues(options: string[], current?: string | null): string[] {
  const set = new Set(options.filter(Boolean));
  if (current && !set.has(current)) {
    set.add(current);
  }
  return Array.from(set);
}

export const OWNER_TYPE_OPTIONS = [
  ['business', '业务负责人'],
  ['developer', '开发负责人'],
  ['security', '安全负责人'],
  ['ops', '运维负责人'],
] as const satisfies ReadonlyArray<readonly [OwnerType, string]>;

export function useAgentGovernanceOptions() {
  const query = useQuery({
    queryKey: AGENT_GOVERNANCE_QUERY_KEY,
    queryFn: () => agentGovernanceApi.getMaster(),
    staleTime: 60_000,
  });

  const derived = useMemo(() => {
    const master = query.data;
    if (!master) {
      return {
        departments: [] as string[],
        businessSystems: [] as Array<{
          name: string;
          department: string;
          scene: string;
        }>,
        businessScenes: [] as string[],
        ownersByType: {
          business: [] as string[],
          developer: [] as string[],
          security: [] as string[],
          ops: [] as string[],
        },
        ownerDirectory: [] as Array<{
          name: string;
          ownerType: OwnerType;
          department: string;
        }>,
      };
    }

    const activeDepartments = master.departments
      .filter((d) => d.status === 'active')
      .map((d) => d.name);
    const activeScenes = master.businessScenes
      .filter((s) => s.status === 'active')
      .map((s) => s.name);
    const activeBusinessSystems = master.businessSystems
      .filter((b) => b.status === 'active')
      .map((b) => ({
        name: b.name,
        department: b.departmentName || '',
        scene: b.sceneName || '',
      }));
    const activeOwners = master.owners.filter((o) => o.status === 'active');

    const ownersByType: Record<OwnerType, string[]> = {
      business: [],
      developer: [],
      security: [],
      ops: [],
    };
    for (const owner of activeOwners) {
      ownersByType[owner.ownerType].push(owner.name);
    }

    return {
      departments: activeDepartments,
      businessSystems: activeBusinessSystems,
      businessScenes: activeScenes,
      ownersByType,
      ownerDirectory: activeOwners.map((o) => ({
        name: o.name,
        ownerType: o.ownerType,
        department: o.departmentName || '',
      })),
    };
  }, [query.data]);

  return {
    ...query,
    master: query.data as AgentGovernanceMaster | undefined,
    ...derived,
    isEmpty:
      !query.isLoading &&
      derived.departments.length === 0 &&
      derived.businessSystems.length === 0 &&
      derived.businessScenes.length === 0 &&
      derived.ownerDirectory.length === 0,
  };
}
