export { tenants } from "./tenants.js";
export { users } from "./users.js";
export { bots } from "./bots.js";
export { rules } from "./rules.js";
export { sources } from "./sources.js";
export { documents } from "./documents.js";
export { chunks } from "./chunks.js";
export { conversations } from "./conversations.js";
export { messages } from "./messages.js";
export type { RuleKind, SourceType, SourceStatus, MessageRole } from "./_custom.js";

import { tenants } from "./tenants.js";
import { users } from "./users.js";
import { bots } from "./bots.js";
import { rules } from "./rules.js";
import { sources } from "./sources.js";
import { documents } from "./documents.js";
import { chunks } from "./chunks.js";
import { conversations } from "./conversations.js";
import { messages } from "./messages.js";

/** Full schema object for the Drizzle client. */
export const schema = {
  tenants,
  users,
  bots,
  rules,
  sources,
  documents,
  chunks,
  conversations,
  messages,
};

/** Tenant-scoped tables (every one carries `tenant_id` and is protected by RLS). */
export const TENANT_TABLES = [
  "users",
  "bots",
  "rules",
  "sources",
  "documents",
  "chunks",
  "conversations",
  "messages",
] as const;
