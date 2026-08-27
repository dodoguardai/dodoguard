import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useState } from 'react';
import { Plus, Bot, Edit, Trash2, Code, Settings } from 'lucide-react';
import type { LlmReviewInstruction } from '@/types/entities';

interface LLMReviewTabProps {
  vulnerabilityId: string;
}

export function LLMReviewTab({ vulnerabilityId }: LLMReviewTabProps) {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<LlmReviewInstruction | null>(null);

  const { data: instructions = [], isLoading: instructionsLoading } = useQuery({
    queryKey: ['vulnerability', vulnerabilityId, 'llm-review-instructions'],
    queryFn: () => vulnerabilitiesApi.getLlmReviewInstructions(vulnerabilityId),
  });

  const { data: vulnerability, isLoading: vulnLoading } = useQuery({
    queryKey: ['vulnerability', vulnerabilityId],
    queryFn: () => vulnerabilitiesApi.get(vulnerabilityId),
  });

  const { data: attackCommands } = useQuery({
    queryKey: ['vulnerability', vulnerabilityId, 'attack-commands'],
    queryFn: () => vulnerabilitiesApi.getAttackCommands(vulnerabilityId),
  });

  const { data: detectionRules } = useQuery({
    queryKey: ['vulnerability', vulnerabilityId, 'detection-rules'],
    queryFn: () => vulnerabilitiesApi.getDetectionRules(vulnerabilityId),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<LlmReviewInstruction>) => {
      return vulnerabilitiesApi.createLlmReviewInstruction(vulnerabilityId, {
        name: data.name ?? '',
        type: data.type ?? 'system_prompt',
        content: data.content ?? '',
        description: data.description ?? undefined,
        model: data.model ?? undefined,
        temperature: data.temperature ?? undefined,
        maxTokens: data.maxTokens ?? undefined,
        enabled: data.enabled,
        priority: data.priority,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['vulnerability', vulnerabilityId, 'llm-review-instructions'],
      });
      toast.success('LLM instruction created successfully');
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to create LLM instruction: ${error?.message || 'Unknown error'}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      instructionId,
      data,
    }: {
      instructionId: string;
      data: Partial<LlmReviewInstruction>;
    }) => {
      return vulnerabilitiesApi.updateLlmReviewInstruction(vulnerabilityId, instructionId, {
        name: data.name,
        type: data.type,
        content: data.content,
        description: data.description ?? undefined,
        model: data.model ?? undefined,
        temperature: data.temperature ?? undefined,
        maxTokens: data.maxTokens ?? undefined,
        enabled: data.enabled,
        priority: data.priority,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['vulnerability', vulnerabilityId, 'llm-review-instructions'],
      });
      toast.success('LLM instruction updated successfully');
      setEditingInstruction(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to update LLM instruction: ${error?.message || 'Unknown error'}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (instructionId: string) => {
      await vulnerabilitiesApi.deleteLlmReviewInstruction(vulnerabilityId, instructionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['vulnerability', vulnerabilityId, 'llm-review-instructions'],
      });
      toast.success('LLM instruction deleted successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete LLM instruction: ${error?.message || 'Unknown error'}`);
    },
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'system_prompt':
        return '🎭';
      case 'detection_instruction':
        return '🔍';
      case 'evaluation_criteria':
        return '📊';
      case 'context_analysis':
        return '🔬';
      case 'false_positive_filter':
        return '🛡️';
      default:
        return '🤖';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'system_prompt':
        return 'bg-blue-100 text-blue-800';
      case 'detection_instruction':
        return 'bg-green-100 text-green-800';
      case 'evaluation_criteria':
        return 'bg-purple-100 text-purple-800';
      case 'context_analysis':
        return 'bg-orange-100 text-orange-800';
      case 'false_positive_filter':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (instructionsLoading || vulnLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">LLM Review Instructions</h3>
          <p className="text-sm text-muted-foreground">
            Manage AI instructions for automated vulnerability detection and analysis
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Instruction
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Create LLM Review Instruction</DialogTitle>
              <DialogDescription>
                Add a new instruction for LLM-based vulnerability analysis
              </DialogDescription>
            </DialogHeader>
            <LLMInstructionForm
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
              onCancel={() => setIsCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Alert>
        <Bot className="h-4 w-4" />
        <AlertDescription>
          Configure specialized prompts and instructions for AI models to detect and analyze this
          specific vulnerability type. These instructions help LLMs understand the context,
          patterns, and evaluation criteria.
        </AlertDescription>
      </Alert>

      {/* LLM Instructions List */}
      <div className="grid gap-4">
        {instructions?.map((instruction) => (
          <Card key={instruction.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{getTypeIcon(instruction.type)}</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {instruction.name}
                      <Badge className={`text-xs ${getTypeColor(instruction.type)}`}>
                        {instruction.type.replace('_', ' ')}
                      </Badge>
                    </CardTitle>
                    {instruction.description && (
                      <CardDescription className="mt-1">{instruction.description}</CardDescription>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {instruction.enabled ? (
                    <Badge variant="default" className="text-xs">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Disabled
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingInstruction(instruction)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this instruction?')) {
                        deleteMutation.mutate(instruction.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Instruction Content
                </p>
                <pre className="text-xs bg-muted p-3 rounded font-mono whitespace-pre-wrap border max-h-32 overflow-y-auto">
                  {instruction.content}
                </pre>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                {instruction.model && (
                  <div>
                    <p className="font-medium text-muted-foreground">Model</p>
                    <p>{instruction.model}</p>
                  </div>
                )}
                {instruction.temperature !== undefined && (
                  <div>
                    <p className="font-medium text-muted-foreground">Temperature</p>
                    <p>{instruction.temperature}</p>
                  </div>
                )}
                {instruction.maxTokens && (
                  <div>
                    <p className="font-medium text-muted-foreground">Max Tokens</p>
                    <p>{instruction.maxTokens}</p>
                  </div>
                )}
                <div>
                  <p className="font-medium text-muted-foreground">Priority</p>
                  <p>{instruction.priority}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {(!instructions || instructions.length === 0) && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-semibold">No LLM instructions yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add specialized prompts and instructions to help AI models detect this
                  vulnerability type.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Analysis Context */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Vulnerability Context
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Type: {vulnerability?.type}</Badge>
              <Badge variant="outline">Risk: {vulnerability?.riskLevel}</Badge>
            </div>
            <p className="text-sm">
              <strong>Description:</strong> {vulnerability?.description}
            </p>
            <p className="text-sm">
              <strong>Impact:</strong> {vulnerability?.impactScope}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Analysis Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <p>
                <strong>Attack Commands:</strong> {attackCommands?.length || 0} available
              </p>
              <p>
                <strong>Detection Rules:</strong> {detectionRules?.length || 0} configured
              </p>
              <p>
                <strong>LLM Instructions:</strong> {instructions?.length || 0} active
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      {editingInstruction && (
        <Dialog open={!!editingInstruction} onOpenChange={() => setEditingInstruction(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Edit LLM Review Instruction</DialogTitle>
              <DialogDescription>Update the LLM instruction configuration</DialogDescription>
            </DialogHeader>
            <LLMInstructionForm
              instruction={editingInstruction}
              onSubmit={(data) =>
                updateMutation.mutate({
                  instructionId: editingInstruction.id,
                  data,
                })
              }
              isLoading={updateMutation.isPending}
              onCancel={() => setEditingInstruction(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface LLMInstructionFormProps {
  instruction?: LlmReviewInstruction;
  onSubmit: (data: Partial<LlmReviewInstruction>) => void;
  isLoading: boolean;
  onCancel: () => void;
}

function LLMInstructionForm({
  instruction,
  onSubmit,
  isLoading,
  onCancel,
}: LLMInstructionFormProps) {
  const [formData, setFormData] = useState({
    name: instruction?.name || '',
    type: instruction?.type || ('system_prompt' as const),
    content: instruction?.content || '',
    description: instruction?.description || '',
    model: instruction?.model || '',
    temperature: instruction?.temperature || 0.7,
    maxTokens: instruction?.maxTokens || 1000,
    enabled: instruction?.enabled ?? true,
    priority: instruction?.priority || 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const instructionTemplates = {
    system_prompt: `You are an expert security analyst specializing in [VULNERABILITY_TYPE] vulnerabilities.
Your task is to analyze inputs and identify potential security threats.

Guidelines:
- Focus on [SPECIFIC_PATTERNS]
- Consider both direct and indirect attack vectors
- Evaluate the severity and exploitability
- Provide clear, actionable findings

Remember: Accuracy is crucial. False positives can be as damaging as undetected vulnerabilities.`,

    detection_instruction: `Analyze the following input for [VULNERABILITY_TYPE] patterns:

1. Check for [SPECIFIC_INDICATORS]
2. Evaluate context and encoding
3. Assess potential bypass techniques
4. Determine confidence level

Return findings in structured format with evidence.`,

    evaluation_criteria: `Evaluate this [VULNERABILITY_TYPE] detection result:

Scoring Criteria:
- Pattern Match Accuracy: [0-10]
- Context Relevance: [0-10]
- False Positive Risk: [0-10]
- Severity Assessment: [0-10]

Provide detailed reasoning for each score.`,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Instruction Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="type">Instruction Type</Label>
          <Select
            value={formData.type}
            onValueChange={(value: any) => setFormData((prev) => ({ ...prev, type: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system_prompt">System Prompt</SelectItem>
              <SelectItem value="detection_instruction">Detection Instruction</SelectItem>
              <SelectItem value="evaluation_criteria">Evaluation Criteria</SelectItem>
              <SelectItem value="context_analysis">Context Analysis</SelectItem>
              <SelectItem value="false_positive_filter">False Positive Filter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Brief description of this instruction"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="content">Instruction Content</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setFormData((prev) => ({
                ...prev,
                content:
                  instructionTemplates[formData.type as keyof typeof instructionTemplates] || '',
              }))
            }
          >
            Load Template
          </Button>
        </div>
        <Textarea
          id="content"
          value={formData.content}
          onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
          rows={8}
          placeholder="Enter the LLM instruction/prompt content"
          required
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label htmlFor="model">AI Model (Optional)</Label>
          <Select
            value={formData.model}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, model: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4">GPT-4</SelectItem>
              <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
              <SelectItem value="claude-3">Claude-3</SelectItem>
              <SelectItem value="claude-2">Claude-2</SelectItem>
              <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="temperature">Temperature</Label>
          <Input
            id="temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={formData.temperature}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, temperature: parseFloat(e.target.value) || 0 }))
            }
          />
        </div>

        <div>
          <Label htmlFor="maxTokens">Max Tokens</Label>
          <Input
            id="maxTokens"
            type="number"
            min="100"
            max="10000"
            value={formData.maxTokens}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) || 1000 }))
            }
          />
        </div>

        <div>
          <Label htmlFor="priority">Priority</Label>
          <Input
            id="priority"
            type="number"
            min="0"
            max="100"
            value={formData.priority}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))
            }
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="enabled"
          checked={formData.enabled}
          onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
        />
        <Label htmlFor="enabled">Enable this instruction</Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : instruction ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
