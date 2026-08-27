import { useMemo } from 'react';
import { useLayout } from '@/context/layout-provider';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useAuthStore } from '@/stores/auth-store';
import {
  getUserAvatarUrl,
  getUserDisplayName,
  getUserInitials,
} from '@/lib/user-display';
import { sidebarData } from './data/sidebar-data';
import { NavGroup } from './nav-group';
import { NavUser } from './nav-user';
import { OrganizationSelector } from '@/components/layout/organization-selector';
import { applySidebarBadges } from './apply-sidebar-badges';
import { useSidebarBadges } from './hooks/use-sidebar-badges';

export function AppSidebar() {
  const { collapsible, variant } = useLayout();
  const user = useAuthStore((state) => state.auth.user);
  const badgeCounts = useSidebarBadges();
  const navGroups = useMemo(
    () =>
      sidebarData.navGroups.map((group) => ({
        ...group,
        items: applySidebarBadges(group.items, badgeCounts),
      })),
    [badgeCounts],
  );
  const displayUser = {
    name: getUserDisplayName(user?.name, user?.email),
    email: user?.email?.trim() || '',
    avatar: getUserAvatarUrl(user?.avatar) ?? '',
    initials: getUserInitials(user?.name, user?.email),
  };

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <OrganizationSelector />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={displayUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
