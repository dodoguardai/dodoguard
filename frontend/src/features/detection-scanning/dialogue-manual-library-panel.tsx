import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import {
  WizardCheckboxCard,
  WizardTag,
} from '@/features/compliance-detection/compliance-wizard-ui';
import { mapTechnicalLibrary } from '@/features/technical-case-library/shared';
import {
  ALL_DOMAIN_TAB,
  buildDomainTabs,
  buildTechnicalDomainMetas,
  normalizeTechnicalDomainKey,
  resolveDomainMeta,
} from '@/features/technical-case-library/technical-case-domains';
import type { SecurityCaseLibrary } from '@/types/entities';

type DialogueManualLibraryPanelProps = {
  libraries: SecurityCaseLibrary[];
  selectedLibIds: string[];
  recommendedLibIds: Set<string>;
  onToggle: (libId: string, checked: boolean) => void;
  selectionLocked?: boolean;
  selectionHint?: string;
};

function isExecutableLibrary(library: SecurityCaseLibrary): boolean {
  const mapped = mapTechnicalLibrary(library);
  return library.enabled && !mapped.isDomainOnly && library.caseCount > 0;
}

function libraryStatusHint(library: SecurityCaseLibrary): string {
  if (!library.enabled) {
    return '未启用';
  }
  if (mapTechnicalLibrary(library).isDomainOnly) {
    return '分类目录';
  }
  if (library.caseCount <= 0) {
    return '暂无用例';
  }
  return '';
}

function groupLibrariesByDomain(libraries: SecurityCaseLibrary[]) {
  const mappedLibraries = libraries.map((library) => mapTechnicalLibrary(library));
  const domainMetas = buildTechnicalDomainMetas(mappedLibraries);
  const groups = new Map<string, SecurityCaseLibrary[]>();

  for (const library of libraries) {
    if (mapTechnicalLibrary(library).isDomainOnly) {
      continue;
    }
    const domainKey = normalizeTechnicalDomainKey(library.domain);
    const list = groups.get(domainKey) || [];
    list.push(library);
    groups.set(domainKey, list);
  }

  const domainOrder = buildDomainTabs(domainMetas).filter((key) => key !== ALL_DOMAIN_TAB);

  return domainOrder
    .map((domainKey) => ({
      domainKey,
      meta: resolveDomainMeta(domainKey, domainMetas),
      libraries: groups.get(domainKey) || [],
    }))
    .filter((group) => group.libraries.length > 0);
}

export function DialogueManualLibraryPanel({
  libraries,
  selectedLibIds,
  recommendedLibIds,
  onToggle,
  selectionLocked = false,
  selectionHint,
}: DialogueManualLibraryPanelProps) {
  const groups = groupLibrariesByDomain(libraries);

  if (libraries.length === 0) {
    return (
      <p className="rounded-[14px] border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        暂无已启用的对话安全测试用例库，请先在
        <Link
          to="/scan/security-cases"
          search={{ domain: 'all' }}
          className="mx-1 text-primary underline-offset-4 hover:underline"
        >
          对话安全检测用例库
        </Link>
        中启用。
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {selectionHint ||
          '按领域分类展示对话测试子场景库，数据来自规则与知识库中的对话安全检测风险库。勾选纳入本次评估的子场景库。'}
      </p>
      {groups.map((group) => (
        <section key={group.domainKey} className="rounded-[16px] border bg-muted/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">{group.meta.icon}</span>
                <h4 className="text-sm font-black">{group.meta.kpiLibLabel}</h4>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {group.meta.listSub}
              </p>
            </div>
            <WizardTag tone="gray">
              {group.libraries.filter(isExecutableLibrary).length} 个可执行 ·{' '}
              {group.libraries.length} 个子场景
            </WizardTag>
          </div>
          <div className="grid gap-2">
            {group.libraries.map((library) => {
              const mapped = mapTechnicalLibrary(library);
              const standards = mapped.standards.slice(0, 2).join(' · ');
              const statusHint = libraryStatusHint(library);
              const description = [
                `${library.caseCount} 条用例`,
                mapped.method,
                standards || mapped.basis || mapped.tag,
                statusHint,
              ]
                .filter(Boolean)
                .join(' · ');
              const executable = isExecutableLibrary(library);

              return (
                <div key={library.id} className="relative pr-8">
                  {executable ? (
                    <WizardCheckboxCard
                      checked={selectedLibIds.includes(library.id)}
                      onCheckedChange={(checked) => onToggle(library.id, checked)}
                      title={library.title}
                      description={description}
                      recommended={recommendedLibIds.has(library.id)}
                      disabled={selectionLocked}
                    />
                  ) : (
                    <div className="rounded-[14px] border border-dashed border-border/80 bg-muted/15 px-3.5 py-3 opacity-80">
                      <div className="flex items-center gap-2">
                        <strong className="text-[13px] font-black leading-snug text-muted-foreground">
                          {library.title}
                        </strong>
                        <WizardTag tone="gray">{statusHint}</WizardTag>
                      </div>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {description}
                      </span>
                    </div>
                  )}
                  <Link
                    to="/scan/security-cases/$libraryId"
                    params={{ libraryId: library.id }}
                    search={{ domain: group.domainKey, highlightCase: undefined }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 top-3 text-muted-foreground hover:text-primary"
                    title="打开用例库"
                    aria-label={`在新窗口打开${library.title}详情`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
