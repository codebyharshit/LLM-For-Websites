import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// DB tests are integration tests that run against the local Docker Postgres
// (never mocks). Default the connection to local infra if the env isn't already set
// (CI overrides these to its Postgres service).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    passWithNoTests: true,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/supportrag",
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    },
    // Integration tests share one DB; avoid cross-file parallelism races on it.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
