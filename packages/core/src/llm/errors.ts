import { AppError } from "@supportrag/shared";

/** Thrown by interface slots that are typed but not yet wired (filled in later tasks). */
export class NotImplementedError extends AppError {
  constructor(what: string) {
    super("not_implemented", `${what} is not implemented yet`, 501);
    this.name = "NotImplementedError";
  }
}

/** Thrown when a provider is called but its API key is not configured. */
export class MissingApiKeyError extends AppError {
  constructor(key: string) {
    super("missing_api_key", `${key} is not set`, 500);
    this.name = "MissingApiKeyError";
  }
}
