import { useCallback, useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
import { COMPLIANCE_DOMAINS, readLibraryMeta } from '@/features/compliance-case-library/shared';
import { mapWizardScenarioToTemplate } from '@/features/compliance-detection/compliance-apply-template';
import {
  ASSESS_SCENARIOS,
  type AssessScenario,
  WizardCheckboxCard,
  WizardModeCard,
  WizardNotice,
  WizardSectionHead,
  WizardStatCard,
} from '@/features/compliance-detection/compliance-wizard-ui';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type {
  ComplianceTaskTemplate,
  SecurityCaseLibrary,
  SecurityScanTask,
} from '@/types/entities';

const COMPLIANCE_SCAN_TYPE = '合规检测';

/** 与后端 create template 默认 sampleTypes 一致 */
const DEFAULT_SAMPLE_TYPES = ['single', 'multi_turn'];

const TEMPLATE_WIZARD_STEPS = ['基础配置', '创建方式', '控制库', '确认保存'] as const;

const TEMPLATE_FOOTER_NOTES: Record<number, string> = {
  1: '填写模版名称、合规域与评估范围，可复用于一键创建合规评估任务。',
  2: '选择创建方式，决定任务向导中的默认 AI 推荐或手动选库行为。',
  3: '至少选择 1 个合规控制库，模版将预填任务计划中的选库结果。',
  4: '确认模版配置后保存，可在「合规任务模版」中一键发起评估。',
};

const TEMPLATE_NEXT_LABELS: Record<number, string> = {
  1: '下一步',
  2: '下一步',
  3: '下一步',
  4: '创建模版',
};

type ComplianceTaskTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: ComplianceTaskTemplate | null;
};

