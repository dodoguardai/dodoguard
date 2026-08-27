/**
 * Teams API Routes
 */

import express from 'express';
import { z } from 'zod';
import { db, getDbType } from '../../../../database';
import { eq, and, desc, or, like, sql, inArray } from 'drizzle-orm';
import logger from '../../../../logger';
import { v4 as uuidv4 } from 'uuid';
import { quotaService } from '../../../../services/quotaService';

// Import tables based on database type (lazy load)
let teamsTable: any;
function getTeamsTable() {
  if (!teamsTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      teamsTable = mysqlTables.teamsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      teamsTable = pgTables.teamsTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      teamsTable = sqliteTables.teamsTable;
    }
  }
  return teamsTable;
}

const router = express.Router();

// Create team schema
const createTeamSchema = z.object({
  name: z.string().min(1),
  logo: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Update team schema
const updateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  logo: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/v1/teams
 * List teams
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }

    const table = getTeamsTable();
    if (!table) {
      logger.error('teamsTable is undefined');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    let query = db.select().from(table);

    // Apply filters
    const conditions: any[] = [];

    conditions.push(eq(table.organizationId, organizationId));

    if (search && typeof search === 'string') {
      conditions.push(or(like(table.name, `%${search}%`), like(table.description, `%${search}%`)));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    const teams = await query.orderBy(desc(table.createdAt)).limit(limitNum).offset(offsetNum);

    // Get organizations and user_teams tables for joins
    const dbType = getDbType();
    let organizationsTable: any;
    let userTeamsTable: any;
    let usersTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      organizationsTable = mysqlTables.organizationsTable;
      userTeamsTable = mysqlTables.userTeamsTable;
      usersTable = mysqlTables.usersTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      organizationsTable = pgTables.organizationsTable;
      userTeamsTable = pgTables.userTeamsTable;
      usersTable = pgTables.usersTable;
    }

    // Parse JSON fields and enrich with organization and members info
    const parsedTeams = await Promise.all(
      teams.map(async (team) => {
        const parsed: any = {
          ...team,
          metadata: team.metadata
            ? typeof team.metadata === 'string'
              ? JSON.parse(team.metadata)
              : team.metadata
            : null,
        };

        // Get organization info
        if (organizationsTable) {
          try {
            const [org] = await db
              .select({ id: organizationsTable.id, name: organizationsTable.name })
              .from(organizationsTable)
              .where(eq(organizationsTable.id, team.organizationId))
              .limit(1);
            if (org) {
              parsed.organization = org;
            }
          } catch (error) {
            logger.error('Error fetching organization for team:', error);
          }
        }

        // Get team members
        if (userTeamsTable && usersTable) {
          try {
            // Get all team members
            const teamMembers = await db
              .select({
                userId: userTeamsTable.userId,
                role: userTeamsTable.role,
                joinedAt: userTeamsTable.joinedAt,
              })
              .from(userTeamsTable)
              .where(eq(userTeamsTable.teamId, team.id));

            // Get user details for all members at once
            if (teamMembers.length > 0) {
              const userIds = teamMembers.map((m: any) => m.userId);
              const users = await db
                .select({
                  id: usersTable.id,
                  name: usersTable.name,
                  email: usersTable.email,
                  avatar: usersTable.avatar,
                })
                .from(usersTable)
                .where(inArray(usersTable.id, userIds));

              // Map members with user info
              const userMap = new Map(users.map((u: any) => [u.id, u]));
              const membersWithUsers = teamMembers.map((m: any) => ({
                userId: m.userId,
                role: m.role,
                joinedAt: m.joinedAt,
                user: userMap.get(m.userId) || { id: m.userId, name: '', email: '', avatar: null },
              }));

              parsed.members = membersWithUsers;
              parsed.memberCount = membersWithUsers.length;
            } else {
              parsed.members = [];
              parsed.memberCount = 0;
            }
          } catch (error: any) {
            logger.error('Error fetching members for team:', {
              error: error?.message || String(error),
              code: error?.code,
              sql: error?.sql,
              sqlMessage: error?.sqlMessage,
              teamId: team.id,
            });
            parsed.members = [];
            parsed.memberCount = 0;
          }
        } else {
          parsed.members = [];
          parsed.memberCount = 0;
        }

        return parsed;
      }),
    );

    // Get total count
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(table);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions));
    }
    const [{ count: total }] = await countQuery;

    res.json({
      success: true,
      data: {
        data: parsedTeams,
        total: Number(total),
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < Number(total),
      },
    });
  } catch (error) {
    logger.error('List teams error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list teams',
      },
    });
  }
});

