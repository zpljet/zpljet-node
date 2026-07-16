import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  AuthenticationError,
  BadRequestError,
  ConversionFailedError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  VERSION,
  ZplJet,
  ZplJetError,
} from "../src/index";
import {
  ZPL,
  errorResponse,
  fetchQueue,
  hostedResponse,
  pdfResponse,
} from "./helpers";

function makeClient(fetch: typeof globalThis.fetch, options: Partial<ConstructorParameters<typeof ZplJet>[0]> = {}) {
  return new ZplJet({ apiKey: "zpl_test", maxRetries: 0, ...options, fetch });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("constructor", () => {
  it("requires an API key", () => {
    // @ts-expect-error — missing apiKey on purpose
    expect(() => new ZplJet({})).toThrow(ZplJetError);
    expect(() => new ZplJet({ apiKey: "  " })).toThrow(/Missing API key/);
  });

  it("applies defaults", () => {
    const client = new ZplJet({ apiKey: "zpl_test" });
    expect(client.baseUrl).toBe("https://api.zpljet.com");
    expect(client.timeoutMs).toBe(60_000);
    expect(client.maxRetries).toBe(2);
  });

  it("validates maxRetries and caps large values", () => {
    expect(() => new ZplJet({ apiKey: "zpl_test", maxRetries: -1 })).toThrow(
      TypeError,
    );
    expect(() => new ZplJet({ apiKey: "zpl_test", maxRetries: 1.5 })).toThrow(
      TypeError,
    );
    expect(new ZplJet({ apiKey: "zpl_test", maxRetries: 99 }).maxRetries).toBe(10);
  });

  it("requires a positive finite timeout", () => {
    for (const timeoutMs of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2_147_483_648,
    ]) {
      expect(() => new ZplJet({ apiKey: "zpl_test", timeoutMs })).toThrow(
        TypeError,
      );
    }
    expect(new ZplJet({ apiKey: "zpl_test", timeoutMs: 0.5 }).timeoutMs).toBe(
      0.5,
    );
  });

  it("strips trailing slashes from baseUrl", () => {
    const client = new ZplJet({ apiKey: "zpl_test", baseUrl: "http://localhost:3000//" });
    expect(client.baseUrl).toBe("http://localhost:3000");
  });

  it("rejects plaintext remote base URLs without explicit opt-in", () => {
    expect(
      () =>
        new ZplJet({
          apiKey: "zpl_test",
          baseUrl: "http://api.example.com",
        }),
    ).toThrow(/plaintext/);
    expect(
      () =>
        new ZplJet({
          apiKey: "zpl_test",
          baseUrl: "http://api.example.com",
          allowInsecureHttp: true,
        }),
    ).not.toThrow();
  });
});

describe("convert — request shape", () => {
  it("works with a WebIDL-bound fetch (browser window.fetch)", async () => {
    // Simulate WebIDL receiver checks.
    const queue = fetchQueue(pdfResponse());
    function strictFetch(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      if (this !== globalThis && this !== undefined) {
        throw new TypeError("Illegal invocation");
      }
      return queue(input, init);
    }
    const label = await makeClient(strictFetch as typeof fetch).convert({ zpl: ZPL });
    expect(label.contentType).toBe("application/pdf");
  });

  it("POSTs JSON with the API key and user agent", async () => {
    const fetch = fetchQueue(pdfResponse());
    await makeClient(fetch).convert({ zpl: ZPL, dpmm: 12, format: "pdf" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.zpljet.com/v1/convert");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.headers["x-api-key"]).toBe("zpl_test");
    expect(init.headers["user-agent"]).toBe(`zpljet-node/${VERSION}`);
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toEqual({ zpl: ZPL, dpmm: 12, format: "pdf" });
  });
});

describe("convert — data mode (default)", () => {
  it("returns the bytes, content type, and conversion id", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45]); // "%PDF-"
    const fetch = fetchQueue(pdfResponse("conv_abc", bytes));
    const label = await makeClient(fetch).convert({ zpl: ZPL });

    expect(label.data).toEqual(bytes);
    expect(label.contentType).toBe("application/pdf");
    expect(label.id).toBe("conv_abc");
  });
});

