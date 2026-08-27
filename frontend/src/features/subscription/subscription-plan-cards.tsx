import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SubscriptionTierId } from './resolve-tier';
import {
  SUBSCRIPTION_TIERS,
  type FeatureAvailability,
  type SubscriptionTierConfig,
  type TierCtaAction,
} from './subscription-tiers';

export interface SubscriptionPlanCardsProps {
  activeTierId: SubscriptionTierId | null;
  onActivateCommunity: () => void;
  onContactSales: () => void;
  onDevEnterprise: () => void;
  isActivatingCommunity: boolean;
  isApplyingEnterprise: boolean;
}

function ctaLabel(action: TierCtaAction, t: (key: string) => string, tierId: SubscriptionTierId): string {
  switch (action) {
    case 'activateCommunity':
      return t('pages.subscription.activateCommunity');
    case 'contactSales':
      return tierId === 'onPremise' ? t('pages.subscription.contactUs') : t('pages.subscription.contactSales');
    case 'devEnterprise':
      return t('pages.subscription.devUseEnterprise');
    default:
      return t('pages.subscription.contactSales');
  }
}

function availabilityBadgeVariant(
  availability: FeatureAvailability,
): 'default' | 'secondary' | 'outline' {
  switch (availability) {
    case 'preview':
      return 'secondary';
    case 'roadmap':
    case 'delivery':
      return 'outline';
    default:
      return 'outline';
  }
}

function AvailabilityBadge({ availability }: { availability: FeatureAvailability }) {
  const { t } = useTranslation();
  if (availability === 'now' || availability === 'roadmap') {
    return null;
  }
  return (
    <Badge variant={availabilityBadgeVariant(availability)} className="shrink-0 text-[10px] font-normal">
      {t(`pages.subscription.availability.${availability}`)}
    </Badge>
  );
}

function TierCard({
  tier,
  props,
}: {
  tier: SubscriptionTierConfig;
  props: SubscriptionPlanCardsProps;
}) {
  const { t } = useTranslation();
  const tierId = tier.id;
  const prefix = `pages.subscription.tiers.${tierId}`;
  const isCurrent = props.activeTierId === tierId;

  const handlePrimary = () => {
    switch (tier.primaryCta) {
      case 'activateCommunity':
        props.onActivateCommunity();
        break;
      case 'contactSales':
        props.onContactSales();
        break;
      default:
        break;
    }
  };

  const handleSecondary = () => {
    if (tier.secondaryCta === 'devEnterprise') {
      props.onDevEnterprise();
    }
  };

  const primaryDisabled =
    (tier.primaryCta === 'activateCommunity' && props.isActivatingCommunity) ||
    (tier.primaryCta === 'activateCommunity' && isCurrent);

  const secondaryDisabled =
    tier.secondaryCta === 'devEnterprise' &&
    (props.isApplyingEnterprise || props.activeTierId === 'enterprise');

  const primaryLoading =
    tier.primaryCta === 'activateCommunity' && props.isActivatingCommunity;

  return (
    <Card
      className={cn(
        'flex h-full flex-col',
        isCurrent && 'border-primary shadow-md ring-1 ring-primary/20',
      )}
    >
      <CardHeader className="space-y-3 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-xl">{t(`${prefix}.name`)}</CardTitle>
          <Badge variant="secondary" className="font-normal">
            {t(`${prefix}.price`)}
          </Badge>
          {isCurrent && <Badge>{t('pages.subscription.currentBadge')}</Badge>}
        </div>
        <CardDescription className="text-sm leading-relaxed">
          {t(`${prefix}.description`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-1 flex-col gap-4">
          {tier.featureGroups.map((group) => (
            <div key={group.groupKey} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t(`pages.subscription.tiers.groups.${group.groupKey}`)}
              </p>
              <ul className="flex flex-col gap-2">
                {group.features.map((feature) => (
                  <li
                    key={feature.featureKey}
                    className="flex items-start justify-between gap-2 rounded-lg bg-muted/80 px-3 py-2.5 text-sm text-foreground/90"
                  >
                    <span className="min-w-0 flex-1">
                      {t(`${prefix}.features.${feature.featureKey}`)}
                    </span>
                    <AvailabilityBadge availability={feature.availability} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            className="w-full"
            variant={isCurrent ? 'default' : 'outline'}
            onClick={handlePrimary}
            disabled={primaryDisabled}
          >
            {primaryLoading ? t('pages.subscription.activating') : ctaLabel(tier.primaryCta, t, tierId)}
          </Button>
          {tier.secondaryCta && props.activeTierId !== 'enterprise' && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={handleSecondary}
              disabled={secondaryDisabled}
            >
              {props.isApplyingEnterprise
                ? t('pages.subscription.applying')
                : ctaLabel(tier.secondaryCta, t, tierId)}
            </Button>
          )}
          {tier.secondaryCta && props.activeTierId !== 'enterprise' && (
            <p className="text-center text-[11px] leading-snug text-muted-foreground">
              {t('pages.subscription.devEnterpriseHint')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SubscriptionPlanCards(props: SubscriptionPlanCardsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {SUBSCRIPTION_TIERS.map((tier) => (
        <TierCard key={tier.id} tier={tier} props={props} />
      ))}
    </div>
  );
}
