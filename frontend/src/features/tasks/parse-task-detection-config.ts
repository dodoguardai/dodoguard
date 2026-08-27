/**
 * Normalize `attack_tasks.detectionConfig` from API (may be JSON string or partial).
 */

export type ParsedTaskDetectionConfig = {
  detectionMode?: 'rule' | 'llm'
  useRule: boolean
  useLLM: boolean
  useKnowledgeBase: boolean
  ruleSetId?: string
  llmConfig?: {
    model?: string
    prompt?: string
    confidenceThreshold?: number
    successDescription?: string
  }
}

export function parseTaskDetectionConfig(raw: unknown): ParsedTaskDetectionConfig {
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as unknown
    } catch {
      obj = {}
    }
  }
  if (!obj || typeof obj !== 'object') {
    return { useRule: true, useLLM: false, useKnowledgeBase: false }
  }
  const o = obj as Record<string, unknown>
  const llmRaw = o.llmConfig
  const llm =
    llmRaw && typeof llmRaw === 'object' ? (llmRaw as Record<string, unknown>) : undefined
  const dm = o.detectionMode
  return {
    detectionMode: dm === 'llm' ? 'llm' : dm === 'rule' ? 'rule' : undefined,
    useRule: o.useRule === true,
    useLLM: o.useLLM === true,
    useKnowledgeBase: o.useKnowledgeBase === true,
    ruleSetId: typeof o.ruleSetId === 'string' ? o.ruleSetId : undefined,
    llmConfig: llm
      ? {
          model: typeof llm.model === 'string' ? llm.model : undefined,
          prompt: typeof llm.prompt === 'string' ? llm.prompt : undefined,
          confidenceThreshold:
            typeof llm.confidenceThreshold === 'number' && Number.isFinite(llm.confidenceThreshold)
              ? llm.confidenceThreshold
              : undefined,
          successDescription:
            typeof llm.successDescription === 'string' ? llm.successDescription : undefined,
        }
      : undefined,
  }
}

/** Full `detectionConfig` payload for PUT, preserving unknown keys from the stored row. */
export function mergeTaskDetectionConfigUpdate(
  prevRaw: unknown,
  updates: {
    useRule: boolean
    useLLM: boolean
    useKnowledgeBase: boolean
    llmModel: string
    confidenceThreshold?: number
    successDescription?: string
  },
): Record<string, unknown> {
  let base: Record<string, unknown> = {}
  if (typeof prevRaw === 'string') {
    try {
      const p = JSON.parse(prevRaw) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        base = { ...(p as Record<string, unknown>) }
      }
    } catch {
      base = {}
    }
  } else if (prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)) {
    base = { ...(prevRaw as Record<string, unknown>) }
  }

  const prevLlm =
    base.llmConfig && typeof base.llmConfig === 'object' && !Array.isArray(base.llmConfig)
      ? { ...(base.llmConfig as Record<string, unknown>) }
      : {}

  const detectionMode: 'rule' | 'llm' =
    updates.useLLM && !updates.useRule ? 'llm' : 'rule'

  const nextLlm: Record<string, unknown> = { ...prevLlm }
  nextLlm.model = updates.llmModel.trim() || undefined
  if (updates.confidenceThreshold != null && Number.isFinite(updates.confidenceThreshold)) {
    nextLlm.confidenceThreshold = updates.confidenceThreshold
  } else {
    delete nextLlm.confidenceThreshold
  }
  if (updates.successDescription != null && updates.successDescription.trim() !== '') {
    nextLlm.successDescription = updates.successDescription.trim()
  } else {
    delete nextLlm.successDescription
  }

  return {
    ...base,
    detectionMode,
    useRule: updates.useRule,
    useLLM: updates.useLLM,
    useKnowledgeBase: updates.useKnowledgeBase,
    llmConfig: nextLlm,
  }
}
