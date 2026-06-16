import { eq } from "drizzle-orm";
import { getAdminDb } from "./client.js";
import { tenants } from "./schema/index.js";

/**
 * GDPR hard-delete: remove a tenant and everything it owns. Every tenant-scoped table has
 * `ON DELETE CASCADE` to tenants(id), so deleting the root row purges users, bots, rules,
 * sources, documents, chunks, conversations, and messages. Uses the admin (RLS-bypassing)
 * client because it deletes the tenant root itself.
 */
export async function deleteTenant(tenantId: string): Promise<void> {
  await getAdminDb().delete(tenants).where(eq(tenants.id, tenantId));
}
