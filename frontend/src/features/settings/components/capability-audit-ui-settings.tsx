/**
 * System setting: show engine status + scan strategy on SKILL capability audit UI.
 */

import { useEffect, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatApiClientError } from '@/services/api/client';
import { systemConfigApi } from '@/services/api/system-config';
import {
  CAPABILITY_AUDIT_UI_CONFIG_KEY,
  normalizeCapabilityAuditUiConfig,
  type CapabilityAuditUiConfig,
} from '@/features/capability-audit/capability-audit-ui-config';

export function CapabilityAuditUiSettings() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const qc = useQueryClient();
  const [showAdvancedScanUi, setShowAdvancedScanUi] = useState(false);

  const { data: configRow, isLoading } = useQuery({
    queryKey: ['system-config-key', CAPABILITY_AUDIT_UI_CONFIG_KEY],
    queryFn: async () => {
      try {
        return await systemConfigApi.getByKey(CAPABILITY_AUDIT_UI_CONFIG_KEY);
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          return { key: CAPABILITY_AUDIT_UI_CONFIG_KEY, value: {} };
        }
        throw e;
      }
    },
    retry: false,
  });

  useEffect(() => {
    const v = normalizeCapabilityAuditUiConfig(configRow?.value);
    setShowAdvancedScanUi(v.showAdvancedScanUi);
  }, [configRow]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const next: CapabilityAuditUiConfig = { showAdvancedScanUi };
      await systemConfigApi.updateByKey(CAPABILITY_AUDIT_UI_CONFIG_KEY, { value: next });
    },
    onSuccess: async () => {
      toast.success(isZh ? '已保存 SKILL 评估前台设置' : 'SKILL audit UI settings saved');
      await qc.invalidateQueries({ queryKey: ['system-config-key', CAPABILITY_AUDIT_UI_CONFIG_KEY] });
    },
    onError: (err: unknown) => {
      const msg = formatApiClientError(err);
      toast.error(isZh ? `保存失败：${msg}` : `Save failed: ${msg}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isZh ? 'SKILL 组件评估（前台）' : 'SKILL component audit (UI)'}</CardTitle>
        <CardDescription>
          {isZh
            ? '控制评估页是否展示引擎状态与扫描策略选择。关闭后前台仅保留上传与默认标准扫描。'
            : 'Control whether the audit page shows engine status and scan strategy. When off, users only upload and run the default standard scan.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="capability-show-advanced-scan-ui" className="text-sm font-medium">
                  {isZh ? '显示引擎状态与扫描策略' : 'Show engine status & scan strategy'}
                </Label>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {isZh
                    ? '开启后，概览可见引擎状态；运行审计可选标准扫描等策略。'
                    : 'When enabled, overview shows engine status; run audit allows choosing strategies such as standard scan.'}
                </p>
              </div>
              <Switch
                id="capability-show-advanced-scan-ui"
                checked={showAdvancedScanUi}
                onCheckedChange={setShowAdvancedScanUi}
              />
            </div>
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isZh ? '保存' : 'Save'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
