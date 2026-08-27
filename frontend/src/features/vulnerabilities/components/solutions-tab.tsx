import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useState } from 'react';
import { Plus, Shield, Trash2 } from 'lucide-react';
import type { Solution } from '@/types/entities';
import { ConfirmDialog } from '@/components/confirm-dialog';

interface SolutionsTabProps {
  vulnerabilityId: string;
}

export function SolutionsTab({ vulnerabilityId }: SolutionsTabProps) {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deletingSolution, setDeletingSolution] = useState<Solution | null>(null);

  const { data: solutions, isLoading } = useQuery({
    queryKey: ['vulnerability', vulnerabilityId, 'solutions'],
    queryFn: () => vulnerabilitiesApi.getSolutions(vulnerabilityId),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Solution>) =>
      vulnerabilitiesApi.createSolution(vulnerabilityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vulnerability', vulnerabilityId, 'solutions'] });
      toast.success('Solution created successfully');
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to create solution: ${error?.message || 'Unknown error'}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (solutionId: string) =>
      vulnerabilitiesApi.deleteSolution(vulnerabilityId, solutionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vulnerability', vulnerabilityId, 'solutions'] });
      toast.success('Solution deleted successfully');
      setDeletingSolution(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to delete solution: ${error?.message || 'Unknown error'}`);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Solutions</h3>
          <p className="text-sm text-muted-foreground">
            Mitigation strategies and remediation steps
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Solution
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Create Solution</DialogTitle>
              <DialogDescription>Add a new solution for this vulnerability</DialogDescription>
            </DialogHeader>
            <SolutionForm
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
              onCancel={() => setIsCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        {solutions?.map((solution) => (
          <Card key={solution.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-green-600" />
                    {solution.title}
                  </CardTitle>
                  <CardDescription>{solution.description}</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDeletingSolution(solution)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {solution.steps?.map((step, _index) => (
                  <div key={step.order} className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">
                      {step.order}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{step.title}</h4>
                      <p className="text-sm text-muted-foreground mb-2">{step.description}</p>
                      {step.commands && step.commands.length > 0 && (
                        <div className="bg-muted p-3 rounded-md">
                          <p className="text-xs font-medium mb-2">Commands:</p>
                          {step.commands.map((cmd, cmdIndex) => (
                            <pre
                              key={cmdIndex}
                              className="text-xs font-mono bg-background p-2 rounded border whitespace-pre-wrap"
                            >
                              {cmd}
                            </pre>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {(!solutions || solutions.length === 0) && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-semibold">No solutions yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add mitigation strategies and remediation steps for this vulnerability.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingSolution}
        onOpenChange={(open) => {
          if (!open) setDeletingSolution(null);
        }}
        handleConfirm={() => {
          if (deletingSolution) {
            deleteMutation.mutate(deletingSolution.id);
          }
        }}
        title="Delete Solution"
        desc={
          <>
            Are you sure you want to delete the solution <strong>{deletingSolution?.title}</strong>?
            <br />
            This action cannot be undone.
          </>
        }
        confirmText="Delete"
        destructive
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

interface SolutionFormProps {
  onSubmit: (data: Partial<Solution>) => void;
  isLoading: boolean;
  onCancel: () => void;
}

function SolutionForm({ onSubmit, isLoading, onCancel }: SolutionFormProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    steps: [] as Array<{ order: number; title: string; description: string; commands?: string[] }>,
  });

  const addStep = () => {
    setFormData((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          order: prev.steps.length + 1,
          title: '',
          description: '',
          commands: [],
        },
      ],
    }));
  };

  const updateStep = (index: number, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? { ...step, [field]: value } : step)),
    }));
  };

  const removeStep = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      steps: prev.steps
        .filter((_, i) => i !== index)
        .map((step, i) => ({
          ...step,
          order: i + 1,
        })),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          rows={3}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <Label>Remediation Steps</Label>
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="mr-2 h-4 w-4" />
            Add Step
          </Button>
        </div>

        <div className="space-y-4">
          {formData.steps.map((step, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Step {step.order}</CardTitle>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(index)}>
                    Remove
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Step Title</Label>
                  <Input
                    value={step.title}
                    onChange={(e) => updateStep(index, 'title', e.target.value)}
                    placeholder="e.g., Update software version"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={step.description}
                    onChange={(e) => updateStep(index, 'description', e.target.value)}
                    rows={2}
                    placeholder="Detailed instructions for this step"
                  />
                </div>
                <div>
                  <Label>Commands (optional)</Label>
                  <Textarea
                    value={step.commands?.join('\n') || ''}
                    onChange={(e) =>
                      updateStep(
                        index,
                        'commands',
                        e.target.value.split('\n').filter((cmd) => cmd.trim()),
                      )
                    }
                    rows={3}
                    placeholder="One command per line"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Solution'}
        </Button>
      </div>
    </form>
  );
}
