# zpljet

Official TypeScript/JavaScript SDK for the [ZPLJet](https://zpljet.com) API — fast ZPL → PDF/PNG conversion.

[![npm version](https://img.shields.io/npm/v/zpljet.svg)](https://www.npmjs.com/package/zpljet)
[![CI](https://github.com/zpljet/zpljet-node/actions/workflows/ci.yml/badge.svg)](https://github.com/zpljet/zpljet-node/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/zpljet.svg)](./LICENSE)

- **Zero dependencies** — a single small client on top of the platform `fetch`
- **Fully typed** — request params, results, and every API error code
- **Reliable by default** — automatic retries with exponential backoff (honoring `Retry-After`), per-request timeouts, typed errors you can `instanceof`
- **Runs everywhere** — Node.js ≥ 22, Bun, Deno, and edge runtimes (Cloudflare Workers, Vercel Edge)

## Installation

```sh
npm install zpljet
# or: bun add zpljet / pnpm add zpljet / yarn add zpljet
```

## Quickstart

Create an API key in the [dashboard](https://zpljet.com/dashboard) (keys look like `zpl_…`), then:

```ts
import { writeFile } from "node:fs/promises";
import { ZplJet } from "zpljet";

const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY! });

const label = await zpljet.convert({
  zpl: "^XA^FO50,50^A0N,50,50^FDHello^FS^XZ",
});

// label.data is a Uint8Array of PDF bytes — nothing is stored server-side.
await writeFile("label.pdf", label.data);
```

> **Keep your API key server-side.** Never ship it to a browser — anyone with
> the key can spend your quota.

## Usage

### Convert to PDF or PNG

`convert()` accepts every parameter of [`POST /v1/convert`](https://zpljet.com/docs/api-reference):

```ts
const label = await zpljet.convert({
  zpl: "^XA^FO50,50^A0N,50,50^FDHello^FS^XZ",
  format: "png",   // "pdf" (default) | "png"
  dpmm: 12,        // 6 | 8 (default, 203 dpi) | 12 (300 dpi) | 24 (600 dpi)
  widthMm: 101.6,  // label width, default 4 in
  heightMm: 152.4, // label height, default 6 in
});

label.data;        // Uint8Array — the file bytes
label.contentType; // "application/pdf" | "image/png"
label.id;          // conversion id (shows up in your dashboard)
```

### Hosted URLs (paid plans)

Pass `output: "url"` to have ZPLJet host the file and return a public link
instead of the bytes. Files are retained for your account's retention window
(a dashboard setting, up to your plan's maximum).

```ts
const hosted = await zpljet.convert({
  zpl: "^XA^FO50,50^A0N,50,50^FDHello^FS^XZ",
  output: "url",
});

hosted.url;           // public URL to the PDF (works until the file is deleted)
hosted.pages;         // pages rendered (one per ^XA…^XZ block)
hosted.retentionDays; // how long the file is kept
hosted.expiresAt;     // when the file is deleted and the URL stops working (ISO 8601, UTC)
```

The return type narrows automatically: `output: "url"` gives you a
`HostedLabel`, everything else a `LabelData`.

### Error handling

Every API error code maps to a dedicated class, so you branch with
`instanceof` — no string matching:

```ts
import {
  ZplJet,
  BadRequestError,
  AuthenticationError,
  QuotaExceededError,
  RateLimitError,
  ConversionFailedError,
  APIConnectionError,
} from "zpljet";

try {
  const label = await zpljet.convert({ zpl });
} catch (err) {
  if (err instanceof BadRequestError) {
    console.error(`Invalid request (${err.param}): ${err.message}`);
  } else if (err instanceof QuotaExceededError) {
    console.error(`Quota used up (${err.used}/${err.quota}), resets ${err.resetsAt}`);
  } else if (err instanceof RateLimitError) {
    console.error(`Rate limited — retry after ${err.retryAfter}s`); // already auto-retried
  } else if (err instanceof ConversionFailedError) {
    console.error(`Engine rejected the ZPL (conversion ${err.conversionId})`);
  } else if (err instanceof APIConnectionError) {
    console.error(`Network problem: ${err.message}`); // already auto-retried
  } else {
    throw err;
  }
}
```

| Class | Status | `error.code` | Extra fields |
| --- | --- | --- | --- |
| `BadRequestError` | 400 | `invalid_request` | `param` |
| `AuthenticationError` | 401 | `missing_api_key` · `invalid_api_key` | — |
| `QuotaExceededError` | 402 | `quota_exceeded` | `plan`, `quota`, `used`, `resetsAt` |
| `PermissionDeniedError` | 403 | `hosting_not_allowed` · `no_retention_enforced` | — |
| `PayloadTooLargeError` | 413 | `payload_too_large` | — |
| `RateLimitError` | 429 | `rate_limit_exceeded` | `retryAfter`, `retryAt` |
| `ConversionFailedError` | 502 | `conversion_failed` | `conversionId` |
| `ServiceUnavailableError` | 503 | `service_unavailable` | `retryAfter` |
| `APIError` | any | anything else | `status`, `code`, `raw` |
| `APITimeoutError` | — | (an attempt timed out) | — |
| `APIConnectionError` | — | (request never got a response) | — |

All of these extend `ZplJetError`, and every HTTP error carries `status`,
`code`, `docUrl`, and the raw error payload in `raw`. Full code reference:
[zpljet.com/docs/errors](https://zpljet.com/docs/errors).

### Retries

Rate limits (429), transient server errors (5xx), timeouts, and network
failures are retried automatically — up to 2 times by default, with
exponential backoff, honoring the server's `Retry-After`. A 503
`service_unavailable` means the render engine is temporarily unavailable; the
request was not charged against quota. A 502
`conversion_failed` is **not** retried: it means the engine rejected the ZPL
itself, so a retry would fail identically.

```ts
// Client-wide
const zpljet = new ZplJet({ apiKey, maxRetries: 5 });

// Or per request
await zpljet.convert({ zpl }, { maxRetries: 0 }); // fail fast
```

### Timeouts & cancellation

Each attempt has a 60-second timeout by default:

```ts
const zpljet = new ZplJet({ apiKey, timeoutMs: 10_000 });

// Per request, and/or with your own AbortSignal:
const controller = new AbortController();
await zpljet.convert({ zpl }, { timeoutMs: 5_000, signal: controller.signal });
```

A timed-out attempt throws `APITimeoutError` (after retries); your own abort
rejects with the signal's reason and is never retried.

### Configuration

```ts
const zpljet = new ZplJet({
  apiKey: "zpl_…",                    // required
  baseUrl: "https://api.zpljet.com",  // default
  timeoutMs: 60_000,                  // per-attempt timeout
  maxRetries: 2,                      // automatic retries
  fetch: myFetch,                     // custom fetch (proxies, tests)
});
```

## Examples

Runnable scripts live in [`examples/`](./examples):

```sh
ZPLJET_API_KEY=zpl_… npx tsx examples/01-convert-to-pdf.ts
```

## Requirements

Node.js ≥ 22 (global `fetch`), or any runtime with a WHATWG-compatible
`fetch` — Bun, Deno, Cloudflare Workers, Vercel Edge. TypeScript ≥ 5 for the
bundled types (plain JavaScript works too, ESM and CommonJS).

## Contributing & development

```sh
npm install
npm run typecheck   # tsc --noEmit
npm test            # unit tests (no network)
npm run build       # dist/ via tsdown (ESM + CJS + declarations)

# End-to-end tests against the live API (uses your quota):
ZPLJET_API_KEY=zpl_… npm run test:e2e
```

## License

[MIT](./LICENSE)
