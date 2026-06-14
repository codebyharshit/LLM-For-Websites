import OpenAI from "openai";
import type { GenerateClient, GenerateOptions, GenerateDelta } from "../router.js";
import { MissingApiKeyError } from "../errors.js";

export const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

/** DeepSeek (final fallback) via the OpenAI-compatible API. Key checked at call-time. */
export function makeDeepSeekClient(apiKey: string, model = DEEPSEEK_MODEL): GenerateClient {
  return {
    model,
    async *generate(opts: GenerateOptions): AsyncIterable<GenerateDelta> {
      if (!apiKey) throw new MissingApiKeyError("DEEPSEEK_API_KEY");
      const client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
      const stream = await client.chat.completions.create({
        model,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 500,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: opts.system },
          ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      let tokensIn = 0;
      let tokensOut = 0;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield { delta };
        if (chunk.usage) {
          tokensIn = chunk.usage.prompt_tokens;
          tokensOut = chunk.usage.completion_tokens;
        }
      }
      yield { delta: "", done: { modelUsed: model, tokensIn, tokensOut } };
    },
  };
}
