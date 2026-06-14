/**
 * PERMANENT CROSS-TENANT ISOLATION GUARD.
 *
 * Tenant isolation is the product's #1 non-negotiable. This test must stay green forever
 * and is a required CI check. None of the queries below add an app-level `tenant_id`
 * filter — isolation is proven to come from Postgres RLS itself (the second lock), not
 * from application code remembering to filter.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenant } from "../withTenant.js";
import { closePool } from "../client.js";
import {
  users,
  bots,
  rules,
  sources,
  documents,
  chunks,
  conversations,
  messages,
} from "../schema/index.js";
import { seedTenant, type SeededTenant } from "./helpers.js";

// Each entry runs a FILTER-LESS select of just the tenant_id column for one tenant table.
const tenantTables = [
  { name: "users", select: () => ({ tenantId: users.tenantId }), from: users },
  { name: "bots", select: () => ({ tenantId: bots.tenantId }), from: bots },
  { name: "rules", select: () => ({ tenantId: rules.tenantId }), from: rules },
  { name: "sources", select: () => ({ tenantId: sources.tenantId }), from: sources },
  { name: "documents", select: () => ({ tenantId: documents.tenantId }), from: documents },
  { name: "chunks", select: () => ({ tenantId: chunks.tenantId }), from: chunks },
  {
    name: "conversations",
    select: () => ({ tenantId: conversations.tenantId }),
    from: conversations,
  },
  { name: "messages", select: () => ({ tenantId: messages.tenantId }), from: messages },
] as const;

describe("cross-tenant isolation (RLS)", () => {
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    a = await seedTenant("A");
    b = await seedTenant("B");
  });

  afterAll(async () => {
    await closePool();
  });

  // rules has no seeded row; the rest do. Either way, B's rows must never appear under A.
  for (const t of tenantTables) {
    it(`${t.name}: a filter-less query under tenant A returns only A's rows`, async () => {
      const rows = await withTenant(a.tenantId, (db) => db.select(t.select()).from(t.from));
      expect(rows.every((r) => r.tenantId === a.tenantId)).toBe(true);
      expect(rows.some((r) => r.tenantId === b.tenantId)).toBe(false);
    });
  }

  it("tenant A sees its own seeded rows (not an empty-DB false pass)", async () => {
    const rows = await withTenant(a.tenantId, (db) =>
      db.select({ tenantId: chunks.tenantId }).from(chunks),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("rejects inserting a row whose tenant_id belongs to another tenant", async () => {
    await expect(
      withTenant(a.tenantId, (db) =>
        db.insert(chunks).values({
          tenantId: b.tenantId, // mismatched: violates the RLS WITH CHECK policy
          botId: a.botId,
          documentId: a.documentId,
          content: "should never be inserted",
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
