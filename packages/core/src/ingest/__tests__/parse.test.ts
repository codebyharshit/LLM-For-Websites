import { describe, it, expect } from "vitest";
import { detectKind, parseText, parseFile } from "../parse.js";
import { htmlToMarkdown } from "../html.js";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("detectKind", () => {
  it("maps extensions to kinds", () => {
    expect(detectKind("a.pdf")).toBe("pdf");
    expect(detectKind("a.DOCX")).toBe("docx");
    expect(detectKind("notes.md")).toBe("md");
    expect(detectKind("readme.txt")).toBe("txt");
    expect(detectKind("image.png")).toBeNull();
  });
});

describe("parseText / parseFile (md, txt)", () => {
  it("returns inline text", () => {
    expect(parseText("# Hello\n\nworld").text).toContain("Hello");
  });

  it("decodes md and txt files to non-empty text", async () => {
    const md = await parseFile(enc("# Title\n\nBody text."), "doc.md");
    expect(md.text).toContain("Title");
    const txt = await parseFile(enc("just plain text"), "doc.txt");
    expect(txt.text).toBe("just plain text");
  });

  it("rejects unsupported file types", async () => {
    await expect(parseFile(enc("x"), "x.png")).rejects.toThrow(/unsupported/);
  });
});

describe("htmlToMarkdown (docx/html table path)", () => {
  it("preserves a table as Markdown and headings", () => {
    const html = `<h2>Returns</h2><p>Our policy:</p>
      <table><tr><th>Window</th><th>Fee</th></tr><tr><td>30 days</td><td>Free</td></tr></table>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("## Returns");
    expect(md).toContain("| Window | Fee |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 30 days | Free |");
  });

  it("renders lists and links, drops scripts", () => {
    const html = `<ul><li>One</li><li>Two</li></ul><a href="https://x.test">link</a><script>evil()</script>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("- One");
    expect(md).toContain("[link](https://x.test)");
    expect(md).not.toContain("evil");
  });
});
