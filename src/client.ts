import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  ZplJetError,
} from "./errors";
import type {
  ClientOptions,
  ConvertParams,
  HostedLabel,
  LabelData,
  RequestOptions,
} from "./types";
import { VERSION } from "./version";

const DEFAULT_BASE_URL = "https://api.zpljet.com";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRIES_CAP = 10;

/** Maximum retry delay. */
const MAX_RETRY_DELAY_MS = 30_000;
/** Initial retry delay. */
const BASE_RETRY_DELAY_MS = 500;

/** Buffered HTTP response. */
interface RawResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  body: Uint8Array;
}

/**
 * ZPLJet API client.
 *
 * ```ts
 * import { ZplJet } from "@zpljet/node";
 *
 * const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY! });
 * const label = await zpljet.convert({ zpl: "^XA^FO50,50^A0N,50,50^FDHello^FS^XZ" });
 * // label.data is a Uint8Array of PDF bytes
 * ```
 *
 * Retries rate limits, transient server errors, and network failures.
 */
export class ZplJet {
  /** API origin requests are sent to. */
  readonly baseUrl: string;
  /** Default per-attempt timeout in milliseconds. */
  readonly timeoutMs: number;
  /** Default max automatic retries per request. */
  readonly maxRetries: number;

  readonly #apiKey: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: ClientOptions) {
    if (!options || typeof options.apiKey !== "string" || !options.apiKey.trim()) {
      throw new ZplJetError(
        "Missing API key. Pass { apiKey: 'zpl_…' } — create one at https://zpljet.com/dashboard.",
      );
    }
    this.#apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    assertSecureBaseUrl(this.baseUrl, options.allowInsecureHttp ?? false);
    this.timeoutMs = normalizeTimeoutMs(
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      "timeoutMs",
    );
    this.maxRetries = normalizeMaxRetries(
      options.maxRetries ?? DEFAULT_MAX_RETRIES,
      "maxRetries",
    );
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new ZplJetError(
        "No fetch implementation available. Use Node.js ≥ 22, or pass one via { fetch }.",
      );
    }
    // Preserve the WebIDL receiver.
    this.#fetch = fetchImpl.bind(globalThis);
  }

  /**
   * Convert ZPL to a PDF or PNG.
   *
   * With `output: "data"` (the default) the API returns the raw file bytes
   * and stores nothing. With `output: "url"` (paid plans) the file is hosted
   * and a public link is returned.
   *
   * @throws {BadRequestError} the ZPL or parameters failed validation (400)
   * @throws {AuthenticationError} missing or invalid API key (401)
   * @throws {QuotaExceededError} monthly quota used up (402)
   * @throws {PermissionDeniedError} hosting not allowed for this account (403)
   * @throws {RateLimitError} rate limit exceeded, after retries (429)
   * @throws {ConversionFailedError} the engine could not render the ZPL (502)
   * @throws {APIConnectionError} network failure or timeout, after retries
   */
  convert(
    params: ConvertParams & { output: "url" },
    options?: RequestOptions,
  ): Promise<HostedLabel>;
  convert(
    params: ConvertParams & { output?: "data" },
    options?: RequestOptions,
  ): Promise<LabelData>;
  convert(
    params: ConvertParams,
    options?: RequestOptions,
  ): Promise<LabelData | HostedLabel>;
  async convert(
    params: ConvertParams,
    options: RequestOptions = {},
  ): Promise<LabelData | HostedLabel> {
    const response = await this.#requestWithRetries("/v1/convert", params, options);

    if (params.output === "url") {
      return parseHostedLabel(response.body);
    }
    return {
      data: response.body,
      contentType:
        response.headers.get("content-type") ?? "application/octet-stream",
      id: response.headers.get("x-conversion-id") ?? "",
    };
  }

  /** POST JSON and retry transient failures. */
  async #requestWithRetries(
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<RawResponse> {
    const maxRetries = normalizeMaxRetries(
      options.maxRetries ?? this.maxRetries,
      "maxRetries",
    );
    const timeoutMs = normalizeTimeoutMs(
      options.timeoutMs ?? this.timeoutMs,
      "timeoutMs",
    );
    const payload = JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      const retriesLeft = maxRetries - attempt;
      let error: APIError | APIConnectionError;
      let headerRetryAfterMs: number | undefined;

      try {
        const response = await this.#attempt(path, payload, timeoutMs, options.signal);
        if (response.ok) return response;
        error = APIError.from(response.status, parseErrorBody(response.body));
        headerRetryAfterMs = parseRetryAfterHeader(response.headers);
      } catch (err) {
        if (options.signal?.aborted) throw err; // caller cancelled — never retry
        if (err instanceof APIConnectionError) {
          error = err;
        } else {
          error = new APIConnectionError(
            `Request to ${this.baseUrl}${path} failed: ${errorMessage(err)}`,
            { cause: err },
          );
        }
      }

      if (retriesLeft <= 0 || !isRetryable(error)) throw error;
      await sleep(retryDelayMs(error, attempt, headerRetryAfterMs), options.signal);
    }
  }

  /** Run one buffered request under a timeout. */
  async #attempt(
    path: string,
    payload: string,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<RawResponse> {
    signal?.throwIfAborted();

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await this.#fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.#apiKey,
          "user-agent": `zpljet-node/${VERSION}`,
        },
        body: payload,
        signal: controller.signal,
        redirect: "error",
      });
      return {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        body: new Uint8Array(await response.arrayBuffer()),
      };
    } catch (err) {
      if (timedOut) {
        throw new APITimeoutError(
          `Request to ${this.baseUrl}${path} timed out after ${timeoutMs}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** Loopback hosts allowed over HTTP. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Reject insecure remote URLs unless allowed. */
function assertSecureBaseUrl(baseUrl: string, allowInsecureHttp: boolean): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ZplJetError(`Invalid baseUrl: ${baseUrl}`);
  }
  if (url.protocol === "https:") return;
  if (url.protocol === "http:") {
    if (allowInsecureHttp || LOOPBACK_HOSTS.has(url.hostname)) return;
    throw new ZplJetError(
      `Refusing to send your API key over plaintext http:// to ${url.host}. Use https, or pass { allowInsecureHttp: true } for local/testing.`,
    );
  }
  throw new ZplJetError(`Unsupported baseUrl protocol: ${url.protocol}`);
}

