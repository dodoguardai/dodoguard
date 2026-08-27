/**
 * Security Cockpit — executive security operations report (live metrics).
 * Actionable todos belong on the risk workbench, not this overview.
 */

import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCockpitData } from '../hooks/use-cockpit-data';
import { type CockpitRange } from '../lib/cockpit-metrics';
import { scoreRingDash } from '../lib/security-score';

const RANGE_OPTIONS: { id: CockpitRange; zh: string; en: string }[] = [
  { id: '7d', zh: '近 7 天', en: '7 days' },
  { id: '30d', zh: '近 30 天', en: '30 days' },
  { id: '90d', zh: '近 90 天', en: '90 days' },
];

export function SecurityCockpit() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const navigate = useNavigate();
  const { range, setRange, model, isLoading } = useCockpitData('30d');

  const {
    score,
    band,
    actionable,
    flowSteps,
    mgmtKpis,
    assetKpis,
    riskMix,
    deptRisk,
    coverage,
  } = model;

  const bandLabel =
    band === 'good'
      ? isZh
        ? '良好'
        : 'Healthy'
      : band === 'watch'
        ? isZh
          ? '需关注'
          : 'Watch'
        : isZh
          ? '高危'
          : 'Critical';

  const ringStroke =
    band === 'good' ? '#059669' : band === 'watch' ? '#dc2626' : '#b91c1c';
  const openRemediation =
    assetKpis.find((kpi) => kpi.key === 'openRem')?.value ?? 0;
  const highRiskTotal = riskMix.critical + riskMix.high;
  const rangeLabel = RANGE_OPTIONS.find((r) => r.id === range)?.[isZh ? 'zh' : 'en'] ?? '';

  const goFlow = (route: (typeof flowSteps)[number]['route']) => {
    if (route === 'discovered') {
      void navigate({ to: '/assets/discovered' });
      return;
    }
    if (route === 'detect') {
      void navigate({ to: '/scan/technical-risks' });
      return;
    }
    if (route === 'remediation') {
      void navigate({
        to: '/scan/remediation',
        search: { tab: 'workbench', taskId: undefined, riskId: undefined },
      });
      return;
    }
    if (route === 'launch') {
      void navigate({ to: '/launch-monitoring' });
      return;
    }
    void navigate({ to: '/reports/audit-center' });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Report hero — conclusion layer */}
      <section className="overflow-hidden rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div className="text-muted-foreground inline-flex rounded-full border bg-muted/50 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
              SECURITY COCKPIT · {rangeLabel}
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">
              {isZh ? '安全运营总览' : 'Security Operations Overview'}
            </h2>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              {isZh
                ? '面向管理层的周期安全态势报告。日常待办与处置请在风险闭环工作台完成。'
                : 'Period security posture report for leadership. Day-to-day todos live on the risk workbench.'}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <ReportStat
                label={isZh ? '待处理事项' : 'Open items'}
                value={actionable}
                hint={isZh ? '超期 / 阻塞 / 待准入（报告口径）' : 'Overdue / blocked / admission'}
                tone={actionable > 0 ? 'warn' : 'ok'}
              />
              <ReportStat
                label={isZh ? '高危风险' : 'High risks'}
                value={highRiskTotal}
                hint={
                  isZh
                    ? `严重 ${riskMix.critical} · 高危 ${riskMix.high}`
                    : `critical ${riskMix.critical} · high ${riskMix.high}`
                }
                tone={highRiskTotal > 0 ? 'danger' : 'ok'}
              />
              <ReportStat
                label={isZh ? '未关闭整改' : 'Open remediations'}
                value={openRemediation}
                hint={isZh ? '周期内未闭环项' : 'Still open in period'}
                tone={openRemediation > 0 ? 'danger' : 'ok'}
              />
            </div>
          </div>

          <div
            className={cn(
              'rounded-2xl border bg-muted/40 p-5',
              band === 'good' &&
                'border-2 border-emerald-500/70 bg-emerald-50/80 shadow-[0_0_0_4px_rgba(5,150,105,0.08)] dark:bg-emerald-950/30',
              band === 'watch' &&
                'border-2 border-destructive/70 bg-destructive/10 shadow-[0_0_0_4px_rgba(220,38,38,0.08)]',
              band === 'critical' &&
                'border-2 border-destructive bg-destructive/15 shadow-[0_0_0_4px_rgba(185,28,28,0.12)]',
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-muted-foreground text-xs font-medium">
                    {isZh ? '安全指数' : 'Security Index'}
                  </div>
                  {band === 'good' && (
                    <span className="inline-flex items-center rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">
                      {bandLabel}
                    </span>
                  )}
                  {(band === 'watch' || band === 'critical') && (
                    <span className="inline-flex items-center rounded-md bg-destructive px-2 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">
                      {bandLabel}
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    'mt-1 text-4xl font-bold tabular-nums tracking-tight',
                    band === 'good' && 'text-emerald-700 dark:text-emerald-400',
                    (band === 'watch' || band === 'critical') && 'text-destructive',
                  )}
                >
                  {score}
                </div>
                <div
                  className={cn(
                    'mt-1 text-xs',
                    band === 'good' && 'font-medium text-emerald-700/80 dark:text-emerald-400/80',
                    (band === 'watch' || band === 'critical') && 'font-medium text-destructive/80',
                  )}
                >
                  {isZh ? '低于 80 建议专项跟进' : 'Below 80 warrants focused follow-up'}
                </div>
              </div>
              <div className="relative h-[100px] w-[100px] shrink-0" aria-hidden>
                <svg viewBox="0 0 120 120" className="h-full w-full">
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="currentColor"
                    className={cn(
                      band === 'good' && 'text-emerald-500/20',
                      (band === 'watch' || band === 'critical') && 'text-destructive/20',
                      band !== 'good' &&
                        band !== 'watch' &&
                        band !== 'critical' &&
                        'text-border',
                    )}
                    strokeWidth="12"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke={ringStroke}
                    strokeWidth="12"
                    strokeDasharray={scoreRingDash(score)}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className={cn(
                      'text-3xl font-bold tabular-nums leading-none',
                      band === 'good' && 'text-emerald-700 dark:text-emerald-400',
                      (band === 'watch' || band === 'critical') && 'text-destructive',
                    )}
                  >
                    {score}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-muted-foreground mt-4 text-xs leading-5">
              {isZh
                ? '指数综合风险等级、整改时限与上线影响，用于周期汇报口径。'
                : 'Index blends risk severity, remediation SLA, and launch impact for period reporting.'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="bg-muted/40 inline-flex w-fit rounded-xl border p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={cn(
                  'inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-medium transition-colors',
                  range === opt.id
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:bg-background',
                )}
              >
                {isZh ? opt.zh : opt.en}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl"
            onClick={() => navigate({ to: '/reports/audit-center' })}
          >
            {isZh ? '导出管理层报告' : 'Export exec report'}
          </Button>
        </div>
      </section>

      {/* 2. Governance pipeline — horizontal stepper */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <SectionHead
            title={isZh ? '安全治理链路' : 'Governance pipeline'}
            subtitle={
              isZh
                ? '卡点地图 · 点击环节下钻'
                : 'Bottleneck map · click a stage to drill in'
            }
          />
        </div>
        <div className="overflow-x-auto">
          <div className="flex min-w-160">
            {flowSteps.map((step, i) => (
              <div key={step.idx} className="relative flex min-w-0 flex-1">
                {i > 0 && (
                  <div
                    className="bg-border absolute top-8.5 left-0 h-px w-3 -translate-x-1/2"
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={() => goFlow(step.route)}
                  className={cn(
                    'group flex w-full flex-col gap-2 border-r p-4 text-left last:border-r-0 transition-colors hover:bg-accent/50',
                    step.tone === 'danger' && 'bg-destructive/4',
                    step.tone === 'warn' && 'bg-amber-500/4',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
                        step.tone === 'danger' && 'bg-destructive text-white',
                        step.tone === 'warn' &&
                          'bg-amber-500 text-white dark:bg-amber-600',
                        step.tone !== 'danger' &&
                          step.tone !== 'warn' &&
                          'bg-muted text-muted-foreground',
                      )}
                    >
                      {String(step.idx).padStart(2, '0')}
                    </span>
                    <span
                      className={cn(
                        'text-2xl font-bold tabular-nums tracking-tight',
                        step.tone === 'danger' && 'text-destructive',
                        step.tone === 'warn' && 'text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {step.count}
                    </span>
                  </div>
                  <div className="text-sm font-semibold leading-tight">
                    {isZh ? step.titleZh : step.titleEn}
                  </div>
                  <div className="text-muted-foreground line-clamp-2 text-[11px] leading-snug">
                    {isZh ? step.subZh : step.subEn}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Period ops strip + compact asset chips */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <SectionHead
            title={isZh ? '周期运营结果' : 'Period ops results'}
            subtitle={
              isZh
                ? `${rangeLabel} · 准入 · 关闭 · 检测 · 超期`
                : `${rangeLabel} · admission · close · detect · overdue`
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {mgmtKpis.map((kpi) => (
            <div
              key={kpi.key}
              className={cn(
                'bg-card px-4 py-3.5',
                kpi.danger && 'bg-destructive/4',
              )}
            >
              <div className="text-muted-foreground text-xs font-medium">
                {isZh ? kpi.labelZh : kpi.labelEn}
              </div>
              <div
                className={cn(
                  'mt-1 text-2xl font-bold tabular-nums tracking-tight',
                  kpi.danger && 'text-destructive',
                )}
              >
                {kpi.value}
              </div>
              <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                {isZh ? kpi.subZh : kpi.subEn}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t px-4 py-3">
          {assetKpis.map((kpi) => (
            <button
              key={kpi.key}
              type="button"
              onClick={() => {
                if (kpi.key === 'managed') void navigate({ to: '/assets/ledger' });
                else if (kpi.key === 'pendingAdmission')
                  void navigate({ to: '/assets/discovered' });
                else
                  void navigate({
                    to: '/scan/remediation',
                    search: { tab: 'workbench', taskId: undefined, riskId: undefined },
                  });
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/60',
                kpi.tone === 'warn' && 'border-amber-500/40',
                kpi.tone === 'danger' && 'border-destructive/40',
              )}
            >
              <span className="text-muted-foreground text-xs">
                {isZh ? kpi.titleZh : kpi.titleEn}
              </span>
              <span
                className={cn(
                  'font-bold tabular-nums',
                  kpi.tone === 'warn' && 'text-amber-600 dark:text-amber-400',
                  kpi.tone === 'danger' && 'text-destructive',
                )}
              >
                {kpi.value}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 4. Period posture analysis */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <SectionHead
            title={isZh ? '周期态势分析' : 'Period posture analysis'}
            subtitle={
              isZh
                ? `口径：${rangeLabel} · 风险等级 · 部门指数 · 检测覆盖`
                : `Scope: ${rangeLabel} · risk mix · dept index · coverage`
            }
          />
        </div>
        <div className="grid gap-px bg-border lg:grid-cols-3">
          <div className="min-w-0 bg-card p-5">
            <div className="mb-4">
              <div className="text-sm font-semibold">{isZh ? '风险等级分布' : 'Risk level mix'}</div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {isZh
                  ? `严重 ${riskMix.critical} · 高危 ${riskMix.high} · 中危 ${riskMix.medium} · 低危 ${riskMix.low}`
                  : `critical ${riskMix.critical} · high ${riskMix.high} · medium ${riskMix.medium} · low ${riskMix.low}`}
              </p>
            </div>
            <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
              <div
                className="h-28 w-28 shrink-0 rounded-full"
                style={{
                  background: `conic-gradient(#dc2626 0 ${riskMix.criticalHighPct}%, #f97316 ${riskMix.criticalHighPct}% ${riskMix.criticalHighPct + riskMix.mediumPct}%, #334155 ${riskMix.criticalHighPct + riskMix.mediumPct}% ${riskMix.criticalHighPct + riskMix.mediumPct + riskMix.lowPct}%, #cbd5e1 ${riskMix.criticalHighPct + riskMix.mediumPct + riskMix.lowPct}% 100%)`,
                }}
                aria-hidden
              />
              <ul className="w-full space-y-2 text-sm">
                <LegendRow
                  color="#dc2626"
                  label={isZh ? '严重 / 高危' : 'Critical / High'}
                  value={`${riskMix.criticalHighPct}%`}
                />
                <LegendRow
                  color="#f97316"
                  label={isZh ? '中危' : 'Medium'}
                  value={`${riskMix.mediumPct}%`}
                />
                <LegendRow
                  color="#334155"
                  label={isZh ? '低危' : 'Low'}
                  value={`${riskMix.lowPct}%`}
                />
                <LegendRow
                  color="#cbd5e1"
                  label={isZh ? '其他' : 'Other'}
                  value={`${riskMix.otherPct}%`}
                />
              </ul>
            </div>
          </div>

          <div className="min-w-0 bg-card p-5">
            <div className="mb-4">
              <div className="text-sm font-semibold">{isZh ? '部门风险指数' : 'Dept risk index'}</div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {isZh
                  ? '未关闭风险 · 整改时限 · 检测覆盖'
                  : 'Open risks · SLA · coverage'}
              </p>
            </div>
            <div className="space-y-3">
              {deptRisk.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {isZh ? '暂无部门风险数据' : 'No department risk data'}
                </p>
              ) : (
                deptRisk.map((d) => (
                  <div key={d.dept} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'w-14 shrink-0 truncate text-sm font-semibold',
                        d.hot && 'text-destructive',
                      )}
                      title={d.dept}
                    >
                      {d.short}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', d.hot ? 'bg-destructive' : 'bg-primary')}
                        style={{ width: `${d.index}%` }}
                      />
                    </div>
                    <b className="w-8 text-right text-sm tabular-nums">{d.index}</b>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="min-w-0 bg-card p-5">
            <div className="mb-4">
              <div className="text-sm font-semibold">
                {isZh ? '检测覆盖' : 'Detection coverage'}
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {isZh
                  ? '按业务部门 · Agent 总数与覆盖率'
                  : 'By department · agents & coverage %'}
              </p>
            </div>
            {coverage.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {isZh ? '暂无覆盖数据，请先纳管资产' : 'No coverage data — onboard assets first'}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {coverage.map((d) => (
                  <div
                    key={d.label + d.total}
                    title={`${d.total} agents · ${d.undetected} pending · ${d.coverage}%`}
                    className={cn(
                      'flex min-h-[72px] flex-col items-center justify-center gap-0.5 rounded-[10px] border px-2 py-2 text-center',
                      d.tone === 'ok' &&
                        'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                      d.tone === 'warn' &&
                        'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
                      d.tone === 'fail' &&
                        'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
                    )}
                  >
                    <span className="max-w-full truncate text-xs font-extrabold">{d.label}</span>
                    <span className="text-[10px] font-medium opacity-90">
                      {d.total} · {d.undetected} {isZh ? '未检完' : 'pending'}
                    </span>
                    <span className="text-sm font-black tracking-tight">{d.coverage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ReportStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: 'ok' | 'warn' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-4',
        tone === 'danger' && 'border-destructive/40 bg-destructive/5',
        tone === 'warn' && 'border-foreground/20 bg-muted/40',
      )}
    >
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div
        className={cn(
          'mt-2 text-3xl font-bold tabular-nums',
          tone === 'danger' && 'text-destructive',
          tone === 'warn' && 'text-foreground',
        )}
      >
        {value}
      </div>
      <div className="text-muted-foreground mt-1 truncate text-xs" title={hint}>
        {hint}
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        {label}
      </span>
      <b className="tabular-nums">{value}</b>
    </li>
  );
}
