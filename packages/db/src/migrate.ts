import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { getEnv, logger } from "@supportrag/shared";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const migrationsDir = join(pkgRoot, "migrations");
const rlsFile = join(pkgRoot, "rls.sql");

/**
 * Apply pending SQL migrations in lexical order, then (always) re-apply the idempotent
 * RLS file so policy/role changes propagate. Connects as the superuser `app` role.
 */
export async function migrate(): Promise<void> {
  const env = getEnv();
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rowCount } = await client.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
      if (rowCount) {
        logger.info({ file }, "migration already applied, skipping");
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      logger.info({ file }, "applying migration");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations(name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    logger.info("applying rls.sql (idempotent)");
    await client.query(readFileSync(rlsFile, "utf8"));
    logger.info("migrations complete");
  } finally {
    await client.end();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (invokedDirectly) {
  migrate().catch((err: unknown) => {
    logger.error({ err }, "migration failed");
    process.exit(1);
  });
}
