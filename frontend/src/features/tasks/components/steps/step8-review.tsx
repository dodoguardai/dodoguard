/**
 * Step 8: Review and Submit
 */

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { agentsApi } from '@/services/api/agents';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';
import { getRegisteredAgentIdsFromTargetConfig } from '../task-wizard-agent-target';
import { ATTACK_TASK_EXECUTION_LIMITS } from '@/features/tasks/execution-settings-limits';
import type { TFunction } from 'i18next';

import type { TaskFormData } from '../configuration-mode-wizard';

type Surface =
  | 'all'
  | 'agent'
  | 'coze'
  | 'fastgpt'
  | 'n8n'
  | 'tencent-adp'
  | 'mcp'
  | 'tool'
  | 'platform'
  | 'llm';

function reviewTaskTypeLabel(taskKind: string, surface: Surface, t: TFunction): string {
  const p = 'pages.tasks.createWizard.step8';
  if (taskKind === 'config_static') {
    if (surface === 'coze') {
      return t(`${p}.reviewCozeStatic`);
    }
    if (surface === 'fastgpt') {
      return t(`${p}.reviewFastgptStatic`);
    }
    if (surface === 'n8n') {
      return t(`${p}.reviewN8nStatic`);
    }
    return t(`${p}.reviewDifyStatic`);
  }
  if (taskKind === 'config_audit') {
    if (surface === 'coze') {
      return t(`${p}.reviewCozeAudit`);
    }
    if (surface === 'fastgpt') {
      return t(`${p}.reviewFastgptAudit`);
    }
    if (surface === 'n8n') {
      return t(`${p}.reviewN8nAudit`);
    }
    return t(`${p}.reviewDifyAudit`);
  }
  if (surface === 'coze') {
    return t(`${p}.reviewCozeApi`);
  }
  if (surface === 'fastgpt') {
    return t(`${p}.reviewFastgptApi`);
  }
  if (surface === 'n8n') {
    return t(`${p}.reviewN8nApi`);
  }
  if (surface === 'tencent-adp') {
    return '腾讯 ADP API 黑盒测试';
  }
  return t(`${p}.reviewDifyApi`);
}

interface Step8ReviewProps {
  form: UseFormReturn<TaskFormData>;
  surface?: Surface;
}

