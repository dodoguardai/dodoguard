import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { TopNav } from '@/components/layout/top-nav';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { useOrganizationStore } from '@/stores/organization-store';
import { organizationsApi } from '@/services/api/organizations';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';
import { QuickStartContent } from '@/features/quick-start/quick-start-page';
import { EnterpriseTicker } from './components/enterprise-ticker';
import { SecurityCockpit } from './components/security-cockpit';

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tab } = useSearch({ from: '/_authenticated/' });
  const { currentOrg, setOrganizations } = useOrganizationStore();

  const { data: organizationsData, isLoading: isLoadingOrgs } = useQuery({
    queryKey: ['organizations', 'for-dashboard'],
    queryFn: () => organizationsApi.list(),
    enabled: !currentOrg?.id,
    staleTime: 60 * 1000,
  });
  useEffect(() => {
    if (!currentOrg?.id && organizationsData?.length) {
      setOrganizations(organizationsData);
    }
  }, [currentOrg?.id, organizationsData, setOrganizations]);

  const hasNoOrg =
    !currentOrg?.id && !isLoadingOrgs && organizationsData && organizationsData.length === 0;

  const isQuickStart = tab === 'quickstart';

  return (
    <>
      {isQuickStart ? <EnterpriseTicker /> : null}
      <Header>
        <TopNav links={topNav(t, tab)} />
        <div className="ms-auto flex items-center space-x-4">
          <Search />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className={isQuickStart ? 'grid gap-6' : undefined}>
        {isQuickStart ? (
          <QuickStartContent />
        ) : hasNoOrg ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                {t('pages.dashboard.noOrganization')}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: userRoleManagementTabPath('organizations') })}
                >
                  {t('pages.dashboard.manageOrganizations')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <SecurityCockpit />
        )}
      </Main>
    </>
  );
}

const topNav = (t: (key: string) => string, currentTab: string) => [
  {
    title: t('sidebar.item.quickStart'),
    href: '/',
    search: { tab: 'quickstart' },
    isActive: currentTab === 'quickstart',
    disabled: false,
  },
  {
    title: t('pages.dashboard.overview'),
    href: '/',
    search: { tab: 'overview' },
    isActive: currentTab !== 'quickstart',
    disabled: false,
  },
];
