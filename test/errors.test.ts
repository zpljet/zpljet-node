import { describe, expect, it } from "vitest";
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  AuthenticationError,
  BadRequestError,
  ConversionFailedError,
  PayloadTooLargeError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  ServiceUnavailableError,
  ZplJetError,
} from "../src/index";

describe("APIError.from", () => {
  const CASES: [string, unknown][] = [
    ["invalid_request", BadRequestError],
    ["missing_api_key", AuthenticationError],
    ["invalid_api_key", AuthenticationError],
    ["payload_too_large", PayloadTooLargeError],
    ["quota_exceeded", QuotaExceededError],
    ["hosting_not_allowed", PermissionDeniedError],
    ["no_retention_enforced", PermissionDeniedError],
    ["rate_limit_exceeded", RateLimitError],
    ["conversion_failed", ConversionFailedError],
    ["service_unavailable", ServiceUnavailableError],
  ];

  it.each(CASES)("maps %s to the right subclass", (code, cls) => {
    const err = APIError.from(400, { code, message: "m" });
    expect(err).toBeInstanceOf(cls as new (...args: never[]) => unknown);
    expect(err.code).toBe(code);
    expect(err.message).toBe("m");
  });

  it("falls back to APIError for unknown codes", () => {
    const err = APIError.from(500, { code: "brand_new_code", message: "m" });
    expect(err.constructor).toBe(APIError);
    expect(err.code).toBe("brand_new_code");
  });

  it("builds a default message when the body has none", () => {
    const err = APIError.from(500, {});
    expect(err.message).toBe("HTTP 500 error from the ZPLJet API");
    expect(err.code).toBeUndefined();
  });

  it("keeps the full raw payload", () => {
    const raw = { code: "quota_exceeded", message: "m", plan: "free", surprise: true };
    const err = APIError.from(402, raw);
    expect(err.raw).toEqual(raw);
  });

  it("ignores context fields of the wrong type", () => {
    const err = APIError.from(429, {
      code: "rate_limit_exceeded",
      message: "m",
      retryAfter: "soon", // wrong type on purpose
    }) as RateLimitError;
    expect(err.retryAfter).toBeUndefined();
  });
});

describe("hierarchy", () => {
  it("every error extends ZplJetError and Error", () => {
    for (const err of [
      new APIError(500, "m"),
      new APIConnectionError(),
      new APITimeoutError(),
      APIError.from(400, { code: "invalid_request", message: "m" }),
    ]) {
      expect(err).toBeInstanceOf(ZplJetError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it("APITimeoutError is an APIConnectionError (both retryable)", () => {
    expect(new APITimeoutError()).toBeInstanceOf(APIConnectionError);
  });

  it("error names match their class", () => {
    expect(new APITimeoutError().name).toBe("APITimeoutError");
    expect(APIError.from(402, { code: "quota_exceeded", message: "m" }).name).toBe(
      "QuotaExceededError",
    );
  });
});
