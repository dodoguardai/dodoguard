/**
 * Create Organization Dialog Component
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
import { organizationsApi } from '@/services/api/organizations';
import { toast } from 'sonner';
import { OrganizationForm, type OrganizationFormValues } from './organization-form.tsx';

interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrganizationDialog({ open, onOpenChange }: CreateOrganizationDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: OrganizationFormValues) => {
      // Generate slug from name if not provided or empty
      const generatedSlug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const slug = data.slug?.trim() || generatedSlug;

      // Clean up the data before sending
      const cleanData: any = {
        name: data.name.trim(),
        icon: data.icon || 'Building2',
        status: data.status || 'active',
      };

      // Only add slug if it's not empty
      if (slug && slug.length > 0) {
        cleanData.slug = slug;
      }

      // Add optional fields only if they have values
      if (data.planId && data.planId.trim()) {
        cleanData.planId = data.planId.trim();
      }

      // Remove undefined, null, and empty string values to avoid validation issues
      // But keep slug even if empty, as it will be generated on backend
      Object.keys(cleanData).forEach((key) => {
        const value = cleanData[key];
        // Don't remove slug - backend will generate it if needed
        if (key === 'slug') {
          return;
        }
        if (
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '')
        ) {
          delete cleanData[key];
        }
      });

      // Remove slug if it's empty (backend will generate it)
      if (cleanData.slug && cleanData.slug.trim() === '') {
        delete cleanData.slug;
      }

      console.log('Create organization - cleaned data:', JSON.stringify(cleanData, null, 2));
      return await organizationsApi.create(cleanData);
    },
    onSuccess: async () => {
      console.log('Organization created successfully, invalidating cache...');
      // Invalidate all organizations queries, including those with search terms
      await queryClient.invalidateQueries({ queryKey: ['organizations'], exact: false });
      // Refetch the organizations list to ensure fresh data
      await queryClient.refetchQueries({ queryKey: ['organizations'], exact: false });
      console.log('Cache invalidated and refetched');
      toast.success(t('pages.organizations.createSuccess'));
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Create organization error:', error);
      console.error('Error response:', error?.response);
      console.error('Error response data:', error?.response?.data);
      console.error('Error response status:', error?.response?.status);
      console.error('Error details:', error?.details);
      console.error('Error message:', error?.message);
      console.error('Error code:', error?.code);

      let errorMessage = 'Failed to create organization';

      // The error is already transformed by the response interceptor
      // error.details contains the error object from backend
      // error.message contains the extracted error message

      // Use the message from the transformed error
      if (error?.message && error.message !== 'Request failed with status code 400') {
        errorMessage = error.message;
      }

      // Check for validation details in error.details
      const errorDetails = error?.details;
      if (errorDetails) {
        // If details is an array (validation errors)
        if (Array.isArray(errorDetails)) {
          const validationErrors = errorDetails
            .map((d: any) => {
              const path = Array.isArray(d.path) ? d.path.join('.') : d.path || 'unknown';
              return `${path}: ${d.message}`;
            })
            .join(', ');
          errorMessage += ` (${validationErrors})`;
        }
        // If details has a details array (nested validation errors)
        else if (errorDetails.details && Array.isArray(errorDetails.details)) {
          const validationErrors = errorDetails.details
            .map((d: any) => {
              const path = Array.isArray(d.path) ? d.path.join('.') : d.path || 'unknown';
              return `${path}: ${d.message}`;
            })
            .join(', ');
          errorMessage += ` (${validationErrors})`;
        }
        // If details has a message
        else if (errorDetails.message && errorDetails.message !== errorMessage) {
          errorMessage = errorDetails.message;
        }
      }

      // Show error code if available
      if (error?.code) {
        errorMessage += ` [${error.code}]`;
      }

      toast.error(`Failed to create organization: ${errorMessage}`);
    },
  });

  const handleSubmit = (data: OrganizationFormValues) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('pages.organizations.createDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('pages.organizations.createDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <OrganizationForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isLoading={createMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
