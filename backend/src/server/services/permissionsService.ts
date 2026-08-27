/**
 * Permissions Service (server)
 * Handles permission checks for API routes using DB-backed roles.
 */

import logger from '../../logger';
import { db, getDbType } from '../../database';
import { eq, and } from 'drizzle-orm';

export interface PermissionCheck {
  userId: string;
  organizationId: string;
  resource: string;
  action: string;
}

const SYSTEM_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';

let usersTable: any;
let rolesTable: any;

function getUsersTable() {
  if (!usersTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../database/tables-mysql');
      usersTable = mysqlTables.usersTable;
    } else {
      const pgTables = require('../../database/tables-enterprise');
      usersTable = pgTables.usersTable;
    }
  }
  return usersTable;
}

function getRolesTable() {
  if (!rolesTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../database/tables-mysql');
      rolesTable = mysqlTables.rolesTable;
    } else {
      const pgTables = require('../../database/tables-enterprise');
      rolesTable = pgTables.rolesTable;
    }
  }
  return rolesTable;
}

function checkPermissionMatch(permissionList: string[], resource: string, action: string): boolean {
  const required = `${resource}:${action}`;
  for (const perm of permissionList) {
    if (perm === required) { return true; }
    if (perm === '*') { return true; }
    if (perm === `${resource}:*`) { return true; }
  }
  return false;
}

class PermissionsService {
  async hasPermission(check: PermissionCheck): Promise<boolean> {
    try {
      const { userId, organizationId, resource, action } = check;

      const uTable = getUsersTable();
      const rTable = getRolesTable();
      if (!uTable || !rTable) {
        logger.warn('PermissionsService: users or roles table not initialized');
        return false;
      }

      const [user] = await db
        .select({ role: uTable.role, email: uTable.email })
        .from(uTable)
        .where(eq(uTable.id, userId))
        .limit(1);

      const roleName = (user?.role as string) || 'member';
      const roleNameLower = roleName.toLowerCase();

      // Admin role or specific admin email: allow all permissions
      if (roleNameLower === 'admin') { return true; }
      if ((user as any)?.email === 'admin@126.com') { return true; }

      let [role] = await db
        .select()
        .from(rTable)
        .where(and(eq(rTable.name, roleName), eq(rTable.organizationId, organizationId)))
        .limit(1);

      if (!role) {
        [role] = await db
          .select()
          .from(rTable)
          .where(and(eq(rTable.name, roleName), eq(rTable.organizationId, SYSTEM_ORGANIZATION_ID)))
          .limit(1);
      }

      if (!role || !role.permissions) { return false; }

      const permissions = Array.isArray(role.permissions) ? (role.permissions as string[]) : [];

      return checkPermissionMatch(permissions, resource, action);
    } catch (error) {
      logger.error('Error checking permission:', error);
      return false;
    }
  }

  async getUserPermissions(userId: string, organizationId: string): Promise<string[]> {
    try {
      const uTable = getUsersTable();
      const rTable = getRolesTable();
      if (!uTable || !rTable) { return []; }

      const [user] = await db
        .select({ role: uTable.role, email: uTable.email })
        .from(uTable)
        .where(eq(uTable.id, userId))
        .limit(1);

      const roleName = (user?.role as string) || 'member';

      // Specific admin email: return full access
      if ((user as any)?.email === 'admin@126.com') { return ['*']; }

      let [role] = await db
        .select()
        .from(rTable)
        .where(and(eq(rTable.name, roleName), eq(rTable.organizationId, organizationId)))
        .limit(1);

      if (!role) {
        [role] = await db
          .select()
          .from(rTable)
          .where(and(eq(rTable.name, roleName), eq(rTable.organizationId, SYSTEM_ORGANIZATION_ID)))
          .limit(1);
      }

      if (!role || !role.permissions) { return []; }
      return Array.isArray(role.permissions) ? (role.permissions as string[]) : [];
    } catch (error) {
      logger.error('Error getting user permissions:', error);
      return [];
    }
  }
}

export const permissionsService = new PermissionsService();
