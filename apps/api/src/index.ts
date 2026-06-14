import { logger } from "@supportrag/shared";

// apps/api: Fastify HTTP server (public chat API + tenant dashboard API).
// Stubbed at T0.1; the Fastify server + routes land from T0.7 onward.
export function main(): void {
  logger.info("api stub booted");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}
