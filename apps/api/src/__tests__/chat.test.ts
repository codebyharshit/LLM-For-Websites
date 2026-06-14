import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { seed, BUYCYCLE, closePool } from "@supportrag/db";
import { buildApp } from "../app.js";

describe("POST /v1/chat (SSE scaffold)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await seed();
    // Low rate limit so the test can trip it quickly.
    app = await buildApp({ chatRateLimit: { limit: 2, windowSec: 60 } });
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it("streams token + done for a valid bot token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat",
      headers: { authorization: `Bearer ${BUYCYCLE.publicToken}` },
      payload: { session_id: randomUUID(), message: "hello" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.payload).toContain("event: token");
    expect(res.payload).toContain("event: done");
    expect(res.payload).toContain('"model_used":"scaffold"');
  });

  it("rejects a missing/invalid bot token with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat",
      headers: { authorization: "Bearer not-a-real-token" },
      payload: { session_id: randomUUID(), message: "hello" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("trips the rate limit after N requests in a window", async () => {
    const session = randomUUID(); // fresh bucket per run
    const make = () =>
      app.inject({
        method: "POST",
        url: "/v1/chat",
        headers: { authorization: `Bearer ${BUYCYCLE.publicToken}` },
        payload: { session_id: session, message: "hi" },
      });
    const first = await make();
    const second = await make();
    const third = await make();
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429); // limit = 2
  });
});
