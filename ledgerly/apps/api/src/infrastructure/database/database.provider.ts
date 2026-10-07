import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export const DATABASE = Symbol('DATABASE');
export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(): Database {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString, max: 10 });
  return drizzle(pool, { schema });
}
