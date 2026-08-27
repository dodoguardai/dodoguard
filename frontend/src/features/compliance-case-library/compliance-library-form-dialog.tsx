import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, FileText, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { assetIntakeApi } from '@/services/api/asset-intake'
import { detectionScanningApi } from '@/services/api/detection-scanning'
import type { SecurityCaseLibrary } from '@/types/entities'
import {
  COMPLIANCE_BASIS_PRESETS,
  COMPLIANCE_LAW_CATALOG,
} from './compliance-law-catalog'
import {
  COMPLIANCE_CONTROL_TYPES,
  COMPLIANCE_DETECT_METHODS,
  COMPLIANCE_SCOPE_PRESETS,
  COMPLIANCE_SOURCE_TAGS,
  COMPLIANCE_STANDARDS_PRESETS,
  LEGACY_DETECT_METHOD_MAP,
  mapLibrary,
  type RiskLevel,
} from './shared'

export type LibraryFormValues = {
  title: string
  domain: string
  description: string
  detectMethod: string
  defaultLevel: RiskLevel
  enabled: boolean
  standards: string
  icon: string
  tag: string
  basis: string
  scope: string
  category: string
  lawPdfName: string
  lawPdfSize?: number
}

export const emptyLibraryForm: LibraryFormValues = {
  title: '',
  domain: '通用合规',
  description: '',
  detectMethod: '对话探测',
  defaultLevel: 'medium',
  enabled: true,
  standards: 'PIPL',
  icon: '📋',
  tag: '',
  basis: '',
  scope: '全部 Agent',
  category: '',
  lawPdfName: '',
}

const SEED_SCOPE_PRESETS = ['生产 Agent', '金融 Agent', '政务 Agent', '涉个人信息 Agent'] as const

function normalizeDetectMethod(value: string): string {
  return LEGACY_DETECT_METHOD_MAP[value] || value
}

function libraryToForm(lib: SecurityCaseLibrary): LibraryFormValues {
  const mapped = mapLibrary(lib)
  return {
    title: lib.title,
    domain: lib.domain,
    description: lib.description,
    detectMethod: normalizeDetectMethod(lib.detectMethod) || '对话探测',
    defaultLevel: lib.defaultLevel,
    enabled: lib.enabled,
    standards: (lib.standards || []).join(', '),
    icon: mapped.meta.icon || '📋',
    tag: mapped.meta.tag || '',
    basis: mapped.meta.basis || '',
    scope: mapped.meta.scope || '全部 Agent',
    category: mapped.meta.category || '',
    lawPdfName: mapped.meta.lawPdf?.name || '',
    lawPdfSize: mapped.meta.lawPdf?.size,
  }
}

export function buildLibraryPayload(form: LibraryFormValues) {
  const standards = form.standards
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const metadata: Record<string, unknown> = {
    libraryCategory: 'compliance',
    icon: form.icon.trim() || undefined,
    tag: form.tag.trim() || undefined,
    basis: form.basis.trim() || undefined,
    scope: form.scope.trim() || undefined,
    category: form.category.trim() || undefined,
  }
  if (form.lawPdfName.trim()) {
    metadata.lawPdf = {
      name: form.lawPdfName.trim(),
      size: form.lawPdfSize,
    }
  }
  return {
    title: form.title.trim(),
    domain: form.domain.trim(),
    description: form.description.trim(),
    detectMethod: form.detectMethod.trim(),
    defaultLevel: form.defaultLevel,
    enabled: form.enabled,
    standards,
    metadata,
  }
}

const CUSTOM_SELECT_VALUE = '__custom__'

function parseBasisValues(value: string): string[] {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatMappingBasisOption(mapping: { law?: string; article?: string; sourceText?: string | null }) {
  const clause = [mapping.law, mapping.article].filter(Boolean).join(' ').trim()
  const sourceText = mapping.sourceText?.trim()
  if (clause && sourceText) return `${clause} · ${sourceText}`
  return clause || sourceText || ''
}

function resolveSelectValue(value: string, options: readonly string[]) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return options.includes(trimmed) ? trimmed : CUSTOM_SELECT_VALUE
}

