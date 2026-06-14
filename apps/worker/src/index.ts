import { logger } from "@supportrag/shared";

// apps/worker: BullMQ worker process (ingestion jobs).
// Stubbed at T0.1; queue + handlers land from T1.1 onward.
export function main(): void {
  logger.info("worker stub booted");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}
