import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  seed,
  BUYCYCLE,
  closePool,
  getAdminDb,
  conversations,
  messages as messagesTable,
} from "@supportrag/db";
import type { EscalationPayload } from "@supportrag/core";
import { buildApp } from "../app.js";

describe("widget endpoints", () => {
  let app: FastifyInstance;
  let conversationId: string;
  let messageId: string;
  const auth = { authorization: `Bearer ${BUYCYCLE.publicToken}` };

  beforeAll(async () => {
    await seed();
    const db = getAdminDb();
    const [conv] = await db
      .insert(conversations)
      .values({ tenantId: BUYCYCLE.tenantId, botId: BUYCYCLE.botId, sessionId: randomUUID() })
      .returning();
    conversationId = conv!.id;
    const [msg] = await db
      .insert(messagesTable)
      .values({
        tenantId: BUYCYCLE.tenantId,
        conversationId,
        role: "assistant",
        content: "You can return within 30 days.",
      })
      .returning();
    messageId = msg!.id;
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it("GET /v1/widget-config returns config for a valid bot token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/widget-config", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ greeting: string; quick_prompts: string[]; languages: string[] }>();
    expect(body.greeting).toContain("Buycycle");
    expect(body.quick_prompts).toContain("How do I return a bike?");
    expect(body.languages).toContain("en");
  });

  it("GET /v1/widget-config without a token is 401", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/widget-config" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/feedback records a thumbs value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: auth,
      payload: { message_id: messageId, value: 1 },
    });
    expect(res.statusCode).toBe(200);
    const [row] = await getAdminDb()
      .select({ feedback: messagesTable.feedback })
      .from(messagesTable)
      .where(eq(messagesTable.id, messageId));
    expect(row?.feedback).toBe(1);
  });

  it("POST /v1/escalate captures a lead and delivers the transcript", async () => {
    const captured: EscalationPayload[] = [];
    const app2 = await buildApp({
      escalationDelivery: { deliver: async (p) => void captured.push(p) },
    });
    try {
      const res = await app2.inject({
        method: "POST",
        url: "/v1/escalate",
        headers: auth,
        payload: { conversation_id: conversationId, email: "lead@example.com", note: "call me" },
      });
      expect(res.statusCode).toBe(200);

      const [row] = await getAdminDb()
        .select({ escalated: conversations.escalated, leadEmail: conversations.leadEmail })
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      expect(row?.escalated).toBe(true);
      expect(row?.leadEmail).toBe("lead@example.com");

      expect(captured).toHaveLength(1);
      expect(captured[0]!.leadEmail).toBe("lead@example.com");
      expect(captured[0]!.note).toBe("call me");
      expect(captured[0]!.ownerEmail).toBe(BUYCYCLE.email);
      expect(captured[0]!.transcript.length).toBeGreaterThan(0);
    } finally {
      await app2.close();
    }
  });
});
