import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getEnv, logger } from "@supportrag/shared";
import { BUYCYCLE } from "@supportrag/db";
import { verify, nowSeconds, type SessionPayload } from "./tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    session: SessionPayload | null;
  }
}

export const SESSION_COOKIE = "sid";

/** Parses the session cookie on every request and exposes `req.session`. */
export const authPlugin = fp(async (app) => {
  await app.register(cookie);
  app.decorateRequest("session", null);
  const env = getEnv();
  if (env.DEV_AUTH_BYPASS) {
    logger.warn("DEV_AUTH_BYPASS is ON — session auth is skipped, resolving to the seed tenant");
  }
  app.addHook("onRequest", async (req: FastifyRequest) => {
    const raw = req.cookies[SESSION_COOKIE];
    req.session = raw ? verify<SessionPayload>(raw, env.SESSION_SECRET) : null;
    // DEV ONLY: no cookie + bypass enabled → act as the seeded Buycycle owner.
    if (!req.session && env.DEV_AUTH_BYPASS) {
      req.session = {
        userId: BUYCYCLE.userId,
        tenantId: BUYCYCLE.tenantId,
        exp: nowSeconds() + 86400,
      };
    }
  });
});

/** preHandler that 401s unauthenticated requests. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.session) {
    await reply.code(401).send({ error: "unauthorized" });
  }
}
