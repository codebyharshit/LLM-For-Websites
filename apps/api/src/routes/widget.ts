import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@supportrag/shared";
import { withTenant, bots, messages, conversations } from "@supportrag/db";
import { parseBearer, getBotByToken, type ResolvedBot } from "../auth/botToken.js";

const FeedbackBody = z.object({
  message_id: z.string().uuid(),
  value: z.union([z.literal(1), z.literal(-1)]),
});

const EscalateBody = z.object({
  conversation_id: z.string().uuid(),
  email: z.string().email(),
  note: z.string().max(2000).optional(),
});

/** Bot-token auth for public widget endpoints. Sends 401 and returns null on failure. */
async function authBot(req: FastifyRequest, reply: FastifyReply): Promise<ResolvedBot | null> {
  const token = parseBearer(req.headers["authorization"]);
  const bot = token ? await getBotByToken(token) : null;
  if (!bot) {
    await reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  return bot;
}

/** §A.4 public widget endpoints: config, feedback, escalate (lead capture). */
export async function widgetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/widget-config", async (req, reply) => {
    const bot = await authBot(req, reply);
    if (!bot) return;
    const cfg = await withTenant(bot.tenantId, async (db) => {
      const [row] = await db
        .select({
          name: bots.name,
          theme: bots.theme,
          greeting: bots.greeting,
          quickPrompts: bots.quickPrompts,
          languages: bots.languages,
        })
        .from(bots)
        .where(eq(bots.id, bot.id));
      return row;
    });
    return reply.send({
      name: cfg?.name ?? "Assistant",
      theme: cfg?.theme ?? {},
      greeting: cfg?.greeting ?? null,
      quick_prompts: cfg?.quickPrompts ?? [],
      languages: cfg?.languages ?? [],
    });
  });

  app.post("/v1/feedback", async (req, reply) => {
    const bot = await authBot(req, reply);
    if (!bot) return;
    const { message_id, value } = FeedbackBody.parse(req.body);
    // RLS scopes the update to this tenant; a foreign message_id simply matches no rows.
    await withTenant(bot.tenantId, async (db) => {
      await db.update(messages).set({ feedback: value }).where(eq(messages.id, message_id));
    });
    return reply.send({ ok: true });
  });

  app.post("/v1/escalate", async (req, reply) => {
    const bot = await authBot(req, reply);
    if (!bot) return;
    const { conversation_id, email, note } = EscalateBody.parse(req.body);
    await withTenant(bot.tenantId, async (db) => {
      await db
        .update(conversations)
        .set({ escalated: true, leadEmail: email, updatedAt: new Date() })
        .where(eq(conversations.id, conversation_id));
    });
    logger.info({ conversationId: conversation_id, hasNote: Boolean(note) }, "escalation requested");
    return reply.send({ ok: true });
  });
}
