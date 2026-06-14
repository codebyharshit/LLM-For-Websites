import { describe, it, expect } from "vitest";
import { DefaultLLMRouter, type GenerateClient, type GenerateDelta } from "../router.js";
import type { EmbeddingClient } from "../providers/openai.js";

const embeddingClient: EmbeddingClient = { async create() { return []; } };

function client(
  model: string,
  opts: { throwAtStart?: boolean; throwAfter?: number; deltas?: string[] },
): GenerateClient {
  return {
    model,
    async *generate(): AsyncIterable<GenerateDelta> {
      if (opts.throwAtStart) throw new Error(`${model} failed at start`);
      let emitted = 0;
      for (const d of opts.deltas ?? ["a", "b"]) {
        yield { delta: d };
        emitted++;
        if (opts.throwAfter !== undefined && emitted >= opts.throwAfter) {
          throw new Error(`${model} failed mid-stream`);
        }
      }
      yield { delta: "", done: { modelUsed: model, tokensIn: 1, tokensOut: 2 } };
    },
  };
}

async function collect(
  it: AsyncIterable<GenerateDelta>,
): Promise<{ text: string; model: string }> {
  let text = "";
  let model = "";
  for await (const c of it) {
    text += c.delta;
    if (c.done) model = c.done.modelUsed;
  }
  return { text, model };
}

describe("DefaultLLMRouter.generate fallback", () => {
  const opts = { system: "s", messages: [{ role: "user" as const, content: "q" }], stream: true as const };

  it("falls back to the next backend when the primary fails before emitting", async () => {
    const router = new DefaultLLMRouter({
      embeddingClient,
      dims: 1536,
      generateChain: [client("gemini", { throwAtStart: true }), client("haiku", { deltas: ["x", "y"] })],
    });
    const { text, model } = await collect(router.generate(opts));
    expect(text).toBe("xy");
    expect(model).toBe("haiku"); // model_used reflects the fallback
  });

  it("uses the primary when it succeeds", async () => {
    const router = new DefaultLLMRouter({
      embeddingClient,
      dims: 1536,
      generateChain: [client("gemini", { deltas: ["hi"] }), client("haiku", {})],
    });
    const { model } = await collect(router.generate(opts));
    expect(model).toBe("gemini");
  });

  it("rethrows if a backend fails after already streaming (can't unsend)", async () => {
    const router = new DefaultLLMRouter({
      embeddingClient,
      dims: 1536,
      generateChain: [client("gemini", { deltas: ["a", "b"], throwAfter: 1 }), client("haiku", {})],
    });
    await expect(collect(router.generate(opts))).rejects.toThrow(/mid-stream/);
  });

  it("throws when all backends fail", async () => {
    const router = new DefaultLLMRouter({
      embeddingClient,
      dims: 1536,
      generateChain: [client("gemini", { throwAtStart: true }), client("haiku", { throwAtStart: true })],
    });
    await expect(collect(router.generate(opts))).rejects.toThrow(/failed at start/);
  });
});
