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

/**
 * Condense a follow-up into a standalone question using recent history. With no prior
 * conversation there is nothing to condense, so the message passes through unchanged
 * (and the model is not called).
 */
export async function rewriteQuery(
  message: string,
  history: ChatMsg[],
  deps: RewriteDeps,
): Promise<string> {
  const prior = history.filter((m) => m.role !== "system");
  if (prior.length === 0) return message;

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
