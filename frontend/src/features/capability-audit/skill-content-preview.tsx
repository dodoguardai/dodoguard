/**
 * Skill / MCP 文件树 + 代码预览 — 参考 SAFESKILL 深色 FILE TREE 区块
 */

import { useEffect, useMemo, useState } from 'react';

import { ChevronDown, ChevronRight, FileCode2, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SkillPreview, SkillPreviewFile } from '@/services/api/capability-scan';

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  file?: SkillPreviewFile;
};

function formatBytes(n?: number): string {
  if (n === undefined) {
    return '';
  }
  if (n < 1024) {
    return `${n} B`;
  }
  return `${(n / 1024).toFixed(1)} KB`;
}

function buildTree(files: SkillPreviewFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let level = root;
    let acc = '';

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      acc = acc ? `${acc}/${part}` : part;

      let node = level.find((n) => n.name === part);
      if (!node) {
        node = {
          name: part,
          path: acc,
          isDir: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        level.push(node);
      }
      level = node.children;
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    [...nodes]
      .sort((a, b) => {
        if (a.isDir !== b.isDir) {
          return a.isDir ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map((n) => ({ ...n, children: sortNodes(n.children) }));

  return sortNodes(root);
}

function kindBadge(path: string, kind: SkillPreviewFile['kind']): string {
  if (/\.md$/i.test(path)) {
    return 'Markdown';
  }
  if (/\.json$/i.test(path)) {
    return 'JSON';
  }
  if (/\.(sh|bash|ps1)$/i.test(path)) {
    return 'Shell';
  }
  if (kind === 'script') {
    return 'Script';
  }
  if (kind === 'config') {
    return 'Config';
  }
  return kind;
}

type SkillContentPreviewProps = {
  preview?: SkillPreview;
  isZh: boolean;
};

function TreeRow({
  node,
  depth,
  expandedDirs,
  expandedFile,
  onToggleDir,
  onToggleFile,
  isZh,
}: {
  node: TreeNode;
  depth: number;
  expandedDirs: Set<string>;
  expandedFile: string | null;
  onToggleDir: (path: string) => void;
  onToggleFile: (path: string) => void;
  isZh: boolean;
}) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const open = expandedDirs.has(node.path);
  const fileOpen = expandedFile === node.path;
  const file = node.file;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 pr-2"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {node.isDir ? (
          <button
            type="button"
            onClick={() => onToggleDir(node.path)}
            className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs"
          >
            {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
            <Folder className="size-3.5 shrink-0 text-amber-500/80" />
            <span className="truncate font-medium">{node.name}</span>
          </button>
        ) : (
          <>
            <FileCode2 className="text-muted-foreground size-3.5 shrink-0" style={{ marginLeft: 18 }} />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-xs font-medium">{node.name}</span>
              {file && (
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  {kindBadge(file.path, file.kind)}
                  {file.lineCount ? ` · ${file.lineCount} ${tr('lines', '行')}` : ''}
                  {file.sizeBytes ? ` · ${formatBytes(file.sizeBytes)}` : ''}
                </span>
              )}
            </div>
            {file?.content && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-[10px] text-sky-400 hover:text-sky-300"
                onClick={() => onToggleFile(node.path)}
              >
                {fileOpen ? tr('Collapse', '收起代码') : tr('View code', '查看代码')}
              </Button>
            )}
          </>
        )}
      </div>

      {file?.content && fileOpen && (
        <pre
          className="mx-2 mb-2 max-h-80 overflow-auto rounded-md border border-neutral-800 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-neutral-200"
          style={{ marginLeft: `${depth * 14 + 24}px` }}
        >
          {file.content.split('\n').map((line, i) => (
            <div key={`${node.path}-${i}`} className="flex gap-3">
              <span className="select-none text-neutral-600 tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{line || ' '}</span>
            </div>
          ))}
        </pre>
      )}

      {node.isDir && open && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              expandedFile={expandedFile}
              onToggleDir={onToggleDir}
              onToggleFile={onToggleFile}
              isZh={isZh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SkillContentPreview({ preview, isZh }: SkillContentPreviewProps) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const tree = useMemo(() => (preview?.files ? buildTree(preview.files) : []), [preview?.files]);

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  useEffect(() => {
    if (!preview?.files?.length) {
      return;
    }
    const dirs = new Set<string>();
    for (const f of preview.files) {
      const parts = f.path.split('/').filter(Boolean);
      let acc = '';
      for (let i = 0; i < parts.length - 1; i += 1) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        dirs.add(acc);
      }
    }
    setExpandedDirs(dirs);
    setExpandedFile(preview.defaultExpanded ?? null);
  }, [preview]);

  if (!preview?.files?.length) {
    return null;
  }

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAllDirs = () => {
    const dirs = new Set<string>();
    for (const f of preview.files) {
      const parts = f.path.split('/').filter(Boolean);
      let acc = '';
      for (let i = 0; i < parts.length - 1; i += 1) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        dirs.add(acc);
      }
    }
    setExpandedDirs(dirs);
  };

  const collapseAll = () => {
    setExpandedDirs(new Set());
    setExpandedFile(null);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3">
        <div>
          <p className="font-mono text-xs tracking-widest text-neutral-400 uppercase">FILE TREE</p>
          {preview.stats.length > 0 && (
            <p className="mt-1 text-[11px] text-neutral-500">
              {preview.stats
                .map((s) => `${s.kind} ${s.count} ${tr('files', '文件')} · ${s.lines} ${tr('lines', '行')}`)
                .join('  ·  ')}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] text-neutral-400 hover:text-neutral-200"
            onClick={expandAllDirs}
          >
            {tr('Expand all', '全部展开')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] text-neutral-400 hover:text-neutral-200"
            onClick={collapseAll}
          >
            {tr('Collapse all', '全部收起')}
          </Button>
        </div>
      </div>

      <div className="max-h-[32rem] overflow-y-auto py-2">
        {tree.map((node) => (
          <TreeRow
            key={node.path}
            node={node}
            depth={0}
            expandedDirs={expandedDirs}
            expandedFile={expandedFile}
            onToggleDir={toggleDir}
            onToggleFile={(path) => setExpandedFile((prev) => (prev === path ? null : path))}
            isZh={isZh}
          />
        ))}
      </div>
    </div>
  );
}
