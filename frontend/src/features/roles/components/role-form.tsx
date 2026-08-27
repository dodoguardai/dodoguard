/**
 * Role Form Component
 */

import { useForm } from 'react-hook-form';
import { zodResolverV4 } from '@/lib/zod-resolver';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { Role, Permission } from '@/types/entities';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { permissionsApi } from '@/services/api/permissions';
import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';

const roleFormSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  isDefault: z.boolean().optional().default(false),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;

interface RoleFormProps {
  role?: Role;
  onSubmit: (data: RoleFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function RoleForm({ role, onSubmit, onCancel, isLoading = false }: RoleFormProps) {
  const { t } = useTranslation();
  const [permissionSearch, setPermissionSearch] = useState('');

  // Fetch all available permissions
  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => permissionsApi.list(),
  });

  const labelResource = (resource: string) =>
    t(`pages.permissions.resource.${resource}`, { defaultValue: resource });

  const labelPermissionDesc = (permission: Permission) => {
    const resource = permission.resource || permission.name.split(':')[0];
    const action = permission.action || permission.name.split(':')[1];
    if (resource && action) {
      return t(`pages.permissions.desc.${resource}.${action}`, {
        defaultValue: permission.description || '',
      });
    }
    return permission.description || '';
  };

  const form = useForm<RoleFormValues, unknown, RoleFormValues>({
    resolver: zodResolverV4<RoleFormValues>(roleFormSchema),
    defaultValues: {
      name: role?.name || '',
      description: role?.description || '',
      permissions: role?.permissions || [],
      isDefault: role?.isDefault || false,
    },
  });

  // Group permissions by resource
  const groupedPermissions = useMemo(() => {
    if (!permissions) return {};

    const filtered = permissionSearch
      ? permissions.filter(
          (p) =>
            p.name.toLowerCase().includes(permissionSearch.toLowerCase()) ||
            p.resource.toLowerCase().includes(permissionSearch.toLowerCase()) ||
            p.description?.toLowerCase().includes(permissionSearch.toLowerCase()),
        )
      : permissions;

    return filtered.reduce(
      (acc, permission) => {
        const resource = permission.resource || 'other';
        if (!acc[resource]) {
          acc[resource] = [];
        }
        acc[resource].push(permission);
        return acc;
      },
      {} as Record<string, Permission[]>,
    );
  }, [permissions, permissionSearch]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit as (data: RoleFormValues) => void)}
        className="space-y-6"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter role name"
                  {...field}
                  disabled={role?.type === 'system'} // System roles cannot be renamed
                />
              </FormControl>
              <FormDescription>
                {role?.type === 'system'
                  ? 'System roles cannot be renamed'
                  : 'A unique name for this role'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Enter role description" {...field} rows={3} />
              </FormControl>
              <FormDescription>
                Describe the purpose and responsibilities of this role
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="permissions"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="text-base">Permissions</FormLabel>
                <FormDescription>Select the permissions for this role</FormDescription>
                <div className="mt-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search permissions..."
                      value={permissionSearch}
                      onChange={(e) => setPermissionSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>

              {permissionsLoading ? (
                <p className="text-sm text-muted-foreground">Loading permissions...</p>
              ) : Object.keys(groupedPermissions).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {permissionSearch
                    ? 'No permissions match your search.'
                    : 'No permissions available.'}
                </p>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto border rounded-md p-4">
                  {Object.entries(groupedPermissions).map(([resource, perms]) => (
                    <div key={resource} className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        {labelResource(resource)}
                      </h4>
                      <div className="space-y-2 pl-4">
                        {perms.map((permission) => (
                          <FormField
                            key={permission.id}
                            control={form.control}
                            name="permissions"
                            render={({ field }) => {
                              const desc = labelPermissionDesc(permission);
                              return (
                                <FormItem
                                  key={permission.id}
                                  className="flex flex-row items-start space-x-3 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(permission.name)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([
                                              ...(field.value || []),
                                              permission.name,
                                            ])
                                          : field.onChange(
                                              (field.value || []).filter(
                                                (value) => value !== permission.name,
                                              ),
                                            );
                                      }}
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none flex-1">
                                    <FormLabel className="font-normal cursor-pointer">
                                      {permission.name}
                                    </FormLabel>
                                    {desc ? (
                                      <p className="text-xs text-muted-foreground">{desc}</p>
                                    ) : null}
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      <span>
                                        {t('common.actions.resource')}:{' '}
                                        {labelResource(permission.resource || 'other')}
                                      </span>
                                      <span>•</span>
                                      <span>
                                        {t('common.actions.action')}:{' '}
                                        {t(`pages.permissions.action.${permission.action}`, {
                                          defaultValue: permission.action,
                                        })}
                                      </span>
                                      <span>•</span>
                                      <span>
                                        {t('common.actions.scope')}:{' '}
                                        {t(`pages.permissions.scope.${permission.scope}`, {
                                          defaultValue: permission.scope,
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                </FormItem>
                              );
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {!role && (
          <FormField
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Set as default role</FormLabel>
                  <FormDescription>New users will be assigned this role by default</FormDescription>
                </div>
              </FormItem>
            )}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
