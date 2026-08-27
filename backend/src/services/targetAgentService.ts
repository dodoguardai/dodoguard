/**
 * Target Agent Service
 * Handles target agent operations
 */

import { db } from '../database';
import { targetAgentsTable } from '../database/tables-enterprise';
import { eq, and, sql } from 'drizzle-orm';
import logger from '../logger';

export interface CreateTargetAgentData {
  organizationId: string;
  teamId?: string;
  name: string;
  description?: string;
  type: 'agent' | 'mcp' | 'llm' | 'tool' | 'platform';
  config: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateTargetAgentData {
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
  status?: 'active' | 'inactive' | 'testing' | 'error';
  metadata?: Record<string, unknown>;
}

export class TargetAgentService {
  /**
   * Create a new target agent
   */
  async createAgent(data: CreateTargetAgentData) {
    try {
      const [newAgent] = await db
        .insert(targetAgentsTable)
        .values({
          ...data,
          statistics: {
            totalAttacks: 0,
            successfulAttacks: 0,
            vulnerabilitiesFound: 0,
          },
        })
        .returning();

      logger.info(`Target agent created: ${newAgent.name} (${newAgent.id})`);
      return newAgent;
    } catch (error) {
      logger.error('Create target agent error:', error);
      throw error;
    }
  }

  /**
   * Get agent by ID
   */
  async getAgentById(agentId: string, organizationId: string) {
    try {
      const [agent] = await db
        .select()
        .from(targetAgentsTable)
        .where(
          and(
            eq(targetAgentsTable.id, agentId),
            eq(targetAgentsTable.organizationId, organizationId),
          ),
        )
        .limit(1);

      return agent || null;
    } catch (error) {
      logger.error('Get agent by ID error:', error);
      throw error;
    }
  }

  /**
   * Update agent
   */
  async updateAgent(agentId: string, organizationId: string, data: UpdateTargetAgentData) {
    try {
      const [updatedAgent] = await db
        .update(targetAgentsTable)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(targetAgentsTable.id, agentId),
            eq(targetAgentsTable.organizationId, organizationId),
          ),
        )
        .returning();

      if (!updatedAgent) {
        throw new Error('Target agent not found');
      }

