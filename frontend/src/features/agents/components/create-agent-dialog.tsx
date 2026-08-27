/**
 * Create Agent Dialog Component
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AgentForm, type AgentFormValues } from './agent-form';
import { agentsApi } from '@/services/api/agents';
import { toast } from 'sonner';
import type { CreateTargetAgentRequest } from '@/types/api';

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAgentDialog({ open, onOpenChange }: CreateAgentDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Debug: log dialog open state
  useEffect(() => {
    console.log('CreateAgentDialog - open prop changed:', open);
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async (data: AgentFormValues) => {
      // Clean up the data before sending
      const cleanConfig: Record<string, unknown> = {};
      const allowEmptyStringKeys = new Set(['conversationId', 'n8nApiKeyPrefix']);

      // Process config fields - keep all valid values
      for (const [key, value] of Object.entries(data.config)) {
        // Skip null and undefined
        if (value === null || value === undefined) continue;

        // For strings, skip empty strings except explicitly allowed keys.
        if (typeof value === 'string') {
          if (value.trim() === '' && !allowEmptyStringKeys.has(key)) continue;
          cleanConfig[key] = value.trim();
        } else {
          // Keep other types (numbers, booleans, objects, arrays)
          cleanConfig[key] = value;
        }
      }

      const apiBaseUrl =
        typeof cleanConfig.apiBaseUrl === 'string' ? cleanConfig.apiBaseUrl.trim() : '';
      const webhookUrl =
        typeof cleanConfig.webhookUrl === 'string' ? cleanConfig.webhookUrl.trim() : '';
      const webhookPath =
        typeof cleanConfig.webhookPath === 'string' ? cleanConfig.webhookPath.trim() : '';

      if (data.type === 'n8n') {
        // n8n supports webhookUrl-only mode; apiBaseUrl+webhookPath is also valid.
        if (!webhookUrl && !(apiBaseUrl && webhookPath)) {
          throw new Error(t('pages.agents.form.validation.n8nWebhook'));
        }
      } else if (!apiBaseUrl) {
        throw new Error(t('pages.agents.form.validation.apiBaseRequired'));
      }

      const cleanData: CreateTargetAgentRequest = {
        name: data.name.trim(),
        type: data.type,
        config: cleanConfig,
      };

      // Add optional fields only if they have values
      if (data.description && data.description.trim()) {
        cleanData.description = data.description.trim();
      }
      if (data.icon) {
        cleanData.icon = data.icon;
      }
      if (data.metadata && Object.keys(data.metadata).length > 0) {
        // Clean metadata as well
        const cleanMetadata: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data.metadata)) {
          if (value !== null && value !== undefined && value !== '') {
            cleanMetadata[key] = value;
          }
        }
        if (Object.keys(cleanMetadata).length > 0) {
          cleanData.metadata = cleanMetadata;
        }
      }
      if (data.status) {
        cleanData.status = data.status;
      }

      try {
        console.log('Creating agent with data:', JSON.stringify(cleanData, null, 2));
        return await agentsApi.create(cleanData);
      } catch (error: any) {
        console.error('Create agent API error:', error);
        console.error('Error details:', {
          message: error?.message,
          response: error?.response?.data,
          status: error?.response?.status,
          requestData: cleanData,
        });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(t('pages.agents.createDialog.success'));
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Create agent error:', error);
      console.error('Error response:', error?.response);
      console.error('Error response data:', error?.response?.data);

      let errorMessage = t('pages.agents.createDialog.failedPrefix');

      if (error?.response?.data) {
        const errorData = error.response.data;
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage =
            typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }

      toast.error(`${t('pages.agents.createDialog.failedPrefix')}: ${errorMessage}`);

      // Log full error for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('Full error object:', JSON.stringify(error, null, 2));
      }
    },
  });

  const handleSubmit = async (values: AgentFormValues) => {
    try {
      console.log('Form submitted with values:', values);
      // Validate required fields before submission
      if (!values.name || !values.name.trim()) {
        toast.error(t('pages.agents.form.errors.nameRequired'));
        return;
      }
      const apiBaseUrl = String(values.config?.apiBaseUrl ?? '').trim();
      const webhookUrl = String((values.config as Record<string, unknown>)?.webhookUrl ?? '').trim();
      const webhookPath = String((values.config as Record<string, unknown>)?.webhookPath ?? '').trim();
      if (values.type === 'n8n') {
        if (!webhookUrl && !(apiBaseUrl && webhookPath)) {
          toast.error(t('pages.agents.form.errors.n8nWebhook'));
          return;
        }
      } else if (!apiBaseUrl) {
        toast.error(t('pages.agents.form.errors.apiBaseRequired'));
        return;
      }
      await createMutation.mutateAsync(values);
    } catch (error: any) {
      console.error('Submit error:', error);
      // Error is already handled in onError callback
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('pages.agents.createDialog.title')}</DialogTitle>
          <DialogDescription>{t('pages.agents.createDialog.description')}</DialogDescription>
        </DialogHeader>
        <AgentForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isLoading={createMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
