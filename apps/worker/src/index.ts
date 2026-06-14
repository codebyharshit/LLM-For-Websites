import { getEnv, logger } from "@supportrag/shared";
import {
  makeRedisConnection,
  createIngestWorker,
  createLLMRouter,
  createPlaywrightFetcher,
} from "@supportrag/core";
import { closePool } from "@supportrag/db";
import { makeHandlers } from "./handlers.js";

export async function main(): Promise<void> {
  const env = getEnv();
  const connection = makeRedisConnection(env.REDIS_URL);
  const router = createLLMRouter(env);
  const handlers = makeHandlers({
    router,
    createFetcher: () => createPlaywrightFetcher(),
  });
  const worker = createIngestWorker(connection, handlers, { concurrency: 4 });
  logger.info("ingest worker started");

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down worker");
    await worker.close();
    await connection.quit();
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (invokedDirectly) {
  main().catch((err: unknown) => {
    logger.error({ err }, "worker failed to start");
    process.exit(1);
  });
}
