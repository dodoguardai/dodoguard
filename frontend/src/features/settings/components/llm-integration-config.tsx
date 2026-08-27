/**
 * LLM Integration Configuration Component
 * Used in Enterprise Settings to configure LLM models for detection
 */

import { useEffect, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, CheckCircle2, Edit, Plus, TestTube, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { isQwen3ModelName, mergeQwen3ThinkingDisablePassthrough } from '@/lib/qwen3-model-defaults';
import { systemConfigApi } from '@/services/api/system-config';
import type { IntegrationConfig } from '@/types/entities';

export function LLMIntegrationConfig() {
  const queryClient = useQueryClient();
  const [editingIntegration, setEditingIntegration] = useState<IntegrationConfig | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch LLM integrations
  const {
    data: integrations = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['llm-integrations'],
    queryFn: async () => {
      try {
        const allIntegrations = await systemConfigApi.getIntegrations();
        console.log('[LLM Integration Config] Fetched integrations:', allIntegrations);
        console.log('[LLM Integration Config] Integrations count:', allIntegrations.length);
        console.log(
          '[LLM Integration Config] Integration types:',
          allIntegrations.map((i) => ({ id: i.id, type: i.type, name: i.name })),
        );

        const llmIntegrations = allIntegrations.filter((integration) => integration.type === 'llm');
        console.log('[LLM Integration Config] Filtered LLM integrations:', llmIntegrations);
        console.log('[LLM Integration Config] LLM integrations count:', llmIntegrations.length);
        return llmIntegrations;
      } catch (error) {
        console.error('[LLM Integration Config] Query error:', error);
        throw error;
      }
    },
  });

  // Debug: Log current state
  console.log('[LLM Integration Config] Current state:', {
    isLoading,
    integrationsCount: integrations.length,
    integrations: integrations,
    queryError: queryError,
  });

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: (data: Partial<IntegrationConfig>) => {
      if (editingIntegration?.id) {
        return systemConfigApi.updateIntegration(editingIntegration.id, data);
      }
      return systemConfigApi.createIntegration(data);
    },
    onSuccess: async (data) => {
      console.log('[Create/Update Integration] Success, new data:', data);

      // Close dialog first
      setIsDialogOpen(false);
      setEditingIntegration(null);

      // Invalidate and refetch queries to update the list
      await queryClient.invalidateQueries({ queryKey: ['llm-integrations'] });
      // Force refetch to ensure we get the latest data
      const refetchResult = await queryClient.refetchQueries({ queryKey: ['llm-integrations'] });
      console.log('[Create/Update Integration] Refetch result:', refetchResult);

      toast.success(editingIntegration ? 'Integration updated' : 'Integration created');
    },
    onError: (error: any) => {
      console.error('[Create/Update Integration] Error:', error);

      // Extract detailed error message from API response
      let errorMessage = 'Unknown error';
      if (error?.response?.data) {
        const errorData = error.response.data;
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error?.message) {
        errorMessage = error.error.message;
      }

      console.error('[Create/Update Integration] Extracted error message:', errorMessage);
      toast.error(`Failed to save: ${errorMessage}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => systemConfigApi.deleteIntegration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['llm-integrations'] }); // Also invalidate step5 query
      toast.success('Integration deleted');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete: ${error?.message || 'Unknown error'}`);
    },
  });

  // Toggle enabled mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      systemConfigApi.updateIntegration(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['llm-integrations'] }); // Also invalidate step5 query
      toast.success('Integration updated');
    },
    onError: (error: any) => {
      toast.error(`Failed to update: ${error?.message || 'Unknown error'}`);
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: (id: string) => systemConfigApi.testIntegration(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['llm-integrations'] });
      if (result.success) {
        toast.success(`Connection test successful: ${result.message}`);
      } else {
        toast.error(`Connection test failed: ${result.message}`);
      }
    },
    onError: (error: any) => {
      // Extract detailed error message from API response
      let errorMessage = 'Unknown error';

      // Try multiple ways to extract error message
      if (error?.response?.data) {
        const errorData = error.response.data;
        // Check for standard API error format: {success: false, error: {message: ...}}
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
        // Check for direct message field
        else if (errorData.message) {
          errorMessage = errorData.message;
        }
        // Check if error is a string
        else if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        }
        // Check for data field (when success is true but test failed)
        else if (errorData.data?.message) {
          errorMessage = errorData.data.message;
        }
        // Last resort: stringify the error object
        else if (errorData.error) {
          errorMessage =
            typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
        }
      }
      // Check for error in the error object itself
      else if (error?.error?.message) {
        errorMessage = error.error.message;
      }
      // Check for direct message
      else if (error?.message) {
        errorMessage = error.message;
      }
      // Check for details field
      else if (error?.details?.message) {
        errorMessage = error.details.message;
      }

      console.error('[Test Connection] Error details:', {
        error,
        errorMessage,
        responseData: error?.response?.data,
      });

      toast.error(`Connection test failed: ${errorMessage}`);
    },
  });

  const handleTestConnection = (id: string) => {
    testConnectionMutation.mutate(id);
  };

  const handleEdit = (integration: IntegrationConfig) => {
    setEditingIntegration(integration);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingIntegration(null);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this integration?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">LLM Integrations</h3>
          <p className="text-sm text-muted-foreground">
            Configure LLM providers and models for detection
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Integration
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <IntegrationForm
              integration={editingIntegration}
              onSubmit={(data) => mutation.mutate(data)}
              onCancel={() => {
                setIsDialogOpen(false);
                setEditingIntegration(null);
              }}
              isLoading={mutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : integrations.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Brain className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No LLM integrations configured</p>
              <p className="text-sm mt-2">Click "Add Integration" to get started</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-2">
              {integrations.length} {integrations.length === 1 ? 'integration' : 'integrations'}{' '}
              configured
            </div>
            {integrations.map((integration) => (
              <Card key={integration.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5" />
                        <h4 className="font-semibold">{integration.name}</h4>
                        <Badge variant={integration.enabled ? 'default' : 'secondary'}>
                          {integration.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        {integration.testStatus && (
                          <Badge
                            variant={
                              integration.testStatus === 'success'
                                ? 'default'
                                : integration.testStatus === 'failed'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {integration.testStatus === 'success' ? (
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                            ) : integration.testStatus === 'failed' ? (
                              <XCircle className="mr-1 h-3 w-3" />
                            ) : null}
                            {integration.testStatus}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>
                          <strong>Provider:</strong> {integration.provider}
                        </p>
                        {integration.config && (
                          <div className="mt-2">
                            <strong>Available Models:</strong>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {Array.isArray(integration.config.models) ? (
                                integration.config.models.map((model: any, idx: number) => {
                                  const modelValue =
                                    typeof model === 'string'
                                      ? model
                                      : model?.id || model?.value || String(model);
                                  const modelLabel =
                                    typeof model === 'string'
                                      ? model
                                      : model?.name || model?.label || modelValue;
                                  return (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {modelLabel}
                                    </Badge>
                                  );
                                })
                              ) : integration.config.model ? (
                                <Badge variant="outline" className="text-xs">
                                  {String((integration.config as { model?: string }).model ?? '')}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  No models configured
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={integration.enabled}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: integration.id, enabled: checked })
                        }
                        disabled={toggleMutation.isPending}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTestConnection(integration.id)}
                        disabled={testConnectionMutation.isPending}
                        title="Test connection"
                      >
                        <TestTube className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(integration)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(integration.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

interface IntegrationFormProps {
  integration?: IntegrationConfig | null;
  onSubmit: (data: Partial<IntegrationConfig>) => void;
  onCancel: () => void;
  isLoading: boolean;
}

function IntegrationForm({ integration, onSubmit, onCancel, isLoading }: IntegrationFormProps) {
  // Initialize form data with deduplication
  const getInitialModels = () => {
    const models = Array.isArray((integration?.config as any)?.models)
      ? (integration?.config as any).models
      : (integration?.config as any)?.model
        ? [(integration?.config as any).model]
        : [];

    // Return original case for the first occurrence of each model
    const result: string[] = [];
    const seen = new Set<string>();
    for (const model of models) {
      const modelStr =
        typeof model === 'string' ? model : model?.id || model?.value || String(model);
      const normalized = modelStr.trim().toLowerCase();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(modelStr.trim());
      }
    }

    return result;
  };

  const initialModels = getInitialModels();
  const integrationConfig = (integration?.config ?? {}) as Record<string, unknown>;
  const [formData, setFormData] = useState({
    name: integration?.name || '',
    provider: integration?.provider || 'openai',
    enabled: integration?.enabled ?? true,
    config: {
      apiBaseUrl: (integrationConfig.apiBaseUrl as string) || '',
      apiKey: (integrationConfig.apiKey as string) || '',
      models: initialModels,
      ...(integrationConfig.passthrough ? { passthrough: integrationConfig.passthrough } : {}),
    },
  });

  const [newModel, setNewModel] = useState('');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    input?: string;
    output?: string;
  } | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const isDeduplicatingRef = useRef(false);
  // Use a ref to track models synchronously, independent of React state updates
  // This ensures we can check for duplicates even when state updates are batched
  const modelsRef = useRef<string[]>(initialModels);

  // Keep ref in sync with state
  useEffect(() => {
    modelsRef.current = [...(formData.config.models || [])];
  }, [formData.config.models]);

  // Also sync when integration changes
  useEffect(() => {
    modelsRef.current = [...(formData.config.models || [])];
  }, [integration?.id]);

  // Auto-detect duplicates when models change
  useEffect(() => {
    const seen = new Set<string>();
    let duplicates = 0;
    const duplicateModels: string[] = [];

    formData.config.models.forEach((model, _index) => {
      const normalized = model.trim().toLowerCase();
      if (normalized && seen.has(normalized)) {
        duplicates++;
        duplicateModels.push(model);
      } else if (normalized) {
        seen.add(normalized);
      }
    });

    setDuplicateCount(duplicates);

    if (duplicates > 0) {
      console.log('[Duplicate Detection] Found', duplicates, 'duplicate(s):', duplicateModels);
      console.log('[Duplicate Detection] All models:', formData.config.models);
    } else {
      console.log(
        '[Duplicate Detection] No duplicates found in',
        formData.config.models.length,
        'models',
      );
    }
  }, [formData.config.models]);

  // Auto-remove duplicates when integration changes (e.g., when editing)
  useEffect(() => {
    if (integration && formData.config.models.length > 0) {
      const seen = new Set<string>();
      const uniqueModels: string[] = [];
      let hasDuplicates = false;

      for (const model of formData.config.models) {
        const normalized = String(model).trim().toLowerCase();
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          uniqueModels.push(String(model).trim());
        } else if (normalized) {
          hasDuplicates = true;
        }
      }

      if (hasDuplicates && uniqueModels.length !== formData.config.models.length) {
        console.log('[Auto-deduplicate] Removing duplicates on integration load', {
          original: formData.config.models,
          unique: uniqueModels,
          removed: formData.config.models.length - uniqueModels.length,
        });
        setFormData((prev) => ({
          ...prev,
          config: {
            ...prev.config,
            models: uniqueModels,
          },
        }));
        toast.warning(
          `Removed ${formData.config.models.length - uniqueModels.length} duplicate model(s) from the list`,
        );
      }
    }
  }, [integration?.id]); // Only run when integration ID changes

  // Also check for duplicates whenever models change (in case user manually adds duplicates)
  useEffect(() => {
    // Skip if we're already deduplicating to avoid infinite loop
    if (isDeduplicatingRef.current) {
      return;
    }

    if (formData.config.models.length > 0) {
      const seen = new Set<string>();
      const duplicates: string[] = [];

      formData.config.models.forEach((model) => {
        const normalized = String(model).trim().toLowerCase();
        if (normalized) {
          if (seen.has(normalized)) {
            duplicates.push(String(model).trim());
          } else {
            seen.add(normalized);
          }
        }
      });

      if (duplicates.length > 0) {
        console.warn('[Duplicate Check] Found duplicates in models list:', duplicates);
        // Auto-remove duplicates
        const uniqueModels: string[] = [];
        const seenForUnique = new Set<string>();

        for (const model of formData.config.models) {
          const normalized = String(model).trim().toLowerCase();
          if (normalized && !seenForUnique.has(normalized)) {
            seenForUnique.add(normalized);
            uniqueModels.push(String(model).trim());
          }
        }

        if (uniqueModels.length !== formData.config.models.length) {
          console.log('[Auto-deduplicate] Removing duplicates from models list', {
            original: formData.config.models,
            unique: uniqueModels,
            removed: formData.config.models.length - uniqueModels.length,
          });
          isDeduplicatingRef.current = true;
          setFormData((prev) => ({
            ...prev,
            config: {
              ...prev.config,
              models: uniqueModels,
            },
          }));
          setTimeout(() => {
            isDeduplicatingRef.current = false;
          }, 0);
        }
      }
    }
  }, [formData.config.models]); // Run whenever models change

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: () => {
      // 如果还没有正式添加模型，但输入框里有内容，也一起用于测试
      const modelsForTest =
        formData.config.models.length > 0
          ? formData.config.models
          : newModel.trim()
            ? [newModel.trim()]
            : [];

      const testModelName = modelsForTest[0] ?? '';
      const testConfigBase: Record<string, unknown> = {
        apiBaseUrl: formData.config.apiBaseUrl || undefined,
        apiKey: formData.config.apiKey || undefined,
        models: modelsForTest,
        ...(formData.config.passthrough ? { passthrough: formData.config.passthrough } : {}),
      };
      const testConfig =
        testModelName && isQwen3ModelName(testModelName)
          ? mergeQwen3ThinkingDisablePassthrough(testConfigBase)
          : testConfigBase;

      const testData = {
        type: 'llm' as const,
        provider: formData.provider,
        config: testConfig,
      };
      return systemConfigApi.testIntegrationWithConfig(testData);
    },
    onSuccess: (result) => {
      console.log('[Test Connection] Success response received:', result);

      // Only set result and show toast if we have a valid result
      if (result && typeof result === 'object' && 'success' in result) {
        setTestResult(result);
        if (result.success) {
          // Show success message
          toast.success(`Connection successful: ${result.message}`);
          console.log('[Test Connection] Test passed, result set:', result);
        } else {
          // Test failed but API call succeeded
          toast.error(`Connection test failed: ${result.message}`);
          console.log('[Test Connection] Test failed, result set:', result);
        }
      } else {
        // Unexpected response format
        console.error('[Test Connection] Unexpected success response format:', result);
        setTestResult({
          success: false,
          message: 'Unexpected response format from server',
        });
        toast.error('Connection test failed: Unexpected response format');
      }
    },
    onError: (error: any) => {
      // Extract detailed error message from API response
      let errorMessage = 'API request failed';

      // Log full error for debugging
      console.error('[Test Connection] Full error object:', error);

      // Try multiple ways to extract error message
      if (error?.response?.data) {
        const errorData = error.response.data;
        console.log('[Test Connection] Error response data:', errorData);

        // Check for standard API error format: {success: false, error: {message: ...}}
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
        // Check for direct message field
        else if (errorData.message) {
          errorMessage = errorData.message;
        }
        // Check if error is a string
        else if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        }
        // Check for data field (when success is true but test failed)
        else if (errorData.data?.message) {
          errorMessage = errorData.data.message;
        }
        // Last resort: stringify the error object
        else if (errorData.error) {
          errorMessage =
            typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
        }
      }
      // Check for error in the error object itself
      else if (error?.error?.message) {
        errorMessage = error.error.message;
      }
      // Check for direct message
      else if (error?.message) {
        errorMessage = error.message;
      }
      // Check for details field
      else if (error?.details?.message) {
        errorMessage = error.details.message;
      }

      console.log('[Test Connection] Extracted error message:', errorMessage);

      setTestResult({ success: false, message: errorMessage });
      toast.error(`Connection Failed: ${errorMessage}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Remove duplicates and empty values before submitting (case-insensitive)
    const seen = new Set<string>();
    const uniqueModels: string[] = [];

    for (const model of formData.config.models) {
      const trimmed = model.trim();
      if (trimmed.length === 0) continue;

      const normalized = trimmed.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueModels.push(trimmed); // Keep original case for first occurrence
      }
    }

    if (uniqueModels.length === 0) {
      toast.error('Please add at least one model');
      return;
    }

    // Show warning if duplicates were removed
    if (uniqueModels.length < formData.config.models.length) {
      const removedCount = formData.config.models.length - uniqueModels.length;
      toast.warning(`Removed ${removedCount} duplicate model(s) before saving`);
    }

    onSubmit({
      type: 'llm',
      name: formData.name,
      provider: formData.provider,
      enabled: formData.enabled,
      config: {
        ...formData.config,
        models: uniqueModels,
      },
    });
  };

  const addModel = () => {
    const modelToAdd = newModel.trim();
    if (!modelToAdd) {
      toast.error('Please enter a model name');
      return;
    }

    const normalizedModelToAdd = modelToAdd.toLowerCase().trim();

    // Use functional update to check against the latest state
    let wasAdded = false;
    setFormData((prev) => {
      const currentModels = prev.config.models || [];
      const normalizedCurrentModels = currentModels.map((m) => String(m).toLowerCase().trim());

      // Check for duplicates
      if (normalizedCurrentModels.includes(normalizedModelToAdd)) {
        // Return previous state without changes
        return prev;
      }

      // Not duplicate, add it
      wasAdded = true;
      const newModels = [...currentModels, modelToAdd];
      const nextConfig = isQwen3ModelName(modelToAdd)
        ? (mergeQwen3ThinkingDisablePassthrough(
            prev.config as Record<string, unknown>,
          ) as typeof prev.config)
        : prev.config;

      return {
        ...prev,
        config: {
          ...nextConfig,
          models: newModels,
        },
      };
    });

    // Handle success/error messages outside the callback
    if (wasAdded) {
      setNewModel('');
      if (isQwen3ModelName(modelToAdd)) {
        toast.success(`Model "${modelToAdd}" added`, {
          description: 'Qwen3 detected: enable_thinking defaults to false for non-streaming calls.',
        });
      } else {
        toast.success(`Model "${modelToAdd}" added successfully`);
      }
    } else {
      toast.error(`Model "${modelToAdd}" is already in the list`, {
        description: 'Please enter a different model name',
        duration: 5000,
      });
    }
  };

  const removeModel = (index: number) => {
    setFormData((prev) => {
      const newModels = prev.config.models.filter((_, i) => i !== index);
      // Update ref synchronously
      modelsRef.current = newModels;
      return {
        ...prev,
        config: {
          ...prev.config,
          models: newModels,
        },
      };
    });
  };

  const removeDuplicates = () => {
    const seen = new Set<string>();
    const uniqueModels: string[] = [];
    const removed: string[] = [];

    for (const model of formData.config.models) {
      const trimmed = model.trim();
      if (trimmed.length === 0) continue;

      const normalized = trimmed.toLowerCase();
      if (seen.has(normalized)) {
        removed.push(trimmed);
      } else {
        seen.add(normalized);
        uniqueModels.push(trimmed);
      }
    }

    if (removed.length > 0) {
      // Update ref synchronously
      modelsRef.current = uniqueModels;
      setFormData((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          models: uniqueModels,
        },
      }));
      toast.success(`Removed ${removed.length} duplicate model(s)`, {
        description: `Removed: ${removed.join(', ')}`,
      });
    } else {
      toast.info('No duplicate models found');
    }
  };

  // Check if a model is duplicate (for highlighting)
  const isDuplicate = (model: string, index: number) => {
    const normalized = model.trim().toLowerCase();
    if (!normalized) return false;

    // Count how many times this normalized model appears (excluding current index)
    let count = 0;
    for (let i = 0; i < formData.config.models.length; i++) {
      if (i !== index) {
        const otherNormalized = formData.config.models[i].trim().toLowerCase();
        if (otherNormalized === normalized) {
          count++;
        }
      }
    }

    const result = count > 0;
    if (result) {
      console.log(
        '[isDuplicate] Model',
        model,
        'at index',
        index,
        'is duplicate (found',
        count,
        'other occurrence(s))',
      );
    }

    return result;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{integration ? 'Edit LLM Integration' : 'Add LLM Integration'}</DialogTitle>
        <DialogDescription>
          Configure LLM provider and available models for detection
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Integration Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., OpenAI Detection Models"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="provider">Provider *</Label>
          <Select
            value={formData.provider}
            onValueChange={(value) => setFormData({ ...formData, provider: value })}
          >
            <SelectTrigger id="provider">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="deepseek">DeepSeek</SelectItem>
              <SelectItem value="groq">Groq</SelectItem>
              <SelectItem value="azure">Azure OpenAI</SelectItem>
              <SelectItem value="ollama">Ollama</SelectItem>
              <SelectItem value="lmstudio">LM Studio</SelectItem>
              <SelectItem value="aliyun">Aliyun (阿里云)</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiBaseUrl">API Base URL (Optional)</Label>
          <Input
            id="apiBaseUrl"
            value={formData.config.apiBaseUrl}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: { ...formData.config, apiBaseUrl: e.target.value },
              })
            }
            placeholder={
              formData.provider === 'ollama'
                ? 'http://127.0.0.1:11434'
                : formData.provider === 'lmstudio'
                  ? 'http://127.0.0.1:1234/v1'
                  : formData.provider === 'aliyun'
                    ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
                    : 'https://api.openai.com/v1'
            }
          />
          {formData.provider === 'ollama' && (
            <p className="text-xs text-muted-foreground">
              Default: http://127.0.0.1:11434 (Ollama local server)
            </p>
          )}
          {formData.provider === 'lmstudio' && (
            <p className="text-xs text-muted-foreground">
              Default: http://127.0.0.1:1234/v1 (LM Studio local OpenAI-compatible server). If the
              backend runs in Docker, use http://host.docker.internal:1234/v1 instead of 127.0.0.1.
            </p>
          )}
          {formData.provider === 'aliyun' && (
            <p className="text-xs text-muted-foreground">
              Default: https://dashscope.aliyuncs.com/compatible-mode/v1 (阿里云 DashScope)
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey">
            API Key{' '}
            {formData.provider === 'ollama' || formData.provider === 'lmstudio'
              ? '(Optional)'
              : '(Required for most providers)'}
          </Label>
          <Input
            id="apiKey"
            type="password"
            value={formData.config.apiKey}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: { ...formData.config, apiKey: e.target.value },
              })
            }
            placeholder={
              formData.provider === 'ollama'
                ? 'Optional (Ollama usually does not require API key)'
                : formData.provider === 'lmstudio'
                  ? 'Optional (e.g. lm-studio if required by server)'
                  : formData.provider === 'aliyun'
                    ? 'sk-... (阿里云 DashScope API Key)'
                    : 'sk-...'
            }
          />
          {formData.provider === 'ollama' && (
            <p className="text-xs text-muted-foreground">
              Ollama typically does not require an API key for local usage
            </p>
          )}
          {formData.provider === 'lmstudio' && (
            <p className="text-xs text-muted-foreground">
              LM Studio usually does not require an API key; use any non-empty value if the server
              expects one (e.g. lm-studio)
            </p>
          )}
          {formData.provider === 'aliyun' && (
            <p className="text-xs text-muted-foreground">
              Required: Your Aliyun DashScope API Key (阿里云 DashScope API Key)
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Available Models *</Label>
          <p className="text-sm text-muted-foreground">
            Configure the models that will be available in LLM-Based Detection Configuration
          </p>
          {formData.provider === 'aliyun' && (
            <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
              <strong>Aliyun Models:</strong> Use model names like{' '}
              <code className="text-xs">deepseek-r1-distill-qwen-7b</code>,{' '}
              <code className="text-xs">qwen-plus</code>,{' '}
              <code className="text-xs">qwen-turbo</code>, <code className="text-xs">qwen-max</code>
              , etc.
            </p>
          )}
          {formData.provider === 'ollama' && (
            <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
              <strong>Ollama Models:</strong> Use model names like{' '}
              <code className="text-xs">deepseek-r1:1.5b</code>,{' '}
              <code className="text-xs">llama3</code>, <code className="text-xs">qwen2.5</code>,
              etc.
            </p>
          )}
          {formData.provider === 'lmstudio' && (
            <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
              <strong>LM Studio URL:</strong> Must include <code className="text-xs">/v1</code>{' '}
              (OpenAI-compatible path). Example:{' '}
              <code className="text-xs">http://host.docker.internal:1234/v1</code> — the app calls{' '}
              <code className="text-xs">…/v1/chat/completions</code>. Ollama uses a different API
              and does not need <code className="text-xs">/v1</code>.
            </p>
          )}
          {formData.provider === 'lmstudio' && (
            <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
              <strong>LM Studio Models:</strong> Use the model id shown in LM Studio, e.g.{' '}
              <code className="text-xs">qwen/qwen3-8b</code>,{' '}
              <code className="text-xs">bartowski/gemma-2-9b-it-GGUF</code>, etc. For Qwen3, if
              responses look empty, disable thinking in LM Studio or use a non-reasoning model.
            </p>
          )}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                placeholder={
                  formData.provider === 'ollama'
                    ? 'e.g., deepseek-r1:1.5b, llama3, qwen2.5'
                    : formData.provider === 'lmstudio'
                      ? 'e.g., qwen/qwen3-8b, bartowski/gemma-2-9b-it-GGUF'
                      : formData.provider === 'aliyun'
                        ? 'e.g., deepseek-r1-distill-qwen-7b, qwen-plus, qwen-turbo'
                        : 'e.g., gpt-4, claude-3-opus, deepseek-r1-distill-qwen-7b'
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    console.log('🔵 [Input] Enter key pressed');
                    addModel();
                  }
                }}
              />
              <Button
                type="button"
                onClick={() => {
                  console.log('🔵 [Button] Clicked! newModel:', JSON.stringify(newModel));
                  addModel();
                }}
                variant="outline"
                disabled={!newModel.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              {formData.config.models.length > 0 && (
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formData.config.models.length} model(s) configured
                    </span>
                    {duplicateCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {duplicateCount} duplicate(s)
                      </Badge>
                    )}
                  </div>
                  {duplicateCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={removeDuplicates}
                      className="h-7 text-xs border-yellow-300 dark:border-yellow-700"
                    >
                      Remove Duplicates
                    </Button>
                  )}
                </div>
              )}
              {formData.config.models.map((model, index) => {
                const duplicate = isDuplicate(model, index);
                console.log(
                  '[Render] Model at index',
                  index,
                  ':',
                  model,
                  'isDuplicate:',
                  duplicate,
                );
                return (
                  <div
                    key={`${model}-${index}`}
                    className={`flex items-center justify-between p-2 rounded-md ${
                      duplicate
                        ? 'bg-yellow-50 dark:bg-yellow-950 border-2 border-yellow-300 dark:border-yellow-700'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span
                        className={`text-sm font-mono ${duplicate ? 'font-bold text-yellow-800 dark:text-yellow-200' : ''}`}
                      >
                        {model}
                      </span>
                      {duplicate && (
                        <Badge variant="destructive" className="text-xs animate-pulse">
                          Duplicate
                        </Badge>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeModel(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              {formData.config.models.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  No models added. Add at least one model to test the connection.
                </p>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Test Connection Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label>Test Connection</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Test the connection with the first model in the list (or the model you're typing)
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTestResult(null);
                testConnectionMutation.mutate();
              }}
              disabled={
                testConnectionMutation.isPending ||
                (formData.config.models.length === 0 && !newModel.trim())
              }
            >
              <TestTube className="mr-2 h-4 w-4" />
              {testConnectionMutation.isPending ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>
          {testResult && (
            <div
              className={`p-4 rounded-md text-sm ${
                testResult.success
                  ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span className="font-medium">
                  {testResult.success ? 'Connection Successful ✅' : 'Connection Failed ❌'}
                </span>
              </div>

              <div className="space-y-3">
                <p className="text-sm">{testResult.message}</p>

                {testResult.success && (testResult.input || testResult.output) && (
                  <div className="space-y-2 mt-3">
                    {/* Input Section */}
                    {testResult.input && (
                      <div className="p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            Input (Sent to Model):
                          </p>
                        </div>
                        <div className="pl-4">
                          <p className="text-sm text-gray-800 dark:text-gray-200 font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded">
                            {testResult.input}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Output Section */}
                    {testResult.output && (
                      <div className="p-3 bg-white dark:bg-gray-900 rounded border border-green-300 dark:border-green-700">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                            Output (Model Response):
                          </p>
                        </div>
                        <div className="pl-4">
                          <p className="text-sm text-gray-800 dark:text-gray-200 font-mono bg-green-50 dark:bg-green-900/30 p-2 rounded whitespace-pre-wrap break-words">
                            {testResult.output}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {formData.config.models.length === 0 && !newModel.trim() && (
            <p className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-950 p-2 rounded border border-yellow-200 dark:border-yellow-800">
              ⚠️ Please add at least one model above before testing the connection.
            </p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="enabled"
            checked={formData.enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
          />
          <Label htmlFor="enabled">Enable this integration</Label>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading || !formData.name || formData.config.models.length === 0}
        >
          {isLoading ? 'Saving...' : integration ? 'Update' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  );
}
