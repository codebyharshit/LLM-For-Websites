import { describe, it, expect } from "vitest";
import {
  renderTranscript,
  makeWebhookDelivery,
  makeResendDelivery,
  compositeDelivery,
  type EscalationPayload,
} from "../escalate.js";

const payload: EscalationPayload = {
  botName: "Buycycle",
  conversationId: "c1",
  leadEmail: "lead@example.com",
  ownerEmail: "owner@example.com",
  note: "please call",
  transcript: [
    { role: "user", content: "Can I get a refund?" },
    { role: "assistant", content: "Within 30 days, yes." },
  ],
};

describe("escalation delivery", () => {
  it("renders a transcript with the lead, note, and turns", () => {
    const text = renderTranscript(payload);
    expect(text).toContain("New lead for Buycycle");
    expect(text).toContain("lead@example.com");
    expect(text).toContain("please call");
    expect(text).toContain("USER: Can I get a refund?");
    expect(text).toContain("ASSISTANT: Within 30 days, yes.");
  });

  it("webhook delivery POSTs the payload", async () => {
    let captured: EscalationPayload | undefined;
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit): Promise<Response> => {
      captured = JSON.parse(String(init?.body)) as EscalationPayload;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;

    await makeWebhookDelivery("https://hook.test/lead").deliver(payload);
    expect(captured?.leadEmail).toBe("lead@example.com");
    expect(captured?.transcript).toHaveLength(2);
  });

  it("webhook is a no-op with no url; resend is a no-op with no key", async () => {
    await expect(makeWebhookDelivery("").deliver(payload)).resolves.toBeUndefined();
    await expect(makeResendDelivery("", "from@x.com").deliver(payload)).resolves.toBeUndefined();
  });

  it("composite runs all deliveries best-effort (one failure does not block)", async () => {
    let ok = false;
    const failing = { deliver: async () => { throw new Error("boom"); } };
    const succeeding = { deliver: async () => { ok = true; } };
    await compositeDelivery([failing, succeeding]).deliver(payload);
    expect(ok).toBe(true);
  });
});
