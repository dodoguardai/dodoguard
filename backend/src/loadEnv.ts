/**
 * 必须在任何会触发 getDb() 的 import 之前执行（见 database/index.ts 末尾的 `export const db = getDb()`）。
 * 否则 .env 里的配置晚于首次数据库连接，Docker/本机会出现错用 DB_SOCKET 等问题。
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
