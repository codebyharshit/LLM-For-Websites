import { withTenant, bots } from "@supportrag/db";
import { answerQuestion, type LLMRouter } from "@supportrag/core";
import { generateQA } from "./generate.js";
import { recallAtK, faithfulness, idkCorrectness, type EvalDeps } from "./metrics.js";

export interface EvalScores {
  tenantId: string;
  botId: string;
  n: number;
  recallAt5: number;
  faithfulness: number;
  idkCorrectness: number;
}

const DEFAULT_OOD = [
  "What is the weather in Tokyo tomorrow?",
  "Who won the football world cup in 1998?",
  "Translate the word hello into French.",
];

export async function runEvals(
  tenantId: string,
  deps: EvalDeps,
  opts: { n?: number; outOfDomain?: string[]; tau?: number } = {},
): Promise<EvalScores> {
  const tau = opts.tau ?? 0.3;
  const botId = await withTenant(tenantId, async (db) => {
    const [b] = await db.select({ id: bots.id }).from(bots).limit(1);
    return b?.id;
  });
  if (!botId) throw new Error(`no bot found for tenant ${tenantId}`);

  const qa = await generateQA(tenantId, botId, opts.n ?? 10, deps);
  const recallAt5 = await recallAtK(tenantId, botId, qa, 5, deps);

  let fSum = 0;
  let fN = 0;
  for (const p of qa.slice(0, 5)) {
    let answer = "";
    for await (const ev of answerQuestion(
      { tenantId, botId, bot: { name: "bot" }, policies: [], history: [], message: p.question, tau: -1 },
      deps,
    )) {
      if (ev.type === "token") answer += ev.delta;
    }
    fSum += faithfulness(answer, [p.goldContent]);
    fN++;
  }

  const idk = await idkCorrectness(tenantId, botId, opts.outOfDomain ?? DEFAULT_OOD, tau, deps);

  return {
    tenantId,
    botId,
    n: qa.length,
    recallAt5,
    faithfulness: fN ? fSum / fN : 1,
    idkCorrectness: idk,
  };
}

export type { LLMRouter };
