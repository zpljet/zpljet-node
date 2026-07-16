/**
 * Public types for the ZPLJet API.
 *
 * These mirror the `POST /v1/convert` contract exactly — see
 * https://zpljet.com/docs/api-reference for the canonical reference.
 */

/** Print density in dots per millimeter. 8 = 203 dpi, 12 = 300 dpi, 24 = 600 dpi. */
export type Dpmm = 6 | 8 | 12 | 24;

/** Output file format. */
export type LabelFormat = "pdf" | "png";

/**
 * Delivery mode.
 *
 * - `"data"` (default) — the API returns the raw file bytes and stores
 *   nothing. Private by default, available on every plan.
 * - `"url"` — returns a public bearer URL (paid plans). Anyone with it can
 *   fetch the file until retention cleanup.
 */
export type OutputMode = "data" | "url";

/** Request body for `POST /v1/convert`. */
export interface ConvertParams {
  /**
   * Raw ZPL — one or more `^XA…^XZ` label blocks. Must start with `^XA` (or a
   * `~DG`) and end with `^XZ`. Graphics must use uncompressed ASCII
   * `^GF`/`~DG` data, up to 256 KB decoded. Max 512 KB total.
   */
  zpl: string;
  /** Print density in dots/mm. Defaults to `8` (203 dpi). */
  dpmm?: Dpmm;
  /** Physical label width in millimeters. Defaults to `101.6` (4 in). */
  widthMm?: number;
  /** Physical label height in millimeters. Defaults to `152.4` (6 in). */
  heightMm?: number;
  /** Output format. Defaults to `"pdf"`. */
  format?: LabelFormat;
  /** Delivery mode. Defaults to `"data"`. */
  output?: OutputMode;
}

/** Result of a conversion with `output: "data"` (the default). */
export interface LabelData {
  /** The rendered file bytes (PDF or PNG). */
  data: Uint8Array;
  /** `"application/pdf"` or `"image/png"`. */
  contentType: string;
  /** Conversion id (from the `X-Conversion-Id` response header). */
  id: string;
}

/** Result of a conversion with `output: "url"` (hosted, paid plans). */
export interface HostedLabel {
  /** Conversion id. */
  id: string;
  /** Public URL to the hosted file. Works until the file is deleted at `expiresAt`. */
  url: string;
  /** Number of pages rendered (one per `^XA…^XZ` block). */
  pages: number;
  /** How many days the file is retained. */
  retentionDays: number;
  /** ISO 8601 UTC timestamp — when the hosted file is deleted and its URL stops working. */
  expiresAt: string;
}

/** Per-request options, overriding the client-level defaults. */
export interface RequestOptions {
  /**
   * Abort the request early. Combined with the timeout — whichever fires
   * first wins.
   */
  signal?: AbortSignal;
  /** Per-attempt timeout in milliseconds. Overrides the client default. */
  timeoutMs?: number;
  /** Max automatic retries for this request. Overrides the client default. */
  maxRetries?: number;
}

/** Options for constructing a {@link ZplJet} client. */
export interface ClientOptions {
  /**
   * Your ZPLJet API key (`zpl_…`), created in the dashboard at
   * https://zpljet.com/dashboard. Keep it server-side — never ship it to a
   * browser.
   */
  apiKey: string;
  /** API origin. Defaults to `https://api.zpljet.com`. */
  baseUrl?: string;
  /**
   * Allow a plaintext `http://` base URL to a non-loopback host. Off by default
   * so your API key is never sent over an unencrypted connection by mistake.
   * Loopback hosts (localhost/127.0.0.1/::1) are always allowed over http.
   */
  allowInsecureHttp?: boolean;
  /** Per-attempt timeout in milliseconds. Defaults to `60_000`. */
  timeoutMs?: number;
  /**
   * How many times a failed request is automatically retried (rate limits,
   * transient 5xx, network errors). Defaults to `2`. Set `0` to disable.
   */
  maxRetries?: number;
  /**
   * Custom `fetch` implementation — useful for proxies, instrumentation, and
   * tests. Defaults to the global `fetch`.
   */
  fetch?: typeof globalThis.fetch;
}
