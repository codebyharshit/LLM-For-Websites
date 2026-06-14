import { pgTable, uuid, text, timestamp, integer, real, smallint } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { conversations } from "./conversations.js";
import type { MessageRole } from "./_custom.js";

/**
 * Full turn log — the eval dataset. Every chat turn writes one row with the
 * rewritten query, retrieved chunk ids, rerank score, model, tokens, and latency.
 */
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").$type<MessageRole>().notNull(),
  content: text("content").notNull(),
  rewrittenQuery: text("rewritten_query"),
  retrievedChunkIds: uuid("retrieved_chunk_ids").array(),
  rerankTopScore: real("rerank_top_score"),
  modelUsed: text("model_used"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  latencyMs: integer("latency_ms"),
  feedback: smallint("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
