import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { PageHead, Shell } from '@/features/compliance-case-library/shared';
import '@/features/compliance-detection/compliance-hero.css';
import '@/features/quick-start/quick-start.css';

/** Align with GovernanceFlowStrip main stages */
const LIFECYCLE_STEPS = [
  {
    title: '资产入库',
    desc: '自动发现认领 / 手工登记 / API 推送 · 立即入台账 · 我的待办处理知晓与认领',
  },
  {
    title: '检测与放行',
    desc: '对话安全 / 合规 / SKILLS / MCP / 配置审计 · 风险整改复测 · 形成放行结论',
  },
  {
    title: '上线观测',
    desc: '放行后周期巡检 · 风险复发处置 · 报告审计留痕',
  },
] as const;

const CLOSURE_CHIPS = [
  { label: '资产闭环', tone: 'ok' as const },
  { label: '检测闭环', tone: '' as const },
  { label: '放行闭环', tone: 'warn' as const },
  { label: '整改闭环', tone: 'hot' as const },
  { label: '观测闭环', tone: '' as const },
];

function QuickStartHero() {
  const pillars = [
    {
      title: '① 入库',
      desc: '发现认领 / 手工登记 / 开放 API → 写入安全台账 · 登记即资产 · 知晓 ≠ 放行',
      tone: 'ingest' as const,
    },
    {
      title: '② 检测与放行',
      desc: '专项安全评估 + 风险整改复测 → 准入结论控制上线 · 在资产治理档案推进',
      tone: 'launch' as const,
    },
    {
      title: '③ 上线观测',
      desc: '已放行 Agent 周期巡检 · 变更与风险复发跟踪 · 报告与审计中心留痕',
      tone: 'patrol' as const,
    },
  ];

  return (
    <div className="qs-hero qs-hero--overview">
      <div className="qs-hero-main">
        <div className="qs-kicker">
          SEC EDITION <span className="qs-edition-badge">SEC</span>
        </div>
        <h2>Agent 安全治理 — 从这里开始</h2>
        <p className="qs-hero-desc">
          掌握<strong>全公司台账</strong> → <strong>我的待办</strong> → <strong>专项评估与放行</strong> →{' '}
          <strong>上线观测与报告</strong>。开发未提交检测前，主待办以入库知晓 / 认领为主。
        </p>
        <div className="qs-pillars">
          {pillars.map((pillar) => (
            <div key={pillar.title} className={`qs-pillar ${pillar.tone}`}>
              <b>{pillar.title}</b>
              <span>{pillar.desc}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="qs-hero-logo" aria-hidden="true">
        <div className="qs-logo-brand">
          <span>智</span>
          <span>御</span>
          <span>未</span>
          <span>来</span>
        </div>
        <div className="qs-logo-tag">AGENT SECURITY OPS</div>
      </div>
    </div>
  );
}

export function QuickStartPage() {
  return (
    <Shell>
      <QuickStartContent />
    </Shell>
  );
}

export function QuickStartContent({ showHead = true }: { showHead?: boolean }) {
  const navigate = useNavigate();

  return (
    <>
      {showHead ? (
        <PageHead
          title="概览"
          desc="Agent 安全治理 · 入库 / 检测放行 / 上线观测"
        />
      ) : null}

      <QuickStartHero />

      <div className="qs-edition-note sec">
        资产来自<strong>自动发现 / 手工登记 / 开放 API</strong> · 经
        <strong>我的待办</strong>处理知晓与认领 · 专项评估与整改后形成放行结论 · 放行后进入
        <strong>上线观测</strong>持续检测。
      </div>

      <div className="qs-paths">
        <div className="qs-paths-group">
          <div className="qs-paths-label">怎么入库</div>
          <div className="qs-paths-grid qs-paths-grid-3">
            <div className="qs-path-card">
              <div className="qs-path-tag">路径 A</div>
              <h4>自动发现认领</h4>
              <p>平台同步出的待认领 Agent，在台账认领入库；知晓与跟进去「我的待办」。</p>
              <div className="qs-path-foot">
                <Button size="sm" onClick={() => navigate({ to: '/assets/ledger' })}>
                  去认领
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate({ to: '/workbench/todos' })}
                >
                  我的待办
                </Button>
              </div>
            </div>

            <div className="qs-path-card">
              <div className="qs-path-tag">路径 B</div>
              <h4>安全手工登记</h4>
              <p>安全侧主动录入基本信息与接入配置，登记即入台账（知晓 ≠ 放行）。</p>
              <div className="qs-path-foot">
                <Button size="sm" onClick={() => navigate({ to: '/assets/ledger' })}>
                  去登记
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate({ to: '/workbench/todos' })}
                >
                  我的待办
                </Button>
              </div>
            </div>

            <div className="qs-path-card">
              <div className="qs-path-tag">路径 C</div>
              <h4>开放 API 推送</h4>
              <p>CI/CD 或外部系统推送资产；也可一键创建对话安全 / 合规评估任务。</p>
              <div className="qs-path-foot">
                <Button size="sm" onClick={() => navigate({ to: '/developer-api' })}>
                  开放 API
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate({ to: '/workbench/todos' })}
                >
                  我的待办
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="qs-paths-group">
          <div className="qs-paths-label">入库之后</div>
          <div className="qs-paths-grid qs-paths-grid-2">
            <div className="qs-path-card">
              <div className="qs-path-tag">路径 D</div>
              <h4>专项评估与放行</h4>
              <p>
                对话安全、输出合规、SKILLS、MCP、配置审计 → 风险整改复测 → 形成放行结论。
              </p>
              <div className="qs-path-foot">
                <Button size="sm" onClick={() => navigate({ to: '/scan/technical-risks' })}>
                  对话安全评估
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate({ to: '/scan/compliance-tasks' })}
                >
                  合规评估
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate({
                      to: '/scan/remediation',
                      search: { tab: undefined, taskId: undefined, riskId: undefined },
                    })
                  }
                >
                  风险整改
                </Button>
              </div>
            </div>

            <div className="qs-path-card">
              <div className="qs-path-tag">路径 E</div>
              <h4>上线观测与审计</h4>
              <p>放行后周期巡检、风险复发回流整改；报告与审计中心留痕。</p>
              <div className="qs-path-foot">
                <Button size="sm" onClick={() => navigate({ to: '/launch-monitoring' })}>
                  上线观测
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate({ to: '/reports/audit-center' })}
                >
                  报告审计
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="qs-timeline-wrap">
        <h3 className="qs-section-title">Agent 安全管理主流程</h3>
        <p className="mb-3.5 text-sm text-muted-foreground">
          登记即资产 · 可见即治理 · 上线须放行 · 放行后持续观测
        </p>
        <div className="qs-flow">
          {LIFECYCLE_STEPS.map((step, index) => (
            <div key={step.title} className="qs-flow-step">
              <div className="qs-flow-num">{index + 1}</div>
              <b>{step.title}</b>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
        <div className="qs-closures">
          {CLOSURE_CHIPS.map((chip) => (
            <span
              key={chip.label}
              className={chip.tone ? `qs-closure-chip ${chip.tone}` : 'qs-closure-chip'}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
