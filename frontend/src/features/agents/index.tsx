/**
 * Agents Management Page
 */

import { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { agentsApi } from '@/services/api/agents';
import { toast } from 'sonner';
import {
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  TestTube,
  History,
  Monitor,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Server,
  Bot,
  Cpu,
  Database,
  Globe,
  Zap,
  Code,
  Cloud,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import type { TargetAgent } from '@/types/entities';
import type { PaginatedResponse } from '@/types/api';
import { CreateAgentDialog } from './components/create-agent-dialog';
import { Pagination } from '@/components/ui/pagination';
import { surfaceForTaskCreateFromAgentType } from './surface-for-task-create';

export function Agents() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<TargetAgent['type'] | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<TargetAgent['status'] | 'all'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Reset to first page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, filterStatus]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['agents', searchTerm, filterType, filterStatus, currentPage, pageSize],
    queryFn: () => {
      const offset = (currentPage - 1) * pageSize;
      return agentsApi.list({
        search: searchTerm || undefined,
        type: filterType === 'all' ? undefined : filterType,
        status: filterStatus === 'all' ? undefined : filterStatus,
        limit: pageSize,
        offset: offset,
      });
    },
    retry: 1,
  });

  useEffect(() => {
    if (error) {
      console.error('Failed to load agents:', error);
      toast.error(
        `Failed to load agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }, [error]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent deleted successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete agent: ${error?.message || 'Unknown error'}`);
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: (id: string) => {
      setTestingAgentId(id);
      return agentsApi.testConnection(id);
    },
    onSuccess: (result) => {
      setTestingAgentId(null);
      if (result.status === 'success') {
        if (result.autoCorrectedResponseMode === 'streaming') {
          toast.success(
            'Connection test successful. Response mode auto-corrected to streaming and saved.',
          );
        } else {
          toast.success('Connection test successful');
        }
      } else {
        toast.error(`Connection test failed: ${result.message}`);
      }
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (error: any) => {
      setTestingAgentId(null);
      toast.error(`Connection test error: ${error?.message || 'Unknown error'}`);
    },
  });

  const handleDelete = (agent: TargetAgent) => {
    if (confirm(`Are you sure you want to delete "${agent.name}"?`)) {
      deleteMutation.mutate(agent.id);
    }
  };

  // Safely access agents data and pagination info
  const isPaginated =
    data && typeof data === 'object' && data !== null && 'data' in data && 'total' in data;
  const agents =
    isPaginated && Array.isArray((data as PaginatedResponse<TargetAgent>).data)
      ? (data as PaginatedResponse<TargetAgent>).data
      : Array.isArray(data)
        ? data
        : [];
  const total =
    isPaginated && typeof (data as PaginatedResponse<TargetAgent>).total === 'number'
      ? (data as PaginatedResponse<TargetAgent>).total
      : agents.length;

  const totalPages = Math.ceil(total / pageSize);

  // Handle error state
  if (error) {
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
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Failed to load agents</h2>
              <p className="text-muted-foreground mb-4">
                {error instanceof Error ? error.message : 'Unknown error occurred'}
              </p>
              <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['agents'] })}>
                Retry
              </Button>
            </div>
          </div>
        </Main>
      </>
    );
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

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('pages.agents.title')}</h2>
            <p className="text-muted-foreground">{t('pages.agents.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder={t('pages.agents.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-48 sm:w-56"
            />
            <Select
              value={filterType}
              onValueChange={(v) => setFilterType(v as TargetAgent['type'] | 'all')}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder={t('pages.agents.typePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('pages.agents.allTypes')}</SelectItem>
                <SelectItem value="dify">Dify</SelectItem>
                <SelectItem value="coze">Coze</SelectItem>
                <SelectItem value="n8n">N8N</SelectItem>
                <SelectItem value="fastgpt">FastGPT</SelectItem>
                <SelectItem value="tencent-adp">腾讯 ADP</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="api-stream">api-stream</SelectItem>
                <SelectItem value="langchain">LangChain</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterStatus}
              onValueChange={(v) => setFilterStatus(v as TargetAgent['status'] | 'all')}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder={t('pages.agents.statusPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('pages.agents.allStatus')}</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="testing">Testing</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCreateDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('pages.agents.add')}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-9 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-semibold mb-2">No agents found</p>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first agent to get started with security testing.
              </p>
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Add Agent button clicked (empty state), opening dialog');
                  setCreateDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Agent
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => {
              // Icon mapping - default to Monitor if not specified
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

              // Get icon from agent.icon, default to Monitor
              const iconName = agent.icon || 'Monitor';
              const IconComponent = iconMap[iconName] || Monitor;

              const isTesting = testingAgentId === agent.id;

              return (
                <Card
                  key={agent.id}
                  className={`flex flex-col hover:shadow-md transition-shadow cursor-pointer ${isTesting ? 'ring-2 ring-primary/20' : ''}`}
                  onClick={() =>
                    navigate({ to: '/agents/$agentId', params: { agentId: agent.id } })
                  }
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          {isTesting ? (
                            <Loader2 className="h-5 w-5 text-primary animate-spin" />
                          ) : (
                            <IconComponent className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg">{agent.name}</CardTitle>
                            {isTesting && (
                              <Badge variant="outline" className="text-xs">
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Testing
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="mt-1">{agent.type}</CardDescription>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => navigate({ to: `/agents/${agent.id}` })}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              navigate({
                                to: '/agents/$agentId',
                                params: { agentId: agent.id },
                                search: { tab: 'history' },
                              })
                            }
                          >
                            <History className="mr-2 h-4 w-4" />
                            Attack History
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              navigate({
                                to: '/tasks/create',
                                search: {
                                  surface: surfaceForTaskCreateFromAgentType(agent.type),
                                  agentId: agent.id,
                                },
                              })
                            }
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Create Attack Task
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => testConnectionMutation.mutate(agent.id)}
                            disabled={testingAgentId === agent.id}
                          >
                            {testingAgentId === agent.id ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Testing...
                              </>
                            ) : (
                              <>
                                <TestTube className="mr-2 h-4 w-4" />
                                Test Connection
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => navigate({ to: `/agents/${agent.id}?edit=true` })}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(agent)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          agent.status === 'active'
                            ? 'default'
                            : agent.status === 'error'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="flex items-center gap-1"
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
                      {agent.healthStatus && (
                        <Badge
                          variant={
                            agent.healthStatus.status === 'healthy' ? 'default' : 'destructive'
                          }
                          className="flex items-center gap-1"
                        >
                          <Activity className="h-3 w-3" />
                          {agent.healthStatus.status}
                        </Badge>
                      )}
                    </div>
                    {agent.statistics && (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div
                          className="flex items-center justify-between text-sm cursor-pointer rounded px-2 py-1 -mx-2 hover:bg-muted/60 transition-colors"
                          onClick={() =>
                            navigate({
                              to: '/agents/$agentId',
                              params: { agentId: agent.id },
                              search: { tab: 'history' },
                            })
                          }
                        >
                          <span className="text-muted-foreground">
                            {t('pages.dashboard.taskStatus.total')}
                          </span>
                          <span className="font-medium">{agent.statistics.totalAttacks || 0}</span>
                        </div>
                        <div
                          className="flex items-center justify-between text-sm cursor-pointer rounded px-2 py-1 -mx-2 hover:bg-muted/60 transition-colors"
                          onClick={() =>
                            navigate({
                              to: '/findings',
                              search: {
                                riskLevel: undefined,
                                status: undefined,
                                search: undefined,
                                page: 1,
                                agentId: agent.id,
                              },
                            })
                          }
                        >
                          <span className="text-muted-foreground">
                            {t('pages.dashboard.metrics.highRiskFindings')}
                          </span>
                          <span className="font-medium text-destructive">
                            {agent.statistics.vulnerabilitiesFound || 0}
                          </span>
                        </div>
                      </div>
                    )}
                    {agent.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {agent.description}
                      </p>
                    )}
                  </CardContent>
                  <CardFooter className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        navigate({ to: '/agents/$agentId', params: { agentId: agent.id } })
                      }
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        navigate({
                          to: '/tasks/create',
                          search: {
                            surface: surfaceForTaskCreateFromAgentType(agent.type),
                            agentId: agent.id,
                          },
                        })
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Attack
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination - Show if there are agents, even if only one page */}
        {!isLoading && agents.length > 0 && (
          <div className="mt-6">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              total={total}
              onPageChange={(page) => {
                setCurrentPage(page);
                // Scroll to top when page changes
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={(newPageSize) => {
                setPageSize(newPageSize);
                setCurrentPage(1); // Reset to first page when page size changes
              }}
            />
          </div>
        )}

        <CreateAgentDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      </Main>
    </>
  );
}
