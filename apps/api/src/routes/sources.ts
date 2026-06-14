import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "@supportrag/shared";
import { withTenant, bots, sources } from "@supportrag/db";
import { enqueueIngest, type IngestJobName, type IngestJobMap } from "@supportrag/core";
import { requireAuth } from "../auth/plugin.js";

const SourceBody = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("url"),
    botId: z.string().uuid(),
    url: z.string().url(),
    depth: z.number().int().min(0).max(3).optional(),
  }),
  z.object({ type: z.literal("sitemap"), botId: z.string().uuid(), url: z.string().url() }),
  z.object({
    type: z.literal("text"),
    botId: z.string().uuid(),
    text: z.string().min(1),
    title: z.string().optional(),
  }),
]);

export interface SourcesRouteDeps {
  queue: Queue;
}

/**
 * §A.5 — accept a source, persist a `pending` row scoped to the session tenant, enqueue
 * the matching ingest job (jobId = sourceId for idempotency), and return 202 {job_id}.
 */
export async function sourcesRoutes(app: FastifyInstance, deps: SourcesRouteDeps): Promise<void> {
  app.post("/sources", { preHandler: requireAuth }, async (req, reply) => {
    const body = SourceBody.parse(req.body);
    const { tenantId } = req.session!;

    const source = await withTenant(tenantId, async (db) => {
      const [bot] = await db.select({ id: bots.id }).from(bots).where(eq(bots.id, body.botId));
      if (!bot) throw new AppError("bot_not_found", "bot not found for this tenant", 404);
      const [row] = await db
        .insert(sources)
        .values({
          tenantId,
          botId: body.botId,
          type: body.type,
          location: body.type === "text" ? null : body.url,
        })
        .returning();
      if (!row) throw new AppError("insert_failed", "could not create source", 500);
      return row;
    });

    const { name, data } = buildJob(body, tenantId, source.id);
    const jobId = await enqueueIngest(deps.queue, name, data, { jobId: source.id });

    return reply.code(202).send({ job_id: jobId, source_id: source.id });
  });
}

type SourceInput = z.infer<typeof SourceBody>;

function buildJob(
  body: SourceInput,
  tenantId: string,
  sourceId: string,
): { [N in IngestJobName]: { name: N; data: IngestJobMap[N] } }[IngestJobName] {
  const base = { tenantId, botId: body.botId, sourceId };
  switch (body.type) {
    case "url":
      return { name: "crawl_url", data: { ...base, url: body.url, depth: body.depth } };
    case "sitemap":
      return { name: "crawl_sitemap", data: { ...base, url: body.url } };
    case "text":
      return { name: "parse_text", data: { ...base, text: body.text, title: body.title } };
  }
}