/**
 * GET /api/v1/teams/:id
 * Get team by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const table = getTeamsTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    const conditions: any[] = [eq(table.id, id)];
    if (organizationId) {
      conditions.push(eq(table.organizationId, organizationId));
    }

    const [team] = await db
      .select()
      .from(table)
      .where(and(...conditions))
      .limit(1);

    if (!team) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Team not found' },
      });
    }

    // Get organizations and user_teams tables for joins
    const dbType = getDbType();
    let organizationsTable: any;
    let userTeamsTable: any;
    let usersTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      organizationsTable = mysqlTables.organizationsTable;
      userTeamsTable = mysqlTables.userTeamsTable;
      usersTable = mysqlTables.usersTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      organizationsTable = pgTables.organizationsTable;
      userTeamsTable = pgTables.userTeamsTable;
      usersTable = pgTables.usersTable;
    }

    // Parse JSON fields and enrich with organization and members info
    const parsedTeam: any = {
      ...team,
      metadata: team.metadata
        ? typeof team.metadata === 'string'
          ? JSON.parse(team.metadata)
          : team.metadata
        : null,
    };

    // Get organization info
    if (organizationsTable) {
      try {
        const [org] = await db
          .select({ id: organizationsTable.id, name: organizationsTable.name })
          .from(organizationsTable)
          .where(eq(organizationsTable.id, team.organizationId))
          .limit(1);
        if (org) {
          parsedTeam.organization = org;
        }
      } catch (error) {
        logger.error('Error fetching organization for team:', error);
      }
    }

    // Get team members
    if (userTeamsTable && usersTable) {
      try {
        logger.debug(`Fetching members for team ${team.id}`);
        // Get all team members
        const teamMembers = await db
          .select({
            userId: userTeamsTable.userId,
            role: userTeamsTable.role,
            joinedAt: userTeamsTable.joinedAt,
          })
          .from(userTeamsTable)
          .where(eq(userTeamsTable.teamId, team.id));

        logger.debug(`Found ${teamMembers.length} team members in user_teams table`);

        // Get user details for all members at once
        if (teamMembers.length > 0) {
          const userIds = teamMembers.map((m: any) => m.userId);
          logger.debug(`Fetching user details for user IDs: ${userIds.join(', ')}`);

          const users = await db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              email: usersTable.email,
              avatar: usersTable.avatar,
            })
            .from(usersTable)
            .where(inArray(usersTable.id, userIds));

          logger.debug(`Found ${users.length} user records`);

          // Map members with user info
          const userMap = new Map(users.map((u: any) => [u.id, u]));
          const membersWithUsers = teamMembers.map((m: any) => ({
            userId: m.userId,
            role: m.role,
            joinedAt: m.joinedAt,
            user: userMap.get(m.userId) || { id: m.userId, name: '', email: '', avatar: null },
          }));

          logger.debug(`Mapped ${membersWithUsers.length} members with user info`);
          parsedTeam.members = membersWithUsers;
          parsedTeam.memberCount = membersWithUsers.length;
        } else {
          logger.debug('No team members found in user_teams table');
          parsedTeam.members = [];
          parsedTeam.memberCount = 0;
        }
      } catch (error: any) {
        logger.error('Error fetching members for team:', {
          error: error.message,
          code: error.code,
          sql: error.sql,
          teamId: team.id,
        });
        parsedTeam.members = [];
        parsedTeam.memberCount = 0;
      }
    } else {
      logger.warn('userTeamsTable or usersTable not available, cannot fetch team members');
      parsedTeam.members = [];
      parsedTeam.memberCount = 0;
    }

    res.json({
      success: true,
      data: parsedTeam,
    });
  } catch (error) {
    logger.error('Get team error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get team',
      },
    });
  }
});

/**
 * POST /api/v1/teams
 * Create new team
 */
