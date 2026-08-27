import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type AssetManifestItem = { path: string; kind: string };

type AssetManifestPanelProps = {
  items?: AssetManifestItem[];
  isZh: boolean;
};

export function AssetManifestPanel({ items, isZh }: AssetManifestPanelProps) {
  if (!items?.length) {
    return null;
  }

  const tr = (en: string, zh: string) => (isZh ? zh : en);

  return (
    <Collapsible className="mb-4">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="hover:bg-muted/50 text-muted-foreground flex items-center gap-2 text-sm font-medium"
        >
          <ChevronDown className="size-4" />
          {tr(`Asset manifest (${items.length})`, `制品清单 (${items.length})`)}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="text-muted-foreground mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
          {items.map((item) => (
            <li key={item.path} className="font-mono">
              <span className="text-foreground/70 mr-2">[{item.kind}]</span>
              {item.path}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
