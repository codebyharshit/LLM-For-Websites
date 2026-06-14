import type { ChatMsg } from "@supportrag/shared";
import type { Env } from "@supportrag/shared";
import { NotImplementedError } from "./errors.js";
import { embedBatched, makeOpenAIEmbeddingClient, type EmbeddingClient } from "./providers/openai.js";
import { makeCohereRerankClient, type RerankClient } from "./providers/cohere.js";
import { makeGeminiClient } from "./providers/gemini.js";
import { makeAnthropicClient } from "./providers/anthropic.js";
import { makeDeepSeekClient } from "./providers/deepseek.js";

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

/** One generation backend (a model). Throws to trigger the router's fallback chain. */
export interface GenerateClient {
  readonly model: string;
  generate(opts: GenerateOptions): AsyncIterable<GenerateDelta>;
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
  rerankClient?: RerankClient;
  /** Ordered generation fallback chain (primary first). */
  generateChain?: GenerateClient[];
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

  async rerank(
    query: string,
    docs: { id: string; text: string }[],
    topN: number,
  ): Promise<RerankResult[]> {
    if (!this.deps.rerankClient) throw new NotImplementedError("rerank");
    return this.deps.rerankClient.rerank(query, docs, topN);
  }

  /**
   * Stream generation, trying each backend in order. If a backend fails BEFORE emitting any
   * delta (auth/quota/connection error), fall back to the next; once tokens have streamed to
   * the consumer, a later failure is rethrown (can't unsend). The final `done` carries the
   * model that actually produced the answer.
   */
  async *generate(opts: GenerateOptions): AsyncIterable<GenerateDelta> {
    const chain = this.deps.generateChain ?? [];
    if (chain.length === 0) throw new NotImplementedError("generate");

    let lastErr: unknown;
    for (const client of chain) {
      let emitted = 0;
      let sawDone = false;
      try {
        for await (const chunk of client.generate(opts)) {
          emitted++;
          if (chunk.done) {
            sawDone = true;
            yield { delta: chunk.delta, done: { ...chunk.done, modelUsed: chunk.done.modelUsed || client.model } };
          } else {
            yield chunk;
          }
        }
        if (!sawDone) {
          yield { delta: "", done: { modelUsed: client.model, tokensIn: 0, tokensOut: 0 } };
        }
        return;
      } catch (err) {
        lastErr = err;
        if (emitted > 0) throw err; // already streamed — cannot fall back mid-answer
      }
    }
    throw lastErr ?? new NotImplementedError("generate");
  }
}

/** Build the default router from env. Slots that need keys throw only when called. */
export function createLLMRouter(env: Env): LLMRouter {
  return new DefaultLLMRouter({
    embeddingClient: makeOpenAIEmbeddingClient(env.OPENAI_API_KEY, env.EMBEDDING_MODEL),
    dims: env.EMBEDDING_DIMS,
    rerankClient: makeCohereRerankClient(env.COHERE_API_KEY),
    generateChain: [
      makeGeminiClient(env.GEMINI_API_KEY),
      makeAnthropicClient(env.ANTHROPIC_API_KEY),
      makeDeepSeekClient(env.DEEPSEEK_API_KEY),
    ],
  });
}
