/**
 * Step 3: Select Vulnerabilities
 */

import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Search, Shield } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';
import type { Vulnerability } from '@/types/entities';

import type { TaskFormData } from '../configuration-mode-wizard';

// Category subcategories configuration
const CATEGORIES = {
  agent: [
    'Prompt Injection',
    'Jailbreak Attacks',
    'Tool Function Abuse',
    'Data Leakage',
    'Context Manipulation',
    'Authentication Bypass',
    'Misconfiguration',
    'Business Logic Flaws',
  ],
  llm: [
    'Training Data Poisoning',
    'Model Extraction',
    'Inference Attacks',
    'Adversarial Examples',
    'Membership Inference',
    'Property Inference',
    'Backdoor Attacks',
    'Transfer Learning Attacks',
  ],
  mcp: [
    'Protocol Vulnerabilities',
    'Authentication Flaws',
    'Serialization Issues',
    'Resource Management',
    'State Management',
    'Message Validation',
    'Transport Security',
    'Implementation Bugs',
  ],
  tool: [
    'Sandbox Escape',
    'API Abuse',
    'Permission Escalation',
    'Input Validation',
    'Memory Safety',
    'Dependency Vulnerabilities',
    'Integration Flaws',
    'Resource Exhaustion',
  ],
  platform: [
    'Access Control',
    'Code/Config Injection',
    'Data Security',
    'API Security',
    'Deployment Flaws',
    'Monitoring Bypass',
    'Workflow Vulnerabilities',
    'Orchestration Issues',
  ],
  dify: ['Dify API', 'Dify Config'],
  coze: ['Coze API', 'Coze Config'],
  fastgpt: ['FastGPT API', 'FastGPT Config'],
  n8n: ['N8N API', 'N8N Config'],
} as const;

/** 腾讯 ADP 暂无专属漏洞库：临时仅展示 api_blackbox 且创建于 2026-03-30 之前的漏洞 */
const TENCENT_ADP_VULN_CREATED_BEFORE = '2026-03-30T00:00:00.000Z';

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

interface Step3SelectVulnerabilitiesProps {
  form: UseFormReturn<TaskFormData>;
  surface?: Surface;
}

