import { eq } from "drizzle-orm";
import { withTenant, chunks } from "@supportrag/db";
import type { LLMRouter } from "@supportrag/core";

export interface QAPair {
  question: string;
  goldChunkId: string;
  goldContent: string;
}

/**
 * Auto-generate Q/A pairs from a bot's chunks: each sampled chunk yields one question that
 * the chunk should answer (gold). The chunk id is the retrieval ground-truth for recall@k.
 */
export async function generateQA(
  tenantId: string,
  botId: string,
  n: number,
  deps: { router: LLMRouter },
): Promise<QAPair[]> {
  const rows = await withTenant(tenantId, (db) =>
    db
      .select({ id: chunks.id, content: chunks.content })
      .from(chunks)
      .where(eq(chunks.botId, botId))
      .limit(n),
  );

  const pairs: QAPair[] = [];
  for (const row of rows) {
    let q = "";
    for await (const ev of deps.router.generate({
      system: "Write exactly one question that the following text answers. Output only the question.",
      messages: [{ role: "user", content: row.content }],
      temperature: 0,
      maxTokens: 60,
      stream: true,
    })) {
      q += ev.delta;
    }
    pairs.push({
      question: q.trim() || row.content.slice(0, 100),
      goldChunkId: row.id,
      goldContent: row.content,
    });
  }
  return pairs;
}
