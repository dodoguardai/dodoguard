import type { SampleType } from './shared'
import { useEffect, useState } from 'react'
import { COMPLIANCE_REGULATION_LAWS } from './compliance-law-catalog'
import {
  buildArticleOptionsForLaw,
  type RegClauseArticleOption,
} from './compliance-mapping-utils'
import type { ComplianceRegulationMapping } from '@/types/entities'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type TurnEntry = { role: string; content: string }

export type CaseExtraMetadata = {
  regClause?: string
  turns?: TurnEntry[]
  fileName?: string
  fileContent?: string
  userQuery?: string
}

export function readCaseExtraMetadata(metadata: unknown): CaseExtraMetadata {
  if (!metadata || typeof metadata !== 'object') return {}
  const m = metadata as Record<string, unknown>
  const turns = Array.isArray(m.turns)
    ? m.turns
        .filter((t) => t && typeof t === 'object')
        .map((t) => {
          const row = t as Record<string, unknown>
          return {
            role: typeof row.role === 'string' ? row.role : 'user',
            content: typeof row.content === 'string' ? row.content : '',
          }
        })
    : undefined
  return {
    regClause: typeof m.regClause === 'string' ? m.regClause : undefined,
    turns,
    fileName: typeof m.fileName === 'string' ? m.fileName : undefined,
    fileContent: typeof m.fileContent === 'string' ? m.fileContent : undefined,
    userQuery: typeof m.userQuery === 'string' ? m.userQuery : undefined,
  }
}

export function buildCaseMetadata(
  sampleType: SampleType,
  regClause: string,
  extra: CaseExtraMetadata,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  if (regClause.trim()) metadata.regClause = regClause.trim()
  if (sampleType === 'multi_turn' && extra.turns?.length) {
    metadata.turns = extra.turns
  }
  if (sampleType === 'file_input' || sampleType === 'file_output') {
    if (extra.fileName) metadata.fileName = extra.fileName
    if (extra.fileContent) metadata.fileContent = extra.fileContent
    if (extra.userQuery) metadata.userQuery = extra.userQuery
  }
  return metadata
}

type CaseExtraFieldsProps = {
  sampleType: SampleType
  extra: CaseExtraMetadata
  onChange: (extra: CaseExtraMetadata) => void
}

export function CaseExtraFields({ sampleType, extra, onChange }: CaseExtraFieldsProps) {
  if (sampleType === 'multi_turn') {
    const turns = extra.turns?.length ? extra.turns : [{ role: 'user', content: '' }]
    return (
      <div className="grid gap-2">
        <p className="text-sm font-medium">多轮对话</p>
        {turns.map((turn, index) => (
          <div key={index} className="grid gap-2 rounded-md border p-3">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={turn.role}
              onChange={(event) => {
                const next = [...turns]
                next[index] = { ...next[index], role: event.target.value }
                onChange({ ...extra, turns: next })
              }}
            >
              <option value="user">用户</option>
              <option value="assistant">Agent</option>
            </select>
            <textarea
              className="min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
              value={turn.content}
              placeholder="对话内容"
              onChange={(event) => {
                const next = [...turns]
                next[index] = { ...next[index], content: event.target.value }
                onChange({ ...extra, turns: next })
              }}
            />
          </div>
        ))}
        <button
          type="button"
          className="text-left text-sm text-primary"
          onClick={() => onChange({ ...extra, turns: [...turns, { role: 'user', content: '' }] })}
        >
          + 添加轮次
        </button>
      </div>
    )
  }

  if (sampleType === 'file_input' || sampleType === 'file_output') {
    return (
      <div className="grid gap-3">
        <div className="grid gap-2">
          <label className="text-sm font-medium">文件名</label>
          <input
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={extra.fileName || ''}
            onChange={(event) => onChange({ ...extra, fileName: event.target.value })}
            placeholder="例如 customer_list.csv"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium">文件内容 / 场景描述</label>
          <textarea
            className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
            value={extra.fileContent || ''}
            onChange={(event) => onChange({ ...extra, fileContent: event.target.value })}
          />
        </div>
        {sampleType === 'file_input' ? (
          <div className="grid gap-2">
            <label className="text-sm font-medium">用户指令</label>
            <textarea
              className="min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
              value={extra.userQuery || ''}
              onChange={(event) => onChange({ ...extra, userQuery: event.target.value })}
            />
          </div>
        ) : null}
      </div>
    )
  }

  return null
}

export function renderCasePayloadPreview(
  sampleType: SampleType,
  prompt: string,
  extra: CaseExtraMetadata,
): string {
  if (sampleType === 'multi_turn' && extra.turns?.length) {
    return extra.turns.map((t) => `${t.role}: ${t.content}`).join(' | ')
  }
  if (sampleType === 'file_input' || sampleType === 'file_output') {
    return extra.fileName ? `[${extra.fileName}] ${extra.userQuery || prompt}` : prompt
  }
  return prompt
}

