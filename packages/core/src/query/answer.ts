import type { ChatMsg, Source } from "@supportrag/shared";
import { logger } from "@supportrag/shared";
import type { LLMRouter } from "../llm/router.js";
import { rewriteQuery } from "./rewrite.js";
import { retrieve } from "./retrieve.js";
import { rerankAndGate } from "./rerank.js";
import { buildPrompt } from "../prompt/build.js";
import { mapCitations, detectLeak, matchesAnyGuard } from "./guard.js";

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
  /** guard_block rule contents — matching topics are refused deterministically. */
  guardBlock?: string[];
  /** guard_escalate rule contents — matching topics escalate to a human. */
  guardEscalate?: string[];
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

export const BLOCK_MESSAGE = "I'm not able to help with that topic.";

export const ESCALATE_MESSAGE =
  "That's something a human should help with — let me connect you with our team.";

function streamWords(text: string): { type: "token"; delta: string }[] {
  return text.split(" ").map((w) => ({ type: "token", delta: w + " " }));
}

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

  // Deterministic guard rules run first, before any retrieval or generation.
  if (matchesAnyGuard(input.message, input.guardBlock ?? [])) {
    for (const ev of streamWords(BLOCK_MESSAGE)) yield ev;
    yield {
      type: "done",
      payload: {
        answer: BLOCK_MESSAGE,
        sources: [],
        escalate: false,
        modelUsed: "blocked",
        rewrittenQuery: input.message,
        retrievedChunkIds: [],
        rerankTopScore: 0,
        tokensIn: 0,
        tokensOut: 0,
      },
    };
    return;
  }
  if (matchesAnyGuard(input.message, input.guardEscalate ?? [])) {
    for (const ev of streamWords(ESCALATE_MESSAGE)) yield ev;
    yield {
      type: "done",
      payload: {
        answer: ESCALATE_MESSAGE,
        sources: [],
        escalate: true,
        modelUsed: "none",
        rewrittenQuery: input.message,
        retrievedChunkIds: [],
        rerankTopScore: 0,
        tokensIn: 0,
        tokensOut: 0,
      },
    };
    return;
  }

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

  // Map [n] citations in the answer back to chunk sources; flag any prompt leak.
  const sources: Source[] = mapCitations(
    answer,
    chunks.map((c) => ({ url: c.url, title: c.title })),
  );
  if (detectLeak(answer)) {
    logger.warn({ botId: input.botId }, "possible system-prompt leak in answer");
  }

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
