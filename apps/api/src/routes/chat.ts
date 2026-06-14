import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { z } from "zod";
import { rateLimit } from "@supportrag/core";
import { withTenant, conversations } from "@supportrag/db";
import { parseBearer, getBotByToken } from "../auth/botToken.js";
import { SSEStream } from "../sse.js";

const ChatBody = z.object({
  session_id: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
});

export interface ChatRouteDeps {
  redis: Redis;
  rateLimit?: { limit: number; windowSec: number };
}

/** Upsert (bot_id, session_id) → conversation id, under the tenant's RLS context. */
export async function upsertConversation(
  tenantId: string,
  botId: string,
  sessionId: string,
): Promise<string> {
  return withTenant(tenantId, async (db) => {
    const [row] = await db
      .insert(conversations)
      .values({ tenantId, botId, sessionId })
      .onConflictDoUpdate({
        target: [conversations.botId, conversations.sessionId],
        set: { updatedAt: new Date() },
      })
      .returning({ id: conversations.id });
    return row!.id;
  });
}

/**
 * §A.4 — public widget chat endpoint. T2.1 scaffolds auth + rate limit + conversation upsert
 * + SSE plumbing, streaming a hardcoded token/done sequence. The real RAG pipeline
 * (rewrite → retrieve → rerank → gate → generate → guard → persist) is wired in T2.2–T2.8.
 */
export async function chatRoutes(app: FastifyInstance, deps: ChatRouteDeps): Promise<void> {
  const limit = deps.rateLimit?.limit ?? 30;
  const windowSec = deps.rateLimit?.windowSec ?? 60;

  app.post("/v1/chat", async (req, reply) => {
    const token = parseBearer(req.headers["authorization"]);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const bot = await getBotByToken(token);
    if (!bot) return reply.code(401).send({ error: "unauthorized" });

    const body = ChatBody.parse(req.body);

    const rl = await rateLimit(deps.redis, `chat:${bot.id}:${body.session_id}`, limit, windowSec);
    if (!rl.allowed) {
      return reply.code(429).send({ error: "rate_limited", retry_after: rl.resetSec });
    }

    const conversationId = await upsertConversation(bot.tenantId, bot.id, body.session_id);

    reply.hijack();
    const sse = new SSEStream(reply);
    try {
      sse.send("token", { delta: "Hello! " });
      sse.send("token", { delta: "(pipeline coming in T2.2–T2.8)" });
      sse.send("done", {
        message_id: randomUUID(),
        conversation_id: conversationId,
        sources: [],
        escalate: false,
        model_used: "scaffold",
      });
    } finally {
      sse.close();
    }
  });
}
