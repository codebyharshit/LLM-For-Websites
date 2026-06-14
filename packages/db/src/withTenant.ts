import { drizzle } from "drizzle-orm/node-postgres";
import { AppError } from "@supportrag/shared";
import { getPool, type Database } from "./client.js";
import { schema } from "./schema/index.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` inside a transaction scoped to a single tenant. RLS is the enforcement:
 * we switch to the non-superuser `app_rls` role and set `app.tenant_id`, so even a
 * filter-less query returns only this tenant's rows. SET LOCAL reverts on COMMIT/ROLLBACK,
 * so the pooled connection returns clean.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new AppError("invalid_tenant_id", `tenantId is not a valid uuid: ${tenantId}`, 400);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Become the role RLS applies to, then bind the tenant for this transaction.
    await client.query("SET LOCAL ROLE app_rls");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

    const db = drizzle(client, { schema }) as unknown as Database;
    const result = await fn(db);

    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
