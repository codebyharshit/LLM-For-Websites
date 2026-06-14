import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError, getEnv, logger } from "@supportrag/shared";
import { makeRedisConnection, createIngestQueue } from "@supportrag/core";
import { authPlugin } from "./auth/plugin.js";
import { authRoutes } from "./auth/routes.js";
import { sourcesRoutes } from "./routes/sources.js";

/** Build the Fastify app (no listen) so tests can use app.inject(). */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const env = getEnv();
  const connection = makeRedisConnection(env.REDIS_URL);
  const queue = createIngestQueue(connection);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "invalid_request", issues: err.issues });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : "error";
    if (status >= 500) logger.error({ err }, "unhandled error");
    return reply
      .code(status)
      .send({ error: status >= 500 ? "internal_error" : "bad_request", message });
  });

  await app.register(authPlugin);
  await app.register(authRoutes);
  await sourcesRoutes(app, { queue });
  app.get("/health", async () => ({ ok: true }));

  app.addHook("onClose", async () => {
    await queue.close();
    await connection.quit();
  });

  return app;
}
