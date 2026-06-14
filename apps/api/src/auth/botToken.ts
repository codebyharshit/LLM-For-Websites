import { eq } from "drizzle-orm";
import { getAdminDb, bots } from "@supportrag/db";

export interface ResolvedBot {
  id: string;
  tenantId: string;
  name: string;
}

export function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1]!.trim() : null;
}

/**
 * Resolve a widget public token to its bot. public_token is globally unique, so this uses
 * the admin client (no tenant context yet); callers then scope DB work to bot.tenantId.
 */
export async function getBotByToken(token: string): Promise<ResolvedBot | null> {
  const [bot] = await getAdminDb()
    .select({ id: bots.id, tenantId: bots.tenantId, name: bots.name })
    .from(bots)
    .where(eq(bots.publicToken, token));
  return bot ?? null;
}
