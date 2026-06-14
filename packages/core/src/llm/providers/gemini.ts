import type { GenerateOptions, GenerateDelta } from "../router.js";
import { NotImplementedError } from "../errors.js";

/** Gemini Flash (primary generation). Typed stub; implemented in T2.6. */
export async function* generateGemini(_opts: GenerateOptions): AsyncIterable<GenerateDelta> {
  throw new NotImplementedError("gemini generate");
}
