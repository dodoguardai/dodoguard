/**
 * Permission Service
 * Handles permission checking and role management
 */

import { db } from '../database';
import { permissionsTable, rolesTable, userTeamsTable } from '../database/tables-enterprise';
import { eq, and, } from 'drizzle-orm';
import logger from '../logger';

export interface UserPermissions {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
  teamPermissions?: Record<string, string[]>;
}

export class PermissionService {
  /**
   * Get user permissions
   */
  async getUserPermissions(userId: string, organizationId: string): Promise<UserPermissions> {
    try {
      // Get user role and permissions
      const userResult = await db
        .select({
          role: rolesTable.permissions,
          roleName: rolesTable.name,
        })
        .from(rolesTable)
        .where(
          and(
            eq(rolesTable.organizationId, organizationId),
            // For now, we'll use a simple role-based system
            // In a real implementation, this would be more complex
          ),
        )
        .limit(1);

      // If no organization-specific role, use default member role
      let permissions: string[] = [];
      let role = 'member';

      if (userResult.length > 0) {
        permissions = userResult[0].role as string[];
        role = userResult[0].roleName;
      } else {
        // Get default member permissions
        const defaultRole = await db
          .select({ permissions: rolesTable.permissions })
          .from(rolesTable)
          .where(
            and(
              eq(rolesTable.name, 'member'),
              eq(rolesTable.organizationId, '00000000-0000-0000-0000-000000000000'), // System roles
            ),
          )
          .limit(1);

        if (defaultRole.length > 0) {
          permissions = defaultRole[0].permissions as string[];
        }
      }

      // Get team-specific permissions (if any)
      const teamPermissions: Record<string, string[]> = {};
      const userTeams = await db
        .select({
          teamId: userTeamsTable.teamId,
          permissions: userTeamsTable.permissions,
        })
        .from(userTeamsTable)
        .where(eq(userTeamsTable.userId, userId));

      userTeams.forEach((team) => {
        teamPermissions[team.teamId] = team.permissions as string[];
      });

      return {
        userId,
        organizationId,
        role,
        permissions,
        teamPermissions: Object.keys(teamPermissions).length > 0 ? teamPermissions : undefined,
      };
    } catch (error) {
      logger.error('Get user permissions error:', error);
      throw error;
    }
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(
    userId: string,
    organizationId: string,
    requiredPermission: string,
    resourceId?: string,
    scope?: 'organization' | 'team' | 'own',
  ): Promise<boolean> {
    try {
      const userPermissions = await this.getUserPermissions(userId, organizationId);

      // Check direct permissions
      if (this.checkPermissionMatch(userPermissions.permissions, requiredPermission)) {
        return true;
      }

      // Check team-specific permissions if scope is team
      if (scope === 'team' && userPermissions.teamPermissions && resourceId) {
        for (const teamPerms of Object.values(userPermissions.teamPermissions)) {
          if (this.checkPermissionMatch(teamPerms, requiredPermission)) {
            return true;
          }
        }
      }

      // Check wildcard permissions
      if (this.checkWildcardPermission(userPermissions.permissions, requiredPermission)) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Check permission error:', error);
      return false;
    }
  }

  /**
   * Check permission pattern matching
   */
  private checkPermissionMatch(userPermissions: string[], requiredPermission: string): boolean {
    return userPermissions.some((perm) => {
      // Exact match
      if (perm === requiredPermission) { return true; }

      // Wildcard match (resource:*)
      if (perm.endsWith(':*')) {
        const resourcePrefix = perm.slice(0, -1); // Remove :*
        if (requiredPermission.startsWith(resourcePrefix)) { return true; }
      }

      // Action wildcard match (*:action)
      if (perm.startsWith('*:') && requiredPermission.endsWith(perm.slice(1))) { return true; }

      return false;
    });
  }

  /**
   * Check wildcard permission patterns
   */
  private checkWildcardPermission(userPermissions: string[], requiredPermission: string): boolean {
    return userPermissions.some((perm) => {
      // Global wildcard (*)
      if (perm === '*') { return true; }

      // Resource wildcard (resource:*)
      if (perm.endsWith(':*')) {
        const resource = perm.split(':')[0];
        if (requiredPermission.startsWith(`${resource}:`)) { return true; }
      }

      return false;
    });
  }

  /**
   * Get all permissions
   */
  async getAllPermissions() {
    try {
      const permissions = await db
        .select()
        .from(permissionsTable)
        .orderBy(permissionsTable.resource, permissionsTable.action);

      return permissions;
    } catch (error) {
      logger.error('Get all permissions error:', error);
      throw error;
    }
  }

  /**
   * Get roles for organization
   */
  async getOrganizationRoles(organizationId: string) {
    try {
      const roles = await db
        .select()
        .from(rolesTable)
        .where(eq(rolesTable.organizationId, organizationId))
        .orderBy(rolesTable.name);

      return roles;
    } catch (error) {
      logger.error('Get organization roles error:', error);
      throw error;
    }
  }

  /**
   * Create role
   */
  async createRole(
    organizationId: string,
    data: {
      name: string;
      description?: string;
      permissions: string[];
    },
  ) {
    try {
      const [role] = await db
        .insert(rolesTable)
        .values({
          organizationId,
          name: data.name,
          description: data.description,
          permissions: data.permissions,
          type: 'custom',
        })
        .returning();

      logger.info(`Role created: ${role.name} (${role.id}) in organization ${organizationId}`);
      return role;
    } catch (error) {
      logger.error('Create role error:', error);
      throw error;
    }
  }

  /**
   * Update role
   */
  async updateRole(
    roleId: string,
    organizationId: string,
    data: {
      name?: string;
      description?: string;
      permissions?: string[];
    },
  ) {
    try {
      const [updatedRole] = await db
        .update(rolesTable)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(eq(rolesTable.id, roleId), eq(rolesTable.organizationId, organizationId)))
        .returning();

      if (!updatedRole) {
        throw new Error('Role not found');
      }

      logger.info(`Role updated: ${updatedRole.name} (${roleId})`);
      return updatedRole;
    } catch (error) {
      logger.error('Update role error:', error);
      throw error;
    }
  }

  /**
   * Delete role
   */
  async deleteRole(roleId: string, organizationId: string) {
    try {
      // Check if role is in use
      // TODO: Add validation to prevent deleting roles that are assigned to users

      const result = await db
        .delete(rolesTable)
        .where(and(eq(rolesTable.id, roleId), eq(rolesTable.organizationId, organizationId)));

      if (result.rowCount === 0) {
        throw new Error('Role not found');
      }

      logger.info(`Role deleted: ${roleId}`);
      return true;
    } catch (error) {
      logger.error('Delete role error:', error);
      throw error;
    }
  }

  /**
   * Validate permission format
   */
  validatePermissionFormat(permission: string): boolean {
    // Permission format: resource:action or resource:*
    const parts = permission.split(':');
    return parts.length === 2 && parts[0].length > 0 && (parts[1] === '*' || parts[1].length > 0);
  }

  /**
   * Get permission scope
   */
  getPermissionScope(permission: string): 'organization' | 'team' | 'own' {
    // This is a simplified implementation
    // In a real system, this would be more sophisticated
    const resource = permission.split(':')[0];

    switch (resource) {
      case 'organization':
        return 'organization';
      case 'team':
        return 'team';
      default:
        return 'own';
    }
  }
}

export const permissionService = new PermissionService();
