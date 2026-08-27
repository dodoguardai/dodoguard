/**
 * FastGPT Config Audit — local history detail (report-style layout).
 */

import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getAuditModule } from '@/features/audit/audit-registry';
import { ConfigAuditResultView } from '@/features/reports/config-audit-result-view';
import type { FastGptConfigAuditData } from '@/services/api/fastgpt-config-audit';
import { auditToMarkdown } from './utils';

interface FastGptConfigAuditHistoryDetailPageProps {
  id: string;
}

export function FastGptConfigAuditHistoryDetailPage({
  id,
}: FastGptConfigAuditHistoryDetailPageProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const module = getAuditModule('fastgpt-config');
  const item = useMemo(() => {
    if (!module?.storage || !id) {
      return null;
    }
    return module.storage.getById(id) as {
      id: string;
      result: FastGptConfigAuditData;
      metadata?: { fileName?: string; reportId?: string };
      createdAt: string;
    } | null;
  }, [module, id]);

  if (!item) {
    return (
      <>
        <Header>
          <Search />
          <div className="ms-auto flex items-center space-x-4">
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>
        <Main>
          <Alert variant="destructive">
            <AlertTitle>{tr('Record not found', '记录不存在')}</AlertTitle>
            <AlertDescription>
              {tr(
                'This audit record may have been cleared or does not exist. History is stored locally in this browser.',
                '该审计记录可能已清除或不存在。历史仅保存在本浏览器。',
              )}
            </AlertDescription>
          </Alert>
          <Button asChild className="mt-4">
            <Link
              to="/expert-toolbox/platform-config-audit"
              search={{ view: 'history', platform: 'fastgpt' }}
            >
              {tr('Back to history', '返回审计历史')}
            </Link>
          </Button>
        </Main>
      </>
    );
  }

  const fileName = item.metadata?.fileName;
  const reportId =
    typeof item.metadata?.reportId === 'string' ? item.metadata.reportId : undefined;

  return (
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <ConfigAuditResultView
          platform="fastgpt"
          result={item.result}
          fileName={fileName}
          createdAt={item.createdAt}
          reportId={reportId}
          backHref={{
            to: '/expert-toolbox/platform-config-audit',
            search: { view: 'history', platform: 'fastgpt' },
          }}
          onCopyMd={() => {
            void navigator.clipboard.writeText(auditToMarkdown(item.result, fileName));
            toast.success(tr('Markdown copied', '已复制 Markdown'));
          }}
        />
      </Main>
    </>
  );
}
