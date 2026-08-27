/**
 * System operations — queue, health, maintenance (placeholder).
 */

import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SystemOpsPage() {
  const { t } = useTranslation();
  const p = 'pages.systemMgmt.ops';

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
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t(`${p}.title`)}</h2>
          <p className="text-muted-foreground">{t(`${p}.description`)}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t(`${p}.queueTitle`)}</CardTitle>
              <CardDescription>{t(`${p}.queueDescription`)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">{t(`${p}.badge`)}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                {t(`${p}.healthTitle`)}
              </CardTitle>
              <CardDescription>{t(`${p}.healthDescription`)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">{t(`${p}.badge`)}</Badge>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
