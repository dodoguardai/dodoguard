/**
 * Account settings — profile, language, password.
 */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { zodResolverV4 } from '@/lib/zod-resolver';
import { meApi } from '@/services/api/me';
import { useAuthStore } from '@/stores/auth-store';

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters'),
  language: z.enum(['zh', 'en']),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'New password is too long'),
    confirmPassword: z.string().min(1, 'Please confirm the new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

function resolveLang(lng: string | undefined): 'zh' | 'en' {
  return lng?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function SettingsAccount() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.auth.setUser);
  const authUser = useAuthStore((s) => s.auth.user);

  const profileQuery = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => meApi.getProfile(),
  });

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolverV4<ProfileFormValues>(profileSchema),
    defaultValues: {
      name: '',
      language: resolveLang(i18n.language),
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolverV4<PasswordFormValues>(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      profileForm.reset({
        name: profileQuery.data.name || '',
        language: resolveLang(i18n.language),
      });
      return;
    }
    if (authUser && !profileQuery.isLoading) {
      profileForm.reset({
        name: authUser.name || '',
        language: resolveLang(i18n.language),
      });
    }
  }, [profileQuery.data, profileQuery.isLoading, authUser, i18n.language, profileForm]);

  const updateProfileMutation = useMutation({
    mutationFn: (values: ProfileFormValues) => meApi.updateProfile({ name: values.name.trim() }),
    onSuccess: (updated, values) => {
      void i18n.changeLanguage(values.language);
      window.localStorage.setItem('app_language', values.language);
      setUser({
        id: updated.id,
        organizationId: updated.organizationId,
        email: updated.email,
        name: updated.name,
        avatar: updated.avatar,
        role: updated.role,
        status: updated.status,
        emailVerified: updated.emailVerified,
        mfaEnabled: updated.mfaEnabled,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        lastLoginAt: updated.lastLoginAt,
      });
      void queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
      toast.success(tr('Account updated', '账户已更新'));
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error?.message ||
          error?.message ||
          tr('Failed to update account', '更新账户失败'),
      );
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      meApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      passwordForm.reset();
      toast.success(tr('Password updated', '密码已更新'));
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error?.message ||
          error?.message ||
          tr('Failed to change password', '修改密码失败'),
      );
    },
  });

  const email = profileQuery.data?.email || authUser?.email || '—';
  const role = profileQuery.data?.role || authUser?.role || '—';

  return (
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{tr('Account', '账户')}</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            {tr(
              'Manage your display name, interface language, and password.',
              '管理显示名称、界面语言与登录密码。',
            )}
          </p>
        </div>

        <div className="grid max-w-2xl gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr('Profile', '个人资料')}</CardTitle>
              <CardDescription>
                {tr(
                  'This name appears in the sidebar and activity records.',
                  '该名称会显示在侧边栏与操作记录中。',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profileQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-40" />
                </div>
              ) : (
                <Form {...profileForm}>
                  <form
                    className="space-y-5"
                    onSubmit={profileForm.handleSubmit((values) =>
                      updateProfileMutation.mutate(values),
                    )}
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <div className="text-sm font-medium">{tr('Email', '邮箱')}</div>
                        <Input value={email} disabled readOnly />
                        <p className="text-muted-foreground text-xs">
                          {tr('Email cannot be changed here.', '邮箱暂不支持在此修改。')}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-sm font-medium">{tr('Role', '角色')}</div>
                        <Input value={role} disabled readOnly />
                      </div>
                    </div>

                    <FormField
                      control={profileForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tr('Display name', '显示名称')}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={tr('Your name', '你的姓名')}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={profileForm.control}
                      name="language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tr('Language', '语言')}</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full sm:w-56">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="zh">中文</SelectItem>
                              <SelectItem value="en">English</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {tr(
                              'Controls the language of the product interface.',
                              '控制产品界面显示语言。',
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={updateProfileMutation.isPending}>
                      {updateProfileMutation.isPending
                        ? tr('Saving…', '保存中…')
                        : tr('Save changes', '保存更改')}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr('Password', '密码')}</CardTitle>
              <CardDescription>
                {tr(
                  'Change your login password. Use at least 8 characters.',
                  '修改登录密码，至少 8 位字符。',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form
                  className="space-y-5"
                  onSubmit={passwordForm.handleSubmit((values) =>
                    changePasswordMutation.mutate(values),
                  )}
                >
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr('Current password', '当前密码')}</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="current-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr('New password', '新密码')}</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr('Confirm new password', '确认新密码')}</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={changePasswordMutation.isPending}>
                    {changePasswordMutation.isPending
                      ? tr('Updating…', '更新中…')
                      : tr('Update password', '更新密码')}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
