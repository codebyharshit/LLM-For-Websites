import OpenAI from "openai";
import { AppError } from "@supportrag/shared";
import { MissingApiKeyError } from "../errors.js";

/** Minimal embedding seam so batching/retry logic is testable without a real key. */
export interface EmbeddingClient {
  create(input: string[]): Promise<number[][]>;
}

/** Real OpenAI embedding client. The key is checked at call-time, not construction. */
export function makeOpenAIEmbeddingClient(apiKey: string, model: string): EmbeddingClient {
  return {
    async create(input: string[]): Promise<number[][]> {
      if (!apiKey) throw new MissingApiKeyError("OPENAI_API_KEY");
      const client = new OpenAI({ apiKey });
      const res = await client.embeddings.create({ model, input });
      return res.data.map((d) => d.embedding);
    },
  };
}

export interface EmbedBatchedOptions {
  dims: number;
  batchSize?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      await sleep(2 ** attempt * 200);
    }
  }
  throw lastErr;
}

/**
 * Embed many texts, batching to ≤256 per request (the embedding model batch ceiling),
 * retrying transient failures with exponential backoff, and asserting the frozen 1536-dim
 * contract. Order is preserved: output[i] corresponds to texts[i].
 */
export async function embedBatched(
  client: EmbeddingClient,
  texts: string[],
  opts: EmbedBatchedOptions,
): Promise<number[][]> {
  const batchSize = Math.min(opts.batchSize ?? 256, 256);
  const maxRetries = opts.maxRetries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vectors = await withRetry(() => client.create(batch), maxRetries, sleep);
    if (vectors.length !== batch.length) {
      throw new AppError(
        "embedding_count_mismatch",
        `expected ${batch.length} vectors, got ${vectors.length}`,
      );
    }
    for (const v of vectors) {
      if (v.length !== opts.dims) {
        throw new AppError(
          "embedding_dim_mismatch",
          `expected ${opts.dims} dims, got ${v.length}`,
        );
      }
      out.push(v);
    }
  }
  return out;
}
