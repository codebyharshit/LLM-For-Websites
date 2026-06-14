import type { LLMRouter } from "../llm/router.js";
import type { RetrievedChunk } from "./retrieve.js";

export interface RankedChunk extends RetrievedChunk {
  rerankScore: number;
}

export interface RerankGateResult {
  /** True when the top rerank score is below τ → answer must be refused (no generation). */
  gated: boolean;
  topScore: number;
  chunks: RankedChunk[];
}

export interface RerankDeps {
  router: LLMRouter;
}

export interface RerankOptions {
  tau: number;
  topN?: number;
}

/**
 * Rerank fused candidates and apply the confidence gate. If the top reranked score is below
 * τ the result is `gated` with no chunks — the caller must return the templated refusal and
 * NOT call generation. Otherwise returns the top-N reranked chunks.
 */
export async function rerankAndGate(
  query: string,
  candidates: RetrievedChunk[],
  deps: RerankDeps,
  opts: RerankOptions,
): Promise<RerankGateResult> {
  if (candidates.length === 0) return { gated: true, topScore: 0, chunks: [] };

  const topN = opts.topN ?? 5;
  const ranked = await deps.router.rerank(
    query,
    candidates.map((c) => ({ id: c.id, text: c.content })),
    topN,
  );

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const chunks: RankedChunk[] = ranked
    .map((r) => {
      const c = byId.get(r.id);
      return c ? { ...c, rerankScore: r.score, score: r.score } : undefined;
    })
    .filter((c): c is RankedChunk => c !== undefined);

  const topScore = chunks[0]?.rerankScore ?? 0;
  if (topScore < opts.tau) {
    return { gated: true, topScore, chunks: [] };
  }
  return { gated: false, topScore, chunks: chunks.slice(0, topN) };
}
