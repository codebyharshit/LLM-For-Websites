import { logger } from "@supportrag/shared";
import {
  type IngestHandlers,
  type LLMRouter,
  type PageFetcher,
  type CrawlUrlData,
  type CrawlSitemapData,
  type ParseTextData,
  type ParseFileData,
  crawlUrl,
  crawlSitemap,
  cleanHtml,
  ingestDocument,
} from "@supportrag/core";
import { setSourceStatus, errorMessage } from "./status.js";

export interface HandlerDeps {
  router: LLMRouter;
  createFetcher: () => Promise<PageFetcher>;
  /** Robots/sitemap text fetcher; defaults to real fetch inside the crawler. */
  fetchText?: (url: string) => Promise<string | null>;
}

const NO_CONTENT_MESSAGE =
  "No readable content found — the page may be empty, login-gated, or bot-protected (e.g. Cloudflare).";

/** Crawl a single URL (same-origin, depth-limited), clean + ingest each page. */
export async function ingestCrawlUrl(data: CrawlUrlData, deps: HandlerDeps): Promise<void> {
  const { tenantId, botId, sourceId, url, depth } = data;
  await setSourceStatus(tenantId, sourceId, { status: "syncing", error: null });
  let fetcher: PageFetcher | undefined;
  try {
    fetcher = await deps.createFetcher();
    const crawlDeps = deps.fetchText ? { fetcher, fetchText: deps.fetchText } : { fetcher };
    const pages = await crawlUrl(url, crawlDeps, { maxDepth: depth ?? 2 });
    if (pages.length === 0) {
      // The crawler skips failed fetches; probe the start URL to surface the real cause.
      await fetcher.fetch(url);
      throw new Error(`no pages could be fetched from ${url}`);
    }
    let chunkCount = 0;
    for (const page of pages) {
      const { title, markdown } = cleanHtml(page.html);
      const res = await ingestDocument(
        { tenantId, botId, sourceId, url: page.url, title, markdown },
        { router: deps.router },
      );
      chunkCount += res.chunkCount;
    }
    if (chunkCount === 0) {
      // Pages fetched but nothing usable extracted (empty / blocked / login page).
      await setSourceStatus(tenantId, sourceId, {
        status: "error",
        pageCount: pages.length,
        chunkCount: 0,
        error: NO_CONTENT_MESSAGE,
      });
      return;
    }
    await setSourceStatus(tenantId, sourceId, {
      status: "synced",
      pageCount: pages.length,
      chunkCount,
      error: null,
    });
  } catch (err) {
    await setSourceStatus(tenantId, sourceId, { status: "error", error: errorMessage(err) });
    throw err;
  } finally {
    if (fetcher?.close) await fetcher.close();
  }
}

/** Expand a sitemap, then fetch/clean/ingest each page inline. */
export async function ingestCrawlSitemap(
  data: CrawlSitemapData,
  deps: HandlerDeps,
): Promise<void> {
  const { tenantId, botId, sourceId, url } = data;
  await setSourceStatus(tenantId, sourceId, { status: "syncing", error: null });
  let fetcher: PageFetcher | undefined;
  try {
    const sitemapDeps = deps.fetchText ? { fetchText: deps.fetchText } : {};
    const urls = await crawlSitemap(url, sitemapDeps);
    fetcher = await deps.createFetcher();
    let chunkCount = 0;
    let pageCount = 0;
    for (const pageUrl of urls) {
      const page = await fetcher.fetch(pageUrl);
      const { title, markdown } = cleanHtml(page.html);
      const res = await ingestDocument(
        { tenantId, botId, sourceId, url: page.url, title, markdown },
        { router: deps.router },
      );
      chunkCount += res.chunkCount;
      pageCount++;
    }
    if (chunkCount === 0) {
      await setSourceStatus(tenantId, sourceId, {
        status: "error",
        pageCount,
        chunkCount: 0,
        error: NO_CONTENT_MESSAGE,
      });
      return;
    }
    await setSourceStatus(tenantId, sourceId, {
      status: "synced",
      pageCount,
      chunkCount,
      error: null,
    });
  } catch (err) {
    await setSourceStatus(tenantId, sourceId, { status: "error", error: errorMessage(err) });
    throw err;
  } finally {
    if (fetcher?.close) await fetcher.close();
  }
}

/** Ingest an inline text/markdown source. */
export async function ingestParseText(data: ParseTextData, deps: HandlerDeps): Promise<void> {
  const { tenantId, botId, sourceId, text, title } = data;
  await setSourceStatus(tenantId, sourceId, { status: "syncing", error: null });
  try {
    const res = await ingestDocument(
      { tenantId, botId, sourceId, title, markdown: text },
      { router: deps.router },
    );
    await setSourceStatus(tenantId, sourceId, {
      status: "synced",
      pageCount: 1,
      chunkCount: res.chunkCount,
      error: null,
    });
  } catch (err) {
    await setSourceStatus(tenantId, sourceId, { status: "error", error: errorMessage(err) });
    throw err;
  }
}

/** File sources need object storage (not configured in v1) — surface a readable error. */
export async function ingestParseFile(data: ParseFileData, _deps: HandlerDeps): Promise<void> {
  await setSourceStatus(data.tenantId, data.sourceId, {
    status: "error",
    error: "file sources are not supported yet (no object store configured)",
  });
  logger.warn({ sourceId: data.sourceId }, "parse_file unsupported in v1");
}

export function makeHandlers(deps: HandlerDeps): IngestHandlers {
  return {
    crawl_url: (data) => ingestCrawlUrl(data, deps),
    crawl_sitemap: (data) => ingestCrawlSitemap(data, deps),
    parse_text: (data) => ingestParseText(data, deps),
    parse_file: (data) => ingestParseFile(data, deps),
  };
}
