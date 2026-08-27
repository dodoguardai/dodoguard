/**
 * MCP audit hub catalog — reference patterns + audited MCP from capability registry.
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FileArchive, Plug, Search as SearchIcon, Shield, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { riskVariant } from '@/features/skills-md-audit/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type { CapabilityComponentRegistry } from '@/types/entities';
import type { McpAuditData } from '@/services/api/mcp-audit';
import { listReferenceMcpRows, type UnifiedMcpRow } from './mcp-audit-helpers';
import { setPendingMcpUpload } from './pending-mcp-upload';
import { McpStep1Zip } from './mcp-step1-zip';

function matchesNeedle(text: string, needle: string) {
  return text.toLowerCase().includes(needle);
}

function registrySlug(row: CapabilityComponentRegistry): string {
  return (row.componentKey || row.name || row.id).trim() || row.id;
}

export function McpAuditCatalogSection() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const lang = isZh ? 'zh' : 'en';
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [, setFileName] = useState<string | undefined>();

  const registryQuery = useQuery({
    queryKey: ['capability-components', 'mcp-audit-catalog'],
    queryFn: () =>
      detectionScanningApi.listCapabilityComponents({
        componentKind: 'mcp',
        limit: 200,
      }),
  });

  const referenceRows = useMemo(() => listReferenceMcpRows(lang), [lang]);
  const registryRows = registryQuery.data?.data || [];

  const needle = q.trim().toLowerCase();

  const filteredReference = useMemo(() => {
    if (!needle) {
      return referenceRows;
    }
    return referenceRows.filter(
      (r) =>
        matchesNeedle(r.slug, needle) ||
        matchesNeedle(r.name, needle) ||
        matchesNeedle(r.description, needle),
    );
  }, [referenceRows, needle]);

  const filteredRegistry = useMemo(() => {
    if (!needle) {
      return registryRows;
    }
    return registryRows.filter((row) => {
      const slug = registrySlug(row);
      return (
        matchesNeedle(slug, needle) ||
        matchesNeedle(row.name, needle) ||
        matchesNeedle(row.description || '', needle)
      );
    });
  }, [registryRows, needle]);

  const goRunWithUpload = () => {
    if (zipFile) {
      setPendingMcpUpload({ kind: 'zip', file: zipFile });
      setUploadOpen(false);
      void navigate({ to: '/mcp-audit/run', search: { mcpSlug: undefined } });
      return;
    }
    toast.error(t('pages.mcpAudit.catalogUploadNeedFile'));
  };

  const openUploadDialog = () => {
    setZipFile(null);
    setFileName(undefined);
    setUploadOpen(true);
  };

  return (
    <div className="mt-10 space-y-8 border-t pt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight">{t('pages.mcpAudit.catalogTitle')}</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t('pages.mcpAudit.catalogSubtitle')}{' '}
            <a
              href="https://ai.trusttools.cn/mcp"
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium underline-offset-4 hover:underline"
            >
              {t('pages.mcpAudit.catalogTrustToolsRef')}
            </a>
            . {t('pages.mcpAudit.catalogSubtitleLedger')}{' '}
            <Link
              to="/scan/capability-risks"
              search={{ kind: 'mcp', componentId: undefined }}
              className="text-primary font-medium underline-offset-4 hover:underline"
            >
              {t('pages.mcpAudit.catalogOpenCapabilityMgmt')}
            </Link>
            .
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={openUploadDialog}
        >
          <Upload className="size-4" />
          {t('pages.mcpAudit.catalogUploadSectionTitle')}
        </Button>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-h-[min(640px,90vh)] gap-0 overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pe-8">
              <FileArchive className="size-5 shrink-0" />
              {t('pages.mcpAudit.catalogUploadSectionTitle')}
            </DialogTitle>
            <DialogDescription>{t('pages.mcpAudit.catalogUploadSectionDesc')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <McpStep1Zip zipFile={zipFile} setZipFile={setZipFile} setFileName={setFileName} />
          </div>
          <DialogFooter className="border-t pt-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
              {t('pages.mcpAudit.catalogUploadDialogCancel')}
            </Button>
            <Button type="button" onClick={goRunWithUpload} disabled={!zipFile}>
              {t('pages.mcpAudit.catalogUploadGoRun')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative max-w-md">
        <SearchIcon className="text-muted-foreground absolute start-2.5 top-2.5 size-4" />
        <Input
          className="ps-8"
          placeholder={t('pages.mcpAudit.catalogSearchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <CatalogBlock title={t('pages.mcpAudit.catalogSectionRegistry')}>
        {registryQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">{t('pages.mcpAudit.catalogLoading')}</p>
        ) : filteredRegistry.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('pages.mcpAudit.catalogRegistryEmpty')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRegistry.map((row) => (
              <RegistryMcpCard key={row.id} row={row} t={t} isZh={isZh} />
            ))}
          </div>
        )}
      </CatalogBlock>

      <CatalogBlock title={t('pages.mcpAudit.catalogSectionReference')}>
        {filteredReference.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('pages.mcpAudit.catalogEmpty')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredReference.map((mcp) => (
              <ReferenceMcpCard key={mcp.slug} mcp={mcp} t={t} isZh={isZh} />
            ))}
          </div>
        )}
      </CatalogBlock>
    </div>
  );
}

function CatalogBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {children}
    </section>
  );
}

function ReferenceMcpCard({
  mcp,
  t,
  isZh,
}: {
  mcp: UnifiedMcpRow;
  t: (key: string, opts?: Record<string, unknown>) => string;
  isZh: boolean;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <Plug className="text-muted-foreground size-8 shrink-0" />
          <Badge variant="secondary">{t('pages.mcpAudit.sourceCatalogExtra')}</Badge>
        </div>
        <CardTitle className="text-lg leading-snug">{mcp.name}</CardTitle>
        <CardDescription className="line-clamp-3 text-xs">
          {mcp.description || (isZh ? '（无描述）' : '(No description)')}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-3 pt-0">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Shield className="size-3.5 shrink-0" />
          <span>{t('pages.mcpAudit.catalogNoAuditYet')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="default" asChild>
            <Link to="/mcp-audit/mcp/$slug" params={{ slug: mcp.slug }}>
              {t('pages.mcpAudit.catalogOpenMcp')}
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/mcp-audit/run" search={{ mcpSlug: mcp.slug }}>
              {t('pages.mcpAudit.catalogRunAudit')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RegistryMcpCard({
  row,
  t,
  isZh,
}: {
  row: CapabilityComponentRegistry;
  t: (key: string, opts?: Record<string, unknown>) => string;
  isZh: boolean;
}) {
  const slug = registrySlug(row);
  const findingsCount =
    typeof row.ruleCount === 'number'
      ? row.ruleCount
      : typeof row.metadata?.findingsCount === 'number'
        ? (row.metadata.findingsCount as number)
        : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <Plug className="text-muted-foreground size-8 shrink-0" />
          <Badge variant="outline">{t('pages.mcpAudit.sourceCapabilityRegistry')}</Badge>
        </div>
        <CardTitle className="text-lg leading-snug">{row.name}</CardTitle>
        <CardDescription className="line-clamp-3 text-xs">
          {row.description || (isZh ? '（无描述）' : '(No description)')}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-3 pt-0">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Shield className="size-3.5 shrink-0" />
          <span className="flex flex-wrap items-center gap-2">
            {t('pages.mcpAudit.catalogLastAudit')}
            <Badge variant={riskVariant(row.riskLevel as McpAuditData['overallRisk'])}>
              {row.riskLevel}
            </Badge>
            <span className="tabular-nums">
              {t('pages.mcpAudit.catalogFindingsCount', { count: findingsCount })}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="default" asChild>
            <Link
              to="/scan/capability-risks"
              search={{ kind: 'mcp', componentId: row.id }}
            >
              {t('pages.mcpAudit.catalogOpenCapabilityDetail')}
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/mcp-audit/run" search={{ mcpSlug: slug }}>
              {t('pages.mcpAudit.catalogRunAudit')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
