import type { ComplianceRegulationMapping } from '@/types/entities'
import type { mapLibrary } from './shared'

export type MappedLibrary = ReturnType<typeof mapLibrary>

export type RegClauseArticleOption = {
  value: string
  label: string
}

export function lawsMatch(mappingLaw: string, selectedLaw: string): boolean {
  const a = mappingLaw.trim()
  const b = selectedLaw.trim()
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const extract = (text: string) => text.match(/《[^》]+》/)?.[0] || text
  const fromA = extract(a)
  const fromB = extract(b)
  return fromA === fromB || a.includes(fromB) || b.includes(fromA)
}

export function mappingArticleValue(mapping: ComplianceRegulationMapping): string {
  return mapping.article?.trim() || mapping.sourceText?.trim() || ''
}

export function buildArticleOptionsForLaw(
  mappings: ComplianceRegulationMapping[],
  selectedLaw: string,
  existingArticle?: string,
): RegClauseArticleOption[] {
  if (!selectedLaw.trim()) return []
  const options = new Map<string, string>()
  for (const mapping of mappings) {
    if (!lawsMatch(mapping.law, selectedLaw)) continue
    const value = mappingArticleValue(mapping)
    if (!value) continue
    const articleLabel = mapping.article?.trim()
    const sourceLabel = mapping.sourceText?.trim()
    const label =
      articleLabel && sourceLabel && articleLabel !== sourceLabel
        ? `${articleLabel} · ${sourceLabel.length > 48 ? `${sourceLabel.slice(0, 48)}…` : sourceLabel}`
        : articleLabel || sourceLabel || value
    options.set(value, label)
  }
  if (existingArticle?.trim()) {
    const value = existingArticle.trim()
    if (!options.has(value)) options.set(value, value)
  }
  return Array.from(options.entries()).map(([value, label]) => ({ value, label }))
}

export function inferLawFromLibrary(lib: MappedLibrary): string {
  const basis = lib.meta.basis?.trim()
  if (basis) {
    const match = basis.match(/《[^》]+》/)
    if (match) return match[0]
    return basis.split('·')[0]?.trim() || basis.slice(0, 24)
  }
  const titleMatch = lib.title.match(/《[^》]+》/)
  if (titleMatch) return titleMatch[0]
  return lib.title.slice(0, 24)
}

export function countMappingsForLibrary(
  lib: MappedLibrary,
  mappings: ComplianceRegulationMapping[],
  caseCodes: string[] = [],
): number {
  const codeSet = new Set(caseCodes)
  return mappings.filter((mapping) => {
    if (mapping.libraryId === lib.id) return true
    return (mapping.caseIds || []).some((code) => codeSet.has(code))
  }).length
}

export function buildCaseCodeIndex(
  libraries: Array<{ id: string; libraryKey: string; title: string }>,
  casesByLibrary: Record<string, Array<{ id: string; caseCode: string }>>,
): Map<string, { libraryId: string; testCaseId: string; libraryTitle: string }> {
  const index = new Map<string, { libraryId: string; testCaseId: string; libraryTitle: string }>()
  for (const lib of libraries) {
    const cases = casesByLibrary[lib.id] || []
    for (const testCase of cases) {
      index.set(testCase.caseCode, {
        libraryId: lib.id,
        testCaseId: testCase.id,
        libraryTitle: lib.title,
      })
    }
  }
  return index
}
