/**
 * Script to check trial accounts (Free plan subscriptions) in the system
 */

import { db, getDbType } from '../backend/src/database';
import { eq, and, sql } from 'drizzle-orm';

// Import tables based on database type
function getTables() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../backend/src/database/tables-mysql');
    return {
      organizationsTable: mysqlTables.organizationsTable,
      subscriptionPlansTable: mysqlTables.subscriptionPlansTable,
      organizationSubscriptionsTable: mysqlTables.organizationSubscriptionsTable,
      usersTable: mysqlTables.usersTable,
      teamsTable: mysqlTables.teamsTable,
    };
  } else {
    const pgTables = require('../backend/src/database/tables-enterprise');
    return {
      organizationsTable: pgTables.organizationsTable,
      subscriptionPlansTable: pgTables.subscriptionPlansTable,
      organizationSubscriptionsTable: pgTables.organizationSubscriptionsTable,
      usersTable: pgTables.usersTable,
      teamsTable: pgTables.teamsTable,
    };
  }
}

async function checkTrialAccounts() {
  try {
    const {
      organizationsTable,
      subscriptionPlansTable,
      organizationSubscriptionsTable,
      usersTable,
      teamsTable,
    } = getTables();

    console.log('\n=== 体验账户查询 ===\n');

    // Find Free plan
    const [freePlan] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.type, 'free'))
      .limit(1);

    if (!freePlan) {
      console.log('❌ 未找到 Free 套餐');
      return;
    }

    console.log(`✅ Free 套餐信息:`);
    console.log(`   ID: ${freePlan.id}`);
    console.log(`   名称: ${freePlan.name}`);
    console.log(`   类型: ${freePlan.type}`);
    console.log(`   配额: ${JSON.stringify(freePlan.quotas, null, 2)}`);
    console.log('');

    // Find all organizations with Free plan subscriptions
    const trialSubscriptions = await db
      .select({
        subscriptionId: organizationSubscriptionsTable.id,
        organizationId: organizationSubscriptionsTable.organizationId,
        planId: organizationSubscriptionsTable.planId,
        status: organizationSubscriptionsTable.status,
        currentPeriodStart: organizationSubscriptionsTable.currentPeriodStart,
        currentPeriodEnd: organizationSubscriptionsTable.currentPeriodEnd,
        createdAt: organizationSubscriptionsTable.createdAt,
        organizationName: organizationsTable.name,
        organizationSlug: organizationsTable.slug,
        organizationStatus: organizationsTable.status,
      })
      .from(organizationSubscriptionsTable)
      .innerJoin(
        organizationsTable,
        eq(organizationSubscriptionsTable.organizationId, organizationsTable.id),
      )
      .where(eq(organizationSubscriptionsTable.planId, freePlan.id))
      .orderBy(organizationSubscriptionsTable.createdAt);

    console.log(`📊 找到 ${trialSubscriptions.length} 个体验账户订阅\n`);

    if (trialSubscriptions.length === 0) {
      console.log('目前没有体验账户');
      return;
    }

    // Get detailed information for each trial account
    for (const sub of trialSubscriptions) {
      const orgId = sub.organizationId;

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

      // Check if subscription is active
      const isActive = sub.status === 'active';
      const now = new Date();
      const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
      const isExpired = periodEnd ? periodEnd < now : false;
      const daysRemaining = periodEnd
        ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : null;

      console.log('─'.repeat(80));
      console.log(`组织名称: ${sub.organizationName}`);
      console.log(`组织 Slug: ${sub.organizationSlug}`);
      console.log(`组织 ID: ${orgId}`);
      console.log(`组织状态: ${sub.organizationStatus || 'N/A'}`);
      console.log(`订阅 ID: ${sub.subscriptionId}`);
      console.log(`订阅状态: ${sub.status} ${isActive && !isExpired ? '✅' : '❌'}`);
      console.log(
        `创建时间: ${sub.createdAt ? new Date(sub.createdAt).toLocaleString('zh-CN') : 'N/A'}`,
      );
      console.log(
        `周期开始: ${sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleString('zh-CN') : 'N/A'}`,
      );
      console.log(`周期结束: ${periodEnd ? periodEnd.toLocaleString('zh-CN') : 'N/A'}`);
      if (daysRemaining !== null) {
        console.log(`剩余天数: ${daysRemaining} 天 ${isExpired ? '(已过期)' : ''}`);
      }
      console.log(`用户数量: ${Number(userCount?.count || 0)}`);
      console.log(`团队数量: ${Number(teamCount?.count || 0)}`);
      console.log('');
    }

    // Summary statistics
    console.log('─'.repeat(80));
    console.log('\n📈 统计信息:');
    const activeCount = trialSubscriptions.filter((s) => s.status === 'active').length;
    const expiredCount = trialSubscriptions.filter((s) => {
      if (!s.currentPeriodEnd) return false;
      return new Date(s.currentPeriodEnd) < new Date();
    }).length;
    const canceledCount = trialSubscriptions.filter((s) => s.status === 'canceled').length;

    console.log(`   总订阅数: ${trialSubscriptions.length}`);
    console.log(`   活跃订阅: ${activeCount}`);
    console.log(`   已过期: ${expiredCount}`);
    console.log(`   已取消: ${canceledCount}`);
    console.log('');
  } catch (error: any) {
    console.error('❌ 查询错误:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
checkTrialAccounts()
  .then(() => {
    console.log('\n✅ 查询完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
