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

export function McpAuditShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isOverview = pathname === '/mcp-audit' || pathname === '/mcp-audit/';
  const isRun = pathname.startsWith('/mcp-audit/run');
  const isHistory = pathname.startsWith('/mcp-audit/history');

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
        <nav className="mb-6 flex flex-wrap gap-1 border-b border-border pb-3" aria-label="MCP audit">
          <Link to="/mcp-audit" className={cn(navClass, isOverview ? navActiveClass : '')}>
            {t('pages.mcpAudit.navOverview')}
          </Link>
          <Link
            to="/mcp-audit/run"
            className={cn(navClass, isRun ? navActiveClass : '')}
            search={{ mcpSlug: undefined }}
          >
            {t('pages.mcpAudit.navRun')}
          </Link>
          <Link to="/mcp-audit/history" className={cn(navClass, isHistory ? navActiveClass : '')}>
            {t('pages.mcpAudit.navHistory')}
          </Link>
        </nav>
        {children}
      </Main>
    </>
  );
}
