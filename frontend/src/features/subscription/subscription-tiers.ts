import type { SubscriptionTierId } from './resolve-tier';

export const SUBSCRIPTION_SALES_EMAIL = 'sales@dodoguard.com';

export type TierCtaAction = 'activateCommunity' | 'contactSales' | 'devEnterprise';

export type FeatureAvailability = 'now' | 'preview' | 'roadmap' | 'delivery';

export interface TierFeatureItem {
  featureKey: string;
  availability: FeatureAvailability;
}

export interface TierFeatureGroupConfig {
  groupKey: string;
  features: TierFeatureItem[];
}

export interface SubscriptionTierConfig {
  id: SubscriptionTierId;
  planTypes: string[];
  highlighted: boolean;
  maturityKey: string;
  featureGroups: TierFeatureGroupConfig[];
  primaryCta: TierCtaAction;
  secondaryCta?: TierCtaAction;
}

export const SUBSCRIPTION_TIERS: SubscriptionTierConfig[] = [
  {
    id: 'community',
    planTypes: ['free'],
    highlighted: false,
    maturityKey: 'community',
    featureGroups: [
      {
        groupKey: 'v1Scanner',
        features: [
          { featureKey: 'staticConfigAudit', availability: 'now' },
          { featureKey: 'dynamicAttackScan', availability: 'now' },
          { featureKey: 'riskGradingEvidence', availability: 'now' },
          { featureKey: 'remediationReports', availability: 'now' },
          { featureKey: 'cliDockerLocal', availability: 'now' },
          { featureKey: 'communitySupportQuota', availability: 'now' },
        ],
      },
    ],
    primaryCta: 'activateCommunity',
  },
  {
    id: 'enterprise',
    planTypes: ['enterprise'],
    highlighted: true,
    maturityKey: 'enterprise',
    featureGroups: [
      {
        groupKey: 'v1Foundation',
        features: [{ featureKey: 'includesCommunityV1', availability: 'now' }],
      },
      {
        groupKey: 'assetGovernance',
        features: [
          { featureKey: 'assetIntakeLedger', availability: 'now' },
          { featureKey: 'admissionGovernance', availability: 'now' },
          { featureKey: 'myTodosWorkbench', availability: 'now' },
        ],
      },
      {
        groupKey: 'detectionSurface',
        features: [
          { featureKey: 'dialogueSecurityEval', availability: 'now' },
          { featureKey: 'complianceContentEval', availability: 'now' },
          { featureKey: 'mcpScan', availability: 'now' },
          { featureKey: 'skillsScan', availability: 'now' },
          { featureKey: 'platformConfigAudit', availability: 'now' },
          { featureKey: 'proVulnLibrary', availability: 'now' },
        ],
      },
      {
        groupKey: 'riskClosedLoop',
        features: [
          { featureKey: 'riskRemediationLoop', availability: 'now' },
          { featureKey: 'findingsRetestPreview', availability: 'now' },
          { featureKey: 'launchPatrolMonitoring', availability: 'now' },
        ],
      },
      {
        groupKey: 'knowledgeReports',
        features: [
          { featureKey: 'securityCaseLibraries', availability: 'now' },
          { featureKey: 'auditCenterReports', availability: 'now' },
          { featureKey: 'securityOverview', availability: 'now' },
          { featureKey: 'qnaExcelReports', availability: 'now' },
        ],
      },
      {
        groupKey: 'platform',
        features: [
          { featureKey: 'openApi', availability: 'now' },
          { featureKey: 'privateSecurityLlm', availability: 'now' },
          { featureKey: 'multiTeamSso', availability: 'now' },
          { featureKey: 'expertToolbox', availability: 'now' },
        ],
      },
    ],
    primaryCta: 'contactSales',
    secondaryCta: 'devEnterprise',
  },
  {
    id: 'onPremise',
    planTypes: ['custom'],
    highlighted: false,
    maturityKey: 'onPremise',
    featureGroups: [
      {
        groupKey: 'enterpriseAll',
        features: [{ featureKey: 'allEnterpriseCapabilities', availability: 'now' }],
      },
      {
        groupKey: 'privateDeployment',
        features: [
          { featureKey: 'customerInfraDeploy', availability: 'now' },
          { featureKey: 'dataIsolation', availability: 'now' },
          { featureKey: 'dedicatedRunner', availability: 'now' },
          { featureKey: 'intranetIntegration', availability: 'now' },
        ],
      },
      {
        groupKey: 'customization',
        features: [
          { featureKey: 'modelCustomization', availability: 'now' },
          { featureKey: 'agentCustomization', availability: 'now' },
          { featureKey: 'knowledgeBaseCustomization', availability: 'now' },
          { featureKey: 'vulnCustomization', availability: 'now' },
          { featureKey: 'caseLibraryCustomization', availability: 'now' },
          { featureKey: 'platformAdapterCustomization', availability: 'now' },
          { featureKey: 'workflowCustomization', availability: 'now' },
        ],
      },
      {
        groupKey: 'v5ControlPlane',
        features: [
          { featureKey: 'assetRelationshipGraph', availability: 'now' },
          { featureKey: 'globalPolicies', availability: 'now' },
          { featureKey: 'complianceMapping', availability: 'now' },
          { featureKey: 'executiveReporting', availability: 'now' },
        ],
      },
      {
        groupKey: 'dedicatedDelivery',
        features: [
          { featureKey: 'dedicatedSupport', availability: 'now' },
          { featureKey: 'deploymentEngineer', availability: 'now' },
          { featureKey: 'prioritySla', availability: 'now' },
        ],
      },
    ],
    primaryCta: 'contactSales',
  },
];

