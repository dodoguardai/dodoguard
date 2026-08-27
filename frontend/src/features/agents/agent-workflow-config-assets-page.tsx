/**
 * Standalone page: workflow config assets scoped to one target agent.
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowConfigAssetsBrowse } from '@/features/workflow-config-assets/workflow-config-assets-browse';
import { agentsApi } from '@/services/api/agents';
import { ArrowLeft, AlertCircle } from 'lucide-react';

type Props = {
  agentId: string;
};

export function AgentWorkflowConfigAssetsPage({ agentId }: Props) {
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => agentsApi.get(agentId),
    retry: 1,
  });

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

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({
                to: '/agents/$agentId',
                params: { agentId },
              })
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tr('Back to agent', '返回智能体')}
          </Button>
          {isLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : agent ? (
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight truncate">
                {agent.name}
                <span className="text-muted-foreground font-normal">
                  {' '}
                  · {t('sidebar.item.workflowConfigAssets')}
                </span>
              </h1>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error instanceof Error ? error.message : tr('Agent not found', '未找到智能体')}
            </div>
          )}
        </div>

        {agent && (
          <WorkflowConfigAssetsBrowse
            targetAgentId={agentId}
            embedded
            agentSurfaceType={agent.type}
          />
        )}
      </Main>
    </>
  );
}
