import Anthropic from "@anthropic-ai/sdk";
import type { GenerateClient, GenerateOptions, GenerateDelta } from "../router.js";
import { MissingApiKeyError } from "../errors.js";

export const ANTHROPIC_MODEL = "claude-3-5-haiku-latest";

/** Claude Haiku (fallback generation). Key checked at call-time. */
export function makeAnthropicClient(apiKey: string, model = ANTHROPIC_MODEL): GenerateClient {
  return {
    model,
    async *generate(opts: GenerateOptions): AsyncIterable<GenerateDelta> {
      if (!apiKey) throw new MissingApiKeyError("ANTHROPIC_API_KEY");
      const client = new Anthropic({ apiKey });
      const stream = client.messages.stream({
        model,
        max_tokens: opts.maxTokens ?? 500,
        temperature: opts.temperature ?? 0.2,
        system: opts.system,
        messages: opts.messages.map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
      });
      let tokensIn = 0;
      let tokensOut = 0;
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { delta: event.delta.text };
        } else if (event.type === "message_start") {
          tokensIn = event.message.usage.input_tokens;
        } else if (event.type === "message_delta") {
          tokensOut = event.usage.output_tokens;
        }
      }
      yield { delta: "", done: { modelUsed: model, tokensIn, tokensOut } };
    },
  };
}
