import { createFileRoute } from '@tanstack/react-router';
import {
  PLATFORM_CONFIG_TABS,
  PLATFORM_CONFIG_VIEWS,
  PlatformConfigAuditPage,
  type PlatformConfigTab,
  type PlatformConfigView,
} from '@/features/expert-toolbox/platform-config-audit-page';

function parsePlatform(search: Record<string, unknown>): PlatformConfigTab {
  const value = search.platform;
  if (typeof value === 'string' && PLATFORM_CONFIG_TABS.includes(value as PlatformConfigTab)) {
    return value as PlatformConfigTab;
  }
  return 'dify';
}

function parseView(search: Record<string, unknown>): PlatformConfigView {
  const value = search.view;
  if (typeof value === 'string' && PLATFORM_CONFIG_VIEWS.includes(value as PlatformConfigView)) {
    return value as PlatformConfigView;
  }
  // Legacy deep links only set platform — open the run wizard.
  if (typeof search.platform === 'string' && !search.view) {
    return 'run';
  }
  return 'overview';
}

export const Route = createFileRoute('/_authenticated/expert-toolbox/platform-config-audit')({
  validateSearch: (search: Record<string, unknown>) => ({
    platform: parsePlatform(search),
    view: parseView(search),
  }),
  component: PlatformConfigAuditPage,
});
