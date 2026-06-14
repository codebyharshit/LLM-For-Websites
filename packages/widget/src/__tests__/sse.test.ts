import { describe, it, expect } from "vitest";
import { parseSSEStream } from "../sse.js";

function streamFrom(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
}

describe("parseSSEStream", () => {
  it("parses event/data blocks", async () => {
    const sse =
      'event: token\ndata: {"delta":"Hi "}\n\n' +
      'event: token\ndata: {"delta":"there"}\n\n' +
      'event: done\ndata: {"message_id":"m1"}\n\n';
    const events = [];
    for await (const e of parseSSEStream(streamFrom(sse))) events.push(e);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ event: "token", data: { delta: "Hi " } });
    expect(events[2]).toEqual({ event: "done", data: { message_id: "m1" } });
  });
});
