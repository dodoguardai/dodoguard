import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Radar } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { MultiRoundExcelTestSetup } from '@/features/tasks/multi-round-excel-test-setup';
import { MultiRoundTestSetup } from '@/features/tasks/multi-round-test-setup';
import { SingleTestForm } from '@/features/tasks/single-test-form';
import { SingleTestListPanel } from '@/features/tasks/single-test-list-panel';
import { SingleTestResultCard } from '@/features/tasks/single-test-result-card';
import { cn } from '@/lib/utils';

export const DYNAMIC_PROBE_MODES = [
  'list',
  'single',
  'multi-round',
  'multi-round-excel',
  'result',
] as const;
export type DynamicProbeMode = (typeof DYNAMIC_PROBE_MODES)[number];

const CREATE_MODES = ['single', 'multi-round', 'multi-round-excel'] as const;
type CreateMode = (typeof CREATE_MODES)[number];

function isDynamicProbeMode(value: string): value is DynamicProbeMode {
  return DYNAMIC_PROBE_MODES.includes(value as DynamicProbeMode);
}

function isCreateMode(value: string): value is CreateMode {
  return CREATE_MODES.includes(value as CreateMode);
}

export function parseDynamicProbeSearch(search: Record<string, unknown>): {
  mode: DynamicProbeMode;
  taskId?: string;
} {
  const rawMode = search.mode;
  const mode =
    typeof rawMode === 'string' && isDynamicProbeMode(rawMode) ? rawMode : ('list' as const);
  const rawTaskId = search.taskId;
  const taskId =
    typeof rawTaskId === 'string' && rawTaskId.trim() ? rawTaskId.trim() : undefined;
  if (mode === 'result' && !taskId) {
    return { mode: 'list' };
  }
  return { mode, ...(taskId ? { taskId } : {}) };
}

/** @deprecated use parseDynamicProbeSearch */
export function parseDynamicProbeMode(search: Record<string, unknown>): DynamicProbeMode {
  return parseDynamicProbeSearch(search).mode;
}

const navClass =
  'text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors';
const navActiveClass = 'bg-muted text-foreground';

const NAV_ITEMS: { id: Exclude<DynamicProbeMode, 'result'>; labelZh: string; labelEn: string }[] =
  [
    { id: 'list', labelZh: '概览', labelEn: 'Overview' },
    { id: 'single', labelZh: '单次测试', labelEn: 'Single probe' },
    { id: 'multi-round', labelZh: '多轮测试', labelEn: 'Multi-round' },
    { id: 'multi-round-excel', labelZh: 'Excel 批量', labelEn: 'Excel batch' },
  ];

export function DynamicProbePage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { mode, taskId } = useSearch({ from: '/_authenticated/expert-toolbox/dynamic-probe' });
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const active = isDynamicProbeMode(mode) ? mode : 'list';
  const isCreateView = isCreateMode(active);
  const isResultView = active === 'result' && Boolean(taskId);
  const isListView = active === 'list';

  const goToCreate = (createMode: CreateMode = 'single') => {
    navigate({ to: '/expert-toolbox/dynamic-probe', search: { mode: createMode } });
  };

  const pageTitle = isCreateView
    ? tr(
        NAV_ITEMS.find((n) => n.id === active)?.labelEn ?? 'Single probe',
        NAV_ITEMS.find((n) => n.id === active)?.labelZh ?? '单次测试',
      )
    : isResultView
      ? tr('Probe result', '探测结果')
      : tr('Single test', '单次测试');

  const pageSubtitle = isListView
    ? tr(
        'Run one-shot or multi-round probes against agents from Asset Management. Review uses your expected-success criteria.',
        '对资产管理中的智能体进行单次或多轮探测；审查将对照攻击成功预期判定。',
      )
    : isCreateView
      ? tr(
          'Configure the probe below, then submit for agent chat and LLM review.',
          '在下方配置探测内容，提交后执行对话并由审查模型判定。',
        )
      : null;

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
        <nav
          className="mb-6 flex flex-wrap gap-1 border-b border-border pb-3"
          aria-label={tr('Single test navigation', '单次测试导航')}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = !isResultView && active === item.id;
            return (
              <Link
                key={item.id}
                to="/expert-toolbox/dynamic-probe"
                search={{ mode: item.id }}
                className={cn(navClass, isActive ? navActiveClass : '')}
              >
                {tr(item.labelEn, item.labelZh)}
              </Link>
            );
          })}
        </nav>

        {!isResultView ? (
          <div className="mb-8 flex items-start gap-3">
            <Radar className="size-9 shrink-0" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
              {pageSubtitle ? (
                <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{pageSubtitle}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {isResultView && taskId ? (
          <div className="mx-auto w-full max-w-5xl">
            <SingleTestResultCard taskId={taskId} tr={tr} />
          </div>
        ) : isCreateView ? (
          <div className="mx-auto w-full max-w-5xl">
            {active === 'single' ? <SingleTestForm tr={tr} isZh={isZh} /> : null}
            {active === 'multi-round' ? <MultiRoundTestSetup tr={tr} /> : null}
            {active === 'multi-round-excel' ? <MultiRoundExcelTestSetup tr={tr} /> : null}
          </div>
        ) : (
          <SingleTestListPanel onCreate={() => goToCreate('single')} />
        )}
      </Main>
    </>
  );
}
