import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { AppError, getEnv, logger } from "@supportrag/shared";
import {
  makeRedisConnection,
  createIngestQueue,
  createLLMRouter,
  createEscalationDelivery,
  type LLMRouter,
  type EscalationDelivery,
} from "@supportrag/core";
import { authPlugin } from "./auth/plugin.js";
import { authRoutes } from "./auth/routes.js";
import { sourcesRoutes } from "./routes/sources.js";
import { chatRoutes } from "./routes/chat.js";
import { widgetRoutes } from "./routes/widget.js";
import { botRoutes } from "./routes/bot.js";
import { widgetAssetRoutes } from "./routes/widgetAsset.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { rulesRoutes } from "./routes/rules.js";
import { analyticsRoutes } from "./routes/analytics.js";

export interface BuildAppOptions {
  chatRateLimit?: { limit: number; windowSec: number };
  /** Inject a router (tests use FakeLLMRouter to run the pipeline without keys). */
  router?: LLMRouter;
  /** Inject escalation delivery (tests capture the payload). */
  escalationDelivery?: EscalationDelivery;
}

/** Build the Fastify app (no listen) so tests can use app.inject(). */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  // trustProxy: behind Railway/any TLS-terminating proxy, trust X-Forwarded-Proto/Host so
  // req.protocol is "https" (correct magic-link scheme) and Secure cookies are honored.
  const app = Fastify({ logger: false, trustProxy: true });
  const env = getEnv();
  const connection = makeRedisConnection(env.REDIS_URL);
  const queue = createIngestQueue(connection);
  const router = opts.router ?? createLLMRouter(env);
  const escalationDelivery = opts.escalationDelivery ?? createEscalationDelivery(env);

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

  // The public widget endpoints (/v1/*) are embedded on arbitrary customer origins, so we
  // reflect the request origin (origin: true). credentials:true keeps the cookie-based
  // dashboard working. NOTE for prod: split this — open CORS for /v1/* only, and restrict
  // the tenant/dashboard routes to APP_BASE_URL.
  await app.register(cors, { origin: true, credentials: true });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await sourcesRoutes(app, { queue });
  await botRoutes(app);
  await conversationsRoutes(app);
  await rulesRoutes(app);
  await analyticsRoutes(app);
  await chatRoutes(app, {
    redis: connection,
    router,
    ...(opts.chatRateLimit ? { rateLimit: opts.chatRateLimit } : {}),
  });
  await widgetRoutes(app, { delivery: escalationDelivery });
  await app.register(widgetAssetRoutes);
  app.get("/health", async () => ({ ok: true }));

  app.addHook("onClose", async () => {
    await queue.close();
    await connection.quit();
  });

  return app;
}