router.post('/', async (req, res) => {
  try {
    const _userId = req.user?.id;
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }

    const teamData = createTeamSchema.parse(req.body);

    const table = getTeamsTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Check quota before creating team
    try {
      const quotaCheck = await quotaService.checkQuota(organizationId, 'teams', 1);
      if (!quotaCheck.allowed) {
        logger.warn(
          `Quota exceeded for organization ${organizationId}: teams ${quotaCheck.currentUsage}/${quotaCheck.limit}`,
        );
        return res.status(403).json({
          success: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: `团队数量配额已满。当前使用: ${quotaCheck.currentUsage}/${quotaCheck.limit === -1 ? '无限制' : quotaCheck.limit}。请升级套餐或删除现有团队。`,
            details: {
              metric: 'teams',
              currentUsage: quotaCheck.currentUsage,
              limit: quotaCheck.limit,
              remaining: quotaCheck.remaining,
            },
          },
        });
      }
      logger.info(
        `Quota check passed: teams ${quotaCheck.currentUsage + 1}/${quotaCheck.limit === -1 ? 'unlimited' : quotaCheck.limit}`,
      );
    } catch (quotaError: any) {
      logger.error('Quota check error:', quotaError);
      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTA_CHECK_FAILED',
          message: '配额检查失败，无法创建团队',
          details: quotaError?.message,
        },
      });
    }

    const teamId = uuidv4();

    // Prepare insert values
    const insertValues: any = {
      id: teamId,
      organizationId,
      name: teamData.name,
      logo: teamData.logo || 'Users',
      description: teamData.description || null,
      metadata: teamData.metadata ? JSON.stringify(teamData.metadata) : null,
    };

    // Explicitly set timestamps for MySQL compatibility
    const now = new Date();
    insertValues.createdAt = now;
    insertValues.updatedAt = now;

    // Insert team (MySQL doesn't support .returning())
    try {
      await db.insert(table).values(insertValues);
    } catch (insertError: any) {
      logger.error('Insert team error:', insertError);
      logger.error('Insert values', { body: insertValues });
      throw insertError;
    }

    // Fetch the created team
    const [createdTeam] = await db.select().from(table).where(eq(table.id, teamId)).limit(1);

    // Parse JSON fields
    const parsedTeam = {
      ...createdTeam,
      metadata: createdTeam.metadata
        ? typeof createdTeam.metadata === 'string'
          ? JSON.parse(createdTeam.metadata)
          : createdTeam.metadata
        : null,
    };

    // Record usage after successful creation
    try {
      await quotaService.recordUsage(organizationId, 'teams', 1, {
        teamId: parsedTeam.id,
        teamName: parsedTeam.name,
      });
      logger.info(`Usage recorded for team creation: ${organizationId} - teams +1`);
    } catch (usageError) {
      // Log error but don't fail the request since team was already created
      logger.error('Failed to record usage after team creation:', usageError);
    }

    res.status(201).json({
      success: true,
      data: parsedTeam,
    });
  } catch (error) {
    logger.error('Create team error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create team',
      },
    });
  }
});

/**
 * PUT /api/v1/teams/:id
 * Update team
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const updateData = updateTeamSchema.parse(req.body);

    const table = getTeamsTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Check if team exists
    const conditions: any[] = [eq(table.id, id)];
    if (organizationId) {
      conditions.push(eq(table.organizationId, organizationId));
    }

    const [existing] = await db
      .select()
      .from(table)
      .where(and(...conditions))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Team not found' },
      });
    }

    // Prepare update values
    const updateValues: any = {};

    if (updateData.name) { updateValues.name = updateData.name; }
    if (updateData.logo !== undefined) { updateValues.logo = updateData.logo; }
    if (updateData.description !== undefined) { updateValues.description = updateData.description; }
    if (updateData.metadata) {
      updateValues.metadata = JSON.stringify(updateData.metadata);
    }

    updateValues.updatedAt = new Date();

    // Update team
    await db.update(table).set(updateValues).where(eq(table.id, id));

    // Fetch the updated team
    const [updatedTeam] = await db.select().from(table).where(eq(table.id, id)).limit(1);

    // Parse JSON fields
    const parsedTeam = {
      ...updatedTeam,
      metadata: updatedTeam.metadata
        ? typeof updatedTeam.metadata === 'string'
          ? JSON.parse(updatedTeam.metadata)
          : updatedTeam.metadata
        : null,
    };

    res.json({
      success: true,
      data: parsedTeam,
    });
  } catch (error) {
    logger.error('Update team error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update team',
      },
    });
  }
});

/**
 * DELETE /api/v1/teams/:id
 * Delete team
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const table = getTeamsTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Check if team exists
    const conditions: any[] = [eq(table.id, id)];
    if (organizationId) {
      conditions.push(eq(table.organizationId, organizationId));
    }

    const [existing] = await db
      .select()
      .from(table)
      .where(and(...conditions))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Team not found' },
      });
    }

    // Delete team
    await db.delete(table).where(eq(table.id, id));

    res.json({
      success: true,
      data: null,
    });
  } catch (error) {
    logger.error('Delete team error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete team',
      },
    });
  }
});

/**
 * POST /api/v1/teams/:id/members
 * Add member to team
 */
