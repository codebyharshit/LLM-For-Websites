import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  seed,
  BUYCYCLE,
  closePool,
  getAdminDb,
  sources,
  documents,
  chunks as chunksTable,
  conversations,
  messages as messagesTable,
} from "@supportrag/db";
import { hashEmbed } from "@supportrag/core";
import { buildApp } from "../app.js";

async function login(app: FastifyInstance): Promise<string> {
  const link = await app.inject({
    method: "POST",
    url: "/auth/request-link",
    payload: { email: BUYCYCLE.email },
  });
  const devToken = link.json<{ devToken: string }>().devToken;
  const cb = await app.inject({
    method: "GET",
    url: `/auth/callback?token=${encodeURIComponent(devToken)}`,
  });
  return cb.cookies.find((c) => c.name === "sid")!.value;
}

describe("conversation review API", () => {
  let app: FastifyInstance;
  let sid: string;
  let conversationId: string;
  let chunkId: string;

  beforeAll(async () => {
    await seed();
    const db = getAdminDb();
    const [s] = await db
      .insert(sources)
      .values({ tenantId: BUYCYCLE.tenantId, botId: BUYCYCLE.botId, type: "text", location: "seed" })
      .returning();
    const [doc] = await db
      .insert(documents)
      .values({ tenantId: BUYCYCLE.tenantId, botId: BUYCYCLE.botId, sourceId: s!.id, url: "https://x.test/a", title: "Doc" })
      .returning();
    const [chunk] = await db
      .insert(chunksTable)
      .values({
        tenantId: BUYCYCLE.tenantId,
        botId: BUYCYCLE.botId,
        documentId: doc!.id,
        content: "Return within 30 days.",
        embedding: hashEmbed("Return within 30 days.", 1536),
      })
      .returning();
    chunkId = chunk!.id;
    const [conv] = await db
      .insert(conversations)
      .values({ tenantId: BUYCYCLE.tenantId, botId: BUYCYCLE.botId, sessionId: randomUUID() })
      .returning();
    conversationId = conv!.id;
    await db.insert(messagesTable).values([
      { tenantId: BUYCYCLE.tenantId, conversationId, role: "user", content: "How do I return?" },
      {
        tenantId: BUYCYCLE.tenantId,
        conversationId,
        role: "assistant",
        content: "You can return within 30 days [1].",
        rewrittenQuery: "How do I return a bike?",
        retrievedChunkIds: [chunkId],
        rerankTopScore: 0.9,
        modelUsed: "fake",
        tokensIn: 100,
        tokensOut: 12,
        latencyMs: 850,
        feedback: 1,
      },
    ]);
    app = await buildApp();
    sid = await login(app);
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it("lists conversations", async () => {
    const res = await app.inject({ method: "GET", url: "/conversations", cookies: { sid } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }[]>().some((c) => c.id === conversationId)).toBe(true);
  });

  it("returns the transcript, chunk trace, and feedback", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/conversations/${conversationId}`,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      messages: { role: string; feedback: number | null; modelUsed: string | null }[];
      chunks: { id: string; content: string }[];
    }>();
    expect(body.messages).toHaveLength(2);
    const assistant = body.messages.find((m) => m.role === "assistant")!;
    expect(assistant.feedback).toBe(1);
    expect(assistant.modelUsed).toBe("fake");
    expect(body.chunks.some((c) => c.id === chunkId && c.content.includes("30 days"))).toBe(true);
  });
});
