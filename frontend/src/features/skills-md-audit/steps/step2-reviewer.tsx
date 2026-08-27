/**
 * Step 2: Select reviewer model
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export interface ModelOption {
  value: string;
  label: string;
  config?: { apiKey?: string; apiBaseUrl?: string };
}

export interface Step2ReviewerProps {
  modelOptions: ModelOption[];
  selectedModelValue: string;
  setSelectedModelValue: (v: string) => void;
  isLoading: boolean;
  integrationsError: boolean;
}

export function Step2Reviewer({
  modelOptions,
  selectedModelValue,
  setSelectedModelValue,
  isLoading,
  integrationsError,
}: Step2ReviewerProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  return (
    <div className="space-y-4">
      {integrationsError && (
        <Alert variant="destructive">
          <AlertTitle>{tr('Could not load integrations', '无法加载集成配置')}</AlertTitle>
          <AlertDescription>
            {tr(
              'You may need',
              '你可能缺少',
            )}{' '}
            <code className="text-xs">system:read</code>{' '}
            {tr(
              'permission, or the request failed. The audit will use the server default (',
              '权限，或请求失败。审计将使用服务端默认配置（',
            )}
            <code className="text-xs">OPENAI_API_KEY</code> /{' '}
            <code className="text-xs">SKILLS_MD_AUDIT_PROVIDER_ID</code> /{' '}
            <code className="text-xs">DIFY_CONFIG_AUDIT_PROVIDER_ID</code>) if you run without a
            {tr('selected model.', '已选模型时除外。')}
          </AlertDescription>
        </Alert>
      )}
      {!integrationsError && modelOptions.length === 0 && !isLoading && (
        <Alert>
          <AlertTitle>{tr('No LLM integration configured', '未配置可用的 LLM 集成')}</AlertTitle>
          <AlertDescription>
            {tr('Add an enabled LLM integration in', '请在')}{' '}
            <Link
              to="/settings/models"
              className="text-primary font-medium underline-offset-4 hover:underline"
            >
              {tr('Settings → Integrations', '设置 → 集成')}
            </Link>
            {tr(', or run the audit using the server default environment variables.', '中添加并启用 LLM 集成，或使用服务端默认环境变量执行审计。')}
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Label htmlFor="skills-md-reviewer-model">{tr('Model', '模型')}</Label>
        {isLoading ? (
          <Skeleton className="mt-1 h-10 w-full" />
        ) : (
          <Select
            value={selectedModelValue || undefined}
            onValueChange={setSelectedModelValue}
            disabled={modelOptions.length === 0}
          >
            <SelectTrigger id="skills-md-reviewer-model" className="mt-1">
              <SelectValue
                placeholder={
                  modelOptions.length === 0
                    ? tr('Server default (no integration)', '服务端默认（无集成）')
                    : tr('Select model', '选择模型')
                }
              />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {tr('Uses the same LLM integrations as', '使用与')}{' '}
        <Link
          to="/settings/models"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          {tr('Settings → Integrations', '设置 → 集成')}
        </Link>
        {tr(
          '. Credentials are sent to your backend over HTTPS; the server redacts secrets in logs.',
          '相同的 LLM 集成。凭据将通过 HTTPS 发送到后端，服务端日志会对敏感信息脱敏。',
        )}
      </p>
    </div>
  );
}
