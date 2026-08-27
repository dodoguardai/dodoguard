/**
 * Organization Selector Component
 * Allows users to switch between organizations
 */

import { ChevronsUpDown, Plus, Building2, Command, type LucideIcon } from 'lucide-react';
import {
  Users,
  Monitor,
  Server,
  Bot,
  Cpu,
  Database,
  Globe,
  Zap,
  Code,
  Cloud,
  Shield,
  Wrench,
  Settings,
  Lock,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useOrganization } from '@/hooks/use-organization';
import { useRouter } from '@tanstack/react-router';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';
import type { Organization } from '@/types/entities';

export function OrganizationSelector() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const { currentOrg, organizations, isLoading, switchOrganization } = useOrganization();

  const handleSwitch = (org: Organization) => {
    switchOrganization(org.id);
    // Invalidate all queries to refresh data for new organization
    // If we're on an organization detail page, navigate to the new organization's page
    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/organizations/')) {
      router.navigate({ to: `/organizations/${org.id}` });
    } else {
      // For other pages, just invalidate to refresh data
      router.invalidate();
    }
  };

  // Icon mapping - default to Building2 if not specified
  const iconMap: Record<string, LucideIcon> = {
    Users,
    Building2,
    Monitor,
    Server,
    Bot,
    Cpu,
    Database,
    Globe,
    Zap,
    Code,
    Cloud,
    Shield,
    Wrench,
    Settings,
    Lock,
    Activity,
    AlertTriangle,
  };

  const getIconComponent = (org: Organization) => {
    if (!org.icon) {
      return Building2;
    }

    // Check if icon is a custom image
    if (
      org.icon.startsWith('data:image/') ||
      org.icon.startsWith('http://') ||
      org.icon.startsWith('https://')
    ) {
      return null; // Will render as image
    }

    return iconMap[org.icon] || Building2;
  };

  if (isLoading || !currentOrg) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            disabled
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Command className="size-4" />
            </div>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-semibold">DodoGuard</span>
              <span className="truncate text-xs">Loading...</span>
            </div>
            <ChevronsUpDown className="ms-auto" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const CurrentIconComponent = getIconComponent(currentOrg);
  const isCurrentOrgCustomImage =
    currentOrg.icon &&
    (currentOrg.icon.startsWith('data:image/') ||
      currentOrg.icon.startsWith('http://') ||
      currentOrg.icon.startsWith('https://'));

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground overflow-hidden">
                {isCurrentOrgCustomImage && CurrentIconComponent === null ? (
                  <img
                    src={currentOrg.icon}
                    alt={currentOrg.name}
                    className="h-full w-full object-cover"
                  />
                ) : CurrentIconComponent ? (
                  <CurrentIconComponent className="size-4" />
                ) : (
                  <Building2 className="size-4" />
                )}
              </div>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{currentOrg.name}</span>
                <span className="truncate text-xs">
                  {currentOrg.status === 'active' ? 'Active' : currentOrg.status}
                </span>
              </div>
              <ChevronsUpDown className="ms-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organizations
            </DropdownMenuLabel>
            <DropdownMenuItem
              className="gap-2 p-2"
              onClick={(e) => {
                e.stopPropagation();
                router.navigate({ to: userRoleManagementTabPath('organizations') });
              }}
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Building2 className="size-4" />
              </div>
              <div className="font-medium">View all organizations</div>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 p-2"
              onClick={(e) => {
                e.stopPropagation();
                router.navigate({ to: `/organizations/${currentOrg.id}` });
              }}
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Building2 className="size-4" />
              </div>
              <div className="font-medium">View current organization</div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {organizations.map((org) => {
              const OrgIconComponent = getIconComponent(org);
              const isOrgCustomImage =
                org.icon &&
                (org.icon.startsWith('data:image/') ||
                  org.icon.startsWith('http://') ||
                  org.icon.startsWith('https://'));

              return (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSwitch(org)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border overflow-hidden">
                    {isOrgCustomImage && OrgIconComponent === null ? (
                      <img src={org.icon} alt={org.name} className="h-full w-full object-cover" />
                    ) : OrgIconComponent ? (
                      <OrgIconComponent className="size-4 shrink-0" />
                    ) : (
                      <Building2 className="size-4 shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">{org.name}</span>
                    <span className="text-xs text-muted-foreground">{org.slug}</span>
                  </div>
                  {org.id === currentOrg.id && <DropdownMenuShortcut>✓</DropdownMenuShortcut>}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2"
              onClick={(e) => {
                e.stopPropagation();
                router.navigate({ to: userRoleManagementTabPath('organizations') });
              }}
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">Add organization</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
