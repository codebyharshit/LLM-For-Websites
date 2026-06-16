import { getEnv, logger } from "@supportrag/shared";
import { createLLMRouter, FakeLLMRouter } from "@supportrag/core";
import { BUYCYCLE, closePool } from "@supportrag/db";
import { runEvals } from "./run.js";

/** CLI: pnpm --filter @supportrag/evals run --tenant=buycycle [--n=10] */
async function main(): Promise<void> {
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant="))?.split("=")[1] ?? "buycycle";
  const nArg = Number(process.argv.find((a) => a.startsWith("--n="))?.split("=")[1] ?? "10");
  const tenantId = tenantArg === "buycycle" ? BUYCYCLE.tenantId : tenantArg;

  const env = getEnv();
  // Use real providers when keys are present; otherwise the deterministic fake.
  const router = env.OPENAI_API_KEY && env.COHERE_API_KEY ? createLLMRouter(env) : new FakeLLMRouter();

  const scores = await runEvals(tenantId, { router }, { n: nArg });
  logger.info({ scores }, "eval results");
  // Plain stdout for CI parsing.
  process.stdout.write(`${JSON.stringify(scores, null, 2)}\n`);
  await closePool();
}

main().catch((err: unknown) => {
  logger.error({ err }, "evals failed");
  process.exit(1);
});
