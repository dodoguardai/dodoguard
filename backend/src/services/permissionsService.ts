/**
 * Permissions Service
 * Handles permission checking and role management
 */

import { db } from '../database';
import { rolesTable, permissionsTable, } from '../database/tables-enterprise';
import { eq, } from 'drizzle-orm';
import logger from '../logger';

export interface PermissionCheck {
  userId: string;
  organizationId: string;
  resource: string;
  action: string;
  scope?: 'organization' | 'team' | 'own';
}

export class PermissionsService {
  /**
   * Check if user has specific permission
   */
  async hasPermission(check: PermissionCheck): Promise<boolean> {
    try {
      const { userId, organizationId, resource, action, scope = 'organization' } = check;

      // Get user roles
      const userRoles = await this.getUserRoles(userId, organizationId);

      if (userRoles.length === 0) {
        return false;
      }

      // Check if any role has the required permission
      for (const role of userRoles) {
        if (await this.checkRolePermission(role.id, resource, action, scope)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Permission check error:', error);
      return false;
    }
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string, organizationId: string): Promise<string[]> {
    try {
      const roles = await this.getUserRoles(userId, organizationId);
      const permissions = new Set<string>();

      for (const role of roles) {
        const rolePermissions = await this.getRolePermissions(role.id);
        rolePermissions.forEach((perm) => permissions.add(perm));
      }

      return Array.from(permissions);
    } catch (error) {
      logger.error('Get user permissions error:', error);
      return [];
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string, organizationId: string) {
    try {
      // Get direct user role and team roles
      const roles = await db
        .select({
          id: rolesTable.id,
          name: rolesTable.name,
          permissions: rolesTable.permissions,
        })
        .from(rolesTable)
        .where(eq(rolesTable.organizationId, organizationId));

      // Filter roles based on user assignment
      const userRoles = [];

      for (const role of roles) {
        // Check if user has this role directly (simplified - in real app would check user_roles table)
        if (role.name === 'Admin' && userId) {
          // Simplified check
          userRoles.push(role);
        }
        // Add default role if no specific roles assigned
        if (role.isDefault) {
          userRoles.push(role);
        }
      }

      return userRoles;
    } catch (error) {
      logger.error('Get user roles error:', error);
      return [];
    }
  }

  /**
   * Check if role has specific permission
   */
  async checkRolePermission(
    roleId: string,
    resource: string,
    action: string,
    _scope: string = 'organization',
  ): Promise<boolean> {
    try {
      const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId)).limit(1);

      if (!role) {
        return false;
      }

      // Check if role has wildcard permission
      if (role.permissions.includes('*')) {
        return true;
      }

      // Check specific permissions
      const requiredPermission = `${resource}:${action}`;
      return role.permissions.includes(requiredPermission);
    } catch (error) {
      logger.error('Check role permission error:', error);
      return false;
    }
  }

  /**
   * Get role permissions
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    try {
      const [role] = await db
        .select({ permissions: rolesTable.permissions })
        .from(rolesTable)
        .where(eq(rolesTable.id, roleId))
        .limit(1);

      return role?.permissions || [];
    } catch (error) {
      logger.error('Get role permissions error:', error);
      return [];
    }
  }

  /**
   * Check if user owns resource
   */
  async isResourceOwner(
    _userId: string,
    resourceType: string,
    _resourceId: string,
  ): Promise<boolean> {
    try {
      // This would check ownership based on resource type
      // For now, simplified implementation
      switch (resourceType) {
        case 'attack_task':
          // Check if user created the task
          return true; // Simplified
        case 'target_agent':
          // Check if user owns the agent
          return true; // Simplified
        default:
          return false;
      }
    } catch (error) {
      logger.error('Resource ownership check error:', error);
      return false;
    }
  }

  /**
   * Validate permission format
   */
  validatePermission(permission: string): boolean {
    const parts = permission.split(':');
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
  }

  /**
   * Get all available permissions
   */
  async getAllPermissions() {
    try {
      return await db.select().from(permissionsTable);
    } catch (error) {
      logger.error('Get all permissions error:', error);
      return [];
    }
  }
}

export const permissionsService = new PermissionsService();
