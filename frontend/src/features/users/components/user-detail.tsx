/**
 * User Detail Page Component - Based on Team Detail structure
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesApi } from '@/services/api/roles';
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
import { usersApi } from '@/services/api/users';
import { organizationsApi } from '@/services/api/organizations';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Edit,
  X,
  Users,
  User,
  Mail,
  Shield,
  Clock,
  Activity,
  AlertTriangle,
  Building2,
  Key,
  UserCheck,
  UserX,
} from 'lucide-react';
import type { User as UserEntity } from '@/types/entities';
import { format } from 'date-fns';
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface UserDetailProps {
  userId: string;
}

export function UserDetail({ userId }: UserDetailProps) {
  console.log('[UserDetail] Component called with userId:', userId, typeof userId);

  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: 'member' as string,
  });
  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const result = await usersApi.get(userId);
      console.log('User data loaded:', {
        userId,
        teams: result?.teams?.length || 0,
        teamsData: result?.teams,
      });
      return result;
    },
    retry: 1,
  });

  // Fetch roles for selection
  const { data: rolesData } = useQuery({
    queryKey: ['roles', 'list'],
    queryFn: () => rolesApi.list({ limit: 100 }),
  });

  const roles = rolesData?.data || [];

  // Fetch organization by id to show name (more reliable than matching from list)
  const { data: userOrg, isLoading: isLoadingOrg } = useQuery({
    queryKey: ['organization', user?.organizationId],
    queryFn: () => organizationsApi.get(user!.organizationId!),
    enabled: !!user?.organizationId,
  });

  const roleNameByKey = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles) {
      m.set(r.id, r.name);
      m.set(r.name, r.name);
    }
    return m;
  }, [roles]);
  const getRoleDisplayName = (raw: string | string[] | undefined): string => {
    const s = typeof raw === 'string' ? raw : raw?.[0];
    if (!s) return 'member';
    return roleNameByKey.get(s) ?? s;
  };

  // Update edit form when user data loads
  React.useEffect(() => {
    if (user) {
      setEditForm({
        name: user.name || '',
        email: user.email || '',
        role: getRoleDisplayName(user.role) || 'member',
      });
    }
  }, [user, roleNameByKey]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Pick<UserEntity, 'name' | 'email' | 'role'>>) => {
      const cleanData: any = {};

      if (data.name && data.name.trim()) {
        cleanData.name = data.name.trim();
      }

      if (data.email && data.email.trim()) {
        cleanData.email = data.email.trim();
      }

      if (data.role) {
        cleanData.role = data.role;
      }

      return await usersApi.update(userId, cleanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsEditing(false);
      toast.success(tr('User updated successfully', '用户更新成功'));
    },
    onError: (error: any) => {
      console.error('Update user error:', error);
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        tr('Failed to update user', '更新用户失败');
      toast.error(`${tr('Failed to update user', '更新用户失败')}: ${errorMessage}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => usersApi.delete(userId),
    onSuccess: () => {
      toast.success(tr('User deleted successfully', '用户删除成功'));
      navigate({ to: userRoleManagementTabPath('users') });
    },
    onError: (error: any) => {
      toast.error(
        `${tr('Failed to delete user', '删除用户失败')}: ${error?.message || tr('Unknown error', '未知错误')}`,
      );
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => usersApi.resetPassword(userId),
    onSuccess: () => {
      toast.success(tr('Password reset email sent successfully', '密码重置邮件已发送'));
    },
    onError: (error: any) => {
      toast.error(
        `${tr('Failed to reset password', '重置密码失败')}: ${error?.message || tr('Unknown error', '未知错误')}`,
      );
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => usersApi.activate(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(tr('User activated successfully', '用户激活成功'));
    },
    onError: (error: any) => {
      toast.error(
        `${tr('Failed to activate user', '激活用户失败')}: ${error?.message || tr('Unknown error', '未知错误')}`,
      );
    },
  });

  const suspendMutation = useMutation({
    mutationFn: () => usersApi.suspend(userId, 'Suspended by admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(tr('User suspended successfully', '用户已停用'));
    },
    onError: (error: any) => {
      toast.error(
        `${tr('Failed to suspend user', '停用用户失败')}: ${error?.message || tr('Unknown error', '未知错误')}`,
      );
    },
  });

  const handleUpdate = (data: Partial<Pick<UserEntity, 'name' | 'email' | 'role'>>) => {
    updateMutation.mutate(data);
  };

  const handleDelete = () => {
    setDeleteConfirmOpen(true);
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
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32" />
              </CardContent>
            </Card>
          </div>
        </Main>
      </>
    );
  }

  if (error || !user) {
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: userRoleManagementTabPath('users') })}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {tr('Back to Users', '返回用户列表')}
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">{tr('User not found', '未找到用户')}</h2>
              <p className="text-muted-foreground mb-4">
                {tr(
                  "The user you're looking for doesn't exist or you don't have permission to view it.",
                  '你要查看的用户不存在，或你没有查看权限。',
                )}
              </p>
              <Button onClick={() => navigate({ to: userRoleManagementTabPath('users') })}>
                {tr('Back to Users', '返回用户列表')}
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: userRoleManagementTabPath('users') })}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {tr('Back to Users', '返回用户列表')}
            </Button>
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={`${user.name} avatar`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-6 w-6 text-primary" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {user.email}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {tr('Edit User', '编辑用户')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Key className="mr-2 h-4 w-4" />
                      {tr('Actions', '操作')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{tr('User Actions', '用户操作')}</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => resetPasswordMutation.mutate()}
                      disabled={resetPasswordMutation.isPending}
                    >
                      <Key className="mr-2 h-4 w-4" />
                      {resetPasswordMutation.isPending
                        ? tr('Sending...', '发送中...')
                        : tr('Reset Password', '重置密码')}
                    </DropdownMenuItem>
                    {user.status !== 'active' && (
                      <DropdownMenuItem
                        onClick={() => activateMutation.mutate()}
                        disabled={activateMutation.isPending}
                      >
                        <UserCheck className="mr-2 h-4 w-4" />
                        {activateMutation.isPending
                          ? tr('Activating...', '激活中...')
                          : tr('Activate User', '激活用户')}
                      </DropdownMenuItem>
                    )}
                    {user.status === 'active' && (
                      <DropdownMenuItem
                        onClick={() => suspendMutation.mutate()}
                        disabled={suspendMutation.isPending}
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        {suspendMutation.isPending
                          ? tr('Suspending...', '停用中...')
                          : tr('Suspend User', '停用用户')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-destructive"
                      disabled={deleteMutation.isPending}
                    >
                      <X className="mr-2 h-4 w-4" />
                      {deleteMutation.isPending
                        ? tr('Deleting...', '删除中...')
                        : tr('Delete User', '删除用户')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  {tr('Cancel', '取消')}
                </Button>
                <Button onClick={() => handleUpdate(editForm)} disabled={updateMutation.isPending}>
                  {updateMutation.isPending
                    ? tr('Saving...', '保存中...')
                    : tr('Save Changes', '保存更改')}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex items-center gap-2">
          <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>{user.status}</Badge>
          <Badge variant="outline">{getRoleDisplayName(user.role)}</Badge>
          {user.emailVerified && (
            <Badge variant="outline" className="text-green-600">
              <Shield className="mr-1 h-3 w-3" />
              {tr('Verified', '已验证')}
            </Badge>
          )}
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="overview" className="flex-1">
          <TabsList>
            <TabsTrigger value="overview">{tr('Overview', '概览')}</TabsTrigger>
            <TabsTrigger value="teams">
              {tr('Teams', '团队')} ({user.teams?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="activity">{tr('Activity', '活动')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>{tr('Basic Information', '基础信息')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isEditing ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="name">{tr('Full Name', '姓名')}</Label>
                        <Input
                          id="name"
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, name: e.target.value }))
                          }
                          placeholder={tr('Enter full name', '输入姓名')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">{tr('Email', '邮箱')}</Label>
                        <Input
                          id="email"
                          type="email"
                          value={editForm.email}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, email: e.target.value }))
                          }
                          placeholder={tr('Enter email address', '输入邮箱地址')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">{tr('Role', '角色')}</Label>
                        <Select
                          value={editForm.role}
                          onValueChange={(value) =>
                            setEditForm((prev) => ({ ...prev, role: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((role) => (
                              <SelectItem key={role.id} value={role.name}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end space-x-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsEditing(false);
                            setEditForm({
                              name: user.name || '',
                              email: user.email || '',
                              role: getRoleDisplayName(user.role) || 'member',
                            });
                          }}
                        >
                          {tr('Cancel', '取消')}
                        </Button>
                        <Button
                          onClick={() => handleUpdate(editForm)}
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending
                            ? tr('Saving...', '保存中...')
                            : tr('Save Changes', '保存更改')}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{tr('Full Name', '姓名')}</span>
                        <span className="text-sm">{user.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{tr('Email', '邮箱')}</span>
                        <span className="text-sm">{user.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{tr('Role', '角色')}</span>
                        <Badge variant="secondary">{getRoleDisplayName(user.role)}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{tr('Status', '状态')}</span>
                        <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                          {user.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">
                          {tr('Email Verified', '邮箱已验证')}
                        </span>
                        <span className="text-sm">
                          {user.emailVerified ? tr('Yes', '是') : tr('No', '否')}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">{tr('Created', '创建时间')}</span>
                    <span className="text-sm">{format(new Date(user.createdAt), 'PPP')}</span>
                  </div>
                  {user.lastLoginAt && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">{tr('Last Login', '最近登录')}</span>
                      <span className="text-sm">{format(new Date(user.lastLoginAt), 'PPP')}</span>
                    </div>
                  )}
                  {user.lastActivityAt && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">{tr('Last Activity', '最近活动')}</span>
                      <span className="text-sm">
                        {format(new Date(user.lastActivityAt), 'PPP')}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Organization Information */}
              <Card>
                <CardHeader>
                  <CardTitle>{tr('Organization', '组织')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {user.organizationId
                          ? isLoadingOrg
                            ? tr('Loading…', '加载中…')
                            : (userOrg?.name ?? '—')
                          : '—'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {user.organizationId ? `ID: ${user.organizationId}` : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="teams" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{tr('Team Memberships', '团队成员关系')}</CardTitle>
                    <CardDescription>
                      {tr('Teams that this user belongs to', '该用户所属团队')}
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Users className="mr-2 h-4 w-4" />
                    {tr('Manage Teams', '管理团队')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {user.teams && user.teams.length > 0 ? (
                  <div className="space-y-4">
                    {user.teams.map((team: any) => (
                      <div
                        key={team.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{team.name}</p>
                            <p className="text-sm text-muted-foreground">{team.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{team.role || 'member'}</Badge>
                          <Button variant="ghost" size="sm">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">
                      {tr('This user is not a member of any teams', '该用户尚未加入任何团队')}
                    </p>
                    <Button variant="outline">
                      <Users className="mr-2 h-4 w-4" />
                      {tr('Add to Team', '添加到团队')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{tr('Recent Activity', '最近活动')}</CardTitle>
                <CardDescription>
                  {tr('Recent actions and events for this user', '该用户最近操作与事件')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Account Creation */}
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                      <User className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{tr('Account Created', '账户创建')}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(user.createdAt), 'PPP')}
                      </p>
                    </div>
                  </div>

                  {/* Email Verification */}
                  {user.emailVerified && (
                    <div className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                        <Mail className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{tr('Email Verified', '邮箱已验证')}</p>
                        <p className="text-xs text-muted-foreground">
                          {tr('Email address has been verified', '邮箱地址已验证')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Last Login */}
                  {user.lastLoginAt && (
                    <div className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
                        <Clock className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{tr('Last Login', '最近登录')}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(user.lastLoginAt), 'PPP')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Status Changes */}
                  {user.status !== 'active' && (
                    <div className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Status: {user.status}</p>
                        <p className="text-xs text-muted-foreground">
                          {tr('Account status has been changed', '账户状态已变更')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* No activity */}
                  {!user.lastLoginAt && !user.emailVerified && (
                    <div className="text-center py-8">
                      <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {tr('No recent activity', '暂无最近活动')}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteConfirmOpen(false);
          }
        }}
        title={tr('Delete user?', '删除用户？')}
        desc={tr(
          `Are you sure you want to delete "${user?.name}"? This action cannot be undone.`,
          `确定要删除 "${user?.name}" 吗？此操作不可撤销。`,
        )}
        cancelBtnText={tr('Cancel', '取消')}
        confirmText={
          deleteMutation.isPending ? tr('Deleting...', '删除中...') : tr('Delete', '删除')
        }
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}