export function Step3SelectVulnerabilities({
  form,
  surface = 'all',
}: Step3SelectVulnerabilitiesProps) {
  const { t } = useTranslation();
  const p = 'pages.tasks.createWizard.step3';
  const [searchTerm, setSearchTerm] = useState('');
  const isTencentAdp = surface === 'tencent-adp';
  const platformType =
    surface === 'coze'
      ? 'coze'
      : surface === 'fastgpt'
        ? 'fastgpt'
        : surface === 'n8n'
          ? 'n8n'
          : isTencentAdp
            ? 'all'
            : 'dify';
  const platformApiCategory =
    surface === 'coze'
      ? 'Coze API'
      : surface === 'fastgpt'
        ? 'FastGPT API'
        : surface === 'n8n'
          ? 'N8N API'
          : isTencentAdp
            ? 'all'
            : 'Dify API';
  const [selectedType, setSelectedType] = useState<string>(platformType);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>(platformApiCategory);
  const taskKind = form.watch('taskKind');

  useEffect(() => {
    if (taskKind === 'api_test') {
      setSelectedType(platformType);
      setSelectedCategory(platformApiCategory);
    } else if (taskKind === 'config_audit' || taskKind === 'config_static') {
      setSelectedType(platformType);
      setSelectedCategory('all');
    } else {
      setSelectedType('agent');
      setSelectedCategory('all');
    }
  }, [taskKind, platformType, platformApiCategory]);

  const useTencentAdpLegacyApiBlackboxQuery =
    isTencentAdp && taskKind === 'api_test';

  const { data: vulnerabilitiesData, isLoading } = useQuery({
    queryKey: [
      'vulnerabilities',
      taskKind,
      surface,
      selectedType,
      selectedRiskLevel,
      selectedCategory,
      useTencentAdpLegacyApiBlackboxQuery ? TENCENT_ADP_VULN_CREATED_BEFORE : null,
    ],
    queryFn: () => {
      if (useTencentAdpLegacyApiBlackboxQuery) {
        return vulnerabilitiesApi.list({
          limit: 1000,
          verificationMode: 'api_blackbox',
          verificationModeStrict: true,
          createdBefore: TENCENT_ADP_VULN_CREATED_BEFORE,
        });
      }
      return vulnerabilitiesApi.list({
        limit: 1000,
        verificationMode:
          taskKind === 'config_audit'
            ? 'graybox_api_combined'
            : taskKind === 'config_static'
              ? 'config_audit'
              : 'api_blackbox',
        type: selectedType !== 'all' ? (selectedType as Vulnerability['type']) : undefined,
        riskLevel:
          selectedRiskLevel !== 'all'
            ? (selectedRiskLevel as Vulnerability['riskLevel'])
            : undefined,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
      });
    },
  });

  const selectedVulnerabilities = form.watch('vulnerabilities') || [];

  const filteredVulnerabilities = useMemo(() => {
    if (!vulnerabilitiesData?.data) {
      return [];
    }
    let filtered = vulnerabilitiesData.data;

    if (searchTerm) {
      filtered = filtered.filter(
        (v) =>
          v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.avdId.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    return filtered;
  }, [vulnerabilitiesData?.data, searchTerm]);

  const toggleVulnerability = (vulnerabilityId: string) => {
    const current = selectedVulnerabilities;
    const updated = current.includes(vulnerabilityId)
      ? current.filter((id) => id !== vulnerabilityId)
      : [...current, vulnerabilityId];
    form.setValue('vulnerabilities', updated, { shouldValidate: true });
  };

  const filteredIds = useMemo(
    () => filteredVulnerabilities.map((v) => v.id),
    [filteredVulnerabilities],
  );

  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedVulnerabilities.includes(id));

  const selectAllFiltered = () => {
    if (filteredIds.length === 0) {
      return;
    }
    const merged = [...new Set([...selectedVulnerabilities, ...filteredIds])];
    form.setValue('vulnerabilities', merged, { shouldValidate: true });
  };

  const deselectAllFiltered = () => {
    if (filteredIds.length === 0) {
      return;
    }
    const filteredSet = new Set(filteredIds);
    form.setValue(
      'vulnerabilities',
      selectedVulnerabilities.filter((id) => !filteredSet.has(id)),
      { shouldValidate: true },
    );
  };

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

  const stats = useMemo(() => {
    const selected =
      vulnerabilitiesData?.data?.filter((v) => selectedVulnerabilities.includes(v.id)) || [];
    return {
      total: selected.length,
      byType: selected.reduce(
        (acc, v) => {
          acc[v.type] = (acc[v.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byRisk: selected.reduce(
        (acc, v) => {
          acc[v.riskLevel] = (acc[v.riskLevel] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }, [selectedVulnerabilities, vulnerabilitiesData?.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t(`${p}.title`)}
        </CardTitle>
        <CardDescription>
          {isTencentAdp
            ? '腾讯 ADP 暂无专属漏洞库，当前临时展示 verification_mode 为 api_blackbox 且创建于 2026-03-30 之前的漏洞。'
            : t(`${p}.cardDescription`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t(`${p}.searchPlaceholder`)}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            value={selectedType}
            onValueChange={(value) => {
              setSelectedType(value);
              setSelectedCategory('all');
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t(`${p}.typePlaceholder`)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t(`${p}.allTypes`)}</SelectItem>
              <SelectItem value="agent">{t(`${p}.typeAgent`)}</SelectItem>
              <SelectItem value="mcp">{t(`${p}.typeMcp`)}</SelectItem>
              <SelectItem value="llm">{t(`${p}.typeLlm`)}</SelectItem>
              <SelectItem value="tool">{t(`${p}.typeTool`)}</SelectItem>
              <SelectItem value="platform">{t(`${p}.typePlatform`)}</SelectItem>
              <SelectItem value="dify">{t(`${p}.typeDify`)}</SelectItem>
              <SelectItem value="coze">{t(`${p}.typeCoze`)}</SelectItem>
              <SelectItem value="fastgpt">{t(`${p}.typeFastgpt`)}</SelectItem>
              <SelectItem value="n8n">{t(`${p}.typeN8n`)}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
            <SelectTrigger>
              <SelectValue placeholder={t(`${p}.riskPlaceholder`)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t(`${p}.allRisk`)}</SelectItem>
              <SelectItem value="critical">{t(`${p}.riskCritical`)}</SelectItem>
              <SelectItem value="high">{t(`${p}.riskHigh`)}</SelectItem>
              <SelectItem value="medium">{t(`${p}.riskMedium`)}</SelectItem>
              <SelectItem value="low">{t(`${p}.riskLow`)}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
              <SelectValue placeholder={t(`${p}.categoryPlaceholder`)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t(`${p}.allCategories`)}</SelectItem>
              {selectedType !== 'all' &&
                CATEGORIES[selectedType as keyof typeof CATEGORIES]?.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Statistics */}
        {selectedVulnerabilities.length > 0 && (
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="text-sm font-medium">
              {t(`${p}.selected`)} <span className="text-primary">{stats.total}</span>
            </div>
            {Object.keys(stats.byType).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t(`${p}.byType`)}</span>
                {Object.entries(stats.byType).map(([type, count]) => (
                  <Badge key={type} variant="outline">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            )}
            {Object.keys(stats.byRisk).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t(`${p}.byRisk`)}</span>
                {Object.entries(stats.byRisk).map(([risk, count]) => (
                  <Badge key={risk} variant={getRiskColor(risk) as any}>
                    {risk}: {count}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vulnerability List */}
        <FormField
          control={form.control}
          name="vulnerabilities"
          render={({ field: _field }) => (
            <FormItem>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FormLabel className="mb-0">{t(`${p}.vulnerabilitiesLabel`)}</FormLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoading || filteredIds.length === 0 || allFilteredSelected}
                    onClick={selectAllFiltered}
                  >
                    {t(`${p}.selectAllFiltered`)}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={
                      isLoading ||
                      filteredIds.length === 0 ||
                      !filteredIds.some((id) => selectedVulnerabilities.includes(id))
                    }
                    onClick={deselectAllFiltered}
                  >
                    {t(`${p}.clearFiltered`)}
                  </Button>
                </div>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-lg p-4">
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : filteredVulnerabilities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {t(`${p}.empty`)}
                  </div>
                ) : (
                  filteredVulnerabilities.map((vuln) => (
                    <div
                      key={vuln.id}
                      className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedVulnerabilities.includes(vuln.id)}
                        onCheckedChange={() => toggleVulnerability(vuln.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{vuln.name}</span>
                          <Badge variant={getRiskColor(vuln.riskLevel) as any} className="text-xs">
                            {vuln.riskLevel}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {vuln.type}
                          </Badge>
                          {vuln.cvssScore != null && Number.isFinite(Number(vuln.cvssScore)) && (
                            <Badge variant="secondary" className="text-xs">
                              CVSS: {Number(vuln.cvssScore).toFixed(1)}
                            </Badge>
                          )}
                          {vuln.enabledAttackCommandCount != null && (
                            <Badge variant="outline" className="text-xs tabular-nums">
                              {t(`${p}.testCommands`, {
                                count: vuln.enabledAttackCommandCount,
                              })}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mb-1">
                          {vuln.avdId}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {vuln.description}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <FormDescription>{t(`${p}.formHint`)}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
