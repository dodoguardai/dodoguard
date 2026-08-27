/**
 * N8N Config Audit — step-by-step wizard for static n8n workflow security review.
 */

import { useTranslation } from 'react-i18next';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { N8nConfigAuditWizard } from './audit-wizard';
import { FileCode2 } from 'lucide-react';

export function N8nConfigAuditPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  return (
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileCode2 className="size-8" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{tr('N8N Config Audit', 'N8N 配置审计')}</h1>
              <p className="text-muted-foreground text-sm">
                {tr(
                  'Upload a n8n workflow export (JSON). The server parses and sanitizes it, sends it to your selected reviewer model, and returns structured results (summary, risk level, findings).',
                  '上传 n8n 工作流导出文件（JSON）。服务端会解析并做脱敏处理，再发送给你选择的审查模型，并返回结构化结果（摘要、风险等级、发现项）。',
                )}
              </p>
            </div>
          </div>
        </div>

        <Collapsible defaultOpen={false} className="group/collapse mb-6">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-muted bg-muted/30 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50"
            >
              {tr('How it works & Disclaimer', '工作原理与免责声明')}
              <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapse:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 rounded-b-md border border-t-0 border-muted bg-muted/20 px-4 py-3">
              <Alert className="border-0 bg-transparent p-0">
                <AlertTitle className="text-sm">{tr('How it works', '工作原理')}</AlertTitle>
                <AlertDescription className="text-muted-foreground space-y-1 text-xs">
                  <ol className="list-inside list-decimal space-y-1">
                    <li>{tr('Read the JSON and validate n8n workflow export shape', '读取 JSON 并校验 n8n 工作流导出结构')}</li>
                    <li>{tr('Extract a security-focused subset and redact secrets', '提取安全审计相关子集并脱敏密钥')}</li>
                    <li>{tr('Call your chosen model with server-side audit instructions', '按服务端审计指令调用你选择的模型')}</li>
                    <li>{tr('Validate the model JSON response and render results', '校验模型返回的 JSON，并渲染结果')}</li>
                  </ol>
                </AlertDescription>
              </Alert>
              <Alert className="border-0 bg-transparent p-0">
                <AlertTitle className="text-sm">{tr('Disclaimer', '免责声明')}</AlertTitle>
                <AlertDescription className="text-muted-foreground text-xs">
                  {tr(
                    'Results are based only on the uploaded configuration. They may miss runtime issues. Do not share production secrets; the server redacts common secret fields.',
                    '结果仅基于上传配置，可能遗漏运行时问题。请勿提交生产密钥；服务端会对常见敏感字段做脱敏处理。',
                  )}
                </AlertDescription>
              </Alert>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <N8nConfigAuditWizard />
      </Main>
    </>
  );
}