router.post('/:id/members', async (req, res) => {
  try {
    const { id: teamId } = req.params;
    const { userId, role } = req.body;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER_ID', message: 'User ID is required' },
      });
    }

    const dbType = getDbType();
    let userTeamsTable: any;
    let usersTable: any;
    let teamsTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      userTeamsTable = mysqlTables.userTeamsTable;
      usersTable = mysqlTables.usersTable;
      teamsTable = mysqlTables.teamsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      userTeamsTable = pgTables.userTeamsTable;
      usersTable = pgTables.usersTable;
      teamsTable = pgTables.teamsTable;
    }

    if (!userTeamsTable || !usersTable || !teamsTable) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database tables not initialized' },
      });
    }

    // Verify team exists and belongs to organization
    const teamConditions: any[] = [eq(teamsTable.id, teamId)];
    if (organizationId) {
      teamConditions.push(eq(teamsTable.organizationId, organizationId));
    }
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(and(...teamConditions))
      .limit(1);

    if (!team) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Team not found' },
      });
    }

    // Verify user exists and belongs to organization
    const userConditions: any[] = [eq(usersTable.id, userId)];
    if (organizationId) {
      userConditions.push(eq(usersTable.organizationId, organizationId));
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(...userConditions))
      .limit(1);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    // Check if user is already a member
    const [existing] = await db
      .select()
      .from(userTeamsTable)
      .where(and(eq(userTeamsTable.userId, userId), eq(userTeamsTable.teamId, teamId)))
      .limit(1);

    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_MEMBER', message: 'User is already a member of this team' },
      });
    }

    // Add member to team
    const now = new Date();
    const insertValues: any = {
      userId,
      teamId,
      organizationId: organizationId, // Add organizationId for better query performance
      role: role || 'member',
      joinedAt: now,
    };

    logger.info(`Adding member to team:`, {
      userId,
      teamId,
      role: role || 'member',
      insertValues,
    });

    try {
      await db.insert(userTeamsTable).values(insertValues);
      logger.info(`Successfully added member ${userId} to team ${teamId}`);
    } catch (insertError: any) {
      logger.error('Error inserting member into user_teams table:', {
        error: insertError.message,
        code: insertError.code,
        sql: insertError.sql,
        insertValues,
      });
      throw insertError;
    }

    res.json({
      success: true,
      message: 'Member added successfully',
    });
  } catch (error) {
    logger.error('Add member error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to add member',
      },
    });
  }
});

/**
 * DELETE /api/v1/teams/:id/members/:userId
 * Remove member from team
 */
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const { id: teamId, userId } = req.params;
    const organizationId = req.user?.organizationId;

    const dbType = getDbType();
    let userTeamsTable: any;
    let teamsTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      userTeamsTable = mysqlTables.userTeamsTable;
      teamsTable = mysqlTables.teamsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      userTeamsTable = pgTables.userTeamsTable;
      teamsTable = pgTables.teamsTable;
    }

    if (!userTeamsTable || !teamsTable) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database tables not initialized' },
      });
    }

    // Verify team exists and belongs to organization
    const teamConditions: any[] = [eq(teamsTable.id, teamId)];
    if (organizationId) {
      teamConditions.push(eq(teamsTable.organizationId, organizationId));
    }
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(and(...teamConditions))
      .limit(1);

    if (!team) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Team not found' },
      });
    }

    // Remove member from team
    await db
      .delete(userTeamsTable)
      .where(and(eq(userTeamsTable.userId, userId), eq(userTeamsTable.teamId, teamId)));

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    logger.error('Remove member error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to remove member',
      },
    });
  }
});

