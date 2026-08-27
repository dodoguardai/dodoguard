import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import type { MappedTechnicalLibrary, TechnicalRiskLevel } from './shared';
import { normalizeTechnicalRiskLevel, TECHNICAL_RISK_LEVEL_OPTIONS } from './shared';
import {
  TECHNICAL_BASIS_PRESETS,
  TECHNICAL_DETECT_MODES,
  TECHNICAL_LIBRARY_ICONS,
  TECHNICAL_SCOPE_PRESETS,
  TECHNICAL_SOURCE_TAG_DESCRIPTIONS,
  TECHNICAL_SOURCE_TAGS,
} from './technical-case-library-presets';
import { tabLabelForDomain } from './technical-case-domains';

const CUSTOM_SELECT_VALUE = '__custom__';

export type LibraryFormState = {
  title: string;
  category: string;
  tag: string;
  icon: string;
  defaultLevel: TechnicalRiskLevel;
  detectMethod: string;
  scope: string;
  description: string;
  basis: string;
  domain: string;
  enabled: boolean;
};

export type TechnicalDomainOption = {
  value: string;
  label: string;
};

export function defaultLibraryForm(domain = '系统指令泄露与绕过风险'): LibraryFormState {
  return {
    title: '',
    category: domain,
    tag: 'OWASP ASI',
    icon: '⚠',
    defaultLevel: 'high',
    detectMethod: '对话探测',
    scope: '全部 Agent',
    description: '',
    basis: '',
    domain,
    enabled: false,
  };
}

export function libraryFormFromMapped(lib: MappedTechnicalLibrary): LibraryFormState {
  return {
    title: lib.title,
    category: lib.category || lib.domain,
    tag: lib.tag || 'OWASP ASI',
    icon: lib.icon || '⚠',
    defaultLevel: normalizeTechnicalRiskLevel(lib.level),
    detectMethod: lib.method || '对话探测',
    scope: lib.scope || '全部 Agent',
    description: lib.description,
    basis: lib.basis || lib.standards.join(', '),
    domain: lib.domain,
    enabled: lib.enabled,
  };
}

export function buildTechnicalLibraryPayload(form: LibraryFormState) {
  const domain = form.domain;
  const standards = form.tag.trim() ? [form.tag.trim()] : [];
  return {
    title: form.title.trim(),
    domain: domain.trim(),
    description: form.description.trim(),
    detectMethod: form.detectMethod.trim(),
    defaultLevel: form.defaultLevel,
    enabled: form.enabled,
    standards,
    metadata: {
      libraryCategory: 'technical',
      icon: form.icon.trim() || '⚠',
      tag: form.tag.trim() || undefined,
      category: form.domain.trim() || undefined,
      basis: form.basis.trim() || undefined,
      scope: form.scope.trim() || undefined,
    },
  };
}

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <Label className="text-xs font-semibold">
      {children}
      {required ? <span className="text-destructive"> *</span> : null}
    </Label>
  );
}

