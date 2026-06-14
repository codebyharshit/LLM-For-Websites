import { describe, it, expect, afterEach } from "vitest";
import type { Redis } from "ioredis";
import type { Queue, Worker } from "bullmq";
import {
  makeRedisConnection,
  createIngestQueue,
  createIngestWorker,
  enqueueIngest,
  type IngestHandlers,
} from "@supportrag/core";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

describe("ingest queue + worker", () => {
  const cleanup: Array<() => Promise<unknown>> = [];

  afterEach(async () => {
    for (const fn of cleanup.splice(0)) await fn();
  });

  it("processes an enqueued job and reports completion", async () => {
    const qConn: Redis = makeRedisConnection(REDIS_URL);
    const wConn: Redis = makeRedisConnection(REDIS_URL);
    const queue: Queue = createIngestQueue(qConn);

    let handled: string | undefined;
    const done = new Promise<void>((resolve) => {
      const handlers: IngestHandlers = {
        async parse_text(data) {
          handled = data.sourceId;
          resolve();
        },
        async crawl_url() {},
        async crawl_sitemap() {},
        async parse_file() {},
      };
      const worker: Worker = createIngestWorker(wConn, handlers, { concurrency: 1 });
      cleanup.push(() => worker.close());
    });
    cleanup.push(() => queue.close());
    cleanup.push(() => qConn.quit());
    cleanup.push(() => wConn.quit());

    const jobId = await enqueueIngest(
      queue,
      "parse_text",
      { tenantId: "t", botId: "b", sourceId: "src-123", text: "hello" },
      { jobId: "test-job-1" },
    );
    expect(jobId).toBe("test-job-1");

    await done;
    expect(handled).toBe("src-123");
  });
});
