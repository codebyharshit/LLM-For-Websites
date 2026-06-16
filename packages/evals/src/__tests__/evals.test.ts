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
import { FakeLLMRouter, hashEmbed } from "@supportrag/core";
import { generateQA } from "../generate.js";
import { recallAtK, faithfulness, idkCorrectness } from "../metrics.js";

const router = new FakeLLMRouter(1536);
const deps = { router };

describe("eval harness", () => {
  let tenantId: string;
  let botId: string;

  beforeAll(async () => {
    const db = getAdminDb();
    const [t] = await db.insert(tenants).values({ name: `ev-${randomUUID()}` }).returning();
    tenantId = t!.id;
    const [b] = await db
      .insert(bots)
      .values({ tenantId, name: "Bot", publicToken: randomUUID() })
      .returning();
    botId = b!.id;
    const [s] = await db
      .insert(sources)
      .values({ tenantId, botId, type: "text", location: "seed" })
      .returning();
    const [doc] = await db
      .insert(documents)
      .values({ tenantId, botId, sourceId: s!.id, url: "https://x.test/a", title: "Doc" })
      .returning();
    const contents = [
      "Our bike return policy allows returns within 30 days for a full refund.",
      "Shipping across the European Union takes three to five business days.",
      "Warranty covers frame defects for two years from purchase.",
    ];
    await db.insert(chunksTable).values(
      contents.map((content, i) => ({
        tenantId,
        botId,
        documentId: doc!.id,
        content,
        ordinal: i,
        embedding: hashEmbed(content, 1536),
      })),
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it("generates Q/A pairs from chunks with gold ids", async () => {
    const qa = await generateQA(tenantId, botId, 3, deps);
    expect(qa).toHaveLength(3);
    expect(qa.every((p) => p.goldChunkId && p.question.length > 0)).toBe(true);
  });

  it("achieves high recall@5 (gold chunk retrieved for its own question)", async () => {
    const qa = await generateQA(tenantId, botId, 3, deps);
    const recall = await recallAtK(tenantId, botId, qa, 5, deps);
    expect(recall).toBeGreaterThanOrEqual(0.66);
  });

  it("scores faithfulness high for grounded text, low for unrelated", () => {
    const ctx = ["returns accepted within thirty days for a full refund"];
    expect(faithfulness("returns accepted within thirty days refund", ctx)).toBeGreaterThanOrEqual(
      0.5,
    );
    expect(faithfulness("the moon orbits the planet earth nightly", ctx)).toBeLessThan(0.3);
  });

  it("correctly refuses out-of-domain questions (IDK)", async () => {
    const idk = await idkCorrectness(
      tenantId,
      botId,
      ["What is the capital of Mongolia?", "How tall is Mount Everest?"],
      0.3,
      deps,
    );
    expect(idk).toBe(1);
  });
});
