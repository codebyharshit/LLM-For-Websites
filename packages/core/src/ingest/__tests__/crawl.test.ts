import { describe, it, expect } from "vitest";
import {
  parseRobots,
  extractLinks,
  parseSitemap,
  crawlUrl,
  crawlSitemap,
  type PageFetcher,
  type FetchedPage,
} from "../crawl.js";

describe("parseRobots", () => {
  it("disallows paths under User-agent: *", () => {
    const r = parseRobots("User-agent: *\nDisallow: /private\nDisallow: /admin");
    expect(r.isAllowed("/public")).toBe(true);
    expect(r.isAllowed("/private/x")).toBe(false);
    expect(r.isAllowed("/admin")).toBe(false);
  });
});

describe("extractLinks", () => {
  it("resolves relative links and skips mailto/# /js", () => {
    const html = `<a href="/a">A</a><a href="b">B</a><a href="#x">x</a>
      <a href="mailto:z@y.com">m</a><a href="https://ext.test/p">e</a>`;
    const links = extractLinks(html, "https://site.test/dir/");
    expect(links).toContain("https://site.test/a");
    expect(links).toContain("https://site.test/dir/b");
    expect(links).toContain("https://ext.test/p");
    expect(links.some((l) => l.includes("mailto"))).toBe(false);
  });
});

describe("parseSitemap", () => {
  it("reads urlset and sitemapindex", () => {
    const urlset = `<urlset><url><loc>https://s.test/a</loc></url><url><loc>https://s.test/b</loc></url></urlset>`;
    expect(parseSitemap(urlset).urls).toEqual(["https://s.test/a", "https://s.test/b"]);
    const index = `<sitemapindex><sitemap><loc>https://s.test/sm1.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(index).sitemaps).toEqual(["https://s.test/sm1.xml"]);
  });
});

// A small in-memory site for crawl tests.
function fakeFetcher(pages: Record<string, { title: string; html: string }>): PageFetcher {
  return {
    async fetch(url: string): Promise<FetchedPage> {
      const p = pages[url];
      if (!p) throw new Error(`404 ${url}`);
      return { url, title: p.title, html: p.html };
    },
  };
}

const SITE: Record<string, { title: string; html: string }> = {
  "https://site.test/": {
    title: "Home",
    html: `<a href="/a">a</a><a href="/b">b</a><a href="https://other.test/x">ext</a>`,
  },
  "https://site.test/a": { title: "A", html: `<a href="/b">b</a><a href="/c">c</a>` },
  "https://site.test/b": { title: "B", html: `<a href="/">home</a>` },
  "https://site.test/c": { title: "C", html: `leaf` },
};

describe("crawlUrl", () => {
  const robotsDisallowC = async () => "User-agent: *\nDisallow: /c";

  it("crawls same-origin only, respects robots and depth", async () => {
    const pages = await crawlUrl(
      "https://site.test/",
      { fetcher: fakeFetcher(SITE), fetchText: robotsDisallowC },
      { maxDepth: 2 },
    );
    const urls = pages.map((p) => p.url).sort();
    expect(urls).toEqual(["https://site.test/", "https://site.test/a", "https://site.test/b"]);
    // /c is robots-disallowed; other.test is cross-origin — neither is fetched.
    expect(urls).not.toContain("https://site.test/c");
    expect(urls.some((u) => u.includes("other.test"))).toBe(false);
  });

  it("honours maxPages", async () => {
    const pages = await crawlUrl(
      "https://site.test/",
      { fetcher: fakeFetcher(SITE), fetchText: async () => null },
      { maxDepth: 2, maxPages: 2 },
    );
    expect(pages).toHaveLength(2);
  });

  it("stops at depth 0 when maxDepth is 0", async () => {
    const pages = await crawlUrl(
      "https://site.test/",
      { fetcher: fakeFetcher(SITE), fetchText: async () => null },
      { maxDepth: 0 },
    );
    expect(pages.map((p) => p.url)).toEqual(["https://site.test/"]);
  });
});

describe("crawlSitemap", () => {
  it("expands a sitemap index into page urls", async () => {
    const docs: Record<string, string> = {
      "https://s.test/sitemap.xml": `<sitemapindex><sitemap><loc>https://s.test/sm1.xml</loc></sitemap></sitemapindex>`,
      "https://s.test/sm1.xml": `<urlset><url><loc>https://s.test/p1</loc></url><url><loc>https://s.test/p2</loc></url></urlset>`,
    };
    const urls = await crawlSitemap("https://s.test/sitemap.xml", {
      fetchText: async (u) => docs[u] ?? null,
    });
    expect(urls).toEqual(["https://s.test/p1", "https://s.test/p2"]);
  });
});
