export type SubscriptionTierId = 'community' | 'enterprise' | 'onPremise';

export type DbPlanType = 'free' | 'starter' | 'professional' | 'enterprise' | 'custom' | string;

/** Maps backend plan.type to marketing tier for UI. */
export function resolveTier(planType: DbPlanType | undefined): SubscriptionTierId | null {
  if (!planType) {
    return null;
  }
  switch (planType) {
    case 'free':
      return 'community';
    case 'enterprise':
      return 'enterprise';
    case 'custom':
      return 'onPremise';
    case 'starter':
    case 'professional':
      return null;
    default:
      return null;
  }
}

export function isLegacyPlanType(planType: DbPlanType | undefined): boolean {
  return planType === 'starter' || planType === 'professional';
}

export function getTierDisplayName(
  tierId: SubscriptionTierId,
  t: (key: string) => string,
): string {
  return t(`pages.subscription.tiers.${tierId}.name`);
}
