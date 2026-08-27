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
import { toast } from 'sonner';
import { useState } from 'react';
import { Plus, Edit, Trash2, Target } from 'lucide-react';
import type { DetectionRule } from '@/types/entities';
import { ConfirmDialog } from '@/components/confirm-dialog';

interface DetectionRulesTabProps {
  vulnerabilityId: string;
}

export function DetectionRulesTab({ vulnerabilityId }: DetectionRulesTabProps) {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DetectionRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<DetectionRule | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['vulnerability', vulnerabilityId, 'detection-rules'],
    queryFn: () => vulnerabilitiesApi.getDetectionRules(vulnerabilityId),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<DetectionRule>) =>
      vulnerabilitiesApi.createDetectionRule(vulnerabilityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['vulnerability', vulnerabilityId, 'detection-rules'],
      });
      toast.success('Detection rule created successfully');
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to create detection rule: ${error?.message || 'Unknown error'}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => vulnerabilitiesApi.deleteDetectionRule(vulnerabilityId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['vulnerability', vulnerabilityId, 'detection-rules'],
      });
      toast.success('Detection rule deleted successfully');
      setDeletingRule(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to delete detection rule: ${error?.message || 'Unknown error'}`);
    },
  });

  // 将confidence转换为百分比用于显示
  const getConfidenceForDisplay = (confidence: number | undefined): number => {
    if (!confidence) return 0;
    // 如果小于等于1，说明是小数格式，转换为百分比
    if (confidence <= 1) return Math.round(confidence * 100);
    // 否则已经是百分比格式
    return confidence;
  };

  const getConfidenceColor = (confidence: number) => {
    // confidence应该是0-100的百分比
    const displayValue = getConfidenceForDisplay(confidence);
    if (displayValue >= 90) return 'text-green-600';
    if (displayValue >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'regex':
        return '🔍';
      case 'keyword':
        return '📝';
      case 'json_schema':
        return '📋';
      case 'llm':
        return '🤖';
      case 'knowledge_base':
        return '📚';
      default:
        return '🎯';
    }
  };

  if (isLoading) {
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
          <h3 className="text-lg font-semibold">Detection Rules</h3>
          <p className="text-sm text-muted-foreground">
            Rules for automated vulnerability detection and analysis
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Detection Rule</DialogTitle>
              <DialogDescription>Add a new rule for detecting this vulnerability</DialogDescription>
            </DialogHeader>
            <DetectionRuleForm
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
              onCancel={() => setIsCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {rules?.map((rule) => (
          <Card key={rule.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{getTypeIcon(rule.type)}</span>
                  <div>
                    <CardTitle className="text-base">{rule.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {rule.type}
                      </Badge>
                      <span
                        className={`text-xs font-medium ${getConfidenceColor(rule.confidence)}`}
                      >
                        {getConfidenceForDisplay(rule.confidence)}% confidence
                      </span>
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rule.enabled ? (
                    <Badge variant="default" className="text-xs">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Disabled
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditingRule(rule)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeletingRule(rule)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Pattern</p>
                <pre className="text-xs bg-muted p-3 rounded font-mono whitespace-pre-wrap border">
                  {rule.pattern}
                </pre>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Severity:{' '}
                  <Badge variant="outline" className="text-xs ml-1">
                    {rule.severity}
                  </Badge>
                </span>
                <span className="text-muted-foreground">
                  Created: {new Date(rule.createdAt).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}

        {(!rules || rules.length === 0) && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Target className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-semibold">No detection rules yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add rules to automatically detect this vulnerability in systems and applications.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      {editingRule && (
        <Dialog open={!!editingRule} onOpenChange={() => setEditingRule(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Detection Rule</DialogTitle>
              <DialogDescription>Update the detection rule configuration</DialogDescription>
            </DialogHeader>
            <DetectionRuleForm
              rule={editingRule}
              onSubmit={(data) => {
                // TODO: Add update API call
                console.log('Update rule:', data);
                setEditingRule(null);
              }}
              isLoading={false}
              onCancel={() => setEditingRule(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingRule}
        onOpenChange={(open) => {
          if (!open) setDeletingRule(null);
        }}
        handleConfirm={() => {
          if (deletingRule) {
            deleteMutation.mutate(deletingRule.id);
          }
        }}
        title="Delete Detection Rule"
        desc={
          <>
            Are you sure you want to delete the detection rule <strong>{deletingRule?.name}</strong>
            ?<br />
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

interface DetectionRuleFormProps {
  rule?: DetectionRule;
  onSubmit: (data: Partial<DetectionRule>) => void;
  isLoading: boolean;
  onCancel: () => void;
}

function DetectionRuleForm({ rule, onSubmit, isLoading, onCancel }: DetectionRuleFormProps) {
  // 后端存储的是0-1的小数，前端显示的是0-100的百分比
  // 从API获取的数据如果是小数（0-1），转换为百分比显示；如果是百分比（0-100），直接使用
  const getConfidenceForDisplay = (confidence: number | undefined): number => {
    if (!confidence) return 80;
    // 如果小于等于1，说明是小数格式，转换为百分比
    if (confidence <= 1) return Math.round(confidence * 100);
    // 否则已经是百分比格式
    return confidence;
  };

  const [formData, setFormData] = useState({
    name: rule?.name || '',
    type: rule?.type || ('regex' as const),
    pattern: rule?.pattern || '',
    severity: rule?.severity || 'medium',
    confidence: getConfidenceForDisplay(rule?.confidence),
    enabled: rule?.enabled ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 将百分比转换为小数（0-1）提交给后端
    const submitData = {
      ...formData,
      confidence: formData.confidence / 100, // 转换为0-1的小数
    };
    onSubmit(submitData);
  };

  const examples = {
    regex: '/api/v1/(users|admin)/.*',
    keyword: 'password OR secret OR token',
    json_schema: '{"type": "object", "properties": {"password": {"type": "string"}}}',
    llm: 'Check if the input contains sensitive data patterns',
    knowledge_base: 'Reference vulnerability database entry CVE-2023-XXXX',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Rule Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="type">Detection Type</Label>
          <Select
            value={formData.type}
            onValueChange={(value: any) => setFormData((prev) => ({ ...prev, type: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="regex">Regex Pattern</SelectItem>
              <SelectItem value="keyword">Keyword Match</SelectItem>
              <SelectItem value="json_schema">JSON Schema</SelectItem>
              <SelectItem value="llm">LLM Analysis</SelectItem>
              <SelectItem value="knowledge_base">Knowledge Base</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="pattern">Detection Pattern</Label>
        <Textarea
          id="pattern"
          value={formData.pattern}
          onChange={(e) => setFormData((prev) => ({ ...prev, pattern: e.target.value }))}
          rows={4}
          placeholder={examples[formData.type]}
          required
        />
        <p className="text-xs text-muted-foreground mt-1">
          Example for {formData.type}: {examples[formData.type]}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="severity">Severity</Label>
          <Select
            value={formData.severity}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, severity: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="confidence">Confidence (%)</Label>
          <Input
            id="confidence"
            type="number"
            min="0"
            max="100"
            value={formData.confidence}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, confidence: parseInt(e.target.value) || 0 }))
            }
            required
          />
        </div>

        <div className="flex items-center space-x-2 pt-8">
          <input
            type="checkbox"
            id="enabled"
            checked={formData.enabled}
            onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          <Label htmlFor="enabled">Enabled</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : rule ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
