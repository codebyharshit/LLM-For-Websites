import { sql, eq, and, desc } from "drizzle-orm";
import { withTenant, chunks, documents, type Database } from "@supportrag/db";
import type { LLMRouter } from "../llm/router.js";

export interface RetrievedChunk {
  id: string;
  content: string;
  headingPath: string | null;
  documentId: string;
  url: string | null;
  title: string | null;
  score: number; // fused RRF score
}

export interface RetrieveOptions {
  vectorTopK?: number; // default 20
  ftsTopK?: number; // default 20
  rrfK?: number; // default 60
  limit?: number; // max fused candidates returned (default 40)
}

export interface RetrieveDeps {
  router: LLMRouter;
}

interface Row {
  id: string;
  content: string;
  headingPath: string | null;
  documentId: string;
  url: string | null;
  title: string | null;
}

const SELECT = {
  id: chunks.id,
  content: chunks.content,
  headingPath: chunks.headingPath,
  documentId: chunks.documentId,
  url: documents.url,
  title: documents.title,
};

async function vectorSearch(
  db: Database,
  botId: string,
  qvec: number[],
  limit: number,
): Promise<Row[]> {
  const lit = `[${qvec.join(",")}]`;
  const distance = sql<number>`${chunks.embedding} <=> ${lit}::vector`;
  return db
    .select(SELECT)
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(eq(chunks.botId, botId))
    .orderBy(distance)
    .limit(limit);
}

async function ftsSearch(
  db: Database,
  botId: string,
  query: string,
  limit: number,
): Promise<Row[]> {
  const tsq = sql`websearch_to_tsquery('simple', ${query})`;
  const rank = sql<number>`ts_rank(${chunks.tsv}, ${tsq})`;
  return db
    .select(SELECT)
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(and(eq(chunks.botId, botId), sql`${chunks.tsv} @@ ${tsq}`))
    .orderBy(desc(rank))
    .limit(limit);
}

/** Reciprocal Rank Fusion: score(id) = Σ 1/(k + rank_i), rank 1-based per list. */
function fuse(lists: Row[][], k: number): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((row, idx) => {
      scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return scores;
}

/**
 * Hybrid retrieval (§A.6): embed the query, run pgvector (cosine) and full-text search
 * (websearch_to_tsquery) in parallel — both bot-scoped and under RLS — then merge with RRF.
 * The FTS arm surfaces exact-term hits that dense retrieval alone can miss.
 */
export async function retrieve(
  query: string,
  botId: string,
  tenantId: string,
  deps: RetrieveDeps,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const vectorTopK = opts.vectorTopK ?? 20;
  const ftsTopK = opts.ftsTopK ?? 20;
  const rrfK = opts.rrfK ?? 60;
  const limit = opts.limit ?? 40;

  const [qvec] = await deps.router.embed([query]);
  if (!qvec) return [];

  const [vectorRows, ftsRows] = await Promise.all([
    withTenant(tenantId, (db) => vectorSearch(db, botId, qvec, vectorTopK)),
    withTenant(tenantId, (db) => ftsSearch(db, botId, query, ftsTopK)),
  ]);

  const scores = fuse([vectorRows, ftsRows], rrfK);
  const meta = new Map<string, Row>();
  for (const row of [...vectorRows, ...ftsRows]) if (!meta.has(row.id)) meta.set(row.id, row);

  return [...scores.entries()]
    .map(([id, score]) => {
      const row = meta.get(id)!;
      return {
        id,
        content: row.content,
        headingPath: row.headingPath,
        documentId: row.documentId,
        url: row.url,
        title: row.title,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
