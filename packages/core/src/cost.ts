/** Approximate USD price per 1M tokens (input/output) per model. */
const PRICES: Record<string, { in: number; out: number }> = {
  "gemini-1.5-flash": { in: 0.075, out: 0.3 },
  "claude-3-5-haiku-latest": { in: 0.8, out: 4.0 },
  "deepseek-chat": { in: 0.27, out: 1.1 },
  "text-embedding-3-small": { in: 0.02, out: 0 },
};

/** Estimate the USD cost of a turn from its model + token counts. */
export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICES[model];
  if (!p) return 0; // unknown / "none" / "fake" / "blocked"
  return (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
}

/** Nearest-rank percentile (p in 0..100) of an unsorted numeric array. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx]!;
}