export function Step8Review({ form, surface = 'all' }: Step8ReviewProps) {
  const { t } = useTranslation();
  const p = 'pages.tasks.createWizard.step8';
  const formData = form.getValues();
  const taskKind = form.watch('taskKind');
  const watchedTargetConfig = form.watch('targetConfig');
  const selectedVulnerabilityIds = form.watch('vulnerabilities') ?? [];
  const selectedVulnerabilityIdsKey = [...selectedVulnerabilityIds].sort().join(',');

  const { data: selectedVulnerabilities = [], isLoading: vulnsLoading } = useQuery({
    queryKey: ['vulnerabilities', 'review-by-ids', taskKind, selectedVulnerabilityIdsKey],
    queryFn: () => vulnerabilitiesApi.getByIds(selectedVulnerabilityIds),
    enabled: selectedVulnerabilityIds.length > 0,
  });

  const agentIds = getRegisteredAgentIdsFromTargetConfig(watchedTargetConfig);
  const agentPlatform =
    surface === 'coze'
      ? 'coze'
      : surface === 'fastgpt'
        ? 'fastgpt'
        : surface === 'n8n'
          ? 'n8n'
          : surface === 'tencent-adp'
            ? 'tencent-adp'
            : 'dify';

  const { data: agentsForReview, isLoading: agentsReviewLoading } = useQuery({
    queryKey: ['target-agents', formData.targetType, agentPlatform, 'review'],
    queryFn: () => agentsApi.list({ type: agentPlatform }),
    enabled: formData.targetType === 'agent' && agentIds.length > 0,
  });

  const selectedVulnerabilitiesById = new Map(
    selectedVulnerabilities.map((vulnerability) => [vulnerability.id, vulnerability]),
  );

  const getTargetTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      agent: t(`${p}.targetAgent`),
      mcp: t(`${p}.targetMcp`),
      llm: t(`${p}.targetLlm`),
      tool: t(`${p}.targetTool`),
      platform: t(`${p}.targetPlatform`),
      composite: t(`${p}.targetComposite`),
    };
    return labels[type] || type;
  };

  const getTestingModeLabel = (mode: string) => {
    if (mode === 'simple') {
      return t(`${p}.modeSimple`);
    }
    const labels: Record<string, string> = {
      conversation: t(`${p}.modeConversation`),
      composite: t(`${p}.modeComposite`),
    };
    return labels[mode] || mode;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t(`${p}.title`)}</CardTitle>
          <CardDescription>{t(`${p}.cardDescription`)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t(`${p}.sectionBasic`)}</h3>
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <span className="text-xs text-muted-foreground">{t(`${p}.labelTaskType`)}</span>
                <p className="font-medium">{reviewTaskTypeLabel(formData.taskKind, surface, t)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t(`${p}.labelTaskName`)}</span>
                <p className="font-medium">{formData.name}</p>
              </div>
              {formData.description && (
                <div>
                  <span className="text-xs text-muted-foreground">
                    {t(`${p}.labelDescription`)}
                  </span>
                  <p className="text-sm">{formData.description}</p>
                </div>
              )}
            </div>
            {(formData.taskKind === 'config_audit' || formData.taskKind === 'config_static') && (
              <div className="p-4 bg-muted rounded-lg text-sm">
                <span className="text-xs text-muted-foreground">{t(`${p}.labelConfigFile`)}</span>{' '}
                {(formData.configAuditFileName as string | undefined) ||
                  (surface === 'fastgpt' || surface === 'n8n'
                    ? t(`${p}.pastedJson`)
                    : t(`${p}.pastedYaml`))}{' '}
                · {String(formData.configAuditYaml || '').length} {t(`${p}.chars`)}
              </div>
            )}
          </div>

          {/* Target Configuration */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t(`${p}.sectionTarget`)}</h3>
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t(`${p}.labelType`)}</span>
                <Badge>{getTargetTypeLabel(formData.targetType)}</Badge>
              </div>
              {formData.targetType === 'agent' && agentIds.length > 1 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-50">
                  {t(`${p}.multiTaskBanner`, { count: agentIds.length })}
                </div>
              )}
              {formData.targetType === 'agent' && agentIds.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t(`${p}.labelAgents`)}</span>
                  {agentsReviewLoading ? (
                    <Skeleton className="mt-1 h-10 w-full" />
                  ) : (
                    <ul className="mt-1 list-inside list-disc space-y-1 text-sm font-medium">
                      {agentIds.map((id) => {
                        const row = agentsForReview?.data?.find((a) => a.id === id);
                        return <li key={id}>{row?.name ?? id}</li>;
                      })}
                    </ul>
                  )}
                  {agentIds.length > 1 ? (
                    <p className="text-muted-foreground mt-2 text-xs">
                      {t(`${p}.multiTaskNameHint`)}
                    </p>
                  ) : null}
                </div>
              )}
              {formData.targetType === 'agent' && agentIds.length === 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t(`${p}.labelApiBaseUrl`)}</span>
                  <p className="font-mono text-xs">
                    {(formData.targetConfig as any)?.agent?.apiBaseUrl || t(`${p}.notSet`)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Vulnerabilities */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              {t(`${p}.sectionVulns`, { count: selectedVulnerabilityIds.length })}
            </h3>
            <div className="p-4 bg-muted rounded-lg space-y-2 max-h-[200px] overflow-y-auto">
              {selectedVulnerabilityIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t(`${p}.notSet`)}</p>
              ) : vulnsLoading ? (
                <Skeleton className="h-4 w-full" />
              ) : (
                selectedVulnerabilityIds.map((vulnerabilityId) => {
                  const vuln = selectedVulnerabilitiesById.get(vulnerabilityId);
                  if (!vuln) {
                    return (
                      <div
                        key={vulnerabilityId}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="font-mono text-xs">{vulnerabilityId}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={vuln.id} className="flex items-center justify-between text-sm">
                      <span>{vuln.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {vuln.type}
                        </Badge>
                        <Badge
                          variant={
                            vuln.riskLevel === 'critical' || vuln.riskLevel === 'high'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-xs"
                        >
                          {vuln.riskLevel}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Testing Mode — Gray-box task step; API Test uses default simple (step skipped) */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t(`${p}.sectionTestingMode`)}</h3>
            <div className="p-4 bg-muted rounded-lg space-y-2">
              {formData.taskKind === 'api_test' && (
                <p className="text-xs text-muted-foreground mb-2">{t(`${p}.apiTestSimpleNote`)}</p>
              )}
              <Badge>{getTestingModeLabel(formData.attackMode)}</Badge>
              {formData.attackMode !== 'simple' && (
                <p className="text-xs text-muted-foreground">{t(`${p}.legacyModeNote`)}</p>
              )}
            </div>
          </div>

          {/* Detection Configuration */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t(`${p}.sectionDetection`)}</h3>
            <div className="p-4 bg-muted rounded-lg space-y-2">
              {formData.taskKind === 'api_test' ? (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>{t(`${p}.detectionApiSummary`)}</p>
                  <div>
                    {t(`${p}.labelLlmModel`)}{' '}
                    {formData.detectionConfig.llmConfig?.model || t(`${p}.notSet`)}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {formData.detectionConfig.useRule && (
                      <Badge variant="outline">{t(`${p}.badgeRuleBase`)}</Badge>
                    )}
                    {formData.detectionConfig.useLLM && (
                      <Badge variant="outline">{t(`${p}.badgeLlmBase`)}</Badge>
                    )}
                  </div>
                  {formData.detectionConfig.useLLM && formData.detectionConfig.llmConfig && (
                    <div className="text-xs text-muted-foreground mt-2 space-y-1">
                      <div>
                        {t(`${p}.labelLlmModel`)}{' '}
                        {formData.detectionConfig.llmConfig.model || t(`${p}.notSet`)}
                      </div>
                      {formData.detectionConfig.llmConfig.confidenceThreshold != null && (
                        <div>
                          {t(`${p}.labelConfidence`)}{' '}
                          {formData.detectionConfig.llmConfig.confidenceThreshold}
                        </div>
                      )}
                    </div>
                  )}
                  {(formData.taskKind === 'config_audit' ||
                    formData.taskKind === 'config_static') &&
                    formData.detectionConfig.useKnowledgeBase && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {t(`${p}.fullFileAuditOn`)}
                      </p>
                    )}
                </>
              )}
            </div>
          </div>

          {/* Agent Configuration */}
          {formData.agentConfig?.enabled && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t(`${p}.sectionAgent`)}</h3>
              <div className="p-4 bg-muted rounded-lg space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">{t(`${p}.labelProvider`)}</span>{' '}
                  {(formData.agentConfig as { provider?: string })?.provider ?? '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">{t(`${p}.labelModel`)}</span>{' '}
                  {formData.agentConfig.model}
                </div>
                <div>
                  <span className="text-muted-foreground">{t(`${p}.labelTemperature`)}</span>{' '}
                  {formData.agentConfig.temperature || 0.7}
                </div>
              </div>
            </div>
          )}

          {/* Advanced Settings Summary */}
          {formData.advancedSettings && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t(`${p}.sectionAdvanced`)}</h3>
              <div className="p-4 bg-muted rounded-lg space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">{t(`${p}.labelDelay`)}</span>{' '}
                  {formData.advancedSettings.delayMs ?? ATTACK_TASK_EXECUTION_LIMITS.delayMs.default}ms
                </div>
                <div>
                  <span className="text-muted-foreground">{t(`${p}.labelMaxConcurrency`)}</span>{' '}
                  {formData.advancedSettings.maxConcurrency ??
                    ATTACK_TASK_EXECUTION_LIMITS.maxConcurrency.default}
                </div>
                <div>
                  <span className="text-muted-foreground">{t(`${p}.labelTimeout`)}</span>{' '}
                  {formData.advancedSettings.timeout ?? ATTACK_TASK_EXECUTION_LIMITS.timeoutMs.default}ms
                </div>
              </div>
            </div>
          )}

          {/* Validation Status */}
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  {t(`${p}.validTitle`)}
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  {t(`${p}.validSubtitle`)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
