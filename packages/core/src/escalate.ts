import { Resend } from "resend";
import { logger, type Env } from "@supportrag/shared";

export interface EscalationPayload {
  botName: string;
  conversationId: string;
  /** Lead's email (captured in the widget form). */
  leadEmail: string;
  /** Business recipient for the notification. */
  ownerEmail: string;
  note?: string;
  transcript: { role: string; content: string }[];
}

export interface EscalationDelivery {
  deliver(payload: EscalationPayload): Promise<void>;
}

export function renderTranscript(p: EscalationPayload): string {
  const lines = p.transcript.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  return [
    `New lead for ${p.botName}`,
    `Lead email: ${p.leadEmail}`,
    p.note ? `Note: ${p.note}` : undefined,
    ``,
    `Transcript:`,
    lines || "(no messages)",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

/** Email the business owner via Resend. No-op (logged) when the key is unset. */
export function makeResendDelivery(apiKey: string, from: string): EscalationDelivery {
  return {
    async deliver(p) {
      if (!apiKey) {
        logger.warn({ conversationId: p.conversationId }, "RESEND_API_KEY unset; skipping email");
        return;
      }
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from,
        to: p.ownerEmail,
        subject: `New lead for ${p.botName}`,
        text: renderTranscript(p),
      });
    },
  };
}

/** POST the escalation payload to a webhook. No-op when the URL is unset. */
export function makeWebhookDelivery(url: string): EscalationDelivery {
  return {
    async deliver(p) {
      if (!url) return;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
    },
  };
}

/** Run several deliveries best-effort; one failing does not block the others. */
export function compositeDelivery(deliveries: EscalationDelivery[]): EscalationDelivery {
  return {
    async deliver(p) {
      await Promise.allSettled(
        deliveries.map((d) =>
          d.deliver(p).catch((err: unknown) => {
            logger.error({ err, conversationId: p.conversationId }, "escalation delivery failed");
          }),
        ),
      );
    },
  };
}

export function createEscalationDelivery(env: Env): EscalationDelivery {
  return compositeDelivery([
    makeResendDelivery(env.RESEND_API_KEY, env.ESCALATION_FROM_EMAIL),
    makeWebhookDelivery(env.ESCALATION_WEBHOOK_URL),
  ]);
}
