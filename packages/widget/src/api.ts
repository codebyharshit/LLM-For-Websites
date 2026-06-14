import { parseSSEStream, type SSEEvent } from "./sse.js";

export interface WidgetConfig {
  name: string;
  theme: Record<string, unknown>;
  greeting: string | null;
  quick_prompts: string[];
  languages: string[];
}

export interface DoneData {
  message_id: string;
  conversation_id: string;
  sources: { n: number; url: string; title: string }[];
  escalate: boolean;
  model_used: string;
}

export class WidgetApi {
  constructor(
    private readonly apiUrl: string,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }

  async getConfig(): Promise<WidgetConfig> {
    const res = await fetch(`${this.apiUrl}/v1/widget-config`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    return (await res.json()) as WidgetConfig;
  }

  async *streamChat(sessionId: string, message: string): AsyncIterable<SSEEvent> {
    const res = await fetch(`${this.apiUrl}/v1/chat`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ session_id: sessionId, message }),
    });
    if (!res.body) return;
    yield* parseSSEStream(res.body);
  }

  async sendFeedback(messageId: string, value: 1 | -1): Promise<void> {
    await fetch(`${this.apiUrl}/v1/feedback`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ message_id: messageId, value }),
    });
  }

  async escalate(conversationId: string, email: string, note?: string): Promise<void> {
    await fetch(`${this.apiUrl}/v1/escalate`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ conversation_id: conversationId, email, note }),
    });
  }
}
