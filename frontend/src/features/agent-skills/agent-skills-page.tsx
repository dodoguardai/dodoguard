/**
 * Agent skills catalog — layout inspired by OpenClaw Skills (sources/precedence + installed vs catalog).
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BookOpen,
  Boxes,
  ExternalLink,
  FlaskConical,
  GripVertical,
  Layers,
  LayoutDashboard,
  Search as SearchIcon,
  Shield,
  ShieldAlert,
  Workflow,
} from 'lucide-react';
import { useCallback, useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search as SearchBar } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { agentModeApi } from '@/services/api/agent-mode';
import {
  AGENT_SKILL_CATALOG_EXTRAS,
  AGENT_SKILLS_DISPLAY_ORDER_LS_KEY,
  OPTIONAL_AGENT_SKILLS_LS_KEY,
} from './catalog-extras';

type UnifiedRow = {
  slug: string;
  displayName: string;
  description: string;
  tagLabels: string[];
  source: 'bundled' | 'extra';
};

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function readOptionalInstalled(): string[] {
  try {
    const raw = localStorage.getItem(OPTIONAL_AGENT_SKILLS_LS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeOptionalInstalled(slugs: string[]) {
  localStorage.setItem(OPTIONAL_AGENT_SKILLS_LS_KEY, JSON.stringify(slugs));
}

function matchesQuery(row: UnifiedRow, q: string): boolean {
  if (!q) {
    return true;
  }
  const hay = `${row.slug} ${row.displayName} ${row.description}`.toLowerCase();
  return hay.includes(q);
}

function skillIconForSlug(slug: string): LucideIcon {
  if (slug === 'core-task-builder') {
    return Boxes;
  }
  if (slug === 'owasp-llm-top10') {
    return ShieldAlert;
  }
  if (slug === 'harness-verification') {
    return FlaskConical;
  }
  if (slug.includes('n8n')) {
    return Workflow;
  }
  if (slug.endsWith('-surface') || slug.includes('surface')) {
    return LayoutDashboard;
  }
  return BookOpen;
}

function readDisplayOrder(): string[] {
  try {
    const raw = localStorage.getItem(AGENT_SKILLS_DISPLAY_ORDER_LS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeDisplayOrder(slugs: string[]) {
  localStorage.setItem(AGENT_SKILLS_DISPLAY_ORDER_LS_KEY, JSON.stringify(slugs));
}

/** Keep user order for known slugs; append any newly installed slugs at the end (stable). */
function mergeDisplayOrder(saved: string[], canonical: string[]): string[] {
  const set = new Set(canonical);
  const head = saved.filter((s) => set.has(s));
  const tail = canonical.filter((s) => !head.includes(s));
  return [...head, ...tail];
}

