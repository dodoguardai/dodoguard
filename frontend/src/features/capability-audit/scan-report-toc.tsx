/**
 * 报告右侧目录 — 参考 SAFESKILL // 目录
 */

type TocItem = {
  id: string;
  label: string;
};

type ScanReportTocProps = {
  items: TocItem[];
  activeId?: string;
  isZh: boolean;
};

export function ScanReportToc({ items, activeId, isZh }: ScanReportTocProps) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
      <p className="mb-3 font-mono text-xs tracking-wider text-neutral-700 uppercase dark:text-neutral-300">
        {tr('// Contents', '// 目录')}
      </p>
      <ol className="space-y-1">
        {items.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => scrollTo(item.id)}
              className={
                activeId === item.id
                  ? 'w-full rounded-md bg-neutral-100 px-2 py-1.5 text-left text-sm font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                  : 'text-muted-foreground hover:bg-slate-50 hover:text-foreground w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors dark:hover:bg-slate-800/50'
              }
            >
              <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>
              {item.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export const SCAN_REPORT_SECTION_IDS = {
  summary: 'scan-report-summary',
  core: 'scan-report-core',
  dimensions: 'scan-report-dimensions',
  findings: 'scan-report-findings',
  recommendations: 'scan-report-recommendations',
  skillContent: 'scan-report-skill-content',
} as const;

export function buildReportTocItems(
  isZh: boolean,
  hasRecommendations: boolean,
  hasSkillPreview = false,
) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const items: TocItem[] = [
    { id: SCAN_REPORT_SECTION_IDS.summary, label: tr('Assessment summary', '综合摘要') },
    { id: SCAN_REPORT_SECTION_IDS.core, label: tr('Core characteristics', '核心特性') },
    { id: SCAN_REPORT_SECTION_IDS.dimensions, label: tr('Security dimensions', '安全维度') },
    { id: SCAN_REPORT_SECTION_IDS.findings, label: tr('Risk assessment', '风险评估') },
  ];
  if (hasRecommendations) {
    items.push({ id: SCAN_REPORT_SECTION_IDS.recommendations, label: tr('Recommendations', '处置建议') });
  }
  if (hasSkillPreview) {
    items.push({ id: SCAN_REPORT_SECTION_IDS.skillContent, label: tr('Skill content', 'Skill 内容') });
  }
  return items;
}

export type { TocItem };
