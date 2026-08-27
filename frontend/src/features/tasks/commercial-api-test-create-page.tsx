/**
 * Create a new commercial API test task.
 */

import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { CommercialApiTestForm } from '@/features/tasks/commercial-api-test-form';

export function CommercialApiTestCreatePage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const navigate = useNavigate();

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className="flex flex-1 flex-col gap-6">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit"
            onClick={() => navigate({ to: '/tasks/commercial-api-test' })}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tr('Back to list', '返回列表')}
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {tr('New commercial API scan', '新建商业 API 扫描')}
            </h2>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {tr(
                'Enter the API route and parameters, pick vulnerability tests, and run a full scan.',
                '填写 API 路由与参数，选择漏洞测试项并执行全量扫描。',
              )}
            </p>
          </div>
        </div>

        <div className="max-w-3xl">
          <CommercialApiTestForm tr={tr} isZh={isZh} />
        </div>
      </Main>
    </>
  );
}
