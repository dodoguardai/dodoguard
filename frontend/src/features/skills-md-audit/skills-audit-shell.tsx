import { Link, useRouterState } from '@tanstack/react-router';
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

export function SkillsAuditShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isCatalog = pathname === '/skills-md-audit' || pathname === '/skills-md-audit/';
  const isRun = pathname.startsWith('/skills-md-audit/run');
  const isHistory = pathname.startsWith('/skills-md-audit/history');
  const isSkill = pathname.startsWith('/skills-md-audit/skill/');

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
          aria-label="SKILLS audit"
        >
          <Link
            to="/skills-md-audit"
            className={cn(navClass, isCatalog && !isSkill ? navActiveClass : '')}
          >
            {t('pages.skillsMdAudit.navCatalog')}
          </Link>
          <Link
            to="/skills-md-audit/run"
            search={{ skillSlug: undefined }}
            className={cn(navClass, isRun ? navActiveClass : '')}
          >
            {t('pages.skillsMdAudit.navRun')}
          </Link>
          <Link
            to="/skills-md-audit/history"
            className={cn(navClass, isHistory ? navActiveClass : '')}
          >
            {t('pages.skillsMdAudit.navHistory')}
          </Link>
        </nav>
        {children}
      </Main>
    </>
  );
}
