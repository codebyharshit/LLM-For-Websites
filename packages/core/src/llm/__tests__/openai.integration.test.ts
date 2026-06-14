import { describe, it, expect } from "vitest";
import { embedBatched, makeOpenAIEmbeddingClient } from "../providers/openai.js";

const hasKey = !!process.env.OPENAI_API_KEY;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Real-provider check: skipped until OPENAI_API_KEY is set, then runs in CI/locally.
describe.skipIf(!hasKey)("OpenAI embeddings (live)", () => {
  it("returns 1536-dim vectors where near-duplicates are more similar than unrelated text", async () => {
    const client = makeOpenAIEmbeddingClient(
      process.env.OPENAI_API_KEY ?? "",
      process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    );
    const [dup1, dup2, unrelated] = await embedBatched(
      client,
      [
        "How do I return my bike?",
        "What is the process to return my bicycle?",
        "The weather in Munich is sunny today.",
      ],
      { dims: 1536 },
    );
    expect(dup1).toHaveLength(1536);
    expect(cosine(dup1!, dup2!)).toBeGreaterThan(cosine(dup1!, unrelated!));
  });
});
