/**
 * Permissions catalog — product-aligned labels over stable permission keys.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FeaturePageLayout } from '@/components/layout/feature-page-layout';
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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { permissionsApi } from '@/services/api/permissions';
import { toast } from 'sonner';
import { Key, RefreshCw, Search as SearchIcon } from 'lucide-react';
import type { Permission } from '@/types/entities';

/** Display order aligned with product modules (sidebar groups). */
const RESOURCE_ORDER = [
  'dashboard',
  'agent',
  'task',
  'vulnerability',
  'report',
  'audit',
  'organization',
  'team',
  'user',
  'subscription',
  'system',
  'other',
] as const;

export function Permissions({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const labelResource = useCallback(
    (resource: string | null | undefined) => {
      const key = resource || 'other';
      return t(`pages.permissions.resource.${key}`, { defaultValue: key });
    },
    [t],
  );

  const labelAction = useCallback(
    (action: string | null | undefined) => {
      if (!action) return '-';
      return t(`pages.permissions.action.${action}`, { defaultValue: action });
    },
    [t],
  );

  const labelScope = useCallback(
    (scope: string | null | undefined) => {
      if (!scope) return '-';
      return t(`pages.permissions.scope.${scope}`, { defaultValue: scope });
    },
    [t],
  );

  const labelDescription = useCallback(
    (perm: Permission) => {
      const resource = perm.resource || perm.name.split(':')[0];
      const action = perm.action || perm.name.split(':')[1];
      if (resource && action) {
        return t(`pages.permissions.desc.${resource}.${action}`, {
          defaultValue: perm.description || '-',
        });
      }
      return perm.description || '-';
    },
    [t],
  );

  const {
    data: permissions,
    isLoading,
    error,
    refetch,
  } = useQuery<Permission[], Error>({
    queryKey: ['permissions'],
    queryFn: async () => {
      const result = await permissionsApi.list();
      if (!result || !Array.isArray(result)) return [];
      return result;
    },
  });

  useEffect(() => {
    if (error) {
      toast.error(
        t('pages.permissions.loadErrorToast', {
          message: error.message ?? 'Unknown error',
        }),
      );
    }
  }, [error, t]);

  const seedMutation = useMutation({
    mutationFn: () => permissionsApi.seed(),
    onSuccess: (data) => {
      const errorsPart =
        data.errors > 0 ? t('pages.permissions.seedErrorsPart', { count: data.errors }) : '';
      toast.success(
        t('pages.permissions.seedSuccess', {
          inserted: data.inserted,
          updated: data.updated ?? 0,
          skipped: data.skipped,
          errorsPart,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      refetch();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg = e?.response?.data?.error?.message || e?.message || 'Unknown error';
      toast.error(t('pages.permissions.seedError', { message: msg }));
    },
  });

  const filteredPermissions = useMemo(() => {
    if (!permissions || !Array.isArray(permissions)) return [];
    if (!searchTerm) return permissions;

    const search = searchTerm.toLowerCase();
    return permissions.filter((perm) => {
      const haystack = [
        perm.name,
        perm.resource,
        perm.action,
        perm.scope,
        perm.description,
        labelResource(perm.resource),
        labelAction(perm.action),
        labelScope(perm.scope),
        labelDescription(perm),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [
    permissions,
    searchTerm,
    labelResource,
    labelAction,
    labelScope,
    labelDescription,
    i18n.language,
  ]);

  const groupedEntries = useMemo(() => {
    const grouped: Record<string, Permission[]> = {};
    for (const perm of filteredPermissions) {
      const resource = perm.resource || 'other';
      if (!grouped[resource]) grouped[resource] = [];
      grouped[resource].push(perm);
    }

    for (const list of Object.values(grouped)) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return Object.entries(grouped).sort(([a], [b]) => {
      const ia = RESOURCE_ORDER.indexOf(a as (typeof RESOURCE_ORDER)[number]);
      const ib = RESOURCE_ORDER.indexOf(b as (typeof RESOURCE_ORDER)[number]);
      const ra = ia === -1 ? RESOURCE_ORDER.length : ia;
      const rb = ib === -1 ? RESOURCE_ORDER.length : ib;
      return ra !== rb ? ra - rb : a.localeCompare(b);
    });
  }, [filteredPermissions]);

  const toolbarActions = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('pages.permissions.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-64 pl-8"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => seedMutation.mutate()}
        disabled={seedMutation.isPending}
      >
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${seedMutation.isPending ? 'animate-spin' : ''}`} />
        {seedMutation.isPending
          ? t('pages.permissions.seeding')
          : t('pages.permissions.syncAction')}
      </Button>
    </div>
  );

  return (
    <FeaturePageLayout
      embedded={embedded}
      title={t('pages.permissions.title')}
      subtitle={t('pages.permissions.subtitle')}
      actions={toolbarActions}
    >
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border p-6 text-center">
          <p className="text-muted-foreground">{t('pages.permissions.loadError')}</p>
        </div>
      ) : filteredPermissions.length === 0 ? (
        <div className="rounded-lg border p-6 text-center">
          <Key className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-2 text-muted-foreground">
            {searchTerm ? t('pages.permissions.emptySearch') : t('pages.permissions.emptySystem')}
          </p>
          {!searchTerm && permissions && permissions.length === 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground">{t('pages.permissions.seedHint')}</p>
              <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                {seedMutation.isPending
                  ? t('pages.permissions.seeding')
                  : t('pages.permissions.seedAction')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedEntries.map(([resource, perms]) => (
            <div key={resource} className="rounded-md border">
              <div className="border-b bg-muted/50 px-6 py-3">
                <h3 className="text-lg font-semibold">{labelResource(resource)}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('pages.permissions.groupCount', { count: perms.length })}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.actions.name')}</TableHead>
                    <TableHead>{t('common.actions.resource')}</TableHead>
                    <TableHead>{t('common.actions.action')}</TableHead>
                    <TableHead>{t('common.actions.scope')}</TableHead>
                    <TableHead>{t('common.actions.description')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perms.map((permission) => (
                    <TableRow key={permission.id}>
                      <TableCell className="font-medium">
                        <code className="rounded bg-muted px-2 py-1 text-sm">{permission.name}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{labelResource(permission.resource)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{labelAction(permission.action)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{labelScope(permission.scope)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {labelDescription(permission)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && filteredPermissions.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          {t('pages.permissions.summary', {
            shown: filteredPermissions.length,
            total: permissions?.length || 0,
          })}
        </div>
      )}
    </FeaturePageLayout>
  );
}
