import type { FastifyInstance } from "fastify";
import { eq, asc, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { withTenant, conversations, messages, chunks } from "@supportrag/db";
import { requireAuth } from "../auth/plugin.js";

const IdParam = z.object({ id: z.string().uuid() });

/** §A.5 — conversation review: list + detail (transcript, retrieved chunk trace, feedback). */
export async function conversationsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/conversations", { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = req.session!;
    const rows = await withTenant(tenantId, (db) =>
      db.select().from(conversations).orderBy(desc(conversations.updatedAt)).limit(100),
    );
    return reply.send(rows);
  });

  app.get("/conversations/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { tenantId } = req.session!;
    const result = await withTenant(tenantId, async (db) => {
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id));
      if (!conversation) return null;
      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, id))
        .orderBy(asc(messages.createdAt));
      const chunkIds = [...new Set(msgs.flatMap((m) => m.retrievedChunkIds ?? []))];
      const chunkRows = chunkIds.length
        ? await db
            .select({
              id: chunks.id,
              content: chunks.content,
              headingPath: chunks.headingPath,
              documentId: chunks.documentId,
            })
            .from(chunks)
            .where(inArray(chunks.id, chunkIds))
        : [];
      return { conversation, messages: msgs, chunks: chunkRows };
    });
    if (!result) return reply.code(404).send({ error: "not_found" });
    return reply.send(result);
  });
}
