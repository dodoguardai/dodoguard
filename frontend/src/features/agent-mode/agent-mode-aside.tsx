/**
 * Left column — Skill blurb + orchestration legend (prototype #view-builder aside).
 */

import { Info, Package } from 'lucide-react';
import { Link } from '@tanstack/react-router';

type AgentModeAsideProps = {
  isZh: boolean;
};

export function AgentModeAside({ isZh }: AgentModeAsideProps) {
  return (
    <aside className="min-w-0 space-y-4 lg:max-w-[360px]">
      <div className="border-border bg-muted/40 rounded-xl border p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="bg-primary text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-xs">
            <Info className="h-4 w-4" aria-hidden />
          </span>
          <div className="text-foreground min-w-0 text-xs leading-relaxed">
            {isZh ? (
              <>
                <span className="font-semibold">Agent 技能与待测智能体同为下拉</span>
                <br />
                在对话底部输入条左侧选择<strong className="text-foreground">本会话技能</strong>
                ；每次发送一项（技能多时可滚动）。选「助手自动选用」则由编排助手自选。更多技能可在下方目录查看。
              </>
            ) : (
              <>
                <span className="font-semibold">Agent skills and target agent are both dropdowns</span>
                <br />
                Pick <strong className="text-foreground">session skill</strong> from the dropdown left of the chat
                input—one Agent skill per send (scroll when the list is long), or{' '}
                <strong className="text-foreground">assistant auto</strong>. Browse the{' '}
                <strong className="text-foreground">Agent skills</strong> catalog below; LLM wiring under{' '}
                <strong className="text-foreground">Settings → Integrations</strong>.
              </>
            )}
          </div>
        </div>
        <Link
          to="/agent-skills"
          className="border-border bg-card text-foreground hover:bg-accent mt-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold shadow-xs"
        >
          <Package className="text-primary h-4 w-4" aria-hidden />
          {isZh ? '前往 Agent 技能目录' : 'Open Agent skills'}
        </Link>
      </div>

      <div className="border-border bg-card rounded-2xl border p-5 shadow-xs">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          {isZh ? '编排示意' : 'Orchestration'}
        </h3>
        <ol className="mt-4 space-y-3">
          {(
            [
              {
                n: '1',
                active: true,
                title: isZh ? '载入 Agent 技能' : 'Load Agent skills',
                desc: isZh
                  ? '下拉里单选固定一项 Agent 技能；选自动则按意图 / surface 选用'
                  : 'Pick one Agent skill in the dropdown, or auto by intent / surface',
              },
              {
                n: '2',
                active: false,
                title: isZh ? '模型 + 只读工具' : 'Model + read-only tools',
                desc: isZh ? 'Integration LLM · target-agents · …' : 'Integration LLM · target-agents · …',
              },
              {
                n: '3',
                active: false,
                title: isZh ? '同源校验 → 对话确认' : 'Schema validate → confirm in chat',
                desc: isZh
                  ? '与创建接口一致；结论与按钮在消息流内'
                  : 'Same schema as task create; outcome and actions stay in the thread',
              },
              {
                n: '4',
                active: false,
                title: isZh ? '评测完成 → 报告' : 'Run finishes → report',
                desc: isZh
                  ? '结构化结论与详情链接在同一会话（后续迭代推送）'
                  : 'Structured summary and links in-thread (streaming later)',
              },
            ] as const
          ).map((step) => (
            <li key={step.n} className="flex gap-3">
              <span
                className={
                  step.active
                    ? 'bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold'
                    : 'bg-muted text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold'
                }
              >
                {step.n}
              </span>
              <div>
                <div className="text-foreground text-xs font-semibold">{step.title}</div>
                <div className="text-muted-foreground text-[11px]">{step.desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
