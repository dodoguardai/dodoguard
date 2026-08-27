/**
 * User Service
 * Handles user management operations
 */

import bcrypt from 'bcrypt';
import { db } from '../database';
import { usersTable, userTeamsTable } from '../database/tables-enterprise';
import { eq, and, sql } from 'drizzle-orm';
import logger from '../logger';

export interface CreateUserData {
  organizationId: string;
  email: string;
  name: string;
  role?: string;
  teamIds?: string[];
  password?: string; // If not provided, will generate a temporary password
}

export interface UpdateUserData {
  name?: string;
  role?: string;
  teamIds?: string[];
  status?: 'active' | 'inactive' | 'suspended';
}

export class UserService {
  /**
   * Create a new user
   */
  async createUser(data: CreateUserData) {
    try {
      // Check if user already exists
      const existingUser = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, data.email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Generate password if not provided
      const password = data.password || this.generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const [newUser] = await db
        .insert(usersTable)
        .values({
          organizationId: data.organizationId,
          email: data.email,
          name: data.name,
          role: data.role || 'member',
          passwordHash: hashedPassword,
        })
        .returning();

      // Add to teams if specified
      if (data.teamIds && data.teamIds.length > 0) {
        const teamInserts = data.teamIds.map((teamId) => ({
          userId: newUser.id,
          teamId,
          role: 'member',
        }));

        await db.insert(userTeamsTable).values(teamInserts);
      }

      logger.info(`User created: ${newUser.email} (${newUser.id})`);
      return { user: newUser, temporaryPassword: data.password ? undefined : password };
    } catch (error) {
      logger.error('Create user error:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string, organizationId: string) {
    try {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, organizationId)))
        .limit(1);

      return user || null;
    } catch (error) {
      logger.error('Get user by ID error:', error);
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string) {
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

      return user || null;
    } catch (error) {
      logger.error('Get user by email error:', error);
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(userId: string, organizationId: string, data: UpdateUserData) {
    try {
      const [updatedUser] = await db
        .update(usersTable)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, organizationId)))
        .returning();

      if (!updatedUser) {
        throw new Error('User not found');
      }

      // Update team memberships if teamIds provided
      if (data.teamIds !== undefined) {
        // Remove existing team memberships
        await db.delete(userTeamsTable).where(eq(userTeamsTable.userId, userId));

        // Add new team memberships
        if (data.teamIds.length > 0) {
          const teamInserts = data.teamIds.map((teamId) => ({
            userId,
            teamId,
            role: 'member',
          }));

          await db.insert(userTeamsTable).values(teamInserts);
        }
      }

      logger.info(`User updated: ${updatedUser.email} (${updatedUser.id})`);
      return updatedUser;
    } catch (error) {
      logger.error('Update user error:', error);
      throw error;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string, organizationId: string) {
    try {
      const result = await db
        .delete(usersTable)
        .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, organizationId)));

      if (result.rowCount === 0) {
        throw new Error('User not found');
      }

      logger.info(`User deleted: ${userId}`);
      return true;
    } catch (error) {
      logger.error('Delete user error:', error);
      throw error;
    }
  }

  /**
   * List users in organization
   */
  async listUsers(
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      search?: string;
      status?: string;
      role?: string;
    } = {},
  ) {
    try {
      const { limit = 50, offset = 0, search, status, role } = options;

      const whereConditions = [eq(usersTable.organizationId, organizationId)];

      if (search) {
        // Note: This would need to be adapted for PostgreSQL
        whereConditions.push(
          sql`${usersTable.email} ILIKE ${`%${search}%`} OR ${usersTable.name} ILIKE ${`%${search}%`}`,
        );
      }

      if (status) {
        whereConditions.push(eq(usersTable.status, status as any));
      }

      if (role) {
        whereConditions.push(eq(usersTable.role, role));
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
        .limit(limit)
        .offset(offset)
        .orderBy(sql`${usersTable.createdAt} DESC`);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(usersTable)
        .where(and(...whereConditions));

      return {
        users,
        total: count,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('List users error:', error);
      throw error;
    }
  }

  /**
   * Authenticate user
   */
  async authenticateUser(email: string, password: string) {
    try {
      const user = await this.getUserByEmail(email);
      if (!user) {
        return null;
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return null;
      }

      // Update last login
      await db
        .update(usersTable)
        .set({ lastLoginAt: new Date() })
        .where(eq(usersTable.id, user.id));

      return user;
    } catch (error) {
      logger.error('Authenticate user error:', error);
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await db
        .update(usersTable)
        .set({
          passwordHash: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));

      logger.info(`Password changed for user: ${user.email} (${userId})`);
      return true;
    } catch (error) {
      logger.error('Change password error:', error);
      throw error;
    }
  }

  /**
   * Reset user password (admin function)
   */
  async resetPassword(userId: string, organizationId: string) {
    try {
      const newPassword = this.generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      const [updatedUser] = await db
        .update(usersTable)
        .set({
          passwordHash: hashedPassword,
          updatedAt: new Date(),
        })
        .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, organizationId)))
        .returning();

      if (!updatedUser) {
        throw new Error('User not found');
      }

      logger.info(`Password reset for user: ${updatedUser.email} (${userId})`);
      return { user: updatedUser, temporaryPassword: newPassword };
    } catch (error) {
      logger.error('Reset password error:', error);
      throw error;
    }
  }

  /**
   * Generate a temporary password
   */
  private generateTemporaryPassword(): string {
    return Math.random().toString(36).slice(-12);
  }
}

export const userService = new UserService();