function OptionSelectField({
  label,
  required,
  value,
  options,
  optionDescriptions,
  onChange,
  placeholder = '请选择',
}: {
  label: string;
  required?: boolean;
  value: string;
  options: readonly string[];
  optionDescriptions?: Partial<Record<string, string>>;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const trimmed = value.trim();
  const selectValue = !trimmed
    ? undefined
    : options.includes(trimmed)
      ? trimmed
      : CUSTOM_SELECT_VALUE;
  const showCustomInput = selectValue === CUSTOM_SELECT_VALUE;

  return (
    <div className="grid gap-2">
      <FieldLabel required={required}>{label}</FieldLabel>
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (next === CUSTOM_SELECT_VALUE) {
            onChange('');
            return;
          }
          onChange(next);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {options.map((item) => (
            <SelectItem key={item} value={item} textValue={item}>
              {optionDescriptions?.[item] ? (
                <span className="grid gap-0.5 py-1">
                  <span className="font-medium leading-5">{item}</span>
                  <span className="line-clamp-2 text-xs leading-4 text-muted-foreground">
                    {optionDescriptions[item]}
                  </span>
                </span>
              ) : (
                <span className="line-clamp-2">{item}</span>
              )}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_SELECT_VALUE}>自定义…</SelectItem>
        </SelectContent>
      </Select>
      {showCustomInput ? (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`输入自定义${label}`}
        />
      ) : null}
    </div>
  );
}

function DomainSelectField({
  label,
  required,
  value,
  options,
  onChange,
  placeholder = '请选择',
}: {
  label: string;
  required?: boolean;
  value: string;
  options: readonly TechnicalDomainOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const hasValue = options.some((item) => item.value === value);
  const selectOptions = [...options];
  const [customMode, setCustomMode] = useState(false);
  const trimmed = value.trim();

  useEffect(() => {
    if (trimmed && !hasValue) {
      setCustomMode(true);
      return;
    }
    if (hasValue) {
      setCustomMode(false);
    }
  }, [hasValue, trimmed]);

  const selectValue = customMode ? CUSTOM_SELECT_VALUE : value || undefined;

  return (
    <div className="grid gap-2">
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className={customMode ? 'grid gap-2 md:grid-cols-2' : 'grid gap-2'}>
        <Select
          value={selectValue}
          onValueChange={(next) => {
            if (next === CUSTOM_SELECT_VALUE) {
              setCustomMode(true);
              if (hasValue) {
                onChange('');
              }
              return;
            }
            setCustomMode(false);
            onChange(next);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {selectOptions.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                <span className="line-clamp-2">{item.label}</span>
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_SELECT_VALUE}>自定义…</SelectItem>
          </SelectContent>
        </Select>
        {customMode ? (
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="输入自定义所属类别"
          />
        ) : null}
      </div>
    </div>
  );
}

type TechnicalCaseLibraryFormDialogProps = {
  open: boolean;
  editing?: MappedTechnicalLibrary | null;
  defaultDomain?: string;
  domainOptions?: TechnicalDomainOption[];
  modalSubtitle?: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: LibraryFormState) => void;
};

export function TechnicalCaseLibraryFormDialog({
  open,
  editing,
  defaultDomain,
  domainOptions = [],
  modalSubtitle,
  pending,
  onOpenChange,
  onSubmit,
}: TechnicalCaseLibraryFormDialogProps) {
  const [form, setForm] = useState<LibraryFormState>(defaultLibraryForm(defaultDomain));
  const [basisPreset, setBasisPreset] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm(libraryFormFromMapped(editing));
      setBasisPreset('');
      return;
    }
    setForm(defaultLibraryForm(defaultDomain));
    setBasisPreset('');
  }, [open, editing, defaultDomain]);

  const subtitle =
    modalSubtitle ||
    (editing
      ? '修改场景库配置 · 检测样本请在详情页维护'
      : '添加一类技术安全风险场景库 · 可配置检测依据 · 创建后补充攻击样本');
  const normalizedDomainOptions = useMemo(
    () => {
      if (domainOptions.length > 0) {
        return domainOptions;
      }
      const fallbackDomain = defaultDomain || '系统指令泄露与绕过风险';
      return [
        {
          value: fallbackDomain,
          label: tabLabelForDomain(fallbackDomain, []),
        },
      ];
    },
    [defaultDomain, domainOptions],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(100vw-2rem,820px)] max-w-[min(100vw-2rem,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px]">
        <DialogHeader className="space-y-1 border-b px-6 py-5 text-left">
          <DialogTitle>{editing ? '编辑场景库' : '新建场景库'}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!form.title.trim()) {
              toast.error('请填写风险库名称');
              return;
            }
            if (!form.domain.trim()) {
              toast.error('请选择所属类别');
              return;
            }
            if (!form.description.trim()) {
              toast.error('请填写功能描述');
              return;
            }
            if (!form.basis.trim()) {
              toast.error('请填写检测依据');
              return;
            }
            onSubmit({
              ...form,
              category: form.domain,
            });
          }}
        >
          <div className="grid gap-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <FieldLabel required>风险库名称</FieldLabel>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="如：权限越权检测"
                />
              </div>
              <DomainSelectField
                label="所属类别"
                required
                value={form.domain}
                options={normalizedDomainOptions}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, domain: value, category: value }))
                }
                placeholder="选择所属类别"
              />
              <OptionSelectField
                label="来源标签"
                value={form.tag}
                options={TECHNICAL_SOURCE_TAGS}
                optionDescriptions={TECHNICAL_SOURCE_TAG_DESCRIPTIONS}
                onChange={(value) => setForm((prev) => ({ ...prev, tag: value }))}
                placeholder="选择来源标签"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <FieldLabel>图标</FieldLabel>
                <Select
                  value={form.icon}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, icon: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TECHNICAL_LIBRARY_ICONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <FieldLabel>默认风险等级</FieldLabel>
                <Select
                  value={form.defaultLevel}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      defaultLevel: value as TechnicalRiskLevel,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
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
              <OptionSelectField
                label="检测方式"
                value={form.detectMethod}
                options={TECHNICAL_DETECT_MODES}
                onChange={(value) => setForm((prev) => ({ ...prev, detectMethod: value }))}
                placeholder="选择检测方式"
              />
            </div>

            <OptionSelectField
              label="适用范围"
              value={form.scope}
              options={TECHNICAL_SCOPE_PRESETS}
              onChange={(value) => setForm((prev) => ({ ...prev, scope: value }))}
              placeholder="选择适用范围"
            />

            <div className="grid gap-2">
              <FieldLabel required>功能描述</FieldLabel>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                placeholder="描述该风险库检测的目标、攻击面与适用场景…"
              />
            </div>

            <div className="grid gap-2">
              <FieldLabel required>检测依据</FieldLabel>
              <Select
                value={basisPreset || undefined}
                onValueChange={(value) => {
                  setBasisPreset(value);
                  if (value === CUSTOM_SELECT_VALUE) {
                    setForm((prev) => ({ ...prev, basis: '' }));
                    return;
                  }
                  if (value) {
                    setForm((prev) => ({ ...prev, basis: value }));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— 选择常用依据 —" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {TECHNICAL_BASIS_PRESETS.map((item) => (
                    <SelectItem key={item} value={item}>
                      <span className="line-clamp-2">{item}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_SELECT_VALUE}>自定义…</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                rows={3}
                value={form.basis}
                onChange={(event) => {
                  setBasisPreset('');
                  setForm((prev) => ({ ...prev, basis: event.target.value }));
                }}
                placeholder="填写检测依据：标准条款、攻击类型定义、企业基线要求等"
              />
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '保存中' : editing ? '保存' : '创建场景库'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
