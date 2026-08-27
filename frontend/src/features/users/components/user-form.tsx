/**
 * User Form Component - Based on TeamForm structure
 */

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { zodResolverV4 } from '@/lib/zod-resolver';
import { rolesApi } from '@/services/api/roles';
import { teamsApi } from '@/services/api/teams';
import type { User } from '@/types/entities';

const userFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  email: z.string().email('Invalid email address'),
  role: z.string().optional(),
  teamIds: z.array(z.string()).optional(),
  sendInvitation: z.boolean().optional(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

interface UserFormProps {
  user?: User;
  onSubmit: (data: UserFormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

// Role options will be loaded dynamically from API

export function UserForm({
  user,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitButtonText = 'Save User',
}: UserFormProps) {
  // Fetch teams for selection
  const { data: teamsData } = useQuery({
    queryKey: ['teams', 'list'],
    queryFn: () => teamsApi.list({ limit: 100 }), // Get all teams for selection
  });

  // Fetch roles for selection
  const { data: rolesData } = useQuery({
    queryKey: ['roles', 'list'],
    queryFn: () => rolesApi.list({ limit: 100 }), // Get all roles for selection
  });

  const teams = teamsData?.data || [];
  // rolesApi.list() returns { data: Role[], total, ... }; backend expects role name (string)
  const roles = rolesData?.data ?? [];

  const form = useForm<UserFormValues>({
    resolver: zodResolverV4<UserFormValues>(userFormSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      role: typeof user?.role === 'string' ? user.role : 'member',
      teamIds: user?.teams?.map((team: Record<string, unknown>) => team.id as string) || [],
      sendInvitation: true,
    },
  });

  const handleSubmit = (data: UserFormValues) => {
    onSubmit(data);
  };

  const selectedTeamIds = form.watch('teamIds') || [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter full name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Enter email address" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.name}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Choose the user's role in the organization</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="teamIds"
          render={({ field: _field }) => (
            <FormItem>
              <FormLabel>Teams</FormLabel>
              <FormControl>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {selectedTeamIds.length > 0
                        ? `${selectedTeamIds.length} team${selectedTeamIds.length > 1 ? 's' : ''} selected`
                        : 'Select teams...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search teams..." />
                      <CommandEmpty>No teams found.</CommandEmpty>
                      <CommandGroup>
                        {teams.map((team) => {
                          const isSelected = selectedTeamIds.includes(team.id);
                          return (
                            <CommandItem
                              key={team.id}
                              onSelect={() => {
                                const newValue = isSelected
                                  ? selectedTeamIds.filter((id) => id !== team.id)
                                  : [...selectedTeamIds, team.id];
                                form.setValue('teamIds', newValue);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  isSelected ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                              {team.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </FormControl>
              {selectedTeamIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedTeamIds.map((teamId) => {
                    const team = teams.find((t) => t.id === teamId);
                    return team ? (
                      <Badge key={teamId} variant="secondary" className="text-xs">
                        {team.name}
                        <button
                          type="button"
                          className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                          onClick={() => {
                            const newValue = selectedTeamIds.filter((id) => id !== teamId);
                            form.setValue('teamIds', newValue);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
              <FormDescription>Select teams that this user should be a member of</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {!user && (
          <FormField
            control={form.control}
            name="sendInvitation"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Send invitation email</FormLabel>
                  <FormDescription>
                    Send an email invitation to the user with login instructions
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        )}

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : submitButtonText}
          </Button>
        </div>
      </form>
    </Form>
  );
}
