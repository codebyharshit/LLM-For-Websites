import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { getEnv } from "@supportrag/shared";
import { schema } from "./schema/index.js";

export type DbSchema = typeof schema;
export type Database = NodePgDatabase<DbSchema>;

let pool: pg.Pool | undefined;
let admin: Database | undefined;

/** Lazily-created shared connection pool (connects as the superuser `app` role). */
export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: getEnv().DATABASE_URL });
  }
  return pool;
}

/**
 * RLS-BYPASSING admin client (runs as the superuser `app`). Use ONLY for migrations,
 * seeding, and tests — never for handling tenant traffic. For tenant traffic use
 * `withTenant`, which runs as the non-superuser `app_rls` role under RLS.
 */
export function getAdminDb(): Database {
  if (!admin) {
    admin = drizzle(getPool(), { schema });
  }
  return admin;
}

/** Close the pool (call in test teardown / graceful shutdown). */
export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    admin = undefined;
    await p.end();
  }
}