describe("convert — url mode", () => {
  it("returns the parsed hosted-label JSON", async () => {
    const fetch = fetchQueue(hostedResponse({ pages: 2, retentionDays: 7 }));
    const hosted = await makeClient(fetch).convert({ zpl: ZPL, output: "url" });

    expect(hosted.url).toContain("https://");
    expect(hosted.pages).toBe(2);
    expect(hosted.retentionDays).toBe(7);
    expect(hosted.id).toBe("conv_456");
  });

  it("rejects a malformed successful payload without retrying", async () => {
    const fetch = fetchQueue(
      new Response('{"id":"conv_456"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      makeClient(fetch, { maxRetries: 5 }).convert({ zpl: ZPL, output: "url" }),
    ).rejects.toThrow("Invalid");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("error mapping", () => {
  it("400 → BadRequestError with param", async () => {
    const fetch = fetchQueue(
      errorResponse(400, "invalid_request", "zpl: no ^XA…^XZ label found", { param: "zpl" }),
    );
    const err = await makeClient(fetch).convert({ zpl: "nope" }).catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_request");
    expect(err.param).toBe("zpl");
    expect(err.docUrl).toBe("https://zpljet.com/docs/errors#invalid_request");
  });

  it("401 → AuthenticationError", async () => {
    const fetch = fetchQueue(errorResponse(401, "invalid_api_key"));
    await expect(makeClient(fetch).convert({ zpl: ZPL })).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("402 → QuotaExceededError with quota context", async () => {
    const fetch = fetchQueue(
      errorResponse(402, "quota_exceeded", "Monthly quota exceeded", {
        plan: "free",
        quota: 500,
        used: 500,
        resetsAt: "2026-08-01T00:00:00.000Z",
      }),
    );
    const err = await makeClient(fetch).convert({ zpl: ZPL }).catch((e) => e);

    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err.plan).toBe("free");
    expect(err.quota).toBe(500);
    expect(err.used).toBe(500);
    expect(err.resetsAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("403 → PermissionDeniedError, code distinguishes the cause", async () => {
    const fetch = fetchQueue(errorResponse(403, "hosting_not_allowed"));
    const err = await makeClient(fetch)
      .convert({ zpl: ZPL, output: "url" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(PermissionDeniedError);
    expect(err.code).toBe("hosting_not_allowed");
  });

  it("502 conversion_failed → ConversionFailedError, never retried", async () => {
    const fetch = fetchQueue(
      errorResponse(502, "conversion_failed", "Could not render", { conversionId: "conv_x" }),
    );
    const err = await makeClient(fetch, { maxRetries: 5 })
      .convert({ zpl: ZPL })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConversionFailedError);
    expect(err.conversionId).toBe("conv_x");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("unknown code → plain APIError with raw payload", async () => {
    const fetch = fetchQueue(errorResponse(418, "future_code", "??", { extra: 1 }));
    const err = await makeClient(fetch).convert({ zpl: ZPL }).catch((e) => e);

    expect(err).toBeInstanceOf(APIError);
    expect(err.constructor.name).toBe("APIError");
    expect(err.status).toBe(418);
    expect(err.raw.extra).toBe(1);
  });

  it("non-JSON error body (gateway page) → APIError with default message", async () => {
    const fetch = fetchQueue(new Response("<html>Bad Gateway</html>", { status: 503 }));
    const err = await makeClient(fetch).convert({ zpl: ZPL }).catch((e) => e);

    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/HTTP 503/);
  });

  it("all API errors extend ZplJetError", async () => {
    const fetch = fetchQueue(errorResponse(401, "missing_api_key"));
    const err = await makeClient(fetch).convert({ zpl: ZPL }).catch((e) => e);
    expect(err).toBeInstanceOf(ZplJetError);
  });
});

describe("retries", () => {
  it("retries a 429 and succeeds", async () => {
    const fetch = fetchQueue(
      errorResponse(429, "rate_limit_exceeded", "slow down", { retryAfter: 0 }),
      pdfResponse(),
    );
    const label = await makeClient(fetch, { maxRetries: 2 }).convert({ zpl: ZPL });

    expect(label.contentType).toBe("application/pdf");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("clamps a negative retry delay to zero", async () => {
    const fetch = fetchQueue(
      errorResponse(429, "rate_limit_exceeded", "slow down", { retryAfter: -1 }),
      pdfResponse(),
    );
    await expect(
      makeClient(fetch, { maxRetries: 1 }).convert({ zpl: ZPL }),
    ).resolves.toMatchObject({ contentType: "application/pdf" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("honors Retry-After before the next attempt", async () => {
    vi.useFakeTimers();
    const fetch = fetchQueue(
      errorResponse(429, "rate_limit_exceeded", "slow down", { retryAfter: 3 }),
      pdfResponse(),
    );
    const promise = makeClient(fetch, { maxRetries: 1 }).convert({ zpl: ZPL });

    await vi.advanceTimersByTimeAsync(2_900);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toMatchObject({ contentType: "application/pdf" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws RateLimitError with context once retries are exhausted", async () => {
    const fetch = fetchQueue(
      errorResponse(429, "rate_limit_exceeded", "slow down", {
        retryAfter: 0,
        retryAt: "2026-07-06T00:00:01.000Z",
      }),
    );
    const err = await makeClient(fetch, { maxRetries: 2 })
      .convert({ zpl: ZPL })
      .catch((e) => e);

    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(0);
    expect(err.retryAt).toBe("2026-07-06T00:00:01.000Z");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries network errors with backoff, then succeeds", async () => {
    vi.useFakeTimers();
    const fetch = fetchQueue(new TypeError("fetch failed"), pdfResponse());
    const promise = makeClient(fetch, { maxRetries: 1 }).convert({ zpl: ZPL });

    await vi.advanceTimersByTimeAsync(1_000); // > 500ms base backoff + jitter
    await expect(promise).resolves.toMatchObject({ contentType: "application/pdf" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("wraps a persistent network failure in APIConnectionError", async () => {
    vi.useFakeTimers();
    const cause = new TypeError("fetch failed");
    const fetch = fetchQueue(cause, cause);
    const promise = makeClient(fetch, { maxRetries: 1 }).convert({ zpl: ZPL });
    const assertion = expect(promise).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(APIConnectionError);
      expect((err as APIConnectionError).cause).toBe(cause);
      return true;
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries transient 5xx without a structured body", async () => {
    vi.useFakeTimers();
    const fetch = fetchQueue(new Response("oops", { status: 500 }), pdfResponse());
    const promise = makeClient(fetch, { maxRetries: 1 }).convert({ zpl: ZPL });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(promise).resolves.toMatchObject({ contentType: "application/pdf" });
  });

  it("maxRetries: 0 fails on the first error", async () => {
    const fetch = fetchQueue(
      errorResponse(429, "rate_limit_exceeded", "slow down", { retryAfter: 0 }),
    );
    await expect(makeClient(fetch).convert({ zpl: ZPL })).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("honors the Retry-After header when the error body is not JSON", async () => {
    vi.useFakeTimers();
    const fetch = fetchQueue(
      new Response("<html>Too Many Requests</html>", {
        status: 429,
        headers: { "retry-after": "3" },
      }),
      pdfResponse(),
    );
    const promise = makeClient(fetch, { maxRetries: 1 }).convert({ zpl: ZPL });

    await vi.advanceTimersByTimeAsync(2_900);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toMatchObject({ contentType: "application/pdf" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("prefers the body's retryAfter over the Retry-After header", async () => {
    vi.useFakeTimers();
    const body = JSON.stringify({
      error: { code: "rate_limit_exceeded", message: "slow down", retryAfter: 1 },
    });
    const fetch = fetchQueue(
      new Response(body, {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "60" },
      }),
      pdfResponse(),
    );
    const promise = makeClient(fetch, { maxRetries: 1 }).convert({ zpl: ZPL });

    await vi.advanceTimersByTimeAsync(1_100); // body says 1s; header says 60s
    await expect(promise).resolves.toMatchObject({ contentType: "application/pdf" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries when the body stream errors mid-download", async () => {
    vi.useFakeTimers();
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError("terminated"));
        },
      }),
      { status: 200, headers: { "content-type": "application/pdf" } },
    );
    let call = 0;
    const fetch = vi.fn(async () =>
      call++ === 0 ? broken : pdfResponse(),
    ) as unknown as typeof globalThis.fetch;
    const promise = makeClient(fetch, { maxRetries: 1 }).convert({ zpl: ZPL });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(promise).resolves.toMatchObject({ contentType: "application/pdf" });
  });

  it("per-request maxRetries overrides the client default", async () => {
    const fetch = fetchQueue(
      errorResponse(429, "rate_limit_exceeded", "slow down", { retryAfter: 0 }),
      pdfResponse(),
    );
    const client = makeClient(fetch, { maxRetries: 0 });
    const label = await client.convert({ zpl: ZPL }, { maxRetries: 1 });
    expect(label.id).toBe("conv_123");
  });

  it("never retries 4xx client errors", async () => {
    const fetch = fetchQueue(errorResponse(400, "invalid_request", "bad", { param: "zpl" }));
    await expect(
      makeClient(fetch, { maxRetries: 5 }).convert({ zpl: "x" }),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("timeouts & cancellation", () => {
  function hangingFetch() {
    return vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason ?? new Error("aborted")),
          );
        }),
    ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  }

  it("validates per-request timeouts before fetching", async () => {
    const fetch = fetchQueue(pdfResponse());
    await expect(
      makeClient(fetch).convert({ zpl: ZPL }, { timeoutMs: 0 }),
    ).rejects.toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out an attempt and throws APITimeoutError", async () => {
    vi.useFakeTimers();
    const fetch = hangingFetch();
    const promise = makeClient(fetch).convert({ zpl: ZPL }, { timeoutMs: 1_000 });
    const assertion = expect(promise).rejects.toBeInstanceOf(APITimeoutError);
    await vi.advanceTimersByTimeAsync(1_001);
    await assertion;
  });

  it("retries timeouts like any connection error", async () => {
    vi.useFakeTimers();
    const fetch = hangingFetch();
    const promise = makeClient(fetch, { maxRetries: 1 }).convert(
      { zpl: ZPL },
      { timeoutMs: 1_000 },
    );
    const assertion = expect(promise).rejects.toBeInstanceOf(APITimeoutError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caller aborts propagate and are never retried", async () => {
    const fetch = hangingFetch();
    const controller = new AbortController();
    const promise = makeClient(fetch, { maxRetries: 5 }).convert(
      { zpl: ZPL },
      { signal: controller.signal },
    );
    const reason = new Error("user cancelled");
    controller.abort(reason);
    await expect(promise).rejects.toBe(reason);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves a non-Error abort reason during backoff", async () => {
    vi.useFakeTimers();
    const fetch = fetchQueue(new TypeError("fetch failed"), pdfResponse());
    const controller = new AbortController();
    const promise = makeClient(fetch, { maxRetries: 1 }).convert(
      { zpl: ZPL },
      { signal: controller.signal },
    );
    const assertion = expect(promise).rejects.toBe("stop");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort("stop");
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("an already-aborted signal short-circuits before any request", async () => {
    const fetch = fetchQueue(pdfResponse());
    const controller = new AbortController();
    controller.abort(new Error("too late"));
    await expect(
      makeClient(fetch).convert({ zpl: ZPL }, { signal: controller.signal }),
    ).rejects.toThrow("too late");
    expect(fetch).not.toHaveBeenCalled();
  });
});
