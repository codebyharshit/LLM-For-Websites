import { z } from "zod";

/**
 * Environment contract (§A.1). Infra connection strings are required so the system
 * fails fast without them. Vendor API keys default to empty: provider code throws a
 * clear error at call-time if its key is missing, so the platform boots and is testable
 * before keys are provisioned.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPENAI_API_KEY: z.string().default(""), // embeddings only
  COHERE_API_KEY: z.string().default(""), // rerank
  GEMINI_API_KEY: z.string().default(""), // primary generation
  ANTHROPIC_API_KEY: z.string().default(""), // fallback generation
  RESEND_API_KEY: z.string().default(""), // escalation email
  OBJECT_STORE_BUCKET: z.string().default(""), // raw uploaded files (S3-compatible)
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  WIDGET_CDN_URL: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(1).default("dev-secret-change-me"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMS: z.coerce.number().int().positive().default(1536),
  CONFIDENCE_TAU: z.coerce.number().default(0.3),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate an environment source. Throws an aggregated, readable error on
 * any invalid/missing required field. Pure: pass a fixture in tests.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

/**
 * Lazily parse process.env once and cache it. Apps call this; importing this module
 * never throws (so tests and tooling can import freely without a full env).
 */
export function getEnv(): Env {
  return (cached ??= parseEnv());
}
