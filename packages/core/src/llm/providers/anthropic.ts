import type { GenerateOptions, GenerateDelta } from "../router.js";
import { NotImplementedError } from "../errors.js";

/** Claude Haiku (fallback generation). Typed stub; implemented in T2.6. */
export async function* generateAnthropic(_opts: GenerateOptions): AsyncIterable<GenerateDelta> {
  throw new NotImplementedError("anthropic generate");
}
