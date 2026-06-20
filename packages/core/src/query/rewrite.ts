import type { ChatMsg } from "@supportrag/shared";
import type { LLMRouter } from "../llm/router.js";

export interface RewriteDeps {
  router: LLMRouter;
  maxHistoryTurns?: number;
}

const SYSTEM =
  "You rewrite a user's follow-up question into a standalone question. Given the conversation " +
  "and the follow-up, produce a single self-contained question that resolves pronouns and " +
  "implicit references using the conversation. Output ONLY the rewritten question — no preamble.";

const FOLLOWUP_START = /^(and|but|or|so|also|then|what about|how about|ok(ay)?|plus)\b/i;
const PRONOUN = /\b(it|its|it's|that|this|those|these|they|them|their|theirs|one|ones)\b/i;

/**
 * A message needs rewriting only if it references the prior turns — it starts with a follow-up
 * connector, contains a referential pronoun, or is very short. A clear standalone question is
 * left alone, so we don't over-attach stale context on a topic change.
 */
function isLikelyFollowUp(message: string): boolean {
  const m = message.trim();
  const words = m.split(/\s+/).filter(Boolean).length;
  if (words <= 2) return true;
  return FOLLOWUP_START.test(m) || PRONOUN.test(m);
}

/**
 * Condense a follow-up into a standalone question using recent history. Passes through (no model
 * call) when there is no history OR the message is already a self-contained question.
 */
export async function rewriteQuery(
  message: string,
  history: ChatMsg[],
  deps: RewriteDeps,
): Promise<string> {
  const prior = history.filter((m) => m.role !== "system");
  if (prior.length === 0 || !isLikelyFollowUp(message)) return message;

  const turns = prior.slice(-(deps.maxHistoryTurns ?? 6));
  const convo = turns.map((m) => `${m.role}: ${m.content}`).join("\n");
  const user = `Conversation:\n${convo}\n\nFollow-up: ${message}\n\nStandalone question:`;

  let out = "";
  for await (const chunk of deps.router.generate({
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
    temperature: 0,
    maxTokens: 120,
    stream: true,
  })) {
    out += chunk.delta;
  }

  const rewritten = out.trim();
  // Guard against degenerate/truncated rewrites: a standalone rewrite normally expands the
  // follow-up with context, so a much shorter result means the model failed — keep the original.
  const origWords = message.trim().split(/\s+/).filter(Boolean).length;
  const newWords = rewritten.split(/\s+/).filter(Boolean).length;
  if (rewritten.length === 0 || (origWords > 3 && newWords < Math.max(2, origWords * 0.5))) {
    return message;
  }
  return rewritten;
}
