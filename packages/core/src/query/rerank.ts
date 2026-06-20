import { logger } from "@supportrag/shared";
import type { LLMRouter } from "../llm/router.js";
import type { RetrievedChunk } from "./retrieve.js";
import { MissingApiKeyError, NotImplementedError } from "../llm/errors.js";

// Log the rerank-unavailable fallback only once, not on every chat turn.
let warnedRerankUnavailable = false;

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

  let ranked;
  try {
    ranked = await deps.router.rerank(
      query,
      candidates.map((c) => ({ id: c.id, text: c.content })),
      topN,
    );
  } catch (err) {
    // No reranker configured (e.g. no Cohere key) — degrade gracefully to the fused
    // retrieval (RRF) order. The τ gate is rerank-score-specific, so in this mode we gate
    // only on emptiness; the grounded prompt still makes the model refuse off-topic asks.
    if (err instanceof MissingApiKeyError || err instanceof NotImplementedError) {
      if (!warnedRerankUnavailable) {
        logger.warn("reranker unavailable; falling back to fused retrieval order (logged once)");
        warnedRerankUnavailable = true;
      }
      const chunks = candidates.slice(0, topN).map((c) => ({ ...c, rerankScore: c.score }));
      return { gated: chunks.length === 0, topScore: chunks[0]?.rerankScore ?? 0, chunks };
    }
    throw err;
  }

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
