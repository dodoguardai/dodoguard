/**
 * Managed agents — system IA (quick Q&A vs reasoning agents for Agent Chat).
 */

import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
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

export function SystemAgentsMgmtPage() {
  const { t } = useTranslation();
  const p = 'pages.systemMgmt.agentsMgmt';

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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t(`${p}.title`)}</h2>
            <p className="text-muted-foreground">{t(`${p}.description`)}</p>
          </div>
          <Button disabled>{t(`${p}.create`)}</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t(`${p}.quickQaTitle`)}</CardTitle>
              <CardDescription>{t(`${p}.quickQaDescription`)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">{t(`${p}.typeQuickQa`)}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t(`${p}.reasoningTitle`)}</CardTitle>
              <CardDescription>{t(`${p}.reasoningDescription`)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge>{t(`${p}.typeReasoning`)}</Badge>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              {t(`${p}.iaTitle`)}
              <Badge variant="secondary">{t(`${p}.badge`)}</Badge>
            </CardTitle>
            <CardDescription>{t(`${p}.iaDescription`)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>{t(`${p}.bulletModels`)}</li>
              <li>{t(`${p}.bulletSkills`)}</li>
              <li>{t(`${p}.bulletChat`)}</li>
            </ul>
            <Button variant="outline" asChild>
              <Link to="/agent-chat">{t(`${p}.goChat`)}</Link>
            </Button>
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
