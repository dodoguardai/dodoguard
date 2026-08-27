/**
 * Agent Create/Edit Form Component
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { zodResolver } from '@hookform/resolvers/zod';
import { Bot, Cloud, Code, Cpu, Database, Globe, Monitor, Server, Zap } from 'lucide-react';
import { type Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { TargetAgent } from '@/types/entities';

function createAgentFormSchema(t: TFunction) {
  return z
    .object({
  name: z.string().min(1, t('pages.agents.form.validation.nameRequired')),
  description: z.string().optional(),
  type: z.enum([
    'dify',
    'coze',
    'n8n',
    'fastgpt',
    'tencent-adp',
    'api',
    'api-stream',
    'langchain',
    'custom',
    'other',
  ]),
  icon: z
    .enum(['Monitor', 'Server', 'Bot', 'Cpu', 'Database', 'Globe', 'Zap', 'Code', 'Cloud'])
    .optional(),
  config: z.object({
    apiBaseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    // Dify specific fields
    userId: z.string().optional(),
    conversationId: z.string().optional(),
    apiType: z.enum(['chat', 'workflow']).optional(),
    workflowInputKey: z.string().optional(),
    responseMode: z.enum(['blocking', 'streaming']).optional(),
    // Coze specific fields
    botId: z.string().optional(),
    connectorId: z.string().optional(),
    // N8N specific fields
    webhookUrl: z.string().optional(),
    webhookPath: z.string().optional(),
    n8nApiKeyHeaderName: z.string().optional(),
    n8nApiKeyPrefix: z.string().optional(),
    n8nRequestBodyMode: z.enum(['compat', 'flat']).optional(),
    n8nQueryFieldName: z.string().optional(),
    // Tencent ADP specific fields
    transportMode: z.enum(['sse', 'websocket']).optional(),
    tencentSecretId: z.string().optional(),
    tencentSecretKey: z.string().optional(),
    tencentRegion: z.string().optional(),
    inputs: z
      .any()
      .optional()
      .nullable()
      .transform((val) => {
        // Handle null, undefined, or empty values
        if (val === null || val === undefined) {
          return undefined;
        }

        // If it's already a valid object, return it
        if (typeof val === 'object' && !Array.isArray(val) && val !== null) {
          return val;
        }

        // If it's a string, try to parse it
        if (typeof val === 'string') {
          if (val.trim() === '') {
            return undefined;
          }
          try {
            const parsed = JSON.parse(val);
            if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
              return parsed;
            }
            // Invalid format, return undefined
            return undefined;
          } catch {
            // Invalid JSON, return undefined
            return undefined;
          }
        }

        // For any other type, return undefined
        return undefined;
      })
      .refine(
        (val) => {
          // After transform, val should be either undefined or a valid object
          if (val === undefined || val === null) {
            return true;
          }
          return typeof val === 'object' && !Array.isArray(val) && val !== null;
        },
        {
          message: t('pages.agents.form.validation.inputsJsonObject'),
        },
      ),
    files: z.array(z.any()).optional(),
    // Generic API fields
    authType: z.enum(['api_key', 'oauth', 'basic']).optional(),
    additionalHeaders: z.record(z.string(), z.string()).optional(),
    // API agent advanced fields
    chatPath: z.string().optional(),
    model: z.string().optional(),
    toolChoice: z.string().optional(),
    functionCall: z.any().optional(),
    tools: z.any().optional(),
    functions: z.any().optional(),
  }),
  metadata: z
    .object({
      version: z.string().optional(),
      platform: z.string().optional(),
      environment: z.enum(['production', 'staging', 'development']).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  status: z.enum(['active', 'inactive', 'testing', 'error']).default('active'),
})
    .superRefine((values, ctx) => {
    const baseUrl = String(values.config.apiBaseUrl ?? '').trim();
    const webhookUrl = String(values.config.webhookUrl ?? '').trim();
    const webhookPath = String(values.config.webhookPath ?? '').trim();

    if (values.type === 'n8n') {
      if (webhookUrl.length === 0 && !(baseUrl.length > 0 && webhookPath.length > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['config', 'webhookUrl'],
          message: t('pages.agents.form.validation.n8nWebhook'),
        });
      }
    } else if (values.type === 'tencent-adp') {
      if (!String(values.config.apiKey ?? '').trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['config', 'apiKey'],
          message: 'AppKey 为必填项',
        });
      }
      if (!String(values.config.userId ?? '').trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['config', 'userId'],
          message: 'VisitorId 为必填项',
        });
      }
      const transportMode = values.config.transportMode || 'sse';
      if (transportMode === 'websocket') {
        if (!String(values.config.tencentSecretId ?? '').trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['config', 'tencentSecretId'],
            message: 'WebSocket 模式需要填写腾讯云 SecretId',
          });
        }
        if (!String(values.config.tencentSecretKey ?? '').trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['config', 'tencentSecretKey'],
            message: 'WebSocket 模式需要填写腾讯云 SecretKey',
          });
        }
      }
    } else if (baseUrl.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'apiBaseUrl'],
        message: t('pages.agents.form.validation.apiBaseRequired'),
      });
    }

    if (baseUrl.length > 0) {
      try {
        new URL(baseUrl);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['config', 'apiBaseUrl'],
          message: t('pages.agents.form.validation.validUrl'),
        });
      }
    }

    if (webhookUrl.length > 0) {
      try {
        new URL(webhookUrl);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['config', 'webhookUrl'],
          message: t('pages.agents.form.validation.validWebhookUrl'),
        });
      }
    }
  });
}

export type AgentFormValues = z.infer<ReturnType<typeof createAgentFormSchema>>;

export type AgentFormHandle = {
  getValues: () => AgentFormValues;
  setResponseMode: (mode: 'blocking' | 'streaming') => void;
};

interface AgentFormProps {
  agent?: TargetAgent;
  onSubmit: (values: AgentFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export const AgentForm = forwardRef<AgentFormHandle, AgentFormProps>(function AgentForm(
  { agent, onSubmit, onCancel, isLoading },
  ref,
) {
  const { t } = useTranslation();
  const agentFormSchema = useMemo(() => createAgentFormSchema(t), [t]);
  const form = useForm<AgentFormValues, unknown, AgentFormValues>({
    resolver: zodResolver(agentFormSchema as never) as Resolver<AgentFormValues>,
    defaultValues: agent
      ? (() => {
          // Ensure all config fields have default values
          const agentConfig = agent.config || {};
          // Process inputs field - ensure it's a valid object or undefined
          let processedInputs: Record<string, unknown> | undefined = undefined;
          if (agentConfig.inputs) {
            if (typeof agentConfig.inputs === 'string') {
              try {
                const parsed = JSON.parse(agentConfig.inputs);
                if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
                  processedInputs = parsed;
                }
              } catch {
                // Invalid JSON, leave as undefined
              }
            } else if (
              typeof agentConfig.inputs === 'object' &&
              !Array.isArray(agentConfig.inputs) &&
              agentConfig.inputs !== null
            ) {
              processedInputs = agentConfig.inputs as Record<string, unknown>;
            }
          }

          const defaultConfig = {
            apiBaseUrl: String(
              agentConfig.apiBaseUrl ??
                (agent.type === 'coze'
                  ? 'https://api.coze.com'
                  : agent.type === 'n8n'
                    ? 'https://n8n.example.com'
                    : agent.type === 'fastgpt'
                      ? 'https://fastgpt.example.com'
                      : agent.type === 'tencent-adp'
                        ? 'https://wss.lke.cloud.tencent.com'
                        : agent.type === 'langchain'
                        ? 'https://langchain.example.com'
                        : 'https://api.dify.ai'),
            ),
            apiKey: String(agentConfig.apiKey ?? ''),
            userId: String(agentConfig.userId ?? ''),
            conversationId: String(agentConfig.conversationId ?? ''),
            apiType: (agentConfig.apiType === 'workflow' ? 'workflow' : 'chat') as
              | 'chat'
              | 'workflow',
            workflowInputKey: String(agentConfig.workflowInputKey ?? 'query'),
            responseMode: (agentConfig.responseMode || 'blocking') as 'blocking' | 'streaming',
            botId: String(agentConfig.botId ?? ''),
            connectorId: String(agentConfig.connectorId ?? ''),
            webhookUrl: String(agentConfig.webhookUrl ?? ''),
            webhookPath: String(agentConfig.webhookPath ?? '/webhook/dodoguard-agent'),
            n8nApiKeyHeaderName: String(agentConfig.n8nApiKeyHeaderName ?? 'X-N8N-API-KEY'),
            n8nApiKeyPrefix: String(agentConfig.n8nApiKeyPrefix ?? 'Bearer '),
            n8nRequestBodyMode: (agentConfig.n8nRequestBodyMode === 'flat' ? 'flat' : 'compat') as
              | 'compat'
              | 'flat',
            n8nQueryFieldName: String(agentConfig.n8nQueryFieldName ?? 'prompt'),
            transportMode: (agentConfig.transportMode === 'websocket' ? 'websocket' : 'sse') as
              | 'sse'
              | 'websocket',
            tencentSecretId: String(agentConfig.tencentSecretId ?? ''),
            tencentSecretKey: String(agentConfig.tencentSecretKey ?? ''),
            tencentRegion: String(agentConfig.tencentRegion ?? 'ap-guangzhou'),
            inputs: processedInputs,
            files: Array.isArray(agentConfig.files) ? agentConfig.files : undefined,
            authType:
              (agentConfig.authType as 'api_key' | 'oauth' | 'basic' | undefined) ?? undefined,
            additionalHeaders:
              agentConfig.additionalHeaders &&
              typeof agentConfig.additionalHeaders === 'object' &&
              !Array.isArray(agentConfig.additionalHeaders)
                ? (agentConfig.additionalHeaders as Record<string, string>)
                : undefined,
            chatPath: String((agentConfig as any).chatPath ?? '/v1/chat/completions'),
            model: String((agentConfig as any).model ?? ''),
            toolChoice:
              (agentConfig as any).toolChoice !== undefined
                ? String((agentConfig as any).toolChoice)
                : '',
            functionCall:
              (agentConfig as any).functionCall !== undefined
                ? (agentConfig as any).functionCall
                : undefined,
            tools:
              Array.isArray((agentConfig as any).tools) ||
              typeof (agentConfig as any).tools === 'object'
                ? (agentConfig as any).tools
                : undefined,
            functions:
              Array.isArray((agentConfig as any).functions) ||
              typeof (agentConfig as any).functions === 'object'
                ? (agentConfig as any).functions
                : undefined,
          };

          return {
            name: agent.name || '',
            description: agent.description || '',
            type: (agent.type || 'dify') as AgentFormValues['type'],
            icon: (agent.icon || 'Monitor') as AgentFormValues['icon'],
            config: defaultConfig,
            metadata:
              agent.metadata && typeof agent.metadata === 'object' && !Array.isArray(agent.metadata)
                ? (agent.metadata as Record<string, unknown>)
                : ({} as Record<string, unknown>),
            status: (agent.status || 'active') as AgentFormValues['status'],
          } as AgentFormValues;
        })()
      : {
          name: '',
          description: '',
          type: 'dify',
          icon: 'Monitor',
          config: {
            apiBaseUrl: 'https://api.dify.ai',
            apiKey: '',
            apiType: 'chat' as const,
            workflowInputKey: 'query',
            responseMode: 'blocking' as const,
            botId: '',
            connectorId: '',
            webhookUrl: '',
            webhookPath: '/webhook/dodoguard-agent',
            n8nApiKeyHeaderName: 'X-N8N-API-KEY',
            n8nApiKeyPrefix: 'Bearer ',
            n8nRequestBodyMode: 'compat' as const,
            n8nQueryFieldName: 'prompt',
            transportMode: 'sse' as const,
            tencentSecretId: '',
            tencentSecretKey: '',
            tencentRegion: 'ap-guangzhou',
            chatPath: '/v1/chat/completions',
          },
          metadata: {
            environment: 'production' as const,
          },
          status: 'active' as const,
        },
  });

  // Reset form when agent prop changes (for edit mode)
  useEffect(() => {
    if (agent) {
      // Ensure all config fields have default values to avoid Zod validation errors
      const agentConfig = agent.config || {};
      const defaultConfig = {
        apiBaseUrl: String(
          agentConfig.apiBaseUrl ??
            (agent.type === 'coze'
              ? 'https://api.coze.com'
              : agent.type === 'n8n'
                ? 'https://n8n.example.com'
                : agent.type === 'fastgpt'
                  ? 'https://fastgpt.example.com'
                  : agent.type === 'tencent-adp'
                    ? 'https://wss.lke.cloud.tencent.com'
                    : agent.type === 'langchain'
                      ? 'https://langchain.example.com'
                      : 'https://api.dify.ai'),
        ),
        apiKey: String(agentConfig.apiKey ?? ''),
        userId: String(agentConfig.userId ?? ''),
        conversationId: String(agentConfig.conversationId ?? ''),
        apiType: ((agentConfig as any).apiType === 'workflow' ? 'workflow' : 'chat') as
          | 'chat'
          | 'workflow',
        workflowInputKey: String((agentConfig as any).workflowInputKey ?? 'query'),
        responseMode: (agentConfig.responseMode || 'blocking') as 'blocking' | 'streaming',
        botId: String((agentConfig as any).botId ?? ''),
        connectorId: String((agentConfig as any).connectorId ?? ''),
        webhookUrl: String((agentConfig as any).webhookUrl ?? ''),
        webhookPath: String((agentConfig as any).webhookPath ?? '/webhook/dodoguard-agent'),
        n8nApiKeyHeaderName: String((agentConfig as any).n8nApiKeyHeaderName ?? 'X-N8N-API-KEY'),
        n8nApiKeyPrefix: String((agentConfig as any).n8nApiKeyPrefix ?? 'Bearer '),
        n8nRequestBodyMode: ((agentConfig as any).n8nRequestBodyMode === 'flat'
          ? 'flat'
          : 'compat') as 'compat' | 'flat',
        n8nQueryFieldName: String((agentConfig as any).n8nQueryFieldName ?? 'prompt'),
        transportMode: ((agentConfig as any).transportMode === 'websocket' ? 'websocket' : 'sse') as
          | 'sse'
          | 'websocket',
        tencentSecretId: String((agentConfig as any).tencentSecretId ?? ''),
        tencentSecretKey: String((agentConfig as any).tencentSecretKey ?? ''),
        tencentRegion: String((agentConfig as any).tencentRegion ?? 'ap-guangzhou'),
        inputs: (() => {
          const i = agentConfig.inputs;
          if (!i) {
            return undefined;
          }
          if (typeof i === 'string') {
            try {
              const parsed = JSON.parse(i);
              return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
                ? parsed
                : undefined;
            } catch {
              return undefined;
            }
          }
          return typeof i === 'object' && i !== null && !Array.isArray(i) ? i : undefined;
        })(),
        files: Array.isArray(agentConfig.files) ? agentConfig.files : undefined,
        authType: (agentConfig.authType as 'api_key' | 'oauth' | 'basic' | undefined) ?? undefined,
        additionalHeaders:
          agentConfig.additionalHeaders &&
          typeof agentConfig.additionalHeaders === 'object' &&
          !Array.isArray(agentConfig.additionalHeaders)
            ? (agentConfig.additionalHeaders as Record<string, string>)
            : undefined,
        chatPath: String((agentConfig as any).chatPath ?? '/v1/chat/completions'),
        model: String((agentConfig as any).model ?? ''),
        toolChoice:
          (agentConfig as any).toolChoice !== undefined
            ? String((agentConfig as any).toolChoice)
            : '',
        functionCall:
          (agentConfig as any).functionCall !== undefined
            ? (agentConfig as any).functionCall
            : undefined,
        tools:
          Array.isArray((agentConfig as any).tools) ||
          typeof (agentConfig as any).tools === 'object'
            ? (agentConfig as any).tools
            : undefined,
        functions:
          Array.isArray((agentConfig as any).functions) ||
          typeof (agentConfig as any).functions === 'object'
            ? (agentConfig as any).functions
            : undefined,
      };

      form.reset({
        name: agent.name || '',
        description: agent.description || '',
        type: (agent.type || 'dify') as AgentFormValues['type'],
        icon: (agent.icon || 'Monitor') as AgentFormValues['icon'],
        config: defaultConfig as AgentFormValues['config'],
        metadata: (agent.metadata || {}) as Record<string, unknown>,
        status: (agent.status || 'active') as AgentFormValues['status'],
      });
    }
  }, [agent, form]);

  const agentType = form.watch('type');
  const difyApiType = form.watch('config.apiType');
  const adpTransportMode = form.watch('config.transportMode');

  // For new agents, auto-adjust the default chat path based on agent type.
  useEffect(() => {
    if (agent) {
      return; // edit mode
    }

    const currentChatPath = form.getValues('config.chatPath');
    if (agentType === 'api-stream') {
      if (!currentChatPath || currentChatPath === '/v1/chat/completions') {
        form.setValue('config.chatPath', '/v1/chat/stream/message', { shouldDirty: true });
      }
    } else if (agentType === 'api') {
      if (!currentChatPath || currentChatPath === '/v1/chat/stream/message') {
        form.setValue('config.chatPath', '/v1/chat/completions', { shouldDirty: true });
      }
    } else if (agentType === 'tencent-adp') {
      form.setValue('config.apiBaseUrl', 'https://wss.lke.cloud.tencent.com', { shouldDirty: true });
      if (!form.getValues('config.transportMode')) {
        form.setValue('config.transportMode', 'sse', { shouldDirty: true });
      }
      if (!form.getValues('config.tencentRegion')) {
        form.setValue('config.tencentRegion', 'ap-guangzhou', { shouldDirty: true });
      }
    }
  }, [agentType, agent, form]);

  const handleFormSubmit = (values: AgentFormValues) => {
    onSubmit(values);
  };

  useImperativeHandle(ref, () => ({
    getValues: () => form.getValues(),
    setResponseMode: (mode: 'blocking' | 'streaming') => {
      form.setValue('config.responseMode', mode, { shouldDirty: true });
    },
  }), [form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.agents.form.fields.name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('pages.agents.form.fields.namePlaceholder')} {...field} />
              </FormControl>
              <FormDescription>{t('pages.agents.form.fields.nameDesc')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.agents.form.fields.description')}</FormLabel>
              <FormControl>
                <Textarea placeholder={t('pages.agents.form.fields.descriptionPlaceholder')} {...field} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.agents.form.fields.type')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('pages.agents.form.fields.typePlaceholder')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="dify">Dify</SelectItem>
                  <SelectItem value="coze">Coze</SelectItem>
                  <SelectItem value="n8n">N8N</SelectItem>
                  <SelectItem value="fastgpt">FastGPT</SelectItem>
                  <SelectItem value="tencent-adp">腾讯 ADP</SelectItem>
                  <SelectItem value="api">{t('pages.agents.form.types.api')}</SelectItem>
                  <SelectItem value="api-stream">{t('pages.agents.form.types.apiStream')}</SelectItem>
                  <SelectItem value="langchain">LangChain</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>{t('pages.agents.form.fields.typeDesc')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="icon"
          render={({ field }) => {
            const iconMap: Record<string, { name: string; component: any }> = {
              Monitor: { name: t('pages.agents.form.icons.Monitor'), component: Monitor },
              Server: { name: t('pages.agents.form.icons.Server'), component: Server },
              Bot: { name: t('pages.agents.form.icons.Bot'), component: Bot },
              Cpu: { name: t('pages.agents.form.icons.Cpu'), component: Cpu },
              Database: { name: t('pages.agents.form.icons.Database'), component: Database },
              Globe: { name: t('pages.agents.form.icons.Globe'), component: Globe },
              Zap: { name: t('pages.agents.form.icons.Zap'), component: Zap },
              Code: { name: t('pages.agents.form.icons.Code'), component: Code },
              Cloud: { name: t('pages.agents.form.icons.Cloud'), component: Cloud },
            };

            return (
              <FormItem>
                <FormLabel>{t('pages.agents.form.fields.icon')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || 'Monitor'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('pages.agents.form.fields.iconPlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(iconMap).map(([key, { name, component: IconComponent }]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <IconComponent className="h-4 w-4" />
                          <span>{name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{t('pages.agents.form.fields.iconDesc')}</FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t('pages.agents.form.fields.configuration')}</h3>

          <FormField
            control={form.control}
            name="config.apiBaseUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('pages.agents.form.fields.apiBaseUrl')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={
                      agentType === 'dify'
                        ? 'https://api.dify.ai'
                        : agentType === 'coze'
                          ? 'https://api.coze.com'
                          : agentType === 'n8n'
                            ? 'https://n8n.example.com'
                            : agentType === 'fastgpt'
                              ? 'https://fastgpt.example.com'
                              : agentType === 'tencent-adp'
                                ? 'https://wss.lke.cloud.tencent.com'
                                : agentType === 'langchain'
                                  ? 'https://langchain.example.com'
                                  : 'https://api.example.com'
                    }
                    {...field}
                  />
                </FormControl>
                {agentType === 'dify' ? (
                  <FormDescription>{t('pages.agents.form.fields.apiBaseUrlDescDify')}</FormDescription>
                ) : agentType === 'tencent-adp' ? (
                  <FormDescription>
                    可选。默认使用腾讯云 ADP 官方地址，一般无需修改。
                  </FormDescription>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="config.apiKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{agentType === 'tencent-adp' ? 'AppKey' : t('pages.agents.form.fields.apiKey')}</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder={
                      agentType === 'dify'
                        ? t('pages.agents.form.fields.apiKeyPlaceholderDify')
                        : agentType === 'fastgpt'
                          ? t('pages.agents.form.fields.apiKeyPlaceholderFastgpt')
                          : agentType === 'tencent-adp'
                            ? '从 ADP 应用「调用信息」中复制 AppKey'
                            : t('pages.agents.form.fields.apiKeyPlaceholderGeneric')
                    }
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {agentType === 'dify'
                    ? t('pages.agents.form.fields.apiKeyDescDify')
                    : agentType === 'fastgpt'
                      ? t('pages.agents.form.fields.apiKeyDescFastgpt')
                      : agentType === 'tencent-adp'
                        ? '在 ADP 应用管理 → 已发布应用 → 调用 → 调用信息 中获取 AppKey'
                        : t('pages.agents.form.fields.apiKeyDescGeneric')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Tencent ADP specific fields */}
          {agentType === 'tencent-adp' && (
            <>
              <FormField
                control={form.control}
                name="config.transportMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>接入方式</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || 'sse'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择接入方式" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sse">HTTP SSE（推荐）</SelectItem>
                        <SelectItem value="websocket">WebSocket (Socket.IO)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      SSE 只需 AppKey；WebSocket 还需腾讯云 API 密钥用于 GetWsToken。
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VisitorId</FormLabel>
                    <FormControl>
                      <Input placeholder="dodoguard-test-user-001" {...field} />
                    </FormControl>
                    <FormDescription>
                      访客 ID，建议唯一，用于标识接入会话的用户。
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.conversationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ConversationId（可选）</FormLabel>
                    <FormControl>
                      <Input placeholder="留空则每次测试自动生成 UUID" {...field} />
                    </FormControl>
                    <FormDescription>
                      会话 ID（32-64 字符）。多轮对话测试请保持同一 ID。
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.tencentRegion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>腾讯云 Region</FormLabel>
                    <FormControl>
                      <Input placeholder="ap-guangzhou" {...field} />
                    </FormControl>
                    <FormDescription>GetWsToken API 使用的地域，默认 ap-guangzhou。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {adpTransportMode === 'websocket' && (
                <>
                  <FormField
                    control={form.control}
                    name="config.tencentSecretId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>腾讯云 SecretId</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="AKID..." {...field} />
                        </FormControl>
                        <FormDescription>用于调用 GetWsToken 获取 WebSocket Token。</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config.tencentSecretKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>腾讯云 SecretKey</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="SecretKey" {...field} />
                        </FormControl>
                        <FormDescription>与 SecretId 配对，请妥善保管。</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </>
          )}

          {/* Dify specific fields */}
          {agentType === 'dify' && (
            <>
              <FormField
                control={form.control}
                name="config.apiType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.difyApiType')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || 'chat'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('pages.agents.form.fields.difyApiTypePlaceholder')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="chat">{t('pages.agents.form.fields.difyApiChat')}</SelectItem>
                        <SelectItem value="workflow">{t('pages.agents.form.fields.difyApiWorkflow')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>{t('pages.agents.form.fields.difyApiTypeDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.workflowInputKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.difyAttackInputKey')}</FormLabel>
                    <FormControl>
                      <Input placeholder="query" {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.difyAttackInputKeyDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.userId')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('pages.agents.form.fields.userIdPlaceholder')} {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.userIdDescDify')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {difyApiType !== 'workflow' && (
                <FormField
                  control={form.control}
                  name="config.conversationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pages.agents.form.fields.conversationId')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('pages.agents.form.fields.conversationIdPlaceholder')} {...field} />
                      </FormControl>
                      <FormDescription>{t('pages.agents.form.fields.conversationIdDescDify')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="config.responseMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.responseMode')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || 'blocking'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('pages.agents.form.fields.responseModePlaceholder')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="blocking">{t('pages.agents.form.fields.blocking')}</SelectItem>
                        <SelectItem value="streaming">{t('pages.agents.form.fields.streaming')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>{t('pages.agents.form.fields.responseModeDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.inputs"
                render={({ field }) => {
                  // Convert object to JSON string for display, or use empty string
                  const displayValue = field.value
                    ? typeof field.value === 'string'
                      ? field.value
                      : JSON.stringify(field.value, null, 2)
                    : '';

                  return (
                    <FormItem>
                      <FormLabel>{t('pages.agents.form.fields.customInputs')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('pages.agents.form.fields.customInputsPlaceholder')}
                          value={displayValue}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            if (value === '') {
                              field.onChange(undefined);
                            } else {
                              try {
                                const parsed = JSON.parse(value);
                                if (
                                  typeof parsed === 'object' &&
                                  !Array.isArray(parsed) &&
                                  parsed !== null
                                ) {
                                  field.onChange(parsed);
                                } else {
                                  // Invalid: not an object, trigger validation error
                                  field.onChange(value);
                                }
                              } catch (_error) {
                                // Invalid JSON, keep as string for validation error
                                field.onChange(value);
                              }
                            }
                          }}
                          rows={6}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormDescription>{t('pages.agents.form.fields.customInputsDescDify')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </>
          )}

          {/* FastGPT specific fields */}
          {agentType === 'fastgpt' && (
            <>
              <FormField
                control={form.control}
                name="config.conversationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.chatId')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('pages.agents.form.fields.chatIdPlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('pages.agents.form.fields.chatIdDesc')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.userId')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('pages.agents.form.fields.userIdPlaceholderRunner')} {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.userIdDescFastgpt')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.inputs"
                render={({ field }) => {
                  const displayValue = field.value
                    ? typeof field.value === 'string'
                      ? field.value
                      : JSON.stringify(field.value, null, 2)
                    : '';

                  return (
                    <FormItem>
                      <FormLabel>{t('pages.agents.form.fields.variablesJson')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('pages.agents.form.fields.variablesJsonPlaceholder')}
                          value={displayValue}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            if (value === '') {
                              field.onChange(undefined);
                            } else {
                              try {
                                const parsed = JSON.parse(value);
                                if (
                                  typeof parsed === 'object' &&
                                  !Array.isArray(parsed) &&
                                  parsed !== null
                                ) {
                                  field.onChange(parsed);
                                } else {
                                  field.onChange(value);
                                }
                              } catch {
                                field.onChange(value);
                              }
                            }
                          }}
                          rows={6}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormDescription>{t('pages.agents.form.fields.variablesJsonDesc')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </>
          )}

          {/* N8N specific fields */}
          {agentType === 'n8n' && (
            <>
              <FormField
                control={form.control}
                name="config.webhookUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.webhookUrlOptional')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('pages.agents.form.fields.webhookUrlPlaceholder')} {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.webhookUrlDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.webhookPath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.webhookPath')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('pages.agents.form.fields.webhookPathPlaceholder')} {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.webhookPathDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.n8nApiKeyHeaderName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.n8nApiKeyHeaderName')}</FormLabel>
                    <FormControl>
                      <Input placeholder="X-N8N-API-KEY" {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.n8nApiKeyHeaderDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="config.n8nApiKeyPrefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.n8nApiKeyPrefix')}</FormLabel>
                    <FormControl>
                      <Input placeholder="Bearer " {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.n8nApiKeyPrefixDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.n8nRequestBodyMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.n8nRequestBodyMode')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || 'compat'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('pages.agents.form.fields.n8nRequestBodyModePlaceholder')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="compat">{t('pages.agents.form.fields.n8nRequestBodyCompat')}</SelectItem>
                        <SelectItem value="flat">{t('pages.agents.form.fields.n8nRequestBodyFlat')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>{t('pages.agents.form.fields.n8nRequestBodyModeDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.n8nQueryFieldName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.n8nQueryFieldName')}</FormLabel>
                    <FormControl>
                      <Input placeholder="prompt" {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.n8nQueryFieldNameDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.userId')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('pages.agents.form.fields.userIdPlaceholderRunner')} {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.userIdDescN8n')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.conversationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.conversationId')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('pages.agents.form.fields.conversationIdPlaceholder')} {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.conversationIdDescN8n')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.inputs"
                render={({ field }) => {
                  const displayValue = field.value
                    ? typeof field.value === 'string'
                      ? field.value
                      : JSON.stringify(field.value, null, 2)
                    : '';

                  return (
                    <FormItem>
                      <FormLabel>{t('pages.agents.form.fields.customInputs')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('pages.agents.form.fields.customInputsPlaceholder')}
                          value={displayValue}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            if (value === '') {
                              field.onChange(undefined);
                            } else {
                              try {
                                const parsed = JSON.parse(value);
                                if (
                                  typeof parsed === 'object' &&
                                  !Array.isArray(parsed) &&
                                  parsed !== null
                                ) {
                                  field.onChange(parsed);
                                } else {
                                  field.onChange(value);
                                }
                              } catch {
                                field.onChange(value);
                              }
                            }
                          }}
                          rows={6}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormDescription>{t('pages.agents.form.fields.customInputsDescN8n')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </>
          )}

          {/* Coze specific fields */}
          {agentType === 'coze' && (
            <>
              <FormField
                control={form.control}
                name="config.botId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.botId')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('pages.agents.form.fields.botIdPlaceholder')} {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.botIdDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.connectorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.connectorId')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('pages.agents.form.fields.connectorIdPlaceholder')} {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.connectorIdDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {/* API specific fields */}
          {(agentType === 'api' || agentType === 'api-stream' || agentType === 'langchain') && (
            <>
              <FormField
                control={form.control}
                name="config.chatPath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.chatPath')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          agentType === 'api-stream'
                            ? '/v1/chat/stream/message'
                            : '/v1/chat/completions'
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {agentType === 'langchain'
                        ? t('pages.agents.form.fields.chatPathDescLangchain')
                        : agentType === 'api-stream'
                          ? t('pages.agents.form.fields.chatPathDescStream')
                          : t('pages.agents.form.fields.chatPathDescApi')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.model')}</FormLabel>
                    <FormControl>
                      <Input placeholder="gpt-4o-mini" {...field} />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.modelDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.toolChoice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.agents.form.fields.toolChoice')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('pages.agents.form.fields.toolChoicePlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('pages.agents.form.fields.toolChoiceDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.functionCall"
                render={({ field }) => {
                  const displayValue = field.value
                    ? typeof field.value === 'string'
                      ? field.value
                      : JSON.stringify(field.value, null, 2)
                    : '';

                  return (
                    <FormItem>
                      <FormLabel>{t('pages.agents.form.fields.functionCallJson')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('pages.agents.form.fields.functionCallJsonPlaceholder')}
                          value={displayValue}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            if (value === '') {
                              field.onChange(undefined);
                            } else {
                              try {
                                field.onChange(JSON.parse(value));
                              } catch {
                                field.onChange(value);
                              }
                            }
                          }}
                          rows={4}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormDescription>{t('pages.agents.form.fields.functionCallJsonDesc')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="config.tools"
                render={({ field }) => {
                  const displayValue = field.value
                    ? typeof field.value === 'string'
                      ? field.value
                      : JSON.stringify(field.value, null, 2)
                    : '';

                  return (
                    <FormItem>
                      <FormLabel>{t('pages.agents.form.fields.toolsJson')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='[{"type":"function","function":{"name":"get_weather","description":"...","parameters":{"type":"object","properties":{}}}}]'
                          value={displayValue}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            if (value === '') {
                              field.onChange(undefined);
                            } else {
                              try {
                                field.onChange(JSON.parse(value));
                              } catch {
                                field.onChange(value);
                              }
                            }
                          }}
                          rows={6}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormDescription>{t('pages.agents.form.fields.toolsJsonDesc')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="config.functions"
                render={({ field }) => {
                  const displayValue = field.value
                    ? typeof field.value === 'string'
                      ? field.value
                      : JSON.stringify(field.value, null, 2)
                    : '';

                  return (
                    <FormItem>
                      <FormLabel>{t('pages.agents.form.fields.functionsJson')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='[{"name":"get_weather","description":"...","parameters":{"type":"object","properties":{}}}]'
                          value={displayValue}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            if (value === '') {
                              field.onChange(undefined);
                            } else {
                              try {
                                field.onChange(JSON.parse(value));
                              } catch {
                                field.onChange(value);
                              }
                            }
                          }}
                          rows={6}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormDescription>{t('pages.agents.form.fields.functionsJsonDesc')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="config.additionalHeaders"
                render={({ field }) => {
                  const displayValue = field.value ? JSON.stringify(field.value, null, 2) : '';
                  return (
                    <FormItem>
                      <FormLabel>{t('pages.agents.form.fields.additionalHeadersJson')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('pages.agents.form.fields.additionalHeadersPlaceholder')}
                          value={displayValue}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            if (value === '') {
                              field.onChange(undefined);
                            } else {
                              try {
                                const parsed = JSON.parse(value);
                                if (
                                  typeof parsed === 'object' &&
                                  parsed !== null &&
                                  !Array.isArray(parsed)
                                ) {
                                  field.onChange(parsed);
                                } else {
                                  field.onChange(undefined);
                                }
                              } catch {
                                field.onChange(undefined);
                              }
                            }
                          }}
                          rows={4}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormDescription>{t('pages.agents.form.fields.additionalHeadersDesc')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </>
          )}

          {/* Generic API fields (only show for generic API / LangChain types) */}
          {(agentType === 'api' ||
            agentType === 'api-stream' ||
            agentType === 'langchain' ||
            agentType === 'custom' ||
            agentType === 'other') && (
            <FormField
              control={form.control}
              name="config.authType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.agents.form.fields.authType')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('pages.agents.form.fields.authTypePlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="api_key">{t('pages.agents.form.fields.authApiKey')}</SelectItem>
                      <SelectItem value="oauth">{t('pages.agents.form.fields.authOAuth')}</SelectItem>
                      <SelectItem value="basic">{t('pages.agents.form.fields.authBasic')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {agentType !== 'tencent-adp' && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium">{t('pages.agents.form.fields.metadataSection')}</h3>

            <FormField
              control={form.control}
              name="metadata.version"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.agents.form.fields.version')}</FormLabel>
                  <FormControl>
                    <Input placeholder="1.0.0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="metadata.platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.agents.form.fields.platform')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('pages.agents.form.fields.platformPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="metadata.environment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.agents.form.fields.environment')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('pages.agents.form.fields.environmentPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="production">{t('pages.agents.form.fields.production')}</SelectItem>
                      <SelectItem value="staging">{t('pages.agents.form.fields.staging')}</SelectItem>
                      <SelectItem value="development">{t('pages.agents.form.fields.development')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {agentType !== 'tencent-adp' && (
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('pages.agents.form.fields.status')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('pages.agents.form.fields.statusPlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="active">{t('pages.agents.form.fields.statusActive')}</SelectItem>
                    <SelectItem value="inactive">{t('pages.agents.form.fields.statusInactive')}</SelectItem>
                    <SelectItem value="testing">{t('pages.agents.form.fields.statusTesting')}</SelectItem>
                    <SelectItem value="error">{t('pages.agents.form.fields.statusError')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('pages.agents.form.fields.cancel')}
            </Button>
          )}
          <Button
            type="submit"
            disabled={isLoading || form.formState.isSubmitting}
          >
            {isLoading || form.formState.isSubmitting
              ? t('pages.agents.form.fields.saving')
              : agent
                ? t('pages.agents.form.fields.updateAgent')
                : t('pages.agents.form.fields.createAgent')}
          </Button>
        </div>
      </form>
    </Form>
  );
});
