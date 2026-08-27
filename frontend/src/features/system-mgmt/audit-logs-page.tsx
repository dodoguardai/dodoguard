/**
 * Audit logs — system management placeholder (API wiring pending).
 */

import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AuditLogsPage() {
  const { t } = useTranslation();
  const p = 'pages.systemMgmt.audit';

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4" />
              {t(`${p}.comingSoonTitle`)}
              <Badge variant="secondary">{t(`${p}.badge`)}</Badge>
            </CardTitle>
            <CardDescription>{t(`${p}.comingSoonDescription`)}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>{t(`${p}.bulletLogin`)}</li>
              <li>{t(`${p}.bulletUsers`)}</li>
              <li>{t(`${p}.bulletRoles`)}</li>
              <li>{t(`${p}.bulletConfig`)}</li>
              <li>{t(`${p}.bulletExport`)}</li>
            </ul>
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
