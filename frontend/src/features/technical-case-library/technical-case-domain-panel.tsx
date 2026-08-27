import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { type MappedTechnicalLibrary, paginate, TECHNICAL_LIBRARY_PAGE_SIZE } from './shared';
import {
  ALL_DOMAIN_TAB,
  resolveAllListMeta,
  resolveDomainMeta,
  type TechnicalDomainMeta,
} from './technical-case-domains';
import { TechnicalCaseLibraryCard } from './technical-case-library-card';

type TechnicalCaseDomainPanelProps = {
  domain: string;
  domainMetas?: TechnicalDomainMeta[];
  rows: MappedTechnicalLibrary[];
  page: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onCreateLibrary: () => void;
  onToggleEnabled: (lib: MappedTechnicalLibrary) => void;
  onEditLibrary: (lib: MappedTechnicalLibrary) => void;
  onDeleteLibrary: (lib: MappedTechnicalLibrary) => void;
  togglePending?: boolean;
};

export function TechnicalCaseDomainPanel({
  domain,
  domainMetas = [],
  rows,
  page,
  pageSize = TECHNICAL_LIBRARY_PAGE_SIZE,
  onPageChange,
  onCreateLibrary,
  onToggleEnabled,
  onEditLibrary,
  onDeleteLibrary,
  togglePending,
}: TechnicalCaseDomainPanelProps) {
  const meta =
    domain === ALL_DOMAIN_TAB ? resolveAllListMeta() : resolveDomainMeta(domain, domainMetas);
  const paged = paginate(rows, page, pageSize);

  return (
    <Card className="rounded-lg">
      <CardContent className="px-6 py-5">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight">{meta.listTitle}</h3>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              {meta.listSub}
            </p>
          </div>
          <Button className="shrink-0" onClick={onCreateLibrary}>
            <Plus className="mr-2 h-4 w-4" />
            新建场景库
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            暂无场景库
            {' · '}
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={onCreateLibrary}
            >
              新建场景库
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {paged.items.map((lib) => (
                <TechnicalCaseLibraryCard
                  key={lib.id}
                  lib={lib}
                  currentDomain={domain}
                  togglePending={togglePending}
                  onToggleEnabled={() => onToggleEnabled(lib)}
                  onEdit={() => onEditLibrary(lib)}
                  onDelete={() => onDeleteLibrary(lib)}
                />
              ))}
            </div>
            {paged.total > 0 ? (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  显示 {paged.start}–{paged.end} / {paged.total} 个
                  {paged.pages > 1 ? ` · 第 ${paged.page} / ${paged.pages} 页` : ''}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={paged.page <= 1}
                    onClick={() => onPageChange(paged.page - 1)}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={paged.page >= paged.pages}
                    onClick={() => onPageChange(paged.page + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
