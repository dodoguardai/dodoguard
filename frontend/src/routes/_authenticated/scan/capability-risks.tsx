import { createFileRoute } from '@tanstack/react-router'
import { CapabilityRiskLibraryPage } from '@/features/detection-scanning'
import type { CapabilityComponentKind } from '@/types/entities'

const KIND_SET = new Set<CapabilityComponentKind>([
  'tool',
  'skill',
  'mcp',
  'model',
  'knowledge',
])

export type CapabilityRisksSearch = {
  kind?: CapabilityComponentKind
  componentId?: string
}

export const Route = createFileRoute('/_authenticated/scan/capability-risks')({
  validateSearch: (search: Record<string, unknown>): CapabilityRisksSearch => {
    const kindRaw = typeof search.kind === 'string' ? search.kind : undefined
    const kind =
      kindRaw && KIND_SET.has(kindRaw as CapabilityComponentKind)
        ? (kindRaw as CapabilityComponentKind)
        : undefined
    const componentId =
      typeof search.componentId === 'string' && search.componentId.trim()
        ? search.componentId.trim()
        : undefined
    return { kind, componentId }
  },
  component: CapabilityRiskLibraryPage,
})
