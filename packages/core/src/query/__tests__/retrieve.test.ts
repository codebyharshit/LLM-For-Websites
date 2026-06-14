import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  getAdminDb,
  closePool,
  tenants,
  bots,
  sources,
  documents,
  chunks as chunksTable,
} from "@supportrag/db";
import { FakeLLMRouter, hashEmbed } from "../../llm/fake.js";
import { retrieve } from "../retrieve.js";

const router = new FakeLLMRouter(1536);

describe("retrieve (hybrid pgvector + FTS + RRF)", () => {
  let tenantId: string;
  let botId: string;
  let otherBotId: string;
  let zxChunkId: string;

  beforeAll(async () => {
    const db = getAdminDb();
    const [t] = await db.insert(tenants).values({ name: `ret-${randomUUID()}` }).returning();
    tenantId = t!.id;
    const [b] = await db
      .insert(bots)
      .values({ tenantId, name: "bot", publicToken: randomUUID() })
      .returning();
    botId = b!.id;
    const [b2] = await db
      .insert(bots)
      .values({ tenantId, name: "other", publicToken: randomUUID() })
      .returning();
    otherBotId = b2!.id;
    const [s] = await db
      .insert(sources)
      .values({ tenantId, botId, type: "text", location: "seed" })
      .returning();
    const [doc] = await db
      .insert(documents)
      .values({ tenantId, botId, sourceId: s!.id, url: "https://x.test/a", title: "Doc" })
      .returning();

    const contents = [
      "Our bike return policy lets you return within 30 days for a refund.",
      "The ZX9000 derailleur is compatible with all 2024 carbon frames.",
      "General cycling maintenance tips for your drivetrain and brakes.",
      "Shipping options and delivery times across the European Union.",
      "Warranty coverage for frames and components explained.",
    ];
    const rows = await db
      .insert(chunksTable)
      .values(
        contents.map((content, i) => ({
          tenantId,
          botId,
          documentId: doc!.id,
          content,
          ordinal: i,
          embedding: hashEmbed(content, 1536),
        })),
      )
      .returning({ id: chunksTable.id, content: chunksTable.content });
    zxChunkId = rows.find((r) => r.content.includes("ZX9000"))!.id;

    // A chunk under a different bot that also mentions ZX9000 (must NOT be returned).
    const [doc2] = await db
      .insert(documents)
      .values({ tenantId, botId: otherBotId, sourceId: s!.id, url: "https://x.test/b", title: "Other" })
      .returning();
    await db.insert(chunksTable).values({
      tenantId,
      botId: otherBotId,
      documentId: doc2!.id,
      content: "The ZX9000 is great on other bot too.",
      embedding: hashEmbed("other ZX9000", 1536),
    });
  });

  afterAll(async () => {
    await closePool();
  });

  it("surfaces an exact product term (FTS) as the top fused result", async () => {
    const results = await retrieve("ZX9000", botId, tenantId, { router });
    expect(results.length).toBeGreaterThan(0);
    // The only FTS match also has a vector contribution → strictly highest RRF score.
    expect(results[0]!.id).toBe(zxChunkId);
    expect(results[0]!.url).toBe("https://x.test/a");
  });

  it("ranks results by descending fused score", async () => {
    const results = await retrieve("return policy refund", botId, tenantId, { router });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it("is bot-scoped: never returns another bot's chunk", async () => {
    const results = await retrieve("ZX9000", botId, tenantId, { router });
    expect(results.every((r) => r.url === "https://x.test/a")).toBe(true);
  });
});
