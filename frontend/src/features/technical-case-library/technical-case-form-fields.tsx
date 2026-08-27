import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { MappedTechnicalLibrary } from './shared';
import {
  CASE_STATUS_TEXT,
  normalizeTechnicalRiskLevel,
  TECHNICAL_RISK_LEVEL_OPTIONS,
  technicalRiskLevelLabel,
  type CaseStatus,
  type TechnicalRiskLevel,
} from './shared';
import { resolveDomainMeta } from './technical-case-domains';
import {
  TECHNICAL_TEST_METHODS,
  normalizeTurnSteps,
  resolveTestMethodLabel,
  type TechnicalTestMethodSlug,
  type TurnStep,
} from './technical-case-test-methods';
import {
  CUSTOM_CASE_BASIS_VALUE,
  TECHNICAL_CASE_BASIS_PRESETS,
} from './technical-case-basis-presets';

export type TechnicalCaseFormState = {
  caseCode: string;
  name: string;
  testMethodSlug: TechnicalTestMethodSlug;
  customTestMethod: string;
  prompt: string;
  expectedPass: string;
  expectedFail: string;
  riskLevel: TechnicalRiskLevel;
  attackScene: string;
  riskSubclass: string;
  caseBasisPreset: string;
  customCaseBasis: string;
  turnSteps: TurnStep[];
};

type TechnicalCaseFormFieldsProps = {
  library: MappedTechnicalLibrary;
  form: TechnicalCaseFormState;
  onChange: (form: TechnicalCaseFormState) => void;
};

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-border/60 pb-5 last:border-0 last:pb-0">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function DetailValue({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm whitespace-pre-wrap">
      {children}
    </div>
  );
}

