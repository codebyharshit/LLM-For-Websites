import { describe, it, expect } from "vitest";
import { chunkMarkdown, countTokens } from "../chunk.js";

// Build paragraphs from a repeated distinct word so token sizes are predictable and
// overlap is detectable (each section uses different words).
const para = (word: string, n: number): string => Array.from({ length: n }, () => word).join(" ");

const DOC = [
  "# Guide",
  "## Returns",
  para("alpha", 300),
  "",
  para("beta", 300),
  "",
  para("gamma", 300),
  "",
  "### Refunds",
  para("delta", 250),
  "",
  para("tiny", 20),
  "",
].join("\n");

describe("chunkMarkdown", () => {
  const chunks = chunkMarkdown(DOC, { minTokens: 400, maxTokens: 800, overlap: 0.12 });

  it("produces multiple chunks", () => {
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("populates heading_path as a breadcrumb", () => {
    expect(chunks.every((c) => c.headingPath.startsWith("Guide"))).toBe(true);
    expect(chunks.some((c) => c.headingPath === "Guide > Returns")).toBe(true);
    expect(chunks.some((c) => c.headingPath === "Guide > Returns > Refunds")).toBe(true);
  });

  it("keeps chunk sizes within the target band (allowing overlap)", () => {
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(950); // 800 + overlap headroom
    }
    // The bulk content chunks should be near/over the floor.
    expect(chunks.some((c) => c.tokenCount >= 400)).toBe(true);
  });

  it("includes overlap between consecutive chunks of a section", () => {
    // The 'Returns' section spans alpha/beta/gamma; the second chunk should carry tail
    // overlap (beta) from the first plus new content (gamma).
    const returns = chunks.filter((c) => c.headingPath === "Guide > Returns");
    expect(returns.length).toBeGreaterThanOrEqual(2);
    expect(returns[1]!.content).toContain("beta");
    expect(returns[1]!.content).toContain("gamma");
  });

  it("merges sub-50-token chunks forward (no tiny chunks)", () => {
    expect(chunks.every((c) => c.tokenCount >= 50)).toBe(true);
  });

  it("assigns sequential ordinals", () => {
    chunks.forEach((c, i) => expect(c.ordinal).toBe(i));
  });

  it("counts tokens", () => {
    expect(countTokens("hello world")).toBeGreaterThan(0);
  });
});
