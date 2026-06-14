import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const bots = pgTable("bots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  persona: text("persona"),
  publicToken: text("public_token").notNull().unique(),
  greeting: text("greeting"),
  theme: jsonb("theme")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  languages: text("languages").array().notNull().default([]),
  quickPrompts: text("quick_prompts").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
