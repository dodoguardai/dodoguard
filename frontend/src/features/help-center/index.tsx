import { BookOpen, Bug, Github, MessageCircleQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const DOC_URL = 'https://www.dodoguard.dev/docs';
const GITHUB_URL = 'https://github.com/dodoguard/dodoguard';
const ISSUES_URL = 'https://github.com/dodoguard/dodoguard/issues';
const SECURITY_URL = 'https://github.com/dodoguard/dodoguard/security/advisories/new';

export function HelpCenter() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('pages.helpCenter.title', 'Help & support')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            'pages.helpCenter.description',
            'Documentation, community support, and security reporting for DodoGuard.',
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4" />
              {t('pages.helpCenter.docsTitle', 'Documentation')}
            </CardTitle>
            <CardDescription>
              {t('pages.helpCenter.docsDescription', 'Guides for setup, agents, tasks, and findings.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <a href={DOC_URL} target="_blank" rel="noopener noreferrer">
                {t('pages.helpCenter.openDocs', 'Open documentation')}
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Github className="size-4" />
              {t('pages.helpCenter.communityTitle', 'Community')}
            </CardTitle>
            <CardDescription>
              {t('pages.helpCenter.communityDescription', 'Report bugs and discuss improvements on GitHub.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild variant="outline" className="w-full">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                {t('pages.helpCenter.viewRepo', 'View repository')}
              </a>
            </Button>
            <Button asChild variant="secondary" className="w-full">
              <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircleQuestion className="me-2 size-4" />
                {t('pages.helpCenter.openIssues', 'Open an issue')}
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bug className="size-4" />
              {t('pages.helpCenter.securityTitle', 'Security reports')}
            </CardTitle>
            <CardDescription>
              {t(
                'pages.helpCenter.securityDescription',
                'If you discover a vulnerability in DodoGuard itself, please report it responsibly.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href={SECURITY_URL} target="_blank" rel="noopener noreferrer">
                {t('pages.helpCenter.reportSecurity', 'Report a security issue')}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
