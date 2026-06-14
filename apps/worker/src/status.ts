import { eq } from "drizzle-orm";
import { withTenant, sources, type SourceStatus } from "@supportrag/db";

export interface SourceStatusPatch {
  status?: SourceStatus;
  pageCount?: number;
  chunkCount?: number;
  error?: string | null;
}

/** Update a source's status/counts under the tenant's RLS context. */
export async function setSourceStatus(
  tenantId: string,
  sourceId: string,
  patch: SourceStatusPatch,
): Promise<void> {
  await withTenant(tenantId, async (db) => {
    await db
      .update(sources)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
  });
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
