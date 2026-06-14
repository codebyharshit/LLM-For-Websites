import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  userId: string;
  tenantId: string;
  exp: number; // unix seconds
}

export interface MagicPayload {
  email: string;
  exp: number; // unix seconds
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Sign a JSON payload as `base64url(body).base64url(hmac)` (stateless; no DB row). */
export function sign(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify signature + (optional) `exp`. Returns the payload, or null if invalid/expired. */
export function verify<T extends { exp?: number }>(token: string, secret: string): T | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: T;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
  if (typeof payload.exp === "number" && payload.exp < nowSeconds()) return null;
  return payload;
}
