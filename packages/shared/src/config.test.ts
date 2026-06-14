import { describe, it, expect } from "vitest";
import { parseEnv } from "./config.js";

const base = {
  DATABASE_URL: "postgres://app:app@localhost:5432/supportrag",
  REDIS_URL: "redis://localhost:6379",
};

describe("parseEnv", () => {
  it("parses a minimal valid env and applies defaults", () => {
    const env = parseEnv(base);
    expect(env.EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(env.EMBEDDING_DIMS).toBe(1536);
    expect(env.CONFIDENCE_TAU).toBe(0.3);
    expect(env.OPENAI_API_KEY).toBe("");
  });

  it("coerces numeric env strings", () => {
    const env = parseEnv({ ...base, EMBEDDING_DIMS: "1536", CONFIDENCE_TAU: "0.42" });
    expect(env.EMBEDDING_DIMS).toBe(1536);
    expect(env.CONFIDENCE_TAU).toBe(0.42);
  });

  it("throws a readable error when a required infra var is missing", () => {
    expect(() => parseEnv({ REDIS_URL: "redis://localhost:6379" })).toThrow(/DATABASE_URL/);
  });
});
