import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/** Root tenant. Not tenant-scoped itself (it *is* the tenant). */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
