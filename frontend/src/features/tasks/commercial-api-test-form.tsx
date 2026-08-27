/**
 * Commercial API test create form: protocol + endpoint + vulnerabilities scan.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, Play, Plug } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CommercialApiVulnerabilityPicker } from '@/features/tasks/components/commercial-api-vulnerability-picker';
import { markAttackTaskRunJustStarted } from '@/features/tasks/active-run-session';
import {
  agentTypeToProtocol,
  buildEndpointPreview,
  COMMERCIAL_API_PLATFORM_FAMILY,
  COMMERCIAL_API_RUN_SOURCE,
  vulnerabilityIdMatchesCommercialApiSet,
  defaultChatPath,
  parseJsonObjectField,
  protocolLabel,
  protocolToAgentType,
  resolveV4ForCommercialApiTest,
  type CommercialApiProtocol,
} from '@/features/tasks/commercial-api-test-shared';
import { agentsApi } from '@/services/api/agents';
import { tasksApi } from '@/services/api/tasks';
import type { CreateAttackTaskRequest, CreateTargetAgentRequest } from '@/types/api';

type Tr = (en: string, zh: string) => string;

interface CommercialApiTestFormProps {
  tr: Tr;
  isZh: boolean;
  onSuccessNavigateTo?: 'task' | 'list';
}

export function CommercialApiTestForm({
  tr,
  isZh,
  onSuccessNavigateTo = 'task',
}: CommercialApiTestFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [protocol, setProtocol] = useState<CommercialApiProtocol>('api');
  const [taskNameOverride, setTaskNameOverride] = useState('');

  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [chatPath, setChatPath] = useState(defaultChatPath('api'));
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [inputsJson, setInputsJson] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [vulnerabilityIds, setVulnerabilityIds] = useState<string[]>([]);
  const [probeResult, setProbeResult] = useState<{
    status: 'success' | 'failed';
    message: string;
    httpStatus?: number;
    durationMs?: number;
    preview?: string;
  } | null>(null);

  useEffect(() => {
    setChatPath(defaultChatPath(protocol));
  }, [protocol]);

  const { data: taskTypes = [] } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => tasksApi.listTaskTypes(),
    staleTime: 5 * 60 * 1000,
  });

  const endpointPreview = useMemo(
    () => buildEndpointPreview({ apiBaseUrl, chatPath }),
    [apiBaseUrl, chatPath],
  );

  const buildAgentConfig = (): Record<string, unknown> => {
    const inputs = parseJsonObjectField(inputsJson, tr('Fixed params (inputs)', '固定参数 (inputs)'));
    const cfg: Record<string, unknown> = {
      apiBaseUrl: apiBaseUrl.trim(),
      chatPath: chatPath.trim() || defaultChatPath(protocol),
    };
    if (apiKey.trim()) {
      cfg.apiKey = apiKey.trim();
    }
    if (inputs && Object.keys(inputs).length > 0) {
      cfg.inputs = inputs;
    }
    if (model.trim()) {
      cfg.model = model.trim();
    }
    return cfg;
  };

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const base = apiBaseUrl.trim();
      if (!base) {
        throw new Error(tr('Enter API base URL', '请输入 API Base URL'));
      }
      parseJsonObjectField(inputsJson, tr('Fixed params (inputs)', '固定参数 (inputs)'));
      return agentsApi.probeCommercialApi({
        type: protocol === 'api-stream' ? 'api-stream' : 'api',
        config: buildAgentConfig(),
      });
    },
    onSuccess: (result) => {
      setProbeResult(result);
      if (result.status === 'success') {
        toast.success(result.message || tr('Connection test successful', '连接测试成功'));
      } else {
        toast.error(result.message || tr('Connection test failed', '连接测试失败'));
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setProbeResult({ status: 'failed', message: msg });
      toast.error(msg);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const vulnsToRun = vulnerabilityIds.filter((id) => vulnerabilityIdMatchesCommercialApiSet(id));
      if (vulnsToRun.length === 0) {
        throw new Error(
          tr(
            'Select at least one vulnerability whose id contains the fixed fragment',
            '请至少选择一项 id 符合固定规则的漏洞测试',
          ),
        );
      }

      const base = apiBaseUrl.trim();
      if (!base) {
        throw new Error(tr('Enter API base URL', '请输入 API Base URL'));
      }

      const endpoint = buildEndpointPreview({ apiBaseUrl: base, chatPath });
      const label =
        displayName.trim() ||
        endpoint ||
        `${tr('Commercial API', '商业API')} ${new Date().toLocaleString(isZh ? 'zh-CN' : 'en-US')}`;

      const agentPayload: CreateTargetAgentRequest = {
        name: label,
        type: protocolToAgentType(protocol),
        config: buildAgentConfig(),
        status: 'active',
      };
      const agent = await agentsApi.create(agentPayload);

      const agentProtocol = agentTypeToProtocol(agent.type) ?? protocol;
      const v4 = resolveV4ForCommercialApiTest(taskTypes);
      const streamMode = agentProtocol === 'api-stream' ? 'stream' : 'blocking';
      const autoName = `${tr('Commercial API test', '商业API测试')} — ${label} — ${new Date().toLocaleString(isZh ? 'zh-CN' : 'en-US')}`;

      const payload: CreateAttackTaskRequest = {
        name: taskNameOverride.trim() || autoName,
        description: tr(
          'Commercial custom API black-box security scan',
          '商业 Custom API 黑盒安全扫描',
        ),
        targetType: 'agent',
        targetConfig: { agentId: agent.id },
        vulnerabilities: vulnsToRun,
        attackMode: 'simple',
        platformFamily: COMMERCIAL_API_PLATFORM_FAMILY,
        scanMode: v4.scanMode,
        ...(v4.taskTypeId ? { taskTypeId: v4.taskTypeId } : {}),
        detectionConfig: {
          useRule: true,
          useLLM: true,
          useKnowledgeBase: false,
        },
        metadata: {
          taskKind: 'commercial_api_test',
          runSource: COMMERCIAL_API_RUN_SOURCE,
          creationMode: 'commercial_api_test',
          commercialApi: {
            agentId: agent.id,
            agentName: label,
            protocol: agentProtocol,
            streamMode,
            endpointPreview: endpoint,
          },
        },
      };

      const task = await tasksApi.create(payload);
      await tasksApi.run({ taskId: task.id });
      return task;
    },
    onSuccess: (task) => {
      markAttackTaskRunJustStarted(task.id);
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['attack-tasks', 'commercial-api-test-list'] });
      queryClient.invalidateQueries({ queryKey: ['target-agents'] });
      toast.success(tr('Commercial API scan started', '商业 API 扫描已启动'));
      if (onSuccessNavigateTo === 'list') {
        navigate({ to: '/tasks/commercial-api-test' });
      } else {
        navigate({ to: '/tasks/$taskId', params: { taskId: task.id } });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr('Commercial API security scan', '商业 API 安全扫描')}</CardTitle>
        <CardDescription>
          {tr(
            'Enter the custom API route and parameters, pick vulnerability tests, and run a full black-box scan.',
            '填写 Custom API 路由与参数，选择漏洞项并执行全量黑盒扫描。',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label>{tr('Protocol', '协议类型')}</Label>
            <Select value={protocol} onValueChange={(v) => setProtocol(v as CommercialApiProtocol)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="api">{protocolLabel('api', isZh)}</SelectItem>
                <SelectItem value="api-stream">{protocolLabel('api-stream', isZh)}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{tr('Display name (optional)', '显示名称（可选）')}</Label>
            <Input
              placeholder={tr('e.g. Customer A production API', '例如：客户A 生产环境 API')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{tr('API base URL', 'API Base URL')}</Label>
              <Input
                placeholder="https://api.example.com"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{tr('Route path', '路由 Path')}</Label>
              <Input
                placeholder={defaultChatPath(protocol)}
                value={chatPath}
                onChange={(e) => setChatPath(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{tr('API key (optional)', 'API Key（可选）')}</Label>
              <Input
                type="password"
                placeholder="sk-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{tr('Model (OpenAI compat)', 'Model（OpenAI 兼容）')}</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{tr('Fixed params (JSON object)', '固定参数（JSON 对象）')}</Label>
            <Textarea
              className="min-h-[80px] font-mono text-xs"
              placeholder='{"tenant_id": "demo"}'
              value={inputsJson}
              onChange={(e) => setInputsJson(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {tr('Mapped to request metadata.', '写入 OpenAI 兼容请求的 metadata 字段。')}
            </p>
          </div>

          {endpointPreview ? (
            <p className="text-muted-foreground text-xs">
              {tr('Endpoint preview', 'Endpoint 预览')}: {endpointPreview}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={testConnectionMutation.isPending || !apiBaseUrl.trim()}
              onClick={() => testConnectionMutation.mutate()}
            >
              {testConnectionMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              {tr('Test connection', '测试连接')}
            </Button>
          </div>

          {probeResult ? (
            <div
              className={
                probeResult.status === 'success'
                  ? 'rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm'
                  : 'rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm'
              }
            >
              <p className="font-medium">
                {probeResult.status === 'success'
                  ? tr('Connection OK', '连接成功')
                  : tr('Connection failed', '连接失败')}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">{probeResult.message}</p>
              {probeResult.httpStatus != null || probeResult.durationMs != null ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {probeResult.httpStatus != null ? `HTTP ${probeResult.httpStatus}` : null}
                  {probeResult.httpStatus != null && probeResult.durationMs != null ? ' · ' : null}
                  {probeResult.durationMs != null
                    ? `${probeResult.durationMs}ms`
                    : null}
                </p>
              ) : null}
              {probeResult.preview ? (
                <pre className="mt-2 max-h-24 overflow-auto rounded bg-muted/50 p-2 font-mono text-[10px] whitespace-pre-wrap break-all">
                  {probeResult.preview}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>{tr('Task name (optional)', '任务名称（可选）')}</Label>
          <Input
            placeholder={tr('Auto-generated if empty', '留空则自动生成')}
            value={taskNameOverride}
            onChange={(e) => setTaskNameOverride(e.target.value)}
          />
        </div>

        <CommercialApiVulnerabilityPicker
          tr={tr}
          selectedIds={vulnerabilityIds}
          onChange={setVulnerabilityIds}
        />

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="button"
            disabled={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {tr('Create & run scan', '创建并运行扫描')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
