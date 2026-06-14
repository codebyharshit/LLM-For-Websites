/**
 * Typed application error. Carry a stable `code` for clients/logs; never swallow errors.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
