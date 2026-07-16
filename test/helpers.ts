import { vi } from "vitest";

export const ZPL = "^XA^FO50,50^A0N,50,50^FDHello^FS^XZ";

/** A structured API error response, exactly as the server builds them. */
export function errorResponse(
  status: number,
  code: string,
  message = `${code} message`,
  context: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        ...context,
        docUrl: `https://zpljet.com/docs/errors#${code}`,
      },
    }),
    { status, headers: { "content-type": "application/json", ...headers } },
  );
}

/** A successful `output: "data"` response carrying PDF bytes. */
export function pdfResponse(id = "conv_123", bytes = new Uint8Array([37, 80, 68, 70])) {
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "application/pdf", "x-conversion-id": id },
  });
}

/** A successful `output: "url"` JSON response. */
export function hostedResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: "conv_456",
      url: "https://files.example/conv_456.pdf",
      pages: 1,
      retentionDays: 3,
      expiresAt: "2026-07-09T00:00:00.000Z",
      ...overrides,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/**
 * A fetch mock that serves the given responses in order (repeating the last
 * one). Thrown-in `Error` values are rejected instead of resolved (network
 * failures).
 */
export function fetchQueue(...results: [Response | Error, ...(Response | Error)[]]) {
  let call = 0;
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const result = results[Math.min(call++, results.length - 1)]!;
    if (result instanceof Error) throw result;
    return result.clone();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
