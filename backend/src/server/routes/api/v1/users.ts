/**
 * Users API Routes
 */

import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../../../../database';
import { eq, and, desc, or, like, sql, inArray } from 'drizzle-orm';
import logger from '../../../../logger';
import { quotaService } from '../../../../services/quotaService';

const router = express.Router();

// Create user schema
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.string().optional().default('member'),
  teamIds: z.array(z.string()).optional().default([]),
  sendInvitation: z.boolean().optional().default(true),
});

// Update user schema
const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().optional(),
  teamIds: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

/**
 * GET /api/v1/users
 * List users in organization
 */
router.get('/', async (req, res) => {
  try {
    console.log('[Users API] Request received:', {
      method: req.method,
      url: req.url,
      query: req.query,
      user: req.user ? { id: req.user.id, organizationId: req.user.organizationId } : 'no user',
    });

    const organizationId = req.user?.organizationId;
    console.log('[Users API] Organization ID check:', { organizationId });

    if (!organizationId) {
      console.error('[Users API] Missing organization ID');
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    // Get database type and tables
    const dbType = getDbType();
    let usersTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      usersTable = mysqlTables.usersTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      usersTable = pgTables.usersTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      usersTable = sqliteTables.usersTable;
    }

    if (!usersTable) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    const { limit = 50, offset = 0, search, status, role } = req.query;

    const whereConditions = [eq(usersTable.organizationId, organizationId)];

    if (search) {
      whereConditions.push(
        or(like(usersTable.email, `%${search}%`), like(usersTable.name, `%${search}%`)),
      );
    }

    if (status) {
      whereConditions.push(eq(usersTable.status, status as string));
    }

    if (role) {
      whereConditions.push(eq(usersTable.role, role as string));
    }

    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        avatar: usersTable.avatar,
        role: usersTable.role,
        status: usersTable.status,
        emailVerified: usersTable.emailVerified,
        lastLoginAt: usersTable.lastLoginAt,
        lastActivityAt: usersTable.lastActivityAt,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .where(and(...whereConditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(desc(usersTable.createdAt));

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(usersTable)
      .where(and(...whereConditions));

    // Get teams for all users
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
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      userTeamsTable = sqliteTables.userTeamsTable;
      teamsTable = sqliteTables.teamsTable;
    }

    // Query logic: 1. First get users (already done above)
    // 2. Then query user_teams table to get user-team relationships
    // 3. Finally query teams table to get team details
    const enrichedUsers = users.map((user: any) => ({ ...user, teams: [], teamIds: [] }));

    logger.info(`[Users List] Returning ${users.length} users for organization ${organizationId}`);

    if (userTeamsTable && teamsTable && users.length > 0) {
      try {
        const userIds = users.map((u: any) => u.id);
        logger.info(
          `[Users List] Step 1: Found ${userIds.length} users: ${userIds.slice(0, 3).join(', ')}...`,
        );
        logger.info(`[Users List] Organization ID: ${organizationId}`);

        // Step 2: Query user_teams table (middle table)
        // First, let's check if there's any data in user_teams table for this organization
        const allUserTeamsCheck = await db
          .select({
            userId: userTeamsTable.userId,
            teamId: userTeamsTable.teamId,
            organizationId: userTeamsTable.organizationId,
            role: userTeamsTable.role,
          })
          .from(userTeamsTable)
          .where(eq(userTeamsTable.organizationId, organizationId))
          .limit(10);

        logger.info(
          `[Users List] Step 2a: Found ${allUserTeamsCheck.length} total user-team relationships in organization (sample check)`,
        );
        if (allUserTeamsCheck.length > 0) {
          logger.info(`[Users List] Sample user-team relationship:`, allUserTeamsCheck[0]);
        }

        // Now query for the specific users
        // Step 2: Query user_teams table (middle table) for these specific users
        let allUserTeams: any[] = [];
        if (userIds.length > 0) {
          allUserTeams = await db
            .select({
              userId: userTeamsTable.userId,
              teamId: userTeamsTable.teamId,
              role: userTeamsTable.role,
              joinedAt: userTeamsTable.joinedAt,
            })
            .from(userTeamsTable)
            .where(
              and(
                inArray(userTeamsTable.userId, userIds),
                eq(userTeamsTable.organizationId, organizationId),
              ),
            );

          logger.info(
            `[Users List] Step 2b: Found ${allUserTeams.length} user-team relationships for these users`,
          );
          if (allUserTeams.length > 0) {
            logger.info(`[Users List] Sample relationship:`, allUserTeams[0]);
          }
        } else {
          logger.warn(`[Users List] No user IDs to query`);
        }

        // Step 3: Query teams table to get team details
        if (allUserTeams.length > 0) {
          const uniqueTeamIds = [...new Set(allUserTeams.map((ut: any) => ut.teamId))];
          logger.info(
            `[Users List] Step 3: Fetching details for ${uniqueTeamIds.length} unique teams: ${uniqueTeamIds.slice(0, 3).join(', ')}...`,
          );

          const teamDetails = await db
            .select({
              id: teamsTable.id,
              name: teamsTable.name,
              logo: teamsTable.logo,
              organizationId: teamsTable.organizationId,
            })
            .from(teamsTable)
            .where(
              and(
                inArray(teamsTable.id, uniqueTeamIds),
                eq(teamsTable.organizationId, organizationId),
              ),
            );

          logger.info(`[Users List] Step 3: Found ${teamDetails.length} team details`);
          if (teamDetails.length > 0) {
            logger.info(`[Users List] Sample team:`, teamDetails[0]);
          }

          // Create team map for quick lookup
          const teamMap = new Map(teamDetails.map((t: any) => [t.id, t]));

          // Group user teams by userId
          const userTeamsMap = new Map<string, any[]>();
          allUserTeams.forEach((ut: any) => {
            if (!userTeamsMap.has(ut.userId)) {
              userTeamsMap.set(ut.userId, []);
            }
            const teamInfo = teamMap.get(ut.teamId) as any;
            if (teamInfo) {
              userTeamsMap.get(ut.userId)!.push({
                id: ut.teamId,
                name: teamInfo.name || 'Unknown Team',
                logo: teamInfo.logo,
                role: ut.role,
                joinedAt: ut.joinedAt,
              });
            } else {
              logger.warn(
                `[Users List] Team ${ut.teamId} not found in teams table for user ${ut.userId}`,
              );
            }
          });

          // Assign teams to each user
          enrichedUsers.forEach((user: any) => {
            const userTeams = userTeamsMap.get(user.id) || [];
            user.teams = userTeams;
            user.teamIds = userTeams.map((t: any) => t.id);
            if (userTeams.length > 0) {
              logger.info(
                `[Users List] User ${user.id} (${user.name}) has ${userTeams.length} teams: ${userTeams.map((t: any) => t.name).join(', ')}`,
              );
            }
          });

          logger.info(
            `[Users List] Successfully enriched ${enrichedUsers.filter((u) => u.teams.length > 0).length} users with team information`,
          );
        } else {
          logger.info(
            `[Users List] No user-team relationships found for these users in organization ${organizationId}`,
          );
        }
      } catch (teamError: any) {
        logger.error('[Users List] Error fetching teams for users:', {
          error: teamError?.message || String(teamError),
          code: teamError?.code,
          sql: teamError?.sql,
          sqlMessage: teamError?.sqlMessage,
          stack: teamError?.stack,
        });
        // Don't fail the entire request if team fetching fails
        // Users will just have empty teams array
      }
    } else {
      if (!userTeamsTable) {
        logger.warn('[Users List] userTeamsTable not available');
      }
      if (!teamsTable) {
        logger.warn('[Users List] teamsTable not available');
      }
      if (users.length === 0) {
        logger.info('[Users List] No users to process');
      }
    }

    // Log final response to verify teams are included
    if (enrichedUsers.length > 0) {
      logger.info(`[Users List] Final response: ${enrichedUsers.length} users`);
      logger.info(`[Users List] First user:`, {
        id: enrichedUsers[0].id,
        name: enrichedUsers[0].name,
        teamsCount: enrichedUsers[0].teams?.length || 0,
        teams: enrichedUsers[0].teams,
      });
    }

    logger.info(`[Users List] Final response: ${enrichedUsers.length} users`);

    // Ensure total is a number
    const totalCount =
      typeof total[0]?.count === 'number'
        ? total[0].count
        : typeof total[0]?.count === 'bigint'
          ? Number(total[0].count)
          : parseInt(String(total[0]?.count || 0), 10);

    logger.info(`[Users List] Response: ${enrichedUsers.length} users, total: ${totalCount}`);

    res.json({
      success: true,
      data: {
        data: enrichedUsers,
        total: totalCount,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + enrichedUsers.length < totalCount,
      },
    });
  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list users',
      },
    });
  }
});

