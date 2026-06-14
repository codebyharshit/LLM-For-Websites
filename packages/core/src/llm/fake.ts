import type { LLMRouter, RerankResult, GenerateOptions, GenerateDelta } from "./router.js";

/** Deterministic, normalized pseudo-embedding from a string. Same text → same vector. */
export function hashEmbed(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const idx = (i * 31 + c) % dims;
    v[idx] = (v[idx] ?? 0) + ((c % 7) - 3);
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/** Token-overlap score in [0,1] — relevant docs rank high, unrelated low. */
export function overlapScore(query: string, text: string): number {
  const q = tokenSet(query);
  if (q.size === 0) return 0;
  const t = tokenSet(text);
  let hits = 0;
  for (const w of q) if (t.has(w)) hits++;
  return hits / q.size;
}

/**
 * Deterministic, key-free LLMRouter for testing the whole query pipeline (M2) without
 * any vendor calls. Real providers light up when keys are added.
 */
export class FakeLLMRouter implements LLMRouter {
  constructor(private readonly dims = 1536) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => hashEmbed(t, this.dims));
  }

  async rerank(
    query: string,
    docs: { id: string; text: string }[],
    topN: number,
  ): Promise<RerankResult[]> {
    return docs
      .map((d) => ({ id: d.id, score: overlapScore(query, d.text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  async *generate(opts: GenerateOptions): AsyncIterable<GenerateDelta> {
    const last = opts.messages.at(-1)?.content ?? "";
    const answer = `Based on the provided context, here is the answer to: ${last}`;
    const words = answer.split(" ");
    for (const w of words) {
      yield { delta: w + " " };
    }
    yield { delta: "", done: { modelUsed: "fake", tokensIn: 16, tokensOut: words.length } };
  }
}
