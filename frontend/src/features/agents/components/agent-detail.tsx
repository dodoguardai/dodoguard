/**
 * Agent Detail Page Component
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { agentsApi } from '@/services/api/agents';
import { AgentForm, type AgentFormValues } from './agent-form';
import { surfaceForTaskCreateFromAgentType } from '../surface-for-task-create';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Edit,
  X,
  TestTube,
  History,
  Play,
  Monitor,
  Server,
  Bot,
  Cpu,
  Database,
  Globe,
  Zap,
  Code,
  Cloud,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  Loader2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { useRef, useState } from 'react';
import {
  buildAgentUpdatePayload,
  cleanAgentConfigFromForm,
} from '../clean-agent-form-config';
import type { AgentFormHandle } from './agent-form';

interface AgentDetailProps {
  agentId: string;
  initialTab?: 'overview' | 'configuration' | 'statistics' | 'history';
  edit?: string;
}

export function AgentDetail({ agentId, initialTab, edit }: AgentDetailProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(() => edit === 'true');
  const agentFormRef = useRef<AgentFormHandle>(null);
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const { data, isLoading, error } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => agentsApi.get(agentId),
    retry: 1,
  });

  const { data: attackHistory } = useQuery({
    queryKey: ['agent', agentId, 'attacks'],
    queryFn: () => agentsApi.getAttackHistory(agentId),
    enabled: !!agentId,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AgentFormValues> }) => {
      console.log('Update mutation called with:', { id, data });
      try {
        const result = await agentsApi.update(id, data);
        console.log('Update API call successful:', result);
        return result;
      } catch (apiError: any) {
        console.error('Update API call failed:', apiError);
        throw apiError;
      }
    },
    onSuccess: () => {
      console.log('Update mutation onSuccess called');
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(tr('Agent updated successfully', '智能体更新成功'));
      setIsEditing(false);
    },
    onError: (error: any) => {
      console.error('Update agent mutation error:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        stack: error?.stack,
      });

      let errorMessage = tr('Failed to update agent', '更新智能体失败');
      if (error?.response?.data) {
        const errorData = error.response.data;
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage =
            typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
      // Ensure editing state is reset even on error
      setIsEditing(false);
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: (payload: { id: string; draftConfig?: Record<string, unknown> }) => {
      return agentsApi.testConnection(
        payload.id,
        payload.draftConfig ? { config: payload.draftConfig } : undefined,
      );
    },
    onSuccess: (result, variables) => {
      if (result.status === 'success') {
        if (result.autoCorrectedResponseMode === 'streaming') {
          agentFormRef.current?.setResponseMode('streaming');
          queryClient.invalidateQueries({ queryKey: ['agents', agentId] });
        }
        const usedDraft = Boolean(variables.draftConfig);
        if (result.autoCorrectedResponseMode === 'streaming') {
          toast.success(
            tr(
              'Connection test successful. Response mode auto-corrected to streaming and saved.',
              '连接测试成功。检测到应用仅支持 streaming，已自动将响应模式更正为「流式」并保存。',
            ),
          );
        } else {
          toast.success(
            usedDraft
              ? tr(
                  'Connection test successful (using current form settings)',
                  '连接测试成功（使用当前表单配置，尚未保存）',
                )
              : tr('Connection test successful', '连接测试成功'),
          );
        }
      } else {
        toast.error(
          `${tr('Connection test failed', '连接测试失败')}: ${result.message || tr('Unknown error', '未知错误')}`,
        );
      }
    },
    onError: (error: any) => {
      console.error('Test connection error:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });

      let errorMessage = tr('Connection test error', '连接测试异常');
      if (error?.response?.data) {
        const errorData = error.response.data;
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage =
            typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    },
  });

  const agent = data;

  if (isLoading) {
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
        <Main>
          <Skeleton className="h-96 w-full" />
        </Main>
      </>
    );
  }

  if (!isLoading && !agent) {
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
        <Main>
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">{tr('Agent not found', '未找到智能体')}</h2>
              <p className="text-muted-foreground mb-4">
                {tr(`The agent with ID "${agentId}" could not be found.`, `ID 为 "${agentId}" 的智能体不存在。`)}
              </p>
              {error && (
                <p className="text-sm text-destructive mb-4">
                  {tr('Error', '错误')}: {error instanceof Error ? error.message : tr('Unknown error', '未知错误')}
                </p>
              )}
              <Button variant="outline" onClick={() => navigate({ to: '/agents' })}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {tr('Back to Agents', '返回智能体列表')}
              </Button>
            </div>
          </div>
        </Main>
      </>
    );
  }

  if (!agent) return null;

  const handleSubmit = async (values: AgentFormValues) => {
    try {
      const cleanData = buildAgentUpdatePayload(values);

      if (
        !cleanData.config?.apiBaseUrl ||
        (typeof cleanData.config.apiBaseUrl === 'string' &&
          cleanData.config.apiBaseUrl.trim() === '')
      ) {
        toast.error(tr('API Base URL is required', 'API Base URL 为必填项'));
        return;
      }

      await updateMutation.mutateAsync({
        id: agentId,
        data: cleanData,
      });
    } catch (error: unknown) {
      if (!error || typeof error !== 'object' || !('response' in error)) {
        console.warn('Update agent error in handleSubmit:', error);
      }
    }
  };

  const handleTestConnection = () => {
    let draftConfig: Record<string, unknown> | undefined;
    if (isEditing && agentFormRef.current) {
      const formValues = agentFormRef.current.getValues();
      draftConfig = cleanAgentConfigFromForm(formValues);
      if (
        !draftConfig.apiBaseUrl ||
        (typeof draftConfig.apiBaseUrl === 'string' && draftConfig.apiBaseUrl.trim() === '')
      ) {
        toast.error(tr('API Base URL is required', 'API Base URL 为必填项'));
        return;
      }
    }
    testConnectionMutation.mutate({ id: agentId, draftConfig });
  };

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
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/agents' })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tr('Back', '返回')}
          </Button>
          <div className="flex items-center gap-3 flex-1">
            {/* Icon */}
            {(() => {
              const iconMap: Record<string, LucideIcon> = {
                Monitor,
                Server,
                Bot,
                Cpu,
                Database,
                Globe,
                Zap,
                Code,
                Cloud,
              };
              const iconName = agent.icon || 'Monitor';
              const IconComponent = iconMap[iconName] || Monitor;
              return (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <IconComponent className="h-6 w-6 text-primary" />
                </div>
              );
            })()}
            <div className="flex-1">
              <h2 className="text-2xl font-bold tracking-tight">{agent.name}</h2>
              <p className="text-muted-foreground">{agent.description || tr('No description', '暂无描述')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleTestConnection();
              }}
              disabled={testConnectionMutation.isPending}
            >
              {testConnectionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tr('Testing...', '测试中...')}
                </>
              ) : (
                <>
                  <TestTube className="mr-2 h-4 w-4" />
                  {tr('Test Connection', '测试连接')}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                navigate({
                  to: '/tasks/create',
                  search: {
                    surface: surfaceForTaskCreateFromAgentType(agent.type),
                    agentId,
                  },
                })
              }
            >
              <Play className="mr-2 h-4 w-4" />
              {tr('Create Attack Task', '创建攻击任务')}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                navigate({
                  to: '/agents/$agentId/workflow-config-assets',
                  params: { agentId },
                })
              }
            >
              <Workflow className="mr-2 h-4 w-4" />
              {t('sidebar.item.workflowConfigAssets')}
            </Button>
            {!isEditing && (
              <Button
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Edit button clicked, setting isEditing to true');
                  setIsEditing(true);
                  // Editing 表单只在 overview 渲染；进入编辑态时同步切回 overview
                  navigate({
                    to: '/agents/$agentId',
                    params: { agentId },
                    search: {
                      tab: 'overview',
                    },
                  });
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                {tr('Edit', '编辑')}
              </Button>
            )}
          </div>
        </div>

        <Tabs
          value={isEditing ? 'overview' : (initialTab ?? 'overview')}
          onValueChange={(value) =>
            isEditing
              ? navigate({
                  to: '/agents/$agentId',
                  params: { agentId },
                  search: { tab: 'overview' },
                })
              : navigate({
                  to: '/agents/$agentId',
                  params: { agentId },
                  search: {
                    tab: value as 'overview' | 'configuration' | 'statistics' | 'history',
                  },
                })
          }
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="overview">{tr('Overview', '概览')}</TabsTrigger>
            <TabsTrigger value="configuration">{tr('Configuration', '配置')}</TabsTrigger>
            <TabsTrigger value="statistics">{tr('Statistics', '统计')}</TabsTrigger>
            <TabsTrigger value="history">{tr('Attack History', '攻击历史')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {isEditing ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{tr('Edit Agent', '编辑智能体')}</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <AgentForm
                    ref={agentFormRef}
                    agent={agent}
                    onSubmit={handleSubmit}
                    onCancel={() => setIsEditing(false)}
                    isLoading={updateMutation.isPending}
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{tr('Basic Information', '基础信息')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Name', '名称')}</p>
                      <p className="font-medium">{agent.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Description', '描述')}</p>
                      <p className="font-medium">{agent.description || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Type', '类型')}</p>
                      <Badge variant="outline" className="capitalize">
                        {agent.type}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Icon', '图标')}</p>
                      <Badge variant="outline">{agent.icon || 'Monitor'}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Status', '状态')}</p>
                      <Badge
                        variant={
                          agent.status === 'active'
                            ? 'default'
                            : agent.status === 'error'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="flex items-center gap-1 w-fit"
                      >
                        {agent.status === 'active' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : agent.status === 'error' ? (
                          <XCircle className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {agent.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Created At', '创建时间')}</p>
                      <p className="font-medium">
                        {format(new Date(agent.createdAt), 'MMM dd, yyyy HH:mm:ss')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Updated At', '更新时间')}</p>
                      <p className="font-medium">
                        {format(new Date(agent.updatedAt), 'MMM dd, yyyy HH:mm:ss')}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{tr('Health Status', '健康状态')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {agent.healthStatus ? (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">{tr('Status', '状态')}</p>
                          <Badge
                            variant={
                              agent.healthStatus.status === 'healthy' ? 'default' : 'destructive'
                            }
                            className="flex items-center gap-1 w-fit"
                          >
                            <Activity className="h-3 w-3" />
                            {agent.healthStatus.status}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{tr('Last Check', '最近检查')}</p>
                          <p className="font-medium">
                            {format(
                              new Date(agent.healthStatus.lastCheck),
                              'MMM dd, yyyy HH:mm:ss',
                            )}
                          </p>
                        </div>
                        {agent.healthStatus.responseTime && (
                          <div>
                            <p className="text-sm text-muted-foreground">{tr('Response Time', '响应时间')}</p>
                            <p className="font-medium">{agent.healthStatus.responseTime}ms</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{tr('No health data available', '暂无健康数据')}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="configuration" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{tr('Configuration', '配置')}</CardTitle>
                <CardDescription>{tr('Agent connection configuration', '智能体连接配置')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">API Base URL</p>
                  <p className="font-mono text-sm bg-muted p-2 rounded">
                    {String(agent.config.apiBaseUrl || '-')}
                  </p>
                </div>
                {Boolean(agent.config.apiKey) && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">API Key</p>
                    <p className="font-mono text-sm bg-muted p-2 rounded">
                      {typeof agent.config.apiKey === 'string'
                        ? agent.config.apiKey.length > 20
                          ? `${agent.config.apiKey.substring(0, 20)}...`
                          : String(agent.config.apiKey)
                        : '***'}
                    </p>
                  </div>
                )}
                {agent.type === 'dify' && (
                  <>
                    {agent.config.userId && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">User ID</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {String(agent.config.userId)}
                        </p>
                      </div>
                    )}
                    {agent.config.conversationId && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Conversation ID</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {String(agent.config.conversationId)}
                        </p>
                      </div>
                    )}
                    {agent.config.responseMode && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Response Mode</p>
                        <Badge variant="outline">{String(agent.config.responseMode)}</Badge>
                      </div>
                    )}
                    {agent.config.inputs && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Custom Inputs</p>
                        <pre className="font-mono text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                          {typeof agent.config.inputs === 'string'
                            ? agent.config.inputs
                            : JSON.stringify(agent.config.inputs, null, 2)}
                        </pre>
                      </div>
                    )}
                    {agent.config.files && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Files</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {Array.isArray(agent.config.files)
                            ? agent.config.files.join(', ')
                            : String(agent.config.files)}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {agent.type === 'fastgpt' && (
                  <>
                    {agent.config.userId && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">User ID</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {String(agent.config.userId)}
                        </p>
                      </div>
                    )}
                    {agent.config.conversationId && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Chat ID</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {String(agent.config.conversationId)}
                        </p>
                      </div>
                    )}
                    {agent.config.inputs && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Variables</p>
                        <pre className="font-mono text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                          {typeof agent.config.inputs === 'string'
                            ? agent.config.inputs
                            : JSON.stringify(agent.config.inputs, null, 2)}
                        </pre>
                      </div>
                    )}
                  </>
                )}
                {agent.type === 'tencent-adp' && (
                  <>
                    {agent.config.transportMode && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">接入方式</p>
                        <Badge variant="outline">{String(agent.config.transportMode).toUpperCase()}</Badge>
                      </div>
                    )}
                    {agent.config.userId && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">VisitorId</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {String(agent.config.userId)}
                        </p>
                      </div>
                    )}
                    {agent.config.conversationId && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">ConversationId</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {String(agent.config.conversationId)}
                        </p>
                      </div>
                    )}
                    {agent.config.tencentRegion && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Region</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {String(agent.config.tencentRegion)}
                        </p>
                      </div>
                    )}
                    {Boolean(agent.config.tencentSecretId) && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">SecretId</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">***</p>
                      </div>
                    )}
                  </>
                )}
                {agent.type === 'n8n' && (
                  <>
                    {agent.config.webhookPath && (
                      <div>
                        <p className='text-sm text-muted-foreground mb-1'>Webhook Path</p>
                        <p className='font-mono text-sm bg-muted p-2 rounded'>{String(agent.config.webhookPath)}</p>
                      </div>
                    )}
                    {agent.config.n8nApiKeyHeaderName && (
                      <div>
                        <p className='text-sm text-muted-foreground mb-1'>API Key Header</p>
                        <Badge variant='outline'>{String(agent.config.n8nApiKeyHeaderName)}</Badge>
                      </div>
                    )}
                    {agent.config.n8nApiKeyPrefix !== undefined && (
                      <div>
                        <p className='text-sm text-muted-foreground mb-1'>API Key Prefix</p>
                        <p className='font-mono text-sm bg-muted p-2 rounded'>
                          {String(agent.config.n8nApiKeyPrefix) || '(empty)'}
                        </p>
                      </div>
                    )}
                    {agent.config.n8nRequestBodyMode && (
                      <div>
                        <p className='text-sm text-muted-foreground mb-1'>Request Body Mode</p>
                        <Badge variant='outline'>{String(agent.config.n8nRequestBodyMode)}</Badge>
                      </div>
                    )}
                    {agent.config.n8nQueryFieldName && (
                      <div>
                        <p className='text-sm text-muted-foreground mb-1'>Query Field Name</p>
                        <Badge variant='outline'>{String(agent.config.n8nQueryFieldName)}</Badge>
                      </div>
                    )}
                    {agent.config.userId && (
                      <div>
                        <p className='text-sm text-muted-foreground mb-1'>User ID</p>
                        <p className='font-mono text-sm bg-muted p-2 rounded'>{String(agent.config.userId)}</p>
                      </div>
                    )}
                    {agent.config.conversationId && (
                      <div>
                        <p className='text-sm text-muted-foreground mb-1'>Conversation ID</p>
                        <p className='font-mono text-sm bg-muted p-2 rounded'>{String(agent.config.conversationId)}</p>
                      </div>
                    )}
                    {agent.config.inputs && (
                      <div>
                        <p className='text-sm text-muted-foreground mb-1'>Custom Inputs</p>
                        <pre className='font-mono text-xs bg-muted p-2 rounded overflow-auto max-h-40'>
                          {typeof agent.config.inputs === 'string'
                            ? agent.config.inputs
                            : JSON.stringify(agent.config.inputs, null, 2)}
                        </pre>
                      </div>
                    )}
                  </>
                )}
                {Boolean(agent.config.authType) && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Auth Type</p>
                    <Badge variant="outline">{String(agent.config.authType)}</Badge>
                  </div>
                )}
                {agent.metadata && Object.keys(agent.metadata).length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Metadata</p>
                    <pre className="font-mono text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                      {JSON.stringify(agent.metadata, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Full Configuration (JSON)</p>
                  <pre className="font-mono text-xs bg-muted p-2 rounded overflow-auto max-h-60">
                    {JSON.stringify(agent.config, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="statistics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{tr('Statistics', '统计')}</CardTitle>
                <CardDescription>{tr('Agent usage and attack statistics', '智能体使用与攻击统计')}</CardDescription>
              </CardHeader>
              <CardContent>
                {agent.statistics ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Total Attacks', '攻击总数')}</p>
                      <p className="text-2xl font-bold">
                        {Number(agent.statistics.totalAttacks) || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Successful Attacks', '成功攻击')}</p>
                      <p className="text-2xl font-bold">
                        {Number(agent.statistics.successfulAttacks) || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tr('Vulnerabilities Found', '发现漏洞')}</p>
                      <p className="text-2xl font-bold">
                        {String(
                          Number(
                            (agent.statistics as { vulnerabilitiesFound?: number })
                              ?.vulnerabilitiesFound,
                          ) || 0,
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{tr('No statistics available', '暂无统计数据')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{tr('Attack History', '攻击历史')}</CardTitle>
                <CardDescription>{tr('Recent attack tasks for this agent', '该智能体最近的攻击任务')}</CardDescription>
              </CardHeader>
              <CardContent>
                {attackHistory?.data && attackHistory.data.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tr('Task Name', '任务名称')}</TableHead>
                        <TableHead>{tr('Status', '状态')}</TableHead>
                        <TableHead>{tr('Vulnerabilities', '漏洞')}</TableHead>
                        <TableHead>{tr('Start Time', '开始时间')}</TableHead>
                        <TableHead>{tr('Duration', '耗时')}</TableHead>
                        <TableHead>{tr('Actions', '操作')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attackHistory.data.map((history) => (
                        <TableRow
                          key={history.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() =>
                            navigate({
                              to: `/tasks/${history.taskId}`,
                            })
                          }
                        >
                          <TableCell className="font-medium">{history.taskName}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                history.status === 'completed'
                                  ? 'default'
                                  : history.status === 'failed'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              {history.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {history.vulnerabilitiesFound?.length || 0} {tr('found', '个')}
                          </TableCell>
                          <TableCell>
                            {format(new Date(history.startTime), 'MMM dd, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            {history.duration
                              ? `${Math.floor(history.duration / 60)}m ${history.duration % 60}s`
                              : '-'}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate({
                                  to: `/tasks/${history.taskId}`,
                                });
                              }}
                            >
                              <History className="mr-2 h-4 w-4" />
                              {tr('View Task', '查看任务')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">{tr('No attack history available', '暂无攻击历史')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
