/**
 * Create Team Dialog Component
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { teamsApi } from '@/services/api/teams';
import { toast } from 'sonner';
import { TeamForm, type TeamFormValues } from './team-form';

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTeamDialog({ open, onOpenChange }: CreateTeamDialogProps) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: TeamFormValues) => {
      // Clean up the data before sending
      const cleanData: any = {
        name: data.name.trim(),
        logo: data.logo || 'Users',
      };

      // Add optional fields only if they have values
      if (data.description && data.description.trim()) {
        cleanData.description = data.description.trim();
      }

      return await teamsApi.create(cleanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team created successfully');
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Create team error:', error);
      const errorMessage =
        error?.response?.data?.error?.message || error?.message || 'Failed to create team';
      toast.error(`Failed to create team: ${errorMessage}`);
    },
  });

  const handleSubmit = (data: TeamFormValues) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Team</DialogTitle>
          <DialogDescription>
            Create a new team to organize members and manage permissions.
          </DialogDescription>
        </DialogHeader>
        <TeamForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isLoading={createMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
