import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { seed, BUYCYCLE, closePool } from "@supportrag/db";
import { buildApp } from "../app.js";

describe("magic-link auth + tenant scoping", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await seed();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it("runs the seed idempotently", async () => {
    await seed();
    await seed(); // second/third run must not throw or duplicate
  });

  it("logs in via magic link and /me returns the Buycycle tenant", async () => {
    const link = await app.inject({
      method: "POST",
      url: "/auth/request-link",
      payload: { email: BUYCYCLE.email },
    });
    expect(link.statusCode).toBe(200);
    const devToken = link.json<{ devToken: string }>().devToken;
    expect(devToken).toBeTruthy();

    const cb = await app.inject({
      method: "GET",
      url: `/auth/callback?token=${encodeURIComponent(devToken)}`,
    });
    expect(cb.statusCode).toBe(200);
    const sid = cb.cookies.find((c) => c.name === "sid");
    expect(sid?.value).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/me",
      cookies: { sid: sid!.value },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ tenant: { name: string } }>().tenant.name).toBe(BUYCYCLE.tenantName);
  });

  it("rejects /me without a session", async () => {
    const me = await app.inject({ method: "GET", url: "/me" });
    expect(me.statusCode).toBe(401);
  });

  it("does not reveal unknown accounts", async () => {
    const link = await app.inject({
      method: "POST",
      url: "/auth/request-link",
      payload: { email: "nobody@example.com" },
    });
    expect(link.statusCode).toBe(200);
    expect(link.json<{ devToken?: string }>().devToken).toBeUndefined();
  });
});
