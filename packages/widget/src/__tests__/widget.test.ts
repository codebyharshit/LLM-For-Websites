import { describe, it, expect, beforeEach } from "vitest";
import { initWidget } from "../widget.js";

function streamFrom(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
}

const SSE =
  'event: token\ndata: {"delta":"Hello "}\n\n' +
  'event: token\ndata: {"delta":"world"}\n\n' +
  'event: done\ndata: {"message_id":"m1","conversation_id":"c1","sources":[{"n":1,"url":"https://x.test/a","title":"A"}],"escalate":false,"model_used":"fake"}\n\n';

async function waitFor(fn: () => boolean, ms = 1000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("initWidget", () => {
  let calls: string[];

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    calls = [];
    const fetchMock = async (url: string | URL): Promise<unknown> => {
      const u = String(url);
      calls.push(u);
      if (u.endsWith("/v1/widget-config")) {
        return {
          ok: true,
          json: async () => ({
            name: "Buycycle",
            theme: {},
            greeting: "Hi! Ask me anything.",
            quick_prompts: [],
            languages: ["en"],
          }),
        };
      }
      if (u.endsWith("/v1/chat")) return { ok: true, body: streamFrom(SSE) };
      return { ok: true, json: async () => ({ ok: true }) };
    };
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders the launcher and greeting", async () => {
    initWidget({ token: "tok", apiUrl: "http://api.test", mount: document.body });
    expect(document.querySelector(".srag-launcher")).toBeTruthy();
    await waitFor(() => document.body.textContent?.includes("Ask me anything") ?? false);
  });

  it("streams an answer with sources and posts feedback", async () => {
    initWidget({ token: "tok", apiUrl: "http://api.test", mount: document.body });
    const input = document.querySelector(".srag-input") as HTMLInputElement;
    input.value = "What is the return policy?";
    const form = document.querySelector(".srag-form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    await waitFor(() => (document.body.textContent ?? "").includes("Hello world"));
    expect(document.querySelector(".srag-sources a")).toBeTruthy();
    expect((document.querySelector(".srag-sources a") as HTMLAnchorElement).href).toContain(
      "x.test/a",
    );

    const thumbs = document.querySelector(".srag-fb") as HTMLButtonElement;
    thumbs.click();
    await waitFor(() => calls.some((c) => c.endsWith("/v1/feedback")));
    expect(calls.some((c) => c.endsWith("/v1/feedback"))).toBe(true);
  });
});
