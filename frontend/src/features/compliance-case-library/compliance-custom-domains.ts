const STORAGE_KEY = 'compliance-custom-domains'

export type CustomComplianceDomain = {
  id: string
  label: string
  icon: string
  description?: string
}

export function loadCustomDomains(): CustomComplianceDomain[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CustomComplianceDomain[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomDomains(domains: CustomComplianceDomain[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(domains))
}

export function addCustomDomain(domain: Omit<CustomComplianceDomain, 'id'>): CustomComplianceDomain {
  const next: CustomComplianceDomain = {
    id: `custom-${Date.now()}`,
    ...domain,
  }
  const existing = loadCustomDomains()
  saveCustomDomains([...existing, next])
  return next
}

export function removeCustomDomain(id: string) {
  const existing = loadCustomDomains()
  saveCustomDomains(existing.filter((item) => item.id !== id))
}
