import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  OWNER_TYPE_OPTIONS,
  selectableValues,
  useAgentGovernanceOptions,
} from '@/features/agent-governance/use-agent-governance-options';
import type { OwnerType } from '@/services/api/agent-governance';
import { cn } from '@/lib/utils';

export const EMPTY_SELECT_VALUE = '__empty__';

export const selectOwnershipValue = (value?: string | null) =>
  value?.trim() || EMPTY_SELECT_VALUE;

export type AgentOwnershipOwner = {
  ownerType: OwnerType;
  ownerName: string;
  department?: string;
  isPrimary?: boolean;
};

export type AgentOwnershipValue = {
  department: string;
  businessSystem: string;
  businessScene: string;
  owners: AgentOwnershipOwner[];
};

type AgentOwnershipFieldsProps = {
  value: AgentOwnershipValue;
  onChange: (value: AgentOwnershipValue) => void;
  layout?: 'grid-4' | 'grid-2';
  className?: string;
};

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function AgentOwnershipFields({
  value,
  onChange,
  layout = 'grid-4',
  className,
}: AgentOwnershipFieldsProps) {
  const {
    departments,
    businessSystems,
    businessScenes,
    ownerDirectory,
    isLoading,
    isEmpty,
  } = useAgentGovernanceOptions();

  const gridClass =
    layout === 'grid-4' ? 'grid gap-x-6 gap-y-4 md:grid-cols-4' : 'grid gap-3 md:grid-cols-2';

  const setDepartment = (department: string) => {
    const nextDepartment = department === EMPTY_SELECT_VALUE ? '' : department;
    onChange({
      ...value,
      department: nextDepartment,
      owners: value.owners.map((owner) => ({ ...owner, department: nextDepartment })),
    });
  };

  const setBusinessSystem = (businessSystem: string) => {
    if (businessSystem === EMPTY_SELECT_VALUE) {
      onChange({ ...value, businessSystem: '' });
      return;
    }
    const matched = businessSystems.find((item) => item.name === businessSystem);
    onChange({
      ...value,
      businessSystem,
      department: matched?.department || value.department,
      businessScene: matched?.scene || value.businessScene,
      owners: value.owners.map((owner) => ({
        ...owner,
        department: matched?.department || value.department,
      })),
    });
  };

  const setBusinessScene = (businessScene: string) => {
    onChange({
      ...value,
      businessScene: businessScene === EMPTY_SELECT_VALUE ? '' : businessScene,
    });
  };

  const setOwnerName = (ownerType: OwnerType, ownerName: string) => {
    const nextName = ownerName === EMPTY_SELECT_VALUE ? '' : ownerName;
    const owners = [...value.owners];
    const index = owners.findIndex((item) => item.ownerType === ownerType);
    const meta = ownerDirectory.find(
      (item) => item.ownerType === ownerType && item.name === nextName,
    );
    const nextOwner: AgentOwnershipOwner = {
      ownerType,
      ownerName: nextName,
      department: meta?.department || value.department,
      ...(ownerType === 'security' ? { isPrimary: true } : {}),
    };
    if (index >= 0) {
      owners[index] = { ...owners[index], ...nextOwner };
    } else {
      owners.push(nextOwner);
    }
    onChange({ ...value, owners });
  };

  if (isEmpty && !isLoading) {
    return (
      <div className={cn('rounded-md border border-dashed px-3 py-4 text-center text-sm', className)}>
        <p className="text-muted-foreground">尚未配置归属主数据。</p>
        <Link to="/system/agent-ownership" className="mt-2 inline-block text-sm text-primary underline">
          前往「智能体资产归属与负责人管理」
        </Link>
      </div>
    );
  }

  return (
    <div className={cn(gridClass, className)}>
      <Field label="所属部门">
        <Select value={selectOwnershipValue(value.department)} onValueChange={setDepartment}>
          <SelectTrigger>
            <SelectValue placeholder="选择所属部门" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SELECT_VALUE}>未设置</SelectItem>
            {selectableValues(departments, value.department).map((department) => (
              <SelectItem key={department} value={department}>
                {department}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="业务系统">
        <Select
          value={selectOwnershipValue(value.businessSystem)}
          onValueChange={setBusinessSystem}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择业务系统" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SELECT_VALUE}>未设置</SelectItem>
            {selectableValues(
              businessSystems.map((item) => item.name),
              value.businessSystem,
            ).map((system) => {
              const meta = businessSystems.find((item) => item.name === system);
              return (
                <SelectItem key={system} value={system}>
                  {system}
                  {meta?.department ? ` · ${meta.department}` : ''}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </Field>

      <Field label="业务场景">
        <Select
          value={selectOwnershipValue(value.businessScene)}
          onValueChange={setBusinessScene}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择业务场景" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SELECT_VALUE}>未设置</SelectItem>
            {selectableValues(businessScenes, value.businessScene).map((scene) => (
              <SelectItem key={scene} value={scene}>
                {scene}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {OWNER_TYPE_OPTIONS.map(([ownerType, label]) => {
        const owner = value.owners.find((item) => item.ownerType === ownerType);
        const ownerOptions = selectableValues(
          ownerDirectory.filter((item) => item.ownerType === ownerType).map((item) => item.name),
          owner?.ownerName,
        );
        return (
          <Field key={ownerType} label={label}>
            <Select
              value={selectOwnershipValue(owner?.ownerName)}
              onValueChange={(next) => setOwnerName(ownerType, next)}
            >
              <SelectTrigger>
                <SelectValue placeholder={`选择${label}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_SELECT_VALUE}>未设置</SelectItem>
                {ownerOptions.map((ownerName) => {
                  const meta = ownerDirectory.find(
                    (item) => item.ownerType === ownerType && item.name === ownerName,
                  );
                  return (
                    <SelectItem key={ownerName} value={ownerName}>
                      {ownerName}
                      {meta?.department ? ` · ${meta.department}` : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
        );
      })}
    </div>
  );
}
