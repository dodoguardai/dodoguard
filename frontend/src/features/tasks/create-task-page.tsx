/**
 * Create Task Page - Mode Selection
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Route } from '@/routes/_authenticated/tasks/create';
import { agentsApi } from '@/services/api/agents';
import { surfaceForTaskCreateFromAgentType } from '@/features/agents/surface-for-task-create';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Settings, ArrowLeft } from 'lucide-react';
import { ConfigurationModeWizard } from './components/configuration-mode-wizard';

export function CreateTaskPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { surface, agentId: initialAgentId } = Route.useSearch();
  const { data: initialAgent } = useQuery({
    queryKey: ['target-agents', initialAgentId, 'create-surface'],
    queryFn: () => agentsApi.get(initialAgentId!),
    enabled: Boolean(initialAgentId) && surface === 'all',
  });
  const effectiveSurface =
    initialAgent && surface === 'all'
      ? surfaceForTaskCreateFromAgentType(initialAgent.type)
      : surface;

  useEffect(() => {
    if (!initialAgentId || !initialAgent || surface !== 'all') {
      return;
    }
    const resolved = surfaceForTaskCreateFromAgentType(initialAgent.type);
    if (resolved !== 'all') {
      navigate({
        to: '/tasks/create',
        search: { surface: resolved, agentId: initialAgentId },
        replace: true,
      });
    }
  }, [initialAgent, initialAgentId, navigate, surface]);

  const isCoze = effectiveSurface === 'coze';
  const isFastgpt = effectiveSurface === 'fastgpt';
  const isN8n = effectiveSurface === 'n8n';
  const isTencentAdp = effectiveSurface === 'tencent-adp';
  const [selectedMode, setSelectedMode] = useState<'smart' | 'configuration' | null>(() =>
    initialAgentId ? 'configuration' : null,
  );

  const handleWizardCancel = () => {
    setSelectedMode(null);
  };

  const handleWizardSuccess = () => {
    navigate({
      to: '/tasks',
      search: {
        surface:
          effectiveSurface === 'coze'
            ? 'coze'
            : effectiveSurface === 'fastgpt'
              ? 'fastgpt'
              : effectiveSurface === 'n8n'
                ? 'n8n'
                : effectiveSurface === 'tencent-adp'
                  ? 'tencent-adp'
                  : 'all',
        status: 'all',
      },
    });
  };

  if (selectedMode === 'configuration') {
    return (
      <div className="container mx-auto py-8">
        <Button variant="ghost" onClick={() => setSelectedMode(null)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('pages.tasks.create.backToModeSelection')}
        </Button>
        <ConfigurationModeWizard
          surface={effectiveSurface}
          initialAgentId={initialAgentId}
          onSuccess={handleWizardSuccess}
          onCancel={handleWizardCancel}
          skipNavigateToTaskOnSuccess={
            effectiveSurface === 'coze' ||
            effectiveSurface === 'fastgpt' ||
            effectiveSurface === 'n8n' ||
            effectiveSurface === 'tencent-adp'
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {isTencentAdp
            ? '创建腾讯 ADP 安全测试任务'
            : isCoze
              ? t('pages.tasks.create.pageTitle.coze')
              : isFastgpt
                ? t('pages.tasks.create.pageTitle.fastgpt')
                : isN8n
                  ? t('pages.tasks.create.pageTitle.n8n')
                  : t('pages.tasks.create.pageTitle.dify')}
        </h1>
        <p className="text-muted-foreground mt-2">
          {isTencentAdp ? (
            <>
              对腾讯 ADP 智能体进行 API 黑盒安全测试。接入方式（SSE / WebSocket）由目标智能体配置决定。
            </>
          ) : isCoze ? (
            <>
              {t('pages.tasks.create.intro.cozeBefore')}
              <span className="font-medium text-foreground">
                {t('sidebar.item.cozeSecurityTesting')}
              </span>
              {t('pages.tasks.create.intro.cozeAfter')}
            </>
          ) : isFastgpt ? (
            <>
              {t('pages.tasks.create.intro.fastgptBefore')}
              <span className="font-medium text-foreground">
                {t('sidebar.item.fastgptSecurityTesting')}
              </span>
              {t('pages.tasks.create.intro.fastgptAfter')}
            </>
          ) : isN8n ? (
            <>
              {t('pages.tasks.create.intro.n8nBefore')}
              <span className="font-medium text-foreground">
                {t('sidebar.item.n8nSecurityTesting')}
              </span>
              {t('pages.tasks.create.intro.n8nAfter')}
            </>
          ) : (
            <>
              {t('pages.tasks.create.intro.difyBefore')}
              <span className="font-medium text-foreground">
                {t('sidebar.item.agentSecurityTesting')}
              </span>
              {t('pages.tasks.create.intro.difyAfter')}
            </>
          )}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Smart Mode Card */}
        <Card
          className="cursor-pointer hover:border-primary transition-colors h-full flex flex-col"
          onClick={() => setSelectedMode('configuration')}
        >
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>{t('pages.tasks.create.smartMode.title')}</CardTitle>
            </div>
            <CardDescription className="min-h-[3rem]">
              {isTencentAdp
                ? '快速创建腾讯 ADP API 黑盒测试任务，按向导完成配置即可。'
                : isCoze
                  ? t('pages.tasks.create.smartMode.descCoze')
                  : isFastgpt
                    ? t('pages.tasks.create.smartMode.descFastgpt')
                    : isN8n
                      ? t('pages.tasks.create.smartMode.descN8n')
                      : t('pages.tasks.create.smartMode.descDify')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-grow flex flex-col">
            <div className="space-y-2 text-sm text-muted-foreground flex-grow">
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>{t('pages.tasks.create.smartMode.bullet1')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>{t('pages.tasks.create.smartMode.bullet2')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>{t('pages.tasks.create.smartMode.bullet3')}</span>
              </div>
            </div>
            <Button className="w-full" onClick={() => setSelectedMode('configuration')}>
              {t('pages.tasks.create.smartMode.start')}
            </Button>
          </CardContent>
        </Card>

        {/* Configuration Mode Card */}
        <Card
          className="cursor-pointer hover:border-primary transition-colors h-full flex flex-col"
          onClick={() => setSelectedMode('configuration')}
        >
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Settings className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>{t('pages.tasks.create.configurationMode.title')}</CardTitle>
            </div>
            <CardDescription className="min-h-[3rem]">
              {isTencentAdp
                ? '分步配置腾讯 ADP API 黑盒测试的目标、漏洞与执行参数。'
                : isCoze
                  ? t('pages.tasks.create.configurationMode.descCoze')
                  : isFastgpt
                    ? t('pages.tasks.create.configurationMode.descFastgpt')
                    : isN8n
                      ? t('pages.tasks.create.configurationMode.descN8n')
                      : t('pages.tasks.create.configurationMode.descDify')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-grow flex flex-col">
            <div className="space-y-2 text-sm text-muted-foreground flex-grow">
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>{t('pages.tasks.create.configurationMode.bullet1')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>{t('pages.tasks.create.configurationMode.bullet2')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>{t('pages.tasks.create.configurationMode.bullet3')}</span>
              </div>
            </div>
            <Button className="w-full" onClick={() => setSelectedMode('configuration')}>
              {t('pages.tasks.create.configurationMode.start')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h3 className="text-sm font-semibold mb-2">{t('pages.tasks.create.comparison.title')}</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium mb-1">{t('pages.tasks.create.comparison.smartHeading')}</p>
            <p className="text-muted-foreground">
              {isTencentAdp
                ? '适合快速发起腾讯 ADP API 黑盒测试。'
                : isCoze
                  ? t('pages.tasks.create.comparison.smartCoze')
                  : isFastgpt
                    ? t('pages.tasks.create.comparison.smartFastgpt')
                    : isN8n
                      ? t('pages.tasks.create.comparison.smartN8n')
                      : t('pages.tasks.create.comparison.smartDify')}
            </p>
          </div>
          <div>
            <p className="font-medium mb-1">{t('pages.tasks.create.comparison.configHeading')}</p>
            <p className="text-muted-foreground">
              {isTencentAdp
                ? '可精细选择漏洞类型、攻击模式与检测策略。'
                : isCoze
                  ? t('pages.tasks.create.comparison.configCoze')
                  : isFastgpt
                    ? t('pages.tasks.create.comparison.configFastgpt')
                    : isN8n
                      ? t('pages.tasks.create.comparison.configN8n')
                      : t('pages.tasks.create.comparison.configDify')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
