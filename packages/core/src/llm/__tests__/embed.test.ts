import { describe, it, expect, vi } from "vitest";
import { embedBatched, type EmbeddingClient } from "../providers/openai.js";

const DIMS = 1536;
const zeroVec = (): number[] => new Array<number>(DIMS).fill(0);

/** A fake client that records batch sizes and returns dim-correct vectors. */
function recordingClient(): { client: EmbeddingClient; batches: number[] } {
  const batches: number[] = [];
  const client: EmbeddingClient = {
    async create(input) {
      batches.push(input.length);
      return input.map(() => zeroVec());
    },
  };
  return { client, batches };
}

describe("embedBatched", () => {
  it("splits into batches of ≤256, preserving order/count", async () => {
    const { client, batches } = recordingClient();
    const texts = Array.from({ length: 300 }, (_, i) => `t${i}`);
    const out = await embedBatched(client, texts, { dims: DIMS });
    expect(out).toHaveLength(300);
    expect(batches).toEqual([256, 44]);
  });

  it("retries transient failures with backoff, then succeeds", async () => {
    let calls = 0;
    const client: EmbeddingClient = {
      async create(input) {
        calls++;
        if (calls === 1) throw new Error("transient 429");
        return input.map(() => zeroVec());
      },
    };
    const sleep = vi.fn(async () => undefined);
    const out = await embedBatched(client, ["a"], { dims: DIMS, sleep });
    expect(out).toHaveLength(1);
    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("throws on a dimension mismatch (frozen 1536 contract)", async () => {
    const client: EmbeddingClient = {
      async create(input) {
        return input.map(() => new Array<number>(512).fill(0));
      },
    };
    await expect(embedBatched(client, ["a"], { dims: DIMS })).rejects.toThrow(/dim_mismatch|dims/);
  });
});
