import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import type { ChatMsg } from "@supportrag/shared";
import { getEnv, logger } from "@supportrag/shared";
import { rateLimit, answerQuestion, type LLMRouter, type AnswerDone } from "@supportrag/core";
import { withTenant, conversations, bots, rules, messages } from "@supportrag/db";
import { parseBearer, getBotByToken } from "../auth/botToken.js";
import { SSEStream } from "../sse.js";

const ChatBody = z.object({
  session_id: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
});

export interface ChatRouteDeps {
  redis: Redis;
  router: LLMRouter;
  rateLimit?: { limit: number; windowSec: number };
}

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

interface BotContext {
  name: string;
  persona: string | null;
  policies: string[];
  history: ChatMsg[];
}

async function loadBotContext(
  tenantId: string,
  botId: string,
  conversationId: string,
): Promise<BotContext> {
  return withTenant(tenantId, async (db) => {
    const [bot] = await db
      .select({ name: bots.name, persona: bots.persona })
      .from(bots)
      .where(eq(bots.id, botId));
    const policyRows = await db
      .select({ content: rules.content })
      .from(rules)
      .where(and(eq(rules.botId, botId), eq(rules.kind, "policy"), eq(rules.enabled, true)));
    const historyRows = await db
      .select({ role: messages.role, content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
    return {
      name: bot?.name ?? "Assistant",
      persona: bot?.persona ?? null,
      policies: policyRows.map((r) => r.content),
      history: historyRows.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    };
  });
}

/**
 * §A.4 — public widget chat. Runs the full RAG pipeline (rewrite → retrieve → rerank+gate →
 * generate) and streams it over SSE. Below the confidence gate it streams the refusal and
 * escalates without generating. Persisting the messages row lands in T2.8.
 */
export async function chatRoutes(app: FastifyInstance, deps: ChatRouteDeps): Promise<void> {
  const limit = deps.rateLimit?.limit ?? 30;
  const windowSec = deps.rateLimit?.windowSec ?? 60;
  const tau = getEnv().CONFIDENCE_TAU;

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
    const ctx = await loadBotContext(bot.tenantId, bot.id, conversationId);

    reply.hijack();
    const sse = new SSEStream(reply);
    let done: AnswerDone | undefined;
    try {
      for await (const ev of answerQuestion(
        {
          tenantId: bot.tenantId,
          botId: bot.id,
          bot: { name: ctx.name, persona: ctx.persona },
          policies: ctx.policies,
          history: ctx.history,
          message: body.message,
          tau,
        },
        { router: deps.router },
      )) {
        if (ev.type === "token") sse.send("token", { delta: ev.delta });
        else done = ev.payload;
      }
      sse.send("done", {
        message_id: randomUUID(),
        conversation_id: conversationId,
        sources: done?.sources ?? [],
        escalate: done?.escalate ?? false,
        model_used: done?.modelUsed ?? "none",
      });
    } catch (err) {
      logger.error({ err, botId: bot.id }, "chat generation failed");
      sse.send("error", { code: "generation_failed" });
      sse.send("done", {
        message_id: randomUUID(),
        conversation_id: conversationId,
        sources: [],
        escalate: true,
        model_used: "none",
      });
    } finally {
      sse.close();
    }
  });
}
