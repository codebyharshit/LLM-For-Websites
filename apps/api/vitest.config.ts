import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// API integration tests run against the local Docker Postgres (CI overrides these).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    passWithNoTests: true,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/supportrag",
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
