import type { ReactNode } from 'react';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CpModelSectionProps {
  title: string;
  description: string;
  addLabel: string;
  onAdd?: () => void;
  children: ReactNode;
}

/** Section panel — matches admission `model-section` with card chrome. */
export function CpModelSection({
  title,
  description,
  addLabel,
  onAdd,
  children,
}: CpModelSectionProps) {
  return (
    <section className="cp-model-section overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="cp-model-section-head flex items-start justify-between gap-4 border-b bg-muted/20 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug">{title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {onAdd ? (
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" />
            {addLabel}
          </Button>
        ) : null}
      </div>
      <div className="cp-model-section-body px-5 py-4">{children}</div>
    </section>
  );
}
