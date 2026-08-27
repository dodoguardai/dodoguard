/**
 * Multi-round test workspace page.
 */

import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { MultiRoundTestWorkspace } from '@/features/tasks/multi-round-test-workspace';
import { Route } from '@/routes/_authenticated/tasks/single-test.multi-round';

export function MultiRoundTestPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const navigate = useNavigate();
  const { agents: agentsParam, expectedSuccess, judgeModel } = Route.useSearch();

  const agentIds = agentsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  useEffect(() => {
    if (agentIds.length === 0 || !expectedSuccess.trim() || !judgeModel.trim()) {
      navigate({ to: '/expert-toolbox/dynamic-probe', search: { mode: 'multi-round' } });
    }
  }, [agentIds.length, expectedSuccess, judgeModel, navigate]);

  if (agentIds.length === 0 || !expectedSuccess.trim() || !judgeModel.trim()) {
    return null;
  }

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

      <Main fixed fluid className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <MultiRoundTestWorkspace
          tr={tr}
          isZh={isZh}
          agentIds={agentIds}
          expectedSuccess={expectedSuccess.trim()}
          judgeModel={judgeModel.trim()}
        />
      </Main>
    </>
  );
}
