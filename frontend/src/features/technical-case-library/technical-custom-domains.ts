const STORAGE_KEY = 'technical-custom-domains-v2';

export type CustomTechnicalDomain = {
  id: string;
  label: string;
  icon: string;
  description?: string;
};

export function loadCustomTechnicalDomains(): CustomTechnicalDomain[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomTechnicalDomain[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomTechnicalDomains(domains: CustomTechnicalDomain[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(domains));
}

export function addCustomTechnicalDomain(
  domain: Omit<CustomTechnicalDomain, 'id'>,
): CustomTechnicalDomain {
  const next: CustomTechnicalDomain = {
    id: `technical-custom-${Date.now()}`,
    ...domain,
  };
  const existing = loadCustomTechnicalDomains();
  saveCustomTechnicalDomains([...existing, next]);
  return next;
}

export function removeCustomTechnicalDomain(id: string) {
  const existing = loadCustomTechnicalDomains();
  saveCustomTechnicalDomains(existing.filter((item) => item.id !== id));
}
