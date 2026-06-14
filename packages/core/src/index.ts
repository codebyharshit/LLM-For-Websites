// packages/core: chunker, retriever, reranker, prompt, LLMRouter.
export {
  type LLMRouter,
  type RerankResult,
  type GenerateDelta,
  type GenerateDone,
  type GenerateOptions,
  type GenerateClient,
  type LLMRouterDeps,
  DefaultLLMRouter,
  createLLMRouter,
} from "./llm/router.js";
export {
  type EmbeddingClient,
  embedBatched,
  makeOpenAIEmbeddingClient,
} from "./llm/providers/openai.js";
export {
  makeCohereRerankClient,
  COHERE_RERANK_MODEL,
  type RerankClient,
} from "./llm/providers/cohere.js";
export { makeGeminiClient, GEMINI_MODEL } from "./llm/providers/gemini.js";
export { makeAnthropicClient, ANTHROPIC_MODEL } from "./llm/providers/anthropic.js";
export { makeDeepSeekClient, DEEPSEEK_MODEL } from "./llm/providers/deepseek.js";
export { FakeLLMRouter, hashEmbed, overlapScore } from "./llm/fake.js";
export { NotImplementedError, MissingApiKeyError } from "./llm/errors.js";
export {
  makeRedisConnection,
  INGEST_QUEUE,
  createIngestQueue,
  createIngestWorker,
  enqueueIngest,
  type IngestJobName,
  type IngestJobMap,
  type IngestHandlers,
  type EnqueueOptions,
  type CrawlUrlData,
  type CrawlSitemapData,
  type ParseFileData,
  type ParseTextData,
} from "./queue/index.js";
export {
  crawlUrl,
  crawlSitemap,
  parseRobots,
  parseSitemap,
  extractLinks,
  createPlaywrightFetcher,
  type PageFetcher,
  type FetchedPage,
  type CrawlDeps,
  type CrawlOptions,
} from "./ingest/crawl.js";
export {
  parseFile,
  parseText,
  detectKind,
  type ParsedDoc,
  type ParsedKind,
} from "./ingest/parse.js";
export { htmlToMarkdown } from "./ingest/html.js";
export { cleanHtml, type CleanedDoc } from "./ingest/clean.js";
export {
  chunkMarkdown,
  countTokens,
  type Chunk,
  type ChunkOptions,
} from "./ingest/chunk.js";
export {
  ingestDocument,
  type IngestDocInput,
  type IngestDocResult,
} from "./ingest/orchestrate.js";
export { rateLimit, type RateLimitResult } from "./ratelimit.js";
export {
  buildPrompt,
  type BuildPromptInput,
  type BuiltPrompt,
  type PromptBot,
  type PromptChunk,
} from "./prompt/build.js";
export { rewriteQuery, type RewriteDeps } from "./query/rewrite.js";
export {
  retrieve,
  type RetrievedChunk,
  type RetrieveOptions,
  type RetrieveDeps,
} from "./query/retrieve.js";
export {
  rerankAndGate,
  type RankedChunk,
  type RerankGateResult,
  type RerankDeps,
  type RerankOptions,
} from "./query/rerank.js";
export {
  answerQuestion,
  REFUSAL_MESSAGE,
  BLOCK_MESSAGE,
  ESCALATE_MESSAGE,
  type AnswerEvent,
  type AnswerDone,
  type AnswerInput,
  type AnswerDeps,
} from "./query/answer.js";
export {
  extractCitations,
  mapCitations,
  detectLeak,
  matchesAnyGuard,
  type SourceChunk,
} from "./query/guard.js";
