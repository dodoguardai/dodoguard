import { getDbType } from '../../database';

export function getUsersTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../../database/tables-mysql');
    return mysqlTables.usersTable;
  }
  const pgTables = require('../../database/tables-enterprise');
  return pgTables.usersTable;
}
