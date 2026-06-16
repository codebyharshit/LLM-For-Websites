import { logger } from "@supportrag/shared";
import { createTenant } from "./admin.js";
import { closePool } from "./client.js";

/** CLI: pnpm --filter @supportrag/db db:create-tenant -- --name="Acme" --email="owner@acme.com" */
function arg(flag: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${flag}=`))?.split("=").slice(1).join("=");
}

async function main(): Promise<void> {
  const name = arg("name");
  const ownerEmail = arg("email");
  if (!name || !ownerEmail) {
    logger.error("usage: db:create-tenant -- --name=\"Acme\" --email=owner@acme.com [--bot=\"Acme Support\"]");
    process.exit(1);
  }
  const botName = arg("bot");
  const result = await createTenant(botName ? { name, ownerEmail, botName } : { name, ownerEmail });
  logger.info(result, "tenant created");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await closePool();
}

main().catch((err: unknown) => {
  logger.error({ err }, "create-tenant failed");
  process.exit(1);
});
