import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` writes drizzle-kit diffs here for reference/diffing only.
// The canonical migrations are the hand-authored SQL in ./migrations + ./rls.sql,
// applied by `pnpm db:migrate` (src/migrate.ts). Those express pgvector HNSW ops,
// the generated tsvector column, and RLS — which drizzle-kit cannot represent.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/supportrag",
  },
});
