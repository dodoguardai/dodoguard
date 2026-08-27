/**
 * Vertical timeline for finding security workflow (scan, test, retest, conclusion).
 */

import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { Activity, CheckCircle2, Circle, Loader2, Scan, Shield, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { FindingTimelineEvent, TimelineEventStatus } from '@/types/api';

function statusIcon(status: TimelineEventStatus) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />;
    case 'succeeded':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive" aria-hidden />;
    case 'skipped':
      return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />;
  }
}

function typeIcon(type: FindingTimelineEvent['type']) {
  switch (type) {
    case 'scan':
      return <Scan className="h-4 w-4" aria-hidden />;
    case 'test':
    case 'retest':
      return <Shield className="h-4 w-4" aria-hidden />;
    case 'finding':
    case 'conclusion':
      return <Activity className="h-4 w-4" aria-hidden />;
    default:
      return <Circle className="h-4 w-4" aria-hidden />;
  }
}

function retestStatusBadges(status?: FindingTimelineEvent['retestFindingStatus']) {
  if (!status || status === 'unknown') {
    return (
      <Badge variant="secondary" className="text-xs">
        Status pending
      </Badge>
    );
  }
  if (status === 'new') {
    return (
      <>
        <Badge variant="destructive" className="text-xs">
          Unfixed
        </Badge>
        <Badge variant="secondary" className="text-xs">
          New risk
        </Badge>
      </>
    );
  }
  if (status === 'old_fixed') {
    return (
      <>
        <Badge variant="default" className="text-xs">
          Fixed
        </Badge>
        <Badge variant="outline" className="text-xs">
          Existing risk
        </Badge>
      </>
    );
  }
  if (status === 'old_unfixed') {
    return (
      <>
        <Badge variant="destructive" className="text-xs">
          Unfixed
        </Badge>
        <Badge variant="outline" className="text-xs">
          Existing risk
        </Badge>
      </>
    );
  }
  return null;
}

function retestStatusText(
  status?: FindingTimelineEvent['retestFindingStatus'],
  reason?: string,
) {
  if (!status || status === 'unknown') {
    return reason
      ? `Retest status for this finding: pending. Reason: ${reason}`
      : 'Retest status for this finding: pending';
  }
  if (status === 'new') {
    return 'Retest status for this finding: unfixed · new risk';
  }
  if (status === 'old_fixed') {
    return 'Retest status for this finding: fixed · existing risk';
  }
  if (status === 'old_unfixed') {
    return 'Retest status for this finding: unfixed · existing risk';
  }
  return reason
    ? `Retest status for this finding: pending. Reason: ${reason}`
    : 'Retest status for this finding: pending';
}

function getLatestRetestSummary(events: FindingTimelineEvent[]) {
  const retestEvents = events
    .filter((ev) => ev.type === 'retest')
    .slice()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const latest = retestEvents[retestEvents.length - 1];
  if (!latest) {
    return {
      text: 'No retest task yet.',
      badges: null,
      at: undefined as string | undefined,
    };
  }
  return {
    text: retestStatusText(latest.retestFindingStatus, latest.retestFindingStatusReason),
    badges: retestStatusBadges(latest.retestFindingStatus),
    at: latest.at,
  };
}

export interface SecurityTimelineProps {
  events: FindingTimelineEvent[];
  highlightFindingId?: string;
  className?: string;
}

export function SecurityTimeline({ events, highlightFindingId, className }: SecurityTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No timeline events yet.</p>
    );
  }
  const latestRetestSummary = getLatestRetestSummary(events);

  return (
    <div className={cn('space-y-0', className)}>
      <div className="mb-4 rounded-md border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Retest note</span>
          {latestRetestSummary.badges}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{latestRetestSummary.text}</p>
        {latestRetestSummary.at ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Updated at {format(new Date(latestRetestSummary.at), 'PPpp')}
          </p>
        ) : null}
      </div>
      <div className="relative">
        <div className="absolute inset-s-4 top-2 bottom-2 w-px bg-border" aria-hidden />
        <ul className="space-y-4">
          {events.map((ev) => {
            const isHighlight =
              highlightFindingId &&
              ev.refs?.findingId === highlightFindingId &&
              (ev.type === 'finding' || ev.type === 'conclusion');
            return (
              <li key={ev.id} className="relative flex gap-3 ps-1">
                <div
                  className={cn(
                    'relative z-0 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background',
                    isHighlight && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                  )}
                >
                  <span className="text-muted-foreground">{typeIcon(ev.type)}</span>
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusIcon(ev.status)}
                    <span className="font-medium text-sm">{ev.title}</span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {ev.type.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {format(new Date(ev.at), 'PPpp')}
                  </p>
                  {ev.summary ? (
                    <p className="mt-1 text-sm text-muted-foreground wrap-break-word">{ev.summary}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ev.refs?.taskId ? (
                      <Link
                        to="/tasks/$taskId"
                        params={{ taskId: ev.refs.taskId }}
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open task
                      </Link>
                    ) : null}
                    {ev.refs?.findingId ? (
                      <Link
                        to="/findings/$findingId"
                        params={{ findingId: ev.refs.findingId }}
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open finding
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function SecurityTimelineCard(props: SecurityTimelineProps & { title?: string }) {
  const { title = 'Security timeline', ...rest } = props;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>Scan, test, retest, and conclusion for this finding&apos;s baseline task</CardDescription>
      </CardHeader>
      <CardContent>
        <SecurityTimeline {...rest} />
      </CardContent>
    </Card>
  );
}
