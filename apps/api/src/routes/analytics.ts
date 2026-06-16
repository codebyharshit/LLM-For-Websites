import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { estimateCost, percentile } from "@supportrag/core";
import { withTenant, messages } from "@supportrag/db";
import { requireAuth } from "../auth/plugin.js";

/** §A.5 — cost/latency observability from the logged messages turn-log. */
export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/analytics", { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = req.session!;
    const rows = await withTenant(tenantId, (db) =>
      db
        .select({
          model: messages.modelUsed,
          tokensIn: messages.tokensIn,
          tokensOut: messages.tokensOut,
          latencyMs: messages.latencyMs,
        })
        .from(messages)
        .where(eq(messages.role, "assistant")),
    );

    let totalCostUsd = 0;
    const latencies: number[] = [];
    const byModel: Record<string, number> = {};
    for (const r of rows) {
      totalCostUsd += estimateCost(r.model ?? "", r.tokensIn ?? 0, r.tokensOut ?? 0);
      if (r.latencyMs != null) latencies.push(r.latencyMs);
      const key = r.model ?? "none";
      byModel[key] = (byModel[key] ?? 0) + 1;
    }

    return reply.send({
      turns: rows.length,
      totalCostUsd,
      avgCostUsd: rows.length ? totalCostUsd / rows.length : 0,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      byModel,
    });
  });
}
