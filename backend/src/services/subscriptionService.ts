/**
 * Subscription Service
 * Handles subscription management, billing, and plan operations
 */

import { db, getDbType } from '../database';
import { eq, and, desc, sql } from 'drizzle-orm';
import logger from '../logger';
import { v4 as uuidv4 } from 'uuid';

// Import tables based on database type
function getTables() {
  const dbType = getDbType();
  // SQLite (Docker single-container) uses the same subscription_* schema as MySQL migrations.
  if (dbType === 'mysql' || dbType === 'sqlite') {
    const mysqlTables = require('../database/tables-mysql');
    return {
      subscriptionPlansTable: mysqlTables.subscriptionPlansTable,
      organizationSubscriptionsTable: mysqlTables.organizationSubscriptionsTable,
      organizationsTable: mysqlTables.organizationsTable,
      usersTable: mysqlTables.usersTable,
      teamsTable: mysqlTables.teamsTable,
    };
  }
  const pgTables = require('../database/tables-enterprise');
  return {
    subscriptionPlansTable: pgTables.subscriptionPlansTable,
    organizationSubscriptionsTable: pgTables.organizationSubscriptionsTable,
    organizationsTable: pgTables.organizationsTable,
    usersTable: pgTables.usersTable,
    teamsTable: pgTables.teamsTable,
  };
}

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
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationSubscription {
  id: string;
  organizationId: string;
  planId: string;
  billingCycle: 'monthly' | 'quarterly' | 'yearly' | 'one_time';
  status: 'active' | 'canceled' | 'expired' | 'past_due' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  price: number;
  currency: string;
  paymentMethodId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class SubscriptionService {
  /**
   * Get all available subscription plans
   */
  async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      const { subscriptionPlansTable } = getTables();

      const plans = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.enabled, true));

      // Sort plans in the correct order: Free, Starter, Professional, Enterprise
      const planOrder = ['free', 'starter', 'professional', 'enterprise', 'custom'];
      const sortedPlans = plans.sort((a, b) => {
        const aIndex = planOrder.indexOf(a.type as string);
        const bIndex = planOrder.indexOf(b.type as string);
        // If type not found in order, put it at the end
        const aOrder = aIndex === -1 ? 999 : aIndex;
        const bOrder = bIndex === -1 ? 999 : bIndex;
        return aOrder - bOrder;
      });

      return sortedPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        type: plan.type as SubscriptionPlan['type'],
        priceMonthly: plan.priceMonthly ? Number(plan.priceMonthly) : undefined,
        priceQuarterly: plan.priceQuarterly ? Number(plan.priceQuarterly) : undefined,
        priceYearly: plan.priceYearly ? Number(plan.priceYearly) : undefined,
        quotas: (plan.quotas as Record<string, number>) || {},
        features: (plan.features as string[]) || [],
        enabled: plan.enabled,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      }));
    } catch (error) {
      logger.error('Get plans error:', error);
      throw error;
    }
  }

  /**
   * Get current subscription for organization
   */
  async getCurrentSubscription(organizationId: string): Promise<OrganizationSubscription | null> {
    try {
      const { organizationSubscriptionsTable } = getTables();

      const [subscription] = await db
        .select()
        .from(organizationSubscriptionsTable)
        .where(
          and(
            eq(organizationSubscriptionsTable.organizationId, organizationId),
            eq(organizationSubscriptionsTable.status, 'active'),
          ),
        )
        .orderBy(desc(organizationSubscriptionsTable.createdAt))
        .limit(1);

      if (!subscription) {
        return null;
      }

      return {
        id: subscription.id,
        organizationId: subscription.organizationId,
        planId: subscription.planId,
        billingCycle: subscription.billingCycle as OrganizationSubscription['billingCycle'],
        status: subscription.status as OrganizationSubscription['status'],
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        price: Number(subscription.price),
        currency: subscription.currency,
        paymentMethodId: subscription.paymentMethodId || undefined,
        metadata: subscription.metadata as Record<string, unknown> | undefined,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
      };
    } catch (error) {
      logger.error('Get current subscription error:', error);
      throw error;
    }
  }

  /**
   * Create new subscription
   */
  async subscribe(
    organizationId: string,
    planId: string,
    billingCycle: 'monthly' | 'quarterly' | 'yearly' | 'one_time',
  ): Promise<OrganizationSubscription> {
    try {
      const { subscriptionPlansTable, organizationSubscriptionsTable } = getTables();

      // Get plan details
      const [plan] = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.id, planId))
        .limit(1);

      if (!plan) {
        throw new Error('Subscription plan not found');
      }

      if (!plan.enabled) {
        throw new Error('Subscription plan is not available');
      }

      // Calculate price based on billing cycle
      let price = 0;
      if (billingCycle === 'monthly' && plan.priceMonthly) {
        price = Number(plan.priceMonthly);
      } else if (billingCycle === 'quarterly' && plan.priceQuarterly) {
        price = Number(plan.priceQuarterly);
      } else if (billingCycle === 'yearly' && plan.priceYearly) {
        price = Number(plan.priceYearly);
      } else if (billingCycle === 'one_time') {
        price = plan.priceMonthly ? Number(plan.priceMonthly) : 0;
      }

      // Calculate period dates
      const now = new Date();
      const currentPeriodStart = now;
      let currentPeriodEnd = new Date(now);

      if (billingCycle === 'monthly') {
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
      } else if (billingCycle === 'quarterly') {
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 3);
      } else if (billingCycle === 'yearly') {
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
      } else {
        // one_time — `current_period_end` is MySQL TIMESTAMP (max ~2038-01-19 UTC); do not use +100y.
        currentPeriodEnd = new Date(Date.UTC(2037, 11, 31, 23, 59, 59));
      }

      // Cancel existing active subscription
      await db
        .update(organizationSubscriptionsTable)
        .set({
          status: 'canceled',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationSubscriptionsTable.organizationId, organizationId),
            eq(organizationSubscriptionsTable.status, 'active'),
          ),
        );

      // Create new subscription
      const subscriptionId = uuidv4();
      await db.insert(organizationSubscriptionsTable).values({
        id: subscriptionId,
        organizationId,
        planId,
        billingCycle,
        status: 'active',
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        price: price.toString(),
        currency: 'USD',
        metadata: {},
        createdAt: now,
        updatedAt: now,
      });

      // TODO: Integrate with payment provider (Stripe, etc.)
      // await paymentService.processPayment(organizationId, price, billingCycle);

      logger.info(`Subscription created: ${organizationId} -> ${planId} (${billingCycle})`);

      const subscription = await this.getCurrentSubscription(organizationId);
      if (!subscription) {
        throw new Error('Failed to create subscription');
      }

      return subscription;
    } catch (error) {
      logger.error('Subscribe error:', error);
      throw error;
    }
  }

  /**
   * Change subscription plan
   */
  async changePlan(organizationId: string, newPlanId: string): Promise<OrganizationSubscription> {
    try {
      const currentSubscription = await this.getCurrentSubscription(organizationId);
      if (!currentSubscription) {
        throw new Error('No active subscription found');
      }

      // Create new subscription with same billing cycle
      return await this.subscribe(organizationId, newPlanId, currentSubscription.billingCycle);
    } catch (error) {
      logger.error('Change plan error:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(organizationId: string): Promise<void> {
    try {
      const { organizationSubscriptionsTable } = getTables();

      await db
        .update(organizationSubscriptionsTable)
        .set({
          status: 'canceled',
          cancelAtPeriodEnd: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationSubscriptionsTable.organizationId, organizationId),
            eq(organizationSubscriptionsTable.status, 'active'),
          ),
        );

      logger.info(`Subscription canceled: ${organizationId}`);
    } catch (error) {
      logger.error('Cancel subscription error:', error);
      throw error;
    }
  }

  /**
   * Get billing history
   */
  async getBillingHistory(organizationId: string, limit: number = 50, offset: number = 0) {
    try {
      const { organizationSubscriptionsTable } = getTables();

      const history = await db
        .select()
        .from(organizationSubscriptionsTable)
        .where(eq(organizationSubscriptionsTable.organizationId, organizationId))
        .orderBy(desc(organizationSubscriptionsTable.createdAt))
        .limit(limit)
        .offset(offset);

      return history.map((sub) => ({
        id: sub.id,
        planId: sub.planId,
        billingCycle: sub.billingCycle,
        status: sub.status,
        price: Number(sub.price),
        currency: sub.currency,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        createdAt: sub.createdAt,
      }));
    } catch (error) {
      logger.error('Get billing history error:', error);
      throw error;
    }
  }

  /**
   * Set default free plan for organization
   * If organization has no active subscription, create a free plan subscription
   */
  async setDefaultFreePlan(organizationId: string): Promise<OrganizationSubscription> {
    try {
      // Check if organization already has an active subscription
      const currentSubscription = await this.getCurrentSubscription(organizationId);
      if (currentSubscription) {
        logger.info(
          `Organization ${organizationId} already has an active subscription: ${currentSubscription.planId}`,
        );
        return currentSubscription;
      }

      // Find free plan
      const { subscriptionPlansTable } = getTables();
      const [freePlan] = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.type, 'free'))
        .limit(1);

      if (!freePlan) {
        throw new Error(
          'Free plan not found. Please ensure the free plan is seeded in the database.',
        );
      }

      logger.info(`Setting default free plan for organization ${organizationId}`);

      // Create free plan subscription
      return await this.subscribe(organizationId, freePlan.id, 'monthly');
    } catch (error) {
      logger.error('Set default free plan error:', error);
      throw error;
    }
  }

  /**
   * Assign the Enterprise plan to the organization (cancels any active subscription first).
   * Intended for development / internal demos; uses the same subscribe path as upgrades.
   */
  async setEnterprisePlan(organizationId: string): Promise<OrganizationSubscription> {
    try {
      const { subscriptionPlansTable } = getTables();
      const [enterprisePlan] = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.type, 'enterprise'))
        .limit(1);

      if (!enterprisePlan) {
        throw new Error(
          'Enterprise plan not found. Seed subscription_plans with type enterprise first.',
        );
      }
      if (!enterprisePlan.enabled) {
        throw new Error('Enterprise plan is disabled');
      }

      logger.info(`Setting enterprise plan for organization ${organizationId}`);
      return await this.subscribe(organizationId, enterprisePlan.id, 'one_time');
    } catch (error) {
      logger.error('Set enterprise plan error:', error);
      throw error;
    }
  }

  /**
   * Get all trial accounts (Free plan subscriptions)
   * Returns organizations with Free plan subscriptions and their details
   */
  async getTrialAccounts(): Promise<
    Array<{
      subscription: OrganizationSubscription;
      organization: {
        id: string;
        name: string;
        slug: string;
        status: string | null;
      };
      plan: {
        id: string;
        name: string;
        type: string;
        quotas: Record<string, number>;
      };
      userCount: number;
      teamCount: number;
      daysRemaining: number | null;
      isExpired: boolean;
    }>
  > {
    try {
      const {
        subscriptionPlansTable,
        organizationSubscriptionsTable,
        organizationsTable,
        usersTable,
        teamsTable,
      } = getTables();

      // Find Free plan
      const [freePlan] = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.type, 'free'))
        .limit(1);

      if (!freePlan) {
        return [];
      }

      // Get all Free plan subscriptions with organization details
      const trialSubscriptions = await db
        .select({
          subscription: organizationSubscriptionsTable,
          organization: {
            id: organizationsTable.id,
            name: organizationsTable.name,
            slug: organizationsTable.slug,
            status: organizationsTable.status,
          },
        })
        .from(organizationSubscriptionsTable)
        .innerJoin(
          organizationsTable,
          eq(organizationSubscriptionsTable.organizationId, organizationsTable.id),
        )
        .where(eq(organizationSubscriptionsTable.planId, freePlan.id))
        .orderBy(organizationSubscriptionsTable.createdAt);

      // Get additional details for each subscription
      const result = await Promise.all(
        trialSubscriptions.map(async (item) => {
          const orgId = item.organization.id;
          const subscription = item.subscription;

          // Count users
          const [userCount] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(usersTable)
            .where(eq(usersTable.organizationId, orgId));

          // Count teams
          const [teamCount] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(teamsTable)
            .where(eq(teamsTable.organizationId, orgId));

          // Calculate days remaining
          const now = new Date();
          const periodEnd = subscription.currentPeriodEnd
            ? new Date(subscription.currentPeriodEnd)
            : null;
          const isExpired = periodEnd ? periodEnd < now : false;
          const daysRemaining = periodEnd
            ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            : null;

          return {
            subscription: {
              id: subscription.id,
              organizationId: subscription.organizationId,
              planId: subscription.planId,
              billingCycle: subscription.billingCycle as OrganizationSubscription['billingCycle'],
              status: subscription.status as OrganizationSubscription['status'],
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              price: Number(subscription.price),
              currency: subscription.currency,
              paymentMethodId: subscription.paymentMethodId || undefined,
              metadata: subscription.metadata as Record<string, unknown> | undefined,
              createdAt: subscription.createdAt,
              updatedAt: subscription.updatedAt,
            },
            organization: item.organization,
            plan: {
              id: freePlan.id,
              name: freePlan.name,
              type: freePlan.type,
              quotas: (freePlan.quotas as Record<string, number>) || {},
            },
            userCount: Number(userCount?.count || 0),
            teamCount: Number(teamCount?.count || 0),
            daysRemaining,
            isExpired,
          };
        }),
      );

      return result;
    } catch (error) {
      logger.error('Get trial accounts error:', error);
      throw error;
    }
  }
}

export const subscriptionService = new SubscriptionService();
