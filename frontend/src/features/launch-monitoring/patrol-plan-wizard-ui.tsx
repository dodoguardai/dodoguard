import { Fragment } from 'react';

import { cn } from '@/lib/utils';

export const PATROL_WIZARD_STEPS = [
  '选择 Agent',
  '智能体预检',
  '资产确认',
  '创建方式',
  '任务生成',
  '确认扫描',
] as const;

export function PatrolWizardStepper({
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
      {PATROL_WIZARD_STEPS.map((label, index) => {
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

export const PATROL_WIZARD_FOOTER_NOTES: Record<number, string> = {
  1: '选择 Agent 后进入智能体预检，将从技术安全用例库生成巡检方案。',
  2: '系统正在检测 API 联通、接入配置与组件可识别性。',
  3: '确认纳入本次周期巡检的 Agent 组件与关联用例库。',
  4: '选择 AI 或手动模式；手动模式下可配置扫描策略。',
  5: '查看任务生成结果，确认技术安全用例库范围。',
  6: '确认巡检计划配置后可创建周期巡检任务，默认稍后执行。',
};

export const PATROL_WIZARD_NEXT_LABELS: Record<number, string> = {
  1: '开始智能体预检',
  2: '下一步 · 资产确认',
  3: '下一步 · 创建方式',
  4: '下一步 · 任务生成',
  5: '下一步 · 确认扫描',
  6: '创建周期巡检计划',
};
