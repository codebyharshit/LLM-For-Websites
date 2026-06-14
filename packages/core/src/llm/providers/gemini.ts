import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerateClient, GenerateOptions, GenerateDelta } from "../router.js";
import { MissingApiKeyError } from "../errors.js";

export const GEMINI_MODEL = "gemini-1.5-flash";

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
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxTokens ?? 500,
        },
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
