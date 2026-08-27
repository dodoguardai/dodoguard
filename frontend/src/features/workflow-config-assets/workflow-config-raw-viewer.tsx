/**
 * Read-only YAML / JSON tabs for saved asset raw text (detail page).
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const PRE_BOX =
  'rounded-md border bg-muted/25 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all';

function tryPrettyJson(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) {
    return { ok: false, error: 'empty' };
  }
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(t), null, 2) };
  } catch {
    return { ok: false, error: 'parse' };
  }
}

/** Lightweight JSON coloring (scanner, no extra deps). */
function jsonToHighlightedNodes(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const push = (s: string, className?: string) => {
    if (!s) {
      return;
    }
    out.push(
      className ? (
        <span key={k++} className={className}>
          {s}
        </span>
      ) : (
        <span key={k++}>{s}</span>
      ),
    );
  };

  const strClass = 'text-emerald-600 dark:text-emerald-400/90';
  const kwClass = 'text-violet-600 dark:text-violet-400/90';
  const numClass = 'text-amber-700 dark:text-amber-400/90';
  const punctClass = 'text-muted-foreground';

  while (i < text.length) {
    const c = text[i];
    if (c === '"' ) {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\' && j + 1 < text.length) {
          j += 2;
          continue;
        }
        if (text[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      push(text.slice(i, j), strClass);
      i = j;
      continue;
    }
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) {
        j++;
      }
      push(text.slice(i, j));
      i = j;
      continue;
    }
    if ('{}[],:'.includes(c)) {
      push(c, punctClass);
      i++;
      continue;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      const numRe = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;
      const rest = text.slice(i);
      const m = rest.match(numRe);
      if (m) {
        push(m[0], numClass);
        i += m[0].length;
        continue;
      }
    }
    const rest2 = text.slice(i);
    const kw = rest2.match(/^(true|false|null)\b/);
    if (kw) {
      push(kw[0], kwClass);
      i += kw[0].length;
      continue;
    }
    push(c);
    i++;
  }
  return out;
}

function JsonHighlighted({ text }: { text: string }) {
  const nodes = useMemo(() => jsonToHighlightedNodes(text), [text]);
  return <code className="block">{nodes}</code>;
}

/** Best-effort YAML: comments + mapping keys at line start. */
function YamlHighlighted({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <code className="block">
      {lines.map((line, i) => {
        const t = line.trimStart();
        if (t.startsWith('#')) {
          return (
            <span key={i} className="block text-muted-foreground">
              {line}
              {'\n'}
            </span>
          );
        }
        const indent = line.length - t.length;
        const indentStr = line.slice(0, indent);
        const m = /^([^:#]+)(:\s*)(.*)$/.exec(t);
        if (m && !t.startsWith('-') && !t.startsWith('?')) {
          const [, keyPart, colonRest, rest] = m;
          return (
            <span key={i} className="block">
              {indentStr}
              <span className="text-sky-700 dark:text-sky-400/95">{keyPart}</span>
              <span className="text-muted-foreground">{colonRest}</span>
              <span>{rest}</span>
              {'\n'}
            </span>
          );
        }
        return (
          <span key={i} className="block">
            {line}
            {'\n'}
          </span>
        );
      })}
    </code>
  );
}

export function WorkflowConfigRawViewer({
  rawContent,
  rawFormat,
  className,
}: {
  rawContent: string;
  rawFormat: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const p = 'pages.workflowConfigAssets.detail';
  const defaultTab = rawFormat === 'json' ? 'json' : 'yaml';
  const [tab, setTab] = useState(() => defaultTab);

  const jsonView = useMemo(() => tryPrettyJson(rawContent), [rawContent]);

  return (
    <Tabs value={tab} onValueChange={setTab} className={cn('w-full', className)}>
      <TabsList className="w-full justify-start sm:w-fit">
        <TabsTrigger value="yaml">{t(`${p}.rawTabYaml`)}</TabsTrigger>
        <TabsTrigger value="json">{t(`${p}.rawTabJson`)}</TabsTrigger>
      </TabsList>
      <TabsContent value="yaml" className="mt-3">
        <ScrollArea className="h-[min(480px,50vh)] rounded-md border">
          <div className={cn(PRE_BOX, 'border-0 rounded-none')}>
            <YamlHighlighted text={rawContent} />
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="json" className="mt-3">
        {jsonView.ok ? (
          <ScrollArea className="h-[min(480px,50vh)] rounded-md border">
            <div className={cn(PRE_BOX, 'border-0 rounded-none')}>
              <JsonHighlighted text={jsonView.text} />
            </div>
          </ScrollArea>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              {t(`${p}.rawJsonInvalid`)}
            </p>
            <ScrollArea className="h-[min(280px,40vh)] rounded-md border">
              <div className={cn(PRE_BOX, 'border-0 rounded-none')}>
                <YamlHighlighted text={rawContent} />
              </div>
            </ScrollArea>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
