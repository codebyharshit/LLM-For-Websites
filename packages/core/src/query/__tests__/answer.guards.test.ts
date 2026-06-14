import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  getAdminDb,
  closePool,
  tenants,
  bots,
  sources,
  documents,
  chunks as chunksTable,
} from "@supportrag/db";
import type { LLMRouter, GenerateDelta } from "../../llm/router.js";
import { FakeLLMRouter, hashEmbed } from "../../llm/fake.js";
import { answerQuestion, type AnswerDone } from "../answer.js";

// Router that captures the system prompt and never blocks generation.
function spyRouter(): { router: LLMRouter; system: () => string; generated: () => boolean } {
  const fake = new FakeLLMRouter();
  let system = "";
  let generated = false;
  const router: LLMRouter = {
    embed: (t) => fake.embed(t),
    rerank: (q, d, n) => fake.rerank(q, d, n),
    async *generate(opts): AsyncIterable<GenerateDelta> {
      generated = true;
      system = opts.system;
      yield { delta: "ok " };
      yield { delta: "", done: { modelUsed: "fake", tokensIn: 1, tokensOut: 1 } };
    },
  };
  return { router, system: () => system, generated: () => generated };
}

async function collect(input: Parameters<typeof answerQuestion>[0], router: LLMRouter): Promise<AnswerDone> {
  let done: AnswerDone | undefined;
  for await (const ev of answerQuestion(input, { router })) {
    if (ev.type === "done") done = ev.payload;
  }
  return done!;
}

describe("answerQuestion + rules", () => {
  let tenantId: string;
  let botId: string;

  beforeAll(async () => {
    const db = getAdminDb();
    const [t] = await db.insert(tenants).values({ name: `g-${randomUUID()}` }).returning();
    tenantId = t!.id;
    const [b] = await db
      .insert(bots)
      .values({ tenantId, name: "Bot", publicToken: randomUUID() })
      .returning();
    botId = b!.id;
    const [s] = await db
      .insert(sources)
      .values({ tenantId, botId, type: "text", location: "seed" })
      .returning();
    const [doc] = await db
      .insert(documents)
      .values({ tenantId, botId, sourceId: s!.id, url: "https://x.test/a", title: "Doc" })
      .returning();
    const content = "Our return policy allows returns within 30 days for a refund.";
    await db
      .insert(chunksTable)
      .values({ tenantId, botId, documentId: doc!.id, content, embedding: hashEmbed(content, 1536) });
  });

  afterAll(async () => {
    await closePool();
  });

  const base = () => ({
    tenantId,
    botId,
    bot: { name: "Bot" },
    policies: [],
    history: [],
    tau: 0.3,
  });

  it("guard_block refuses deterministically without generating", async () => {
    const spy = spyRouter();
    const done = await collect(
      { ...base(), guardBlock: ["competitor pricing"], message: "what is your competitor pricing?" },
      spy.router,
    );
    expect(done.modelUsed).toBe("blocked");
    expect(done.escalate).toBe(false);
    expect(spy.generated()).toBe(false);
  });

  it("guard_escalate escalates without generating", async () => {
    const spy = spyRouter();
    const done = await collect(
      { ...base(), guardEscalate: ["refund over"], message: "I need a refund over 500 euros" },
      spy.router,
    );
    expect(done.escalate).toBe(true);
    expect(done.modelUsed).toBe("none");
    expect(spy.generated()).toBe(false);
  });

  it("policy rules reach the generation prompt", async () => {
    const spy = spyRouter();
    await collect(
      { ...base(), policies: ["No refunds after 30 days."], message: "what is the return policy?" },
      spy.router,
    );
    expect(spy.generated()).toBe(true);
    expect(spy.system()).toContain("No refunds after 30 days.");
    expect(spy.system().indexOf("COMPANY POLICIES")).toBeLessThan(spy.system().indexOf("CONTEXT:"));
  });
});
