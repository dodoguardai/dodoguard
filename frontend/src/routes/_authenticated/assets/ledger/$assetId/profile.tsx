import { createFileRoute } from '@tanstack/react-router'
import { AssetProfilePage } from '@/features/asset-intake'

export const Route = createFileRoute('/_authenticated/assets/ledger/$assetId/profile')({
  component: () => {
    const { assetId } = Route.useParams()
    return <AssetProfilePage assetId={assetId} />
  },
})
