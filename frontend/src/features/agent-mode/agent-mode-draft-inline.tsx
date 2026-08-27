/**
 * Draft + validation card inside chat thread (prototype appendAssistantDraftCard).
 */

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AgentModeSurface } from './agent-mode-layout';

type AgentModeDraftInlineProps = {
  validation: { ok: boolean; errors?: unknown } | null;
  draftTask: unknown;
  canCreate: boolean;
  isCreating: boolean;
  onCreate: () => void;
  onCopyJson: () => void;
  onRevise: () => void;
  isZh: boolean;
  surface: AgentModeSurface;
  targetAgentLabel: string;
  pinnedSkillSlug: string;
};

function draftSummary(draft: Record<string, unknown>) {
  const name = typeof draft.name === 'string' ? draft.name : '';
  const attackMode = typeof draft.attackMode === 'string' ? draft.attackMode : '';
  const vulns = Array.isArray(draft.vulnerabilities)
    ? draft.vulnerabilities.map((v) => String(v)).join('、')
    : '';
  const meta = draft.metadata && typeof draft.metadata === 'object' ? (draft.metadata as Record<string, unknown>) : {};
  const surf = typeof meta.surface === 'string' ? meta.surface : '';
  const tc = draft.targetConfig && typeof draft.targetConfig === 'object' ? (draft.targetConfig as Record<string, unknown>) : {};
  const agentLabel =
    (typeof tc.agentLabel === 'string' && tc.agentLabel) ||
    (typeof tc.agentId === 'string' && tc.agentId) ||
    '—';
  return { name, attackMode, vulns, surf: surf || '—', agentLabel };
}

export function AgentModeDraftInline({
  validation,
  draftTask,
  canCreate,
  isCreating,
  onCreate,
  onCopyJson,
  onRevise,
  isZh,
  surface,
  targetAgentLabel,
  pinnedSkillSlug,
}: AgentModeDraftInlineProps) {
  if (draftTask === null || draftTask === undefined || typeof draftTask !== 'object') {
    return null;
  }

  const draft = draftTask as Record<string, unknown>;
  const { name, attackMode, vulns, surf, agentLabel } = draftSummary(draft);
  const jsonStr = JSON.stringify(draftTask, null, 2);

  const skillLine =
    pinnedSkillSlug.trim() !== '' ? (
      <li className="text-muted-foreground text-[13px]">
        {isZh ? 'Agent 技能（单选）：' : 'Agent skill: '}
        <span className="text-foreground font-mono text-xs">{pinnedSkillSlug}</span>
      </li>
    ) : (
      <li className="text-muted-foreground text-[13px]">
        {isZh ? (
          <>
            Agent 技能：<span className="text-foreground text-xs">助手自动选用</span>（下拉里选第一项）
          </>
        ) : (
          <>
            Agent skill: <span className="text-foreground text-xs">Assistant auto</span> (first dropdown option)
          </>
        )}
      </li>
    );

  return (
    <div className="animate-in flex gap-3">
      <div className="bg-primary text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs">
        AI
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-foreground text-xs font-semibold">
            {isZh ? '任务编排助手' : 'Task orchestrator'}
          </span>
          <span className="text-muted-foreground text-[10px]">{isZh ? '草案' : 'Draft'}</span>
        </div>
        <div className="border-border bg-card text-card-foreground max-w-[95%] space-y-3 rounded-xl rounded-tl-md border px-4 py-3 text-sm leading-relaxed shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            {validation?.ok ? (
              <span className="bg-secondary text-secondary-foreground ring-border rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1">
                {isZh ? '同源校验通过' : 'Schema valid'}
              </span>
            ) : (
              <span className="bg-destructive/15 text-destructive rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-destructive/20">
                {isZh ? '校验未通过' : 'Validation failed'}
              </span>
            )}
            <span className="text-muted-foreground text-[11px]">
              {isZh ? '对用户仅在对话里交代结论' : 'Outcome stays in this thread'}
            </span>
          </div>

          {!validation?.ok && validation?.errors !== undefined ? (
            <pre className="bg-muted/80 max-h-36 overflow-auto rounded-lg border p-2 text-[11px] leading-snug">
              {JSON.stringify(validation.errors, null, 2)}
            </pre>
          ) : null}

          <p className="text-foreground text-sm">
            <strong className="text-foreground">{isZh ? '草案摘要' : 'Summary'}</strong> · {name || '—'}
          </p>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-[13px]">
            <li>
              {isZh ? '目标智能体：' : 'Target agent: '}
              <span className="text-foreground font-mono text-xs">{agentLabel || targetAgentLabel || '—'}</span>
            </li>
            {skillLine}
            <li>
              {isZh ? '攻击面 / surface：' : 'Surface: '}
              <span className="text-foreground font-mono text-xs">{surf === '—' ? surface : surf}</span>
            </li>
            <li>
              {isZh ? '攻击模式：' : 'Attack mode: '}
              <span className="text-foreground font-mono text-xs">{attackMode || '—'}</span>
            </li>
            <li>
              {isZh ? '漏洞维度：' : 'Vulnerabilities: '}
              <span className="text-foreground font-mono text-xs">{vulns || '—'}</span>
            </li>
          </ul>

          <p className="border-border text-muted-foreground border-t pt-3 text-[11px] leading-relaxed">
            {isZh ? (
              <>
                确认创建后任务进入评测队列；
                <strong className="text-foreground">执行完成后测试报告可从此任务详情查看</strong>
                （对话内推送后续迭代）。
              </>
            ) : (
              <>
                After you confirm, the task enters the queue;
                <strong className="text-foreground"> open the task run for full reports </strong>
                (in-thread report cards planned).
              </>
            )}
          </p>

          <details className="group border-border bg-muted/80 rounded-lg border">
            <summary className="text-muted-foreground group-open:text-foreground cursor-pointer select-none px-3 py-2 text-[11px] font-medium">
              {isZh ? '展开完整 draft JSON' : 'Expand full draft JSON'}
            </summary>
            <pre className="scrollbar-thin text-foreground max-h-48 overflow-auto border-t border-border bg-muted p-3 text-[10px] leading-relaxed">
              {jsonStr}
            </pre>
          </details>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="h-auto rounded-lg px-3 py-2 text-xs font-semibold"
              disabled={isCreating || !canCreate}
              onClick={onCreate}
            >
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isZh ? '确认创建任务' : 'Create task'}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-auto rounded-lg px-3 py-2 text-xs" onClick={onCopyJson}>
              {isZh ? '复制 JSON' : 'Copy JSON'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-auto rounded-lg px-3 py-2 text-xs"
              onClick={onRevise}
            >
              {isZh ? '我要补充修改' : 'Revise in chat'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
