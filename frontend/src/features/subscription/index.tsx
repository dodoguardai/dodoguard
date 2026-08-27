/**
 * Subscription Management Page — Community / Enterprise / On-Premise tiers
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { subscriptionApi } from '@/services/api/subscription';
import { useOrganizationStore } from '@/stores/organization-store';
import { isLegacyPlanType, resolveTier } from './resolve-tier';
import { SubscriptionPlanCards } from './subscription-plan-cards';
import { SUBSCRIPTION_SALES_EMAIL } from './subscription-tiers';

const SUBSCRIPTION_QUERY_OPTIONS = {
  retry: false,
  staleTime: 60_000,
} as const;

export function Subscription() {
  const queryClient = useQueryClient();
  const { currentOrg } = useOrganizationStore();
  const { t } = useTranslation();

  const { data: currentSubscription } = useQuery({
    queryKey: ['subscription', 'current', currentOrg?.id],
    queryFn: () => subscriptionApi.getCurrent(currentOrg!.id),
    enabled: !!currentOrg,
    ...SUBSCRIPTION_QUERY_OPTIONS,
  });

  const { data: plans } = useQuery({
    queryKey: ['subscription', 'plans'],
    queryFn: () => subscriptionApi.getPlans(),
    ...SUBSCRIPTION_QUERY_OPTIONS,
  });

  const setFreePlanMutation = useMutation({
    mutationFn: () => subscriptionApi.setFreePlan(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
      toast.success(t('pages.subscription.communityActivated'));
    },
    onError: (error: Error) => {
      toast.error(`${t('pages.subscription.activateFailed')}: ${error.message}`);
    },
  });

  const setEnterprisePlanMutation = useMutation({
    mutationFn: () => subscriptionApi.setEnterprisePlan(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
      toast.success(t('pages.subscription.enterpriseActivated'));
    },
    onError: (error: Error) => {
      toast.error(`${t('pages.subscription.enterpriseFailed')}: ${error.message}`);
    },
  });

  const getPlanType = (planId: string): string => {
    const plan = plans?.find((p) => p.id === planId);
    return plan?.type || 'unknown';
  };

  const getPlanName = (planId: string): string => {
    const plan = plans?.find((p) => p.id === planId);
    return plan?.name || planId;
  };

  const currentPlanType = currentSubscription
    ? getPlanType(currentSubscription.planId)
    : undefined;
  const activeTierId = resolveTier(currentPlanType);
  const legacyPlan = isLegacyPlanType(currentPlanType);

  const handleContactSales = async () => {
    try {
      await navigator.clipboard.writeText(SUBSCRIPTION_SALES_EMAIL);
      toast.success(
        t('pages.subscription.contactSalesCopied', { email: SUBSCRIPTION_SALES_EMAIL }),
      );
    } catch {
      toast.info(t('pages.subscription.contactSalesHint'), {
        description: SUBSCRIPTION_SALES_EMAIL,
      });
    }
  };

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('pages.subscription.title')}</h2>
          <p className="text-muted-foreground">{t('pages.subscription.subtitle')}</p>
        </div>

        <div className="space-y-6">
          {legacyPlan && currentSubscription ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {t('pages.subscription.legacyPlanNotice', {
                planName: getPlanName(currentSubscription.planId),
              })}
            </p>
          ) : null}

          <SubscriptionPlanCards
            activeTierId={activeTierId}
            onActivateCommunity={() => setFreePlanMutation.mutate()}
            onContactSales={() => void handleContactSales()}
            onDevEnterprise={() => setEnterprisePlanMutation.mutate()}
            isActivatingCommunity={setFreePlanMutation.isPending}
            isApplyingEnterprise={setEnterprisePlanMutation.isPending}
          />
        </div>
      </Main>
    </>
  );
}
