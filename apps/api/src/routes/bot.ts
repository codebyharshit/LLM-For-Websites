import type { FastifyInstance } from "fastify";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { AppError, getEnv } from "@supportrag/shared";
import { withTenant, bots } from "@supportrag/db";
import { requireAuth } from "../auth/plugin.js";

const IdParam = z.object({ id: z.string().uuid() });

const BotPatch = z.object({
  persona: z.string().max(2000).nullable().optional(),
  greeting: z.string().max(500).nullable().optional(),
  theme: z.record(z.unknown()).optional(),
  languages: z.array(z.string().max(10)).optional(),
  quickPrompts: z.array(z.string().max(200)).optional(),
});

function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** §A.5 — tenant bot config: list, patch persona/theme/languages, embed snippet. */
export async function botRoutes(app: FastifyInstance): Promise<void> {
  app.get("/bot", { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = req.session!;
    const rows = await withTenant(tenantId, (db) =>
      db.select().from(bots).orderBy(asc(bots.createdAt)),
    );
    return reply.send(rows);
  });

  app.patch("/bot/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const patch = definedOnly(BotPatch.parse(req.body));
    const { tenantId } = req.session!;
    const updated = await withTenant(tenantId, async (db) => {
      const [row] = await db
        .update(bots)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(bots.id, id))
        .returning();
      return row;
    });
    if (!updated) throw new AppError("bot_not_found", "bot not found", 404);
    return reply.send(updated);
  });

  app.get("/embed-snippet", { preHandler: requireAuth }, async (req, reply) => {
    const { bot_id } = z.object({ bot_id: z.string().uuid() }).parse(req.query);
    const { tenantId } = req.session!;
    const bot = await withTenant(tenantId, async (db) => {
      const [row] = await db
        .select({ publicToken: bots.publicToken })
        .from(bots)
        .where(eq(bots.id, bot_id));
      return row;
    });
    if (!bot) throw new AppError("bot_not_found", "bot not found", 404);
    const cdn = getEnv().WIDGET_CDN_URL;
    const apiBase = `${req.protocol}://${req.host}`;
    const snippet = `<script src="${cdn}/widget.js" data-bot-token="${bot.publicToken}" data-api-url="${apiBase}"></script>`;
    return reply.send({ snippet });
  });
}
