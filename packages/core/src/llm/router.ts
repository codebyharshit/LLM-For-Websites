import type { ChatMsg } from "@supportrag/shared";
import type { Env } from "@supportrag/shared";
import { NotImplementedError } from "./errors.js";
import { embedBatched, makeOpenAIEmbeddingClient, type EmbeddingClient } from "./providers/openai.js";

export interface RerankResult {
  id: string;
  score: number;
}

export interface GenerateDone {
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * A streamed generation chunk. Token chunks carry `delta`; the final chunk also carries
 * `done` with the model that produced the answer (after the primary→fallback chain) and
 * metered token usage for logging.
 */
export interface GenerateDelta {
  delta: string;
  done?: GenerateDone;
}

export interface GenerateOptions {
  system: string;
  messages: ChatMsg[];
  temperature?: number;
  maxTokens?: number;
  stream: true;
}

/** §A.3 — the single seam through which all vendor model calls flow. */
export interface LLMRouter {
  embed(texts: string[]): Promise<number[][]>;
  rerank(
    query: string,
    docs: { id: string; text: string }[],
    topN: number,
  ): Promise<RerankResult[]>;
  generate(opts: GenerateOptions): AsyncIterable<GenerateDelta>;
}

export interface LLMRouterDeps {
  embeddingClient: EmbeddingClient;
  dims: number;
}

/**
 * Default router. The embedding slot is fully wired (T0.6); rerank (T2.4) and generate
 * (T2.6) are typed stubs that throw NotImplemented until those tasks land.
 */
export class DefaultLLMRouter implements LLMRouter {
  constructor(private readonly deps: LLMRouterDeps) {}

  async embed(texts: string[]): Promise<number[][]> {
    return embedBatched(this.deps.embeddingClient, texts, { dims: this.deps.dims });
  }

  async rerank(): Promise<RerankResult[]> {
    throw new NotImplementedError("rerank");
  }

  // eslint-disable-next-line require-yield -- stub: throws until wired in T2.6
  async *generate(): AsyncIterable<GenerateDelta> {
    throw new NotImplementedError("generate");
  }
}

/** Build the default router from env. Slots that need keys throw only when called. */
export function createLLMRouter(env: Env): LLMRouter {
  return new DefaultLLMRouter({
    embeddingClient: makeOpenAIEmbeddingClient(env.OPENAI_API_KEY, env.EMBEDDING_MODEL),
    dims: env.EMBEDDING_DIMS,
  });
}
