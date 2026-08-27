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
import { useState, useRef } from 'react';
import { Plus, Upload, Code, Trash2, Edit } from 'lucide-react';
import type { AttackCommand } from '@/types/entities';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/confirm-dialog';

interface AttackCommandsTabProps {
  vulnerabilityId: string;
}

export function AttackCommandsTab({ vulnerabilityId }: AttackCommandsTabProps) {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<AttackCommand | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [deletingCommand, setDeletingCommand] = useState<AttackCommand | null>(null);

  const { data: commands, isLoading } = useQuery({
    queryKey: ['vulnerability', vulnerabilityId, 'attack-commands'],
    queryFn: () => vulnerabilitiesApi.getAttackCommands(vulnerabilityId),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<AttackCommand>) =>
      vulnerabilitiesApi.createAttackCommand(vulnerabilityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['vulnerability', vulnerabilityId, 'attack-commands'],
      });
      toast.success('Attack command created successfully');
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to create attack command: ${error?.message || 'Unknown error'}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ commandId, data }: { commandId: string; data: Partial<AttackCommand> }) =>
      vulnerabilitiesApi.updateAttackCommand(vulnerabilityId, commandId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['vulnerability', vulnerabilityId, 'attack-commands'],
      });
      toast.success('Attack command updated successfully');
      setEditingCommand(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to update attack command: ${error?.message || 'Unknown error'}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commandId: string) =>
      vulnerabilitiesApi.deleteAttackCommand(vulnerabilityId, commandId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['vulnerability', vulnerabilityId, 'attack-commands'],
      });
      toast.success('Attack command deleted successfully');
      setDeletingCommand(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to delete attack command: ${error?.message || 'Unknown error'}`);
    },
  });

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'default';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
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
          <h3 className="text-lg font-semibold">Attack Commands Database</h3>
          <p className="text-sm text-muted-foreground">
            Manage attack commands for vulnerability testing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Import
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import Attack Commands</DialogTitle>
                <DialogDescription>
                  Upload a JSON or YAML file containing attack commands
                </DialogDescription>
              </DialogHeader>
              <ImportCommandsForm
                vulnerabilityId={vulnerabilityId}
                existingCommands={commands || []}
                onSuccess={() => {
                  setIsImportDialogOpen(false);
                  queryClient.invalidateQueries({
                    queryKey: ['vulnerability', vulnerabilityId, 'attack-commands'],
                  });
                }}
                onCancel={() => setIsImportDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Command
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Attack Command</DialogTitle>
                <DialogDescription>
                  Add a new attack command for this vulnerability
                </DialogDescription>
              </DialogHeader>
              <AttackCommandForm
                onSubmit={(data) => createMutation.mutate(data)}
                isLoading={createMutation.isPending}
                onCancel={() => setIsCreateDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {commands?.map((command) => (
          <Card key={command.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{command.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={getRiskColor(command.riskLevel) as any}>
                    {command.riskLevel}
                  </Badge>
                  {!command.metadata?.builtIn && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setEditingCommand(command)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingCommand(command)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <CardDescription className="flex items-center gap-2">
                <Code className="h-3 w-3" />
                {command.attackMode}
                {command.metadata && (command.metadata as { builtIn?: boolean }).builtIn && (
                  <Badge variant="secondary" className="text-xs">
                    Built-in
                  </Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Command</p>
                <pre className="text-xs bg-muted p-2 rounded font-mono whitespace-pre-wrap">
                  {command.content}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Expected Success</p>
                <p className="text-xs text-green-600">{command.expectedSuccess}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Non-Vulnerability</p>
                <p className="text-xs text-red-600">{command.nonVulnerability}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingCommand}
        onOpenChange={(open) => {
          if (!open) setEditingCommand(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Attack Command</DialogTitle>
            <DialogDescription>Update the attack command details</DialogDescription>
          </DialogHeader>
          {editingCommand && (
            <AttackCommandForm
              command={editingCommand}
              onSubmit={(data) => {
                updateMutation.mutate({
                  commandId: editingCommand.id,
                  data,
                });
              }}
              isLoading={updateMutation.isPending}
              onCancel={() => setEditingCommand(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingCommand}
        onOpenChange={(open) => {
          if (!open) setDeletingCommand(null);
        }}
        handleConfirm={() => {
          if (deletingCommand) {
            deleteMutation.mutate(deletingCommand.id);
          }
        }}
        title="Delete Attack Command"
        desc={
          <>
            Are you sure you want to delete the attack command{' '}
            <strong>{deletingCommand?.name}</strong>?<br />
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

interface AttackCommandFormProps {
  command?: AttackCommand;
  onSubmit: (data: Partial<AttackCommand>) => void;
  isLoading: boolean;
  onCancel: () => void;
}

function AttackCommandForm({ command, onSubmit, isLoading, onCancel }: AttackCommandFormProps) {
  const [formData, setFormData] = useState({
    name: command?.name || '',
    content: command?.content || '',
    attackMode: command?.attackMode || ('direct' as const),
    expectedSuccess: command?.expectedSuccess || '',
    nonVulnerability: command?.nonVulnerability || '',
    riskLevel: command?.riskLevel || ('medium' as const),
    enabled: command?.enabled ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="attackMode">Attack Mode</Label>
          <Select
            value={formData.attackMode}
            onValueChange={(value: any) => setFormData((prev) => ({ ...prev, attackMode: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
              <SelectItem value="conversation">Conversation</SelectItem>
              <SelectItem value="composite">Composite</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="content">Command Content</Label>
        <Textarea
          id="content"
          value={formData.content}
          onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
          rows={6}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="riskLevel">Risk Level</Label>
          <Select
            value={formData.riskLevel}
            onValueChange={(value: any) => setFormData((prev) => ({ ...prev, riskLevel: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="enabled"
            checked={formData.enabled}
            onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          <Label htmlFor="enabled">Enabled</Label>
        </div>
      </div>

      <div>
        <Label htmlFor="expectedSuccess">Expected Success Pattern</Label>
        <Input
          id="expectedSuccess"
          value={formData.expectedSuccess}
          onChange={(e) => setFormData((prev) => ({ ...prev, expectedSuccess: e.target.value }))}
          placeholder="Pattern indicating successful attack"
        />
      </div>

      <div>
        <Label htmlFor="nonVulnerability">Non-Vulnerability Pattern</Label>
        <Input
          id="nonVulnerability"
          value={formData.nonVulnerability}
          onChange={(e) => setFormData((prev) => ({ ...prev, nonVulnerability: e.target.value }))}
          placeholder="Pattern indicating attack did not work"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : command ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

interface ImportCommandsFormProps {
  vulnerabilityId: string;
  existingCommands: AttackCommand[];
  onSuccess: () => void;
  onCancel: () => void;
}

function ImportCommandsForm({
  vulnerabilityId,
  existingCommands,
  onSuccess,
  onCancel,
}: ImportCommandsFormProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: Partial<AttackCommand>) =>
      vulnerabilitiesApi.createAttackCommand(vulnerabilityId, data),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setIsImporting(true);

    try {
      const text = await file.text();
      let parsed: any;

      // 尝试解析 JSON
      try {
        parsed = JSON.parse(text);
      } catch (parseError) {
        throw new Error('Invalid JSON format. Please ensure the file is valid JSON.');
      }

      // 确保是数组格式
      let commandsToImport: any[] = [];
      if (Array.isArray(parsed)) {
        commandsToImport = parsed;
      } else if (parsed.commands && Array.isArray(parsed.commands)) {
        commandsToImport = parsed.commands;
      } else {
        throw new Error(
          'File must contain an array of commands or an object with a "commands" array',
        );
      }

      if (commandsToImport.length === 0) {
        throw new Error('No commands found in file');
      }

      // 验证必需字段
      commandsToImport.forEach((cmd, index) => {
        if (!cmd.content || !cmd.content.trim()) {
          throw new Error(`Command at index ${index} is missing "content" field`);
        }
      });

      // 检查导入数据中的重复 content（忽略大小写和空白）
      const normalizeContent = (content: string) => content.trim().toLowerCase();
      const contentMap = new Map<string, number[]>();

      commandsToImport.forEach((cmd, index) => {
        const normalizedContent = normalizeContent(cmd.content);
        if (!contentMap.has(normalizedContent)) {
          contentMap.set(normalizedContent, []);
        }
        contentMap.get(normalizedContent)!.push(index);
      });

      const duplicatesInFile: string[] = [];
      contentMap.forEach((indices, _normalizedContent) => {
        if (indices.length > 1) {
          const originalContent = commandsToImport[indices[0]].content;
          const preview =
            originalContent.length > 50
              ? originalContent.substring(0, 50) + '...'
              : originalContent;
          duplicatesInFile.push(
            `Content "${preview}" appears ${indices.length} times (at indices: ${indices.join(', ')})`,
          );
        }
      });

      if (duplicatesInFile.length > 0) {
        throw new Error(
          `Duplicate command content found in import file:\n\n${duplicatesInFile.join('\n')}\n\nImport is blocked. Please remove duplicates and try again.`,
        );
      }

      // 检查与现有命令的重复
      const existingContents = new Set(
        existingCommands.map((cmd) => normalizeContent(cmd.content)),
      );

      const duplicatesWithExisting: string[] = [];
      const commandsToCreate: any[] = [];

      commandsToImport.forEach((cmd, index) => {
        const normalizedContent = normalizeContent(cmd.content);

        if (existingContents.has(normalizedContent)) {
          const existingCmd = existingCommands.find(
            (ec) => normalizeContent(ec.content) === normalizedContent,
          );
          const preview =
            cmd.content.length > 50 ? cmd.content.substring(0, 50) + '...' : cmd.content;
          duplicatesWithExisting.push(
            `Command at index ${index} (${cmd.name || 'Unnamed'}): "${preview}"\n  Already exists as: "${existingCmd?.name || 'Unnamed'}"`,
          );
        } else {
          commandsToCreate.push(cmd);
          existingContents.add(normalizedContent); // 避免导入数据内部的重复
        }
      });

      if (duplicatesWithExisting.length > 0) {
        throw new Error(
          `Duplicate command content found with existing commands:\n\n${duplicatesWithExisting.join('\n\n')}\n\nImport is blocked. Please remove duplicates and try again.`,
        );
      }

      if (commandsToCreate.length === 0) {
        throw new Error('All commands in the file already exist. No new commands to import.');
      }

      // 批量创建命令
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const cmd of commandsToCreate) {
        try {
          await createMutation.mutateAsync({
            name: cmd.name || `Imported Command ${Date.now()}`,
            content: cmd.content.trim(),
            attackMode: cmd.attackMode || 'direct',
            expectedSuccess: cmd.expectedSuccess || '',
            nonVulnerability: cmd.nonVulnerability || '',
            riskLevel: cmd.riskLevel || 'medium',
            enabled: cmd.enabled !== false,
            metadata: cmd.metadata || {},
          });
          successCount++;
        } catch (error: any) {
          errorCount++;
          errors.push(
            `Failed to import "${cmd.name || 'Unnamed'}": ${error?.message || 'Unknown error'}`,
          );
        }
      }

      if (errorCount > 0) {
        toast.warning(
          `Imported ${successCount} command(s), ${errorCount} failed. Check console for details.`,
        );
        console.error('Import errors:', errors);
      } else {
        toast.success(`Successfully imported ${successCount} command(s)`);
      }

      queryClient.invalidateQueries({
        queryKey: ['vulnerability', vulnerabilityId, 'attack-commands'],
      });
      onSuccess();
    } catch (error: any) {
      console.error('Import error:', error);
      setImportError(error.message || 'Failed to import commands');
      toast.error(error.message || 'Failed to import commands');
    } finally {
      setIsImporting(false);
      // 重置文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4">
      {importError && (
        <Alert variant="destructive">
          <AlertDescription className="whitespace-pre-wrap text-sm">{importError}</AlertDescription>
        </Alert>
      )}
      <div>
        <Label htmlFor="import-file">Select File (JSON)</Label>
        <Input
          id="import-file"
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          disabled={isImporting}
          className="mt-2"
        />
        <p className="text-xs text-muted-foreground mt-2">
          File should contain an array of commands or an object with a "commands" array. Each
          command must have "content" field. Duplicate content will be rejected.
        </p>
        <p className="text-xs text-muted-foreground mt-1 font-medium">Example format:</p>
        <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
          {`[
  {
    "name": "Command Name",
    "content": "Command content here",
    "attackMode": "direct",
    "riskLevel": "medium"
  }
]`}
        </pre>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isImporting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
