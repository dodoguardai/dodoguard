import apiClient, { handleApiResponse } from './client';
import { ApiResponse } from '@/types/api';

export interface SubscriptionPlan {
  id: string;
  name: string;
  type: 'free' | 'starter' | 'professional' | 'enterprise' | 'custom';
  priceMonthly?: number;
  priceQuarterly?: number;
  priceYearly?: number;
  quotas: Record<string, number>;
  features: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentSubscription {
  id: string;
  organizationId: string;
  planId: string;
  billingCycle: 'monthly' | 'quarterly' | 'yearly' | 'one_time';
  status: 'active' | 'canceled' | 'expired' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  price: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export const subscriptionApi = {
  getPlans: async (): Promise<SubscriptionPlan[]> => {
    const response = await apiClient.get<ApiResponse<SubscriptionPlan[]>>('/subscription/plans');
    return handleApiResponse(response.data);
  },
  getCurrent: async (organizationId: string): Promise<CurrentSubscription | null> => {
    const response = await apiClient.get<ApiResponse<CurrentSubscription | null>>(
      '/subscription/current',
      {
        params: { organizationId },
      },
    );
    return handleApiResponse(response.data);
  },
  subscribe: async (planId: string, billingCycle: string): Promise<CurrentSubscription> => {
    const response = await apiClient.post<ApiResponse<CurrentSubscription>>(
      '/subscription/subscribe',
      {
        planId,
        billingCycle,
      },
    );
    return handleApiResponse(response.data);
  },
  changePlan: async (planId: string): Promise<CurrentSubscription> => {
    const response = await apiClient.put<ApiResponse<CurrentSubscription>>(
      '/subscription/change-plan',
      {
        planId,
      },
    );
    return handleApiResponse(response.data);
  },
  cancel: async (): Promise<void> => {
    const response = await apiClient.post<ApiResponse<null>>('/subscription/cancel');
    handleApiResponse(response.data);
  },
  getBillingHistory: async (limit?: number, offset?: number): Promise<BillingHistoryItem[]> => {
    const response = await apiClient.get<ApiResponse<BillingHistoryItem[]>>(
      '/subscription/billing-history',
      {
        params: { limit, offset },
      },
    );
    return handleApiResponse(response.data);
  },
  setFreePlan: async (): Promise<CurrentSubscription> => {
    const response = await apiClient.post<ApiResponse<CurrentSubscription>>(
      '/subscription/set-free-plan',
    );
    return handleApiResponse(response.data);
  },
  /** Dev/demo: assign Enterprise plan to the signed-in organization (replaces active subscription). */
  setEnterprisePlan: async (): Promise<CurrentSubscription> => {
    const response = await apiClient.post<ApiResponse<CurrentSubscription>>(
      '/subscription/set-enterprise-plan',
    );
    return handleApiResponse(response.data);
  },
};

export interface BillingHistoryItem {
  id: string;
  planId: string;
  billingCycle: string;
  status: string;
  price: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
}