/**
 * POST /api/v1/users
 * Create new user
 */
router.post('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const { email, name, role, teamIds, sendInvitation } = createUserSchema.parse(req.body);

    // Get database type and tables
    const dbType = getDbType();
    let usersTable: any;
    let userTeamsTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      usersTable = mysqlTables.usersTable;
      userTeamsTable = mysqlTables.userTeamsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      usersTable = pgTables.usersTable;
      userTeamsTable = pgTables.userTeamsTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      usersTable = sqliteTables.usersTable;
      userTeamsTable = sqliteTables.userTeamsTable;
    }

    if (!usersTable) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User with this email already exists',
        },
      });
    }

    // Check quota before creating user
    try {
      const quotaCheck = await quotaService.checkQuota(organizationId, 'teamMembers', 1);
      if (!quotaCheck.allowed) {
        logger.warn(
          `Quota exceeded for organization ${organizationId}: teamMembers ${quotaCheck.currentUsage}/${quotaCheck.limit}`,
        );
        return res.status(403).json({
          success: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: `团队成员数量配额已满。当前使用: ${quotaCheck.currentUsage}/${quotaCheck.limit === -1 ? '无限制' : quotaCheck.limit}。请升级套餐或删除现有成员。`,
            details: {
              metric: 'teamMembers',
              currentUsage: quotaCheck.currentUsage,
              limit: quotaCheck.limit,
              remaining: quotaCheck.remaining,
            },
          },
        });
      }
      logger.info(
        `Quota check passed: teamMembers ${quotaCheck.currentUsage + 1}/${quotaCheck.limit === -1 ? 'unlimited' : quotaCheck.limit}`,
      );
    } catch (quotaError: any) {
      logger.error('Quota check error:', quotaError);
      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTA_CHECK_FAILED',
          message: '配额检查失败，无法创建用户',
          details: quotaError?.message,
        },
      });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-12);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Generate user ID
    const userId = uuidv4();

    // Prepare insert values
    const now = new Date();
    const insertValues: any = {
      id: userId,
      organizationId,
      email,
      name,
      role: role || 'member',
      status: 'pending',
      passwordHash: hashedPassword,
      emailVerified: false,
      mfaEnabled: false,
      createdAt: now,
      updatedAt: now,
    };

    logger.info('Creating user:', { userId, email, name, organizationId });

    // Insert user (MySQL doesn't support .returning())
    try {
      await db.insert(usersTable).values(insertValues);
      logger.info('User inserted successfully');
    } catch (insertError: any) {
      logger.error('Database insert error:', insertError);
      logger.error('Insert error details:', {
        message: insertError?.message,
        code: insertError?.code,
        sql: insertError?.sql,
        sqlMessage: insertError?.sqlMessage,
        insertValues: { ...insertValues, passwordHash: '[REDACTED]' },
      });
      throw insertError;
    }

    // Fetch the created user
    const [newUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!newUser) {
      throw new Error('User was created but could not be retrieved');
    }

    // Add to teams if specified
    if (teamIds && teamIds.length > 0 && userTeamsTable) {
      try {
        const teamInserts = teamIds.map((teamId) => ({
          userId: newUser.id,
          teamId,
          organizationId: organizationId, // Add organizationId for better query performance
          role: 'member',
          joinedAt: now,
        }));

        await db.insert(userTeamsTable).values(teamInserts);
        logger.info(`Added user to ${teamIds.length} team(s)`);
      } catch (teamError: any) {
        logger.error('Error adding user to teams:', teamError);
        // Don't fail the entire request if team assignment fails
      }
    }

    // Record usage after successful creation
    try {
      await quotaService.recordUsage(organizationId, 'teamMembers', 1, {
        userId: newUser.id,
        userEmail: newUser.email,
      });
      logger.info(`Usage recorded for user creation: ${organizationId} - teamMembers +1`);
    } catch (usageError) {
      // Log error but don't fail the request since user was already created
      logger.error('Failed to record usage after user creation:', usageError);
    }

    // TODO: Send invitation email if sendInvitation is true

    res.status(201).json({
      success: true,
      data: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        status: newUser.status,
        invitationSent: sendInvitation,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error: any) {
    logger.error('Create user error:', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      sql: error.sql,
      sqlMessage: error.sqlMessage,
    });

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

    const errorMessage = error?.message || 'Failed to create user';
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
    });
  }
});

