/**
 * Step 7: Advanced Settings
 */

import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Clock, Users, AlertCircle, Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { quotaApi } from '@/services/api/quota';
import { useOrganizationStore } from '@/stores/organization-store';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ATTACK_TASK_EXECUTION_LIMITS,
  clampExecutionInt,
} from '@/features/tasks/execution-settings-limits';
import type { TaskFormData } from '../configuration-mode-wizard';

interface Step7AdvancedSettingsProps {
  form: UseFormReturn<TaskFormData>;
}

const EXEC = ATTACK_TASK_EXECUTION_LIMITS;

export function Step7AdvancedSettings({ form }: Step7AdvancedSettingsProps) {
  const { t } = useTranslation();
  const p = 'pages.tasks.createWizard.step7';
  const currentOrg = useOrganizationStore((s) => s.currentOrg);
  const { data: quotaUsage, isLoading: quotaLoading } = useQuery({
    queryKey: ['quota', 'usage', currentOrg?.id],
    queryFn: () => quotaApi.getUsage(currentOrg!.id),
    enabled: !!currentOrg?.id,
    staleTime: 1 * 60 * 1000, // 1 minute
  });

  const taskQuota = quotaUsage?.quotas?.['attackTasksPerMonth'] ?? { used: 0, limit: 1000 };
  const usagePercentage = taskQuota.limit > 0 ? (taskQuota.used / taskQuota.limit) * 100 : 0;
  const remaining = Math.max(0, taskQuota.limit - taskQuota.used);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t(`${p}.title`)}
        </CardTitle>
        <CardDescription>{t(`${p}.cardDescription`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Execution Configuration */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t(`${p}.executionHeading`)}
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="advancedSettings.delayMs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.delayMs`)}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={EXEC.delayMs.min}
                      max={EXEC.delayMs.max}
                      placeholder={String(EXEC.delayMs.default)}
                      {...field}
                      onChange={(e) =>
                        field.onChange(clampExecutionInt(e.target.value, EXEC.delayMs))
                      }
                    />
                  </FormControl>
                  <FormDescription>{t(`${p}.delayHint`)}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="advancedSettings.maxConcurrency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.maxConcurrency`)}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={EXEC.maxConcurrency.min}
                      max={EXEC.maxConcurrency.max}
                      placeholder={String(EXEC.maxConcurrency.default)}
                      {...field}
                      onChange={(e) =>
                        field.onChange(clampExecutionInt(e.target.value, EXEC.maxConcurrency))
                      }
                    />
                  </FormControl>
                  <FormDescription>{t(`${p}.maxConcurrencyHint`)}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="advancedSettings.timeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.timeoutMs`)}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={EXEC.timeoutMs.min}
                      max={EXEC.timeoutMs.max}
                      placeholder={String(EXEC.timeoutMs.default)}
                      {...field}
                      onChange={(e) =>
                        field.onChange(clampExecutionInt(e.target.value, EXEC.timeoutMs))
                      }
                    />
                  </FormControl>
                  <FormDescription>{t(`${p}.timeoutHint`)}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="advancedSettings.retryStrategy.maxRetries"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.maxRetries`)}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={EXEC.maxRetries.min}
                      max={EXEC.maxRetries.max}
                      placeholder={String(EXEC.maxRetries.default)}
                      {...field}
                      onChange={(e) =>
                        field.onChange(clampExecutionInt(e.target.value, EXEC.maxRetries))
                      }
                    />
                  </FormControl>
                  <FormDescription>{t(`${p}.maxRetriesHint`)}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="advancedSettings.retryStrategy.retryDelay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.retryDelayMs`)}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={EXEC.retryDelayMs.min}
                      max={EXEC.retryDelayMs.max}
                      placeholder={String(EXEC.retryDelayMs.default)}
                      {...field}
                      onChange={(e) =>
                        field.onChange(clampExecutionInt(e.target.value, EXEC.retryDelayMs))
                      }
                    />
                  </FormControl>
                  <FormDescription>{t(`${p}.retryDelayHint`)}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Quota Information */}
        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <Users className="h-4 w-4" />
            {t(`${p}.quotaHeading`)}
          </h3>
          {quotaLoading ? (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-2 w-full mt-2" />
            </div>
          ) : (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t(`${p}.monthlyLimit`)}</span>
                <span className="font-medium">
                  {taskQuota.used} / {taskQuota.limit}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t(`${p}.remaining`)}</span>
                <span
                  className={`font-medium ${
                    remaining < 10
                      ? 'text-destructive'
                      : remaining < 50
                        ? 'text-yellow-600'
                        : 'text-green-600'
                  }`}
                >
                  {t(`${p}.remainingTasks`, { count: remaining })}
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2 mt-2">
                <div
                  className={`h-2 rounded-full ${
                    usagePercentage >= 90
                      ? 'bg-destructive'
                      : usagePercentage >= 70
                        ? 'bg-yellow-600'
                        : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(100, usagePercentage)}%` }}
                />
              </div>
              {remaining < 10 && (
                <div className="flex items-center gap-2 mt-2 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  <span>{t(`${p}.quotaWarn`)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notification Configuration */}
        <div className="pt-4 border-t space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t(`${p}.notifyHeading`)}
          </h3>

          <div className="space-y-3">
            <FormField
              control={form.control}
              name="advancedSettings.notifications.onComplete"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>{t(`${p}.notifyComplete`)}</FormLabel>
                    <FormDescription>{t(`${p}.notifyCompleteHint`)}</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="advancedSettings.notifications.onVulnerabilityFound"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>{t(`${p}.notifyVuln`)}</FormLabel>
                    <FormDescription>{t(`${p}.notifyVulnHint`)}</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="advancedSettings.notifications.onFailure"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>{t(`${p}.notifyFail`)}</FormLabel>
                    <FormDescription>{t(`${p}.notifyFailHint`)}</FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