/** Parse an API error body. */
function parseErrorBody(body: Uint8Array): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      parsed.error &&
      typeof parsed.error === "object"
    ) {
      return parsed.error as Record<string, unknown>;
    }
  } catch {
    // Ignore invalid JSON.
  }
  return {};
}

/** Parse Retry-After as milliseconds. */
function parseRetryAfterHeader(headers: Headers): number | undefined {
  const value = headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Check whether a retry can succeed. */
function isRetryable(error: APIError | APIConnectionError): boolean {
  if (error instanceof APIConnectionError) return true;
  if (error.status === 429) return true;
  return error.status >= 500 && error.code !== "conversion_failed";
}

/** Choose server delay, header delay, or backoff. */
function retryDelayMs(
  error: APIError | APIConnectionError,
  attempt: number,
  headerRetryAfterMs?: number,
): number {
  if (error instanceof APIError && typeof error.raw.retryAfter === "number") {
    return Math.min(
      Math.max(0, error.raw.retryAfter * 1000),
      MAX_RETRY_DELAY_MS,
    );
  }
  if (headerRetryAfterMs !== undefined) {
    return Math.min(headerRetryAfterMs, MAX_RETRY_DELAY_MS);
  }
  const backoff = BASE_RETRY_DELAY_MS * 2 ** attempt;
  const jitter = backoff * 0.25 * Math.random();
  return Math.min(backoff + jitter, MAX_RETRY_DELAY_MS);
}

/** Abortable delay. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseJsonObject(body: Uint8Array): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new ZplJetError("Invalid JSON in successful API response");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ZplJetError("Invalid payload in successful API response");
  }
  return value as Record<string, unknown>;
}

function requireString(
  value: Record<string, unknown>,
  key: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new ZplJetError(`Invalid ${key} in successful API response`);
  }
  return field;
}

function parseHostedLabel(body: Uint8Array): HostedLabel {
  const value = parseJsonObject(body);
  const pages = value.pages;
  const retentionDays = value.retentionDays;
  if (typeof pages !== "number" || !Number.isInteger(pages) || pages < 1) {
    throw new ZplJetError("Invalid pages in successful API response");
  }
  if (
    typeof retentionDays !== "number" ||
    !Number.isInteger(retentionDays) ||
    retentionDays < 1
  ) {
    throw new ZplJetError("Invalid retentionDays in successful API response");
  }
  return {
    id: requireString(value, "id"),
    url: requireString(value, "url"),
    expiresAt: requireString(value, "expiresAt"),
    pages,
    retentionDays,
  };
}

function normalizeMaxRetries(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a finite integer >= 0`);
  }
  return Math.min(value, MAX_RETRIES_CAP);
}

function normalizeTimeoutMs(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new TypeError(`${name} must be > 0 and <= ${MAX_TIMEOUT_MS}`);
  }
  return value;
}
