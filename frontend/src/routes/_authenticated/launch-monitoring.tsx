import { createFileRoute } from '@tanstack/react-router'
import { LaunchMonitoringPage } from '@/features/launch-monitoring'

export const Route = createFileRoute('/_authenticated/launch-monitoring')({
  validateSearch: (search: Record<string, unknown> = {}) => {
    const create =
      search.create === true || search.create === '1' || search.create === 'true'
    const assetId =
      typeof search.assetId === 'string' && search.assetId.trim()
        ? search.assetId.trim()
        : undefined
    return {
      ...(create ? { create: true as const } : {}),
      ...(assetId ? { assetId } : {}),
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { create, assetId } = Route.useSearch()
  return (
    <LaunchMonitoringPage
      autoOpenCreate={Boolean(create)}
      initialCreateAssetId={assetId}
    />
  )
}
