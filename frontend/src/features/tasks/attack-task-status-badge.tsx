import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { AttackTask } from '@/types/entities';

export function AttackTaskStatusBadge({
  status,
}: {
  status: AttackTask['status'] | undefined | null;
}) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const s = status || 'pending';
  switch (s) {
    case 'pending':
      return <Badge variant="secondary">{tr('Pending', '排队中')}</Badge>;
    case 'running':
      return (
        <Badge variant="default" className="bg-yellow-600">
          <Clock className="mr-1 h-3 w-3" />
          {tr('Running', '运行中')}
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {tr('Completed', '已完成')}
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          {tr('Failed', '失败')}
        </Badge>
      );
    case 'canceled':
      return <Badge variant="outline">{tr('Canceled', '已取消')}</Badge>;
    default:
      return <Badge variant="outline">{String(s)}</Badge>;
  }
}
