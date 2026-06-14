import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  getAdminDb,
  withTenant,
  closePool,
  tenants,
  bots,
  sources,
  chunks as chunksTable,
} from "@supportrag/db";
import { ingestDocument } from "../orchestrate.js";
import { FakeLLMRouter } from "../../llm/fake.js";

const router = new FakeLLMRouter(1536);

const MD_V1 = [
  "# Help",
  "## Returns",
  Array.from({ length: 300 }, () => "alpha").join(" "),
  "",
  Array.from({ length: 300 }, () => "beta").join(" "),
  "",
].join("\n");

const MD_V2 = MD_V1 + "\n## Refunds\n" + Array.from({ length: 200 }, () => "gamma").join(" ") + "\n";

describe("ingestDocument (embed + upsert + hash-skip)", () => {
  let tenantId: string;
  let botId: string;
  let sourceId: string;
  const url = "https://buycycle.test/help/returns";

  beforeAll(async () => {
    const db = getAdminDb();
    const [t] = await db.insert(tenants).values({ name: `ing-${randomUUID()}` }).returning();
    tenantId = t!.id;
    const [b] = await db
      .insert(bots)
      .values({ tenantId, name: "bot", publicToken: randomUUID() })
      .returning();
    botId = b!.id;
    const [s] = await db
      .insert(sources)
      .values({ tenantId, botId, type: "url", location: url })
      .returning();
    sourceId = s!.id;
  });

  afterAll(async () => {
    await closePool();
  });

  async function chunkCount(): Promise<number> {
    return withTenant(tenantId, async (db) => {
      const rows = await db
        .select({ id: chunksTable.id })
        .from(chunksTable)
        .where(eq(chunksTable.tenantId, tenantId));
      return rows.length;
    });
  }

  it("embeds and upserts chunks with 1536-dim vectors and bot_id", async () => {
    const res = await ingestDocument(
      { tenantId, botId, sourceId, url, title: "Returns", markdown: MD_V1 },
      { router },
    );
    expect(res.skipped).toBe(false);
    expect(res.chunkCount).toBeGreaterThan(0);

    const rows = await withTenant(tenantId, async (db) =>
      db
        .select({ embedding: chunksTable.embedding, botId: chunksTable.botId })
        .from(chunksTable)
        .where(eq(chunksTable.documentId, res.documentId)),
    );
    expect(rows.length).toBe(res.chunkCount);
    expect(rows[0]!.embedding).toHaveLength(1536);
    expect(rows.every((r) => r.botId === botId)).toBe(true);
  });

  it("skips re-embedding when content is unchanged (hash skip)", async () => {
    const before = await chunkCount();
    const res = await ingestDocument(
      { tenantId, botId, sourceId, url, title: "Returns", markdown: MD_V1 },
      { router },
    );
    expect(res.skipped).toBe(true);
    expect(await chunkCount()).toBe(before); // no new chunks
  });

  it("re-embeds and replaces chunks when content changes", async () => {
    const res = await ingestDocument(
      { tenantId, botId, sourceId, url, title: "Returns", markdown: MD_V2 },
      { router },
    );
    expect(res.skipped).toBe(false);
    // Old chunks for the document were deleted and replaced (no duplication).
    const rows = await withTenant(tenantId, async (db) =>
      db.select({ id: chunksTable.id }).from(chunksTable).where(eq(chunksTable.documentId, res.documentId)),
    );
    expect(rows.length).toBe(res.chunkCount);
  });
});
