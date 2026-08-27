/**
 * Extra Agent skill catalog rows (prototype SKILL_CATALOG entries not yet shipped as bundled folders).
 * Install state is client-local until GET /organization-skills/catalog exists.
 */

export type CatalogExtra = {
  slug: string;
  desc: { zh: string; en: string };
  /** i18n tag keys resolved in UI */
  tags: readonly ('surface' | 'catalog' | 'closure')[];
};

export const AGENT_SKILL_CATALOG_EXTRAS: CatalogExtra[] = [
  {
    slug: 'harness-verification',
    desc: {
      zh: '与 POST 创建接口同源 schema 的失败反馈话术。',
      en: 'Harness feedback aligned with the attack-task create schema.',
    },
    tags: ['closure'],
  },
  {
    slug: 'owasp-llm-top10',
    desc: {
      zh: '红队视角漏洞分类引导。',
      en: 'Red-team style OWASP LLM Top 10 coverage prompts.',
    },
    tags: ['catalog'],
  },
  {
    slug: 'coze-surface',
    desc: {
      zh: 'Coze 平台专用（bot、会话与插件调用链安全）。',
      en: 'Coze-specific: bots, sessions, and plugin call chains.',
    },
    tags: ['surface'],
  },
  {
    slug: 'fastgpt-surface',
    desc: {
      zh: 'FastGPT 专用（应用、知识库与 HTTP 节点）。',
      en: 'FastGPT-specific: apps, knowledge bases, and HTTP nodes.',
    },
    tags: ['surface'],
  },
  {
    slug: 'n8n-surface',
    desc: {
      zh: 'n8n 工作流与节点侧安全探测要点。',
      en: 'n8n workflow and node-level security probes.',
    },
    tags: ['surface'],
  },
];

export const OPTIONAL_AGENT_SKILLS_LS_KEY = 'zhian.agentSkills.optionalInstalledSlugs';

/** Persisted order of installed skill slugs for this browser (display-only until server precedence APIs exist). */
export const AGENT_SKILLS_DISPLAY_ORDER_LS_KEY = 'zhian.agentSkills.installedDisplayOrder';
