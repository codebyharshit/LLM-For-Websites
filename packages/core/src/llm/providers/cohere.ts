import { CohereClient } from "cohere-ai";
import type { RerankResult } from "../router.js";
import { MissingApiKeyError } from "../errors.js";

export const COHERE_RERANK_MODEL = "rerank-v3.5";

/** Rerank seam: Cohere in production, FakeLLMRouter in tests. */
export interface RerankClient {
  rerank(
    query: string,
    docs: { id: string; text: string }[],
    topN: number,
  ): Promise<RerankResult[]>;
}

/** Real Cohere Rerank 3.5 client. The key is checked at call-time, not construction. */
export function makeCohereRerankClient(apiKey: string, model = COHERE_RERANK_MODEL): RerankClient {
  return {
    async rerank(query, docs, topN) {
      if (!apiKey) throw new MissingApiKeyError("COHERE_API_KEY");
      if (docs.length === 0) return [];
      const client = new CohereClient({ token: apiKey });
      const res = await client.rerank({
        model,
        query,
        documents: docs.map((d) => d.text),
        topN: Math.min(topN, docs.length),
      });
      return res.results.map((r) => ({
        id: docs[r.index]!.id,
        score: r.relevanceScore,
      }));
    },
  };
}
