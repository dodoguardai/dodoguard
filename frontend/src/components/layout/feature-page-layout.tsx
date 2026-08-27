import type { ReactNode } from 'react';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { SHOW_HEADER_UTILITY_ACTIONS } from '@/components/layout/header-utility-actions';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { cn } from '@/lib/utils';

type FeaturePageLayoutProps = {
  embedded?: boolean;
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

function AppHeader() {
  return (
    <Header fixed>
      <Search />
      {SHOW_HEADER_UTILITY_ACTIONS ? (
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      ) : null}
    </Header>
  );
}

export function FeaturePageLayout({
  embedded,
  children,
  title,
  subtitle,
  actions,
}: FeaturePageLayoutProps) {
  const hasHeader = Boolean(title || subtitle || actions);
  const TitleTag = embedded ? 'h3' : 'h2';

  const toolbar = hasHeader ? (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        embedded && 'border-b pb-4',
      )}
    >
      {title || subtitle ? (
        <div className="min-w-0 space-y-1">
          {title ? (
            <TitleTag
              className={cn(
                'font-semibold tracking-tight',
                embedded ? 'text-lg' : 'text-2xl font-bold',
              )}
            >
              {title}
            </TitleTag>
          ) : null}
          {subtitle ? (
            <p className={cn('text-muted-foreground', embedded ? 'text-sm' : undefined)}>
              {subtitle}
            </p>
          ) : null}
        </div>
      ) : null}
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  ) : null;

  const body = (
    <>
      {toolbar}
      {children}
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }

  return (
    <>
      <AppHeader />
      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">{body}</Main>
    </>
  );
}

export function FeaturePageError({ embedded, children }: { embedded?: boolean; children: ReactNode }) {
  if (embedded) {
    return <div className="space-y-4">{children}</div>;
  }

  return (
    <>
      <AppHeader />
      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">{children}</Main>
    </>
  );
}
