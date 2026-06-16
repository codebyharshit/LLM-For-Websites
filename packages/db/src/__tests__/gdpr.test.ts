import { describe, it, expect, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getAdminDb, closePool } from "../client.js";
import { deleteTenant } from "../admin.js";
import { seedTenant } from "./helpers.js";

const TENANT_TABLES = [
  "users",
  "bots",
  "rules",
  "sources",
  "documents",
  "chunks",
  "conversations",
  "messages",
] as const;

async function countFor(table: string, tenantId: string): Promise<number> {
  const db = getAdminDb();
  const res = await db.execute(
    sql.raw(`SELECT count(*)::int AS c FROM ${table} WHERE tenant_id = '${tenantId}'`),
  );
  // node-postgres returns { rows: [{ c }] }
  const rows = (res as unknown as { rows: { c: number }[] }).rows;
  return rows[0]?.c ?? 0;
}

describe("GDPR hard-delete", () => {
  afterAll(async () => {
    await closePool();
  });

  it("cascades and leaves zero residual rows across all tenant tables", async () => {
    const t = await seedTenant("gdpr");
    // Pre-condition: the tenant has rows.
    expect(await countFor("chunks", t.tenantId)).toBeGreaterThan(0);
    expect(await countFor("messages", t.tenantId)).toBeGreaterThan(0);

    await deleteTenant(t.tenantId);

    for (const table of TENANT_TABLES) {
      expect(await countFor(table, t.tenantId)).toBe(0);
    }
    // The tenant root row is gone too.
    const tenantRows = await countForTenantRoot(t.tenantId);
    expect(tenantRows).toBe(0);
  });
});

async function countForTenantRoot(tenantId: string): Promise<number> {
  const res = await getAdminDb().execute(
    sql.raw(`SELECT count(*)::int AS c FROM tenants WHERE id = '${tenantId}'`),
  );
  const rows = (res as unknown as { rows: { c: number }[] }).rows;
  return rows[0]?.c ?? 0;
}
