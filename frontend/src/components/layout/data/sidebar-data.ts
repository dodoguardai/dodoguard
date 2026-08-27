import {
  Activity,
  LayoutDashboard,
  Wrench,
  ListTodo,
  FileX,
  Settings,
  UserCog,
  ClipboardCheck,
  ClipboardList,
  Braces,
  Scale,
  Boxes,
  ScanSearch,
  Brain,
  UserCircle,
} from 'lucide-react';
import { type SidebarData } from '../types';

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'sidebar.group.general',
      items: [
        {
          title: 'sidebar.item.dashboard',
          url: '/',
          search: { tab: 'overview' },
          icon: LayoutDashboard,
          permission: 'dashboard:read',
        },
        {
          title: 'sidebar.item.securityTodos',
          url: '/workbench/todos',
          icon: ClipboardList,
          permission: 'task:manage',
          badgeKey: 'todos',
        },
        {
          title: 'sidebar.item.expertToolbox',
          icon: Wrench,
          permission: 'task:manage',
          items: [
            {
              title: 'sidebar.item.toolboxOverview',
              url: '/expert-toolbox',
            },
            {
              title: 'sidebar.item.dynamicProbe',
              url: '/expert-toolbox/dynamic-probe',
            },
            {
              title: 'sidebar.item.qnaExcelReport',
              url: '/reports/qna-excel',
            },
          ],
        },
      ],
    },
    {
      title: 'sidebar.group.assetGovernance',
      items: [
        {
          title: 'sidebar.item.assetManagement',
          url: '/assets/ledger',
          icon: Boxes,
          permission: 'task:manage',
          badgeKey: 'assets',
        },
        {
          title: 'sidebar.item.detectionEvaluation',
          icon: ScanSearch,
          permission: 'task:manage',
          badgeKey: 'detection',
          items: [
            {
              title: 'sidebar.item.technicalRiskDetection',
              url: '/scan/technical-risks',
            },
            {
              title: 'sidebar.item.complianceDetection',
              url: '/scan/compliance-tasks',
            },
            {
              title: 'sidebar.item.capabilityAudit',
              url: '/capability-audit',
            },
            {
              title: 'sidebar.item.mcpSourceSecurityAssessment',
              url: '/mcp-audit',
            },
            {
              title: 'sidebar.item.platformConfigAudit',
              url: '/expert-toolbox/platform-config-audit',
            },
          ],
        },
        {
          title: 'sidebar.item.riskRemediationCenter',
          url: '/scan/remediation',
          icon: ClipboardCheck,
          permission: 'vulnerability:manage',
          badgeKey: 'risk',
        },
        {
          title: 'sidebar.item.launchMonitoring',
          url: '/launch-monitoring',
          icon: Activity,
          permission: 'task:manage',
          badgeKey: 'launch',
        },
        {
          title: 'sidebar.item.reports',
          url: '/reports/audit-center',
          icon: FileX,
          permission: 'report:read',
          badgeKey: 'reports',
        },
      ],
    },
    {
      title: 'sidebar.group.ruleKnowledge',
      items: [
        {
          title: 'sidebar.item.securityCaseLibrary',
          url: '/scan/security-cases',
          icon: ListTodo,
          permission: 'task:manage',
        },
        {
          title: 'sidebar.item.complianceCaseLibrary',
          url: '/scan/compliance-cases',
          icon: Scale,
          permission: 'task:manage',
        },
        {
          title: 'sidebar.item.capabilityRiskLibrary',
          url: '/scan/capability-risks',
          icon: Boxes,
          permission: 'task:manage',
        },
      ],
    },
    {
      title: 'sidebar.group.system',
      items: [
        {
          title: 'sidebar.item.userRoleManagement',
          url: '/system/user-role-management/organizations',
          icon: UserCog,
        },
        {
          title: 'sidebar.item.agentOwnershipMgmt',
          url: '/system/agent-ownership',
          icon: UserCircle,
          permission: 'system:read',
        },
        {
          title: 'sidebar.item.settings',
          icon: Settings,
          permission: 'system:read',
          items: [
            {
              title: 'sidebar.item.settingsModels',
              url: '/settings/models',
              icon: Brain,
            },
            {
              title: 'sidebar.item.settingsDeveloperApi',
              url: '/developer-api',
              permission: 'task:manage',
              icon: Braces,
            },
          ],
        },
      ],
    },
  ],
};
