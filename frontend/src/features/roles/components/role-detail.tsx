/**
 * Role Detail Page Component
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ConfigDrawer } from '@/components/config-drawer';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { rolesApi } from '@/services/api/roles';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';
import { permissionsApi } from '@/services/api/permissions';
import { toast } from 'sonner';
import { ArrowLeft, Edit, Trash2, Shield, CheckCircle2, XCircle } from 'lucide-react';
import { RoleForm, type RoleFormValues } from './role-form';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface RoleDetailProps {
  roleId: string;
  edit?: string;
}

function getPermissionsDisplay(permissions: string[] | undefined): string {
  if (!permissions?.length) return '0 permissions';
  return permissions.includes('*') ? 'All permissions' : `${permissions.length} permissions`;
}

export function RoleDetail({ roleId, edit }: RoleDetailProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditMode, setIsEditMode] = useState(edit === 'true');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const {
    data: role,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['role', roleId],
    queryFn: () => rolesApi.get(roleId),
    enabled: !!roleId,
  });

  const { data: permissionsCatalog } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => permissionsApi.list(),
    enabled: !!role && !isEditMode,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: RoleFormValues) => {
      const cleanData: any = {
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        permissions: data.permissions || [],
        isDefault: data.isDefault || false,
      };

      // Remove empty values
      Object.keys(cleanData).forEach((key) => {
        if (cleanData[key] === undefined || cleanData[key] === null || cleanData[key] === '') {
          delete cleanData[key];
        }
      });

      return await rolesApi.update(roleId, cleanData);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['role', roleId] });
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role updated successfully');
      setIsEditMode(false);
    },
    onError: (error: any) => {
      console.error('Update role error:', error);
      let errorMessage = 'Failed to update role';

      const errorDetails = error?.details;
      if (errorDetails) {
        if (Array.isArray(errorDetails)) {
          const validationErrors = errorDetails
            .map((d: any) => {
              const path = Array.isArray(d.path) ? d.path.join('.') : d.path || 'unknown';
              return `${path}: ${d.message}`;
            })
            .join(', ');
          errorMessage += ` (${validationErrors})`;
        } else if (errorDetails.details && Array.isArray(errorDetails.details)) {
          const validationErrors = errorDetails.details
            .map((d: any) => {
              const path = Array.isArray(d.path) ? d.path.join('.') : d.path || 'unknown';
              return `${path}: ${d.message}`;
            })
            .join(', ');
          errorMessage += ` (${validationErrors})`;
        } else if (errorDetails.message && errorDetails.message !== errorMessage) {
          errorMessage = errorDetails.message;
        }
      }

      toast.error(`Failed to update role: ${errorMessage}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => rolesApi.delete(roleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role deleted successfully');
      navigate({ to: userRoleManagementTabPath('roles') });
    },
    onError: (error: any) => {
      toast.error(`Failed to delete role: ${error?.message || 'Unknown error'}`);
    },
  });

  const handleSubmit = (data: RoleFormValues) => {
    updateMutation.mutate(data);
  };

  const handleDelete = () => {
    deleteMutation.mutate();
    setDeleteDialogOpen(false);
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
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </Main>
      </>
    );
  }

  if (error || !role) {
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
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {error ? 'Failed to load role' : 'Role not found'}
            </p>
            <Button variant="outline" onClick={() => navigate({ to: userRoleManagementTabPath('roles') })} className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Roles
            </Button>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: userRoleManagementTabPath('roles') })}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{role.name}</h2>
              <p className="text-muted-foreground">{role.description || 'No description'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditMode && role.type === 'custom' && (
              <>
                <Button variant="outline" onClick={() => setIsEditMode(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
            {isEditMode && (
              <Button variant="outline" onClick={() => setIsEditMode(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        {isEditMode ? (
          <div className="rounded-lg border p-6">
            <RoleForm
              role={role}
              onSubmit={handleSubmit}
              onCancel={() => setIsEditMode(false)}
              isLoading={updateMutation.isPending}
            />
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="rounded-lg border p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Role Name</h3>
                  <p className="text-lg font-semibold">{role.name}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                  <p className="text-sm">{role.description || 'No description provided'}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Type</h3>
                    <Badge variant={role.type === 'system' ? 'default' : 'secondary'}>
                      {role.type}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Default Role</h3>
                    {role.isDefault ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Yes
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        No
                      </Badge>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Permissions</h3>
                    <Badge variant="outline" className="gap-1">
                      <Shield className="h-3 w-3" />
                      {getPermissionsDisplay(role.permissions)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Created</h3>
                  <p className="text-sm">{new Date(role.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Last Updated</h3>
                  <p className="text-sm">{new Date(role.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="permissions" className="space-y-4">
              <div className="rounded-lg border p-6">
                <h3 className="text-lg font-semibold mb-4">Assigned Permissions</h3>
                {role.permissions?.includes('*') &&
                permissionsCatalog &&
                permissionsCatalog.length > 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      This role has all permissions (*).
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Resource</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Scope</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {permissionsCatalog.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">
                              <code className="text-sm bg-muted px-2 py-1 rounded">{p.name}</code>
                            </TableCell>
                            <TableCell>{p.resource ?? '-'}</TableCell>
                            <TableCell>{p.action ?? '-'}</TableCell>
                            <TableCell>{p.scope ?? '-'}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.description ?? '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : role.permissions && role.permissions.length > 0 ? (
                  <div className="space-y-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Resource</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Scope</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {role.permissions.map((permName) => {
                          const catalogEntry = permissionsCatalog?.find((p) => p.name === permName);
                          return (
                            <TableRow key={permName}>
                              <TableCell className="font-medium">
                                <code className="text-sm bg-muted px-2 py-1 rounded">
                                  {permName}
                                </code>
                              </TableCell>
                              <TableCell>{catalogEntry?.resource ?? '-'}</TableCell>
                              <TableCell>{catalogEntry?.action ?? '-'}</TableCell>
                              <TableCell>{catalogEntry?.scope ?? '-'}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {catalogEntry?.description ?? '-'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No permissions assigned</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the role "{role.name}".
                Users assigned to this role may lose access.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Main>
    </>
  );
}
