import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "@supportrag/shared";
import { withTenant, bots, rules } from "@supportrag/db";
import { requireAuth } from "../auth/plugin.js";

const IdParam = z.object({ id: z.string().uuid() });
const RULE_KINDS = ["persona", "policy", "guard_block", "guard_escalate"] as const;

const CreateRule = z.object({
  botId: z.string().uuid(),
  kind: z.enum(RULE_KINDS),
  content: z.string().min(1).max(4000),
  enabled: z.boolean().optional(),
});

const UpdateRule = z.object({
  kind: z.enum(RULE_KINDS).optional(),
  content: z.string().min(1).max(4000).optional(),
  enabled: z.boolean().optional(),
});

function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** §A.5 — rules CRUD (persona|policy|guard_block|guard_escalate), bot-scoped. */
export async function rulesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/rules", { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = req.session!;
    const { bot_id } = z.object({ bot_id: z.string().uuid().optional() }).parse(req.query);
    const rows = await withTenant(tenantId, (db) =>
      db
        .select()
        .from(rules)
        .where(bot_id ? eq(rules.botId, bot_id) : undefined)
        .orderBy(desc(rules.createdAt)),
    );
    return reply.send(rows);
  });

  app.post("/rules", { preHandler: requireAuth }, async (req, reply) => {
    const body = CreateRule.parse(req.body);
    const { tenantId } = req.session!;
    const created = await withTenant(tenantId, async (db) => {
      const [bot] = await db.select({ id: bots.id }).from(bots).where(eq(bots.id, body.botId));
      if (!bot) throw new AppError("bot_not_found", "bot not found", 404);
      const [row] = await db
        .insert(rules)
        .values({
          tenantId,
          botId: body.botId,
          kind: body.kind,
          content: body.content,
          enabled: body.enabled ?? true,
        })
        .returning();
      return row;
    });
    return reply.code(201).send(created);
  });

  app.patch("/rules/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const patch = definedOnly(UpdateRule.parse(req.body));
    const { tenantId } = req.session!;
    const updated = await withTenant(tenantId, async (db) => {
      const [row] = await db.update(rules).set(patch).where(eq(rules.id, id)).returning();
      return row;
    });
    if (!updated) throw new AppError("rule_not_found", "rule not found", 404);
    return reply.send(updated);
  });

  app.delete("/rules/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { tenantId } = req.session!;
    await withTenant(tenantId, (db) => db.delete(rules).where(eq(rules.id, id)));
    return reply.send({ ok: true });
  });
}
