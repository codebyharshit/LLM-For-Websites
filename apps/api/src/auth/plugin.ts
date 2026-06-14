import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getEnv } from "@supportrag/shared";
import { verify, type SessionPayload } from "./tokens.js";

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
  app.addHook("onRequest", async (req: FastifyRequest) => {
    const raw = req.cookies[SESSION_COOKIE];
    req.session = raw ? verify<SessionPayload>(raw, getEnv().SESSION_SECRET) : null;
  });
});

/** preHandler that 401s unauthenticated requests. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.session) {
    await reply.code(401).send({ error: "unauthorized" });
  }
}
