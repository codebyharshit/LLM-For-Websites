import Fastify, { type FastifyInstance } from "fastify";
import { authPlugin } from "./auth/plugin.js";
import { authRoutes } from "./auth/routes.js";

/** Build the Fastify app (no listen) so tests can use app.inject(). */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  app.get("/health", async () => ({ ok: true }));
  return app;
}
