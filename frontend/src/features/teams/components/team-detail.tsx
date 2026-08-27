/**
 * Team Detail Page Component
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { teamsApi } from '@/services/api/teams';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Edit,
  X,
  Users,
  Building2,
  Calendar,
  User,
  Mail,
  Shield,
  Wrench,
  Settings,
  Lock,
  Activity,
  AlertTriangle,
  Monitor,
  Server,
  Bot,
  Cpu,
  Database,
  Globe,
  Zap,
  Code,
  Cloud,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { TeamForm, type TeamFormValues } from './team-form';
import { AddMemberDialog } from './add-member-dialog';

interface TeamDetailProps {
  teamId: string;
}

export function TeamDetail({ teamId }: TeamDetailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const {
    data: team,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const result = await teamsApi.get(teamId);
      console.log('Team data loaded:', {
        teamId,
        members: result?.members?.length || 0,
        membersData: result?.members,
      });
      return result;
    },
    retry: 1,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TeamFormValues) => {
      const cleanData: any = {
        name: data.name.trim(),
      };

      if (data.description && data.description.trim()) {
        cleanData.description = data.description.trim();
      }

      if (data.logo) {
        cleanData.logo = data.logo;
      }

      return await teamsApi.update(teamId, cleanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success(t('pages.teams.updateSuccess'));
      setIsEditing(false);
    },
    onError: (error: any) => {
      console.error('Update team error:', error);
      let errorMessage = 'Failed to update team';
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
    mutationFn: () => teamsApi.delete(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success(t('pages.teams.deleteSuccess'));
      navigate({ to: userRoleManagementTabPath('teams') });
    },
    onError: (error: any) => {
      console.error('Delete team error:', error);
      toast.error(`Failed to delete team: ${error?.message || 'Unknown error'}`);
    },
  });

  const handleSubmit = async (values: TeamFormValues) => {
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

  if (error || !team) {
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
              <h2 className="text-xl font-semibold mb-2">Team not found</h2>
              <p className="text-muted-foreground mb-4">
                {error instanceof Error ? error.message : t('pages.teams.detailNotFoundSubtitle')}
              </p>
              <Button onClick={() => navigate({ to: userRoleManagementTabPath('teams') })}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.actions.backTo', { name: t('pages.teams.title') })}
              </Button>
            </div>
          </div>
        </Main>
      </>
    );
  }

  // Check if logo is a custom image
  const isCustomImage =
    team.logo &&
    (team.logo.startsWith('data:image/') ||
      team.logo.startsWith('http://') ||
      team.logo.startsWith('https://'));

  const iconName = team.logo || 'Users';
  const IconComponent = iconMap[iconName] || Users;

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
                <h1 className="text-2xl font-bold tracking-tight">{t('pages.teams.editTitle')}</h1>
              </div>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.teams.infoTitle')}</CardTitle>
                <CardDescription>{t('pages.teams.infoSubtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                <TeamForm
                  team={team}
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
                onClick={() => navigate({ to: userRoleManagementTabPath('teams') })}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.actions.back')}
              </Button>
              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
                  {isCustomImage ? (
                    <img
                      src={team.logo}
                      alt={`${team.name} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <IconComponent className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
                  {team.organization && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Building2 className="h-3 w-3" />
                      {team.organization.name}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
              <TabsTrigger value="overview">{t('pages.teams.overview')}</TabsTrigger>
              <TabsTrigger value="members">
                {t('pages.teams.membersTab')}
                {team.memberCount !== undefined && (
                  <Badge variant="secondary" className="ml-2">
                    {team.memberCount}
                  </Badge>
                )}
              </TabsTrigger>
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
                      <p className="text-sm mt-1">{team.name}</p>
                    </div>
                    {team.description && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {t('common.actions.description')}
                        </p>
                        <p className="text-sm mt-1">{team.description}</p>
                      </div>
                    )}
                    {team.organization && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {t('pages.teams.organization')}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm">{team.organization.name}</p>
                        </div>
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
                      <p className="text-sm mt-1">{format(new Date(team.createdAt), 'PPpp')}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {t('common.actions.updatedAt')}
                      </p>
                      <p className="text-sm mt-1">{format(new Date(team.updatedAt), 'PPpp')}</p>
                    </div>
                    {team.memberCount !== undefined && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {t('common.actions.members')}
                        </p>
                        <p className="text-sm mt-1">
                          {t('pages.teams.membersCount', { count: team.memberCount })}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="members" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{t('pages.teams.membersTitle')}</CardTitle>
                      <CardDescription>
                        {team.memberCount === 0
                          ? t('pages.teams.membersNoneYet')
                          : t('pages.teams.membersCountInTeam', { count: team.memberCount })}
                      </CardDescription>
                    </div>
                    <Button onClick={() => setAddMemberDialogOpen(true)} size="sm">
                      <Users className="mr-2 h-4 w-4" />
                      {t('pages.teams.addMember')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    console.log('Rendering members section:', {
                      hasMembers: !!team.members,
                      membersLength: team.members?.length || 0,
                      members: team.members,
                    });
                    return team.members && team.members.length > 0;
                  })() &&
                  team.members &&
                  team.members.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('pages.teams.table.user')}</TableHead>
                          <TableHead>{t('pages.teams.table.role')}</TableHead>
                          <TableHead>{t('pages.teams.table.joinedAt')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {team.members.map((member) => (
                          <TableRow key={member.userId}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {member.user?.avatar ? (
                                  <img
                                    src={member.user.avatar}
                                    alt={member.user.name || member.user.email}
                                    className="h-8 w-8 rounded-full"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="h-4 w-4 text-primary" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium">
                                    {member.user?.name || t('pages.teams.table.unknownUser')}
                                  </p>
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {member.user?.email || t('pages.teams.table.noEmail')}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{member.role || 'member'}</Badge>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(member.joinedAt), 'PP')}
                              </p>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Users className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-sm font-medium mb-2">{t('pages.teams.membersEmpty')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('pages.teams.membersEmptySubtitle')}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Add Member Dialog */}
        <AddMemberDialog
          open={addMemberDialogOpen}
          onOpenChange={setAddMemberDialogOpen}
          teamId={teamId}
          existingMemberIds={team.members?.map((m) => m.userId) || []}
        />
      </Main>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteConfirmOpen(false);
          }
        }}
        title={t('common.actions.delete')}
        desc={t('pages.teams.deleteConfirm', { name: team?.name ?? '' })}
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