export type ComparisonCell = boolean | 'partial';

export interface ComparisonRow {
  key: string;
  community: ComparisonCell;
  enterprise: ComparisonCell;
  onPremise: ComparisonCell;
  /** Availability badge when cell is true or partial */
  cellAvailability?: Partial<Record<SubscriptionTierId, FeatureAvailability>>;
}

export interface ComparisonCategory {
  categoryKey: string;
  rows: ComparisonRow[];
}

export const SUBSCRIPTION_COMPARISON: ComparisonCategory[] = [
  {
    categoryKey: 'v1ScanReport',
    rows: [
      {
        key: 'staticConfigAudit',
        community: true,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'dynamicAttackScan',
        community: true,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'riskGradingEvidence',
        community: true,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'reportExport',
        community: true,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'cliDockerLocal',
        community: true,
        enterprise: true,
        onPremise: true,
      },
    ],
  },
  {
    categoryKey: 'enterpriseDetection',
    rows: [
      {
        key: 'proVulnLibrary',
        community: false,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'mcpScan',
        community: false,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'skillsScan',
        community: false,
        enterprise: true,
        onPremise: true,
      },
    ],
  },
  {
    categoryKey: 'integrationModel',
    rows: [
      {
        key: 'openApi',
        community: false,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'privateSecurityLlm',
        community: false,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'multiTeamSso',
        community: false,
        enterprise: true,
        onPremise: true,
      },
    ],
  },
  {
    categoryKey: 'v2Validation',
    rows: [
      {
        key: 'securityBaselines',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'roadmap', onPremise: 'roadmap' },
      },
      {
        key: 'passFailVerdict',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'roadmap', onPremise: 'roadmap' },
      },
      {
        key: 'regressionEnvCompare',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'roadmap', onPremise: 'roadmap' },
      },
      {
        key: 'findingsRetest',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'preview', onPremise: 'now' },
      },
    ],
  },
  {
    categoryKey: 'v3ReleaseGate',
    rows: [
      {
        key: 'thresholdPolicies',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'roadmap', onPremise: 'roadmap' },
      },
      {
        key: 'cicdGateApi',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'roadmap', onPremise: 'roadmap' },
      },
      {
        key: 'approvalExceptions',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'roadmap', onPremise: 'roadmap' },
      },
      {
        key: 'pipelineBlock',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'roadmap', onPremise: 'roadmap' },
      },
    ],
  },
  {
    categoryKey: 'v4Governance',
    rows: [
      {
        key: 'scheduledRetest',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'roadmap', onPremise: 'roadmap' },
      },
      {
        key: 'riskTrendDashboard',
        community: false,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'findingsLifecycle',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'preview', onPremise: 'now' },
      },
      {
        key: 'auditLogs',
        community: false,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'slaTicketing',
        community: false,
        enterprise: 'partial',
        onPremise: true,
        cellAvailability: { enterprise: 'roadmap', onPremise: 'roadmap' },
      },
    ],
  },
  {
    categoryKey: 'v5ControlPlane',
    rows: [
      {
        key: 'assetRelationshipGraph',
        community: false,
        enterprise: false,
        onPremise: 'partial',
        cellAvailability: { onPremise: 'roadmap' },
      },
      {
        key: 'globalPolicies',
        community: false,
        enterprise: false,
        onPremise: 'partial',
        cellAvailability: { onPremise: 'roadmap' },
      },
      {
        key: 'complianceMapping',
        community: false,
        enterprise: false,
        onPremise: 'partial',
        cellAvailability: { onPremise: 'roadmap' },
      },
      {
        key: 'executiveReporting',
        community: false,
        enterprise: false,
        onPremise: 'partial',
        cellAvailability: { onPremise: 'roadmap' },
      },
    ],
  },
  {
    categoryKey: 'customizationDelivery',
    rows: [
      {
        key: 'modelCustomization',
        community: false,
        enterprise: false,
        onPremise: true,
        cellAvailability: { onPremise: 'delivery' },
      },
      {
        key: 'vulnCustomization',
        community: false,
        enterprise: false,
        onPremise: true,
        cellAvailability: { onPremise: 'delivery' },
      },
      {
        key: 'agentCustomization',
        community: false,
        enterprise: false,
        onPremise: true,
        cellAvailability: { onPremise: 'delivery' },
      },
    ],
  },
  {
    categoryKey: 'deploymentSupport',
    rows: [
      {
        key: 'managedCloud',
        community: false,
        enterprise: true,
        onPremise: false,
      },
      {
        key: 'customerInfraDeploy',
        community: false,
        enterprise: false,
        onPremise: true,
        cellAvailability: { onPremise: 'delivery' },
      },
      {
        key: 'dataIsolation',
        community: false,
        enterprise: false,
        onPremise: true,
        cellAvailability: { onPremise: 'delivery' },
      },
      {
        key: 'dedicatedRunner',
        community: false,
        enterprise: false,
        onPremise: true,
        cellAvailability: { onPremise: 'delivery' },
      },
      {
        key: 'communitySupport',
        community: true,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'prioritySla',
        community: false,
        enterprise: true,
        onPremise: true,
      },
      {
        key: 'deploymentEngineer',
        community: false,
        enterprise: false,
        onPremise: true,
        cellAvailability: { onPremise: 'delivery' },
      },
    ],
  },
];