/**
 * POST /api/v1/teams/add-logo-column
 * Temporary endpoint to add logo column to teams table
 * This is a one-time migration script
 */
router.post('/add-logo-column', async (_req, res) => {
  try {
    const dbType = getDbType();

    if (dbType !== 'mysql') {
      return res.status(400).json({
        success: false,
        error: { code: 'UNSUPPORTED_DB', message: 'This migration only supports MySQL' },
      });
    }

    // Execute ALTER TABLE to add logo column
    try {
      await db.execute(
        sql`ALTER TABLE teams ADD COLUMN logo VARCHAR(50) DEFAULT 'Users' AFTER name`,
      );
      logger.info('Successfully added logo column to teams table');
    } catch (alterError: any) {
      // If column already exists, that's okay
      if (
        alterError.code === 'ER_DUP_FIELDNAME' ||
        alterError.message?.includes('Duplicate column name')
      ) {
        logger.info('Logo column already exists in teams table');
      } else {
        throw alterError;
      }
    }

    // Update existing teams to have default logo
    try {
      await db.execute(sql`UPDATE teams SET logo = 'Users' WHERE logo IS NULL`);
      logger.info('Successfully updated existing teams with default logo');
    } catch (updateError: any) {
      logger.warn('Error updating existing teams:', updateError);
      // Don't fail if update fails
    }

    res.json({
      success: true,
      message: 'Logo column added successfully to teams table',
    });
  } catch (error) {
    logger.error('Error adding logo column:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to add logo column',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * POST /api/v1/teams/update-logo-column
 * Temporary endpoint to update logo column type to TEXT
 * This is a one-time migration script
 */
router.post('/update-logo-column', async (_req, res) => {
  try {
    const dbType = getDbType();

    if (dbType !== 'mysql') {
      return res.status(400).json({
        success: false,
        error: { code: 'UNSUPPORTED_DB', message: 'This migration only supports MySQL' },
      });
    }

    // Execute ALTER TABLE to modify logo column to TEXT
    try {
      await db.execute(sql`ALTER TABLE teams MODIFY COLUMN logo TEXT`);
      logger.info('Successfully updated logo column to TEXT type');
    } catch (alterError: any) {
      // If column doesn't exist, add it
      if (alterError.code === 'ER_BAD_FIELD_ERROR') {
        try {
          await db.execute(sql`ALTER TABLE teams ADD COLUMN logo TEXT AFTER name`);
          logger.info('Successfully added logo column as TEXT type');
        } catch (addError: any) {
          throw addError;
        }
      } else {
        throw alterError;
      }
    }

    res.json({
      success: true,
      message: 'Logo column updated to TEXT type successfully',
    });
  } catch (error) {
    logger.error('Error updating logo column:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update logo column',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * POST /api/v1/teams/create-user-teams-table
 * Temporary endpoint to create user_teams table
 * This is a one-time migration script
 */
router.post('/create-user-teams-table', async (_req, res) => {
  try {
    const dbType = getDbType();

    if (dbType !== 'mysql') {
      return res.status(400).json({
        success: false,
        error: { code: 'UNSUPPORTED_DB', message: 'This migration only supports MySQL' },
      });
    }

    // Create user_teams table
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS user_teams (
          user_id VARCHAR(36) NOT NULL,
          team_id VARCHAR(36) NOT NULL,
          role VARCHAR(50) DEFAULT 'member',
          permissions JSON,
          joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, team_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
          INDEX idx_user_teams_user_id (user_id),
          INDEX idx_user_teams_team_id (team_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('Successfully created user_teams table');
    } catch (createError: any) {
      // If table already exists, that's okay
      if (
        createError.code === 'ER_TABLE_EXISTS_ERROR' ||
        createError.message?.includes('already exists')
      ) {
        logger.info('user_teams table already exists');
      } else {
        throw createError;
      }
    }

    res.json({
      success: true,
      message: 'user_teams table created successfully',
    });
  } catch (error) {
    logger.error('Error creating user_teams table:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create user_teams table',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export default router;
