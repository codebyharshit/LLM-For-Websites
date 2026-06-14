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

describe("bot config API", () => {
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

  it("lists the tenant's bots", async () => {
    const res = await app.inject({ method: "GET", url: "/bot", cookies: { sid } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }[]>().some((b) => b.id === BUYCYCLE.botId)).toBe(true);
  });

  it("patches persona/theme and the change reflects in widget-config", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: `/bot/${BUYCYCLE.botId}`,
      cookies: { sid },
      payload: { persona: "Witty and helpful.", theme: { primary: "#ff0000" } },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json<{ persona: string }>().persona).toBe("Witty and helpful.");

    const cfg = await app.inject({
      method: "GET",
      url: "/v1/widget-config",
      headers: { authorization: `Bearer ${BUYCYCLE.publicToken}` },
    });
    expect(cfg.json<{ theme: { primary: string } }>().theme.primary).toBe("#ff0000");
  });

  it("returns a copyable embed snippet with the public token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/embed-snippet?bot_id=${BUYCYCLE.botId}`,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(200);
    const snippet = res.json<{ snippet: string }>().snippet;
    expect(snippet).toContain("widget.js");
    expect(snippet).toContain(`data-bot-token="${BUYCYCLE.publicToken}"`);
  });
});
