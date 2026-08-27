/**
 * Shell: prototype-aligned app header (breadcrumb, title, surface tabs).
 */

import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const AGENT_MODE_SURFACES = ['dify', 'coze', 'fastgpt', 'n8n'] as const;
export type AgentModeSurface = (typeof AGENT_MODE_SURFACES)[number];

const SURFACE_LABELS: Record<AgentModeSurface, string> = {
  dify: 'Dify',
  coze: 'Coze',
  fastgpt: 'FastGPT',
  n8n: 'n8n',
};

type AgentModeLayoutProps = {
  surface: AgentModeSurface;
  onSurfaceChange: (surface: AgentModeSurface) => void;
  title: string;
  description: ReactNode;
  tasksLinkLabel: string;
  isZh: boolean;
};

export function AgentModeLayout({
  surface,
  onSurfaceChange,
  title,
  description,
  tasksLinkLabel,
  isZh,
}: AgentModeLayoutProps) {
  return (
    <header className="border-border shrink-0 border-b bg-card">
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <nav className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <Link
              to="/tasks"
              search={{ surface: 'all', status: 'all' }}
              className="hover:text-foreground"
            >
              {tasksLinkLabel}
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-primary font-medium">{title}</span>
          </nav>
          <h1 className="text-foreground mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <div className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">{description}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          <div
            id="header-builder-surfaces"
            className="border-border inline-flex rounded-xl border bg-card p-1 shadow-sm"
            role="tablist"
            aria-label={isZh ? '攻击面平台' : 'Attack surface'}
          >
            {AGENT_MODE_SURFACES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={surface === s}
                className={cn(
                  'surface-tab rounded-lg px-3 py-1.5 text-xs transition-all',
                  surface === s
                    ? 'bg-primary font-semibold text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted font-medium',
                )}
                onClick={() => onSurfaceChange(s)}
              >
                {SURFACE_LABELS[s]}
              </button>
            ))}
          </div>
          <span className="border-border text-foreground inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="bg-primary/40 absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
              <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
            </span>
            {isZh ? '编排 · 对接后端' : 'Live · backend'}
          </span>
        </div>
      </div>
    </header>
  );
}
