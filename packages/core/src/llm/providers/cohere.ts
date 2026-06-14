import type { RerankResult } from "../router.js";
import { NotImplementedError } from "../errors.js";

/** Cohere Rerank 3.5. Typed stub; implemented in T2.4. */
export function rerankCohere(
  _query: string,
  _docs: { id: string; text: string }[],
  _topN: number,
): Promise<RerankResult[]> {
  throw new NotImplementedError("cohere rerank");
}
