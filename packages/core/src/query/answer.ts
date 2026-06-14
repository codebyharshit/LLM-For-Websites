import type { ChatMsg, Source } from "@supportrag/shared";
import type { LLMRouter } from "../llm/router.js";
import { rewriteQuery } from "./rewrite.js";
import { retrieve } from "./retrieve.js";
import { rerankAndGate } from "./rerank.js";
import { buildPrompt } from "../prompt/build.js";

export interface AnswerDone {
  answer: string;
  sources: Source[];
  escalate: boolean;
  modelUsed: string;
  rewrittenQuery: string;
  retrievedChunkIds: string[];
  rerankTopScore: number;
  tokensIn: number;
  tokensOut: number;
}

export type AnswerEvent =
  | { type: "token"; delta: string }
  | { type: "done"; payload: AnswerDone };

export interface AnswerInput {
  tenantId: string;
  botId: string;
  bot: { name: string; persona?: string | null };
  policies: string[];
  history: ChatMsg[];
  message: string;
  tau: number;
}

export interface AnswerDeps {
  router: LLMRouter;
}

export const REFUSAL_MESSAGE =
  "I'm sorry, I don't have enough information to answer that confidently. " +
  "I can connect you with a human who can help.";

/**
 * The full query pipeline as a stream of events: rewrite → retrieve → rerank+gate →
 * (refusal | prompt+generate). Below the confidence gate it streams the templated refusal
 * and escalates WITHOUT calling generation. Citations are refined in T2.7.
 */
export async function* answerQuestion(
  input: AnswerInput,
  deps: AnswerDeps,
): AsyncIterable<AnswerEvent> {
  const router = deps.router;
  const rewritten = await rewriteQuery(input.message, input.history, { router });
  const candidates = await retrieve(rewritten, input.botId, input.tenantId, { router });
  const gate = await rerankAndGate(rewritten, candidates, { router }, { tau: input.tau, topN: 5 });

  if (gate.gated) {
    for (const word of REFUSAL_MESSAGE.split(" ")) yield { type: "token", delta: word + " " };
    yield {
      type: "done",
      payload: {
        answer: REFUSAL_MESSAGE,
        sources: [],
        escalate: true,
        modelUsed: "none",
        rewrittenQuery: rewritten,
        retrievedChunkIds: candidates.map((c) => c.id),
        rerankTopScore: gate.topScore,
        tokensIn: 0,
        tokensOut: 0,
      },
    };
    return;
  }

  const chunks = gate.chunks;
  const { system, messages } = buildPrompt({
    bot: input.bot,
    policies: input.policies,
    chunks: chunks.map((c) => ({ content: c.content, url: c.url })),
    history: input.history,
    question: rewritten,
  });

  let answer = "";
  let modelUsed = "unknown";
  let tokensIn = 0;
  let tokensOut = 0;
  for await (const chunk of router.generate({
    system,
    messages,
    temperature: 0.2,
    maxTokens: 500,
    stream: true,
  })) {
    if (chunk.delta) {
      answer += chunk.delta;
      yield { type: "token", delta: chunk.delta };
    }
    if (chunk.done) {
      modelUsed = chunk.done.modelUsed;
      tokensIn = chunk.done.tokensIn;
      tokensOut = chunk.done.tokensOut;
    }
  }

  const sources: Source[] = chunks.map((c, i) => ({
    n: i + 1,
    url: c.url ?? "",
    title: c.title ?? "",
  }));

  yield {
    type: "done",
    payload: {
      answer,
      sources,
      escalate: false,
      modelUsed,
      rewrittenQuery: rewritten,
      retrievedChunkIds: chunks.map((c) => c.id),
      rerankTopScore: gate.topScore,
      tokensIn,
      tokensOut,
    },
  };
}