export function TechnicalCaseFormFields({
  library,
  form,
  onChange,
}: TechnicalCaseFormFieldsProps) {
  const domainMeta = resolveDomainMeta(library.domain);
  const isMultiTurn = form.testMethodSlug === 'multi_turn';
  const isCustom = form.testMethodSlug === 'custom';
  const isCustomCaseBasis = form.caseBasisPreset === CUSTOM_CASE_BASIS_VALUE;

  function updateTurnStep(index: number, patch: Partial<TurnStep>) {
    const next = form.turnSteps.map((step, i) => (i === index ? { ...step, ...patch } : step));
    onChange({ ...form, turnSteps: next });
  }

  return (
    <div className="grid gap-5">
      <FormSection title="一、归属分类">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">所属检测库</Label>
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{domainMeta.kpiLibLabel}</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">所属攻击场景</Label>
            <Input
              value={form.attackScene}
              onChange={(event) => onChange({ ...form, attackScene: event.target.value })}
              placeholder={library.domain}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">所属风险子类</Label>
            <Input
              value={form.riskSubclass}
              onChange={(event) => onChange({ ...form, riskSubclass: event.target.value })}
              placeholder={library.category || library.title}
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="二、基础信息">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2 md:col-span-1">
            <Label>用例名称</Label>
            <Input
              value={form.name}
              onChange={(event) => onChange({ ...form, name: event.target.value })}
              placeholder="例如 单轮直接索取系统提示词"
            />
          </div>
          <div className="grid gap-2">
            <Label>风险等级</Label>
            <Select
              value={normalizeTechnicalRiskLevel(form.riskLevel)}
              onValueChange={(value) =>
                onChange({ ...form, riskLevel: value as TechnicalRiskLevel })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TECHNICAL_RISK_LEVEL_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormSection>

      <FormSection title="三、测试输入">
        <div className="grid gap-2">
          <Label>
            测试方式<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Select
            value={form.testMethodSlug}
            onValueChange={(value) =>
              onChange({
                ...form,
                testMethodSlug: value as TechnicalTestMethodSlug,
                turnSteps:
                  value === 'multi_turn' && form.turnSteps.length === 0
                    ? [{ userInput: '', expectedSafe: '' }]
                    : value === 'multi_turn'
                      ? form.turnSteps
                      : [],
              })
            }
          >
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TECHNICAL_TEST_METHODS.map((item) => (
                <SelectItem key={item.slug} value={item.slug}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isCustom ? (
            <Input
              value={form.customTestMethod}
              onChange={(event) => onChange({ ...form, customTestMethod: event.target.value })}
              placeholder="请输入自定义测试方式，例如：角色扮演测试"
              className="max-w-md"
            />
          ) : null}
        </div>

        {isMultiTurn ? (
          <div className="mt-3 grid gap-3">
            {form.turnSteps.map((step, index) => (
              <div key={index} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    第 {index + 1} 轮
                  </span>
                  {form.turnSteps.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-destructive"
                      onClick={() =>
                        onChange({
                          ...form,
                          turnSteps: form.turnSteps.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      删除
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <Label>用户输入</Label>
                  <Textarea
                    rows={3}
                    value={step.userInput}
                    onChange={(event) => updateTurnStep(index, { userInput: event.target.value })}
                    placeholder="本轮发送给 Agent 的内容"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="mt-2 grid gap-2">
                  <Label>预期安全响应</Label>
                  <Textarea
                    rows={2}
                    value={step.expectedSafe}
                    onChange={(event) =>
                      updateTurnStep(index, { expectedSafe: event.target.value })
                    }
                    placeholder="本轮 Agent 应如何安全响应"
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                onChange({
                  ...form,
                  turnSteps: [...form.turnSteps, { userInput: '', expectedSafe: '' }],
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              新增步骤
            </Button>
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            <Label>
              Prompt 载荷 / 测试输入<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Textarea
              rows={5}
              value={form.prompt}
              onChange={(event) => onChange({ ...form, prompt: event.target.value })}
              placeholder="请输入发送给 Agent 的测试内容"
              className="font-mono text-sm"
            />
          </div>
        )}
      </FormSection>

      <FormSection title="四、预期判定">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>
              预期安全响应<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Textarea
              rows={3}
              value={form.expectedPass}
              onChange={(event) => onChange({ ...form, expectedPass: event.target.value })}
              placeholder="Agent 应如何正确响应"
            />
          </div>
          <div className="grid gap-2">
            <Label>
              风险命中表现<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Textarea
              rows={3}
              value={form.expectedFail}
              onChange={(event) => onChange({ ...form, expectedFail: event.target.value })}
              placeholder="若 Agent 被攻破，会出现何种输出"
            />
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <Label>用例依据</Label>
          <Select
            value={form.caseBasisPreset}
            onValueChange={(value) =>
              onChange({
                ...form,
                caseBasisPreset: value,
                customCaseBasis: value === CUSTOM_CASE_BASIS_VALUE ? form.customCaseBasis : '',
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="选择用例依据" />
            </SelectTrigger>
            <SelectContent>
              {TECHNICAL_CASE_BASIS_PRESETS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_CASE_BASIS_VALUE}>自定义</SelectItem>
            </SelectContent>
          </Select>
          {isCustomCaseBasis ? (
            <Input
              value={form.customCaseBasis}
              onChange={(event) => onChange({ ...form, customCaseBasis: event.target.value })}
              placeholder="请输入自定义用例依据"
            />
          ) : null}
        </div>
      </FormSection>
    </div>
  );
}

function caseStatusLabel(status: string) {
  if (status === 'published') {
    return '启用';
  }
  if (status === 'archived') {
    return '停用';
  }
  return CASE_STATUS_TEXT[status as CaseStatus] || status;
}

export function TechnicalCaseDetailBody({
  library,
  caseItem,
}: {
  library: MappedTechnicalLibrary;
  caseItem: {
    caseCode: string;
    name: string;
    attackType: string;
    prompt: string;
    expectedPass?: string | null;
    expectedFail?: string | null;
    riskLevel: string;
    status: string;
    metadata?: Record<string, unknown> | null;
  };
}) {
  const domainMeta = resolveDomainMeta(library.domain);
  const meta = caseItem.metadata || {};
  const attackScene =
    typeof meta.attackScene === 'string' ? meta.attackScene : library.domain;
  const riskSubclass =
    typeof meta.riskSubclass === 'string' ? meta.riskSubclass : library.category || '—';
  const caseBasis =
    typeof meta.caseBasis === 'string' ? meta.caseBasis : library.standards[0] || '—';
  const testMethod = resolveTestMethodLabel(caseItem.attackType, caseItem.metadata);
  const turnSteps = normalizeTurnSteps(caseItem.metadata, caseItem.prompt);
  const isMultiTurn = turnSteps.length > 0;
  const riskLevel = normalizeTechnicalRiskLevel(caseItem.riskLevel);

  return (
    <div className="grid gap-5">
      <FormSection title="一、归属分类">
        <div className="grid gap-4 md:grid-cols-3">
          <DetailField label="所属检测库">{domainMeta.kpiLibLabel}</DetailField>
          <DetailField label="所属攻击场景">{attackScene}</DetailField>
          <DetailField label="所属风险子类">{riskSubclass}</DetailField>
        </div>
      </FormSection>

      <FormSection title="二、基础信息">
        <div className="grid gap-4 md:grid-cols-3">
          <DetailField label="用例编号">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{caseItem.caseCode}</code>
          </DetailField>
          <DetailField label="用例名称">{caseItem.name}</DetailField>
          <DetailField label="风险等级">
            <Badge variant="outline">{technicalRiskLevelLabel(riskLevel)}</Badge>
          </DetailField>
          <DetailField label="用例状态">
            <Badge variant={caseItem.status === 'published' ? 'default' : 'secondary'}>
              {caseStatusLabel(caseItem.status)}
            </Badge>
          </DetailField>
        </div>
      </FormSection>

      <FormSection title="三、测试输入">
        <DetailField label="测试方式">{testMethod}</DetailField>
        {isMultiTurn ? (
          <div className="mt-3 grid gap-3">
            {turnSteps.map((step, index) => (
              <div key={index} className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">第 {index + 1} 轮</p>
                <DetailValue>{step.userInput || '—'}</DetailValue>
                {step.expectedSafe ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    预期安全响应：{step.expectedSafe}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            <DetailField label="Prompt 载荷 / 测试输入">
              <DetailValue>{caseItem.prompt || '—'}</DetailValue>
            </DetailField>
          </div>
        )}
      </FormSection>

      <FormSection title="四、预期判定">
        <div className="grid gap-4 md:grid-cols-2">
          <DetailField label="预期安全响应">
            <DetailValue>{caseItem.expectedPass || '—'}</DetailValue>
          </DetailField>
          <DetailField label="风险命中表现">
            <DetailValue>{caseItem.expectedFail || '—'}</DetailValue>
          </DetailField>
        </div>
        <div className="mt-3">
          <DetailField label="用例依据">{caseBasis}</DetailField>
        </div>
      </FormSection>
    </div>
  );
}
