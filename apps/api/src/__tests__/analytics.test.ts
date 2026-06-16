import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { seed, BUYCYCLE, closePool, getAdminDb, conversations, messages } from "@supportrag/db";
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

describe("GET /analytics", () => {
  let app: FastifyInstance;
  let sid: string;

  beforeAll(async () => {
    await seed();
    const db = getAdminDb();
    const [conv] = await db
      .insert(conversations)
      .values({ tenantId: BUYCYCLE.tenantId, botId: BUYCYCLE.botId, sessionId: randomUUID() })
      .returning();
    await db.insert(messages).values([
      {
        tenantId: BUYCYCLE.tenantId,
        conversationId: conv!.id,
        role: "assistant",
        content: "a",
        modelUsed: "gemini-1.5-flash",
        tokensIn: 1000,
        tokensOut: 500,
        latencyMs: 800,
      },
      {
        tenantId: BUYCYCLE.tenantId,
        conversationId: conv!.id,
        role: "assistant",
        content: "b",
        modelUsed: "claude-3-5-haiku-latest",
        tokensIn: 2000,
        tokensOut: 300,
        latencyMs: 2400,
      },
    ]);
    app = await buildApp();
    sid = await login(app);
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it("reports per-turn cost and p50/p95 latency from the turn log", async () => {
    const res = await app.inject({ method: "GET", url: "/analytics", cookies: { sid } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      turns: number;
      totalCostUsd: number;
      avgCostUsd: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
      byModel: Record<string, number>;
    }>();
    expect(body.turns).toBeGreaterThanOrEqual(2);
    expect(body.totalCostUsd).toBeGreaterThan(0);
    expect(body.avgCostUsd).toBeGreaterThan(0);
    expect(body.p95LatencyMs).toBeGreaterThanOrEqual(body.p50LatencyMs);
    expect(body.byModel["gemini-1.5-flash"]).toBeGreaterThanOrEqual(1);
  });
});
