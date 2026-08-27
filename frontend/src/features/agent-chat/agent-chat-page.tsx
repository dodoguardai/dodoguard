/**
 * Agent Chat — top-level IA entry; agent list supplied by System → Agent management.
 */

import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AgentChatPage() {
  const { t } = useTranslation();
  const p = 'pages.agentChat';

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
              <MessageSquare className="h-4 w-4" />
              {t(`${p}.shellTitle`)}
              <Badge variant="secondary">{t(`${p}.badge`)}</Badge>
            </CardTitle>
            <CardDescription>{t(`${p}.shellDescription`)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t(`${p}.iaNote`)}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to="/system/agents-mgmt">{t(`${p}.manageAgents`)}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/models">{t(`${p}.manageModels`)}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
