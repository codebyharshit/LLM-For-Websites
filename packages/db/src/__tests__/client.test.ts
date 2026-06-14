import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenant } from "../withTenant.js";
import { closePool } from "../client.js";
import { chunks } from "../schema/index.js";
import { seedTenant, type SeededTenant } from "./helpers.js";

describe("withTenant", () => {
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    a = await seedTenant("A");
    b = await seedTenant("B");
  });

  afterAll(async () => {
    await closePool();
  });

  it("scopes a query to the active tenant's rows only", async () => {
    const rows = await withTenant(a.tenantId, (db) => db.select().from(chunks));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === a.tenantId)).toBe(true);
    expect(rows.some((r) => r.tenantId === b.tenantId)).toBe(false);
  });

  it("rejects an invalid tenant id", async () => {
    await expect(withTenant("not-a-uuid", async () => 1)).rejects.toThrow(/valid uuid/);
  });
});
