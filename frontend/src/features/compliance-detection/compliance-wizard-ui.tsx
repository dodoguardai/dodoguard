import { cn } from '@/lib/utils';

export const COMPLIANCE_WIZARD_STEPS = [
  '选择 Agent',
  '合规预检',
  '创建方式',
  '任务生成',
  '任务计划',
  '确认执行',
] as const;

export function ComplianceWizardStepper({
  currentStep,
  className,
}: {
  currentStep: number;
  className?: string;
}) {
  return (
    <nav
      aria-label="创建步骤"
      className={cn(
        'mb-6 flex items-center gap-0 overflow-x-auto rounded-[18px] border bg-white px-4 py-3 shadow-sm',
        className,
      )}
    >
      {COMPLIANCE_WIZARD_STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isDone = stepNumber < currentStep;
        return (
          <div key={label} className="flex min-w-fit flex-1 items-center">
            {index > 0 ? <div className="mx-1 h-px min-w-4 flex-1 bg-border" /> : null}
            <div
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-bold',
                isActive && 'text-[#1f5cff]',
                isDone && 'text-foreground',
                !isActive && !isDone && 'text-[#8b95a7]',
              )}
            >
              <span
                className={cn(
                  'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-xs font-black',
                  isActive && 'bg-[#1f5cff] text-white',
                  isDone && 'bg-foreground text-background',
                  !isActive && !isDone && 'bg-[#dfe5ed] text-[#617084]',
                )}
              >
                {stepNumber}
              </span>
              {label}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function WizardSectionHead({
  title,
  hint,
  description,
}: {
  title: string;
  hint?: string;
  description?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black tracking-tight">{title}</h3>
        {hint ? <span className="text-xs font-bold text-muted-foreground">{hint}</span> : null}
      </div>
      {description ? (
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function WizardNotice({
  children,
  variant = 'blue',
  className,
}: {
  children: React.ReactNode;
  variant?: 'blue' | 'gray' | 'green' | 'amber';
  className?: string;
}) {
  const styles = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    gray: 'border-border bg-muted/40 text-muted-foreground',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
  };
  return (
    <div
      className={cn(
        'rounded-[14px] border px-4 py-3 text-[13px] leading-relaxed font-medium',
        styles[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WizardStatCard({
  value,
  label,
  hint,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <b className="block text-[22px] font-black leading-none">{value}</b>
      <span className="mt-1 block text-xs font-bold text-muted-foreground">{label}</span>
      {hint ? <div className="mt-2 text-[11px] leading-snug text-[#8b95a7]">{hint}</div> : null}
    </div>
  );
}

export function WizardTag({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: 'blue' | 'green' | 'orange' | 'purple' | 'gray' | 'cyan' | 'red';
}) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    orange: 'border-amber-200 bg-amber-50 text-amber-700',
    purple: 'border-violet-200 bg-violet-50 text-violet-700',
    gray: 'border-border bg-muted text-muted-foreground',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  };
  return (
    <span
      className={cn(
        'inline-flex h-[25px] items-center rounded-full border px-2.5 text-xs font-black',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function WizardModeCard({
  title,
  description,
  selected,
  onClick,
  tags,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  tags: Array<{ label: string; tone: 'blue' | 'green' | 'orange' | 'purple' | 'gray' }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-2xl border bg-white p-4 text-left transition-all hover:shadow-md',
        selected ? 'border-foreground shadow-[0_0_0_3px_rgba(17,24,39,0.08)]' : 'border-border',
      )}
    >
      <span
        className={cn(
          'absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-black',
          selected
            ? 'border-foreground bg-foreground text-background'
            : 'border-border text-muted-foreground',
        )}
      >
        {selected ? '✓' : '○'}
      </span>
      <h4 className="pr-10 text-base font-black">{title}</h4>
      <p className="mt-2 text-[13px] leading-relaxed text-[#6c7486]">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <WizardTag key={tag.label} tone={tag.tone}>
            {tag.label}
          </WizardTag>
        ))}
      </div>
    </button>
  );
}

export function WizardCheckboxCard({
  checked,
  onCheckedChange,
  title,
  description,
  recommended,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: string;
  description: string;
  recommended?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-[14px] border bg-white px-3.5 py-3 transition-colors hover:bg-muted/30',
        checked ? 'border-primary/40 bg-primary/5' : 'border-border',
        disabled && 'cursor-not-allowed opacity-80 hover:bg-white',
      )}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <strong className="text-[13px] font-black leading-snug">{title}</strong>
          {recommended ? <WizardTag tone="blue">AI 推荐</WizardTag> : null}
        </div>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </div>
    </label>
  );
}

export function WizardProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#1f5cff] to-[#5b8cff] transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function WizardScanItem({
  index,
  title,
  description,
  status,
}: {
  index: number;
  title: string;
  description: string;
  status: 'waiting' | 'running' | 'done' | 'failed' | 'skipped';
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3',
        status === 'running' && 'border-blue-200 bg-blue-50/60',
        status === 'done' && 'border-emerald-200 bg-emerald-50/40',
        status === 'failed' && 'border-red-200 bg-red-50/40',
        status === 'skipped' && 'border-amber-200 bg-amber-50/40',
        status === 'waiting' && 'border-border bg-background/80',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black',
          status === 'running' && 'bg-[#1f5cff] text-white',
          status === 'done' && 'bg-emerald-600 text-white',
          status === 'failed' && 'bg-red-600 text-white',
          status === 'skipped' && 'bg-amber-500 text-white',
          status === 'waiting' && 'bg-muted text-muted-foreground',
        )}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <b className="text-sm">{title}</b>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0 text-xs font-bold text-muted-foreground">
        {status === 'running'
          ? '检测中'
          : status === 'done'
            ? '完成'
            : status === 'failed'
              ? '失败'
              : status === 'skipped'
                ? '跳过'
                : '等待'}
      </div>
    </div>
  );
}

export const WIZARD_FOOTER_NOTES: Record<number, string> = {
  1: '选择 Agent 并开始合规预检后，将自动生成评估任务方案。',
  2: '系统正在识别 Agent 接入状态、业务场景、数据类型与适用法规。',
  3: '选择 AI 或手动模式，并确认评估场景。',
  4: '查看 AI 任务生成过程；合规库选择在下一步「任务计划」完成。',
  5: '确认或调整纳入本次评估的合规库，系统将实时统计用例与耗时。',
  6: '确认任务配置后可开始执行合规评估。',
};

export const WIZARD_NEXT_LABELS: Record<number, string> = {
  1: '开始合规预检',
  2: '下一步 · 创建方式',
  3: '下一步 · 任务生成',
  4: '下一步 · 任务计划',
  5: '下一步 · 确认执行',
  6: '开始合规评估',
};

export const ASSESS_SCENARIOS = [
  { value: 'launch', label: '上线前准入' },
  { value: 'regression', label: '变更后回归' },
  { value: 'patrol', label: '定期巡检' },
] as const;

export type AssessScenario = (typeof ASSESS_SCENARIOS)[number]['value'];
