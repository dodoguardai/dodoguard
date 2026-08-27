/**
 * Create Role Dialog Component
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { rolesApi } from '@/services/api/roles';
import { toast } from 'sonner';
import { RoleForm, type RoleFormValues } from './role-form';

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRoleDialog({ open, onOpenChange }: CreateRoleDialogProps) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
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

      console.log('Create role - cleaned data:', cleanData);
      return await rolesApi.create(cleanData);
    },
    onSuccess: async () => {
      console.log('Role created successfully, invalidating cache...');
      await queryClient.invalidateQueries({ queryKey: ['roles'], exact: false });
      await queryClient.refetchQueries({ queryKey: ['roles'], exact: false });
      console.log('Cache invalidated and refetched');
      toast.success('Role created successfully');
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Create role error:', error);
      console.error('Error response:', error?.response);
      console.error('Error response data:', error?.response?.data);
      console.error('Error details:', error?.details);

      let errorMessage = 'Failed to create role';

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

      if (error?.code) {
        errorMessage += ` [${error.code}]`;
      }

      toast.error(`Failed to create role: ${errorMessage}`);
    },
  });

  const handleSubmit = (data: RoleFormValues) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Role</DialogTitle>
          <DialogDescription>Create a new role and assign permissions to it.</DialogDescription>
        </DialogHeader>
        <RoleForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isLoading={createMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
