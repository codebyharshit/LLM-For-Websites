import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import type { GenerateClient, GenerateOptions, GenerateDelta } from "../router.js";
import { MissingApiKeyError } from "../errors.js";

export const GEMINI_MODEL = "gemini-2.5-flash";

/** Gemini Flash (primary generation). Key checked at call-time. */
export function makeGeminiClient(apiKey: string, model = GEMINI_MODEL): GenerateClient {
  return {
    model,
    async *generate(opts: GenerateOptions): AsyncIterable<GenerateDelta> {
      if (!apiKey) throw new MissingApiKeyError("GEMINI_API_KEY");
      const genAI = new GoogleGenerativeAI(apiKey);
      const gm = genAI.getGenerativeModel({ model, systemInstruction: opts.system });
      const result = await gm.generateContentStream({
        contents: opts.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        // thinkingConfig disables 2.5-flash's hidden reasoning, which would otherwise consume
        // the output-token budget and truncate short completions (e.g. the query rewrite).
        // It isn't in the @google/generative-ai types yet but the v1beta API accepts it.
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxTokens ?? 500,
          thinkingConfig: { thinkingBudget: 0 },
        } as GenerationConfig,
      });
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield { delta: text };
      }
      const resp = await result.response;
      const usage = resp.usageMetadata;
      yield {
        delta: "",
        done: {
          modelUsed: model,
          tokensIn: usage?.promptTokenCount ?? 0,
          tokensOut: usage?.candidatesTokenCount ?? 0,
        },
      };
    },
  };
}
