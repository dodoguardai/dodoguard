/**
 * Organizations Management Page
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
import { organizationsApi } from '@/services/api/organizations';
import { useOrganizationStore } from '@/stores/organization-store';
import { toast } from 'sonner';
import {
  Plus,
  MoreHorizontal,
  Eye,
  Trash2,
  Building2,
  CheckCircle2,
  AlertCircle,
  Users,
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
import type { Organization } from '@/types/entities';
import { CreateOrganizationDialog } from './components/create-organization-dialog';
import { Pagination } from '@/components/ui/pagination';

export function Organizations({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentOrg, setCurrentOrg } = useOrganizationStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['organizations', searchTerm],
    queryFn: async () => {
      const result = await organizationsApi.list();
      console.log('Organizations loaded:', result?.length || 0, 'items');
      return result;
    },
    retry: 1,
  });

  useEffect(() => {
    if (error) {
      console.error('Failed to load organizations:', error);
      toast.error(
        `${t('pages.organizations.loadErrorTitle')}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }, [error]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => organizationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'], exact: false });
      toast.success(t('pages.organizations.deleteSuccess'));
    },
    onError: (error: any) => {
      toast.error(`${t('common.state.error')}: ${error?.message || 'Unknown error'}`);
    },
  });

  const handleDelete = (org: Organization) => {
    setDeleteTarget(org);
  };

  const handleSwitchOrg = async (orgId: string) => {
    const orgs = data ?? [];
    const org = orgs.find((o: Organization) => o.id === orgId);
    if (org) {
      setCurrentOrg(org);
      await queryClient.invalidateQueries();
      navigate({ to: '/', search: { tab: 'overview' } });
      toast.success(t('pages.organizations.switchSuccess', { name: org.name }));
    }
  };

  // Filter organizations by search term
  const organizations = (data ?? []).filter((org: Organization) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      org.name.toLowerCase().includes(search) ||
      org.slug.toLowerCase().includes(search) ||
      org.status?.toLowerCase().includes(search)
    );
  });

  console.log('Organizations data:', data);
  console.log('Filtered organizations:', organizations.length, organizations);

  // Pagination
  const total = organizations.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedOrganizations = organizations.slice(startIndex, startIndex + pageSize);

  // Icon mapping - default to Building2 if not specified
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

  // Handle error state
  const toolbarActions = (
    <>
      <Input
        placeholder={t('pages.organizations.searchPlaceholder')}
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
        {t('pages.organizations.add')}
      </Button>
    </>
  );

  if (error) {
    return (
      <FeaturePageError embedded={embedded}>
        <div className="flex flex-col items-center justify-center py-10 space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Failed to load organizations</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['organizations'] })}>
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
      title={t('pages.organizations.title')}
      subtitle={t('pages.organizations.subtitle')}
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
      ) : paginatedOrganizations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold mb-2">{t('pages.organizations.emptyTitle')}</p>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm
                ? t('pages.organizations.emptySubtitleSearch')
                : t('pages.organizations.emptySubtitleDefault')}
            </p>
            {!searchTerm && (
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCreateDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('pages.organizations.add')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {paginatedOrganizations.map((org: Organization) => {
              // Check if icon is a custom image (base64 or URL)
              const isCustomImage =
                org.icon &&
                (org.icon.startsWith('data:image/') ||
                  org.icon.startsWith('http://') ||
                  org.icon.startsWith('https://'));

              // Get icon from org.icon, default to Building2
              const iconName = org.icon || 'Building2';
              const IconComponent = iconMap[iconName] || Building2;

              return (
                <Card key={org.id} className="flex flex-col hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
                          {isCustomImage ? (
                            <img
                              src={org.icon}
                              alt={`${org.name} icon`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <IconComponent className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{org.name}</CardTitle>
                          <CardDescription className="mt-1">{org.slug}</CardDescription>
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
                            onClick={() => navigate({ to: `/organizations/${org.id}` })}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            {t('common.actions.viewDetails')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSwitchOrg(org.id);
                            }}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {t('pages.organizations.switchToThisOrg')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(org);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('common.actions.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {currentOrg?.id === org.id && (
                      <Badge variant="default" className="mt-2 w-fit">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        {t('pages.organizations.active')}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('common.actions.status')}</span>
                        <Badge variant={org.status === 'active' ? 'default' : 'secondary'}>
                          {org.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {t('pages.organizations.plan')}
                        </span>
                        <span className="font-medium">{org.planId || 'Free'}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => navigate({ to: `/organizations/${org.id}` })}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('common.actions.view')}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {organizations.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              total={total}
              itemLabels={{
                singular: t('sidebar.item.organizations'),
                plural: t('sidebar.item.organizations'),
              }}
            />
          )}
        </>
      )}

      <CreateOrganizationDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
        title={t('common.actions.delete')}
        desc={t('pages.organizations.deleteConfirm', { name: deleteTarget?.name ?? '' })}
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
