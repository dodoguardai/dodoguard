import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export function MaintenanceError() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  return (
    <div className="h-svh">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
        <h1 className="text-[7rem] leading-tight font-bold">503</h1>
        <span className="font-medium">{tr('Website is under maintenance!', '网站维护中！')}</span>
        <p className="text-center text-muted-foreground">
          {tr('The site is not available at the moment.', '网站当前不可用。')} <br />
          {tr("We'll be back online shortly.", '我们将很快恢复服务。')}
        </p>
        <div className="mt-6 flex gap-4">
          <Button variant="outline">{tr('Learn more', '了解更多')}</Button>
        </div>
      </div>
    </div>
  );
}
