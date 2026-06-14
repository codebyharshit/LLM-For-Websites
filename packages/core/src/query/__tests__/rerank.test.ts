import { describe, it, expect } from "vitest";
import type { LLMRouter, GenerateDelta } from "../../llm/router.js";
import { FakeLLMRouter } from "../../llm/fake.js";
import { rerankAndGate } from "../rerank.js";
import type { RetrievedChunk } from "../retrieve.js";

const chunk = (id: string, content: string): RetrievedChunk => ({
  id,
  content,
  headingPath: null,
  documentId: "doc",
  url: "https://x.test",
  title: "Doc",
  score: 0,
});

// Wrap a real fake rerank but make generate explode, to prove the gate never generates.
function noGenerateRouter(): LLMRouter {
  const fake = new FakeLLMRouter();
  return {
    embed: (t) => fake.embed(t),
    rerank: (q, d, n) => fake.rerank(q, d, n),
    async *generate(): AsyncIterable<GenerateDelta> {
      throw new Error("generate must not be called below the confidence gate");
    },
  };
}

const CANDIDATES = [
  chunk("a", "Our bike return policy allows returns within 30 days for a refund."),
  chunk("b", "Refunds and returns are processed within 5 business days."),
  chunk("c", "Shipping options across the European Union."),
];

describe("rerankAndGate", () => {
  it("returns top-N reranked chunks when the top score is above τ", async () => {
    const res = await rerankAndGate("return policy refund", CANDIDATES, { router: noGenerateRouter() }, {
      tau: 0.3,
      topN: 5,
    });
    expect(res.gated).toBe(false);
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(res.chunks.length).toBeLessThanOrEqual(5);
    expect(res.topScore).toBeGreaterThanOrEqual(0.3);
    // ranked descending
    for (let i = 1; i < res.chunks.length; i++) {
      expect(res.chunks[i - 1]!.rerankScore).toBeGreaterThanOrEqual(res.chunks[i]!.rerankScore);
    }
  });

  it("gates (refusal) for an out-of-domain query and never calls generate", async () => {
    const res = await rerankAndGate("weather in munich tomorrow", CANDIDATES, {
      router: noGenerateRouter(),
    }, { tau: 0.3 });
    expect(res.gated).toBe(true);
    expect(res.chunks).toHaveLength(0);
    expect(res.topScore).toBeLessThan(0.3);
  });

  it("gates when there are no candidates", async () => {
    const res = await rerankAndGate("anything", [], { router: noGenerateRouter() }, { tau: 0.3 });
    expect(res.gated).toBe(true);
    expect(res.chunks).toHaveLength(0);
  });
});
