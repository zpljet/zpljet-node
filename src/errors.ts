/** Typed ZPLJet API errors. */

/** Stable machine-readable error codes returned by the public API. */
export type ApiErrorCode =
  | "invalid_request"
  | "missing_api_key"
  | "invalid_api_key"
  | "payload_too_large"
  | "quota_exceeded"
  | "hosting_not_allowed"
  | "no_retention_enforced"
  | "rate_limit_exceeded"
  | "conversion_failed"
  | "service_unavailable";

/** Base class for every error thrown by this SDK. */
export class ZplJetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Network or protocol failure. */
export class APIConnectionError extends ZplJetError {
  constructor(message = "Connection error", options?: { cause?: unknown }) {
    super(message);
    if (options && "cause" in options) this.cause = options.cause;
  }
}

/** A single attempt exceeded the configured timeout. */
export class APITimeoutError extends APIConnectionError {
  constructor(message = "Request timed out") {
    super(message);
  }
}

/** An HTTP error response from the API. */
export class APIError extends ZplJetError {
  /** HTTP status code. */
  readonly status: number;
  /** Machine-readable code. Open string for forward compatibility. */
  readonly code: string | undefined;
  /** Link to the docs entry for this code. */
  readonly docUrl: string | undefined;
  /** The raw parsed `error` object, including any context fields. */
  readonly raw: Record<string, unknown>;

  constructor(status: number, message: string, raw: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = typeof raw.code === "string" ? raw.code : undefined;
    this.docUrl = typeof raw.docUrl === "string" ? raw.docUrl : undefined;
    this.raw = raw;
  }

  /** Build the most specific error subclass for a response. */
  static from(status: number, raw: Record<string, unknown>): APIError {
    const message =
      typeof raw.message === "string" && raw.message
        ? raw.message
        : `HTTP ${status} error from the ZPLJet API`;
    switch (raw.code) {
      case "invalid_request":
        return new BadRequestError(status, message, raw);
      case "missing_api_key":
      case "invalid_api_key":
        return new AuthenticationError(status, message, raw);
      case "payload_too_large":
        return new PayloadTooLargeError(status, message, raw);
      case "quota_exceeded":
        return new QuotaExceededError(status, message, raw);
      case "hosting_not_allowed":
      case "no_retention_enforced":
        return new PermissionDeniedError(status, message, raw);
      case "rate_limit_exceeded":
        return new RateLimitError(status, message, raw);
      case "conversion_failed":
        return new ConversionFailedError(status, message, raw);
      case "service_unavailable":
        return new ServiceUnavailableError(status, message, raw);
      default:
        return new APIError(status, message, raw);
    }
  }
}

/** 400 `invalid_request`. */
export class BadRequestError extends APIError {
  /** Dot-path of the invalid field, e.g. `"zpl"` or `"dpmm"`. */
  readonly param: string | undefined;

  constructor(status: number, message: string, raw: Record<string, unknown> = {}) {
    super(status, message, raw);
    this.param = typeof raw.param === "string" ? raw.param : undefined;
  }
}

/** 401 `missing_api_key` / `invalid_api_key` — check the `X-API-Key` value. */
export class AuthenticationError extends APIError {}

/** 413 `payload_too_large` — request body exceeded the API limit. */
export class PayloadTooLargeError extends APIError {}

/** 402 `quota_exceeded` — the monthly conversion quota is used up. */
export class QuotaExceededError extends APIError {
  /** Plan id the account is on (e.g. `"free"`). */
  readonly plan: string | undefined;
  /** Monthly quota for that plan. */
  readonly quota: number | undefined;
  /** Conversions used so far this month. */
  readonly used: number | undefined;
  /** ISO 8601 UTC timestamp — when the quota resets. */
  readonly resetsAt: string | undefined;

  constructor(status: number, message: string, raw: Record<string, unknown> = {}) {
    super(status, message, raw);
    this.plan = typeof raw.plan === "string" ? raw.plan : undefined;
    this.quota = typeof raw.quota === "number" ? raw.quota : undefined;
    this.used = typeof raw.used === "number" ? raw.used : undefined;
    this.resetsAt = typeof raw.resetsAt === "string" ? raw.resetsAt : undefined;
  }
}

/** 403 hosting permission error. */
export class PermissionDeniedError extends APIError {}

/** 429 `rate_limit_exceeded`. */
export class RateLimitError extends APIError {
  /** Seconds to wait before retrying. */
  readonly retryAfter: number | undefined;
  /** ISO 8601 UTC timestamp — when to retry. */
  readonly retryAt: string | undefined;

  constructor(status: number, message: string, raw: Record<string, unknown> = {}) {
    super(status, message, raw);
    this.retryAfter = typeof raw.retryAfter === "number" ? raw.retryAfter : undefined;
    this.retryAt = typeof raw.retryAt === "string" ? raw.retryAt : undefined;
  }
}

/** 502 `conversion_failed`; not retried. */
export class ConversionFailedError extends APIError {
  /** Id of the failed attempt — quote it when contacting support. */
  readonly conversionId: string | undefined;

  constructor(status: number, message: string, raw: Record<string, unknown> = {}) {
    super(status, message, raw);
    this.conversionId =
      typeof raw.conversionId === "string" ? raw.conversionId : undefined;
  }
}

/** 503 `service_unavailable`; not charged. */
export class ServiceUnavailableError extends APIError {
  /** Seconds to wait before retrying. */
  readonly retryAfter: number | undefined;

  constructor(status: number, message: string, raw: Record<string, unknown> = {}) {
    super(status, message, raw);
    this.retryAfter = typeof raw.retryAfter === "number" ? raw.retryAfter : undefined;
  }
}
