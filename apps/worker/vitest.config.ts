import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Worker tests are integration tests against the local Docker Redis (CI overrides these).
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
