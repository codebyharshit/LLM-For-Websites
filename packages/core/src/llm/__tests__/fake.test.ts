import { describe, it, expect } from "vitest";
import { FakeLLMRouter, hashEmbed } from "../fake.js";

describe("FakeLLMRouter", () => {
  const router = new FakeLLMRouter(1536);

  it("produces deterministic 1536-dim embeddings", async () => {
    const [a1] = await router.embed(["return policy"]);
    const [a2] = await router.embed(["return policy"]);
    expect(a1).toHaveLength(1536);
    expect(a1).toEqual(a2);
    expect(hashEmbed("x", 8)).toHaveLength(8);
  });

  it("reranks by relevance and respects topN", async () => {
    const docs = [
      { id: "a", text: "our bike return policy allows 30 days" },
      { id: "b", text: "the weather is sunny in munich" },
      { id: "c", text: "returns and refunds for bikes" },
    ];
    const ranked = await router.rerank("bike return policy", docs, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
    expect(ranked[0]!.id).not.toBe("b"); // the unrelated doc should not be top
  });

  it("streams deltas and a final done chunk with model + tokens", async () => {
    const chunks: string[] = [];
    let done: { modelUsed: string; tokensOut: number } | undefined;
    for await (const c of router.generate({
      system: "s",
      messages: [{ role: "user", content: "can I return a bike?" }],
      stream: true,
    })) {
      if (c.delta) chunks.push(c.delta);
      if (c.done) done = c.done;
    }
    expect(chunks.join("")).toContain("return a bike");
    expect(done?.modelUsed).toBe("fake");
    expect(done?.tokensOut).toBeGreaterThan(0);
  });
});
