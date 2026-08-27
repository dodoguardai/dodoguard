import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import type { SecurityCaseLibrary } from '@/types/entities';

export type TechnicalRiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type CaseStatus = 'draft' | 'reviewing' | 'published' | 'archived';

export const TECHNICAL_RISK_LEVEL_OPTIONS: { value: TechnicalRiskLevel; label: string }[] = [
  { value: 'critical', label: '严重风险' },
  { value: 'high', label: '高风险' },
  { value: 'medium', label: '中风险' },
  { value: 'low', label: '低风险' },
];

/** @deprecated Use TechnicalRiskLevel */
export type RiskLevel = TechnicalRiskLevel;

export const TECHNICAL_LIBRARY_PAGE_SIZE = 12;

export type MappedTechnicalLibrary = {
  id: string;
  libraryKey: string;
  title: string;
  domain: string;
  description: string;
  cases: number;
  enabled: boolean;
  level: TechnicalRiskLevel;
  method: string;
  standards: string[];
  icon: string;
  tag: string;
  category: string;
  basis: string;
  scope: string;
  isDomainOnly: boolean;
  domainOrder: number;
};

export const CASE_STATUS_TEXT: Record<CaseStatus, string> = {
  draft: '草稿',
  reviewing: '评审中',
  published: '已发布',
  archived: '已归档',
};

export function normalizeTechnicalRiskLevel(value?: string): TechnicalRiskLevel {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'critical' || normalized === '严重' || normalized === '严重风险') {
    return 'critical';
  }
  if (normalized === 'medium' || normalized === '中危' || normalized === '中风险') {
    return 'medium';
  }
  if (normalized === 'low' || normalized === '低危' || normalized === '低风险') {
    return 'low';
  }
  return 'high';
}

export function technicalRiskLevelLabel(level: TechnicalRiskLevel): string {
  const labels: Record<TechnicalRiskLevel, string> = {
    critical: '严重风险',
    high: '高风险',
    medium: '中风险',
    low: '低风险',
  };
  return labels[level];
}

export function technicalRiskLevelShortLabel(level: TechnicalRiskLevel): string {
  const labels: Record<TechnicalRiskLevel, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低',
  };
  return labels[level];
}

/** @deprecated Use technicalRiskLevelLabel */
export const riskLevelText: Record<TechnicalRiskLevel, string> = {
  critical: '严重风险',
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

export const technicalRiskLevelClass: Record<TechnicalRiskLevel, string> = {
  critical:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300',
  high: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300',
  medium:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
};

/** @deprecated Use technicalRiskLevelClass */
export const riskLevelClass = technicalRiskLevelClass;

function normalizeRiskLevel(value?: string): TechnicalRiskLevel {
  return normalizeTechnicalRiskLevel(value);
}

function readMetadataString(metadata: unknown, key: string, fallback = '') {
  if (!metadata || typeof metadata !== 'object') {
    return fallback;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readMetadataBoolean(metadata: unknown, key: string, fallback = false) {
  if (!metadata || typeof metadata !== 'object') {
    return fallback;
  }
  return (metadata as Record<string, unknown>)[key] === true;
}

function readMetadataNumber(metadata: unknown, key: string, fallback = 0) {
  if (!metadata || typeof metadata !== 'object') {
    return fallback;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readLibraryIcon(metadata: unknown) {
  return readMetadataString(metadata, 'icon', '⚠');
}

export function mapTechnicalLibrary(lib: SecurityCaseLibrary): MappedTechnicalLibrary {
  return {
    id: lib.id,
    libraryKey: lib.libraryKey,
    title: lib.title,
    domain: lib.domain,
    description: lib.description,
    cases: lib.caseCount,
    enabled: Boolean(lib.enabled),
    level: normalizeRiskLevel(lib.defaultLevel),
    method: lib.detectMethod,
    standards: lib.standards || [],
    icon: readLibraryIcon(lib.metadata),
    tag: readMetadataString(lib.metadata, 'tag'),
    category: readMetadataString(lib.metadata, 'category'),
    basis: readMetadataString(lib.metadata, 'basis'),
    scope: readMetadataString(lib.metadata, 'scope'),
    isDomainOnly: readMetadataBoolean(lib.metadata, 'domainOnly'),
    domainOrder: readMetadataNumber(lib.metadata, 'domainOrder'),
  };
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pages,
    total,
    start: total ? start + 1 : 0,
    end: Math.min(start + pageSize, total),
  };
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header fixed>
        <Search />
        <div className="ml-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className="grid min-w-0 gap-6 overflow-x-hidden">{children}</Main>
    </>
  );
}

export function PageHead({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-5xl text-sm leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      {action}
    </div>
  );
}

export function KpiCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="min-h-[100px] rounded-lg border bg-card px-5 py-[18px]">
      <div className="mb-3 text-[13px] font-semibold text-muted-foreground">{title}</div>
      <p className="text-[28px] font-bold leading-none tracking-tight">{value}</p>
      <div className="mt-3 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center gap-4 py-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function RiskBadge({ level }: { level: TechnicalRiskLevel | string }) {
  const normalized = normalizeTechnicalRiskLevel(level);
  return (
    <Badge variant="outline" className={technicalRiskLevelClass[normalized]}>
      {technicalRiskLevelLabel(normalized)}
    </Badge>
  );
}

export function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
