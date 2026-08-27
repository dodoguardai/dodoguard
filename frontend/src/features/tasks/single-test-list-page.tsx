/**
 * Single-test task list — redirects to expert toolbox dynamic probe.
 */

import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { SingleTestListPanel } from '@/features/tasks/single-test-list-panel';

/** @deprecated Use DynamicProbePage; kept for any direct imports during transition. */
export function SingleTestListPage() {
  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <SingleTestListPanel />
      </Main>
    </>
  );
}