function reorderSlugs(list: string[], fromSlug: string, toSlug: string): string[] {
  const from = list.indexOf(fromSlug);
  const to = list.indexOf(toSlug);
  if (from < 0 || to < 0 || from === to) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function AgentSkillsPage() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  const [query, setQuery] = useState('');
  const [optionalInstalled, setOptionalInstalled] = useState<string[]>(() => readOptionalInstalled());
  const [savedDisplayOrder, setSavedDisplayOrder] = useState<string[]>(() => readDisplayOrder());
  const [draggingSlug, setDraggingSlug] = useState<string | null>(null);

  const { data: bundled = [], isLoading } = useQuery({
    queryKey: ['agent-skills-catalog-bundled'],
    queryFn: () => agentModeApi.listBundledSkills(),
  });

  const bundledSlugSet = useMemo(() => new Set(bundled.map((b) => b.slug)), [bundled]);

  const bundledRows: UnifiedRow[] = useMemo(() => {
    const lbl = (key: 'builtin' | 'allplatform' | 'surface' | 'catalog' | 'closure') =>
      t(`pages.agentSkills.tag.${key}`);
    return bundled.map((b) => {
      const tags: string[] = [];
      if (b.slug === 'core-task-builder') {
        tags.push(lbl('builtin'), lbl('allplatform'));
      } else if (b.slug.endsWith('-surface')) {
        tags.push(lbl('surface'));
      } else {
        tags.push(lbl('builtin'));
      }
      const name = typeof b.manifest.name === 'string' ? b.manifest.name.trim() : '';
      return {
        slug: b.slug,
        displayName: name || slugToTitle(b.slug),
        description: b.manifest.description || '',
        tagLabels: tags,
        source: 'bundled' as const,
      };
    });
  }, [bundled, t]);

  const extraRows: UnifiedRow[] = useMemo(() => {
    const lbl = (key: 'builtin' | 'allplatform' | 'surface' | 'catalog' | 'closure') =>
      t(`pages.agentSkills.tag.${key}`);
    return AGENT_SKILL_CATALOG_EXTRAS.filter((x) => !bundledSlugSet.has(x.slug)).map((x) => ({
      slug: x.slug,
      displayName: slugToTitle(x.slug),
      description: isZh ? x.desc.zh : x.desc.en,
      tagLabels: x.tags.map((k) => lbl(k)),
      source: 'extra' as const,
    }));
  }, [bundledSlugSet, isZh, t]);

  const qNorm = query.trim().toLowerCase();
  const reorderDisabled = Boolean(qNorm);

  const canonicalInstalledOrder = useMemo(() => {
    const bundledSlugs = bundled.map((b) => b.slug);
    const extras = optionalInstalled.filter((s) => !bundledSlugSet.has(s));
    return [...bundledSlugs, ...extras];
  }, [bundled, optionalInstalled, bundledSlugSet]);

  const mergedDisplayOrder = useMemo(
    () => mergeDisplayOrder(savedDisplayOrder, canonicalInstalledOrder),
    [savedDisplayOrder, canonicalInstalledOrder],
  );

  const installedRowsFiltered = useMemo(() => {
    const optionalInstalledRows = extraRows.filter((r) => optionalInstalled.includes(r.slug));
    return [...bundledRows, ...optionalInstalledRows].filter((r) => matchesQuery(r, qNorm));
  }, [bundledRows, extraRows, optionalInstalled, qNorm]);

  const visibleInstalledRows = useMemo(() => {
    if (!qNorm) {
      const rowBySlug = new Map(installedRowsFiltered.map((r) => [r.slug, r]));
      return mergedDisplayOrder.map((slug) => rowBySlug.get(slug)).filter((r): r is UnifiedRow => !!r);
    }
    return [...installedRowsFiltered].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [installedRowsFiltered, mergedDisplayOrder, qNorm]);

  const handleInstalledDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleInstalledDropOnRow = useCallback(
    (targetSlug: string) => (e: DragEvent) => {
      e.preventDefault();
      const dragged = e.dataTransfer.getData('text/plain');
      if (!dragged || dragged === targetSlug || reorderDisabled) {
        return;
      }
      setSavedDisplayOrder((prev) => {
        const base = mergeDisplayOrder(prev, canonicalInstalledOrder);
        const next = reorderSlugs(base, dragged, targetSlug);
        writeDisplayOrder(next);
        return next;
      });
    },
    [canonicalInstalledOrder, reorderDisabled],
  );

  const catalogRows = useMemo(
    () => extraRows.filter((r) => !optionalInstalled.includes(r.slug)).filter((r) => matchesQuery(r, qNorm)),
    [extraRows, optionalInstalled, qNorm],
  );

  const installedCount = useMemo(() => {
    const optionalExtra = optionalInstalled.filter((s) => !bundledSlugSet.has(s)).length;
    return bundled.length + optionalExtra;
  }, [bundled.length, bundledSlugSet, optionalInstalled]);

  const persistOptional = (next: string[]) => {
    writeOptionalInstalled(next);
    setOptionalInstalled(next);
  };

  const handleInstall = (slug: string) => {
    if (bundledSlugSet.has(slug)) {
      return;
    }
    persistOptional([...new Set([...optionalInstalled, slug])]);
    toast.success(t('pages.agentSkills.toastInstalled'));
  };

  const handleUninstall = (slug: string) => {
    if (bundledSlugSet.has(slug)) {
      return;
    }
    persistOptional(optionalInstalled.filter((s) => s !== slug));
    toast.success(t('pages.agentSkills.toastUninstalled'));
  };

  return (
    <>
      <Header fixed>
        <SearchBar />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main fluid className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-[1280px] space-y-8 px-4 py-8">
          {/* Title band — OpenClaw-like: actions on the right */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <nav className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <span>{t('sidebar.group.enterprise')}</span>
                <span>/</span>
                <span className="text-foreground font-medium">{t('sidebar.item.skillsCatalog')}</span>
              </nav>
              <div className="flex items-start gap-3">
                <span className="bg-primary text-primary-foreground mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-xs">
                  <BookOpen className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h1 className="text-foreground text-3xl font-bold tracking-tight">{t('pages.agentSkills.pageTitle')}</h1>
                  <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
                    {t('pages.agentSkills.pageSubtitle')}
                  </p>
                  <a
                    href="https://agentskills.io/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  >
                    agentskills.io
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:pt-8">
              <Badge variant="secondary" className="font-mono px-3 py-1.5 text-xs font-semibold ring-1 ring-border">
                {t('pages.agentSkills.installedBadge', { count: installedCount })}
              </Badge>
              <Button variant="outline" size="sm" className="rounded-lg" asChild>
                <Link to="/settings/models">{t('pages.agentSkills.gotoIntegrations')}</Link>
              </Button>
              <Button size="sm" className="rounded-lg shadow-xs" asChild>
                <Link to="/tasks/agent-mode" search={{ surface: 'dify' }}>
                  {t('pages.agentSkills.gotoAgentMode')}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                type="search"
                className="bg-muted/60 border-border rounded-xl py-3 pl-10 pr-3"
                placeholder={t('pages.agentSkills.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-8 xl:grid-cols-12">
            {/* Sidebar — precedence + security (OpenClaw docs patterns) */}
            <aside className="space-y-4 xl:col-span-4">
              <Card className="shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="text-muted-foreground h-4 w-4" />
                    <CardTitle className="text-base">{t('pages.agentSkills.precedenceTitle')}</CardTitle>
                  </div>
                  <CardDescription>{t('pages.agentSkills.precedenceIntro')}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-muted-foreground w-14 font-mono text-xs">
                          {t('pages.agentSkills.precedenceColPriority')}
                        </TableHead>
                        <TableHead className="text-muted-foreground text-xs">{t('pages.agentSkills.precedenceColSource')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-mono text-xs">1</TableCell>
                        <TableCell className="text-sm">{t('pages.agentSkills.precedenceRow1')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-xs">2</TableCell>
                        <TableCell className="text-sm">{t('pages.agentSkills.precedenceRow2')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-xs">3</TableCell>
                        <TableCell className="text-sm">{t('pages.agentSkills.precedenceRow3')}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">{t('pages.agentSkills.agentskillsSpec')}</p>
                </CardContent>
              </Card>

              <Card className="shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Shield className="text-muted-foreground h-4 w-4" />
                    <CardTitle className="text-base">{t('pages.agentSkills.securityTitle')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-muted-foreground pt-0 text-xs leading-relaxed">{t('pages.agentSkills.securityBlurb')}</CardContent>
              </Card>
            </aside>

            {/* Main lists */}
            <div className="space-y-10 xl:col-span-8">
              <section className="space-y-3">
                <div>
                  <h2 className="text-foreground text-lg font-semibold tracking-tight">{t('pages.agentSkills.sectionInstalled')}</h2>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed sm:text-sm">
                    {t('pages.agentSkills.sectionInstalledHint')}{' '}
                    {reorderDisabled
                      ? t('pages.agentSkills.sectionInstalledReorderDisabled')
                      : t('pages.agentSkills.sectionInstalledReorderHint')}
                  </p>
                </div>
                <Card className="overflow-hidden shadow-xs">
                  <CardContent className="p-0">
                    {isLoading ? (
                      <div className="divide-border divide-y p-3">
                        <Skeleton className="h-14 w-full rounded-md" />
                        <Skeleton className="h-14 w-full rounded-md" />
                      </div>
                    ) : visibleInstalledRows.length === 0 ? (
                      <p className="text-muted-foreground p-10 text-center text-sm">{t('pages.agentSkills.emptyInstalled')}</p>
                    ) : (
                      <ul className="divide-border divide-y">
                        {visibleInstalledRows.map((row, idx) => {
                          const isBundled = row.source === 'bundled';
                          const Icon = skillIconForSlug(row.slug);
                          return (
                            <li
                              key={`in-${row.slug}`}
                              onDragOver={reorderDisabled ? undefined : handleInstalledDragOver}
                              onDrop={reorderDisabled ? undefined : handleInstalledDropOnRow(row.slug)}
                              className={cn(
                                'hover:bg-muted/40 flex items-center gap-2 px-3 py-2 transition-colors sm:gap-3 sm:px-4',
                                draggingSlug === row.slug && 'bg-muted/50',
                              )}
                            >
                              <div
                                draggable={!reorderDisabled}
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData('text/plain', row.slug);
                                  e.dataTransfer.effectAllowed = 'move';
                                  setDraggingSlug(row.slug);
                                }}
                                onDragEnd={() => setDraggingSlug(null)}
                                className={cn(
                                  'text-muted-foreground flex w-7 shrink-0 items-center justify-center rounded-md',
                                  reorderDisabled
                                    ? 'pointer-events-none opacity-25'
                                    : 'cursor-grab touch-none active:cursor-grabbing',
                                )}
                                aria-label={t('pages.agentSkills.dragReorderAria')}
                              >
                                <GripVertical className="h-4 w-4 shrink-0" aria-hidden />
                              </div>
                              <div className="text-muted-foreground w-6 shrink-0 text-center font-mono text-[11px] tabular-nums sm:w-7 sm:text-xs">
                                {reorderDisabled ? '—' : idx + 1}
                              </div>
                              <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                                <Icon className="text-muted-foreground h-4 w-4" aria-hidden />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="text-foreground truncate text-sm font-medium leading-none">{row.displayName}</span>
                                  <Badge variant="outline" className="font-mono text-[10px] leading-none">
                                    {row.slug}
                                  </Badge>
                                  <Badge variant="secondary" className="text-[10px] leading-none">
                                    {isBundled ? t('pages.agentSkills.rowSourceBundled') : t('pages.agentSkills.rowSourceExtra')}
                                  </Badge>
                                  {row.tagLabels.map((lab) => (
                                    <Badge key={lab} variant="outline" className="text-[10px] font-normal leading-none">
                                      {lab}
                                    </Badge>
                                  ))}
                                </div>
                                {row.description ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <p className="text-muted-foreground mt-1 line-clamp-1 cursor-default text-xs leading-snug">
                                        {row.description}
                                      </p>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-sm text-xs">
                                      {row.description}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 flex-col items-end justify-center gap-1">
                                <span className="bg-secondary text-secondary-foreground ring-border rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ring-1">
                                  {t('pages.agentSkills.installed')}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-destructive h-7 px-2 text-[11px] disabled:opacity-40"
                                  disabled={isBundled}
                                  onClick={() => handleUninstall(row.slug)}
                                >
                                  {t('pages.agentSkills.uninstall')}
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </section>

              <Separator />

              <section className="space-y-3">
                <div>
                  <h2 className="text-foreground text-lg font-semibold tracking-tight">{t('pages.agentSkills.sectionCatalog')}</h2>
                  <p className="text-muted-foreground mt-1 text-sm">{t('pages.agentSkills.sectionCatalogHint')}</p>
                </div>
                <Card className="overflow-hidden shadow-xs">
                  <CardContent className="p-0">
                    {isLoading ? (
                      <div className="divide-border divide-y p-3">
                        <Skeleton className="h-14 w-full rounded-md" />
                      </div>
                    ) : catalogRows.length === 0 ? (
                      <p className="text-muted-foreground p-10 text-center text-sm">{t('pages.agentSkills.emptyCatalog')}</p>
                    ) : (
                      <ul className="divide-border divide-y">
                        {catalogRows.map((row) => {
                          const Icon = skillIconForSlug(row.slug);
                          return (
                            <li
                              key={`cat-${row.slug}`}
                              className="hover:bg-muted/40 flex items-center gap-2 px-3 py-2 transition-colors sm:gap-3 sm:px-4"
                            >
                              <div className="w-6 shrink-0 sm:w-7" aria-hidden />
                              <div className="text-muted-foreground w-6 shrink-0 text-center font-mono text-[11px] sm:w-7 sm:text-xs">
                                —
                              </div>
                              <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                                <Icon className="text-muted-foreground h-4 w-4" aria-hidden />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="text-foreground truncate text-sm font-medium leading-none">{row.displayName}</span>
                                  <Badge variant="outline" className="font-mono text-[10px] leading-none">
                                    {row.slug}
                                  </Badge>
                                  {row.tagLabels.map((lab) => (
                                    <Badge key={lab} variant="outline" className="text-[10px] font-normal leading-none">
                                      {lab}
                                    </Badge>
                                  ))}
                                </div>
                                {row.description ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <p className="text-muted-foreground mt-1 line-clamp-1 cursor-default text-xs leading-snug">
                                        {row.description}
                                      </p>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-sm text-xs">
                                      {row.description}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 rounded-md px-3 text-[11px] font-semibold shadow-xs"
                                  onClick={() => handleInstall(row.slug)}
                                >
                                  {t('pages.agentSkills.install')}
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <p className="text-muted-foreground text-[11px] leading-relaxed">{t('pages.agentSkills.footerApi')}</p>
              </section>
            </div>
          </div>
        </div>
      </Main>
    </>
  );
}
