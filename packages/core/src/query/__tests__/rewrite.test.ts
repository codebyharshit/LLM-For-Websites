import { describe, it, expect } from "vitest";
import type { ChatMsg } from "@supportrag/shared";
import type { LLMRouter, GenerateDelta } from "../../llm/router.js";
import { rewriteQuery } from "../rewrite.js";

/** A router whose generate() emits a fixed answer and counts calls. */
function stubRouter(answer: string): { router: LLMRouter; calls: () => number; lastPrompt: () => string } {
  let calls = 0;
  let lastPrompt = "";
  const router: LLMRouter = {
    async embed() {
      return [];
    },
    async rerank() {
      return [];
    },
    async *generate(opts): AsyncIterable<GenerateDelta> {
      calls++;
      lastPrompt = opts.messages.map((m) => m.content).join("\n");
      for (const w of answer.split(" ")) yield { delta: w + " " };
    },
  };
  return { router, calls: () => calls, lastPrompt: () => lastPrompt };
}

describe("rewriteQuery", () => {
  it("passes through and does not call the model when there is no history", async () => {
    const { router, calls } = stubRouter("UNUSED");
    const out = await rewriteQuery("How do I return a bike?", [], { router });
    expect(out).toBe("How do I return a bike?");
    expect(calls()).toBe(0);
  });

  it("rewrites a follow-up into a standalone question using history", async () => {
    const history: ChatMsg[] = [
      { role: "user", content: "Tell me about the pro plan." },
      { role: "assistant", content: "The pro plan includes priority support." },
    ];
    const { router, calls, lastPrompt } = stubRouter("What does the pro plan include?");
    const out = await rewriteQuery("what about it?", history, { router });
    expect(out).toBe("What does the pro plan include?");
    expect(calls()).toBe(1);
    // the prior conversation is included in the condense prompt
    expect(lastPrompt()).toContain("pro plan");
    expect(lastPrompt()).toContain("Follow-up: what about it?");
  });

  it("falls back to the original message if the model returns nothing", async () => {
    const { router } = stubRouter("   ");
    const out = await rewriteQuery("hello", [{ role: "user", content: "hi" }], { router });
    expect(out).toBe("hello");
  });

  const policyHistory: ChatMsg[] = [
    { role: "user", content: "What is the revocation deadline?" },
    { role: "assistant", content: "14 days." },
  ];

  it("passes through a clear standalone question even with history (no over-attach)", async () => {
    const { router, calls } = stubRouter("UNUSED");
    const out = await rewriteQuery("How much is express shipping?", policyHistory, { router });
    expect(out).toBe("How much is express shipping?"); // no pronoun/connector → not rewritten
    expect(calls()).toBe(0);
  });

  it("still rewrites a pronoun follow-up using history", async () => {
    const { router, calls } = stubRouter("When does the revocation period start?");
    const out = await rewriteQuery("when does that period start?", policyHistory, { router });
    expect(out).toBe("When does the revocation period start?"); // "that" → rewritten
    expect(calls()).toBe(1);
  });
});
