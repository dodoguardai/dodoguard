import { useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function ForbiddenError() {
  const navigate = useNavigate();
  const { history } = useRouter();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  return (
    <div className="h-svh">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
        <h1 className="text-[7rem] leading-tight font-bold">403</h1>
        <span className="font-medium">{tr('Access Forbidden', '访问被拒绝')}</span>
        <p className="text-center text-muted-foreground">
          {tr("You don't have necessary permission", '你没有足够权限')} <br />
          {tr('to view this resource.', '访问该资源。')}
        </p>
        <div className="mt-6 flex gap-4">
          <Button variant="outline" onClick={() => history.go(-1)}>
            {tr('Go Back', '返回')}
          </Button>
          <Button onClick={() => navigate({ to: '/', search: { tab: 'overview' } })}>
            {tr('Back to Home', '返回首页')}
          </Button>
        </div>
      </div>
    </div>
  );
}
