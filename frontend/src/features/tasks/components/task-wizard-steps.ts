/**
 * Step sequences — API Test vs Dify Config Gray-Box & API Black-Box Scanning Task (extensible per flow).
 */

import type { TFunction } from 'i18next';

export type TaskKind = 'api_test' | 'config_audit' | 'config_static';

export type ConfigYamlSurface = 'coze' | 'dify' | 'fastgpt' | 'n8n';

const WIZARD_STEPS_NS = 'pages.tasks.createWizard.steps';

export type WizardStepKey =
  | 'basic'
  | 'target'
  | 'vulns'
  | 'configYaml'
  | 'attackMode'
  | 'detection'
  | 'agent'
  | 'advanced'
  | 'review';

export function getWizardSteps(taskKind: TaskKind): WizardStepKey[] {
  if (taskKind === 'api_test') {
    return ['basic', 'target', 'vulns', 'detection', 'agent', 'advanced', 'review'];
  }
  if (taskKind === 'config_static') {
    return [
      'basic',
      'target',
      'vulns',
      'configYaml',
      'attackMode',
      'detection',
      'agent',
      'advanced',
      'review',
    ];
  }
  return [
    'basic',
    'target',
    'vulns',
    'configYaml',
    'attackMode',
    'detection',
    'agent',
    'advanced',
    'review',
  ];
}

export type WizardStepTitleContext = {
  /** Config upload step copy varies by platform export format. */
  configYamlSurface?: ConfigYamlSurface;
  t: TFunction;
};

export function wizardStepTitle(
  key: WizardStepKey,
  ctx: WizardStepTitleContext,
): { label: string; description: string } {
  const { t } = ctx;
  const surf = ctx.configYamlSurface ?? 'dify';
  const configYamlDescription =
    surf === 'coze'
      ? t(`${WIZARD_STEPS_NS}.configYaml.descriptionCoze`)
      : surf === 'fastgpt'
        ? t(`${WIZARD_STEPS_NS}.configYaml.descriptionFastgpt`)
        : surf === 'n8n'
          ? t(`${WIZARD_STEPS_NS}.configYaml.descriptionN8n`)
          : t(`${WIZARD_STEPS_NS}.configYaml.descriptionDify`);
  const map: Record<WizardStepKey, { label: string; description: string }> = {
    basic: {
      label: t(`${WIZARD_STEPS_NS}.basic.label`),
      description: t(`${WIZARD_STEPS_NS}.basic.description`),
    },
    target: {
      label: t(`${WIZARD_STEPS_NS}.target.label`),
      description: t(`${WIZARD_STEPS_NS}.target.description`),
    },
    vulns: {
      label: t(`${WIZARD_STEPS_NS}.vulns.label`),
      description: t(`${WIZARD_STEPS_NS}.vulns.description`),
    },
    configYaml: {
      label: t(`${WIZARD_STEPS_NS}.configYaml.label`),
      description: configYamlDescription,
    },
    attackMode: {
      label: t(`${WIZARD_STEPS_NS}.attackMode.label`),
      description: t(`${WIZARD_STEPS_NS}.attackMode.description`),
    },
    detection: {
      label: t(`${WIZARD_STEPS_NS}.detection.label`),
      description: t(`${WIZARD_STEPS_NS}.detection.description`),
    },
    agent: {
      label: t(`${WIZARD_STEPS_NS}.agent.label`),
      description: t(`${WIZARD_STEPS_NS}.agent.description`),
    },
    advanced: {
      label: t(`${WIZARD_STEPS_NS}.advanced.label`),
      description: t(`${WIZARD_STEPS_NS}.advanced.description`),
    },
    review: {
      label: t(`${WIZARD_STEPS_NS}.review.label`),
      description: t(`${WIZARD_STEPS_NS}.review.description`),
    },
  };
  return map[key];
}
