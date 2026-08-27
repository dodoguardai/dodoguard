/**
 * Roles Management Page
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeaturePageLayout } from '@/components/layout/feature-page-layout';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { rolesApi } from '@/services/api/roles';
import { toast } from 'sonner';
import { Plus, MoreHorizontal, Eye, Edit, Trash2, Shield, HelpCircle } from 'lucide-react';
import { CreateRoleDialog } from './components/create-role-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Roles({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const getPermissionsDisplay = (permissions: string[]): string => {
    if (!permissions?.length) return t('pages.roles.permissionsCountZero');
    if (permissions.includes('*')) return t('pages.roles.permissionsAll');
    return t('pages.roles.permissionsCount', { count: permissions.length });
  };

  const { data: rolesData, isLoading } = useQuery({
    queryKey: ['roles', searchTerm],
    queryFn: () => rolesApi.list({ search: searchTerm || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rolesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(t('pages.roles.deleted'));
    },
    onError: (error: any) => {
      toast.error(`${t('common.state.error')}: ${error?.message || 'Unknown error'}`);
    },
  });

  const roles = rolesData?.data || [];

  const handleDelete = (roleId: string, roleName: string) => {
    setDeleteTarget({ id: roleId, name: roleName });
  };

  const permissionsLink = (
    <Link to={userRoleManagementTabPath('permissions')} className="underline hover:text-foreground">
      {t('pages.roles.subtitleLink')}
    </Link>
  );

  const toolbarActions = (
    <>
      <Input
        placeholder={t('pages.roles.searchPlaceholder')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-64"
      />
      <Button onClick={() => setCreateDialogOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        {t('pages.roles.create')}
      </Button>
    </>
  );

  return (
    <FeaturePageLayout
      embedded={embedded}
      title={t('pages.roles.title')}
      subtitle={
        <>
          {t('pages.roles.subtitlePrefix')} {permissionsLink} {t('pages.roles.subtitleSuffix')}
        </>
      }
      actions={toolbarActions}
    >
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.actions.name')}</TableHead>
                <TableHead>{t('common.actions.type')}</TableHead>
                <TableHead>{t('pages.roles.table.permissions')}</TableHead>
                <TableHead>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help items-center gap-1">
                        {t('common.actions.default')}
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      {t('pages.roles.table.defaultHelp')}
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">{t('common.actions.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('pages.roles.table.noRoles')}
                  </TableCell>
                </TableRow>
              ) : (
                roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell>
                      <Badge variant={role.type === 'system' ? 'default' : 'secondary'}>
                        {role.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <Shield className="mr-1 h-3 w-3" />
                        {getPermissionsDisplay(role.permissions)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {role.isDefault ? (
                        <Badge variant="default">{t('common.actions.default')}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{t('common.actions.actions')}</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => navigate({ to: `/roles/${role.id}` })}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t('common.actions.viewDetails')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              role.type === 'custom'
                                ? navigate({ to: `/roles/${role.id}?edit=true` })
                                : undefined
                            }
                            disabled={role.type === 'system'}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            {t('common.actions.edit')}
                            {role.type === 'system' && (
                              <span className="ml-1 text-muted-foreground">
                                {t('pages.roles.table.systemReadOnly')}
                              </span>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              role.type === 'custom' ? handleDelete(role.id, role.name) : undefined
                            }
                            disabled={role.type === 'system'}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('common.actions.delete')}
                            {role.type === 'system' && (
                              <span className="ml-1 text-muted-foreground">
                                {t('pages.roles.table.systemCannotDelete')}
                              </span>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateRoleDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
        title={t('common.actions.delete')}
        desc={t('pages.roles.deleteConfirmShort', { name: deleteTarget?.name ?? '' })}
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