const REG_LAW_CUSTOM = '__custom__'
const REG_ARTICLE_CUSTOM = '__custom_article__'

export function parseRegClause(
  regClause: string,
  laws: readonly string[],
): { law: string; article: string } {
  const trimmed = regClause.trim()
  if (!trimmed) return { law: '', article: '' }
  const sorted = [...laws].sort((a, b) => b.length - a.length)
  for (const law of sorted) {
    if (trimmed.startsWith(law)) {
      return { law, article: trimmed.slice(law.length).trim() }
    }
  }
  if (trimmed.startsWith('GB/T 22239-2019')) {
    const gbLaw = laws.find((law) => law.startsWith('GB/T 22239-2019'))
    if (gbLaw) {
      return { law: gbLaw, article: trimmed.replace(/^GB\/T 22239-2019\s*/, '').trim() }
    }
  }
  for (const law of sorted) {
    if (trimmed.includes(law)) {
      const idx = trimmed.indexOf(law)
      const before = trimmed.slice(0, idx).trim()
      const after = trimmed.slice(idx + law.length).trim()
      return { law, article: [before, after].filter(Boolean).join(' ') }
    }
  }
  return { law: '', article: trimmed }
}

export function formatRegClause(law: string, article: string): string {
  const lawText = law.trim()
  const articleText = article.trim()
  if (!lawText && !articleText) return ''
  if (!articleText) return lawText
  if (!lawText) return articleText
  return `${lawText} ${articleText}`
}

