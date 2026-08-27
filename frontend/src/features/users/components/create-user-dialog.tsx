/**
 * Create User Dialog Component - Based on CreateTeamDialog structure
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usersApi } from '@/services/api/users';
import { toast } from 'sonner';
import { UserForm, type UserFormValues } from './user-form';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: UserFormValues) => {
      // Clean up the data before sending
      const cleanData: Parameters<typeof usersApi.create>[0] = {
        name: data.name.trim(),
        email: data.email.trim(),
      };

      // Add optional fields only if they have values
      if (data.role) {
        cleanData.role = data.role;
      }

      if (data.teamIds && data.teamIds.length > 0) {
        cleanData.teamIds = data.teamIds;
      }

      if (data.sendInvitation !== undefined) {
        cleanData.sendInvitation = data.sendInvitation;
      }

      return await usersApi.create(cleanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('pages.users.createSuccess'));
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Create user error:', error);
      const errorMessage =
        error?.response?.data?.error?.message || error?.message || 'Failed to create user';
      toast.error(t('pages.users.createError', { message: errorMessage }));
    },
  });

  const handleSubmit = (data: UserFormValues) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('pages.users.createDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('pages.users.createDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <UserForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={createMutation.isPending}
          submitButtonText={t('pages.users.create')}
        />
      </DialogContent>
    </Dialog>
  );
}