function TemplateWizardStepper({ currentStep }: { currentStep: number }) {
  return (
    <nav
      aria-label="模版创建步骤"
      className="mb-6 flex items-center gap-0 overflow-x-auto rounded-[18px] border bg-white px-4 py-3 shadow-sm"
    >
      {TEMPLATE_WIZARD_STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isDone = stepNumber < currentStep;
        return (
          <div key={label} className="flex min-w-fit flex-1 items-center">
            {index > 0 ? <div className="mx-1 h-px min-w-4 flex-1 bg-border" /> : null}
            <div
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-bold',
                isActive && 'text-[#1f5cff]',
                isDone && 'text-foreground',
                !isActive && !isDone && 'text-[#8b95a7]',
              )}
            >
              <span
                className={cn(
                  'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-xs font-black',
                  isActive && 'bg-[#1f5cff] text-white',
                  isDone && 'bg-foreground text-background',
                  !isActive && !isDone && 'bg-[#dfe5ed] text-[#617084]',
                )}
              >
                {stepNumber}
              </span>
              {label}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function resolveLibraryKeysFromCatalog(
  libraries: SecurityCaseLibrary[],
  keysOrIds: string[],
): string[] {
  const resolved: string[] = [];
  for (const item of keysOrIds) {
    const byKey = libraries.find((lib) => lib.libraryKey === item);
    if (byKey?.libraryKey) {
      resolved.push(byKey.libraryKey);
      continue;
    }
    const byId = libraries.find((lib) => lib.id === item);
    if (byId?.libraryKey) {
      resolved.push(byId.libraryKey);
    }
  }
  return [...new Set(resolved)];
}

function readTemplateLibraryKeys(template: ComplianceTaskTemplate): string[] {
  if (template.libraryKeys.length) {
    return template.libraryKeys;
  }
  return (template.libraries?.map((lib) => lib.libraryKey).filter(Boolean) ?? []) as string[];
}

function readTaskDomain(task: SecurityScanTask): string {
  const domain = task.metadata?.domain;
  return typeof domain === 'string' && domain.trim() ? domain : '通用合规';
}

function readTaskDescription(task: SecurityScanTask): string {
  const description = task.metadata?.taskDescription;
  if (typeof description === 'string' && description.trim()) {
    return description;
  }
  return task.targetSummary || '';
}

function mapTemplateScenarioToWizard(value: string): AssessScenario {
  if (value === 'periodic' || value === 'patrol') {
    return 'patrol';
  }
  if (value === 'change' || value === 'regression') {
    return 'regression';
  }
  return 'launch';
}

export function ComplianceTaskTemplateDialog({
  open,
  onOpenChange,
  template,
}: ComplianceTaskTemplateDialogProps) {
  const queryClient = useQueryClient();
  const isFork = Boolean(template?.isSystem);
  const isEdit = Boolean(template?.id && !template.isSystem);

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState<string>(COMPLIANCE_DOMAINS[0]);
  const [scope, setScope] = useState('');
  const [description, setDescription] = useState('');
  const [assessScenario, setAssessScenario] = useState<AssessScenario>('launch');
  const [creationMode, setCreationMode] = useState<'ai' | 'manual'>('manual');
  const [selectedLibraryKeys, setSelectedLibraryKeys] = useState<string[]>([]);
  const [importTaskId, setImportTaskId] = useState('');
  const [libSearch, setLibSearch] = useState('');
  const [libFilter, setLibFilter] = useState<'all' | 'selected' | 'unselected'>('all');

  const librariesQuery = useQuery({
    queryKey: ['compliance-template-libraries'],
    queryFn: () => detectionScanningApi.listAllCaseLibraries({ category: 'compliance' }),
    enabled: open,
  });

  const completedTasksQuery = useQuery({
    queryKey: ['compliance-completed-tasks-for-template'],
    queryFn: () =>
      detectionScanningApi.listTasks({
        limit: 50,
        scanType: COMPLIANCE_SCAN_TYPE,
        status: 'completed',
      }),
    enabled: open && !isEdit && !isFork,
  });

  const libraries = useMemo(
    () => (librariesQuery.data?.data ?? []).filter((item) => item.enabled),
    [librariesQuery.data?.data],
  );

  const scenarioLabel =
    ASSESS_SCENARIOS.find((item) => item.value === assessScenario)?.label || '上线前准入';

  const selectedLibraries = useMemo(
    () => libraries.filter((lib) => selectedLibraryKeys.includes(lib.libraryKey)),
    [libraries, selectedLibraryKeys],
  );

  const totalCaseCount = useMemo(
    () =>
      selectedLibraryKeys.reduce((sum, key) => {
        const lib = libraries.find((item) => item.libraryKey === key);
        return sum + (lib?.caseCount ?? 0);
      }, 0),
    [libraries, selectedLibraryKeys],
  );

  const filteredLibraries = useMemo(() => {
    const kw = libSearch.trim().toLowerCase();
    return libraries.filter((lib) => {
      const meta = readLibraryMeta(lib.metadata);
      const haystack = [lib.title, lib.domain, lib.description, meta.tag, lib.libraryKey]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (kw && !haystack.includes(kw)) {
        return false;
      }
      const selected = selectedLibraryKeys.includes(lib.libraryKey);
      if (libFilter === 'selected' && !selected) {
        return false;
      }
      if (libFilter === 'unselected' && selected) {
        return false;
      }
      return true;
    });
  }, [libraries, libSearch, libFilter, selectedLibraryKeys, domain]);

  const librariesByDomain = useMemo(() => {
    const groups = new Map<string, typeof libraries>();
    for (const lib of filteredLibraries) {
      const list = groups.get(lib.domain) || [];
      list.push(lib);
      groups.set(lib.domain, list);
    }
    return groups;
  }, [filteredLibraries]);

  const resetForm = useCallback(() => {
    setStep(1);
    setName('');
    setDomain(COMPLIANCE_DOMAINS[0]);
    setScope('');
    setDescription('');
    setAssessScenario('launch');
    setCreationMode('manual');
    setSelectedLibraryKeys([]);
    setImportTaskId('');
    setLibSearch('');
    setLibFilter('all');
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    if (template) {
      setStep(1);
      setName(isFork ? `${template.name} 副本` : template.name);
      setDomain(template.domain);
      setScope(template.scope);
      setDescription(template.description || '');
      setCreationMode(template.creationMode);
      setSelectedLibraryKeys(readTemplateLibraryKeys(template));
      setAssessScenario(mapTemplateScenarioToWizard(template.assessScenario || 'launch'));
      return;
    }
    resetForm();
  }, [open, template, resetForm, isFork]);

  useEffect(() => {
    if (!open || libraries.length === 0) {
      return;
    }
    setSelectedLibraryKeys((current) => {
      const resolved = resolveLibraryKeysFromCatalog(libraries, current);
      return resolved.length ? resolved : current;
    });
  }, [open, libraries]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const libraryKeysForSave = resolveLibraryKeysFromCatalog(libraries, selectedLibraryKeys);
      if (!libraryKeysForSave.length) {
        throw new Error('未找到有效的合规控制库，请返回「控制库」步骤重新选择');
      }
      const payload = {
        name: name.trim(),
        domain,
        scope: scope.trim(),
        description: description.trim() || null,
        libraryKeys: libraryKeysForSave,
        sampleTypes: [...DEFAULT_SAMPLE_TYPES],
        assessScenario: mapWizardScenarioToTemplate(assessScenario),
        creationMode,
      };
      if (isEdit && template) {
        return detectionScanningApi.updateComplianceTaskTemplate(template.id, payload);
      }
      return detectionScanningApi.createComplianceTaskTemplate(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-task-templates'] });
      toast.success(isEdit ? '模版已更新' : isFork ? '已基于预置模版创建副本' : '模版已创建');
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || '保存失败'),
  });

  const handleImportFromTask = async (taskId: string) => {
    setImportTaskId(taskId);
    try {
      const task = await detectionScanningApi.getTask(taskId);
      setName(`${task.name} 模版`);
      setDomain(readTaskDomain(task));
      setScope(readTaskDescription(task) || task.name);
      setDescription(readTaskDescription(task));
      const metadata = task.metadata ?? {};
      if (metadata.creationMode === 'ai' || metadata.creationMode === 'manual') {
        setCreationMode(metadata.creationMode);
      }
      if (
        metadata.assessScenario === 'launch' ||
        metadata.assessScenario === 'regression' ||
        metadata.assessScenario === 'patrol' ||
        metadata.assessScenario === 'periodic' ||
        metadata.assessScenario === 'change'
      ) {
        setAssessScenario(mapTemplateScenarioToWizard(String(metadata.assessScenario)));
      }
      const libIds = task.plans?.flatMap((plan) => plan.libIds ?? []) ?? [];
      const keys = libIds
        .map((id) => libraries.find((lib) => lib.id === id)?.libraryKey)
        .filter((key): key is string => Boolean(key));
      if (keys.length) {
        setSelectedLibraryKeys([...new Set(keys)]);
      }
      toast.success('已从已完成任务导入配置');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败');
    }
  };

  const toggleLibraryKey = (libraryKey: string, checked: boolean) => {
    setSelectedLibraryKeys((current) =>
      checked
        ? [...new Set([...current, libraryKey])]
        : current.filter((key) => key !== libraryKey),
    );
  };

  const canProceedStep1 = name.trim().length > 0 && domain;
  const canProceedStep3 = resolveLibraryKeysFromCatalog(libraries, selectedLibraryKeys).length > 0;

  const handleNext = () => {
    if (step === 1) {
      if (!canProceedStep1) {
        toast.error('请填写模版名称并选择合规域');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!canProceedStep3) {
        toast.error('请至少选择一个合规控制库');
        return;
      }
      setStep(4);
      return;
    }
    if (step === 4) {
      if (!canProceedStep3) {
        toast.error('未找到有效的合规控制库，请返回「控制库」步骤重新选择');
        return;
      }
      saveMutation.mutate();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((current) => current - 1);
    }
  };

  const renderStepContent = () => {
    if (step === 1) {
      return (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[20px] border bg-white p-5 shadow-sm">
            <WizardSectionHead
              title="模版基础信息"
              hint="配置后可一键创建任务"
              description="定义模版名称、合规域与评估范围，创建合规任务时将自动预填向导配置。"
            />
            <div className="space-y-4">
              {isFork ? (
                <WizardNotice variant="amber">
                  正在基于平台预置模版创建副本，保存后将生成可自由编辑的自定义模版。
                </WizardNotice>
              ) : null}
              {!isEdit && !isFork ? (
                <div className="space-y-2">
                  <Label className="text-[13px] font-extrabold">从已完成任务导入（可选）</Label>
                  <Select value={importTaskId} onValueChange={handleImportFromTask}>
                    <SelectTrigger className="h-11 rounded-[14px]">
                      <SelectValue placeholder="选择已完成合规任务" />
                    </SelectTrigger>
                    <SelectContent>
                      {(completedTasksQuery.data?.data ?? []).map((task) => (
                        <SelectItem key={task.id} value={task.id}>
                          {task.name} · {readTaskDomain(task)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label className="text-[13px] font-extrabold">模版名称</Label>
                <Input
                  className="h-11 rounded-[14px]"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：金融合规季度抽检"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[13px] font-extrabold">合规域</Label>
                  <Select value={domain} onValueChange={setDomain}>
                    <SelectTrigger className="h-11 rounded-[14px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPLIANCE_DOMAINS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-extrabold">评估场景</Label>
                  <Select
                    value={assessScenario}
                    onValueChange={(value) => setAssessScenario(value as AssessScenario)}
                  >
                    <SelectTrigger className="h-11 rounded-[14px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSESS_SCENARIOS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-extrabold">评估范围</Label>
                <Input
                  className="h-11 rounded-[14px]"
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                  placeholder="适当性 + 客户信息 + 收益承诺"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-extrabold">描述</Label>
                <Textarea
                  className="min-h-[88px] rounded-[14px]"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="适用场景与法规说明"
                />
              </div>
              <WizardNotice variant="gray">
                <strong>推荐流程：</strong> 基础配置 → 创建方式 → 选择控制库 → 确认保存。
              </WizardNotice>
            </div>
          </section>
          <section className="rounded-[20px] border bg-white p-5 shadow-sm">
            <WizardSectionHead title="模版创建逻辑" />
            <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
              合规任务模版面向合规与安全人员：预置评估域、控制库与创建方式，支持从任务列表一键发起 6
              步合规评估向导。
            </p>
            <WizardNotice variant="gray" className="mb-4">
              <strong>正确关系：</strong>
              <br />
              保存模版 → 任务列表选用模版 → 选择 Agent → 合规预检 → 确认执行。
            </WizardNotice>
            <div className="grid grid-cols-2 gap-2.5">
              <WizardStatCard
                value={`${COMPLIANCE_DOMAINS.length} 类`}
                label="合规域"
                hint="金融、个人信息等"
              />
              <WizardStatCard value={`${libraries.length}+`} label="控制库" hint="法规与用例库" />
              <WizardStatCard value="2 种" label="创建方式" hint="AI 推荐 / 手动选库" />
              <WizardStatCard value="4 步" label="模版向导" hint="与任务创建风格一致" />
            </div>
          </section>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="rounded-[20px] border bg-white p-5 shadow-sm">
          <WizardSectionHead
            title="创建方式"
            description="选择模版默认使用的任务创建方式，创建合规任务时将预填向导中的 AI / 手动模式。"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <WizardModeCard
              title="AI 模式"
              description="由 AI 根据 Agent 画像、业务场景与法规映射自动推荐合规库与控制项。"
              selected={creationMode === 'ai'}
              onClick={() => setCreationMode('ai')}
              tags={[
                { label: '推荐合规库', tone: 'blue' },
                { label: '自动选用例', tone: 'green' },
                { label: '动态估算', tone: 'orange' },
              ]}
            />
            <WizardModeCard
              title="手动模式"
              description="由合规人员按分类手动选择合规库，适合专项评估与自定义范围。"
              selected={creationMode === 'manual'}
              onClick={() => setCreationMode('manual')}
              tags={[
                { label: '人工选库', tone: 'gray' },
                { label: '自定义范围', tone: 'purple' },
                { label: '实时筛选', tone: 'blue' },
              ]}
            />
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="rounded-[20px] border bg-white p-5 shadow-sm">
          <WizardSectionHead
            title="选择合规控制库"
            hint={`已选 ${selectedLibraryKeys.length} 个 · ${totalCaseCount} 条用例`}
            description="按合规域分类勾选控制库，模版将预填任务计划中的合规库选择。"
          />
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
            <Input
              className="h-11 rounded-[14px]"
              placeholder="搜索法规、控制库、标签…"
              value={libSearch}
              onChange={(event) => setLibSearch(event.target.value)}
            />
            <Select
              value={libFilter}
              onValueChange={(value) => setLibFilter(value as typeof libFilter)}
            >
              <SelectTrigger className="h-11 rounded-[14px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部库</SelectItem>
                <SelectItem value="selected">已选</SelectItem>
                <SelectItem value="unselected">未选</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-[360px] space-y-4 overflow-y-auto pr-1">
            {Array.from(librariesByDomain.entries()).map(([groupDomain, domainLibs]) => (
              <div key={groupDomain}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-black">{groupDomain}</span>
                  <span className="text-xs font-bold text-muted-foreground">
                    {domainLibs.length} 个合规库可选
                  </span>
                </div>
                <div className="grid gap-2">
                  {domainLibs.map((lib) => {
                    const meta = readLibraryMeta(lib.metadata);
                    const recommended = lib.domain === domain;
                    return (
                      <WizardCheckboxCard
                        key={lib.id}
                        checked={selectedLibraryKeys.includes(lib.libraryKey)}
                        onCheckedChange={(checked) => toggleLibraryKey(lib.libraryKey, checked)}
                        title={lib.title}
                        description={`${lib.caseCount} 条用例 · ${meta.tag || lib.domain} · ${lib.detectMethod}`}
                        recommended={recommended}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredLibraries.length ? null : (
              <WizardNotice variant="gray">无匹配合规库，请调整搜索条件。</WizardNotice>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[20px] border bg-white p-5 shadow-sm">
          <WizardSectionHead
            title="确认模版配置"
            description="确认模版信息无误后保存，可在合规任务列表的「合规任务模版」Tab 中一键使用。"
          />
          <div className="overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-black text-muted-foreground">项目</th>
                  <th className="px-3 py-2 text-left font-black text-muted-foreground">配置</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">模版名称</td>
                  <td className="px-3 py-2">{name.trim()}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">合规域</td>
                  <td className="px-3 py-2">{domain}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">评估场景</td>
                  <td className="px-3 py-2">{scenarioLabel}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">创建方式</td>
                  <td className="px-3 py-2">{creationMode === 'ai' ? 'AI 模式' : '手动模式'}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">合规库</td>
                  <td className="px-3 py-2">{selectedLibraryKeys.length} 个</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">检测用例</td>
                  <td className="px-3 py-2">{totalCaseCount} 条</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-[20px] border bg-white p-5 shadow-sm">
          <WizardSectionHead title="已选控制库" />
          {selectedLibraries.length ? (
            <div className="space-y-2">
              {selectedLibraries.map((lib) => (
                <div key={lib.id} className="rounded-xl border bg-muted/20 px-3 py-2 text-sm">
                  <div className="font-bold">{lib.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {lib.libraryKey} · {lib.caseCount} 条用例
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <WizardNotice variant="gray">尚未选择合规控制库</WizardNotice>
          )}
          <WizardNotice variant="green" className="mt-4">
            模版可保存：合规域与控制库已确定，可用于一键创建合规评估任务。
          </WizardNotice>
        </div>
      </div>
    );
  };

  const dialogTitle = isEdit
    ? '编辑合规任务模版'
    : isFork
      ? '基于预置模版创建副本'
      : '新建合规任务模版';
  const nextLabel =
    step === 4
      ? isEdit
        ? '保存修改'
        : isFork
          ? '保存副本'
          : '创建模版'
      : TEMPLATE_NEXT_LABELS[step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[1040px]"
      >
        <header className="flex shrink-0 items-start justify-between border-b px-8 pb-5 pt-7">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{dialogTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {isFork
                ? '平台预置模版不可直接修改，保存后将创建可编辑的自定义副本。'
                : '配置评估域、控制库与样本类型，保存后可一键用于创建合规评估任务。'}
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-lg text-muted-foreground"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <TemplateWizardStepper currentStep={step} />
          <div className="min-h-[360px]">{renderStepContent()}</div>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t bg-[#fafafa] px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            {TEMPLATE_FOOTER_NOTES[step]}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="h-[42px] min-w-[104px] rounded-[13px] font-black"
                onClick={handleBack}
                disabled={saveMutation.isPending}
              >
                上一步
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-[42px] min-w-[104px] rounded-[13px] font-black"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
            )}
            <Button
              type="button"
              className={cn(
                'h-[42px] min-w-[104px] rounded-[13px] font-black',
                step === 4 &&
                  'bg-gradient-to-r from-[#2f6bff] to-[#5b8cff] hover:from-[#2563eb] hover:to-[#4a7cff]',
              )}
              disabled={
                saveMutation.isPending ||
                (step === 1 && !canProceedStep1) ||
                (step === 3 && !canProceedStep3) ||
                (step === 4 && !canProceedStep3)
              }
              onClick={handleNext}
            >
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {nextLabel}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
