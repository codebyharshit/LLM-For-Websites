import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  getAdminDb,
  withTenant,
  closePool,
  tenants,
  bots,
  sources,
  chunks as chunksTable,
} from "@supportrag/db";
import { FakeLLMRouter, type PageFetcher } from "@supportrag/core";
import { ingestCrawlUrl, ingestParseText } from "../handlers.js";

const router = new FakeLLMRouter(1536);
const fetchText = async (): Promise<string | null> => null; // robots: allow all, offline

const SITE: Record<string, { title: string; html: string }> = {
  "https://buycycle.test/help": {
    title: "Help",
    html: `<main><h1>Help</h1><p>Welcome to help.</p><a href="/help/returns">returns</a></main><footer>foot</footer>`,
  },
  "https://buycycle.test/help/returns": {
    title: "Returns",
    html: `<main><h2>Returns</h2><p>Return policy details below.</p><table><tr><th>Window</th></tr><tr><td>30 days</td></tr></table></main>`,
  },
};

const goodFetcher: PageFetcher = {
  async fetch(url) {
    const p = SITE[url];
    if (!p) throw new Error(`404 ${url}`);
    return { url, title: p.title, html: p.html };
  },
};

const badFetcher: PageFetcher = {
  async fetch(url) {
    throw new Error(`connection refused: ${url}`);
  },
};

describe("worker ingest handlers + source status", () => {
  let tenantId: string;
  let botId: string;

  beforeAll(async () => {
    const db = getAdminDb();
    const [t] = await db.insert(tenants).values({ name: `w-${randomUUID()}` }).returning();
    tenantId = t!.id;
    const [b] = await db
      .insert(bots)
      .values({ tenantId, name: "bot", publicToken: randomUUID() })
      .returning();
    botId = b!.id;
  });

  afterAll(async () => {
    await closePool();
  });

  async function makeSource(type: "url" | "text", location: string): Promise<string> {
    const [s] = await getAdminDb()
      .insert(sources)
      .values({ tenantId, botId, type, location })
      .returning();
    return s!.id;
  }

  async function getSource(id: string) {
    const [row] = await getAdminDb().select().from(sources).where(eq(sources.id, id));
    return row!;
  }

  it("crawl_url: crawls depth-2, ingests pages, marks synced with counts", async () => {
    const sourceId = await makeSource("url", "https://buycycle.test/help");
    await ingestCrawlUrl(
      { tenantId, botId, sourceId, url: "https://buycycle.test/help", depth: 2 },
      { router, createFetcher: async () => goodFetcher, fetchText },
    );
    const src = await getSource(sourceId);
    expect(src.status).toBe("synced");
    expect(src.pageCount).toBe(2); // /help + /help/returns
    expect(src.chunkCount).toBeGreaterThan(0);

    const chunkRows = await withTenant(tenantId, async (db) =>
      db.select({ id: chunksTable.id }).from(chunksTable).where(eq(chunksTable.tenantId, tenantId)),
    );
    expect(chunkRows.length).toBeGreaterThan(0);
  });

  it("crawl_url: a failing fetch surfaces status=error with a readable cause", async () => {
    const sourceId = await makeSource("url", "https://buycycle.test/help");
    await expect(
      ingestCrawlUrl(
        { tenantId, botId, sourceId, url: "https://buycycle.test/help", depth: 1 },
        { router, createFetcher: async () => badFetcher, fetchText },
      ),
    ).rejects.toThrow(/connection refused/);
    const src = await getSource(sourceId);
    expect(src.status).toBe("error");
    expect(src.error).toMatch(/connection refused/);
  });

  it("parse_text: ingests inline text and marks synced", async () => {
    const sourceId = await makeSource("text", "seed");
    await ingestParseText(
      {
        tenantId,
        botId,
        sourceId,
        title: "FAQ",
        text: "# FAQ\n\n" + Array.from({ length: 120 }, () => "word").join(" "),
      },
      { router, createFetcher: async () => goodFetcher, fetchText },
    );
    const src = await getSource(sourceId);
    expect(src.status).toBe("synced");
    expect(src.pageCount).toBe(1);
    expect(src.chunkCount).toBeGreaterThan(0);
  });
});
