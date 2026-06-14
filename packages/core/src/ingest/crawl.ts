import { XMLParser } from "fast-xml-parser";

export interface FetchedPage {
  /** Final URL after redirects. */
  url: string;
  title: string;
  /** Raw HTML. */
  html: string;
}

/** Page-fetch seam: Playwright in production, a fake in tests. */
export interface PageFetcher {
  fetch(url: string): Promise<FetchedPage>;
  close?(): Promise<void>;
}

export interface CrawlDeps {
  fetcher: PageFetcher;
  /** Fetch plain text (robots.txt, sitemaps). Defaults to global fetch. */
  fetchText?: (url: string) => Promise<string | null>;
}

export interface CrawlOptions {
  maxDepth?: number; // same-origin crawl depth (default 2)
  maxPages?: number; // per-plan page cap (default 50)
  concurrency?: number; // per-host cap (default 4)
  respectRobots?: boolean; // default true
}

async function defaultFetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Minimal robots.txt parser: honours Disallow rules under `User-agent: *`. */
export function parseRobots(text: string): { isAllowed: (path: string) => boolean } {
  const disallows: string[] = [];
  let applies = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      applies = val === "*";
    } else if (key === "disallow" && applies && val) {
      disallows.push(val);
    }
  }
  return { isAllowed: (path) => !disallows.some((d) => path.startsWith(d)) };
}

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;

/** Extract absolute http(s) links from HTML, resolved against the page URL. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(HREF_RE)) {
    const href = m[1];
    if (!href) continue;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) {
      continue;
    }
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") {
        u.hash = "";
        out.add(u.toString());
      }
    } catch {
      // skip malformed
    }
  }
  return [...out];
}

/** Parse a sitemap (urlset) or sitemap index into page URLs and nested sitemaps. */
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const parser = new XMLParser({ ignoreAttributes: true });
  // reason: fast-xml-parser returns an untyped document tree.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = parser.parse(xml) as any;
  const toArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
  const urls: string[] = [];
  const sitemaps: string[] = [];
  for (const u of toArray(doc?.urlset?.url)) {
    const loc = (u as { loc?: unknown })?.loc;
    if (loc) urls.push(String(loc));
  }
  for (const s of toArray(doc?.sitemapindex?.sitemap)) {
    const loc = (s as { loc?: unknown })?.loc;
    if (loc) sitemaps.push(String(loc));
  }
  return { urls, sitemaps };
}

function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const n = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: n }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * BFS crawl of a single URL: same-origin only, depth-limited (default 2), per-host
 * concurrency cap, robots.txt respected, and a hard page cap. Failed fetches are skipped.
 */
export async function crawlUrl(
  startUrl: string,
  deps: CrawlDeps,
  opts: CrawlOptions = {},
): Promise<FetchedPage[]> {
  const maxDepth = opts.maxDepth ?? 2;
  const maxPages = opts.maxPages ?? 50;
  const concurrency = opts.concurrency ?? 4;
  const respectRobots = opts.respectRobots ?? true;
  const fetchText = deps.fetchText ?? defaultFetchText;

  const origin = new URL(startUrl).origin;
  let robots: { isAllowed: (path: string) => boolean } = { isAllowed: () => true };
  if (respectRobots) {
    const txt = await fetchText(`${origin}/robots.txt`);
    if (txt) robots = parseRobots(txt);
  }

  const seen = new Set<string>([normalize(startUrl)]);
  const results: FetchedPage[] = [];
  let frontier = [normalize(startUrl)];

  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
    if (results.length >= maxPages) break;
    const allowed = frontier.filter((u) => robots.isAllowed(new URL(u).pathname));
    const fetched = await pool(allowed, concurrency, async (url) => {
      if (results.length >= maxPages) return null;
      try {
        return await deps.fetcher.fetch(url);
      } catch {
        return null;
      }
    });

    const next: string[] = [];
    for (const page of fetched) {
      if (!page) continue;
      if (results.length >= maxPages) break;
      results.push(page);
      if (depth < maxDepth) {
        for (const link of extractLinks(page.html, page.url)) {
          const u = normalize(link);
          if (!seen.has(u) && new URL(u).origin === origin) {
            seen.add(u);
            next.push(u);
          }
        }
      }
    }
    frontier = next;
  }

  return results;
}

/**
 * Resolve a sitemap (recursively expanding sitemap indexes) into a flat list of page
 * URLs. The worker enqueues a crawl_url child job per URL (wired in T1.8).
 */
export async function crawlSitemap(
  sitemapUrl: string,
  deps: Pick<CrawlDeps, "fetchText">,
  opts: { maxPages?: number; maxSitemaps?: number } = {},
): Promise<string[]> {
  const fetchText = deps.fetchText ?? defaultFetchText;
  const maxPages = opts.maxPages ?? 1000;
  const maxSitemaps = opts.maxSitemaps ?? 50;

  const urls: string[] = [];
  const queue = [sitemapUrl];
  const seen = new Set<string>();
  let processed = 0;

  while (queue.length > 0 && urls.length < maxPages && processed < maxSitemaps) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    processed++;
    const xml = await fetchText(next);
    if (!xml) continue;
    const parsed = parseSitemap(xml);
    for (const u of parsed.urls) {
      if (urls.length >= maxPages) break;
      urls.push(u);
    }
    queue.push(...parsed.sitemaps);
  }
  return urls;
}

/** Production fetcher backed by headless Chromium. Requires `playwright install chromium`. */
export async function createPlaywrightFetcher(): Promise<PageFetcher> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  return {
    async fetch(url: string): Promise<FetchedPage> {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        return { url: page.url(), title: await page.title(), html: await page.content() };
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}
