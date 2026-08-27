import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface CpModelCardProps {
  name: string;
  subtitle: string;
  statusLabel: string;
  statusTone: 'success' | 'warning' | 'muted';
  onEdit: () => void;
  onDelete: () => void;
  onTest?: () => void;
  testing?: boolean;
}

/** Compact model row — matches admission `cp-model-card` / `model-card`. */
export function CpModelCard({
  name,
  subtitle,
  statusLabel,
  statusTone,
  onEdit,
  onDelete,
  onTest,
  testing = false,
}: CpModelCardProps) {
  const { t } = useTranslation();
  const p = 'pages.settingsModels';

  return (
    <div className="cp-model-card flex flex-col gap-3 rounded-lg border bg-background px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="cp-model-card-meta min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-semibold leading-snug">{name}</strong>
          <Badge
            variant={statusTone === 'success' ? 'default' : 'secondary'}
            className={
              statusTone === 'success'
                ? 'h-5 bg-emerald-600 px-1.5 text-[11px] hover:bg-emerald-600'
                : statusTone === 'warning'
                  ? 'h-5 bg-amber-100 px-1.5 text-[11px] text-amber-800 hover:bg-amber-100'
                  : 'h-5 px-1.5 text-[11px]'
            }
          >
            {statusLabel}
          </Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className="cp-model-card-actions flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
        {onTest ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            onClick={onTest}
            disabled={testing}
            title={t(`${p}.review.testConnection`)}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : t(`${p}.test`)}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5" onClick={onEdit}>
          {t(`${p}.edit`)}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          {t(`${p}.delete`)}
        </Button>
      </div>
    </div>
  );
}
