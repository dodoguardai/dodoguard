import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { cn } from '@/lib/utils';

const navClass =
  'text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors';
const navActiveClass = 'bg-muted text-foreground';

export type CapabilityAuditView = 'overview' | 'run' | 'history';

export function resolveCapabilityAuditView(search: {
  view?: string;
}): CapabilityAuditView {
  if (search.view === 'run' || search.view === 'history') {
    return search.view;
  }
  return 'overview';
}

export function CapabilityAuditShell({
  children,
  activeView,
}: {
  children: React.ReactNode;
  activeView: CapabilityAuditView;
}) {
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
        <nav
          className="mb-6 flex flex-wrap gap-1 border-b border-border pb-3"
          aria-label={tr('SKILL audit', 'SKILL 安全评估')}
        >
          <Link
            to="/capability-audit"
            search={{ view: 'overview' }}
            className={cn(navClass, activeView === 'overview' ? navActiveClass : '')}
          >
            {tr('Overview', '概览')}
          </Link>
          <Link
            to="/capability-audit"
            search={{ view: 'run' }}
            className={cn(navClass, activeView === 'run' ? navActiveClass : '')}
          >
            {tr('Run audit', '运行审计')}
          </Link>
          <Link
            to="/capability-audit"
            search={{ view: 'history' }}
            className={cn(navClass, activeView === 'history' ? navActiveClass : '')}
          >
            {tr('Audit history', '审计历史')}
          </Link>
        </nav>
        {children}
      </Main>
    </>
  );
}
