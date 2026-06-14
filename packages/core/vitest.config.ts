import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Most core tests are pure units; the ingest orchestrator test is an integration test
// against the local Docker Postgres (CI overrides these env vars).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    passWithNoTests: true,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/supportrag",
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    },
    testTimeout: 20000,
  },
});
