import { randomUUID } from "node:crypto";
import { getAdminDb } from "../client.js";
import {
  tenants,
  users,
  bots,
  sources,
  documents,
  chunks,
  conversations,
  messages,
} from "../schema/index.js";

export interface SeededTenant {
  tenantId: string;
  userId: string;
  botId: string;
  sourceId: string;
  documentId: string;
  chunkId: string;
  conversationId: string;
}

function one<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected an inserted row");
  return row;
}

/**
 * Seed a fresh, isolated tenant with the full FK chain and one of each tenant-scoped
 * row, using the RLS-bypassing admin client. Each call creates a brand-new tenant, so
 * tests are robust to leftover data from prior runs.
 */
export async function seedTenant(label: string): Promise<SeededTenant> {
  const db = getAdminDb();
  const t = one(await db.insert(tenants).values({ name: `${label}-${randomUUID()}` }).returning());
  const u = one(
    await db
      .insert(users)
      .values({ tenantId: t.id, email: `${label}-${randomUUID()}@example.com` })
      .returning(),
  );
  const b = one(
    await db
      .insert(bots)
      .values({ tenantId: t.id, name: `${label}-bot`, publicToken: randomUUID() })
      .returning(),
  );
  const s = one(
    await db
      .insert(sources)
      .values({ tenantId: t.id, botId: b.id, type: "text", location: "seed" })
      .returning(),
  );
  const d = one(
    await db
      .insert(documents)
      .values({ tenantId: t.id, botId: b.id, sourceId: s.id, title: `${label}-doc` })
      .returning(),
  );
  const c = one(
    await db
      .insert(chunks)
      .values({
        tenantId: t.id,
        botId: b.id,
        documentId: d.id,
        content: `${label} content about the return policy`,
      })
      .returning(),
  );
  const conv = one(
    await db
      .insert(conversations)
      .values({ tenantId: t.id, botId: b.id, sessionId: randomUUID() })
      .returning(),
  );
  await db
    .insert(messages)
    .values({ tenantId: t.id, conversationId: conv.id, role: "user", content: `${label} hello` });

  return {
    tenantId: t.id,
    userId: u.id,
    botId: b.id,
    sourceId: s.id,
    documentId: d.id,
    chunkId: c.id,
    conversationId: conv.id,
  };
}
