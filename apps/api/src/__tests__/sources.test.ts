import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  seed,
  BUYCYCLE,
  closePool,
  getAdminDb,
  sources as sourcesTable,
} from "@supportrag/db";
import { makeRedisConnection, createIngestQueue } from "@supportrag/core";
import { buildApp } from "../app.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

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

describe("POST /sources", () => {
  let app: FastifyInstance;
  let sid: string;

  beforeAll(async () => {
    await seed();
    app = await buildApp();
    sid = await login(app);
  });

  afterAll(async () => {
    await app.close();
    // Clear test jobs from the ingest queue.
    const conn = makeRedisConnection(REDIS_URL);
    const q = createIngestQueue(conn);
    await q.obliterate({ force: true });
    await q.close();
    await conn.quit();
    await closePool();
  });

  it("creates a pending source and enqueues a crawl job (202)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sources",
      cookies: { sid },
      payload: { type: "url", botId: BUYCYCLE.botId, url: "https://example.com/help" },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json<{ job_id: string; source_id: string }>();
    expect(body.job_id).toBe(body.source_id);

    const [row] = await getAdminDb()
      .select()
      .from(sourcesTable)
      .where(eq(sourcesTable.id, body.source_id));
    expect(row?.status).toBe("pending");
    expect(row?.type).toBe("url");
    expect(row?.tenantId).toBe(BUYCYCLE.tenantId);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sources",
      payload: { type: "url", botId: BUYCYCLE.botId, url: "https://example.com" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("400s on an invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sources",
      cookies: { sid },
      payload: { type: "url", botId: "not-a-uuid", url: "nope" },
    });
    expect(res.statusCode).toBe(400);
  });

  async function createUrlSource(url: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/sources",
      cookies: { sid },
      payload: { type: "url", botId: BUYCYCLE.botId, url },
    });
    return res.json<{ source_id: string }>().source_id;
  }

  it("lists the tenant's sources", async () => {
    const id = await createUrlSource("https://example.com/list-me");
    const res = await app.inject({ method: "GET", url: "/sources", cookies: { sid } });
    expect(res.statusCode).toBe(200);
    const rows = res.json<{ id: string }[]>();
    expect(rows.some((r) => r.id === id)).toBe(true);
  });

  it("resyncs a url source (202)", async () => {
    const id = await createUrlSource("https://example.com/resync");
    const res = await app.inject({
      method: "POST",
      url: `/sources/${id}/resync`,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(202);
    const [row] = await getAdminDb().select().from(sourcesTable).where(eq(sourcesTable.id, id));
    expect(row?.status).toBe("pending");
  });

  it("deletes a source", async () => {
    const id = await createUrlSource("https://example.com/delete-me");
    const del = await app.inject({ method: "DELETE", url: `/sources/${id}`, cookies: { sid } });
    expect(del.statusCode).toBe(200);
    const [row] = await getAdminDb().select().from(sourcesTable).where(eq(sourcesTable.id, id));
    expect(row).toBeUndefined();
  });
});
