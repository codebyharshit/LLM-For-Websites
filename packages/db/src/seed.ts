import { getAdminDb, closePool } from "./client.js";
import { tenants, users, bots } from "./schema/index.js";
import { logger } from "@supportrag/shared";

/** Stable fixture identifiers so the seed is idempotent (re-runs are no-ops). */
export const BUYCYCLE = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  botId: "33333333-3333-3333-3333-333333333333",
  tenantName: "Buycycle",
  botName: "Buycycle Support",
  email: "owner@buycycle.test",
  publicToken: "pk_buycycle_dev_000000000000",
} as const;

/**
 * Create the golden Buycycle fixture tenant + owner user + one bot. Idempotent via fixed
 * ids and ON CONFLICT DO NOTHING, so it is safe to run repeatedly. Uses the admin client.
 */
export async function seed(): Promise<void> {
  const db = getAdminDb();
  await db
    .insert(tenants)
    .values({ id: BUYCYCLE.tenantId, name: BUYCYCLE.tenantName })
    .onConflictDoNothing();
  await db
    .insert(users)
    .values({ id: BUYCYCLE.userId, tenantId: BUYCYCLE.tenantId, email: BUYCYCLE.email })
    .onConflictDoNothing();
  await db
    .insert(bots)
    .values({
      id: BUYCYCLE.botId,
      tenantId: BUYCYCLE.tenantId,
      name: BUYCYCLE.botName,
      publicToken: BUYCYCLE.publicToken,
      greeting: "Hi! Ask me anything about Buycycle.",
      languages: ["en"],
      quickPrompts: ["How do I return a bike?"],
    })
    .onConflictDoNothing();
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (invokedDirectly) {
  seed()
    .then(() => {
      logger.info({ tenant: BUYCYCLE.tenantName }, "seed complete");
      return closePool();
    })
    .catch((err: unknown) => {
      logger.error({ err }, "seed failed");
      process.exit(1);
    });
}
