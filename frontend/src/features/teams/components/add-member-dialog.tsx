/**
 * Add Member Dialog Component
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { usersApi } from '@/services/api/users';
import { teamsApi } from '@/services/api/teams';
import { toast } from 'sonner';
import { User, Mail, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  existingMemberIds: string[];
}

export function AddMemberDialog({
  open,
  onOpenChange,
  teamId,
  existingMemberIds,
}: AddMemberDialogProps) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch users
  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users', searchTerm],
    queryFn: async () => {
      const result = await usersApi.list({ search: searchTerm || undefined, limit: 100 });
      return result;
    },
    enabled: open,
  });

  // Filter out existing members
  const availableUsers =
    usersData?.data?.filter((user) => !existingMemberIds.includes(user.id)) || [];

  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => teamsApi.addMember(teamId, userId),
    onSuccess: () => {
      console.log('Member added successfully, invalidating queries...');
      // Invalidate and refetch team data
      queryClient.invalidateQueries({ queryKey: ['team', teamId], exact: false });
      queryClient.invalidateQueries({ queryKey: ['teams'], exact: false });
      // Force refetch to ensure data is up to date
      queryClient.refetchQueries({ queryKey: ['team', teamId] });
      toast.success('Member added successfully');
      setSelectedUserId('');
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Add member error:', {
        error,
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      let errorMessage = 'Failed to add member';
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

  const handleSubmit = () => {
    if (!selectedUserId) {
      toast.error('Please select a user');
      return;
    }
    addMemberMutation.mutate(selectedUserId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>Select a user to add to this team.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Search Users</label>
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Select User</label>
            {isLoadingUsers ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : availableUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center border rounded-md">
                <User className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium mb-1">No users available</p>
                <p className="text-xs text-muted-foreground">
                  {searchTerm
                    ? 'No users found matching your search.'
                    : existingMemberIds.length > 0
                      ? 'All users are already members of this team.'
                      : 'No users found in your organization.'}
                </p>
              </div>
            ) : (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name || user.email}
                            className="h-6 w-6 rounded-full"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-3 w-3 text-primary" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{user.name || 'Unknown User'}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedUserId('');
              setSearchTerm('');
              onOpenChange(false);
            }}
            disabled={addMemberMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedUserId || addMemberMutation.isPending}>
            {addMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
