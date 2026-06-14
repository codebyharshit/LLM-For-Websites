import { pgTable, uuid, text, timestamp, integer, vector } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { bots } from "./bots.js";
import { documents } from "./documents.js";
import { tsvector } from "./_custom.js";

/**
 * Retrievable content unit. `embedding` is a frozen 1536-dim vector
 * (text-embedding-3-small). `tsv` is a generated tsvector (read-only here).
 * HNSW (vector_cosine_ops) + GIN (tsv) indexes are created in the migration.
 */
export const chunks = pgTable("chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  // bot_id denormalized for fast bot-scoped retrieval.
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  headingPath: text("heading_path"),
  ordinal: integer("ordinal").notNull().default(0),
  tokenCount: integer("token_count"),
  embedding: vector("embedding", { dimensions: 1536 }),
  tsv: tsvector("tsv"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
