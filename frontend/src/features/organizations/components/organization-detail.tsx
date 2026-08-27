/**
 * Organization Detail Page Component
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfigDrawer } from '@/components/config-drawer';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { organizationsApi } from '@/services/api/organizations';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';
import { useOrganizationStore } from '@/stores/organization-store';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Edit,
  X,
  Building2,
  Calendar,
  CheckCircle2,
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
import { format } from 'date-fns';
import { useState } from 'react';
import { OrganizationForm, type OrganizationFormValues } from './organization-form.tsx';

interface OrganizationDetailProps {
  organizationId: string;
}

export function OrganizationDetail({ organizationId }: OrganizationDetailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentOrg, setCurrentOrg } = useOrganizationStore();
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const {
    data: organization,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => organizationsApi.get(organizationId),
    retry: 1,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: OrganizationFormValues) => {
      const cleanData: any = {
        name: data.name.trim(),
        slug: data.slug?.trim(),
        status: data.status || 'active',
      };

      if (data.icon) {
        cleanData.icon = data.icon;
      }

      if (data.planId && data.planId.trim()) {
        cleanData.planId = data.planId.trim();
      }

      return await organizationsApi.update(organizationId, cleanData);
    },
    onSuccess: (updatedOrg) => {
      queryClient.invalidateQueries({ queryKey: ['organization', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      // Update current org if it's the same one
      if (currentOrg?.id === organizationId) {
        setCurrentOrg(updatedOrg);
      }
      toast.success(t('pages.organizations.updateSuccess'));
      setIsEditing(false);
    },
    onError: (error: any) => {
      console.error('Update organization error:', error);
      let errorMessage = 'Failed to update organization';
      if (error?.response?.data?.error?.message) {
        errorMessage = error.response.data.error.message;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      toast.error(errorMessage);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => organizationsApi.delete(organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success(t('pages.organizations.deleteSuccess'));
      navigate({ to: userRoleManagementTabPath('organizations') });
    },
    onError: (error: any) => {
      console.error('Delete organization error:', error);
      toast.error(`Failed to delete organization: ${error?.message || 'Unknown error'}`);
    },
  });

  const handleSubmit = async (values: OrganizationFormValues) => {
    try {
      await updateMutation.mutateAsync(values);
    } catch (error) {
      // Error is already handled in onError callback
      console.error('Submit error:', error);
    }
  };

  const handleDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const handleSwitchOrg = async () => {
    if (organization) {
      setCurrentOrg(organization);
      // Invalidate all queries to refresh data with new organization context
      await queryClient.invalidateQueries();
      // Navigate to the new organization's detail page
      // This ensures we're viewing the correct organization after switching
      navigate({ to: `/organizations/${organization.id}` });
      toast.success(t('pages.organizations.switchSuccess', { name: organization.name }));
    }
  };

  // Icon mapping
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
        <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
          <div className="space-y-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        </Main>
      </>
    );
  }

  if (error || !organization) {
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
            <X className="h-12 w-12 text-destructive" />
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">
                {t('pages.organizations.detailNotFoundTitle')}
              </h2>
              <p className="text-muted-foreground mb-4">
                {error instanceof Error
                  ? error.message
                  : t('pages.organizations.detailNotFoundSubtitle')}
              </p>
              <Button onClick={() => navigate({ to: userRoleManagementTabPath('organizations') })}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.actions.backTo', { name: t('pages.organizations.title') })}
              </Button>
            </div>
          </div>
        </Main>
      </>
    );
  }

  // Check if icon is a custom image
  const isCustomImage =
    organization.icon &&
    (organization.icon.startsWith('data:image/') ||
      organization.icon.startsWith('http://') ||
      organization.icon.startsWith('https://'));

  const iconName = organization.icon || 'Building2';
  const IconComponent = iconMap[iconName] || Building2;

  if (isEditing) {
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
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('common.actions.back')}
                </Button>
                <h1 className="text-2xl font-bold tracking-tight">
                  {t('pages.organizations.editTitle')}
                </h1>
              </div>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.organizations.infoTitle')}</CardTitle>
                <CardDescription>{t('pages.organizations.infoSubtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                <OrganizationForm
                  organization={organization}
                  onSubmit={handleSubmit}
                  onCancel={() => setIsEditing(false)}
                  isLoading={updateMutation.isPending}
                />
              </CardContent>
            </Card>
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
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: userRoleManagementTabPath('organizations') })}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.actions.back')}
              </Button>
              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
                  {isCustomImage ? (
                    <img
                      src={organization.icon}
                      alt={`${organization.name} icon`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <IconComponent className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{organization.name}</h1>
                  <p className="text-sm text-muted-foreground">{organization.slug}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentOrg?.id === organization.id && (
                <Badge variant="default">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {t('pages.organizations.active')}
                </Badge>
              )}
              {currentOrg?.id !== organization.id && (
                <Button variant="outline" onClick={handleSwitchOrg}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('pages.organizations.switchToThisOrg')}
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('common.actions.edit')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <X className="mr-2 h-4 w-4" />
                {t('common.actions.delete')}
              </Button>
            </div>
          </div>

          {/* Content Tabs */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">{t('pages.organizations.overview')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('pages.organizations.basicInfo')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t('common.actions.name')}
                      </p>
                      <p className="text-sm mt-1">{organization.name}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t('pages.organizations.slug')}
                      </p>
                      <p className="text-sm mt-1">{organization.slug}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t('common.actions.status')}
                      </p>
                      <Badge
                        variant={organization.status === 'active' ? 'default' : 'secondary'}
                        className="mt-1"
                      >
                        {organization.status}
                      </Badge>
                    </div>
                    {organization.planId && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {t('pages.organizations.planId')}
                        </p>
                        <p className="text-sm mt-1">{organization.planId}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('pages.organizations.metadata')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {t('common.actions.createdAt')}
                      </p>
                      <p className="text-sm mt-1">
                        {format(new Date(organization.createdAt), 'PPpp')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {t('common.actions.updatedAt')}
                      </p>
                      <p className="text-sm mt-1">
                        {format(new Date(organization.updatedAt), 'PPpp')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </Main>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteConfirmOpen(false);
          }
        }}
        title={t('common.actions.delete')}
        desc={t('pages.organizations.deleteConfirm', { name: organization?.name ?? '' })}
        cancelBtnText={t('common.actions.cancel')}
        confirmText={
          deleteMutation.isPending ? t('common.state.loading') : t('common.actions.delete')
        }
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}
