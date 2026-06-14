import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { bots } from "./bots.js";
import type { SourceType, SourceStatus } from "./_custom.js";

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  type: text("type").$type<SourceType>().notNull(),
  location: text("location"),
  status: text("status").$type<SourceStatus>().notNull().default("pending"),
  pageCount: integer("page_count").notNull().default(0),
  chunkCount: integer("chunk_count").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
