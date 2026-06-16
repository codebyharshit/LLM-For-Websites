import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getAdminDb, closePool } from "../client.js";
import { createTenant, deleteTenant } from "../admin.js";
import { tenants, bots } from "../schema/index.js";

describe("createTenant", () => {
  const created: string[] = [];

  afterAll(async () => {
    for (const id of created) await deleteTenant(id);
    await closePool();
  });

  it("creates a tenant + owner + bot with a public token", async () => {
    const r = await createTenant({ name: "Acme Bikes", ownerEmail: `o-${Date.now()}@acme.test` });
    created.push(r.tenantId);
    expect(r.publicToken.startsWith("pk_")).toBe(true);

    const [t] = await getAdminDb().select().from(tenants).where(eq(tenants.id, r.tenantId));
    expect(t?.name).toBe("Acme Bikes");
    const [b] = await getAdminDb().select().from(bots).where(eq(bots.id, r.botId));
    expect(b?.publicToken).toBe(r.publicToken);
    expect(b?.name).toBe("Acme Bikes Support");
  });
});
