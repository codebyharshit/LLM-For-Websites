import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { seed, BUYCYCLE, closePool } from "@supportrag/db";
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

describe("rules CRUD", () => {
  let app: FastifyInstance;
  let sid: string;

  beforeAll(async () => {
    await seed();
    app = await buildApp();
    sid = await login(app);
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it("creates, lists, updates, and deletes a rule", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/rules",
      cookies: { sid },
      payload: { botId: BUYCYCLE.botId, kind: "policy", content: "No refunds after 30 days." },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string; enabled: boolean }>().id;
    expect(created.json<{ enabled: boolean }>().enabled).toBe(true);

    const list = await app.inject({
      method: "GET",
      url: `/rules?bot_id=${BUYCYCLE.botId}`,
      cookies: { sid },
    });
    expect(list.json<{ id: string }[]>().some((r) => r.id === id)).toBe(true);

    const patched = await app.inject({
      method: "PATCH",
      url: `/rules/${id}`,
      cookies: { sid },
      payload: { enabled: false },
    });
    expect(patched.json<{ enabled: boolean }>().enabled).toBe(false);

    const del = await app.inject({ method: "DELETE", url: `/rules/${id}`, cookies: { sid } });
    expect(del.statusCode).toBe(200);
  });

  it("rejects an invalid kind", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rules",
      cookies: { sid },
      payload: { botId: BUYCYCLE.botId, kind: "nonsense", content: "x" },
    });
    expect(res.statusCode).toBe(400);
  });
});