/**
 * GET /api/v1/users/:id
 * Get user by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    console.log('[Users API] GET /:id request:', {
      id,
      organizationId,
      user: req.user ? { id: req.user.id, organizationId: req.user.organizationId } : 'no user',
      headers: {
        authorization: req.headers.authorization ? 'Bearer ***' : 'none',
      },
    });

    if (!organizationId) {
      console.error('[Users API] Missing organization ID');
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    // Get database type and tables
    const dbType = getDbType();
    let usersTable: any;
    let userTeamsTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      usersTable = mysqlTables.usersTable;
      userTeamsTable = mysqlTables.userTeamsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      usersTable = pgTables.usersTable;
      userTeamsTable = pgTables.userTeamsTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      usersTable = sqliteTables.usersTable;
      userTeamsTable = sqliteTables.userTeamsTable;
    }

    if (!usersTable) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    console.log('[Users API] Querying database for user:', { id, organizationId });

    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, organizationId)))
      .limit(1);

    console.log('[Users API] Database query result:', {
      userFound: !!user,
      userId: user?.id,
      userEmail: user?.email,
      userOrganizationId: user?.organizationId,
    });

    if (!user) {
      console.error('[Users API] User not found in database');
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Get user's teams if userTeamsTable is available
    // Query logic: 1. First get user, 2. Then query user_teams table filtered by organizationId
    let teams: any[] = [];
    if (userTeamsTable) {
      try {
        const userTeams = await db
          .select({
            teamId: userTeamsTable.teamId,
            role: userTeamsTable.role,
            joinedAt: userTeamsTable.joinedAt,
          })
          .from(userTeamsTable)
          .where(
            and(eq(userTeamsTable.userId, id), eq(userTeamsTable.organizationId, organizationId)),
          );

        // Get team details (names) for all teams at once
        if (userTeams.length > 0) {
          const dbType = getDbType();
          let teamsTable: any;

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

          if (teamsTable) {
            const teamIds = userTeams.map((ut: any) => ut.teamId);
            const teamDetails = await db
              .select({
                id: teamsTable.id,
                name: teamsTable.name,
                logo: teamsTable.logo,
              })
              .from(teamsTable)
              .where(
                and(inArray(teamsTable.id, teamIds), eq(teamsTable.organizationId, organizationId)),
              );

            const teamMap = new Map<string, any>(teamDetails.map((t: any) => [t.id, t]));
            teams = userTeams.map((ut: any) => ({
              id: ut.teamId,
              name: teamMap.get(ut.teamId)?.name || 'Unknown Team',
              logo: teamMap.get(ut.teamId)?.logo,
              role: ut.role,
              joinedAt: ut.joinedAt,
            }));
          } else {
            // Fallback if teamsTable not available
            teams = userTeams.map((ut: any) => ({
              id: ut.teamId,
              role: ut.role,
              joinedAt: ut.joinedAt,
            }));
          }
        }
      } catch (teamError: any) {
        logger.error('Error fetching user teams:', teamError);
        // Don't fail the request if team fetching fails
      }
    }

    // Parse JSON fields if needed
    const parsedUser: any = {
      ...user,
      teams: teams,
      teamIds: teams.map((t: any) => t.id),
    };

    // Parse metadata if it's a string
    if (parsedUser.metadata && typeof parsedUser.metadata === 'string') {
      try {
        parsedUser.metadata = JSON.parse(parsedUser.metadata);
      } catch (_e) {
        // Keep as string if parsing fails
      }
    }

    res.json({
      success: true,
      data: parsedUser,
    });
  } catch (error: any) {
    logger.error('Get user error:', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      sql: error.sql,
      sqlMessage: error.sqlMessage,
      userId: req.params.id,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to get user',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
    });
  }
});

/**
 * PUT /api/v1/users/:id
 * Update user
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const updates = updateUserSchema.parse(req.body);

    // Get database type and tables
    const dbType = getDbType();
    let usersTable: any;
    let userTeamsTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      usersTable = mysqlTables.usersTable;
      userTeamsTable = mysqlTables.userTeamsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      usersTable = pgTables.usersTable;
      userTeamsTable = pgTables.userTeamsTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      usersTable = sqliteTables.usersTable;
      userTeamsTable = sqliteTables.userTeamsTable;
    }

    if (!usersTable) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Check if user exists
    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, organizationId)))
      .limit(1);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Prepare update values (exclude teamIds as it's handled separately)
    const userUpdates = { ...updates };
    delete userUpdates.teamIds;
    const updateValues: any = {
      ...userUpdates,
      updatedAt: new Date(),
    };

    // Update user (MySQL doesn't support .returning())
    if (dbType === 'mysql') {
      await db
        .update(usersTable)
        .set(updateValues)
        .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, organizationId)));
    } else {
      await db
        .update(usersTable)
        .set(updateValues)
        .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, organizationId)));
    }

    // Fetch the updated user
    const [updatedUser] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, organizationId)))
      .limit(1);

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Update team memberships if teamIds provided
    if (updates.teamIds !== undefined && userTeamsTable) {
      try {
        // Remove existing team memberships (filtered by organizationId)
        await db
          .delete(userTeamsTable)
          .where(
            and(eq(userTeamsTable.userId, id), eq(userTeamsTable.organizationId, organizationId)),
          );

        // Add new team memberships
        if (updates.teamIds.length > 0) {
          const now = new Date();
          const teamInserts = updates.teamIds.map((teamId) => ({
            userId: id,
            teamId,
            organizationId: organizationId, // Add organizationId for better query performance
            role: 'member',
            joinedAt: now,
          }));

          await db.insert(userTeamsTable).values(teamInserts);
          logger.info(`Updated user ${id} team memberships: ${updates.teamIds.length} teams`);
        }
      } catch (teamError: any) {
        logger.error('Error updating user team memberships:', teamError);
        // Don't fail the entire request if team update fails
      }
    }

    // Get user's teams for response
    let teams: any[] = [];
    if (userTeamsTable) {
      try {
        // Query logic: 1. First get user, 2. Then query user_teams table filtered by organizationId
        const userTeams = await db
          .select({
            teamId: userTeamsTable.teamId,
            role: userTeamsTable.role,
            joinedAt: userTeamsTable.joinedAt,
          })
          .from(userTeamsTable)
          .where(
            and(eq(userTeamsTable.userId, id), eq(userTeamsTable.organizationId, organizationId)),
          );

        // Get team details (names) for all teams at once
        if (userTeams.length > 0) {
          let teamsTable: any;

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

          if (teamsTable) {
            const teamIds = userTeams.map((ut: any) => ut.teamId);
            const teamDetails = await db
              .select({
                id: teamsTable.id,
                name: teamsTable.name,
                logo: teamsTable.logo,
              })
              .from(teamsTable)
              .where(
                and(inArray(teamsTable.id, teamIds), eq(teamsTable.organizationId, organizationId)),
              );

            const teamMap = new Map<string, any>(teamDetails.map((t: any) => [t.id, t]));
            teams = userTeams.map((ut: any) => ({
              id: ut.teamId,
              name: teamMap.get(ut.teamId)?.name || 'Unknown Team',
              logo: teamMap.get(ut.teamId)?.logo,
              role: ut.role,
              joinedAt: ut.joinedAt,
            }));
          } else {
            // Fallback if teamsTable not available
            teams = userTeams.map((ut: any) => ({
              id: ut.teamId,
              role: ut.role,
              joinedAt: ut.joinedAt,
            }));
          }
        }
      } catch (teamError: any) {
        logger.error('Error fetching user teams:', teamError);
      }
    }

    // Parse JSON fields if needed
    const parsedUser: any = {
      ...updatedUser,
      teams: teams,
      teamIds: teams.map((t: any) => t.id),
    };

    // Parse metadata if it's a string
    if (parsedUser.metadata && typeof parsedUser.metadata === 'string') {
      try {
        parsedUser.metadata = JSON.parse(parsedUser.metadata);
      } catch (_e) {
        // Keep as string if parsing fails
      }
    }

    res.json({
      success: true,
      data: parsedUser,
    });
  } catch (error: any) {
    logger.error('Update user error:', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      sql: error.sql,
      sqlMessage: error.sqlMessage,
      userId: req.params.id,
    });

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

    const errorMessage = error?.message || 'Failed to update user';
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
    });
  }
});

/**
 * DELETE /api/v1/users/:id
 * Delete user
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    // Get database type and tables
    const dbType = getDbType();
    let usersTable: any;
    let _userTeamsTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      usersTable = mysqlTables.usersTable;
      _userTeamsTable = mysqlTables.userTeamsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      usersTable = pgTables.usersTable;
      _userTeamsTable = pgTables.userTeamsTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      usersTable = sqliteTables.usersTable;
      _userTeamsTable = sqliteTables.userTeamsTable;
    }

    if (!usersTable) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // First, check if the user exists
    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, organizationId)))
      .limit(1);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    logger.info(`Deleting user: ${id} from organization: ${organizationId}`);

    // Delete user (cascade will handle user_teams entries)
    // MySQL doesn't return rowCount, so we check existence first (done above)
    if (dbType === 'mysql') {
      await db
        .delete(usersTable)
        .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, organizationId)));
    } else {
      // PostgreSQL/SQLite
      const result = await db
        .delete(usersTable)
        .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, organizationId)));

      // For PostgreSQL, check result.rowCount
      // For SQLite, check result.changes
      if (dbType === 'postgres' && (result as any).rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      } else if (dbType === 'sqlite' && (result as any).changes === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }
    }

    logger.info(`User deleted successfully: ${id}`);
    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete user error:', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      sql: error.sql,
      sqlMessage: error.sqlMessage,
      userId: req.params.id,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to delete user',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
    });
  }
});

export default router;
