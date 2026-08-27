import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { AssetLedgerPage } from '@/features/asset-intake';

export const Route = createFileRoute('/_authenticated/assets/ledger')({
  component: AssetLedgerLayout,
});

function AssetLedgerLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname.startsWith('/assets/ledger/') && pathname.endsWith('/profile')) {
    return <Outlet />;
  }
  return <AssetLedgerPage />;
}
