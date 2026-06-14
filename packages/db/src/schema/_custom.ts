import { customType } from "drizzle-orm/pg-core";

/**
 * Postgres `tsvector`. The column is `GENERATED ALWAYS AS (...) STORED` in the migration,
 * so it is read-only at the ORM layer — declared here only so queries can select it.
 */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** Enum-like string unions, enforced by CHECK constraints in the migration. */
export type RuleKind = "persona" | "policy" | "guard_block" | "guard_escalate";
export type SourceType = "url" | "sitemap" | "file" | "text";
export type SourceStatus = "pending" | "syncing" | "synced" | "error";
export type MessageRole = "user" | "assistant";