function OptionSelectField({
  label,
  required,
  value,
  options,
  onChange,
  placeholder = '请选择',
  loadingHint,
}: {
  label: string
  required?: boolean
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  placeholder?: string
  loadingHint?: string
}) {
  const selectValue = resolveSelectValue(value, options)
  const showCustomInput = selectValue === CUSTOM_SELECT_VALUE

  return (
    <section className="grid gap-2.5">
      <FieldLabel required={required}>{label}</FieldLabel>
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (next === CUSTOM_SELECT_VALUE) {
            onChange('')
            return
          }
          onChange(next)
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {options.map((item) => (
            <SelectItem key={item} value={item}>
              <span className="line-clamp-2">{item}</span>
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
      {loadingHint ? <p className="text-xs text-muted-foreground">{loadingHint}</p> : null}
    </section>
  )
}

function ChipOption({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-primary shadow-sm'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/50 hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="text-sm font-medium">
      {children}
      {required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </Label>
  )
}

type ComplianceLibraryFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialLibrary?: SecurityCaseLibrary | null
  domainOptions: string[]
  defaultDomain?: string
  onRequestNewDomain?: () => void
  onSubmit: (form: LibraryFormValues) => void
  pending?: boolean
}

export function ComplianceLibraryFormDialog({
  open,
  onOpenChange,
  mode,
  initialLibrary,
  domainOptions,
  defaultDomain,
  onRequestNewDomain,
  onSubmit,
  pending,
}: ComplianceLibraryFormDialogProps) {
  const [form, setForm] = useState<LibraryFormValues>(emptyLibraryForm)
  const [customTag, setCustomTag] = useState('')
  const [useCustomTag, setUseCustomTag] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(mode === 'edit')

  const categoryOptions = COMPLIANCE_CONTROL_TYPES as readonly string[]
  const tagOptions = COMPLIANCE_SOURCE_TAGS as readonly string[]
  const detectMethodOptions = COMPLIANCE_DETECT_METHODS as readonly string[]
  const standardsOptions = COMPLIANCE_STANDARDS_PRESETS as readonly string[]

  const mappingsQuery = useQuery({
    queryKey: ['compliance-form-mapping-laws', 'all'],
    queryFn: async () => {
      const pageSize = 100
      const firstPage = await detectionScanningApi.listComplianceMappings({ limit: pageSize })
      const allRows = [...firstPage.data]
      let offset = pageSize
      let hasMore = firstPage.hasMore
      while (hasMore) {
        const page = await detectionScanningApi.listComplianceMappings({
          limit: pageSize,
          offset,
        })
        allRows.push(...page.data)
        offset += pageSize
        hasMore = page.hasMore
      }
      return {
        ...firstPage,
        data: allRows,
        limit: allRows.length,
        offset: 0,
        hasMore: false,
      }
    },
    enabled: open,
  })

  const agentsQuery = useQuery({
    queryKey: ['compliance-form-agent-scopes'],
    queryFn: () => assetIntakeApi.listAgents({ limit: 100 }),
    enabled: open,
  })

  const basisOptions = useMemo(() => {
    const options = new Set<string>(COMPLIANCE_BASIS_PRESETS)
    for (const entry of COMPLIANCE_LAW_CATALOG) {
      options.add(entry.law)
    }
    for (const mapping of mappingsQuery.data?.data || []) {
      const option = formatMappingBasisOption(mapping)
      if (option) options.add(option)
    }
    for (const item of parseBasisValues(form.basis)) {
      options.add(item)
    }
    return Array.from(options)
  }, [form.basis, mappingsQuery.data])
  const basisMultiOptions = useMemo<MultiSelectOption[]>(
    () => basisOptions.map((item) => ({ value: item, label: item })),
    [basisOptions],
  )

  const scopeOptions = useMemo(() => {
    const options = new Set<string>([...COMPLIANCE_SCOPE_PRESETS, ...SEED_SCOPE_PRESETS])
    for (const agent of agentsQuery.data?.data || []) {
      if (agent.sensitiveData) options.add('涉敏 Agent')
      if (agent.exposureLevel === 'external' || agent.exposureLevel === 'public') {
        options.add('对外 Agent')
      }
      if (agent.environment?.trim()) {
        options.add(`${agent.environment.trim()} Agent`)
      }
      const department = agent.owners?.find((owner) => owner.department)?.department?.trim()
      if (department) options.add(`${department} Agent`)
      if (agent.businessSystem?.trim()) options.add(agent.businessSystem.trim())
    }
    return Array.from(options)
  }, [agentsQuery.data])

  useEffect(() => {
    if (!open) return
    if (initialLibrary) {
      const next = libraryToForm(initialLibrary)
      const customT = next.tag && !tagOptions.includes(next.tag) ? next.tag : ''
      setForm(next)
      setCustomTag(customT)
      setUseCustomTag(Boolean(customT))
      setShowAdvanced(true)
      return
    }
    setForm({
      ...emptyLibraryForm,
      domain: defaultDomain && defaultDomain !== 'all' ? defaultDomain : emptyLibraryForm.domain,
    })
    setCustomTag('')
    setUseCustomTag(false)
    setShowAdvanced(false)
  }, [open, initialLibrary, defaultDomain, tagOptions])

  function selectTag(value: string) {
    if (value === '__custom__') {
      setUseCustomTag(true)
      setForm((prev) => ({ ...prev, tag: customTag.trim() }))
      return
    }
    setUseCustomTag(false)
    setCustomTag('')
    setForm((prev) => ({ ...prev, tag: value }))
  }

  function handlePdfSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setForm((prev) => ({
      ...prev,
      lawPdfName: file.name,
      lawPdfSize: file.size,
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px]">
        <DialogHeader className="space-y-1 border-b px-6 py-5">
          <DialogTitle className="text-lg">
            {mode === 'create' ? '新建合规库' : '编辑合规库'}
          </DialogTitle>
          <DialogDescription>
            {form.domain} · 合规库含法规条文、验证规则与 CMP 用例 · 可选已有类别或新建类别
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            const category = form.category.trim()
            const tag = useCustomTag ? customTag.trim() : form.tag.trim()
            const basis = form.basis.trim()
            const scope = form.scope.trim()
            const detectMethod = form.detectMethod.trim()
            if (!form.title.trim() || !form.domain.trim() || !category) {
              toast.error('请填写合规库名称、所属类别和合规类型')
              return
            }
            if (!basis) {
              toast.error('请选择检测依据')
              return
            }
            onSubmit({
              ...form,
              category,
              tag,
              basis,
              scope,
              detectMethod,
              description:
                form.description.trim() ||
                `${category}相关合规控制项 · ${form.domain}`,
            })
          }}
        >
          <div className="grid gap-5 overflow-y-auto px-6 py-5">
            <section className="grid gap-2.5">
              <FieldLabel required>所属类别</FieldLabel>
              <div className="flex gap-2">
                <Select
                  value={form.domain || undefined}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, domain: value }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="选择所属类别" />
                  </SelectTrigger>
                  <SelectContent>
                    {domainOptions.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {onRequestNewDomain ? (
                  <Button type="button" variant="outline" size="sm" onClick={onRequestNewDomain}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    新建类别
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="grid gap-2.5">
              <FieldLabel required>合规库名称</FieldLabel>
              <Input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="例如 《个人信息保护法》敏感信息保护"
              />
            </section>

            <OptionSelectField
              label="合规类型"
              required
              value={form.category}
              options={categoryOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
              placeholder="选择合规类型"
            />

            <section className="grid gap-2.5">
              <FieldLabel>来源标签</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((item) => (
                  <ChipOption
                    key={item}
                    selected={form.tag === item && !useCustomTag}
                    onClick={() => selectTag(item)}
                  >
                    {item}
                  </ChipOption>
                ))}
                <ChipOption selected={useCustomTag} onClick={() => selectTag('__custom__')}>
                  自定义…
                </ChipOption>
              </div>
              {useCustomTag ? (
                <Input
                  value={customTag}
                  onChange={(event) => {
                    setCustomTag(event.target.value)
                    setForm((prev) => ({ ...prev, tag: event.target.value }))
                  }}
                  placeholder="例如 等保2.0、银保监会"
                  className="max-w-sm"
                />
              ) : null}
            </section>

            <section className="grid gap-2.5">
              <FieldLabel required>检测依据</FieldLabel>
              <MultiSelect
                options={basisMultiOptions}
                selectedValues={parseBasisValues(form.basis)}
                onChange={(values) =>
                  setForm((prev) => ({ ...prev, basis: values.join('\n') }))
                }
                placeholder="选择法规检测依据"
                loading={mappingsQuery.isLoading}
                emptyText="暂无法规检测依据，请先在法规映射中维护条款"
              />
            </section>

            <OptionSelectField
              label="检测方式"
              value={form.detectMethod}
              options={detectMethodOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, detectMethod: value }))}
              placeholder="选择检测方式"
            />

            <OptionSelectField
              label="适用范围"
              value={form.scope}
              options={scopeOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, scope: value }))}
              placeholder="选择适用范围"
              loadingHint={
                agentsQuery.isLoading ? '正在从已纳管资产加载适用范围…' : undefined
              }
            />

            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
                  <ChevronDown
                    className={cn('mr-1.5 h-4 w-4 transition-transform', showAdvanced && 'rotate-180')}
                  />
                  更多设置
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-4 pt-3">
                <div className="grid gap-2">
                  <FieldLabel>描述</FieldLabel>
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="合规库说明，留空将根据合规类型自动生成"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <FieldLabel>图标</FieldLabel>
                    <Input
                      value={form.icon}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, icon: event.target.value }))
                      }
                      placeholder="emoji"
                    />
                  </div>
                  <OptionSelectField
                    label="适用标准"
                    value={form.standards}
                    options={standardsOptions}
                    onChange={(value) => setForm((prev) => ({ ...prev, standards: value }))}
                    placeholder="选择适用标准"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <FieldLabel>默认风险等级</FieldLabel>
                    <Select
                      value={form.defaultLevel}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, defaultLevel: value as RiskLevel }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical">严重</SelectItem>
                        <SelectItem value="high">高危</SelectItem>
                        <SelectItem value="medium">中危</SelectItem>
                        <SelectItem value="low">低危</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel>启用</FieldLabel>
                    <Select
                      value={form.enabled ? 'yes' : 'no'}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, enabled: value === 'yes' }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">已启用</SelectItem>
                        <SelectItem value="no">未启用</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <FieldLabel>法规 PDF 原文</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={handlePdfSelect}
                      className="max-w-xs border-0 shadow-none file:mr-3"
                    />
                    {form.lawPdfName ? (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        {form.lawPdfName}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">仅保存文件名与大小</span>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '保存中' : mode === 'create' ? '创建合规库' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
