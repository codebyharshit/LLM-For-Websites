import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getAdminDb } from "./client.js";
import { tenants, users, bots } from "./schema/index.js";

export interface CreatedTenant {
  tenantId: string;
  userId: string;
  botId: string;
  publicToken: string;
}

/** Admin onboarding action: create a tenant + owner user + bot with a fresh public token. */
export async function createTenant(opts: {
  name: string;
  ownerEmail: string;
  botName?: string;
}): Promise<CreatedTenant> {
  const db = getAdminDb();
  const publicToken = `pk_${randomUUID().replace(/-/g, "")}`;
  const [t] = await db.insert(tenants).values({ name: opts.name }).returning();
  const [u] = await db
    .insert(users)
    .values({ tenantId: t!.id, email: opts.ownerEmail })
    .returning();
  const [b] = await db
    .insert(bots)
    .values({
      tenantId: t!.id,
      name: opts.botName ?? `${opts.name} Support`,
      publicToken,
      languages: ["en"],
      greeting: `Hi! Ask me anything about ${opts.name}.`,
    })
    .returning();
  return { tenantId: t!.id, userId: u!.id, botId: b!.id, publicToken };
}

/**
 * GDPR hard-delete: remove a tenant and everything it owns. Every tenant-scoped table has
 * `ON DELETE CASCADE` to tenants(id), so deleting the root row purges users, bots, rules,
 * sources, documents, chunks, conversations, and messages. Uses the admin (RLS-bypassing)
 * client because it deletes the tenant root itself.
 */
export async function deleteTenant(tenantId: string): Promise<void> {
  await getAdminDb().delete(tenants).where(eq(tenants.id, tenantId));
}
