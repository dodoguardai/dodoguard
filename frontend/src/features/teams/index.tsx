/**
 * Teams Management Page
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeaturePageError, FeaturePageLayout } from '@/components/layout/feature-page-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { teamsApi } from '@/services/api/teams';
import { toast } from 'sonner';
import {
  Plus,
  MoreHorizontal,
  Eye,
  Trash2,
  Users,
  AlertCircle,
  Building2,
  Monitor,
  Server,
  Bot,
  Cpu,
  Database,
  Globe,
  Zap,
  Code,
  Cloud,
  Shield,
  Wrench,
  Settings,
  Lock,
  Activity,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import type { Team } from '@/types/entities';
import type { PaginatedResponse } from '@/types/api';
import { CreateTeamDialog } from './components/create-team-dialog';
import { Pagination } from '@/components/ui/pagination';

export function Teams({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['teams', searchTerm, currentPage, pageSize],
    queryFn: () => {
      const offset = (currentPage - 1) * pageSize;
      return teamsApi.list({
        search: searchTerm || undefined,
        limit: pageSize,
        offset: offset,
      });
    },
    retry: 1,
  });

  useEffect(() => {
    if (error) {
      console.error('Failed to load teams:', error);
      toast.error(
        `${t('pages.teams.loadErrorTitle')}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }, [error]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => teamsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success(t('pages.teams.deleteSuccess'));
    },
    onError: (error: any) => {
      toast.error(`${t('common.state.error')}: ${error?.message || 'Unknown error'}`);
    },
  });

  const handleDelete = (team: Team) => {
    setDeleteTarget(team);
  };

  // Safely access teams data and pagination info
  const isPaginated =
    data && typeof data === 'object' && data !== null && 'data' in data && 'total' in data;
  const teams =
    isPaginated && Array.isArray((data as PaginatedResponse<Team>).data)
      ? (data as PaginatedResponse<Team>).data
      : Array.isArray(data)
        ? data
        : [];
  const total =
    isPaginated && typeof (data as PaginatedResponse<Team>).total === 'number'
      ? (data as PaginatedResponse<Team>).total
      : teams.length;

  const totalPages = Math.ceil(total / pageSize);

  // Handle error state
  const toolbarActions = (
    <>
      <Input
        placeholder={t('pages.teams.searchPlaceholder')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-64"
      />
      <Button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setCreateDialogOpen(true);
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t('pages.teams.add')}
      </Button>
    </>
  );

  if (error) {
    return (
      <FeaturePageError embedded={embedded}>
        <div className="flex flex-col items-center justify-center py-10 space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Failed to load teams</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['teams'] })}>
              {t('common.actions.retry')}
            </Button>
          </div>
        </div>
      </FeaturePageError>
    );
  }

  return (
    <FeaturePageLayout
      embedded={embedded}
      title={t('pages.teams.title')}
      subtitle={t('pages.teams.subtitle')}
      actions={toolbarActions}
    >
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
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold mb-2">{t('pages.teams.emptyTitle')}</p>
            <p className="text-sm text-muted-foreground mb-4">{t('pages.teams.emptySubtitle')}</p>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCreateDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('pages.teams.add')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => {
              // Icon mapping - default to Users if not specified
              const iconMap: Record<string, LucideIcon> = {
                Users,
                Building2,
                Monitor,
                Server,
                Bot,
                Cpu,
                Database,
                Globe,
                Zap,
                Code,
                Cloud,
                Shield,
                Wrench,
                Settings,
                Lock,
                Activity,
                AlertTriangle,
              };

              // Check if logo is a custom image (base64 or URL)
              const isCustomImage =
                team.logo &&
                (team.logo.startsWith('data:image/') ||
                  team.logo.startsWith('http://') ||
                  team.logo.startsWith('https://'));

              // Get icon from team.logo, default to Users
              const iconName = team.logo || 'Users';
              const IconComponent = iconMap[iconName] || Users;

              return (
                <Card key={team.id} className="flex flex-col hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
                          {isCustomImage ? (
                            <img
                              src={team.logo}
                              alt={`${team.name} logo`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <IconComponent className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{team.name}</CardTitle>
                          {team.organization && (
                            <CardDescription className="mt-1 flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {team.organization.name}
                            </CardDescription>
                          )}
                          {team.description && (
                            <CardDescription className="mt-1 line-clamp-2">
                              {team.description}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{t('common.actions.actions')}</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => navigate({ to: `/teams/${team.id}` })}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t('common.actions.viewDetails')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(team)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('common.actions.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="space-y-3">
                      {team.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {team.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm">
                        {team.memberCount !== undefined && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>
                              {t('pages.teams.membersCount', { count: team.memberCount })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                      {t('pages.teams.created', {
                        date: new Date(team.createdAt).toLocaleDateString(),
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate({ to: `/teams/${team.id}` })}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('common.actions.view')}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {teams.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              total={total}
              itemLabels={{
                singular: t('sidebar.item.teams'),
                plural: t('sidebar.item.teams'),
              }}
            />
          )}
        </>
      )}

      <CreateTeamDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
        title={t('common.actions.delete')}
        desc={t('pages.teams.deleteConfirm', { name: deleteTarget?.name ?? '' })}
        cancelBtnText={t('common.actions.cancel')}
        confirmText={
          deleteMutation.isPending ? t('common.state.loading') : t('common.actions.delete')
        }
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, {
              onSettled: () => setDeleteTarget(null),
            });
          }
        }}
      />
    </FeaturePageLayout>
  );
}
