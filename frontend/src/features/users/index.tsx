/**
 * Users Management Page - Based on Agents page structure
 */

import { useState } from 'react';
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
import { usersApi } from '@/services/api/users';
import { rolesApi } from '@/services/api/roles';
import { toast } from 'sonner';
import {
  Plus,
  MoreHorizontal,
  Eye,
  Trash2,
  Users as UsersIcon,
  AlertCircle,
  User,
  Mail,
  Shield,
} from 'lucide-react';
import type { User as UserType } from '@/types/entities';
import { Pagination } from '@/components/ui/pagination';
import { CreateUserDialog } from './components/create-user-dialog';

export function Users({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserType | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(12);

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.list({ limit: 200 }),
  });
  const roles = rolesData?.data ?? [];
  const roleNameByKey = new Map<string, string>();
  for (const r of roles) {
    roleNameByKey.set(r.id, r.name);
    roleNameByKey.set(r.name, r.name);
  }
  const getRoleDisplayName = (roleValue: string | string[] | undefined): string => {
    const raw = typeof roleValue === 'string' ? roleValue : roleValue?.[0];
    if (!raw) return 'member';
    return roleNameByKey.get(raw) ?? raw;
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', searchTerm, currentPage, pageSize],
    queryFn: () => {
      const offset = (currentPage - 1) * pageSize;
      return usersApi.list({
        search: searchTerm || undefined,
        limit: pageSize,
        offset: offset,
      });
    },
    retry: 1,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('pages.users.deleteSuccess'));
    },
    onError: (error: Error) => {
      toast.error(`${t('common.state.error')}: ${error?.message || 'Unknown error'}`);
    },
  });

  const handleDelete = (user: UserType) => {
    setDeleteTarget(user);
  };

  // Safely access users data and pagination info
  const users =
    data && data.data && Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];

  const total = data && typeof data.total === 'number' ? data.total : users.length;

  const totalPages = Math.ceil(total / pageSize);

  // Handle error state
  const toolbarActions = (
    <>
      <Input
        placeholder={t('pages.users.searchPlaceholder')}
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
        {t('pages.users.add')}
      </Button>
    </>
  );

  if (error) {
    return (
      <FeaturePageError embedded={embedded}>
        <div className="flex flex-col items-center justify-center py-10 space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Failed to load users</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['users'] })}>
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
      title={t('pages.users.title')}
      subtitle={t('pages.users.subtitle')}
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
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UsersIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold mb-2">{t('pages.users.emptyTitle')}</p>
            <p className="text-sm text-muted-foreground mb-4">{t('pages.users.emptySubtitle')}</p>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCreateDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('pages.users.add')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => {
              return (
                <Card key={user.id} className="flex flex-col hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
                          {user.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user.name}
                              className="h-full w-full rounded-full object-cover"
                            />
                          ) : (
                            <User className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{user.name}</CardTitle>
                          <CardDescription className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </CardDescription>
                          {user.teams && user.teams.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <UsersIcon className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {t('pages.users.teamsCount', { count: user.teams.length })}
                              </span>
                            </div>
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
                          <DropdownMenuItem
                            onClick={() => navigate({ to: `/users/${String(user.id)}` })}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            {t('common.actions.viewDetails')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(user);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('common.actions.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t('common.actions.role')}
                        </span>
                        <Badge variant="secondary">{getRoleDisplayName(user.role)}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t('common.actions.status')}
                        </span>
                        <Badge
                          variant={
                            user.status === 'active'
                              ? 'default'
                              : user.status === 'suspended'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {user.status}
                        </Badge>
                      </div>
                      {user.emailVerified && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Shield className="h-3 w-3" />
                          {t('pages.users.emailVerified')}
                        </div>
                      )}
                      {(() => {
                        const hasTeams =
                          user.teams && Array.isArray(user.teams) && user.teams.length > 0;
                        return hasTeams ? (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <UsersIcon className="h-3 w-3" />
                              {t('common.actions.teams')}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {(user.teams.slice(0, 2) as { id: string; name?: string }[]).map(
                                (team) => (
                                  <Badge key={team.id} variant="outline" className="text-xs">
                                    {team.name || team.id}
                                  </Badge>
                                ),
                              )}
                              {user.teams.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{user.teams.length - 2}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => navigate({ to: `/users/${String(user.id)}` })}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('common.actions.viewDetails')}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              total={total}
              onPageChange={setCurrentPage}
              onPageSizeChange={() => {}}
              itemLabels={{
                singular: t('sidebar.item.users'),
                plural: t('sidebar.item.users'),
              }}
            />
          )}
        </>
      )}

      <CreateUserDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
        title={t('common.actions.delete')}
        desc={t('pages.users.deleteConfirmShort', { name: deleteTarget?.name ?? '' })}
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
