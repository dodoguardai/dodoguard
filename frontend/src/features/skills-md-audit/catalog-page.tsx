import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { BookOpen, FileText, Search as SearchIcon, Shield, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { Skeleton } from '@/components/ui/skeleton';
import { agentModeApi } from '@/services/api/agent-mode';
import { setPendingSkillUpload } from './pending-skill-upload';
import {
  latestAuditForSkill,
  mergeBundledAndExtras,
} from './skills-audit-helpers';
import { useSkillsAuditHistoryItems } from './use-skills-audit-history';
import { Step1Upload } from './steps/step1-upload';
import { useUserSkillCatalog } from './user-skill-catalog-storage';
import { riskVariant } from './utils';
import type { SkillsMdAuditData } from '@/services/api/skills-md-audit';

export function SkillsMdAuditCatalogPage() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const userCatalog = useUserSkillCatalog();
  const { items: auditItems } = useSkillsAuditHistoryItems();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [markdownText, setMarkdownText] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [zipFile, setZipFile] = useState<File | null>(null);

  const { data: apiSkills = [], isLoading } = useQuery({
    queryKey: ['agent-bundled-skills-catalog'],
    queryFn: () => agentModeApi.listBundledSkills(),
  });

  const rows = useMemo(
    () => mergeBundledAndExtras(apiSkills, isZh ? 'zh' : 'en', userCatalog),
    [apiSkills, isZh, userCatalog],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      return rows;
    }
    return rows.filter(
      (r) =>
        r.slug.toLowerCase().includes(needle) ||
        r.name.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const goRunWithUpload = () => {
    if (zipFile) {
      setPendingSkillUpload({ kind: 'zip', file: zipFile });
      setUploadOpen(false);
      void navigate({ to: '/skills-md-audit/run', search: { skillSlug: undefined } });
      return;
    }
    if (markdownText.trim()) {
      setPendingSkillUpload({ kind: 'md', text: markdownText, fileName });
      setUploadOpen(false);
      void navigate({ to: '/skills-md-audit/run', search: { skillSlug: undefined } });
      return;
    }
    toast.error(t('pages.skillsMdAudit.catalogUploadNeedFile'));
  };

  const openUploadDialog = () => {
    setZipFile(null);
    setMarkdownText('');
    setFileName(undefined);
    setUploadOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {t('pages.skillsMdAudit.catalogTitle')}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t('pages.skillsMdAudit.catalogSubtitle')}
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
          {t('pages.skillsMdAudit.catalogUploadSectionTitle')}
        </Button>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-h-[min(640px,90vh)] gap-0 overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pe-8">
              <FileText className="size-5 shrink-0" />
              {t('pages.skillsMdAudit.catalogUploadSectionTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('pages.skillsMdAudit.catalogUploadSectionDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Step1Upload
              markdownText={markdownText}
              setMarkdownText={setMarkdownText}
              fileName={fileName}
              setFileName={setFileName}
              zipFile={zipFile}
              setZipFile={setZipFile}
            />
          </div>
          <DialogFooter className="border-t pt-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
              {t('pages.skillsMdAudit.catalogUploadDialogCancel')}
            </Button>
            <Button
              type="button"
              onClick={goRunWithUpload}
              disabled={!zipFile && !markdownText.trim()}
            >
              {t('pages.skillsMdAudit.catalogUploadGoRun')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative max-w-md">
        <SearchIcon className="text-muted-foreground absolute start-2.5 top-2.5 size-4" />
        <Input
          className="ps-8"
          placeholder={t('pages.skillsMdAudit.catalogSearchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((skill) => {
            const latest = latestAuditForSkill(auditItems, skill.slug);
            const risk =
              latest?.result?.overallRisk ?? (latest?.metadata?.overallRisk as string | undefined);
            return (
              <Card key={skill.slug} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <BookOpen className="text-muted-foreground size-8 shrink-0" />
                    <Badge variant={skill.source === 'bundled' ? 'secondary' : 'outline'}>
                      {skill.source === 'bundled'
                        ? t('pages.skillsMdAudit.sourceBundled')
                        : skill.source === 'catalog-extra'
                          ? t('pages.skillsMdAudit.sourceCatalogExtra')
                          : t('pages.skillsMdAudit.sourceUserUpload')}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg leading-snug">{skill.name}</CardTitle>
                  <CardDescription className="line-clamp-3 text-xs">
                    {skill.description || (isZh ? '（无描述）' : '(No description)')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-3 pt-0">
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Shield className="size-3.5 shrink-0" />
                    {latest ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {t('pages.skillsMdAudit.catalogLastAudit')}
                        <Badge
                          variant={
                            risk ? riskVariant(risk as SkillsMdAuditData['overallRisk']) : 'outline'
                          }
                        >
                          {risk ?? '—'}
                        </Badge>
                        <span className="tabular-nums">
                          {t('pages.skillsMdAudit.catalogFindingsCount', {
                            count: latest.result.findings?.length ?? 0,
                          })}
                        </span>
                      </span>
                    ) : (
                      <span>{t('pages.skillsMdAudit.catalogNoAuditYet')}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="default" asChild>
                      <Link to="/skills-md-audit/skill/$slug" params={{ slug: skill.slug }}>
                        {t('pages.skillsMdAudit.catalogOpenSkill')}
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/skills-md-audit/run" search={{ skillSlug: skill.slug }}>
                        {t('pages.skillsMdAudit.catalogRunAudit')}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('pages.skillsMdAudit.catalogEmpty')}</p>
      )}
    </div>
  );
}
