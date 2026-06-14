import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "@supportrag/shared";
import { withTenant, documents, chunks as chunksTable } from "@supportrag/db";
import type { LLMRouter } from "../llm/router.js";
import { chunkMarkdown, type ChunkOptions } from "./chunk.js";

export interface IngestDocInput {
  tenantId: string;
  botId: string;
  sourceId: string;
  /** Final page URL (crawled sources); omitted for inline text. */
  url?: string;
  title?: string;
  /** Cleaned content as Markdown. */
  markdown: string;
}

export interface IngestDocResult {
  documentId: string;
  /** True when content_hash was unchanged → no re-embedding happened. */
  skipped: boolean;
  chunkCount: number;
}

function contentHash(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex");
}

/** Embed text per §A.6: "{title} — {heading_path}\n{content}". */
function embedText(title: string | undefined, headingPath: string, content: string): string {
  const prefix = [title?.trim(), headingPath.trim()].filter(Boolean).join(" — ");
  return prefix ? `${prefix}\n${content}` : content;
}

/**
 * Ingest one document: chunk → embed (with title/heading prefix) → upsert document and its
 * chunks under the bot. Idempotent on content: if the document's content_hash is unchanged
 * since last sync, nothing is re-embedded. Runs under the tenant's RLS context.
 */
export async function ingestDocument(
  input: IngestDocInput,
  deps: { router: LLMRouter; chunkOptions?: ChunkOptions },
): Promise<IngestDocResult> {
  const { tenantId, botId, sourceId, url, title, markdown } = input;
  const hash = contentHash(markdown);

  return withTenant(tenantId, async (db) => {
    const [existing] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.sourceId, sourceId),
          url ? eq(documents.url, url) : isNull(documents.url),
        ),
      );

    if (existing && existing.contentHash === hash) {
      const existingChunks = await db
        .select({ id: chunksTable.id })
        .from(chunksTable)
        .where(eq(chunksTable.documentId, existing.id));
      logger.info({ sourceId, url, documentId: existing.id }, "ingest skipped (unchanged)");
      return { documentId: existing.id, skipped: true, chunkCount: existingChunks.length };
    }

    // Upsert the document row.
    let documentId: string;
    if (existing) {
      await db
        .update(documents)
        .set({ title: title ?? null, contentHash: hash, updatedAt: new Date() })
        .where(eq(documents.id, existing.id));
      await db.delete(chunksTable).where(eq(chunksTable.documentId, existing.id));
      documentId = existing.id;
    } else {
      const [created] = await db
        .insert(documents)
        .values({ tenantId, botId, sourceId, url: url ?? null, title: title ?? null, contentHash: hash })
        .returning({ id: documents.id });
      if (!created) throw new Error("failed to insert document");
      documentId = created.id;
    }

    const chunks = chunkMarkdown(markdown, deps.chunkOptions);
    if (chunks.length === 0) {
      return { documentId, skipped: false, chunkCount: 0 };
    }

    const vectors = await deps.router.embed(
      chunks.map((c) => embedText(title, c.headingPath, c.content)),
    );

    await db.insert(chunksTable).values(
      chunks.map((c, idx) => ({
        tenantId,
        botId,
        documentId,
        content: c.content,
        headingPath: c.headingPath,
        ordinal: c.ordinal,
        tokenCount: c.tokenCount,
        embedding: vectors[idx]!,
      })),
    );

    logger.info({ sourceId, url, documentId, chunks: chunks.length }, "ingest complete");
    return { documentId, skipped: false, chunkCount: chunks.length };
  });
}
