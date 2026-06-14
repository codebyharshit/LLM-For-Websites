import { Queue, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { AppError, logger } from "@supportrag/shared";

export const INGEST_QUEUE = "ingest";

export interface CrawlUrlData {
  tenantId: string;
  botId: string;
  sourceId: string;
  url: string;
  /** Same-origin crawl depth for single-url sources (default 2). */
  depth?: number;
}
export interface CrawlSitemapData {
  tenantId: string;
  botId: string;
  sourceId: string;
  url: string;
}
export interface ParseFileData {
  tenantId: string;
  botId: string;
  sourceId: string;
  fileKey: string;
  filename: string;
}
export interface ParseTextData {
  tenantId: string;
  botId: string;
  sourceId: string;
  text: string;
  title?: string;
}

/** Job name → payload type. */
export interface IngestJobMap {
  crawl_url: CrawlUrlData;
  crawl_sitemap: CrawlSitemapData;
  parse_file: ParseFileData;
  parse_text: ParseTextData;
}
export type IngestJobName = keyof IngestJobMap;

/** A handler per job name; `data` is narrowed to that job's payload. */
export type IngestHandlers = {
  [N in IngestJobName]: (data: IngestJobMap[N], job: Job<IngestJobMap[N]>) => Promise<void>;
};

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export function createIngestQueue(connection: Redis): Queue {
  return new Queue(INGEST_QUEUE, { connection, defaultJobOptions });
}

export interface EnqueueOptions {
  /** Idempotency key: BullMQ drops a second job with the same id. */
  jobId?: string;
}

export async function enqueueIngest<N extends IngestJobName>(
  queue: Queue,
  name: N,
  data: IngestJobMap[N],
  opts: EnqueueOptions = {},
): Promise<string | undefined> {
  const job = await queue.add(name, data, { jobId: opts.jobId });
  return job.id;
}

/**
 * Create the ingest worker. Dispatches each job to its handler by name. Concurrency
 * defaults to 4 (matches the crawler's per-host cap).
 */
export function createIngestWorker(
  connection: Redis,
  handlers: IngestHandlers,
  opts: { concurrency?: number } = {},
): Worker {
  const worker = new Worker(
    INGEST_QUEUE,
    async (job: Job) => {
      const name = job.name as IngestJobName;
      const handler = handlers[name] as
        | ((data: unknown, job: Job) => Promise<void>)
        | undefined;
      if (!handler) {
        throw new AppError("unknown_job", `no handler registered for job "${job.name}"`);
      }
      await handler(job.data, job);
    },
    { connection, concurrency: opts.concurrency ?? 4 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, name: job?.name, err }, "ingest job failed");
  });
  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, name: job.name }, "ingest job completed");
  });

  return worker;
}
