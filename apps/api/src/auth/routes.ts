import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getEnv, logger } from "@supportrag/shared";
import { getAdminDb, withTenant, tenants, users } from "@supportrag/db";
import { sign, verify, nowSeconds, type MagicPayload } from "./tokens.js";
import { SESSION_COOKIE, requireAuth } from "./plugin.js";

const RequestLinkBody = z.object({ email: z.string().email() });
const CallbackQuery = z.object({ token: z.string().min(1) });

const MAGIC_TTL = 15 * 60; // 15 min
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days

/**
 * Magic-link auth. v1 keeps it stateless (HMAC tokens, no sessions/tokens tables —
 * the schema is frozen). Email delivery (Resend) lands in M4; until then the link is
 * logged and returned in the response for dev/testing.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/request-link", async (req, reply) => {
    const { email } = RequestLinkBody.parse(req.body);
    const env = getEnv();
    const [user] = await getAdminDb().select().from(users).where(eq(users.email, email));
    if (!user) {
      // Do not reveal whether an account exists.
      return reply.send({ ok: true });
    }
    const token = sign({ email, exp: nowSeconds() + MAGIC_TTL }, env.SESSION_SECRET);
    // The callback lives on this API (not the dashboard), so build the link from the request host.
    const devLink = `${req.protocol}://${req.host}/auth/callback?token=${encodeURIComponent(token)}`;
    logger.info({ email }, "magic link issued");
    // Email delivery (Resend) lands later; until then, return the link in dev (http) only.
    const isDev = !env.APP_BASE_URL.startsWith("https");
    return reply.send(isDev ? { ok: true, devLink, devToken: token } : { ok: true });
  });

  app.get("/auth/callback", async (req, reply) => {
    const { token } = CallbackQuery.parse(req.query);
    const env = getEnv();
    const payload = verify<MagicPayload>(token, env.SESSION_SECRET);
    if (!payload) return reply.code(400).send({ error: "invalid_or_expired" });

    const [user] = await getAdminDb().select().from(users).where(eq(users.email, payload.email));
    if (!user) return reply.code(400).send({ error: "unknown_user" });

    const session = sign(
      { userId: user.id, tenantId: user.tenantId, exp: nowSeconds() + SESSION_TTL },
      env.SESSION_SECRET,
    );
    reply.setCookie(SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: env.APP_BASE_URL.startsWith("https"),
      maxAge: SESSION_TTL,
    });
    // Clicking the link lands the user in the dashboard, logged in.
    return reply.redirect(env.APP_BASE_URL);
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/me", { preHandler: requireAuth }, async (req, reply) => {
    // requireAuth guarantees a session here.
    const { userId, tenantId } = req.session!;
    const tenant = await withTenant(tenantId, async (db) => {
      const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
      return row;
    });
    return reply.send({
      userId,
      tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
    });
  });
}
