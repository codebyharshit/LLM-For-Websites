import pino from "pino";

/**
 * Structured logger. Never use console.log in business code; log with structured fields.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
});

export type Logger = typeof logger;
