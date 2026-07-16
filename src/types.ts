/** Public POST /v1/convert types. */

/** Print density in dots per millimeter. 8 = 203 dpi, 12 = 300 dpi, 24 = 600 dpi. */
export type Dpmm = 6 | 8 | 12 | 24;

/** Output file format. */
export type LabelFormat = "pdf" | "png";

/**
 * Delivery mode.
 *
 * - `"data"`: return bytes; store nothing.
 * - `"url"`: return a public, temporary URL on paid plans.
 */
export type OutputMode = "data" | "url";

/** Request body for `POST /v1/convert`. */
export interface ConvertParams {
  /**
   * Raw ZPL. Max 512 KB; graphics max 256 KB decoded.
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
  /** Abort the request. */
  signal?: AbortSignal;
  /** Per-attempt timeout in milliseconds. Overrides the client default. */
  timeoutMs?: number;
  /** Max automatic retries for this request. Overrides the client default. */
  maxRetries?: number;
}

/** Options for constructing a {@link ZplJet} client. */
export interface ClientOptions {
  /** Server-side API key from https://zpljet.com/dashboard. */
  apiKey: string;
  /** API origin. Defaults to `https://api.zpljet.com`. */
  baseUrl?: string;
  /** Allow HTTP outside loopback hosts. Defaults to `false`. */
  allowInsecureHttp?: boolean;
  /** Per-attempt timeout in milliseconds. Defaults to `60_000`. */
  timeoutMs?: number;
  /** Max retries for transient failures. Defaults to `2`. */
  maxRetries?: number;
  /** Custom fetch. Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
}
