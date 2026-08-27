import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { WizardProgressBar, WizardScanItem } from '@/features/compliance-detection/compliance-wizard-ui';
import './dialogue-scan-hero.css';

export { ASSESS_SCENARIOS, type AssessScenario } from '@/features/compliance-detection/compliance-wizard-ui';

export const DIALOGUE_WIZARD_STEPS = [
  '选择 Agent',
  '智能体预检',
  '创建方式',
  '任务生成',
  '确认执行',
] as const;

export function DialogueWizardStepper({
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
      {DIALOGUE_WIZARD_STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isDone = stepNumber < currentStep;
        return (
          <Fragment key={label}>
            {index > 0 ? (
              <div aria-hidden className="mx-1 h-px min-w-4 flex-1 self-center bg-border" />
            ) : null}
            <div
              className={cn(
                'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-bold',
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
          </Fragment>
        );
      })}
    </nav>
  );
}

export const DIALOGUE_WIZARD_FOOTER_NOTES: Record<number, string> = {
  1: '选择 Agent 与评估场景后开始智能体预检，将从对话安全测试用例库生成评估方案。',
  2: '系统正在检测 API 联通、接入配置与对话安全用例库可用性。',
  3: '选择 AI 或手动模式；手动模式下可配置扫描策略。',
  4: '查看任务生成结果，确认对话安全测试用例库范围。',
  5: '确认任务配置与通过率要求后可创建并执行对话安全评估。',
};

export const DIALOGUE_WIZARD_NEXT_LABELS: Record<number, string> = {
  1: '开始智能体预检',
  2: '下一步 · 创建方式',
  3: '下一步 · 任务生成',
  4: '下一步 · 确认执行',
  5: '创建并执行评估',
};

export const SCAN_STRATEGIES = [
  {
    value: 'full' as const,
    label: '全量扫描',
    description: '覆盖所有可识别资产和全部适用评估范围',
  },
  {
    value: 'custom' as const,
    label: '自定义范围',
    description: '人工挑选领域与对话测试子场景库',
  },
];

export type ScanStrategy = (typeof SCAN_STRATEGIES)[number]['value'];

type ScanHeroStep = {
  title: string;
  heroTitle: string;
  description: string;
};

type ScanItemState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

export function DialogueScanHero({
  steps,
  scanItems,
  scanProgress,
  precheckDone,
}: {
  steps: ScanHeroStep[];
  scanItems: ScanItemState[];
  scanProgress: number;
  precheckDone: boolean;
}) {
  const runningIndex = scanItems.findIndex((item) => item === 'running');
  const activeIndex = runningIndex >= 0 ? runningIndex : precheckDone ? steps.length - 1 : 0;
  const activeStep = steps[activeIndex] ?? steps[0];
  const heroTitle = precheckDone
    ? '智能体预检完成'
    : activeStep?.heroTitle || '正在进行智能体预检';

  return (
    <div className="rounded-[20px] border border-primary/15 bg-gradient-to-br from-slate-50 via-blue-50/35 to-background p-5 shadow-sm dark:from-muted/40 dark:via-blue-950/15 dark:to-background">
      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
        <div className="min-w-0 flex-1">
          <div className="text-xl font-black text-foreground">{heroTitle}</div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {precheckDone
              ? 'API 联通、接入配置与对话安全用例库可用性已确认（不含能力组件扫描）。'
              : activeStep?.description}
          </p>
          <div className="mt-4">
            <WizardProgressBar value={scanProgress} />
          </div>
        </div>
        <div
          className={cn('dialogue-scan-radar', precheckDone && 'is-done')}
          aria-hidden
        />
      </div>
      <div className="mt-4 grid gap-2">
        {steps.map((item, index) => (
          <WizardScanItem
            key={item.title}
            index={index + 1}
            title={item.title}
            description={item.description}
            status={scanItems[index] || 'waiting'}
          />
        ))}
      </div>
    </div>
  );
}

export function WizardStrategyCard({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border bg-white px-4 py-3.5 text-left transition-all hover:shadow-md',
        selected ? 'border-foreground shadow-[0_0_0_3px_rgba(17,24,39,0.08)]' : 'border-border',
      )}
    >
      <b className="block text-sm font-black">{title}</b>
      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
    </button>
  );
}