/** 用例表单「五、法规依据」：法律法规下拉 + 条款条目（对齐原型 cmpSampleModal） */
export function RegClauseSection({
  value,
  onChange,
  laws,
  mappings = [],
}: {
  value: string
  onChange: (value: string) => void
  laws: readonly string[]
  mappings?: ComplianceRegulationMapping[]
}) {
  const parsed = parseRegClause(value, laws)
  const [articleCustomMode, setArticleCustomMode] = useState(false)
  const lawInList = Boolean(parsed.law && laws.includes(parsed.law))
  const useCustomLaw = Boolean(parsed.law === '' && parsed.article)
  const lawSelectValue = lawInList ? parsed.law : useCustomLaw ? REG_LAW_CUSTOM : undefined
  const customLawValue = useCustomLaw ? parsed.article : ''

  const articleOptions: RegClauseArticleOption[] = buildArticleOptionsForLaw(
    mappings,
    parsed.law,
    parsed.article,
  )
  const articleInList = articleOptions.some((item) => item.value === parsed.article)
  const useCustomArticle = Boolean(parsed.article && !articleInList)
  const articleSelectValue = articleInList
    ? parsed.article
    : articleCustomMode || useCustomArticle
      ? REG_ARTICLE_CUSTOM
      : undefined

  useEffect(() => {
    setArticleCustomMode(false)
  }, [parsed.law])

  function handleLawChange(next: string) {
    if (next === REG_LAW_CUSTOM) {
      onChange(parsed.law ? value : parsed.article)
      return
    }
    setArticleCustomMode(false)
    onChange(formatRegClause(next, parsed.law === next ? parsed.article : ''))
  }

  function handleArticleSelect(next: string) {
    if (next === REG_ARTICLE_CUSTOM) {
      setArticleCustomMode(true)
      return
    }
    setArticleCustomMode(false)
    onChange(formatRegClause(parsed.law, next))
  }

  function handleArticleChange(article: string) {
    onChange(formatRegClause(parsed.law, article))
  }

  function handleCustomLawChange(lawText: string) {
    onChange(lawText.trim())
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2.5">
        <Label className="text-sm font-medium">法律法规</Label>
        <Select value={lawSelectValue} onValueChange={handleLawChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— 选择 —" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {laws.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
            <SelectItem value={REG_LAW_CUSTOM}>自定义…</SelectItem>
          </SelectContent>
        </Select>
        {lawSelectValue === REG_LAW_CUSTOM ? (
          <Input
            value={customLawValue}
            onChange={(event) => handleCustomLawChange(event.target.value)}
            placeholder="输入法律法规名称"
          />
        ) : null}
      </div>
      {lawSelectValue && lawSelectValue !== REG_LAW_CUSTOM ? (
        <div className="grid gap-2.5">
          <Label className="text-sm font-medium">条款条目</Label>
          <Select value={articleSelectValue} onValueChange={handleArticleSelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="— 选择 —" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {articleOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span className="line-clamp-2">{item.label}</span>
                </SelectItem>
              ))}
              <SelectItem value={REG_ARTICLE_CUSTOM}>自定义…</SelectItem>
            </SelectContent>
          </Select>
          {articleSelectValue === REG_ARTICLE_CUSTOM ? (
            <Input
              value={parsed.article}
              onChange={(event) => handleArticleChange(event.target.value)}
              placeholder="输入条款条目，例如 第二十六条、8.1.11 安全区域边界"
            />
          ) : null}
          {articleOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              暂无法规条款映射，可在「法规条款映射」Tab 中维护，或选择「自定义…」
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function DetailReadonlyField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      <div className="text-sm leading-relaxed">{value || '—'}</div>
    </div>
  )
}

function readRegClauseValue(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return ''
  const regClause = (metadata as Record<string, unknown>).regClause
  return typeof regClause === 'string' && regClause.trim() ? regClause : ''
}

export function ComplianceCaseDetailBody({
  libTitle,
  libDomain,
  libCategory,
  caseItem,
}: {
  libTitle: string
  libDomain: string
  libCategory?: string
  caseItem: {
    name: string
    attackType: string
    prompt: string
    expectedPass?: string | null
    expectedFail?: string | null
    riskLevel: 'critical' | 'high' | 'medium' | 'low'
    status: 'published' | 'reviewing' | 'draft'
    metadata: unknown
  }
}) {
  const sampleType = (caseItem.attackType as SampleType) || 'single'
  const extra = readCaseExtraMetadata(caseItem.metadata)
  const riskLabels = {
    critical: '严重',
    high: '高风险',
    medium: '中风险',
    low: '低风险',
  } as const
  const sampleLabels = {
    single: '单轮对话测试',
    multi_turn: '多轮对话测试',
    file_input: '输入文件测试',
    file_output: '输出文件测试',
  } as const
  const statusLabels = {
    published: '启用',
    reviewing: '评审中',
    draft: '草稿',
  } as const

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h4 className="text-sm font-semibold text-foreground">一、归属分类</h4>
        <div className="grid gap-4 sm:grid-cols-3">
          <DetailReadonlyField label="所属合规库" value={libTitle} />
          <DetailReadonlyField label="所属合规域" value={libDomain} />
          <DetailReadonlyField label="所属控制类别" value={libCategory} />
        </div>
      </section>

      <section className="grid gap-3">
        <h4 className="text-sm font-semibold text-foreground">二、基础信息</h4>
        <div className="grid gap-4 sm:grid-cols-3">
          <DetailReadonlyField label="用例名称" value={caseItem.name} />
          <DetailReadonlyField label="风险等级" value={riskLabels[caseItem.riskLevel]} />
          <DetailReadonlyField label="用例状态" value={statusLabels[caseItem.status]} />
        </div>
      </section>

      <section className="grid gap-3">
        <h4 className="text-sm font-semibold text-foreground">三、测试输入</h4>
        <DetailReadonlyField label="测试方式" value={sampleLabels[sampleType]} />
        {sampleType === 'single' ? (
          <div className="grid gap-1.5">
            <Label className="text-xs font-normal text-muted-foreground">
              测试输入 / USER PROMPT
            </Label>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
              {caseItem.prompt}
            </pre>
          </div>
        ) : null}
        {sampleType === 'multi_turn' && extra.turns?.length ? (
          <div className="grid gap-2">
            {extra.turns.map((turn, index) => (
              <div key={index} className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">{turn.role}</p>
                <p className="mt-1 text-sm leading-relaxed">{turn.content}</p>
              </div>
            ))}
          </div>
        ) : null}
        {(sampleType === 'file_input' || sampleType === 'file_output') && extra.fileName ? (
          <div className="grid gap-3">
            <DetailReadonlyField label="文件名" value={extra.fileName} />
            {extra.fileContent ? (
              <div className="grid gap-1.5">
                <Label className="text-xs font-normal text-muted-foreground">文件内容</Label>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                  {extra.fileContent}
                </pre>
              </div>
            ) : null}
            {extra.userQuery ? (
              <DetailReadonlyField label="用户指令" value={extra.userQuery} />
            ) : null}
          </div>
        ) : null}
        {sampleType !== 'single' && caseItem.prompt ? (
          <DetailReadonlyField label="摘要 Prompt" value={caseItem.prompt} />
        ) : null}
      </section>

      <section className="grid gap-3">
        <h4 className="text-sm font-semibold text-foreground">四、预期判定</h4>
        <DetailReadonlyField label="预期合规响应" value={caseItem.expectedPass} />
        <DetailReadonlyField label="违规命中表现" value={caseItem.expectedFail} />
      </section>

      <section className="grid gap-3">
        <h4 className="text-sm font-semibold text-foreground">五、法规依据</h4>
        <DetailReadonlyField
          label="法律法规"
          value={
            parseRegClause(readRegClauseValue(caseItem.metadata), COMPLIANCE_REGULATION_LAWS).law ||
            '—'
          }
        />
        <DetailReadonlyField
          label="条款条目"
          value={
            parseRegClause(readRegClauseValue(caseItem.metadata), COMPLIANCE_REGULATION_LAWS)
              .article || '—'
          }
        />
      </section>
    </div>
  )
}
