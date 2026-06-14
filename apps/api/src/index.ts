import { getEnv, logger } from "@supportrag/shared";
import { buildApp } from "./app.js";

export async function main(): Promise<void> {
  getEnv(); // fail fast on missing required env
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "api listening");
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (invokedDirectly) {
  main().catch((err: unknown) => {
    logger.error({ err }, "api failed to start");
    process.exit(1);
  });
}
