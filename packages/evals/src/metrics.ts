import { retrieve, rerankAndGate, type LLMRouter } from "@supportrag/core";
import type { QAPair } from "./generate.js";

export interface EvalDeps {
  router: LLMRouter;
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
}

/** Fraction of QA pairs whose gold chunk appears in the reranked top-5 (gate disabled). */
export async function recallAtK(
  tenantId: string,
  botId: string,
  qa: QAPair[],
  k: number,
  deps: EvalDeps,
): Promise<number> {
  if (qa.length === 0) return 0;
  let hits = 0;
  for (const p of qa) {
    const candidates = await retrieve(p.question, botId, tenantId, deps);
    const ranked = await rerankAndGate(p.question, candidates, deps, { tau: -1, topN: k });
    if (ranked.chunks.some((c) => c.id === p.goldChunkId)) hits++;
  }
  return hits / qa.length;
}

/**
 * Heuristic faithfulness: fraction of answer tokens grounded in the retrieved context.
 * (An LLM judge is the production target — see docs/someday.md.)
 */
export function faithfulness(answer: string, contextChunks: string[]): number {
  const ans = tokens(answer);
  if (ans.size === 0) return 1;
  const ctx = new Set<string>();
  for (const c of contextChunks) for (const t of tokens(c)) ctx.add(t);
  let grounded = 0;
  for (const t of ans) if (ctx.has(t)) grounded++;
  return grounded / ans.size;
}

/** Fraction of out-of-domain questions the bot correctly refuses (gates) at τ. */
export async function idkCorrectness(
  tenantId: string,
  botId: string,
  outOfDomain: string[],
  tau: number,
  deps: EvalDeps,
): Promise<number> {
  if (outOfDomain.length === 0) return 1;
  let correct = 0;
  for (const q of outOfDomain) {
    const candidates = await retrieve(q, botId, tenantId, deps);
    const gate = await rerankAndGate(q, candidates, deps, { tau, topN: 5 });
    if (gate.gated) correct++;
  }
  return correct / outOfDomain.length;
}
