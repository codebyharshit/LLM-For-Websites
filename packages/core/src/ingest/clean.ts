import { parseHTML } from "linkedom";
import { htmlToMarkdown } from "./html.js";

interface El {
  textContent: string | null;
  innerHTML: string;
  remove(): void;
  querySelector(sel: string): El | null;
  querySelectorAll(sel: string): ArrayLike<El>;
}
interface Doc {
  body: El;
  querySelector(sel: string): El | null;
  querySelectorAll(sel: string): ArrayLike<El>;
}

// Boilerplate to drop: semantic chrome elements + cookie/consent/sidebar/banner noise.
const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
  "iframe",
  "svg",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="search"]',
  '[class*="cookie"]',
  '[id*="cookie"]',
  '[class*="consent"]',
  '[id*="consent"]',
  '[class*="sidebar"]',
  '[class*="banner"]',
  '[class*="newsletter"]',
];

export interface CleanedDoc {
  title: string;
  markdown: string;
}

function text(el: El | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function stripNoise(doc: Doc): void {
  for (const sel of NOISE_SELECTORS) {
    let nodes: El[] = [];
    try {
      nodes = Array.from(doc.querySelectorAll(sel));
    } catch {
      nodes = []; // unsupported selector — skip
    }
    for (const n of nodes) n.remove();
  }
}

/**
 * Extract the main content of an HTML page as Markdown: drop nav/footer/header/aside and
 * cookie/consent banners, prefer <main>/<article> (else the cleaned <body>), and render
 * via htmlToMarkdown so policy tables survive as Markdown.
 */
export function cleanHtml(html: string): CleanedDoc {
  const source = /<html[\s>]/i.test(html)
    ? html
    : `<!DOCTYPE html><html><body>${html}</body></html>`;
  const { document } = parseHTML(source) as unknown as { document: Doc };

  // Capture the title before stripping chrome (which may remove the header <h1>).
  const title = text(document.querySelector("title")) || text(document.querySelector("h1"));

  stripNoise(document);

  const main =
    document.querySelector("main") ?? document.querySelector("article") ?? document.body;
  const markdown = htmlToMarkdown(main?.innerHTML ?? "");
  return { title, markdown };
}