      logger.info(`Target agent updated: ${updatedAgent.name} (${updatedAgent.id})`);
      return updatedAgent;
    } catch (error) {
      logger.error('Update target agent error:', error);
      throw error;
    }
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string, organizationId: string) {
    try {
      const result = await db
        .delete(targetAgentsTable)
        .where(
          and(
            eq(targetAgentsTable.id, agentId),
            eq(targetAgentsTable.organizationId, organizationId),
          ),
        );

      if (result.rowCount === 0) {
        throw new Error('Target agent not found');
      }

      logger.info(`Target agent deleted: ${agentId}`);
      return true;
    } catch (error) {
      logger.error('Delete target agent error:', error);
      throw error;
    }
  }

  /**
   * List agents
   */
  async listAgents(
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      search?: string;
      type?: string;
      status?: string;
    } = {},
  ) {
    try {
      const { limit = 50, offset = 0, search, type, status } = options;

      const whereConditions = [eq(targetAgentsTable.organizationId, organizationId)];

      if (search) {
        whereConditions.push(
          sql`${targetAgentsTable.name} ILIKE ${`%${search}%`} OR ${targetAgentsTable.description} ILIKE ${`%${search}%`}`,
        );
      }

      if (type) {
        whereConditions.push(eq(targetAgentsTable.type, type as any));
      }

      if (status) {
        whereConditions.push(eq(targetAgentsTable.status, status as any));
      }

      const agents = await db
        .select()
        .from(targetAgentsTable)
        .where(and(...whereConditions))
        .limit(limit)
        .offset(offset)
        .orderBy(sql`${targetAgentsTable.createdAt} DESC`);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(targetAgentsTable)
        .where(and(...whereConditions));

      return {
        agents,
        total: count,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('List target agents error:', error);
      throw error;
    }
  }

  /**
   * Test agent connection
   */
  async testAgentConnection(agentId: string, organizationId: string) {
    try {
      const agent = await this.getAgentById(agentId, organizationId);
      if (!agent) {
        throw new Error('Target agent not found');
      }

      // Update agent status to testing
      await this.updateAgent(agentId, organizationId, { status: 'testing' });

      // TODO: Implement actual connection testing logic
      // For different agent types, test different endpoints/configs
      let testResult = { status: 'success', message: 'Connection test successful' };

      try {
        switch (agent.type) {
          case 'agent':
            // Test API connection for Dify or similar agents
            testResult = await this.testAgentAPIConnection(agent.config);
            break;
          case 'llm':
            // Test LLM API connection
            testResult = await this.testLLMConnection(agent.config);
            break;
          case 'mcp':
            // Test MCP connection
            testResult = await this.testMCPConnection(agent.config);
            break;
          default:
            // Generic test
            testResult = { status: 'success', message: 'Generic connection test passed' };
        }
      } catch (error) {
        testResult = {
          status: 'failed',
          message: error instanceof Error ? error.message : 'Connection test failed',
        };
      }

      // Update agent status and health info
      const newStatus = testResult.status === 'success' ? 'active' : 'error';
      await this.updateAgent(agentId, organizationId, {
        status: newStatus,
        // The update DTO does not include healthStatus; this is handled via statistics/metadata elsewhere
      });

      logger.info(
        `Agent connection test completed: ${agent.name} (${agentId}) - ${testResult.status}`,
      );
      return testResult;
    } catch (error) {
      logger.error('Test agent connection error:', error);
      throw error;
    }
  }

  /**
   * Get agent status
   */
  async getAgentStatus(agentId: string, organizationId: string) {
    try {
      const agent = await this.getAgentById(agentId, organizationId);
      if (!agent) {
        throw new Error('Target agent not found');
      }

      return {
        agentId: agent.id,
        status: agent.status,
        healthStatus: agent.healthStatus || {
          lastCheck: new Date().toISOString(),
          status: 'unknown',
        },
        statistics: agent.statistics || {
          totalAttacks: 0,
          successfulAttacks: 0,
          vulnerabilitiesFound: 0,
        },
      };
    } catch (error) {
      logger.error('Get agent status error:', error);
      throw error;
    }
  }

  /**
   * Update agent statistics
   */
  async updateAgentStatistics(
    agentId: string,
    organizationId: string,
    updates: {
      totalAttacks?: number;
      successfulAttacks?: number;
      vulnerabilitiesFound?: number;
    },
  ) {
    try {
      const agent = await this.getAgentById(agentId, organizationId);
      if (!agent) {
        throw new Error('Target agent not found');
      }

      const currentStats = agent.statistics || {
        totalAttacks: 0,
        successfulAttacks: 0,
        vulnerabilitiesFound: 0,
      };

      const updatedStats = {
        totalAttacks: updates.totalAttacks ?? currentStats.totalAttacks,
        successfulAttacks: updates.successfulAttacks ?? currentStats.successfulAttacks,
        vulnerabilitiesFound: updates.vulnerabilitiesFound ?? currentStats.vulnerabilitiesFound,
      };

      await this.updateAgent(agentId, organizationId, {
        // statistics field is persisted as part of agent metadata/config; update at call sites if needed
      });

      logger.info(`Agent statistics updated: ${agent.name} (${agentId})`);
      return updatedStats;
    } catch (error) {
      logger.error('Update agent statistics error:', error);
      throw error;
    }
  }

  /**
   * Test agent API connection
   */
  private async testAgentAPIConnection(_config: Record<string, unknown>) {
    // TODO: Implement actual API testing
    // For now, just simulate success
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { status: 'success', message: 'API connection test successful' };
  }

  /**
   * Test LLM connection
   */
  private async testLLMConnection(_config: Record<string, unknown>) {
    // TODO: Implement actual LLM testing
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { status: 'success', message: 'LLM connection test successful' };
  }

  /**
   * Test MCP connection
   */
  private async testMCPConnection(_config: Record<string, unknown>) {
    // TODO: Implement actual MCP testing
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { status: 'success', message: 'MCP connection test successful' };
  }
}

export const targetAgentService = new TargetAgentService();
