import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PatrolAiPanel({
  suggestions,
  className,
}: {
  suggestions: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[18px] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-4',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2.5 text-[15px] font-black">
        <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-xl bg-[#2563eb] text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        AI 周期巡检建议
      </div>
      <ul className="grid gap-2">
        {suggestions.map((item) => (
          <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-black text-emerald-600">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PatrolSummaryGrid({
  metrics,
}: {
  metrics: {
    totalPlans: number;
    enabledPlans: number;
    dueToday: number;
    dueTodayAuto: number;
    dueTodayManual: number;
    failedPlans: number;
    recurrenceRisks: number;
    recurrenceDelta: number;
  };
}) {
  const items = [
    {
      label: '巡检计划',
      value: String(metrics.totalPlans),
      hint: `启用中 ${metrics.enabledPlans}`,
    },
    {
      label: '今日待执行',
      value: String(metrics.dueToday),
      hint: `自动 ${metrics.dueTodayAuto} · 手动 ${metrics.dueTodayManual}`,
    },
    {
      label: '巡检失败',
      value: String(metrics.failedPlans),
      hint: '需安全确认',
    },
    {
      label: '复发风险',
      value: String(metrics.recurrenceRisks),
      hint: metrics.recurrenceDelta > 0 ? `较上周 +${metrics.recurrenceDelta}` : '较上周持平',
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-h-[100px] rounded-2xl border bg-white px-[18px] py-4">
          <span className="mb-2.5 block text-[13px] text-muted-foreground">{item.label}</span>
          <strong className="mb-2 block text-[28px] font-semibold leading-none tracking-tight">
            {item.value}
          </strong>
          <em className="text-xs not-italic text-muted-foreground">{item.hint}</em>
        </div>
      ))}
    </div>
  );
}
